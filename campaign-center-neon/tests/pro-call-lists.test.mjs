import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import pg from 'pg';
import express from 'express';
import proCallListsRouter from '../server/pro-call-lists.js';
import {makePlanPolicy} from '../server/plan-policy.js';
const conn=process.env.TEST_DATABASE_URL;
if(!conn||!['localhost','127.0.0.1'].includes(new URL(conn).hostname))
 throw Error('Pro call list CI requires disposable local Postgres');
const pool=new pg.Pool({connectionString:conn,max:4});
const bad=(status,message)=>Object.assign(new Error(message),{status});
async function campaignAccess(db,id,user){
 const result=await db.query(
  "SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m ON m.organization_id=c.organization_id"+
  " AND m.subject=$2 AND m.membership_status='active' WHERE c.id=$1",[id,user]);
 const c=result.rows[0];if(!c)throw bad(404,'Campaign unavailable');
 if(!['owner','manager','finance','auditor'].includes(c.role)){
  const m=await db.query('SELECT 1 FROM cc_campaign_members WHERE campaign_id=$1 AND subject=$2',[id,user]);
  if(!m.rowCount)throw bad(404,'Campaign unavailable');
 }
 return c;
}
test('Askan Pro manual call lists are scoped, DNC-safe and do not dial or reveal other teams',async()=>{
 for(const name of ['001_core.sql','002_team_connect.sql','017_askan_pro_crm.sql','026_server_plan_entitlements.sql'])
  await pool.query(await readFile(join(import.meta.dirname,'../db',name),'utf8'));
 const tag='list-ci-'+Date.now(),boss=tag+'boss',alpha=tag+'alpha',beta=tag+'beta',foreign=tag+'outside';
 const org=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Lists',$1) RETURNING id",[boss])).rows[0].id;
 const other=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Other lists',$1) RETURNING id",[foreign])).rows[0].id;
 for(const [oid,who,role] of [[org,boss,'owner'],[org,alpha,'askan'],[org,beta,'askan'],[other,foreign,'owner']])
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at) VALUES($1,$2,$3,'active',now())",[oid,who,role]);
 const campaign=(await pool.query("INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Manual Calls','active') RETURNING id",[org])).rows[0].id;
 for(const [who,team] of [[alpha,'A'],[beta,'B']])
  await pool.query('INSERT INTO cc_campaign_members(organization_id,campaign_id,subject,team_name) VALUES($1,$2,$3,$4)',[org,campaign,who,team]);
 const due=new Date(Date.now()-86400000).toISOString(),later=new Date(Date.now()+86400000).toISOString();
 let phoneOrdinal=1000;
 async function contact(by,name,{privacy='campaign',team='A',phone='12125550000',dnc=false,stage='followup',priority='high',time=due,claimed=null}={}){
  const safeNumber=phone==='12125550000'?'1212555'+String(phoneOrdinal++).padStart(4,'0'):phone;
  const id=(await pool.query(
   "INSERT INTO cc_contacts(organization_id,campaign_id,created_by,display_name,phone,privacy,assigned_team,do_not_call)"+
   " VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
   [org,campaign,by,name,safeNumber,privacy,team,dnc])).rows[0].id;
  await pool.query(
   "INSERT INTO cc_pro_contact_profiles(organization_id,campaign_id,contact_id,stage,priority,next_followup_at,last_updated_by)"+
   " VALUES($1,$2,$3,$4,$5,$6,$7)",[org,campaign,id,stage,priority,time,by]);
  if(claimed)await pool.query(
   "UPDATE cc_contacts SET claimed_by=$1,claim_expires_at=now()+interval '1 hour' WHERE id=$2",[claimed,id]);
  return id;
 }
 const shared=await contact(alpha,'ALPHA SHARED DUE');
 const privateA=await contact(alpha,'ALPHA PRIVATE DUE',{privacy:'private'});
 await contact(beta,'BETA SHARED DUE',{team:'B'});
 await contact(beta,'BETA PRIVATE SECRET',{privacy:'private',team:'B'});
 await contact(alpha,'BLOCKED DNC',{dnc:true});
 await contact(alpha,'NOT CALLED NO PHONE',{phone:''});
 await contact(alpha,'CLOSED CONTACT',{stage:'closed'});
 await contact(alpha,'FUTURE CONTACT',{time:later});
 await contact(alpha,'TAKEN BY BETA',{claimed:beta});
 const app=express(),plan=makePlanPolicy({pool,bad});
 app.use('/api/pro',(req,_res,next)=>{req.userId=req.get('x-qa-user')||'anonymous';next();},
  plan.scoped('askan_pro'));
 app.use('/api/pro',proCallListsRouter({pool,campaignAccess,bad}));
 app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}));
 const srv=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 async function list(user,query='?mode=due'){
  const r=await fetch('http://127.0.0.1:'+srv.address().port+'/api/pro/campaigns/'+campaign+'/call-list'+query,{
   headers:{'x-qa-user':user}});
  return {status:r.status,data:await r.json()};
 }
 try{
  assert.equal((await list(alpha)).status,403);
  await pool.query("INSERT INTO cc_plan_entitlements(organization_id,plan_code,provision_reference,provisioned_by)"+
   " VALUES($1,'askan_pro','verified-list-qa','ci-operator')",[org]);
  assert.equal((await list(foreign)).status,404);
  assert.equal((await list(alpha,'?mode=bogus')).status,400);
  assert.equal((await list(alpha,'?mode=due&limit=501')).status,400);
  const only=await list(alpha);
  assert.equal(only.status,200);
  assert.equal(only.data.excludesDoNotCall,true);
  assert.equal(only.data.outboundCallsPlaced,0);
  assert.equal(only.data.providerVerified,false);
  const names=only.data.contacts.map(c=>c.display_name);
  assert.ok(names.includes('ALPHA SHARED DUE')&&names.includes('ALPHA PRIVATE DUE'));
  assert.ok(!names.some(x=>/BETA|BLOCKED|PHONE|CLOSED|FUTURE|TAKEN/.test(x)));
  assert.equal(only.data.totalMatching,2);
  const bossView=await list(boss);
  assert.ok(bossView.data.contacts.some(x=>x.display_name==='ALPHA SHARED DUE'));
  assert.ok(bossView.data.contacts.some(x=>x.display_name==='BETA SHARED DUE'));
  assert.ok(!bossView.data.contacts.some(x=>x.display_name.includes('PRIVATE')));
  const b=await list(beta);
  assert.ok(b.data.contacts.some(x=>x.display_name==='BETA SHARED DUE'));
  assert.ok(!b.data.contacts.some(x=>x.display_name.includes('ALPHA')));
  const high=await list(alpha,'?mode=high&limit=1');
  assert.equal(high.status,200);assert.equal(high.data.shown,1);
  assert.equal(high.data.totalMatching,3,'High filter includes future when not yet due');
  const today=await list(alpha,'?mode=all&limit=50');
  assert.ok(today.data.contacts.some(x=>x.display_name==='FUTURE CONTACT'));
  await pool.query("UPDATE cc_contacts SET do_not_call=true WHERE id=$1",[shared]);
  const no=await list(alpha);assert.equal(no.data.totalMatching,1);
  await pool.query("UPDATE cc_memberships SET membership_status='revoked' WHERE organization_id=$1 AND subject=$2",[org,alpha]);
  assert.equal((await list(alpha)).status,404);
  await pool.query("UPDATE cc_plan_entitlements SET status='suspended' WHERE organization_id=$1",[org]);
  assert.equal((await list(boss)).status,403);
 }finally{await new Promise(done=>srv.close(done));await pool.end();}
});
