import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import express from 'express';
import pg from 'pg';
import organizationPortfolioRouter from '../server/organization-portfolio.js';
const dbUrl=process.env.TEST_DATABASE_URL;
if(!dbUrl||!['127.0.0.1','localhost'].includes(new URL(dbUrl).hostname))
 throw Error('Organization portfolio acceptance refuses nonlocal/production PostgreSQL');
const pool=new pg.Pool({connectionString:dbUrl,max:4});
const bad=(status,msg)=>Object.assign(new Error(msg),{status});
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const trim=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
const log=(db,org,camp,user,type,id,details)=>db.query('INSERT INTO cc_activity_events(organization_id,campaign_id,actor_subject,event_type,target_id,details) VALUES($1,$2,$3,$4,$5,$6)',[org,camp,user,type,id,JSON.stringify(details||{})]);
test('Organization portfolio is workspace-leadership-only, no donor leak, currency-safe and exact',async()=>{
 for(const file of ['001_core.sql','002_team_connect.sql','022_organization_leadership_decisions.sql'])
  await pool.query(await readFile(join(import.meta.dirname,'../db',file),'utf8'));
 const id='portfolio-ci-'+Date.now(),owner=id+'owner',manager=id+'manager',worker=id+'worker',outside=id+'outside';
 const org=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Portfolio QA',$1) RETURNING id",[owner])).rows[0].id;
 const foreign=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Another organization',$1) RETURNING id",[outside])).rows[0].id;
 for(const [o,user,role] of [[org,owner,'owner'],[org,manager,'manager'],[org,worker,'askan'],[foreign,outside,'owner']])
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at) VALUES($1,$2,$3,'active',now())",[o,user,role]);
 const mk=async(orgId,title,cur,goal)=>(await pool.query(
  "INSERT INTO cc_campaigns(organization_id,title,currency,goal_amount,status) VALUES($1,$2,$3,$4,'active') RETURNING id",
  [orgId,title,cur,goal])).rows[0].id;
 const a=await mk(org,'USD campaign','USD','1000'),b=await mk(org,'UK campaign','GBP','500'),foreignCamp=await mk(foreign,'Outside private campaign','USD','3000');
 await pool.query('INSERT INTO cc_campaign_members(organization_id,campaign_id,subject) VALUES($1,$2,$3)',[org,a,worker]);
 await pool.query("INSERT INTO cc_assignments(organization_id,campaign_id,assignee_subject,title,status,due_at) VALUES($1,$2,$3,'Private donor notes should not escape','open','2026-01-01T10:00:00Z')",
  [org,a,worker]);
 for(const [camp,person,amount,kind,key] of [[a,worker,'100','pledge','p'],[a,worker,'40','receipt','r'],[a,worker,'10','refund','f'],[b,owner,'60','pledge','b']])
  await pool.query("INSERT INTO cc_finance_events(organization_id,campaign_id,credited_member_subject,source_system,source_event_key,event_kind,amount) VALUES($1,$2,$3,'portfolio-qa',$4,$5,$6)",
   [org,camp,person,id+key,kind,amount]);
 await pool.query("INSERT INTO cc_contacts(organization_id,campaign_id,created_by,display_name,phone,notes,privacy) VALUES($1,$2,$3,'SECRET DONOR 100','5559991111','SECRET DONOR NOTES','private')",[org,a,worker]);
 const app=express();
 app.use('/api/organization',(req,_res,next)=>{req.userId=req.get('x-member')||'anonymous';next();});
 app.use('/api/organization',organizationPortfolioRouter({pool,bad,uuid,trim,log}));
 app.use((err,_req,res,_next)=>res.status(err.status||500).json({error:err.message}));
 const server=await new Promise(done=>{const srv=app.listen(0,'127.0.0.1',()=>done(srv));});
 async function get(who,oid){
  const resp=await fetch('http://127.0.0.1:'+server.address().port+'/api/organization/organizations/'+oid+'/portfolio',{headers:{'x-member':who}});
  return {status:resp.status,data:await resp.json()};
 }
 try{
  assert.equal((await get(worker,org)).status,403);
  assert.equal((await get(outside,org)).status,404);
  assert.equal((await get(owner,foreign)).status,404);
  const result=await get(owner,org);assert.equal(result.status,200);
  assert.equal(result.data.totalCampaigns,2);
  assert.equal(result.data.campaigns.length,2);
  assert.equal(result.data.currencies.length,2);
  const usd=result.data.currencies.find(x=>x.currency==='USD');
  const gbp=result.data.currencies.find(x=>x.currency==='GBP');
  assert.equal(usd.goal,'1000.00');
  assert.equal(usd.pledged,'100.00');
  assert.equal(usd.manualNet,'30.00');
  assert.equal(gbp.goal,'500.00');
  assert.equal(gbp.pledged,'60.00');
  const first=result.data.campaigns.find(x=>x.id===a);
  assert.equal(first.open_tasks,1);
  assert.equal(first.overdue_tasks,1);
  assert.equal(first.active_members,1);
  assert.ok(!JSON.stringify(result.data).includes('SECRET DONOR'));
  assert.ok(!JSON.stringify(result.data).includes(foreignCamp));
  assert.equal((await get(manager,org)).status,200);

  async function action(who,method,path,body){
   const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/organization'+path,{
    method,headers:{'x-member':who,...(body?{'content-type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})});
   return {status:r.status,data:await r.json()};
  }
  const list='/organizations/'+org+'/decisions';
  assert.equal((await action(worker,'GET',list)).status,403);
  assert.equal((await action(outside,'GET',list)).status,404);
  const foreignAttempt=await action(owner,'POST',list,{title:'Wrong campaign',context:'',campaignId:foreignCamp});
  assert.equal(foreignAttempt.status,404,JSON.stringify(foreignAttempt.data));
  const created=await action(manager,'POST',list,{title:'Important organizational plan',context:'PRIVATE STAFF BRIEF',campaignId:a});
  assert.equal(created.status,201);
  const decisionId=created.data.id;
  assert.equal((await action(owner,'GET',list)).data.decisions.length,1);
  assert.equal((await action(worker,'POST','/decisions/'+decisionId+'/resolve',{resolution:'Illegal'})).status,403);
  const decided=await action(owner,'POST','/decisions/'+decisionId+'/resolve',{resolution:'Approve stage one'});
  assert.equal(decided.status,200);
  assert.equal((await action(manager,'POST','/decisions/'+decisionId+'/resolve',{resolution:'Rewrite'})).status,409);
  await assert.rejects(pool.query("UPDATE cc_org_leadership_decisions SET title='Modified' WHERE id=$1",[decisionId]),/Leadership decision can only advance/);
  await assert.rejects(pool.query('DELETE FROM cc_org_leadership_decisions WHERE id=$1',[decisionId]),/cannot be deleted/);
  const entries=await pool.query("SELECT details FROM cc_activity_events WHERE event_type LIKE 'organization.decision.%' AND organization_id=$1",[org]);
  assert.equal(entries.rowCount,2);
  assert.ok(!JSON.stringify(entries.rows).includes('PRIVATE STAFF BRIEF'),'Do not leak leadership context through shared audit');

  await pool.query("UPDATE cc_memberships SET membership_status='revoked' WHERE organization_id=$1 AND subject=$2",[org,manager]);
  assert.equal((await get(manager,org)).status,404);
 }finally{await new Promise(done=>server.close(done));await pool.end();}
});
