import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import express from 'express';
import pg from 'pg';
import plusPledgesRouter from '../server/plus-pledges.js';

const connection=process.env.TEST_DATABASE_URL;
if(!connection||!['localhost','127.0.0.1'].includes(new URL(connection).hostname))
 throw Error('Refusing any nonlocal Postgres for pledge receipt tests');
const pool=new pg.Pool({connectionString:connection,max:5});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const trim=(x,n)=>typeof x==='string'?x.trim().slice(0,n):'';
const need=(r,roles)=>{if(!roles.includes(r))throw bad(403,'Forbidden');};
const log=(db,org,camp,actor,event,id,details)=>db.query(
 'INSERT INTO cc_activity_events(organization_id,campaign_id,actor_subject,event_type,target_id,details) VALUES($1,$2,$3,$4,$5,$6)',
 [org,camp,actor,event,id,JSON.stringify(details||{})]);
async function campaignAccess(db,id,user){
 if(!uuid(id))throw bad(400,'Invalid campaign');
 const r=await db.query("SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m ON m.organization_id=c.organization_id AND m.subject=$2 AND m.membership_status='active' WHERE c.id=$1",[id,user]);
 if(!r.rowCount)throw bad(404,'Campaign not found');
 const c=r.rows[0];
 if(!['owner','manager','finance','auditor'].includes(c.role)){
  const m=await db.query('SELECT 1 FROM cc_campaign_members WHERE campaign_id=$1 AND subject=$2',[id,user]);
  if(!m.rowCount)throw bad(404,'Campaign not found');
 }
 return c;
}
test('Askan Plus partial pledge payments have immutable methods, balances, retry safety and tenant authorization',async()=>{
 for(const path of ['001_core.sql','002_team_connect.sql','016_partial_pledge_receipts.sql'])
  await pool.query(await readFile(join(import.meta.dirname,'../db',path),'utf8'));
 const tag='plus-money-ci-'+Date.now();
 const owner=tag+'owner',treasurer=tag+'finance',askan=tag+'ask',outsider=tag+'foreign';
 const org=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Finance QA',$1) RETURNING id",[owner])).rows[0].id;
 const foreignOrg=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Other QA',$1) RETURNING id",[outsider])).rows[0].id;
 for(const [o,u,role] of [[org,owner,'owner'],[org,treasurer,'finance'],[org,askan,'askan'],[foreignOrg,outsider,'owner']])
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at) VALUES($1,$2,$3,'active',now())",[o,u,role]);
 const camp=(await pool.query("INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Payment Q&A','active') RETURNING id",[org])).rows[0].id;
 const otherCamp=(await pool.query("INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Other','active') RETURNING id",[foreignOrg])).rows[0].id;
 await pool.query('INSERT INTO cc_campaign_members(organization_id,campaign_id,subject) VALUES($1,$2,$3)',[org,camp,askan]);
 const pledge=(await pool.query("INSERT INTO cc_finance_events(organization_id,campaign_id,credited_member_subject,source_system,source_event_key,event_kind,amount) VALUES($1,$2,$3,'ci', $4,'pledge',1000) RETURNING id",[org,camp,askan,tag+'pledge'])).rows[0].id;
 const foreignPledge=(await pool.query("INSERT INTO cc_finance_events(organization_id,campaign_id,credited_member_subject,source_system,source_event_key,event_kind,amount) VALUES($1,$2,$3,'ci',$4,'pledge',250) RETURNING id",[foreignOrg,otherCamp,outsider,tag+'foreign'])).rows[0].id;
 const app=express();app.use(express.json());
 app.use('/api/plus',(req,_res,next)=>{req.userId=req.get('x-ci-user')||'anonymous';next();});
 app.use('/api/plus',plusPledgesRouter({pool,campaignAccess,need,bad,uuid,trim,log}));
 app.use((err,_req,res,_next)=>res.status(err.status||500).json({error:err.message}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port+'/api/plus/campaigns/'+camp+'/pledges';
 async function req(who,method,path='',data){
  const response=await fetch(base+path,{method,headers:{'x-ci-user':who,...(data?{'content-type':'application/json'}:{})},
   ...(data?{body:JSON.stringify(data)}:{})});
  return {status:response.status,data:await response.json()};
 }
 const read=who=>req(who,'GET');
 const post=(who,p,id,amt,method='cash',reference='')=>req(who,'POST','/'+p+'/partial-receipts',
  {requestId:id,amount:amt,method,reference});
 try{
  assert.equal((await read(outsider)).status,404);
  const mine=await read(askan);
  assert.equal(mine.status,200);
  assert.equal(mine.data.pledges.length,1);
  assert.equal(Number(mine.data.pledges[0].outstanding),1000);
  assert.equal((await post(askan,pledge,randomUUID(),'200')).status,403);
  assert.equal((await post(owner,foreignPledge,randomUUID(),'20')).status,404);
  assert.equal((await post(owner,pledge,randomUUID(),'20','check','')).status,400);
  const token=randomUUID();
  const first=await post(treasurer,pledge,token,'200.00','cash');
  assert.equal(first.status,201);assert.equal(first.data.providerVerified,false);
  const same=await post(treasurer,pledge,token,'200','cash');
  assert.equal(same.status,200);assert.equal(same.data.idempotent,true);
  assert.equal(same.data.id,first.data.id);
  assert.equal((await post(treasurer,pledge,token,'250','cash')).status,409);
  const check=await post(owner,pledge,randomUUID(),'300','check','CHECK-QA-317');
  assert.equal(check.status,201);
  const after=await read(askan);
  assert.equal(Number(after.data.pledges[0].manually_reported_received),500);
  assert.equal(Number(after.data.pledges[0].outstanding),500);
  assert.equal((await post(owner,pledge,randomUUID(),'501','cash')).status,409);
  const [one,two]=await Promise.all([
   post(owner,pledge,randomUUID(),'400','cash'),
   post(treasurer,pledge,randomUUID(),'400','cash')
  ]);
  assert.deepEqual([one.status,two.status].sort(),[201,409],'Pledge row lock should prevent combined overpayment');
  const last=await read(treasurer);
  assert.equal(Number(last.data.pledges[0].manually_reported_received),900);
  assert.equal(Number(last.data.pledges[0].outstanding),100);
  const verify=await pool.query(
   "SELECT r.id,r.verified_at,m.method,m.reference FROM cc_finance_events r JOIN cc_plus_manual_receipts m ON m.finance_event_id=r.id WHERE r.related_pledge_id=$1",
   [pledge]);
  assert.equal(verify.rowCount,3);
  assert.ok(verify.rows.every(row=>row.verified_at===null),'Do not fake provider verification');
  assert.ok(verify.rows.some(row=>row.method==='check'&&row.reference==='CHECK-QA-317'));
  const audit=await pool.query("SELECT COUNT(*)::int total FROM cc_activity_events WHERE campaign_id=$1 AND event_type='finance.partial_receipt_reported'",[camp]);
  assert.equal(audit.rows[0].total,3,'No duplicate audit on retries or rejected amounts');
  await assert.rejects(pool.query('DELETE FROM cc_plus_manual_receipts WHERE finance_event_id=$1',[first.data.id]),/append-only/);
 }finally{
  await new Promise(resolve=>server.close(resolve));await pool.end();
 }
});
