import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import express from 'express';
import pg from 'pg';
import managementRouter from '../server/management.js';

const connection=process.env.TEST_DATABASE_URL;
if(!connection||!['localhost','127.0.0.1'].includes(new URL(connection).hostname))
 throw Error('Refuse nonlocal management acceptance testing');
const pool=new pg.Pool({connectionString:connection,max:4});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const log=(db,org,campaign,actor,type,target,details)=>db.query(
 'INSERT INTO cc_activity_events(organization_id,campaign_id,actor_subject,event_type,target_id,details)'+
 ' VALUES($1,$2,$3,$4,$5,$6)',[org,campaign,actor,type,target,JSON.stringify(details)]);
const base={title:'Prepare campaign',details:'Family assistance planning',status:'planned',
 priority:'normal',progress:0,assignedTo:null,campaignId:null,
 nextAction:'Call the committee',waitingOn:'',issueReason:'',dueAt:null,note:'First step'};
test('Leadership sees all management states, precise success/failure and immutable history',async()=>{
 for(const f of ['001_core.sql','002_team_connect.sql',
  '019_askan_pro_guidance.sql','021_gabbai_pro_finance_approvals.sql','022_organization_leadership_decisions.sql',
  '033_gabbai_operations_handoffs.sql','034_gabbai_blocker_status.sql',
  '035_organization_management_progress.sql']){
  await pool.query(await readFile(join(import.meta.dirname,'../db',f),'utf8'));
 }
 const tag='mgt-'+Date.now(),owner=tag+'-owner',manager=tag+'-manager',
  member=tag+'-member',outsider=tag+'-outside';
 const org=(await pool.query(
  'INSERT INTO cc_organizations(name,owner_subject) VALUES($1,$2) RETURNING id',['Management QA',owner])).rows[0].id;
 const outsideOrg=(await pool.query(
  'INSERT INTO cc_organizations(name,owner_subject) VALUES($1,$2) RETURNING id',['Foreign QA',outsider])).rows[0].id;
 for(const [id,who,role] of [[org,owner,'owner'],[org,manager,'manager'],
  [org,member,'askan'],[outsideOrg,outsider,'owner']])
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at)"+
   " VALUES($1,$2,$3,$4,now())",[id,who,role,'active']);
 const camp=(await pool.query(
  "INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Care campaign','active') RETURNING id",[org])).rows[0].id;
 const foreignCamp=(await pool.query(
  "INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Private other charity','active') RETURNING id",[outsideOrg])).rows[0].id;
 await pool.query(
  'INSERT INTO cc_campaign_members(organization_id,campaign_id,subject,team_name) VALUES($1,$2,$3,$4)',
  [org,camp,member,'Charity team']);
 await pool.query("INSERT INTO cc_assignments(organization_id,campaign_id,assignee_subject,title,due_at)"+
  " VALUES($1,$2,$3,'Contact families','2025-01-01T10:00:00Z')",[org,camp,member]);
 await pool.query(
  "INSERT INTO cc_gabbai_handoffs(organization_id,campaign_id,created_by,assigned_to,title,status)"+
  " VALUES($1,$2,$3,$4,'Needed help','blocked')",[org,camp,owner,member]);
 await pool.query(
  "INSERT INTO cc_gabbai_approval_requests(organization_id,campaign_id,requested_by,category,amount,subject)"+
  " VALUES($1,$2,$3,'planned_expense',75,'Transport')",[org,camp,owner]);
 const app=express();app.use(express.json());
 app.use('/api/management',(req,_res,next)=>{req.userId=req.get('x-ci-user')||'anonymous';next();});
 app.use('/api/management',managementRouter({pool,bad,uuid,log}));
 app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}));
 const server=await new Promise(ok=>{const srv=app.listen(0,'127.0.0.1',()=>ok(srv));});
 const call=async(who,method,path,body)=>{
  const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/management'+path,{
   method,headers:{'x-ci-user':who,...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,data:await r.json()};
 };
 const home='/organizations/'+org+'/management';
 try{
  assert.equal((await call(member,'GET',home)).status,403);
  assert.equal((await call(outsider,'GET',home)).status,404);
  assert.equal((await call(owner,'GET','/organizations/'+outsideOrg+'/management')).status,404);
  const initial=await call(owner,'GET',home);
  assert.equal(initial.status,200);
  assert.equal(initial.data.signals.overdue_tasks,1);
  assert.equal(initial.data.signals.blocked_handoffs,1);
  assert.equal(initial.data.signals.pending_approvals,1);
  assert.equal(initial.data.signals.pending_guidance,0);
  assert.equal(initial.data.signals.completed_tasks,0);
  assert.equal(initial.data.total,0);
  assert.equal((await call(member,'POST',home+'/items',base)).status,403);
  assert.equal((await call(owner,'POST',home+'/items',{...base,campaignId:foreignCamp})).status,404);
  assert.equal((await call(owner,'POST',home+'/items',{...base,assignedTo:'nonmember'})).status,400);
  assert.equal((await call(owner,'POST',home+'/items',{...base,status:'waiting',waitingOn:''})).status,400);
  assert.equal((await call(owner,'POST',home+'/items',{...base,status:'failed',issueReason:''})).status,400);
  assert.equal((await call(owner,'POST',home+'/items',{...base,status:'successful',progress:85})).status,400);
  const created=await call(owner,'POST',home+'/items',{...base,campaignId:camp,assignedTo:member});
  assert.equal(created.status,201,JSON.stringify(created.data));
  const id=created.data.id;
  const waiting={...base,campaignId:camp,status:'waiting',progress:40,assignedTo:member,
   waitingOn:'Organization committee',issueReason:'Awaiting their response',nextAction:'Remind chairperson',
   note:'Phone conversation recorded without donor details',version:1};
  assert.equal((await call(member,'PATCH',home+'/items/'+id,waiting)).status,403);
  const updated=await call(manager,'PATCH',home+'/items/'+id,waiting);
  assert.equal(updated.status,200,JSON.stringify(updated.data));
  assert.equal(updated.data.version,2);
  assert.equal((await call(manager,'PATCH',home+'/items/'+id,waiting)).status,409);
  assert.equal((await call(owner,'PATCH',home+'/items/'+id,{...waiting,version:2,
   status:'failed',waitingOn:'',issueReason:'Committee declined'})).status,200);
  assert.equal((await call(owner,'GET',home+'?status=failed')).data.matching,1);
  assert.equal((await call(owner,'GET',home+'?status=waiting')).data.matching,0);
  assert.equal((await call(owner,'GET',home+'?query=Prepare')).data.items.length,1);
  assert.equal((await call(owner,'GET',home+'?status=secret')).status,400);
  const h=await call(owner,'GET',home+'/items/'+id+'/history');
  assert.equal(h.status,200);
  assert.equal(h.data.history.length,3);
  assert.equal(h.data.history[0].after_state.status,'failed');
  assert.equal(h.data.history[1].after_state.status,'waiting');
  assert.equal(h.data.history[2].after_state.status,'planned');
  assert.ok(!JSON.stringify((await pool.query(
   "SELECT details FROM cc_activity_events WHERE organization_id=$1 AND event_type LIKE 'management.%'",
   [org])).rows).includes('Family assistance planning'),'No private details in generic audit');
  assert.equal((await call(outsider,'GET',home+'/items/'+id+'/history')).status,404);
  assert.equal((await call(member,'GET',home+'/items/'+id+'/history')).status,403);
  await assert.rejects(pool.query('DELETE FROM cc_management_plan_history WHERE item_id=$1',[id]),
   /append-only/);
  const succeeded=await call(manager,'PATCH',home+'/items/'+id,{
   ...waiting,version:3,status:'successful',progress:100,issueReason:'',
   waitingOn:'',nextAction:'Archive signed report'});
  assert.equal(succeeded.status,200);
  const after=await call(owner,'GET',home);
  assert.equal(after.data.counts.successful,1);
  assert.equal(after.data.items[0].progress,100);
  assert.ok(after.data.items[0].completed_at);
  // 43 extra plans: paging sees all rows, not merely the newest forty.
  for(let n=0;n<43;n++){
   const s=await call(owner,'POST',home+'/items',{...base,title:'Additional plan '+n});
   assert.equal(s.status,201);
  }
  const pages=await call(owner,'GET',home+'?page=2');
  assert.equal(pages.status,200);
  assert.equal(pages.data.items.length,4);
  assert.equal(pages.data.total,44);
  assert.equal(pages.data.pageCount,2);
  assert.equal((await call(owner,'GET',home+'?page=0')).status,400);
  await pool.query("UPDATE cc_memberships SET membership_status='revoked' WHERE organization_id=$1 AND subject=$2",[org,manager]);
  assert.equal((await call(manager,'GET',home)).status,404);
 }finally{await new Promise(done=>server.close(done));await pool.end();}
});
