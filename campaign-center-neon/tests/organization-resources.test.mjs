import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import express from 'express';
import pg from 'pg';
import organizationResourcesRouter from '../server/organization-resources.js';

const url=process.env.TEST_DATABASE_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname))
 throw Error('Resource allocation tests can run ONLY against disposable localhost PostgreSQL');
const pool=new pg.Pool({connectionString:url,max:6});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(x);
const log=(db,org,camp,actor,type,id,details)=>db.query(
 'INSERT INTO cc_activity_events(organization_id,campaign_id,actor_subject,event_type,target_id,details) VALUES($1,$2,$3,$4,$5,$6)',
 [org,camp,actor,type,id,JSON.stringify(details||{})]);

test('Organization resource pool enforces currency, monthly caps, two admins racing, privacy and immutable audit',async()=>{
 for(const file of ['001_core.sql','002_team_connect.sql','023_organization_resource_allocation.sql'])
  await pool.query(await readFile(join(import.meta.dirname,'../db',file),'utf8'));
 const marker='res-ci-'+Date.now(),owner=marker+'owner',manager=marker+'manager',member=marker+'member',outside=marker+'outside';
 const org=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Resource CI',$1) RETURNING id",[owner])).rows[0].id;
 const other=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Other CI',$1) RETURNING id",[outside])).rows[0].id;
 for(const [o,s,role] of [[org,owner,'owner'],[org,manager,'manager'],[org,member,'askan'],[other,outside,'owner']])
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at) VALUES($1,$2,$3,'active',now())",[o,s,role]);
 async function createCampaign(o,title,currency){
  return (await pool.query("INSERT INTO cc_campaigns(organization_id,title,currency,status) VALUES($1,$2,$3,'active') RETURNING id",
   [o,title,currency])).rows[0].id;
 }
 const campA=await createCampaign(org,'A USD','USD'),campB=await createCampaign(org,'B USD','USD'),
  campGBP=await createCampaign(org,'C GBP','GBP'),foreignCamp=await createCampaign(other,'Foreign USD','USD');
 const app=express();app.use(express.json());
 app.use('/api/organization',(req,_res,next)=>{req.userId=req.get('x-qa-user')||'anonymous';next();});
 app.use('/api/organization',organizationResourcesRouter({pool,bad,uuid,log}));
 app.use((err,_req,res,_next)=>res.status(err.status||500).json({error:err.message}));
 const server=await new Promise(resolve=>{const srv=app.listen(0,'127.0.0.1',()=>resolve(srv));});
 async function api(user,method,path,data){
  const result=await fetch('http://127.0.0.1:'+server.address().port+'/api/organization'+path,{
   method,headers:{'x-qa-user':user,...(data?{'content-type':'application/json'}:{})},
   ...(data?{body:JSON.stringify(data)}:{})});
  return {status:result.status,data:await result.json()};
 }
 const home='/organizations/'+org+'/resources';
 const createPool=(who,payload)=>api(who,'POST',home,payload);
 const settings={periodStart:'2026-11-01',currency:'USD',budgetTotal:'100.00',volunteerHoursTotal:10};
 const poolUpdate=(who,id,body)=>api(who,'PUT',home+'/'+id,body);
 const set=(who,id,cid,budget,hrs)=>api(who,'PUT',home+'/'+id+'/allocations/'+cid,
  {budgetAllocated:budget,volunteerHoursAllocated:hrs});
 try{
  assert.equal((await api(outside,'GET',home)).status,404);
  assert.equal((await api(member,'GET',home)).status,403);
  assert.equal((await createPool(member,settings)).status,403);
  assert.equal((await createPool(owner,{...settings,periodStart:'2026-11-13'})).status,400);
  assert.equal((await createPool(owner,{...settings,budgetTotal:'1.234'})).status,400);
  const created=await createPool(owner,settings);
  assert.equal(created.status,201);
  assert.equal(created.data.doesNotMoveMoney,true);
  const id=created.data.id;
  assert.equal((await createPool(manager,settings)).status,409);
  assert.equal((await set(owner,id,foreignCamp,'1.00',1)).status,404);
  assert.equal((await set(owner,id,campGBP,'1.00',1)).status,409);
  assert.equal((await set(member,id,campA,'1.00',1)).status,403);
  const [first,second]=await Promise.all([
   set(owner,id,campA,'80.00',8),
   set(manager,id,campB,'80.00',8)
  ]);
  assert.deepEqual([first.status,second.status].sort(),[200,409],
   'Concurrent allocators must be serialized by the pool row lock');
  const successful=first.status===200?campA:campB;
  const lost=first.status===200?campB:campA;
  const ledger=await api(owner,'GET',home);
  assert.equal(ledger.status,200);
  assert.equal(ledger.data.pools.length,1);
  assert.equal(ledger.data.pools[0].remaining_budget,'20.00');
  assert.equal(ledger.data.pools[0].remaining_hours,2);
  assert.equal(ledger.data.pools[0].allocations.length,1);
  const same=await set(manager,id,successful,'80.0',8);
  assert.equal(same.status,200);assert.equal(same.data.unchanged,true);
  assert.equal((await poolUpdate(manager,id,{budgetTotal:'70',volunteerHoursTotal:7})).status,409);
  assert.equal((await set(manager,id,lost,'20.00',2)).status,200);
  const fullyUsed=await api(owner,'GET',home);
  assert.equal(fullyUsed.data.pools[0].remaining_budget,'0.00');
  assert.equal(fullyUsed.data.pools[0].remaining_hours,0);
  assert.equal((await set(owner,id,successful,'90.00',8)).status,409);
  assert.equal((await poolUpdate(owner,id,{budgetTotal:'150.00',volunteerHoursTotal:20})).status,200);
  assert.equal((await set(owner,id,successful,'90.00',8)).status,200);
  const history=await pool.query('SELECT id,action FROM cc_org_resource_allocation_history WHERE organization_id=$1 ORDER BY created_at,id',[org]);
  assert.equal(history.rowCount,5,'Only actual state changes have historical events');
  await assert.rejects(pool.query('DELETE FROM cc_org_resource_allocation_history WHERE id=$1',[history.rows[0].id]),/append-only/);
  const finance=(await pool.query('SELECT COUNT(*)::int n FROM cc_finance_events WHERE campaign_id=$1',[campA])).rows[0].n;
  assert.equal(finance,0,'Allocating budget is not making a payment');
  await pool.query("UPDATE cc_memberships SET membership_status='revoked' WHERE organization_id=$1 AND subject=$2",[org,manager]);
  assert.equal((await api(manager,'GET',home)).status,404);
 }finally{await new Promise(done=>server.close(done));await pool.end();}
});
