import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import pg from 'pg';
import express from 'express';
import {makePlanPolicy} from '../server/plan-policy.js';
import nextActionRouter from '../server/pro-next-actions.js';

const url=process.env.TEST_DATABASE_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname))
 throw Error('Next Action CI runs ONLY on local disposable PostgreSQL');
const pool=new pg.Pool({connectionString:url,max:5});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const log=(db,o,c,subject,type,id,details)=>db.query(
 'INSERT INTO cc_activity_events(organization_id,campaign_id,actor_subject,event_type,target_id,details)'+
 ' VALUES($1,$2,$3,$4,$5,$6)',[o,c,subject,type,id,JSON.stringify(details||{})]);
async function campaignAccess(db,id,person){
 const r=await db.query(
  "SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m ON c.organization_id=m.organization_id"+
  " AND m.subject=$2 AND m.membership_status='active' WHERE c.id=$1",[id,person]);
 if(!r.rowCount)throw bad(404,'Campaign missing');
 const c=r.rows[0];
 if(!['owner','manager','finance','auditor'].includes(c.role)){
  const m=await db.query('SELECT 1 FROM cc_campaign_members WHERE campaign_id=$1 AND subject=$2',[id,person]);
  if(!m.rowCount)throw bad(404,'Campaign missing');
 }
 return c;
}
test('Askan Pro next recommendation: human accept/later/skip decisions and immutable personal progress',async()=>{
 for(const name of ['001_core.sql','002_team_connect.sql','017_askan_pro_crm.sql',
  '026_server_plan_entitlements.sql','031_pro_next_action_workflow.sql']){
  await pool.query(await readFile(join(import.meta.dirname,'../db',name),'utf8'));
 }
 const tag='next-ci-'+Date.now(),owner=tag+'owner',a=tag+'a',b=tag+'b',outsider=tag+'outsider';
 async function org(name,user){
  return (await pool.query('INSERT INTO cc_organizations(name,owner_subject) VALUES($1,$2) RETURNING id',[name,user])).rows[0].id;
 }
 const o=await org('Next steps QA',owner),foreign=await org('Other QA',outsider);
 for(const [oid,u,role] of [[o,owner,'owner'],[o,a,'askan'],[o,b,'askan'],[foreign,outsider,'owner']]){
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at)"+
   " VALUES($1,$2,$3,'active',now())",[oid,u,role]);
 }
 const camp=(await pool.query("INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Pro test','active') RETURNING id",[o])).rows[0].id;
 for(const [u,team] of [[owner,''],[a,'A'],[b,'B']])
  await pool.query('INSERT INTO cc_campaign_members(organization_id,campaign_id,subject,team_name) VALUES($1,$2,$3,$4)',[o,camp,u,team]);
 const task=async(who,title)=> (await pool.query(
  "INSERT INTO cc_assignments(organization_id,campaign_id,assignee_subject,title,priority,due_at)"+
  " VALUES($1,$2,$3,$4,'high',now()-interval '1 day') RETURNING id",[o,camp,who,title])).rows[0].id;
 const aTask=await task(a,'ALPHA TASK PRIVATE'),bTask=await task(b,'BETA TASK PRIVATE');
 async function contact(who,name,phone,{privacy='campaign',team='A',dnc=false,stage='followup',claimed=null}={}){
  const c=(await pool.query(
   'INSERT INTO cc_contacts(organization_id,campaign_id,created_by,display_name,phone,privacy,assigned_team,do_not_call)'+
   ' VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
   [o,camp,who,name,phone,privacy,team,dnc])).rows[0].id;
  await pool.query(
   "INSERT INTO cc_pro_contact_profiles(organization_id,campaign_id,contact_id,stage,priority,next_followup_at,last_updated_by)"+
   " VALUES($1,$2,$3,$4,'high',now()-interval '1 day',$5)",[o,camp,c,stage,who]);
  if(claimed)await pool.query(
   "UPDATE cc_contacts SET claimed_by=$1,claim_expires_at=now()+interval '3 hours' WHERE id=$2",[claimed,c]);
  return c;
 }
 const source=await contact(a,'ALPHA SHARED','12125550001');
 const privateB=await contact(b,'B PRIVATE NAME','12125550002',{privacy:'private',team:'B'});
 const dnc=await contact(a,'DO NOT CALL','12125550003',{dnc:true});
 const claimed=await contact(a,'CLAIMED BY B','12125550004',{claimed:b});
 const empty=await contact(a,'EMPTY TEAM','12125550005',{team:''});
 const app=express();app.use(express.json());
 const policy=makePlanPolicy({pool,bad});
 app.use('/api/pro',(req,_res,next)=>{req.userId=req.get('x-person')||'unknown';next();},policy.scoped('askan_pro'));
 app.use('/api/pro',nextActionRouter({pool,campaignAccess,bad,log}));
 app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}));
 const server=await new Promise(resolve=>{const x=app.listen(0,'127.0.0.1',()=>resolve(x));});
 async function call(who,method='GET',path='/campaigns/'+camp+'/next-actions',body){
  const resp=await fetch('http://127.0.0.1:'+server.address().port+'/api/pro'+path,{
   method,headers:{'x-person':who,...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {status:resp.status,data:await resp.json()};
 }
 const choose=(who,kind,id,decision,note='')=>call(who,'PUT',
  '/campaigns/'+camp+'/next-actions/'+kind+'/'+id,{decision,note});
 try{
  assert.equal((await call(a)).status,403,'Starter tier has no access to Pro Next Action');
  await pool.query("INSERT INTO cc_plan_entitlements(organization_id,plan_code,provision_reference,provisioned_by)"+
   " VALUES($1,'askan_pro','ci-verified-pro-next','operator-ci')",[o]);
  assert.equal((await call(outsider)).status,404);
  assert.equal((await choose(b,'task',aTask,'accepted')).status,404,'Cannot accept other assignee task');
  assert.equal((await choose(a,'crm_followup',privateB,'accepted')).status,404);
  assert.equal((await choose(a,'crm_followup',dnc,'accepted')).status,404);
  assert.equal((await choose(a,'crm_followup',claimed,'accepted')).status,404);
  assert.equal((await choose(b,'crm_followup',empty,'accepted')).status,404);
  assert.equal((await choose(a,'task',aTask,'missing')).status,404,'Unknown route source is rejected at central paid-tier gate');
  assert.equal((await choose(a,'task',aTask,'accepted','X'.repeat(301))).status,400);
  let r=await choose(a,'task',aTask,'accepted','I will work on it now');assert.equal(r.status,200);
  assert.equal(r.data.unchanged,false);
  assert.equal(r.data.taskStatusUnchanged,true);
  assert.equal((await choose(a,'task',aTask,'accepted','I will work on it now')).data.unchanged,true);
  assert.equal((await choose(a,'task',aTask,'deferred','Tomorrow')).status,200);
  assert.equal((await choose(a,'crm_followup',source,'accepted')).status,200);
  const my=await call(a);assert.equal(my.status,200);
  assert.equal(my.data.choices.length,2);
  assert.equal(my.data.history.length,3,'No duplicate immutable entries on exact retry');
  assert.equal(my.data.ownerOnly,true);
  assert.equal((await call(b)).data.choices.length,0);
  assert.equal((await call(owner)).data.choices.length,0,'Manager has separate personal decision history');
  const unchanged=await pool.query('SELECT status FROM cc_assignments WHERE id=$1',[aTask]);
  assert.equal(unchanged.rows[0].status,'open');
  const audit=await pool.query(
   "SELECT details,target_id FROM cc_activity_events WHERE organization_id=$1 AND event_type='pro.next_action_decided'",[o]);
  assert.equal(audit.rowCount,3);
  assert.doesNotMatch(JSON.stringify(audit.rows),/ALPHA SHARED|I will work|Tomorrow|1212555/);
  assert.ok(audit.rows.every(x=>x.target_id===null));
  const h=await pool.query('SELECT id FROM cc_pro_next_action_history WHERE organization_id=$1 LIMIT 1',[o]);
  await assert.rejects(pool.query('DELETE FROM cc_pro_next_action_history WHERE id=$1',[h.rows[0].id]),/append-only/);
  await pool.query("UPDATE cc_memberships SET membership_status='revoked' WHERE organization_id=$1 AND subject=$2",[o,a]);
  assert.equal((await call(a)).status,404);
  await pool.query("UPDATE cc_plan_entitlements SET status='suspended' WHERE organization_id=$1",[o]);
  assert.equal((await call(b)).status,403);
  assert.equal((await pool.query('SELECT COUNT(*)::int n FROM cc_pro_next_action_history WHERE organization_id=$1',[o])).rows[0].n,3);
 }finally{await new Promise(resolve=>server.close(resolve));await pool.end();}
});
