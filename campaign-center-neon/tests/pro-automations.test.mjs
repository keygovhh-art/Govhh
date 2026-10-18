import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import express from 'express';
import pg from 'pg';
import proAutomationRouter from '../server/pro-automations.js';
import {makePlanPolicy} from '../server/plan-policy.js';

const url=process.env.TEST_DATABASE_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname))
 throw Error('Private CRM automation CI must use disposable localhost PostgreSQL');
const pool=new pg.Pool({connectionString:url,max:6});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const log=(db,o,c,u,type,id,details)=>db.query(
 'INSERT INTO cc_activity_events(organization_id,campaign_id,actor_subject,event_type,target_id,details) VALUES($1,$2,$3,$4,$5,$6)',
 [o,c,u,type,id,JSON.stringify(details||{})]);
const guid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
async function campaignAccess(db,id,user){
 if(!guid.test(id))throw bad(400,'Invalid campaign id');
 const rows=await db.query(
  "SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m ON m.organization_id=c.organization_id"+
  " AND m.subject=$2 AND m.membership_status='active' WHERE c.id=$1",[id,user]);
 const c=rows.rows[0];
 if(!c)throw bad(404,'Campaign not found');
 if(!['owner','manager','finance','auditor'].includes(c.role)){
  const m=await db.query("SELECT 1 FROM cc_campaign_members WHERE campaign_id=$1 AND subject=$2",[id,user]);
  if(!m.rowCount)throw bad(404,'Campaign not found');
 }
 return c;
}
test('Askan Pro opt-in CRM automation creates private idempotent tasks, never outbound calls',async()=>{
 for(const file of ['001_core.sql','002_team_connect.sql','017_askan_pro_crm.sql',
  '026_server_plan_entitlements.sql','030_pro_followup_automation.sql']){
  await pool.query(await readFile(join(import.meta.dirname,'../db',file),'utf8'));
 }
 const label='proauto-ci-'+Date.now(),owner=label+'owner',alice=label+'alice',bob=label+'bob',
  auditor=label+'auditor',external=label+'external';
 async function createOrg(name,subject){return (await pool.query(
  "INSERT INTO cc_organizations(name,owner_subject) VALUES($1,$2) RETURNING id",
  [name,subject])).rows[0].id;}
 const org=await createOrg('automation test',owner);
 const foreign=await createOrg('other automation test',external);
 for(const [oid,u,role] of [[org,owner,'owner'],[org,alice,'askan'],[org,bob,'askan'],
   [org,auditor,'auditor'],[foreign,external,'owner']]){
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at)"+
   " VALUES($1,$2,$3,'active',now())",[oid,u,role]);
 }
 async function makeCampaign(oid,name){
  return (await pool.query("INSERT INTO cc_campaigns(organization_id,title,status)"+
   " VALUES($1,$2,'active') RETURNING id",[oid,name])).rows[0].id;
 }
 const campaign=await makeCampaign(org,'Working campaign');
 const otherCampaign=await makeCampaign(foreign,'Private other');
 for(const [u,team] of [[owner,''],[alice,'A'],[bob,'B']]){
  await pool.query("INSERT INTO cc_campaign_members(organization_id,campaign_id,subject,team_name) VALUES($1,$2,$3,$4)",
   [org,campaign,u,team]);
 }
 const past=new Date(Date.now()-86400000).toISOString(),future=new Date(Date.now()+86400000).toISOString();
 async function contact(who,name,deadline,{dnc=false,phone='12125550000',stage='followup'}={}){
  const id=(await pool.query(
   "INSERT INTO cc_contacts(organization_id,campaign_id,created_by,display_name,phone,privacy,assigned_team,do_not_call)"+
   " VALUES($1,$2,$3,$4,$5,'private','A',$6) RETURNING id",
   [org,campaign,who,name,phone,dnc])).rows[0].id;
  await pool.query(
   'INSERT INTO cc_pro_contact_profiles(organization_id,campaign_id,contact_id,stage,priority,next_followup_at,last_updated_by)'+
   ' VALUES($1,$2,$3,$4,$5,$6,$7)',
   [org,campaign,id,stage,'high',deadline,who]);
  return id;
 }
 const mine=await contact(alice,'PERSONAL SECRET ALICE',past);
 await contact(alice,'ALICE NO CALL',past,{dnc:true});
 await contact(alice,'ALICE NO PHONE',past,{phone:''});
 await contact(alice,'ALICE FUTURE',future);
 await contact(alice,'ALICE CLOSED',past,{stage:'closed'});
 await contact(bob,'BOB PRIVATE',past);
 const app=express();app.use(express.json());
 const policy=makePlanPolicy({pool,bad});
 app.use('/api/pro',(req,_res,next)=>{req.userId=req.get('x-qa-user')||'unknown';next();},policy.scoped('askan_pro'));
 app.use('/api/pro',proAutomationRouter({pool,campaignAccess,bad,log}));
 app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}));
 const server=await new Promise(resolve=>{const x=app.listen(0,'127.0.0.1',()=>resolve(x));});
 const base='http://127.0.0.1:'+server.address().port+'/api/pro/campaigns/'+campaign+'/automations';
 async function req(who,method='GET',suffix='',body){
  const response=await fetch(base+suffix,{
   method,headers:{'x-qa-user':who,...(body?{'content-type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json()};
 }
 const settings=(who,enabled,maxTasksPerRun=10)=>req(who,'PUT','',{enabled,maxTasksPerRun});
 const run=who=>req(who,'POST','/run',{});
 try{
  assert.equal((await req(alice)).status,403,'Starter tier cannot use Askan Pro automations');
  await pool.query(
   "INSERT INTO cc_plan_entitlements(organization_id,plan_code,provision_reference,provisioned_by)"+
   " VALUES($1,'askan_pro','validated-pro-automation-ci','ci-operator')",[org]);
  const initial=await req(alice);
  assert.equal(initial.status,200);
  assert.equal(initial.data.rule.enabled,false);
  assert.equal(initial.data.eligibleCount,1,'DNC, no-phone, future, closed and other member hidden');
  assert.equal(initial.data.manualRunRequired,true);
  assert.equal((await req(external)).status,404);
  assert.equal((await req(auditor)).status,403);
  assert.equal((await run(alice)).status,409,'Not opt-in by default');
  assert.equal((await settings(alice,true,0)).status,400);
  assert.equal((await settings(alice,true,21)).status,400);
  assert.equal((await settings(alice,true,1)).status,200);
  assert.equal((await settings(bob,true,1)).status,200);
  const simultaneous=await Promise.all([run(alice),run(alice)]);
  assert.deepEqual(simultaneous.map(x=>x.status).sort(),[201,201]);
  assert.deepEqual(simultaneous.map(x=>x.data.run.created_tasks).sort(),[0,1],
   'two simultaneous runs must create one task due to row lock');
  const recent=await req(alice);
  assert.equal(recent.data.eligibleCount,0);
  assert.equal(recent.data.createdLinks.length,1);
  assert.equal(recent.data.createdLinks[0].contact_id,mine);
  assert.ok(recent.data.createdLinks[0].display_name.includes('SECRET ALICE'));
  assert.equal((await req(bob)).data.createdLinks.length,0,'Other team does not see source mapping');
  assert.equal((await req(owner)).data.createdLinks.length,0,'Owner cannot see Alice personal notes via automation');
  const tasks=await pool.query(
   "SELECT title,assignee_subject,status,kind,due_at FROM cc_assignments WHERE organization_id=$1 AND campaign_id=$2",
   [org,campaign]);
  assert.equal(tasks.rowCount,1);
  assert.equal(tasks.rows[0].assignee_subject,alice);
  assert.equal(tasks.rows[0].kind,'followup');
  assert.equal(tasks.rows[0].status,'open');
  assert.doesNotMatch(tasks.rows[0].title,/ALICE|SECRET|1212555|BOB/);
  const activity=await pool.query(
   "SELECT event_type,details FROM cc_activity_events WHERE organization_id=$1"+
   " AND event_type LIKE 'pro.followup_automation.%'",[org]);
  assert.doesNotMatch(JSON.stringify(activity.rows),/PERSONAL SECRET|ALICE NO CALL|1212555/);
  assert.equal((await run(alice)).data.run.created_tasks,0);
  await pool.query(
   'UPDATE cc_pro_contact_profiles SET next_followup_at=$1 WHERE contact_id=$2',
   [new Date(Date.now()-172800000).toISOString(),mine]);
  assert.equal((await req(alice)).data.eligibleCount,1,'Changed due date is a new follow-up version');
  assert.equal((await run(alice)).data.run.created_tasks,1);
  assert.equal((await pool.query(
   "SELECT COUNT(*)::int n FROM cc_assignments WHERE organization_id=$1 AND campaign_id=$2",
   [org,campaign])).rows[0].n,2);
  const link=await pool.query(
   'SELECT id FROM cc_pro_automation_task_links WHERE organization_id=$1 AND owner_subject=$2 LIMIT 1',
   [org,alice]);
  await assert.rejects(pool.query('DELETE FROM cc_pro_automation_task_links WHERE id=$1',[link.rows[0].id]),/append-only/);
  assert.equal((await settings(alice,false)).status,200);
  assert.equal((await run(alice)).status,409);
  await pool.query("UPDATE cc_memberships SET membership_status='revoked' WHERE organization_id=$1 AND subject=$2",[org,alice]);
  assert.equal((await req(alice)).status,404);
  await pool.query("UPDATE cc_plan_entitlements SET status='suspended' WHERE organization_id=$1",[org]);
  assert.equal((await req(bob)).status,403);
  const after=await pool.query('SELECT COUNT(*)::int n FROM cc_pro_automation_task_links WHERE organization_id=$1',[org]);
  assert.equal(after.rows[0].n,2,'Downgrade must preserve the generated tasks/history');
 }finally{await new Promise(done=>server.close(done));await pool.end();}
});
