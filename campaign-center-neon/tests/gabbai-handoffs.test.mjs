import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import express from 'express';
import pg from 'pg';
import gabbaiHandoffsRouter from '../server/gabbai-handoffs.js';
import {makePlanPolicy} from '../server/plan-policy.js';

const url=process.env.TEST_DATABASE_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname))
 throw Error('Gabbai handoff acceptance runs on disposable local PostgreSQL only');
const pool=new pg.Pool({connectionString:url,max:5});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const log=(db,org,cid,actor,type,id,details)=>db.query(
 'INSERT INTO cc_activity_events(organization_id,campaign_id,actor_subject,event_type,target_id,details)'+
 ' VALUES($1,$2,$3,$4,$5,$6)',[org,cid,actor,type,id,JSON.stringify(details||{})]);
async function campaignAccess(db,id,person){
 if(!uuid(id))throw bad(400,'Invalid campaign');
 const r=await db.query(
  "SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m ON m.organization_id=c.organization_id"+
  " AND m.subject=$2 AND m.membership_status='active' WHERE c.id=$1",
  [id,person]);
 const c=r.rows[0];if(!c)throw bad(404,'Campaign not found');
 if(!['owner','manager','finance','auditor'].includes(c.role)){
  const member=await db.query(
   'SELECT 1 FROM cc_campaign_members WHERE organization_id=$1 AND campaign_id=$2 AND subject=$3',
   [c.organization_id,id,person]);
  if(!member.rowCount)throw bad(404,'Campaign not found');
 }
 return c;
}
test('Gabbai Pro real handoffs: manager assignment, member progress, private histories, due dates and reopened work',async()=>{
 for(const file of ['001_core.sql','002_team_connect.sql','026_server_plan_entitlements.sql',
  '033_gabbai_operations_handoffs.sql'])
  await pool.query(await readFile(join(import.meta.dirname,'../db',file),'utf8'));
 const tag='handoff-ci-'+Date.now(),owner=tag+'owner',manager=tag+'manager',
  worker=tag+'worker',peer=tag+'peer',outsider=tag+'other';
 const org=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Handoff QA',$1) RETURNING id",[owner])).rows[0].id;
 const foreign=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Foreign QA',$1) RETURNING id",[outsider])).rows[0].id;
 for(const [oid,user,role] of [[org,owner,'owner'],[org,manager,'manager'],[org,worker,'askan'],
  [org,peer,'askan'],[foreign,outsider,'owner']]){
  await pool.query(
   "INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at)"+
   " VALUES($1,$2,$3,'active',now())",[oid,user,role]);
 }
 const cid=(await pool.query(
  "INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Operations','active') RETURNING id",
  [org])).rows[0].id;
 for(const [user,team] of [[worker,'A'],[peer,'B']])
  await pool.query(
   'INSERT INTO cc_campaign_members(organization_id,campaign_id,subject,team_name) VALUES($1,$2,$3,$4)',
   [org,cid,user,team]);
 const app=express();app.use(express.json());
 const policy=makePlanPolicy({pool,bad});
 app.use('/api/gabbai',(req,_res,next)=>{req.userId=req.get('x-ci-user')||'unknown';next();},
  policy.scoped('gabbai_pro'));
 app.use('/api/gabbai',gabbaiHandoffsRouter({pool,campaignAccess,bad,uuid,log}));
 app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}));
 const srv=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 async function request(who,method,path,payload){
  const r=await fetch('http://127.0.0.1:'+srv.address().port+'/api/gabbai'+path,
   {method,headers:{'x-ci-user':who,...(payload?{'content-type':'application/json'}:{})},
    ...(payload?{body:JSON.stringify(payload)}:{})});
  return {status:r.status,data:await r.json()};
 }
 const base='/campaigns/'+cid+'/handoffs';
 const create=(who,body)=>request(who,'POST',base,body);
 const list=who=>request(who,'GET',base);
 const status=(who,id,up)=>request(who,'PATCH','/handoffs/'+id+'/status',{status:up});
 const comment=(who,id,body)=>request(who,'POST','/handoffs/'+id+'/comments',{body});
 const events=(who,id)=>request(who,'GET','/handoffs/'+id+'/events');
 try{
  assert.equal((await list(owner)).status,403,'Chesed Quick cannot use paid Gabbai operations');
  await pool.query(
   "INSERT INTO cc_plan_entitlements(organization_id,plan_code,provision_reference,provisioned_by)"+
   " VALUES($1,'gabbai_pro','approved-ci-handoff-grant','CI-operator')",[org]);
  assert.equal((await list(owner)).status,200);
  assert.equal((await list(outsider)).status,404);
  assert.equal((await create(worker,{title:'Try bypass',assignedTo:peer})).status,403);
  assert.equal((await create(owner,{title:'No campaign assignee',assignedTo:manager})).status,400);
  assert.equal((await create(owner,{title:'X',assignedTo:worker,priority:'urgent'})).status,400);
  await pool.query(
    "INSERT INTO cc_assignments(organization_id,campaign_id,assignee_subject,title,priority,due_at)"+
    " VALUES($1,$2,$3,'Worker overdue task','high',now()-interval '1 day')",
    [org,cid,worker]);
  await pool.query(
    "INSERT INTO cc_assignments(organization_id,campaign_id,assignee_subject,title,priority,due_at)"+
    " VALUES($1,$2,$3,'Peer tomorrow task','normal',now()+interval '1 day')",
    [org,cid,peer]);
  assert.equal((await request(worker,'GET','/campaigns/'+cid+'/member-workload')).status,403);
  assert.equal((await request(outsider,'GET','/campaigns/'+cid+'/member-workload')).status,404);
  const newTask=await create(owner,{title:'Call back shift manager',
   instructions:'Make sure tomorrow handoff is complete.',assignedTo:worker,priority:'high',
   dueAt:new Date(Date.now()-86400000).toISOString()});
  assert.equal(newTask.status,201);
  const id=newTask.data.handoff.id;
  const view=await list(owner);assert.equal(view.data.stats.open,1);
  assert.equal(view.data.stats.overdue,1);
  assert.equal(view.data.canCreate,true);
  assert.equal((await list(worker)).data.stats.assigned_to_me,1);
  const workload=await request(owner,'GET','/campaigns/'+cid+'/member-workload');
  assert.equal(workload.status,200);
  assert.equal(workload.data.basedOnActualRecords,true);
  assert.equal(workload.data.noStaffPerformanceRating,true);
  const byMember=Object.fromEntries(workload.data.members.map(x=>[x.subject,x]));
  assert.equal(byMember[worker].open_tasks,1);
  assert.equal(byMember[worker].overdue_tasks,1);
  assert.equal(byMember[worker].open_handoffs,1);
  assert.equal(byMember[worker].overdue_handoffs,1);
  assert.equal(byMember[worker].total_open_work,2);
  assert.equal(byMember[peer].open_tasks,1);
  assert.equal(byMember[peer].due_soon_tasks,1);
  assert.equal(workload.data.totals.openHandoffs,1);

  assert.equal((await list(peer)).data.handoffs.length,0);
  assert.equal((await events(peer,id)).status,404);
  assert.equal((await status(peer,id,'done')).status,404);
  assert.equal((await comment(peer,id,'Other member tampering')).status,404);
  assert.equal((await status(worker,id,'open')).status,403);
  assert.equal((await status(worker,id,'in_progress')).status,200);
  const duplicated=await status(worker,id,'in_progress');
  assert.equal(duplicated.data.unchanged,true);
  assert.equal((await comment(worker,id,'The shift is underway')).status,201);
  assert.equal((await comment(worker,id,'')).status,400);
  const completed=await status(worker,id,'done');assert.equal(completed.status,200);
  assert.equal(completed.data.handoff.completed_by,worker);
  assert.ok(completed.data.handoff.completed_at);
  const after=await list(owner);assert.equal(after.data.stats.done,1);
  assert.equal(after.data.stats.overdue,0);
  const finishedLoad=await request(manager,'GET','/campaigns/'+cid+'/member-workload');
  assert.equal(finishedLoad.status,200);
  assert.equal(finishedLoad.data.totals.openHandoffs,0,
    'Completing delegated work must free up actual workload count');

  const history=await events(worker,id);
  assert.deepEqual(history.data.events.map(x=>x.kind),['created','status','comment','status']);
  await assert.rejects(
   pool.query('DELETE FROM cc_gabbai_handoff_events WHERE id=$1',[history.data.events[0].id]),
   /append-only/);
  assert.equal((await status(worker,id,'open')).status,403);
  assert.equal((await status(manager,id,'open')).status,200);
  assert.equal((await list(owner)).data.stats.open,1);
  assert.equal((await status(worker,id,'done')).status,200);
  await pool.query(
   "UPDATE cc_memberships SET membership_status='revoked' WHERE organization_id=$1 AND subject=$2",
   [org,worker]);
  assert.equal((await list(worker)).status,404);
  assert.equal((await events(worker,id)).status,404);
  await pool.query("UPDATE cc_plan_entitlements SET status='suspended' WHERE organization_id=$1",[org]);
  assert.equal((await list(owner)).status,403);
  const historical=await pool.query('SELECT COUNT(*)::int n FROM cc_gabbai_handoff_events WHERE handoff_id=$1',[id]);
  assert.ok(historical.rows[0].n>=5,'Plan downgrade retains operational histories');
 }finally{await new Promise(ok=>srv.close(ok));await pool.end();}
});
