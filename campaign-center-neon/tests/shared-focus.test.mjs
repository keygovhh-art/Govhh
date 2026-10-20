import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import pg from 'pg';
import express from 'express';
import sharedFocusRouter from '../server/shared-focus.js';
import {makePlanPolicy} from '../server/plan-policy.js';

const url=process.env.TEST_DATABASE_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname)||new URL(url).pathname!=='/campaign_qa')
 throw Error('Shared Focus test refuses non-disposable PostgreSQL');
const pool=new pg.Pool({connectionString:url,max:5});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const log=(db,org,cid,actor,event,target,details={})=>db.query(
 'INSERT INTO cc_activity_events(organization_id,campaign_id,actor_subject,event_type,target_id,details)'+
 ' VALUES($1,$2,$3,$4,$5,$6)',[org,cid,actor,event,target,JSON.stringify(details)]);
async function campaignAccess(db,cid,who){
 if(!uuid(cid))throw bad(400,'Invalid campaign');
 const found=await db.query("SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m"+
  " ON m.organization_id=c.organization_id AND m.subject=$2 AND m.membership_status='active'"+
  " WHERE c.id=$1",[cid,who]);
 if(!found.rowCount)throw bad(404,'Campaign not found');
 const c=found.rows[0];
 if(!['owner','manager','finance','auditor'].includes(c.role)){
  const check=await db.query('SELECT 1 FROM cc_campaign_members WHERE organization_id=$1 AND campaign_id=$2 AND subject=$3',
   [c.organization_id,c.id,who]);
  if(!check.rowCount)throw bad(404,'Campaign not found');
 }
 return c;
}
test('Shared Focus is team-scoped, human-curated, versioned and append-only across six plan tiers',async()=>{
 for(const file of ['001_core.sql','002_team_connect.sql','026_server_plan_entitlements.sql']){
  await pool.query(await readFile(join(import.meta.dirname,'../db',file),'utf8'));
 }
 const exists=await pool.query("SELECT to_regclass('public.cc_shared_focus_boards') name");
 if(!exists.rows[0].name)
  await pool.query(await readFile(join(import.meta.dirname,'../db/038_shared_focus_board.sql'),'utf8'));
 const salt='shared-focus-'+Date.now()+'-'+Math.random().toString(36).slice(2);
 const owner=salt+'-owner',manager=salt+'-manager',captain=salt+'-captain',
  worker=salt+'-worker',other=salt+'-other',outsider=salt+'-outside',empty=salt+'-empty';
 const org=(await pool.query(
  "INSERT INTO cc_organizations(name,owner_subject) VALUES($1,$2) RETURNING id",
  ['TeamFocusQA',owner])).rows[0].id;
 const foreign=(await pool.query(
  "INSERT INTO cc_organizations(name,owner_subject) VALUES($1,$2) RETURNING id",
  ['ForeignTeamFocusQA',outsider])).rows[0].id;
 for(const [oid,who,role] of [
  [org,owner,'owner'],[org,manager,'manager'],[org,captain,'squad_leader'],
  [org,worker,'askan'],[org,other,'askan'],[org,empty,'squad_leader'],
  [foreign,outsider,'owner']
 ]){
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at)"+
   " VALUES($1,$2,$3,'active',now())",[oid,who,role]);
 }
 const camp=(await pool.query(
  "INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Team Focus Test','active') RETURNING id",
  [org])).rows[0].id;
 const foreignCamp=(await pool.query(
  "INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Secret','active') RETURNING id",
  [foreign])).rows[0].id;
 for(const [who,team] of [[worker,'A'],[captain,'A'],[other,'B'],[empty,'']]){
  await pool.query("INSERT INTO cc_campaign_members(organization_id,campaign_id,subject,team_name)"+
   " VALUES($1,$2,$3,$4)",[org,camp,who,team]);
 }
 const ids={};
 for(const [key,person,title] of [['a',worker,'A worker appointment'],['ca',captain,'A captain followup'],
   ['b',other,'B private task'],['completed',worker,'Completed A item']]){
  ids[key]=(await pool.query(
   "INSERT INTO cc_assignments(organization_id,campaign_id,assignee_subject,title,status,priority)"+
   " VALUES($1,$2,$3,$4,$5,'critical') RETURNING id",
   [org,camp,person,title,key==='completed'?'done':'open'])).rows[0].id;
 }
 const app=express();app.use(express.json());
 app.use('/api/quick',(req,_res,next)=>{req.userId=req.get('x-ci-user')||'';next();},
   sharedFocusRouter({pool,campaignAccess,planPolicy:makePlanPolicy({pool,bad}),bad,uuid,log}));
 app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));
 const server=await new Promise(done=>{const s=app.listen(0,'127.0.0.1',()=>done(s));});
 const prefix='http://127.0.0.1:'+server.address().port+'/api/quick/campaigns/'+camp+'/shared-focus';
 const call=async(who,method='GET',path='',body)=>{
  const res=await fetch(prefix+path,{
   method,headers:{'x-ci-user':who,...(body?{'content-type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {status:res.status,data:await res.json(),cache:res.headers.get('cache-control')};
 };
 try{
  assert.equal((await call(outsider)).status,404);
  assert.equal((await call(worker,'PUT','',{taskIds:[ids.a],expectedVersion:0})).status,403);
  assert.equal((await call(empty)).status,403,'Blank squad must not see other teams');
  assert.equal((await call(worker,'GET','?team=B')).status,403);
  const noBoard=await call(owner);
  assert.equal(noBoard.status,200,JSON.stringify(noBoard.data));
  assert.equal(noBoard.data.version,0);
  assert.ok(noBoard.data.availableTeams.includes('A'));
  assert.ok(noBoard.data.availableTeams.includes('B'));
  assert.equal((await call(owner,'PUT','',{taskIds:[ids.a,ids.a],expectedVersion:0})).status,400);
  assert.equal((await call(owner,'PUT','',{taskIds:[ids.completed],expectedVersion:0})).status,400);
  const created=await call(owner,'PUT','',{taskIds:[ids.a,ids.b],expectedVersion:0});
  assert.equal(created.status,200,JSON.stringify(created.data));
  assert.equal(created.data.version,1);
  assert.equal(created.data.tasks.length,2);
  assert.match(created.cache,/no-store/);
  assert.equal((await call(owner,'PUT','',{taskIds:[ids.a],expectedVersion:0})).status,409);
  assert.equal((await call(manager,'PUT','',{taskIds:[ids.b],expectedVersion:1})).status,200);
  assert.equal((await call(owner)).data.history.length,2);
  const workerOnA=await call(worker);
  assert.equal(workerOnA.status,200);
  assert.equal(workerOnA.data.team,'A');
  assert.equal(workerOnA.data.version,0);
  assert.equal((await call(worker,'GET','/candidates')).status,403);
  const managerA=await call(manager,'PUT','',{team:'A',taskIds:[ids.a,ids.ca],expectedVersion:0});
  assert.equal(managerA.status,200,JSON.stringify(managerA.data));
  assert.equal(managerA.data.version,1);
  const workerBoard=await call(worker);
  assert.equal(workerBoard.data.tasks.length,1,'Worker cannot see captain personal assignment');
  assert.equal(workerBoard.data.tasks[0].id,ids.a);
  assert.equal(JSON.stringify(workerBoard.data).includes('A captain followup'),false);
  assert.equal(workerBoard.data.history,undefined,'Worker audit is private to authorized captains/managers');
  const captainBoard=await call(captain);
  assert.equal(captainBoard.status,200);
  assert.equal(captainBoard.data.tasks.length,2);
  assert.equal(captainBoard.data.editable,true);
  assert.equal((await call(captain,'PUT','',{team:'B',taskIds:[ids.b],expectedVersion:0})).status,403);
  assert.equal((await call(captain,'PUT','',{taskIds:[ids.b],expectedVersion:1})).status,400);
  assert.equal((await call(captain,'PUT','',{taskIds:[ids.a,ids.completed],expectedVersion:1})).status,400);
  const aCandidates=await call(captain,'GET','/candidates?q=appointment');
  assert.equal(aCandidates.status,200);
  assert.equal(aCandidates.data.candidates.length,1);
  assert.equal(aCandidates.data.candidates[0].id,ids.a);
  assert.equal((await call(captain,'GET','/candidates?team=B')).status,403);
  assert.equal((await call(manager,'PUT','',{team:'A',taskIds:[ids.a],expectedVersion:1})).status,200);
  assert.equal((await call(captain,'PUT','',{taskIds:[],expectedVersion:1})).status,409);
  const boardId=(await pool.query(
   "SELECT id FROM cc_shared_focus_boards WHERE organization_id=$1 AND campaign_id=$2 AND team_name='A'",
   [org,camp])).rows[0].id;
  await assert.rejects(pool.query(
    "DELETE FROM cc_shared_focus_history WHERE board_id=$1",[boardId]),/append-only/i);
  const events=await pool.query(
   "SELECT actor_subject,version FROM cc_shared_focus_history WHERE board_id=$1 ORDER BY version",
   [boardId]);
  assert.deepEqual(events.rows.map(x=>x.version),[1,2]);
  assert.deepEqual(events.rows.map(x=>x.actor_subject),[manager,manager]);
  await pool.query("UPDATE cc_memberships SET membership_status='revoked' WHERE organization_id=$1 AND subject=$2",
   [org,worker]);
  assert.equal((await call(worker)).status,404);
  await pool.query("UPDATE cc_campaigns SET status='closed' WHERE id=$1",[camp]);
  assert.equal((await call(manager,'PUT','',{team:'A',taskIds:[],expectedVersion:2})).status,409);
  assert.equal((await call(owner,'GET','?team=A')).status,200,'Read history after closure');
  assert.equal(foreignCamp.length,36);
 }finally{await new Promise(done=>server.close(done));await pool.end();}
});
