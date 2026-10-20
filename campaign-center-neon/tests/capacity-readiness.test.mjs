import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import express from 'express';
import pg from 'pg';
import {makePlanPolicy} from '../server/plan-policy.js';
import capacityReadinessRouter from '../server/capacity-readiness.js';

const url=process.env.TEST_DATABASE_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname)||
   new URL(url).pathname!=='/campaign_qa')
 throw Error('Capacity acceptance test is limited to disposable CI PostgreSQL');
const pool=new pg.Pool({connectionString:url,max:4});
const bad=(status,message)=>Object.assign(new Error(message),{status});
test('Read-only six-plan capacity counts cover the FULL organization and cannot self-grant contracts',async()=>{
 for(const f of ['001_core.sql','013_campaign_goals.sql','026_server_plan_entitlements.sql'])
  await pool.query(await readFile(join(import.meta.dirname,'../db',f),'utf8'));
 const mark=Date.now()+'-'+Math.random().toString(36).slice(2);
 const owner='capacity-owner-'+mark,manager='capacity-manager-'+mark;
 const worker='capacity-worker-'+mark,outside='capacity-outside-'+mark;
 const org=(await pool.query(
  "INSERT INTO cc_organizations(name,owner_subject) VALUES($1,$2) RETURNING id",
  ['Capacity QA',owner])).rows[0].id;
 const foreign=(await pool.query(
  "INSERT INTO cc_organizations(name,owner_subject) VALUES($1,$2) RETURNING id",
  ['Unrelated private charity',outside])).rows[0].id;
 for(const [o,who,role] of [[org,owner,'owner'],[org,manager,'manager'],
  [org,worker,'askan'],[foreign,outside,'owner']])
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at)"+
   " VALUES($1,$2,$3,'active',now())",[o,who,role]);
 const campaigns=[];
 for(const title of ['A fundraising campaign','B fundraising campaign']){
  campaigns.push((await pool.query(
   "INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,$2,'active') RETURNING id",
   [org,title])).rows[0].id);
 }
 const third=(await pool.query(
  "INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Private third campaign','active') RETURNING id",
  [foreign])).rows[0].id;
 for(const [cid,amount,who,o] of [
  [campaigns[0],100,owner,org],[campaigns[0],200,owner,org],
  [campaigns[1],300,owner,org],[third,400,outside,foreign]])
  await pool.query(
   "INSERT INTO cc_goals(organization_id,campaign_id,title,target_value,created_by)"+
   " VALUES($1,$2,'Test goal',$3,$4)",[o,cid,amount,who]);
 const app=express();
 app.use('/api/capacity',(req,_res,next)=>{req.userId=req.get('x-user')||'';next();},
  capacityReadinessRouter({pool,planPolicy:makePlanPolicy({pool,bad}),bad}));
 app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));
 const server=await new Promise(resolve=>{
  const srv=app.listen(0,'127.0.0.1',()=>resolve(srv));
 });
 const request=async(who,o=org)=>{
  const response=await fetch('http://127.0.0.1:'+server.address().port+
    '/api/capacity/organizations/'+o+'/capacity',{headers:{'x-user':who}});
  return {status:response.status,data:await response.json(),
   cacheControl:response.headers.get('cache-control')};
 };
 try{
  assert.equal((await request(worker)).status,403,'Workers cannot see whole-org capacity');
  assert.equal((await request(outside)).status,404,'Cross-tenant capacity cannot leak');
  assert.equal((await request(owner,'not-a-uuid')).status,400);
  const base=await request(owner);
  assert.equal(base.status,200);
  assert.equal(base.data.planCode,'chesed_quick');
  assert.equal(base.data.breakdown.members.used,3);
  assert.equal(base.data.breakdown.members.limit,5);
  assert.equal(base.data.breakdown.campaigns.used,2);
  assert.equal(base.data.breakdown.goalsPerCampaign.totalAcrossCampaigns,3);
  assert.equal(base.data.contractVerified,false);
  assert.equal(base.data.billingVerified,false);
  assert.equal(base.data.selfServiceUpgradeAvailable,false);
  assert.match(base.cacheControl,/no-store/);
  await pool.query(
   "INSERT INTO cc_plan_entitlements(organization_id,plan_code,max_members,max_campaigns,max_goals,"+
   " provision_reference,provisioned_by) VALUES($1,'custom',2,1,1,$2,$3)",
   [org,'capacity-qa-reviewed-only','trusted-ci-operator']);
  const limited=await request(manager);
  assert.equal(limited.status,200);
  assert.equal(limited.data.planCode,'custom');
  assert.equal(limited.data.customCapacityGranted,true);
  assert.deepEqual(limited.data.breakdown.members,
   {used:3,limit:2,remaining:0,overLimit:true});
  assert.deepEqual(limited.data.breakdown.campaigns,
   {used:2,limit:1,remaining:0,overLimit:true});
  assert.equal(limited.data.breakdown.goalsPerCampaign.limit,1);
  assert.equal(limited.data.breakdown.goalsPerCampaign.campaignsOverLimit,1);
  assert.equal(limited.data.breakdown.goalsPerCampaign.campaignsAtLimit,1);
  assert.equal(limited.data.breakdown.goalsPerCampaign.maxObservedPerCampaign,2);
  assert.deepEqual(limited.data.breakdown.goalsPerCampaign.topTen.map(c=>c.goals),[2,1]);
  assert.equal(limited.data.contractVerified,false,
   'A trusted SQL provision reference is not proof of a signed contract');
  assert.equal(limited.data.countsCoverFullOrganization,true);
  assert.equal(limited.data.carrierActivated,false);
  assert.equal(limited.data.limitsAreServerEnforced,true);
  // Suspended grants retain data but accurately return starter capacity.
  await pool.query("UPDATE cc_plan_entitlements SET status='suspended' WHERE organization_id=$1",[org]);
  const suspended=await request(owner);
  assert.equal(suspended.status,200);
  assert.equal(suspended.data.customCapacityGranted,false);
  assert.equal(suspended.data.planCode,'chesed_quick');
  assert.equal(suspended.data.breakdown.campaigns.used,2);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  await pool.end();
 }
});
