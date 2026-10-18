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
 throw Error('Gabbai handoff tests require disposable localhost PostgreSQL');
const pool=new pg.Pool({connectionString:url,max:5});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const log=(db,org,camp,actor,event,id,details)=>db.query(
 'INSERT INTO cc_activity_events(organization_id,campaign_id,actor_subject,event_type,target_id,details) VALUES($1,$2,$3,$4,$5,$6)',
 [org,camp,actor,event,id,JSON.stringify(details||{})]);
const guid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
async function campaignAccess(db,cid,person){
 if(!guid.test(cid))throw bad(400,'Invalid campaign');
 const q=await db.query(
  "SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m ON m.organization_id=c.organization_id"+
  " AND m.subject=$2 AND m.membership_status='active' WHERE c.id=$1",[cid,person]);
 const c=q.rows[0];
 if(!c)throw bad(404,'Campaign not found');
 if(!['owner','manager','finance','auditor'].includes(c.role)){
  const joined=await db.query('SELECT 1 FROM cc_campaign_members WHERE campaign_id=$1 AND subject=$2',[cid,person]);
  if(!joined.rowCount)throw bad(404,'Campaign not found');
 }
 return c;
}

test('Gabbai Pro managers can record shift work, see urgent unread handoffs and acknowledge each other',async()=>{
 for(const file of ['001_core.sql','002_team_connect.sql','026_server_plan_entitlements.sql','033_gabbai_operations_handoff.sql'])
  await pool.query(await readFile(join(import.meta.dirname,'../db',file),'utf8'));
 const tag='shift-ci-'+Date.now(),owner=tag+'owner',manager=tag+'manager',second=tag+'second',
  finance=tag+'finance',worker=tag+'worker',outsider=tag+'out';
 const org=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Shift QA',$1) RETURNING id",[owner])).rows[0].id;
 const foreign=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Foreign QA',$1) RETURNING id",[outsider])).rows[0].id;
 for(const [oid,who,role] of [[org,owner,'owner'],[org,manager,'manager'],[org,second,'manager'],
  [org,finance,'finance'],[org,worker,'askan'],[foreign,outsider,'owner']]){
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at) VALUES($1,$2,$3,'active',now())",[oid,who,role]);
 }
 const camp=(await pool.query("INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Morning Shift','active') RETURNING id",[org])).rows[0].id;
 const other=(await pool.query("INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Other Shift','active') RETURNING id",[foreign])).rows[0].id;
 await pool.query("INSERT INTO cc_campaign_members(organization_id,campaign_id,subject) VALUES($1,$2,$3)",[org,camp,worker]);
 const app=express(),policy=makePlanPolicy({pool,bad});app.use(express.json());
 app.use('/api/gabbai',(req,_res,next)=>{req.userId=req.get('x-user')||'unknown';next();},policy.scoped('gabbai_pro'));
 app.use('/api/gabbai',gabbaiHandoffsRouter({pool,campaignAccess,bad,log}));
 app.use((err,_req,res,_next)=>res.status(err.status||500).json({error:err.message}));
 const server=await new Promise(resolve=>{const srv=app.listen(0,'127.0.0.1',()=>resolve(srv));});
 const base='http://127.0.0.1:'+server.address().port+'/api/gabbai/campaigns/';
 async function request(who,method='GET',url=base+camp+'/handoffs',payload){
  const res=await fetch(url,{method,headers:{'x-user':who,...(payload?{'content-type':'application/json'}:{})},
    ...(payload?{body:JSON.stringify(payload)}:{})});
  return {status:res.status,data:await res.json()};
 }
 const make=(who,body)=>request(who,'POST',base+camp+'/handoffs',body);
 const ack=(who,id)=>request(who,'POST',base+camp+'/handoffs/'+id+'/ack',{});
 const summary={
  headline:'Friday fundraising handoff',completedSummary:'We called 12 contacts',
  blockersSummary:'Room needs assistance',nextAction:'Manager should prepare next team round',
  urgency:'critical',targetAt:new Date(Date.now()+86400000).toISOString()
 };
 try{
  assert.equal((await request(owner)).status,403,'No paid plan grant before operator provisioning');
  await pool.query(
   "INSERT INTO cc_plan_entitlements(organization_id,plan_code,provision_reference,provisioned_by)"+
   " VALUES($1,'gabbai_pro','verified-shift-qa-plan','CI-operator')",[org]);
  assert.equal((await request(outsider)).status,404,'Other organization cannot see shift data');
  assert.equal((await request(outsider,'GET',base+other+'/handoffs')).status,403,'Other org has no Gabbai grant');
  assert.equal((await request(worker)).status,403);
  assert.equal((await request(finance)).status,403);
  assert.equal((await make(worker,summary)).status,403);
  assert.equal((await make(owner,{...summary,nextAction:''})).status,400);
  assert.equal((await make(owner,{...summary,urgency:'fake'})).status,400);
  const created=await make(owner,summary);
  assert.equal(created.status,201);
  assert.equal(created.data.manualRecordOnly,true);
  assert.equal(created.data.externalNotificationSent,false);
  const id=created.data.handoff.id;
  assert.equal((await ack(owner,id)).status,409,'Cannot acknowledge own handoff');
  assert.equal((await ack(worker,id)).status,403);
  assert.equal((await ack(outsider,id)).status,404);
  let managerView=await request(manager);
  assert.equal(managerView.status,200);
  assert.equal(managerView.data.pendingForMe,1);
  assert.equal(managerView.data.urgentPendingForMe,1);
  assert.equal(managerView.data.handoffs[0].headline,summary.headline);
  assert.equal(managerView.data.handoffs[0].acknowledgements,0);
  const first=await ack(manager,id);
  assert.equal(first.status,201);assert.equal(first.data.externalNotificationSent,false);
  const duplicate=await ack(manager,id);
  assert.equal(duplicate.status,200);assert.equal(duplicate.data.alreadyAcknowledged,true);
  managerView=await request(manager);
  assert.equal(managerView.data.pendingForMe,0);
  assert.equal(managerView.data.handoffs[0].acknowledged_by_me,true);
  assert.equal(managerView.data.handoffs[0].acknowledgements,1);
  assert.equal((await request(second)).data.pendingForMe,1,'Other manager still must confirm individually');
  assert.equal((await ack(second,id)).status,201);
  const ownerView=await request(owner);
  assert.equal(ownerView.data.pendingForMe,0,'Authors own work is not an unread external handoff');
  assert.equal(ownerView.data.handoffs[0].acknowledgements,2);
  assert.equal((await request(manager,'GET',base+camp+'/handoffs?days=5')).status,400);
  assert.equal((await request(manager,'GET',base+camp+'/handoffs?days=7')).status,200);
  const foreignPost=(await request(owner,'POST',base+other+'/handoffs',summary));
  assert.equal(foreignPost.status,404);
  const handoffRow=await pool.query('SELECT id FROM cc_gabbai_shift_handoffs WHERE id=$1',[id]);
  assert.equal(handoffRow.rowCount,1);
  await assert.rejects(pool.query("UPDATE cc_gabbai_shift_handoffs SET next_action='tampered' WHERE id=$1",[id]),/append-only/);
  const ackRow=await pool.query('SELECT id FROM cc_gabbai_shift_handoff_acks WHERE handoff_id=$1 LIMIT 1',[id]);
  await assert.rejects(pool.query('DELETE FROM cc_gabbai_shift_handoff_acks WHERE id=$1',[ackRow.rows[0].id]),/append-only/);
  const audit=await pool.query("SELECT details FROM cc_activity_events WHERE organization_id=$1 AND event_type LIKE 'gabbai.handoff.%'",[org]);
  assert.equal(audit.rowCount,3);
  assert.doesNotMatch(JSON.stringify(audit.rows),/Room needs assistance|We called/);
  await pool.query("UPDATE cc_memberships SET membership_status='revoked' WHERE organization_id=$1 AND subject=$2",[org,manager]);
  assert.equal((await request(manager)).status,404);
  await pool.query("UPDATE cc_plan_entitlements SET status='suspended' WHERE organization_id=$1",[org]);
  assert.equal((await request(owner)).status,403);
  assert.equal((await pool.query('SELECT COUNT(*)::int n FROM cc_gabbai_shift_handoffs WHERE organization_id=$1',[org])).rows[0].n,1);
 }finally{await new Promise(resolve=>server.close(resolve));await pool.end();}
});
