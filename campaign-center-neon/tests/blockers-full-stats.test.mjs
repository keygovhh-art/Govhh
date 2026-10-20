import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import pg from 'pg';
import express from 'express';
import proBlockersRouter from '../server/pro-blockers.js';

const url=process.env.TEST_DATABASE_URL;
if(!url||!['127.0.0.1','localhost'].includes(new URL(url).hostname)||
 new URL(url).pathname!=='/campaign_qa')throw Error('Disposable CI Postgres required');
const pool=new pg.Pool({connectionString:url,max:5});
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(x);
const bad=(status,message)=>Object.assign(new Error(message),{status});
const trim=(x,max)=>typeof x==='string'?x.trim().slice(0,max):'';
async function campaignAccess(db,id,who){
 if(!uuid(id))throw bad(400,'Invalid campaign');
 const r=await db.query(
  "SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m ON m.organization_id=c.organization_id"+
  " AND m.subject=$2 AND m.membership_status='active' WHERE c.id=$1",[id,who]);
 if(!r.rowCount)throw bad(404,'Campaign not found');
 const c=r.rows[0];
 if(!['owner','manager','finance','auditor'].includes(c.role)){
  const m=await db.query(
   "SELECT 1 FROM cc_campaign_members WHERE organization_id=$1 AND campaign_id=$2 AND subject=$3",
   [c.organization_id,id,who]);
  if(!m.rowCount)throw bad(404,'Campaign not found');
 }
 return c;
}
const log=async()=>{};
test('Blocker intelligence counts all 258 reports, preserves group privacy and pages every entry',async()=>{
 for(const file of ['001_core.sql','002_team_connect.sql','020_askan_pro_task_blockers.sql'])
  await pool.query(await readFile(join(import.meta.dirname,'../db',file),'utf8'));
 const salt='blocks-full-'+Date.now()+'-'+Math.random().toString(36).slice(2);
 const owner=salt+'owner',worker=salt+'worker',b=salt+'workerB',
  leader=salt+'leader',foreign=salt+'foreign';
 const org=(await pool.query(
  "INSERT INTO cc_organizations(name,owner_subject) VALUES('Blocks 258',$1) RETURNING id",
  [owner])).rows[0].id;
 await pool.query(
  "INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at)"+
  " VALUES($1,$2,'owner','active',now()),($1,$3,'askan','active',now()),"+
  " ($1,$4,'askan','active',now()),($1,$5,'squad_leader','active',now())",
  [org,owner,worker,b,leader]);
 const outside=(await pool.query(
  "INSERT INTO cc_organizations(name,owner_subject) VALUES('Foreign private',$1) RETURNING id",
  [foreign])).rows[0].id;
 await pool.query(
  "INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at)"+
  " VALUES($1,$2,'owner','active',now())",[outside,foreign]);
 const camp=(await pool.query(
  "INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Campaign blocker test','active') RETURNING id",
  [org])).rows[0].id;
 for(const [who,team] of [[worker,'A'],[b,'B'],[leader,'A']])
  await pool.query(
   "INSERT INTO cc_campaign_members(organization_id,campaign_id,subject,team_name) VALUES($1,$2,$3,$4)",
   [org,camp,who,team]);
 await pool.query(
  "INSERT INTO cc_assignments(organization_id,campaign_id,assignee_subject,title)"+
  " SELECT $1,$2,$3,'Team A task '||gs::text FROM generate_series(1,257) gs",
  [org,camp,worker]);
 const bTask=(await pool.query(
  "INSERT INTO cc_assignments(organization_id,campaign_id,assignee_subject,title)"+
  " VALUES($1,$2,$3,'Secret B blocker') RETURNING id",
  [org,camp,b])).rows[0].id;
 await pool.query(
  "INSERT INTO cc_pro_task_blockers(task_id,organization_id,campaign_id,reason,details,updated_by)"+
  " SELECT t.id,$1,$2,CASE WHEN t.title LIKE '%1' THEN 'approval_needed'"+
  " ELSE 'no_response' END,'', $3 FROM cc_assignments t"+
  " WHERE t.organization_id=$1 AND t.campaign_id=$2 AND t.assignee_subject=$4",
  [org,camp,owner,worker]);
 await pool.query(
  "INSERT INTO cc_pro_task_blockers(task_id,organization_id,campaign_id,reason,details,updated_by)"+
  " VALUES($1,$2,$3,'payment_pending','Private B note',$4)",
  [bTask,org,camp,owner]);
 const some=(await pool.query(
  "SELECT task_id FROM cc_pro_task_blockers WHERE organization_id=$1 AND reason='no_response' LIMIT 1",
  [org])).rows[0].task_id;
 await pool.query(
  "INSERT INTO cc_pro_blocker_history(task_id,organization_id,campaign_id,actor_subject,reason,action)"+
  " VALUES($1,$2,$3,$4,'no_response','raised'),"+
  " ($1,$2,$3,$4,'no_response','resolved'),"+
  " ($1,$2,$3,$4,'no_response','reopened')",[some,org,camp,worker]);
 await pool.query(
  "INSERT INTO cc_pro_blocker_history(task_id,organization_id,campaign_id,actor_subject,reason,action)"+
  " VALUES($1,$2,$3,$4,'payment_pending','raised')",[bTask,org,camp,b]);
 await pool.query(
  "UPDATE cc_assignments SET status='done' WHERE id=$1",[some]);
 const app=express();app.use(express.json());
 app.use('/api/pro',(req,_res,next)=>{req.userId=req.get('x-user')||'';next();},
  proBlockersRouter({pool,campaignAccess,bad,trim,uuid,log}));
 app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}));
 const server=await new Promise(done=>{const r=app.listen(0,'127.0.0.1',()=>done(r));});
 async function call(user,path='?page=1'){
  const r=await fetch('http://127.0.0.1:'+server.address().port+
   '/api/pro/campaigns/'+camp+'/blockers'+path,{headers:{'x-user':user}});
  return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};
 }
 async function candidates(user,q){
  const r=await fetch('http://127.0.0.1:'+server.address().port+
   '/api/pro/campaigns/'+camp+'/blocker-candidates?q='+q,{headers:{'x-user':user}});
  return {status:r.status,body:await r.json()};
 }
 try{
  assert.equal((await call(foreign)).status,404);
  assert.equal((await call(owner,'?page=0')).status,400);
  assert.equal((await call(owner,'?filter=bad')).status,400);
  const first=await call(owner);
  assert.equal(first.status,200,JSON.stringify(first.body));
  assert.equal(first.body.total,258);
  assert.equal(first.body.activeTotal,257);
  assert.equal(first.body.inactiveTotal,1);
  assert.equal(first.body.pageCount,6);
  assert.equal(first.body.blockers.length,50);
  assert.equal(first.body.allVisibleBlockersCounted,true);
  assert.equal(first.body.activeByReason.payment_pending,1);
  assert.equal(first.body.changesLast30Days.raised,2);
  assert.equal(first.body.changesLast30Days.resolved,1);
  assert.equal(first.body.changesLast30Days.reopened,1);
  assert.equal(first.body.intelligenceSource,'recorded_blocker_history_not_prediction');
  assert.match(first.cache,/no-store/);
  let unique=new Set();
  for(let page=1;page<=6;page++){
   const part=await call(owner,'?page='+page);
   assert.equal(part.status,200);
   part.body.blockers.forEach(x=>unique.add(x.task_id));
  }
  assert.equal(unique.size,258);
  assert.equal((await call(owner,'?page=6')).body.blockers.length,8);
  assert.equal((await call(owner,'?filter=active')).body.filteredTotal,257);
  assert.equal((await call(owner,'?filter=inactive')).body.filteredTotal,1);
  const aView=await call(worker);
  assert.equal(aView.body.total,257);
  assert.equal(aView.body.activeTotal,256);
  assert.equal(aView.body.changesLast30Days.raised,1);
  assert.equal(JSON.stringify(aView.body).includes('Private B note'),false);
  const teamLead=await call(leader);
  assert.equal(teamLead.body.total,257);
  assert.equal(teamLead.body.changesLast30Days.raised,1);
  const bView=await call(b);
  assert.equal(bView.body.total,1);
  assert.equal(bView.body.activeByReason.payment_pending,1);
  const aCandidates=await candidates(worker,'Team%20A');
  assert.equal(aCandidates.status,200);
  assert.equal(aCandidates.body.candidates.length,50);
  assert.equal(JSON.stringify(aCandidates.body).includes('Secret B blocker'),false);
  assert.equal((await candidates(b,'Secret')).body.candidates.length,1);
  await pool.query(
   "UPDATE cc_memberships SET membership_status='revoked' WHERE organization_id=$1 AND subject=$2",
   [org,worker]);
  assert.equal((await call(worker)).status,404);
 }finally{await new Promise(done=>server.close(done));await pool.end();}
});
