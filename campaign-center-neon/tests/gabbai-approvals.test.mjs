import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import express from 'express';
import pg from 'pg';
import gabbaiApprovalsRouter from '../server/gabbai-approvals.js';
const url=process.env.TEST_DATABASE_URL;
if(!url||!['127.0.0.1','localhost'].includes(new URL(url).hostname))
 throw Error('Gabbai approvals tests run on disposable localhost PostgreSQL ONLY');
const pool=new pg.Pool({connectionString:url,max:5});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const trim=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const log=(db,org,camp,user,type,id,details)=>db.query(
 'INSERT INTO cc_activity_events(organization_id,campaign_id,actor_subject,event_type,target_id,details) VALUES($1,$2,$3,$4,$5,$6)',
 [org,camp,user,type,id,JSON.stringify(details||{})]);
async function campaignAccess(db,id,who){
 if(!uuid(id))throw bad(400,'Invalid campaign');
 const q=await db.query("SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m ON m.organization_id=c.organization_id AND m.subject=$2 AND m.membership_status='active' WHERE c.id=$1",[id,who]);
 if(!q.rowCount)throw bad(404,'Campaign not found');
 const c=q.rows[0];
 if(!['owner','manager','finance','auditor'].includes(c.role)){
  const m=await db.query('SELECT 1 FROM cc_campaign_members WHERE campaign_id=$1 AND subject=$2',[id,who]);
  if(!m.rowCount)throw bad(404,'Campaign not found');
 }
 return c;
}
test('Gabbai Pro approvals require two humans and preserve immutable decisions without money transfer',async()=>{
 for(const file of ['001_core.sql','002_team_connect.sql','020_askan_pro_task_blockers.sql','021_gabbai_pro_finance_approvals.sql'])
  await pool.query(await readFile(join(import.meta.dirname,'../db',file),'utf8'));
 const tag='gabbai-ci-'+Date.now();
 const owner=tag+'owner',manager=tag+'manager',finance=tag+'finance',auditor=tag+'audit',askan=tag+'askan',foreign=tag+'foreign';
 const org=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Gabbai QA',$1) RETURNING id",[owner])).rows[0].id;
 const outside=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Outside QA',$1) RETURNING id",[foreign])).rows[0].id;
 for(const [o,who,role] of [[org,owner,'owner'],[org,manager,'manager'],[org,finance,'finance'],[org,auditor,'auditor'],[org,askan,'askan'],[outside,foreign,'owner']])
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at) VALUES($1,$2,$3,'active',now())",[o,who,role]);
 const campaign=(await pool.query("INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Gabbai Approval QA','active') RETURNING id",[org])).rows[0].id;
 await pool.query('INSERT INTO cc_campaign_members(organization_id,campaign_id,subject) VALUES($1,$2,$3)',[org,campaign,askan]);
 const app=express();app.use(express.json());
 app.use('/api/gabbai',(req,_res,next)=>{req.userId=req.get('x-gabbai-user')||'anonymous';next();});
 app.use('/api/gabbai',gabbaiApprovalsRouter({pool,campaignAccess,bad,uuid,trim,log}));
 app.use((err,_req,res,_next)=>res.status(err.status||500).json({error:err.message}));
 const server=await new Promise(done=>{const s=app.listen(0,'127.0.0.1',()=>done(s));});
 async function request(who,method,path,body){
  const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/gabbai'+path,{
   method,headers:{'x-gabbai-user':who,...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,data:await r.json()};
 }
 const home='/campaigns/'+campaign+'/approvals';
 const create=(user,body)=>request(user,'POST',home,body);
 const decision=(user,id,value)=>request(user,'POST','/approvals/'+id+'/decision',{decision:value,reason:'Reviewed manually'});
 const proposal={category:'planned_expense',subject:'Event tent',amount:'250.00',explanation:'Private financial planning comment'};
 try{
  assert.equal((await request(foreign,'GET',home)).status,404);
  assert.equal((await request(askan,'GET',home)).status,403);
  assert.equal((await create(auditor,proposal)).status,403);
  assert.equal((await create(askan,proposal)).status,403);
  assert.equal((await create(owner,{...proposal,amount:'-3'})).status,400);
  const first=await create(finance,proposal);
  assert.equal(first.status,201);assert.equal(first.data.approvalDoesNotMoveMoney,true);
  const id=first.data.id;
  await assert.rejects(pool.query('UPDATE cc_gabbai_approval_requests SET amount=1 WHERE id=$1',[id]),/Only a distinct reviewer/);
  await assert.rejects(pool.query('DELETE FROM cc_gabbai_approval_requests WHERE id=$1',[id]),/cannot be deleted/);
  assert.equal((await request(auditor,'GET',home)).data.requests.length,1);
  assert.equal((await decision(foreign,id,'approved')).status,404);
  assert.equal((await decision(finance,id,'approved')).status,403);
  const authorized=await decision(owner,id,'approved');
  assert.equal(authorized.status,200);
  assert.equal(authorized.data.doesNotMoveMoney,true);
  assert.equal((await decision(manager,id,'rejected')).status,409);
  const own=await create(owner,{...proposal,category:'refund_review',amount:'100'});
  assert.equal(own.status,201);
  assert.equal((await decision(owner,own.data.id,'approved')).status,403);
  assert.equal((await request(manager,'POST','/approvals/'+own.data.id+'/decision',{decision:'rejected'})).status,400,'Financial rejection requires an explanation');
  assert.equal((await decision(manager,own.data.id,'rejected')).status,200);
  const detailed=(await request(owner,'GET',home)).data.requests.find(x=>x.id===own.data.id);
  assert.equal(detailed.decision_reason,'Reviewed manually','Reviewer's explanation stays visible on approval history');
  assert.equal((await request(finance,'GET',home+'?status=pending')).data.requests.length,0);
  const pendingFinance=await create(finance,{...proposal,subject:'Pending for owner',amount:'35.50'});
  const pendingOwner=await create(owner,{...proposal,subject:'Pending for other manager',amount:'20.00'});
  assert.equal(pendingFinance.status,201);assert.equal(pendingOwner.status,201);
  const ownerDesk=(await request(owner,'GET',home)).data;
  assert.equal(ownerDesk.summaryAcrossAllRows,true);
  assert.equal(ownerDesk.summary.total,4);
  assert.equal(ownerDesk.summary.pending,2);
  assert.equal(ownerDesk.summary.approved,1);
  assert.equal(ownerDesk.summary.rejected,1);
  assert.equal(ownerDesk.summary.reviewable_count,1,'Cannot review own finance proposal');
  assert.equal(ownerDesk.summary.my_pending,1);
  assert.equal(Number(ownerDesk.summary.pending_amount),55.5);
  assert.equal(Number(ownerDesk.summary.reviewable_amount),35.5);
  const managerDesk=(await request(manager,'GET',home)).data;
  assert.equal(managerDesk.summary.reviewable_count,2);
  assert.equal(managerDesk.summary.my_pending,0);
  assert.equal((await request(finance,'GET',home+'?status=pending')).data.requests.length,2);

  const dbDecisions=await pool.query('SELECT * FROM cc_gabbai_approval_decisions WHERE organization_id=$1',[org]);
  assert.equal(dbDecisions.rowCount,2,'One immutable decision per request');
  await assert.rejects(pool.query('DELETE FROM cc_gabbai_approval_decisions WHERE id=$1',[dbDecisions.rows[0].id]),/append-only/);
  const moneyEvents=await pool.query('SELECT COUNT(*)::int n FROM cc_finance_events WHERE campaign_id=$1',[campaign]);
  assert.equal(moneyEvents.rows[0].n,0,'Approving must not invent paid revenue or record an actual payment');

  const initialLedger=await request(owner,'GET','/campaigns/'+campaign+'/ledger-review?days=30');
  assert.equal(initialLedger.status,200);
  assert.equal(initialLedger.data.noExternalReconciliation,true);
  assert.equal(Number(initialLedger.data.totals.reported_net),0);
  assert.equal((await request(askan,'GET','/campaigns/'+campaign+'/ledger-review')).status,403);
  assert.equal((await request(foreign,'GET','/campaigns/'+campaign+'/ledger-review')).status,404);
  assert.equal((await request(owner,'GET','/campaigns/'+campaign+'/ledger-review?days=500')).status,400);
  const transactions=[['pledge','120.00','p'],['receipt','45.00','r1'],['receipt','15.00','r2'],['refund','5.00','ref']];
  for(const [kind,amount,key] of transactions){
   await pool.query("INSERT INTO cc_finance_events(organization_id,campaign_id,credited_member_subject,source_system,source_event_key,event_kind,amount) VALUES($1,$2,$3,'gabbai-qa',$4,$5,$6)",
    [org,campaign,finance,tag+key,kind,amount]);
  }
  const review=await request(auditor,'GET','/campaigns/'+campaign+'/ledger-review?days=30');
  assert.equal(review.status,200);
  assert.equal(Number(review.data.totals.pledged),120);
  assert.equal(Number(review.data.totals.receipts),60);
  assert.equal(Number(review.data.totals.refunds),5);
  assert.equal(Number(review.data.totals.reported_net),55);
  assert.equal(review.data.receiptsWithoutPledgeLink,2);
  assert.ok(review.data.internalStampsNotBankVerification);
  assert.equal(review.data.bySource.length,3);
  await pool.query('INSERT INTO cc_campaign_members(organization_id,campaign_id,subject,team_name) VALUES($1,$2,$3,$4)',[org,campaign,manager,'B']);
  await pool.query('UPDATE cc_campaign_members SET team_name=$1 WHERE campaign_id=$2 AND subject=$3',['A',campaign,askan]);
  const openTask=(await pool.query("INSERT INTO cc_assignments(organization_id,campaign_id,assignee_subject,title,status,due_at) VALUES($1,$2,$3,'Critical contact','open','2026-01-01T10:00:00Z') RETURNING id",[org,campaign,askan])).rows[0].id;
  await pool.query("INSERT INTO cc_pro_task_blockers(task_id,organization_id,campaign_id,reason,updated_by) VALUES($1,$2,$3,'approval_needed',$4)",
    [openTask,org,campaign,owner]);
  const priorities=await request(owner,'GET','/campaigns/'+campaign+'/priority-oversight');
  assert.equal(priorities.status,200);
  assert.equal(priorities.data.noEmployeePerformanceJudgement,true);
  const teamA=priorities.data.teams.find(x=>x.team_name==='A');
  assert.equal(teamA.open_tasks,1);
  assert.equal(teamA.overdue_tasks,1);
  assert.equal(teamA.active_blockers,1);
  assert.ok(priorities.data.urgentTasks.some(x=>x.id===openTask),'Gabbai board links to real urgent assigned task');
  assert.ok(priorities.data.urgentLimit<=25);
  assert.equal(priorities.data.urgentTasks.find(x=>x.id===openTask).status,'open');
  assert.equal((await request(auditor,'GET','/campaigns/'+campaign+'/priority-oversight')).status,403);
  assert.equal((await request(foreign,'GET','/campaigns/'+campaign+'/priority-oversight')).status,404);

  const audit=await pool.query("SELECT details FROM cc_activity_events WHERE campaign_id=$1 AND event_type LIKE 'gabbai.approval.%'",[campaign]);
  assert.equal(audit.rowCount,6);
  assert.ok(!JSON.stringify(audit.rows).includes('Private financial planning comment'),'No confidential request explanation in global audit');
  await pool.query("UPDATE cc_memberships SET membership_status='revoked' WHERE organization_id=$1 AND subject=$2",[org,finance]);
  assert.equal((await request(finance,'GET',home)).status,404);
 }finally{await new Promise(done=>server.close(done));await pool.end();}
});
