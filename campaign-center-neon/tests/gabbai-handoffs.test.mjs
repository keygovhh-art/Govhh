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
 throw Error('Gabbai handoff CI requires disposable local PostgreSQL');
const pool=new pg.Pool({connectionString:conn,max:4});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const log=(db,org,camp,user,event,id,details)=>db.query(
 'INSERT INTO cc_activity_events(organization_id,campaign_id,actor_subject,event_type,target_id,details)'+
 ' VALUES($1,$2,$3,$4,$5,$6)',[org,camp,user,event,id,JSON.stringify(details||{})]);
async function campaignAccess(db,id,person){
 const row=(await db.query(
  "SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m ON m.organization_id=c.organization_id"+
  " AND m.subject=$2 AND m.membership_status='active' WHERE c.id=$1",[id,person])).rows[0];
 if(!row)throw bad(404,'Campaign inaccessible');
 if(!['owner','manager','finance','auditor'].includes(row.role)){
  const m=await db.query('SELECT 1 FROM cc_campaign_members WHERE campaign_id=$1 AND subject=$2',[id,person]);
  if(!m.rowCount)throw bad(404,'Campaign inaccessible');
 }
 return row;
}
test('Gabbai Pro manager handoff is a real two-person accept and complete workflow',async()=>{
 for(const name of ['001_core.sql','002_team_connect.sql','026_server_plan_entitlements.sql',
  '033_gabbai_operations_shift_handoffs.sql']){
  await pool.query(await readFile(join(import.meta.dirname,'../db',name),'utf8'));
 }
 const mark='handoff-ci-'+Date.now(),owner=mark+'owner',manager=mark+'manager',
  other=mark+'other',member=mark+'member',outsider=mark+'outsider';
 async function org(name,person){return (await pool.query(
  'INSERT INTO cc_organizations(name,owner_subject) VALUES($1,$2) RETURNING id',[name,person])).rows[0].id;}
 const oid=await org('Operations QA',owner),outside=await org('Outside QA',outsider);
 for(const [orgid,p,role] of [[oid,owner,'owner'],[oid,manager,'manager'],[oid,other,'manager'],
  [oid,member,'askan'],[outside,outsider,'owner']])
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at) VALUES($1,$2,$3,'active',now())",
   [orgid,p,role]);
 const camp=(await pool.query(
  "INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Handoffs QA','active') RETURNING id",[oid])).rows[0].id;
 for(const u of [owner,manager,other,member])
  await pool.query('INSERT INTO cc_campaign_members(organization_id,campaign_id,subject) VALUES($1,$2,$3)',[oid,camp,u]);
 const app=express();app.use(express.json());const policy=makePlanPolicy({pool,bad});
 app.use('/api/gabbai',(req,_res,next)=>{req.userId=req.get('x-test-person')||'none';next();},policy.scoped('gabbai_pro'));
 app.use('/api/gabbai',gabbaiHandoffsRouter({pool,campaignAccess,bad,log}));
 app.use((err,_req,res,_next)=>res.status(err.status||500).json({error:err.message}));
 const server=await new Promise(done=>{const s=app.listen(0,'127.0.0.1',()=>done(s));});
 async function req(person,method='GET',path='/campaigns/'+camp+'/handoffs',data){
  const res=await fetch('http://127.0.0.1:'+server.address().port+'/api/gabbai'+path,{
   method,headers:{'x-test-person':person,...(data?{'content-type':'application/json'}:{})},
   ...(data?{body:JSON.stringify(data)}:{})});
  return {status:res.status,data:await res.json()};
 }
 try{
  assert.equal((await req(owner)).status,403,'Requires a live Gabbai Pro grant');
  await pool.query(
   "INSERT INTO cc_plan_entitlements(organization_id,plan_code,provision_reference,provisioned_by)"+
   " VALUES($1,'gabbai_pro','approved-test-ops-20261018','CI-operator')",[oid]);
  assert.equal((await req(outsider)).status,404,'Other tenants cannot see campaign');
  assert.equal((await req(member)).status,403,'Only organization managers can use Gabbai Handoffs');
  let r=await req(owner,'POST','/campaigns/'+camp+'/handoffs',{
   title:'Prepare next shift',instructions:'Contact the local coordinator',assignedTo:manager});
  assert.equal(r.status,201);
  const id=r.data.id;assert.equal(r.data.status,'open');
  assert.equal((await req(owner,'GET','/campaigns/'+camp+'/handoffs')).data.handoffs.length,1);
  assert.equal((await req(manager,'GET','/campaigns/'+camp+'/handoffs?filter=mine')).data.handoffs.length,1);
  assert.equal((await req(other,'GET','/campaigns/'+camp+'/handoffs?filter=mine')).data.handoffs.length,0);
  assert.equal((await req(other,'POST','/campaigns/'+camp+'/handoffs/'+id+'/action',{action:'accepted'})).status,403);
  assert.equal((await req(manager,'POST','/campaigns/'+camp+'/handoffs/'+id+'/action',{action:'completed'})).status,409);
  assert.equal((await req(manager,'POST','/campaigns/'+camp+'/handoffs/'+id+'/action',{action:'accepted'})).status,200);
  assert.equal((await req(manager,'POST','/campaigns/'+camp+'/handoffs/'+id+'/action',{action:'accepted'})).data.unchanged,true);
  assert.equal((await req(manager,'POST','/campaigns/'+camp+'/handoffs/'+id+'/action',{action:'completed',note:'Shift prepared'})).status,200);
  const done=await req(owner,'GET','/campaigns/'+camp+'/handoffs?filter=completed');
  assert.equal(done.data.handoffs.length,1);
  assert.deepEqual(done.data.history.map(e=>e.action).sort(),['accepted','completed','created'].sort());
  assert.equal((await req(manager,'POST','/campaigns/'+camp+'/handoffs/'+id+'/action',{action:'completed'})).data.unchanged,true);
  assert.equal((await req(owner,'POST','/campaigns/'+camp+'/handoffs',{title:'Outsider',assignedTo:outsider})).status,404);
  const history=await pool.query("SELECT id FROM cc_gabbai_shift_handoff_history WHERE handoff_id=$1",[id]);
  assert.equal(history.rowCount,3,'Idempotent retries never add history');
  await assert.rejects(pool.query('DELETE FROM cc_gabbai_shift_handoff_history WHERE id=$1',[history.rows[0].id]),/append-only/);
  await pool.query("UPDATE cc_memberships SET membership_status='revoked' WHERE organization_id=$1 AND subject=$2",[oid,manager]);
  assert.equal((await req(manager)).status,404);
  await pool.query("UPDATE cc_plan_entitlements SET status='suspended' WHERE organization_id=$1",[oid]);
  assert.equal((await req(owner)).status,403);
  assert.equal((await pool.query('SELECT COUNT(*)::int n FROM cc_gabbai_shift_handoffs WHERE organization_id=$1',[oid])).rows[0].n,1);
 }finally{await new Promise(resolve=>server.close(resolve));await pool.end();}
});
