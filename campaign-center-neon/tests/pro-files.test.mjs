import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import express from 'express';
import pg from 'pg';
import proFilesRouter from '../server/pro-files.js';
import {makePlanPolicy} from '../server/plan-policy.js';

const url=process.env.TEST_DATABASE_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname))
 throw Error('Askan Pro documents CI only on disposable localhost PostgreSQL');
const pool=new pg.Pool({connectionString:url,max:5});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const log=(db,o,c,u,type,id,details)=>db.query(
 'INSERT INTO cc_activity_events(organization_id,campaign_id,actor_subject,event_type,target_id,details) VALUES($1,$2,$3,$4,$5,$6)',
 [o,c,u,type,id,JSON.stringify(details||{})]);
async function campaignAccess(db,id,user){
 const res=await db.query("SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m ON m.organization_id=c.organization_id AND m.subject=$2 AND m.membership_status='active' WHERE c.id=$1",[id,user]);
 const c=res.rows[0];if(!c)throw bad(404,'Campaign not found');
 if(!['owner','manager','finance','auditor'].includes(c.role)){
  const joined=await db.query('SELECT 1 FROM cc_campaign_members WHERE campaign_id=$1 AND subject=$2',[c.id,user]);
  if(!joined.rowCount)throw bad(404,'Campaign not found');
 }
 return c;
}
test('Pro documents: actual binary download, tenant isolation, author-private/team ACL, plan gate and audit',async()=>{
 for(const file of ['001_core.sql','002_team_connect.sql','026_server_plan_entitlements.sql','029_pro_campaign_files.sql'])
  await pool.query(await readFile(join(import.meta.dirname,'../db',file),'utf8'));
 const token='files-ci-'+Date.now();
 const owner=token+'owner',a=token+'a',b=token+'b',teammate=token+'mate',outsider=token+'outside',auditor=token+'audit';
 const org=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Pro Files',$1) RETURNING id",[owner])).rows[0].id;
 const foreignOrg=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Other Pro',$1) RETURNING id",[outsider])).rows[0].id;
 for(const [o,user,role] of [[org,owner,'owner'],[org,a,'askan'],[org,b,'askan'],[org,teammate,'squad_leader'],[org,auditor,'auditor'],[foreignOrg,outsider,'owner']])
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at) VALUES($1,$2,$3,'active',now())",[o,user,role]);
 const camp=(await pool.query("INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Pro File Campaign','active') RETURNING id",[org])).rows[0].id;
 for(const [user,team] of [[a,'A'],[b,'B'],[teammate,'A']])
  await pool.query('INSERT INTO cc_campaign_members(organization_id,campaign_id,subject,team_name) VALUES($1,$2,$3,$4)',[org,camp,user,team]);
 const app=express();app.use(express.json({limit:'1.6mb'}));
 const policy=makePlanPolicy({pool,bad});
 app.use('/api/pro',(req,_res,next)=>{req.userId=req.get('x-person')||'anonymous';next();},policy.scoped('askan_pro'));
 app.use('/api/pro',proFilesRouter({pool,campaignAccess,bad,log}));
 app.use((err,_req,res,_next)=>res.status(err.status||500).json({error:err.message}));
 const server=await new Promise(done=>{const srv=app.listen(0,'127.0.0.1',()=>done(srv));});
 const root='http://127.0.0.1:'+server.address().port+'/api/pro/campaigns/'+camp+'/files';
 async function req(user,method='GET',path='',data){
  const response=await fetch(root+path,{method,headers:{'x-person':user,...(data?{'content-type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
  const type=response.headers.get('content-type')||'';
  return {status:response.status,headers:response.headers,body:type.startsWith('text/plain')?Buffer.from(await response.arrayBuffer()):await response.json()};
 }
 const contents=Buffer.from('Private Pro document\n');
 const add=(user,visibility='private',name='notes.txt',mime='text/plain',b=contents)=>
  req(user,'POST','',{name,mime,visibility,contentBase64:b.toString('base64')});
 try{
  assert.equal((await add(a)).status,403,'Quick tier must not upload');
  await pool.query("INSERT INTO cc_plan_entitlements(organization_id,plan_code,provision_reference,provisioned_by) VALUES($1,'askan_pro','approved-pro-CI-fixture','ci-operator')",[org]);
  assert.equal((await add(outsider)).status,404);
  assert.equal((await add(a,'private','script.html','text/html',Buffer.from('<script>'))).status,400);
  assert.equal((await add(a,'private','broken.png','image/png',Buffer.from('<svg></svg>'))).status,400);
  assert.equal((await add(a,'private','unsafe.txt','text/plain',Buffer.from([0,1,2]))).status,400);
  assert.equal((await add(auditor)).status,403);
  const own=await add(a);assert.equal(own.status,201);
  const id=own.body.file.id;
  assert.equal((await req(owner)).body.files.length,0,'Owner cannot see author private');
  assert.equal((await req(b)).body.files.length,0);
  assert.equal((await req(owner,'GET','/'+id+'/download')).status,404);
  const file=await req(a,'GET','/'+id+'/download');
  assert.equal(file.status,200);
  assert.ok(file.body.equals(contents));
  assert.match(file.headers.get('content-disposition'),/^attachment;/);
  assert.equal(file.headers.get('content-security-policy'),'sandbox');
  const team=await add(a,'team');assert.equal(team.status,201);
  assert.equal((await req(teammate)).body.files.length,1);
  assert.equal((await req(owner)).body.files.length,1);
  assert.equal((await req(b)).body.files.length,0);
  const shared=await add(b,'campaign');assert.equal(shared.status,201);
  assert.equal((await req(a)).body.files.length,3);
  assert.equal((await req(b)).body.files.length,1);
  assert.equal((await req(teammate)).body.files.length,2);
  assert.equal((await req(b,'GET','/'+team.body.file.id+'/download')).status,404);
  const activity=await pool.query("SELECT details FROM cc_activity_events WHERE campaign_id=$1 AND event_type='pro.file_uploaded'",[camp]);
  assert.equal(activity.rowCount,3);
  assert.doesNotMatch(JSON.stringify(activity.rows),/Private Pro document/);
  await assert.rejects(pool.query('DELETE FROM cc_pro_campaign_files WHERE id=$1',[id]),/append-only/);
  await pool.query("UPDATE cc_memberships SET membership_status='revoked' WHERE organization_id=$1 AND subject=$2",[org,a]);
  assert.equal((await req(a,'GET','/'+id+'/download')).status,404);
  await pool.query("UPDATE cc_plan_entitlements SET status='suspended' WHERE organization_id=$1",[org]);
  assert.equal((await req(owner)).status,403);
  assert.equal((await pool.query('SELECT COUNT(*)::int n FROM cc_pro_campaign_files WHERE campaign_id=$1',[camp])).rows[0].n,3);
 }finally{await new Promise(done=>server.close(done));await pool.end();}
});
