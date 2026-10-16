import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import express from 'express';
import pg from 'pg';
import proBlockersRouter from '../server/pro-blockers.js';
const url=process.env.TEST_DATABASE_URL;
if(!url||!['127.0.0.1','localhost'].includes(new URL(url).hostname))
 throw Error('Blocker tests refuse remote/production Postgres');
const pool=new pg.Pool({connectionString:url,max:4});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const trim=(x,n)=>typeof x==='string'?x.trim().slice(0,n):'';
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(x);
const log=(db,org,camp,actor,type,id,details)=>
 db.query('INSERT INTO cc_activity_events(organization_id,campaign_id,actor_subject,event_type,target_id,details) VALUES($1,$2,$3,$4,$5,$6)',
 [org,camp,actor,type,id,JSON.stringify(details||{})]);
async function campaignAccess(db,cid,subject){
 if(!uuid(cid))throw bad(400,'Invalid campaign');
 const r=await db.query("SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m ON m.organization_id=c.organization_id AND m.subject=$2 AND m.membership_status='active' WHERE c.id=$1",[cid,subject]);
 if(!r.rowCount)throw bad(404,'No campaign');
 const c=r.rows[0];
 if(!['owner','manager','finance','auditor'].includes(c.role)){
  const member=await db.query('SELECT 1 FROM cc_campaign_members WHERE campaign_id=$1 AND subject=$2',[cid,subject]);
  if(!member.rowCount)throw bad(404,'No campaign');
 }
 return c;
}
test('Askan Pro blocker intelligence is factual, tenant/team private, audited and immutable',async()=>{
 for(const path of ['001_core.sql','002_team_connect.sql','020_askan_pro_task_blockers.sql'])
  await pool.query(await readFile(join(import.meta.dirname,'../db',path),'utf8'));
 const tag='blocker-ci-'+Date.now(),owner=tag+'owner',a=tag+'a',b=tag+'b',lead=tag+'lead',outside=tag+'outside';
 const org=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Blocker QA',$1) RETURNING id",[owner])).rows[0].id;
 const foreign=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Other',$1) RETURNING id",[outside])).rows[0].id;
 for(const [o,user,role] of [[org,owner,'owner'],[org,a,'askan'],[org,b,'askan'],[org,lead,'squad_leader'],[foreign,outside,'owner']])
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at) VALUES($1,$2,$3,'active',now())",[o,user,role]);
 const campaign=(await pool.query("INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Blocker run','active') RETURNING id",[org])).rows[0].id;
 for(const [user,team] of [[owner,''],[a,'A'],[b,'B'],[lead,'A']])
  await pool.query('INSERT INTO cc_campaign_members(organization_id,campaign_id,subject,team_name) VALUES($1,$2,$3,$4)',[org,campaign,user,team]);
 async function task(user,title){
  return (await pool.query("INSERT INTO cc_assignments(organization_id,campaign_id,assignee_subject,title) VALUES($1,$2,$3,$4) RETURNING id",
  [org,campaign,user,title])).rows[0].id;
 }
 const ta=await task(a,'Private team A task'),tb=await task(b,'Private team B task');
 const app=express();app.use(express.json());
 app.use('/api/pro',(req,_res,next)=>{req.userId=req.get('x-user')||'unknown';next();});
 app.use('/api/pro',proBlockersRouter({pool,campaignAccess,bad,trim,uuid,log}));
 app.use((err,_req,res,_next)=>res.status(err.status||500).json({error:err.message}));
 const server=await new Promise(done=>{const s=app.listen(0,'127.0.0.1',()=>done(s));});
 async function req(user,method,path,body){
  const res=await fetch('http://127.0.0.1:'+server.address().port+'/api/pro'+path,{
   method,headers:{'x-user':user,...(body?{'content-type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {status:res.status,data:await res.json()};
 }
 const view=user=>req(user,'GET','/campaigns/'+campaign+'/blockers');
 const update=(user,id,body)=>req(user,'PUT','/tasks/'+id+'/blocker',body);
 try{
  assert.equal((await view(outside)).status,404);
  assert.equal((await update(outside,ta,{active:true,reason:'no_response'})).status,404);
  assert.equal((await update(b,ta,{active:true,reason:'no_response'})).status,404);
  assert.equal((await update(lead,tb,{active:true,reason:'no_response'})).status,404);
  assert.equal((await update(lead,ta,{active:true,reason:'no_response'})).status,403);
  assert.equal((await update(a,ta,{active:true,reason:'fake'})).status,400);
  const saved=await update(a,ta,{active:true,reason:'missing_information',details:'Confidential missing donor detail'});
  assert.equal(saved.status,200);assert.equal(saved.data.change,'raised');
  assert.equal((await view(a)).data.activeByReason.missing_information,1);
  assert.equal((await view(b)).data.blockers.length,0);
  assert.equal((await view(lead)).data.blockers.length,1);
  assert.equal((await view(owner)).data.blockers.length,1);
  assert.equal((await update(a,ta,{active:true,reason:'missing_information',details:'Confidential missing donor detail'})).data.unchanged,true);
  assert.equal((await update(owner,tb,{active:true,reason:'approval_needed',details:''})).status,200);
  assert.equal((await view(a)).data.blockers.length,1);
  assert.equal((await view(owner)).data.blockers.length,2);
  const resolved=await update(a,ta,{active:false});
  assert.equal(resolved.status,200);assert.equal(resolved.data.change,'resolved');
  assert.equal((await view(a)).data.activeByReason.missing_information,undefined);
  const history=await pool.query("SELECT id,action FROM cc_pro_blocker_history WHERE task_id=$1 ORDER BY created_at",[ta]);
  assert.deepEqual(history.rows.map(x=>x.action),['raised','resolved']);
  await assert.rejects(pool.query('DELETE FROM cc_pro_blocker_history WHERE id=$1',[history.rows[0].id]),/append-only/);
  const logs=await pool.query("SELECT details FROM cc_activity_events WHERE event_type='pro.task.blocker' AND target_id=$1",[ta]);
  assert.ok(!JSON.stringify(logs.rows).includes('Confidential missing donor detail'),'No private text in shared audit');
  await pool.query("UPDATE cc_memberships SET membership_status='revoked' WHERE organization_id=$1 AND subject=$2",[org,a]);
  assert.equal((await view(a)).status,404);
 }finally{await new Promise(done=>server.close(done));await pool.end();}
});
