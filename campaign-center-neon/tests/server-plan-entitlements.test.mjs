import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import express from 'express';
import pg from 'pg';
import {makePlanPolicy} from '../server/plan-policy.js';

const conn=process.env.TEST_DATABASE_URL;
if(!conn||!['localhost','127.0.0.1'].includes(new URL(conn).hostname))
 throw Error('Plan entitlement regression MUST use disposable local PostgreSQL');
const pool=new pg.Pool({connectionString:conn,max:8});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const policy=makePlanPolicy({pool,bad});
test('Six-tier plan enforcement: no self-upgrade, expired fallback, cross-tenant denial, bounded quotas, immutable grants',async()=>{
 for(const p of ['001_core.sql','002_team_connect.sql','026_server_plan_entitlements.sql'])
  await pool.query(await readFile(join(import.meta.dirname,'../db',p),'utf8'));
 const tag='tiers-ci-'+Date.now(),owner=tag+'owner',manager=tag+'manager',worker=tag+'worker',outside=tag+'outside';
 const org=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Entitlement QA',$1) RETURNING id",[owner])).rows[0].id;
 const other=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Different QA',$1) RETURNING id",[outside])).rows[0].id;
 for(const [o,who,role] of [[org,owner,'owner'],[org,manager,'manager'],[org,worker,'askan'],[other,outside,'owner']])
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at) VALUES($1,$2,$3,'active',now())",[o,who,role]);
 const camp=(await pool.query("INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'QA campaign','active') RETURNING id",[org])).rows[0].id;
 await pool.query('INSERT INTO cc_campaign_members(organization_id,campaign_id,subject) VALUES($1,$2,$3)',[org,camp,worker]);
 const contact=(await pool.query("INSERT INTO cc_contacts(organization_id,campaign_id,created_by,display_name,privacy) VALUES($1,$2,$3,'Donor','private') RETURNING id",[org,camp,worker])).rows[0].id;
 const app=express();app.use(express.json());
 app.use('/api/plus',(req,_res,next)=>{req.userId=req.get('x-user');next();},policy.scoped('askan_plus'),
  (req,res)=>res.json({ok:true,plan:req.planAccess.planCode}));
 app.use('/api/pro',(req,_res,next)=>{req.userId=req.get('x-user');next();},policy.scoped('askan_pro'),
  (req,res)=>res.json({ok:true,plan:req.planAccess.planCode}));
 app.use('/api/gabbai',(req,_res,next)=>{req.userId=req.get('x-user');next();},policy.scoped('gabbai_pro'),
  (req,res)=>res.json({ok:true,plan:req.planAccess.planCode}));
 app.use('/api/organization',(req,_res,next)=>{req.userId=req.get('x-user');next();},policy.scoped('organization'),
  (req,res)=>res.json({ok:true,plan:req.planAccess.planCode}));
 app.use('/api/custom',(req,_res,next)=>{req.userId=req.get('x-user');next();},policy.scoped('custom'),
  (req,res)=>res.json({ok:true,plan:req.planAccess.planCode}));
 app.use((err,_req,res,_next)=>res.status(err.status||500).json({error:err.message}));
 const server=await new Promise(done=>{const srv=app.listen(0,'127.0.0.1',()=>done(srv));});
 async function hit(user,path){
  const r=await fetch('http://127.0.0.1:'+server.address().port+path,{headers:{'x-user':user}});
  return {status:r.status,data:await r.json()};
 }
 const grant=async(code,opts={})=>{
  const data={plan:code,status:opts.status||'active',since:opts.since||'2020-01-01T00:00:00Z',
   until:opts.until||null,members:opts.members??null,goals:opts.goals??null,campaigns:opts.campaigns??null};
  await pool.query(
   "INSERT INTO cc_plan_entitlements(organization_id,plan_code,status,valid_from,valid_until,max_members,max_goals,max_campaigns,provision_reference,provisioned_by)"+
   " VALUES($1,$2,$3,$4,$5,$6,$7,$8,'verified-admin-reference-20261016','admin-out-of-band')"+
   " ON CONFLICT(organization_id) DO UPDATE SET plan_code=excluded.plan_code,status=excluded.status,valid_from=excluded.valid_from,"+
   " valid_until=excluded.valid_until,max_members=excluded.max_members,max_goals=excluded.max_goals,max_campaigns=excluded.max_campaigns,updated_at=now()",
   [org,data.plan,data.status,data.since,data.until,data.members,data.goals,data.campaigns]);
 };
 const plus='/api/plus/campaigns/'+camp+'/member-desk';
 const pro='/api/pro/contacts/'+contact+'/timeline';
 const gabbai='/api/gabbai/campaigns/'+camp+'/ledger-review';
 const orgpath='/api/organization/organizations/'+org+'/portfolio';
 const custom='/api/custom/campaigns/'+camp+'/focus-preview';
 try{
  let state=await policy.forMember(pool,org,owner);
  assert.equal(state.planCode,'chesed_quick');
  assert.deepEqual(state.limits,{members:5,goals:3,campaigns:1});
  assert.equal((await hit(owner,plus)).status,403,'No plan grant means no premium route');
  assert.equal((await hit(outside,plus)).status,404,'Other tenant cannot access private campaign');
  assert.equal((await hit(outside,'/api/organization/organizations/'+other+'/portfolio')).status,403);
  await grant('askan_plus');
  assert.equal((await hit(owner,plus)).status,200);
  assert.equal((await hit(owner,pro)).status,403);
  state=await policy.forMember(pool,org,owner);
  assert.deepEqual(state.limits,{members:5,goals:3,campaigns:1},
   'Unverified Askan Plus capacities must NOT become unlimited');
  await grant('askan_pro');
  assert.equal((await hit(owner,pro)).status,200);
  assert.equal((await hit(owner,gabbai)).status,403);
  assert.equal((await hit(owner,orgpath)).status,403);
  await grant('gabbai_pro');
  assert.equal((await hit(owner,gabbai)).status,200);
  assert.equal((await hit(owner,orgpath)).status,403);
  await grant('organization');
  assert.equal((await hit(owner,orgpath)).status,200);
  assert.equal((await hit(owner,custom)).status,403);
  await grant('custom',{members:2500,goals:600,campaigns:80});
  assert.equal((await hit(owner,custom)).status,200);
  state=await policy.forMember(pool,org,owner);
  assert.deepEqual(state.limits,{members:2500,goals:600,campaigns:80});
  assert.equal(policy.allowFeature(state,'central_yemot'),false,'Unallocated features require separate decision');
  assert.equal(policy.allowFeature(state,'contracted_capacity'),false,'Unbuilt features cannot be granted');
  assert.equal(policy.allowFeature(state,'custom_focus'),true);
  assert.equal((await hit(outside,custom)).status,404);
  assert.equal((await hit(outside,orgpath)).status,404);
  await grant('custom',{status:'suspended',members:2500});
  state=await policy.forMember(pool,org,owner);
  assert.equal(state.planCode,'chesed_quick');
  assert.equal((await hit(owner,custom)).status,403);
  await grant('custom',{until:'2023-01-01T00:00:00Z'});
  assert.equal((await policy.forMember(pool,org,owner)).planCode,'chesed_quick');
  await grant('custom',{since:'2099-01-01T00:00:00Z'});
  assert.equal((await policy.forMember(pool,org,owner)).planCode,'chesed_quick');
  await grant('chesed_quick');
  state=await policy.forMember(pool,org,owner);
  assert.equal(state.limits.campaigns,1);
  await assert.rejects(policy.checkCapacity(pool,state,org,'campaigns'),x=>x.status===409);
  await pool.query("INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Over capacity existing','active')",[org]);
  await grant('organization');
  assert.equal((await policy.forMember(pool,org,owner)).limits.campaigns,50);
  await grant('chesed_quick');
  assert.equal((await hit(owner,orgpath)).status,403);
  // Old data stays readable after a downgrade, though creating more is denied.
  const after=await pool.query('SELECT COUNT(*)::int n FROM cc_campaigns WHERE organization_id=$1',[org]);
  assert.equal(after.rows[0].n,2);
  const historical=await pool.query('SELECT id FROM cc_plan_entitlement_history WHERE organization_id=$1',[org]);
  assert.ok(historical.rowCount>=9);
  await assert.rejects(pool.query('DELETE FROM cc_plan_entitlement_history WHERE id=$1',[historical.rows[0].id]),/append-only/);
  await assert.rejects(pool.query('DELETE FROM cc_plan_entitlements WHERE organization_id=$1',[org]),/deletion is prohibited/);
  await pool.query("UPDATE cc_memberships SET membership_status='revoked' WHERE organization_id=$1 AND subject=$2",[org,manager]);
  await assert.rejects(policy.forMember(pool,org,manager),x=>x.status===404);
 }finally{await new Promise(done=>server.close(done));await pool.end();}
});
