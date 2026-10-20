import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import express from 'express';
import pg from 'pg';
import quickDailyRouter from '../server/quick-daily.js';
import {makePlanPolicy} from '../server/plan-policy.js';

const uri=process.env.TEST_DATABASE_URL;
if(!uri||!['localhost','127.0.0.1'].includes(new URL(uri).hostname)||
 !new URL(uri).pathname.startsWith('/campaign_qa'))
 throw Error('Only disposable CI PostgreSQL supports Focus acceptance tests');
const pool=new pg.Pool({connectionString:uri,max:4});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const log=async()=>{};
async function campaignAccess(db,cid,who){
 const r=await db.query("SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m"+
  " ON m.organization_id=c.organization_id AND m.subject=$2 AND m.membership_status='active'"+
  " WHERE c.id=$1",[cid,who]);
 if(!r.rowCount)throw bad(404,'Campaign not found');
 const c=r.rows[0];
 if(!['owner','manager','finance','auditor'].includes(c.role)){
  const joined=await db.query(
   'SELECT 1 FROM cc_campaign_members WHERE organization_id=$1 AND campaign_id=$2 AND subject=$3',
   [c.organization_id,c.id,who]);
  if(!joined.rowCount)throw bad(404,'Campaign not found');
 }
 return c;
}
test('Quick Focus picks the oldest overdue priority across 260+ tasks, without other-team leak',async()=>{
 for(const file of ['001_core.sql','002_team_connect.sql','026_server_plan_entitlements.sql']){
  await pool.query(await readFile(join(import.meta.dirname,'../db',file),'utf8'));
 }
 const stamp='focus-ci-'+Date.now()+'-'+Math.random().toString(36).slice(2);
 const owner=stamp+'owner',a=stamp+'a',b=stamp+'b',mate=stamp+'mate',
  captain=stamp+'captain',emptyCaptain=stamp+'emptyCaptain',foreign=stamp+'foreign';
 const org=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Focus big QA',$1) RETURNING id",
  [owner])).rows[0].id;
 const others=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Other charity',$1) RETURNING id",
  [foreign])).rows[0].id;
 for(const [oid,who,role] of [
  [org,owner,'owner'],[org,a,'askan'],[org,b,'askan'],[org,mate,'askan'],
  [org,captain,'squad_leader'],[org,emptyCaptain,'squad_leader'],
  [others,foreign,'owner']
 ]){
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at)"+
   " VALUES($1,$2,$3,'active',now())",[oid,who,role]);
 }
 const cid=(await pool.query(
  "INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'All tasks case','active') RETURNING id",
  [org])).rows[0].id;
 for(const [who,team] of [[a,'A'],[b,'B'],[mate,'A'],[captain,'A'],[emptyCaptain,'']]){
  await pool.query(
   "INSERT INTO cc_campaign_members(organization_id,campaign_id,subject,team_name)"+
   " VALUES($1,$2,$3,$4)",[org,cid,who,team]);
 }
 await pool.query(
  "INSERT INTO cc_assignments(organization_id,campaign_id,assignee_subject,title,priority,"+
  "status,created_at) SELECT $1,$2,$3,'Ordinary '||gs::text,'normal','open',now()"+
  " FROM generate_series(1,260) gs",[org,cid,a]);
 const overdueA=(await pool.query(
  "INSERT INTO cc_assignments(organization_id,campaign_id,assignee_subject,title,priority,status,"+
  " due_at,created_at) VALUES($1,$2,$3,'Oldest A critical deadline','critical','open',"+
  "now()-interval '2 days',now()-interval '45 days') RETURNING id",
  [org,cid,a])).rows[0].id;
 await pool.query(
  "INSERT INTO cc_assignments(organization_id,campaign_id,assignee_subject,title,priority,status,due_at)"+
  " VALUES($1,$2,$3,'B private critical deadline','critical','open',now()-interval '5 days')",
  [org,cid,b]);
 await pool.query(
  "INSERT INTO cc_assignments(organization_id,campaign_id,assignee_subject,title,priority,status)"+
  " VALUES($1,$2,$3,'A teammate first response','high','open')",
  [org,cid,mate]);
 const app=express();app.use(express.json());
 app.use('/api/quick',(req,_res,next)=>{req.userId=req.get('x-qa-user')||'';next();},
  quickDailyRouter({pool,campaignAccess,planPolicy:makePlanPolicy({pool,bad}),bad,log}));
 app.use((err,_req,res,_next)=>res.status(err.status||500).json({error:err.message}));
 const server=await new Promise(resolve=>{const srv=app.listen(0,'127.0.0.1',()=>resolve(srv));});
 const call=async(who,id=cid)=>{
  const response=await fetch('http://127.0.0.1:'+server.address().port+
   '/api/quick/campaigns/'+id+'/focus',{headers:{'x-qa-user':who}});
  return {status:response.status,data:await response.json(),
   cache:response.headers.get('cache-control')};
 };
 try{
  assert.equal((await call(foreign)).status,404);
  const worker=await call(a);
  assert.equal(worker.status,200,JSON.stringify(worker.data));
  assert.equal(worker.data.visibleOpenTaskCount,261);
  assert.equal(worker.data.ownOpenTaskCount,261);
  assert.equal(worker.data.chosenScope,'personal');
  assert.equal(worker.data.allVisibleTasksConsidered,true);
  assert.equal(worker.data.tasks.length,3);
  assert.equal(worker.data.tasks[0].id,overdueA,
   'Must find oldest high priority even though 200 newest tasks hide it');
  assert.equal(JSON.stringify(worker.data).includes('B private'),false);
  assert.match(worker.cache,/no-store/);
  const ownerBoard=await call(owner);
  assert.equal(ownerBoard.data.visibleOpenTaskCount,263);
  assert.equal(ownerBoard.data.ownOpenTaskCount,0);
  assert.equal(ownerBoard.data.chosenScope,'permitted_campaign_or_team');
  assert.equal(ownerBoard.data.tasks[0].title,'B private critical deadline');
  const captainBoard=await call(captain);
  assert.equal(captainBoard.status,200);
  assert.equal(captainBoard.data.visibleOpenTaskCount,262);
  assert.equal(captainBoard.data.tasks[0].id,overdueA);
  assert.equal(JSON.stringify(captainBoard.data).includes('B private'),false);
  const empty=await call(emptyCaptain);
  assert.equal(empty.status,200);
  assert.equal(empty.data.visibleOpenTaskCount,0,
   'Blank team must never inherit arbitrary unassigned/team A tasks');
  assert.deepEqual(empty.data.tasks,[]);
  const bBoard=await call(b);
  assert.equal(bBoard.data.visibleOpenTaskCount,1);
  assert.equal(bBoard.data.tasks[0].title,'B private critical deadline');
  await pool.query("UPDATE cc_assignments SET status='done' WHERE id=$1",[overdueA]);
  const updated=await call(a);
  assert.equal(updated.data.visibleOpenTaskCount,260);
  assert.notEqual(updated.data.tasks[0].id,overdueA);
  await pool.query("UPDATE cc_memberships SET membership_status='revoked'"+
   " WHERE organization_id=$1 AND subject=$2",[org,a]);
  assert.equal((await call(a)).status,404);
 }finally{await new Promise(done=>server.close(done));await pool.end();}
});
