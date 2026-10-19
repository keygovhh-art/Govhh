import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import express from 'express';
import pg from 'pg';
import gabbaiHandoffsRouter from '../server/gabbai-handoffs.js';
import {makePlanPolicy} from '../server/plan-policy.js';

const conn=process.env.TEST_DATABASE_URL;
if(!conn||!['localhost','127.0.0.1'].includes(new URL(conn).hostname))
 throw Error('Gabbai Handoff CI requires disposable local PostgreSQL');
const pool=new pg.Pool({connectionString:conn,max:5});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const log=(db,o,c,actor,type,id,details)=>db.query(
 'INSERT INTO cc_activity_events(organization_id,campaign_id,actor_subject,event_type,target_id,details) VALUES($1,$2,$3,$4,$5,$6)',
 [o,c,actor,type,id,JSON.stringify(details||{})]);
async function campaignAccess(db,id,person){
 if(!uuid(id))throw bad(400,'Bad campaign');
 const r=await db.query(
  "SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m ON m.organization_id=c.organization_id"+
  " AND m.subject=$2 AND m.membership_status='active' WHERE c.id=$1",[id,person]);
 if(!r.rowCount)throw bad(404,'Campaign missing');
 const c=r.rows[0];
 if(!['owner','manager','finance','auditor'].includes(c.role)){
  const m=await db.query(
   'SELECT 1 FROM cc_campaign_members WHERE organization_id=$1 AND campaign_id=$2 AND subject=$3',
   [c.organization_id,id,person]);
  if(!m.rowCount)throw bad(404,'Campaign missing');
 }
 return c;
}
test('Gabbai Pro operational handoff leads to actual member acknowledgement/completion',async()=>{
 for(const file of ['001_core.sql','002_team_connect.sql','026_server_plan_entitlements.sql',
   '033_gabbai_shift_handoffs.sql']){
  await pool.query(await readFile(join(import.meta.dirname,'../db',file),'utf8'));
 }
 const prefix='handoff-ci-'+Date.now(),owner=prefix+'owner',manager=prefix+'manager',
  a=prefix+'alpha',b=prefix+'beta',foreign=prefix+'foreign';
 const org=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Gabbai operations',$1) RETURNING id",[owner])).rows[0].id;
 const other=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Other operations',$1) RETURNING id",[foreign])).rows[0].id;
 for(const [o,person,role] of [[org,owner,'owner'],[org,manager,'manager'],[org,a,'askan'],
  [org,b,'askan'],[other,foreign,'owner']]){
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at)"+
   " VALUES($1,$2,$3,'active',now())",[o,person,role]);
 }
 const campaign=(await pool.query("INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Current drive','active') RETURNING id",[org])).rows[0].id;
 for(const [person,team] of [[a,'A'],[b,'B']]){
  await pool.query('INSERT INTO cc_campaign_members(organization_id,campaign_id,subject,team_name) VALUES($1,$2,$3,$4)',
   [org,campaign,person,team]);
 }
 const app=express();app.use(express.json());
 const policy=makePlanPolicy({pool,bad});
 app.use('/api/gabbai',(req,_res,next)=>{req.userId=req.get('x-user')||'anonymous';next();},
  policy.scoped('gabbai_pro'));
 app.use('/api/gabbai',gabbaiHandoffsRouter({pool,campaignAccess,bad,uuid,log}));
 app.use((err,_req,res,_next)=>res.status(err.status||500).json({error:err.message}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const path='/api/gabbai/campaigns/'+campaign+'/handoffs';
 async function request(person,method='GET',relative=path,payload){
  const r=await fetch('http://127.0.0.1:'+server.address().port+relative,{
   method,headers:{'x-user':person,...(payload?{'content-type':'application/json'}:{})},
   ...(payload?{body:JSON.stringify(payload)}:{})});
  return {status:r.status,data:await r.json()};
 }
 const assignment={title:'Prepare team for morning shift',instructions:'Check paperwork and equipment',
  assignedTo:a,priority:'high',dueAt:'2026-10-20T09:00:00Z'};
 try{
  assert.equal((await request(owner)).status,403,'No Gabbai paid grant');
  await pool.query(
   "INSERT INTO cc_plan_entitlements(organization_id,plan_code,provision_reference,provisioned_by)"+
   " VALUES($1,'gabbai_pro','verified-ci-operational','trusted-fixture')",[org]);
  assert.equal((await request(foreign)).status,404);
  assert.equal((await request(b,'POST',path,assignment)).status,403);
  assert.equal((await request(owner,'POST',path,{...assignment,assignedTo:foreign})).status,404);
  assert.equal((await request(owner,'POST',path,{...assignment,dueAt:'tomorrow'})).status,400);
  const created=await request(manager,'POST',path,assignment);
  assert.equal(created.status,201);
  assert.equal(created.data.handoff.status,'pending');
  const id=created.data.handoff.id;
  const viewOwner=await request(owner),viewA=await request(a),viewB=await request(b);
  assert.equal(viewOwner.data.handoffs.length,1);
  assert.equal(viewOwner.data.staff.length,2);
  assert.equal(viewA.data.handoffs.length,1);
  assert.deepEqual(viewA.data.staff,[]);
  assert.deepEqual(viewB.data.handoffs,[]);
  const ackPath='/api/gabbai/handoffs/'+id+'/ack',endPath='/api/gabbai/handoffs/'+id+'/complete';
  assert.equal((await request(foreign,'POST',ackPath,{})).status,404);
  assert.equal((await request(b,'POST',ackPath,{})).status,404);
  assert.equal((await request(manager,'POST',ackPath,{})).status,403);
  assert.equal((await request(owner,'POST',endPath,{})).status,409,'Cannot skip acknowledgement');
  const first=await request(a,'POST',ackPath,{});
  assert.equal(first.status,200);assert.equal(first.data.status,'acknowledged');
  const retry=await request(a,'POST',ackPath,{});
  assert.equal(retry.data.unchanged,true);
  assert.equal((await request(b,'POST',endPath,{})).status,404);
  const finished=await request(a,'POST',endPath,{});
  assert.equal(finished.status,200);assert.equal(finished.data.status,'done');
  assert.equal((await request(a,'POST',endPath,{})).data.unchanged,true);
  const after=await request(owner);
  assert.equal(after.data.counts.done,1);
  assert.equal(after.data.counts.pending,0);
  assert.deepEqual(after.data.history.map(x=>x.event_type).sort(),
   ['acknowledged','completed','created']);
  const events=await pool.query(
   "SELECT details FROM cc_activity_events WHERE organization_id=$1 AND event_type LIKE 'gabbai.handoff.%'",[org]);
  assert.equal(events.rowCount,3);
  assert.doesNotMatch(JSON.stringify(events.rows),/paperwork|equipment/,'No private instructions in shared audit');
  const hist=await pool.query('SELECT id FROM cc_gabbai_handoff_history WHERE handoff_id=$1 LIMIT 1',[id]);
  await assert.rejects(pool.query('DELETE FROM cc_gabbai_handoff_history WHERE id=$1',[hist.rows[0].id]),/append-only/);
  await pool.query("UPDATE cc_memberships SET membership_status='revoked' WHERE organization_id=$1 AND subject=$2",[org,a]);
  assert.equal((await request(a)).status,404);
  await pool.query("UPDATE cc_plan_entitlements SET status='suspended' WHERE organization_id=$1",[org]);
  assert.equal((await request(owner)).status,403);
  assert.equal((await pool.query('SELECT COUNT(*)::int count FROM cc_gabbai_handoffs WHERE campaign_id=$1',[campaign])).rows[0].count,1,
   'Suspended tier preserves operational records');
 }finally{await new Promise(resolve=>server.close(resolve));await pool.end();}
});
