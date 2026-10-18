import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import pg from 'pg';
import express from 'express';
import quickDailyRouter,{nyDay} from '../server/quick-daily.js';
import {makePlanPolicy} from '../server/plan-policy.js';
const conn=process.env.TEST_DATABASE_URL;
if(!conn||!['localhost','127.0.0.1'].includes(new URL(conn).hostname))
 throw Error('Daily Focus CI refuses remote/production DB');
const pool=new pg.Pool({connectionString:conn,max:5});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const log=(db,org,camp,actor,event,id,details)=>db.query(
 'INSERT INTO cc_activity_events(organization_id,campaign_id,actor_subject,event_type,target_id,details) VALUES($1,$2,$3,$4,$5,$6)',
 [org,camp,actor,event,id,JSON.stringify(details||{})]);
async function campaignAccess(db,id,who){
 const r=await db.query(
  "SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m ON m.organization_id=c.organization_id"+
  " AND m.subject=$2 AND m.membership_status='active' WHERE c.id=$1",[id,who]);
 if(!r.rowCount)throw bad(404,'Campaign not found');
 const c=r.rows[0];
 if(!['owner','manager','finance','auditor'].includes(c.role)){
  const allowed=await db.query(
   "SELECT 1 FROM cc_campaign_members WHERE campaign_id=$1 AND subject=$2",[id,who]);
  if(!allowed.rowCount)throw bad(404,'Campaign not found');
 }
 return c;
}
test('Chesed Quick real Watch and immutable private memory respects roles and tenants',async()=>{
 for(const file of ['001_core.sql','002_team_connect.sql','013_campaign_goals.sql','026_server_plan_entitlements.sql','027_quick_daily_watch_memory.sql'])
  await pool.query(await readFile(join(import.meta.dirname,'../db',file),'utf8'));
 const marker='daily-quick-ci-'+Date.now();
 const owner=marker+'owner',a=marker+'askA',b=marker+'askB',leader=marker+'leader',foreign=marker+'foreign';
 const org=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Quick QA',$1) RETURNING id",[owner])).rows[0].id;
 const other=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Other QA',$1) RETURNING id",[foreign])).rows[0].id;
 for(const [oid,u,role] of [[org,owner,'owner'],[org,a,'askan'],[org,b,'askan'],[org,leader,'squad_leader'],[other,foreign,'owner']])
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at) VALUES($1,$2,$3,'active',now())",[oid,u,role]);
 const campaign=(await pool.query("INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Quick Test','active') RETURNING id",[org])).rows[0].id;
 const otherCampaign=(await pool.query("INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Other Campaign','active') RETURNING id",[other])).rows[0].id;
 for(const [u,team] of [[a,'A'],[b,'B'],[leader,'A']])
  await pool.query("INSERT INTO cc_campaign_members(organization_id,campaign_id,subject,team_name) VALUES($1,$2,$3,$4)",[org,campaign,u,team]);
 const task=async(who,title,priority,hrs,step='open')=>{
  return (await pool.query(
   'INSERT INTO cc_assignments(organization_id,campaign_id,assignee_subject,title,priority,status,due_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
   [org,campaign,who,title,priority,step,new Date(Date.now()+hrs*3600000).toISOString()])).rows[0].id;
 };
 const overdue=await task(a,'A OVERDUE','critical',-10);
 await task(a,'A SOON','normal',12);
 await task(b,'B OVERDUE','critical',-12);
 await task(b,'B DONE','high',-12,'done');
 const goal=(await pool.query(
  "INSERT INTO cc_goals(organization_id,campaign_id,title,target_value,created_by,status) VALUES($1,$2,'Urgent goal',100,$3,'at_risk') RETURNING id",
  [org,campaign,owner])).rows[0];
 await pool.query("INSERT INTO cc_goal_history(organization_id,campaign_id,goal_id,actor_subject,event_kind) VALUES($1,$2,$3,$4,'created')",
  [org,campaign,goal.id,owner]);
 await pool.query(
  "INSERT INTO cc_activity_events(organization_id,campaign_id,actor_subject,event_type,details) VALUES($1,$2,$3,'task.status',$4)",
  [org,campaign,a,JSON.stringify({from:'open',to:'done'})]);
 const app=express();app.use(express.json());
 app.use('/api/quick',(req,_res,next)=>{req.userId=req.get('x-ci-user')||'unknown';next();});
 app.use('/api/quick',quickDailyRouter({pool,campaignAccess,planPolicy:makePlanPolicy({pool,bad}),bad,log}));
 app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port+'/api/quick/campaigns/';
 async function request(who,id=campaign,method='GET',path='/daily',body){
  const r=await fetch(base+id+path,{method,headers:{'x-ci-user':who,...(body?{'content-type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};
 }
 try{
  assert.match(nyDay(),/^\d{4}-\d{2}-\d{2}$/);
  assert.equal((await request(foreign)).status,404);
  assert.equal((await request(a,otherCampaign)).status,404);
  const own=await request(a);assert.equal(own.status,200);
  assert.equal(own.data.stats.open_tasks,2,'Askan sees own open assignments only');
  assert.equal(own.data.stats.overdue_tasks,1);
  assert.equal(own.data.stats.due_soon_tasks,1);
  assert.equal(own.data.stats.completed_today,1);
  assert.equal(own.data.stats.goal_warnings,1);
  assert.ok(own.data.watch.some(v=>v.kind==='overdue'));
  assert.equal(own.data.watchIsOnDemand,true);
  const someoneElse=await request(b);
  assert.equal(someoneElse.data.stats.open_tasks,1,'Cannot see other team');
  const captain=await request(leader);
  assert.equal(captain.data.stats.open_tasks,2,'Squad leader sees only team A');
  const manager=await request(owner);
  assert.equal(manager.data.stats.open_tasks,3,'Owner sees both teams');
  assert.equal((await request(a,campaign,'POST','/daily/review',{reflection:[] })).status,400);
  assert.equal((await request(a,campaign,'POST','/daily/review',{reflection:'X'.repeat(501)})).status,400);
  const saved=await request(a,campaign,'POST','/daily/review',{reflection:'My private day'});
  assert.equal(saved.status,201);
  assert.equal(saved.data.review.reflection,'My private day');
  assert.equal(saved.data.review.open_tasks,2);
  const repeated=await request(a,campaign,'POST','/daily/review',{reflection:'Should not override'});
  assert.equal(repeated.status,200);assert.equal(repeated.data.alreadySaved,true);
  assert.equal(repeated.data.review.reflection,'My private day');
  const after=await request(a);
  assert.equal(after.data.reviews.length,1);
  assert.equal(after.data.todaySaved,true);
  assert.equal((await request(owner)).data.reviews.length,0,'Owner cannot read employee personal diary');
  assert.equal((await request(b)).data.reviews.length,0,'Coworker cannot read diary');
  const rows=await pool.query('SELECT id FROM cc_quick_daily_reviews WHERE author_subject=$1 AND campaign_id=$2',[a,campaign]);
  assert.equal(rows.rowCount,1);
  await assert.rejects(pool.query("UPDATE cc_quick_daily_reviews SET reflection='Tamper' WHERE id=$1",[rows.rows[0].id]),/append-only/);
  const events=await pool.query("SELECT details FROM cc_activity_events WHERE event_type='quick.daily_review_saved' AND organization_id=$1",[org]);
  assert.equal(events.rowCount,1);
  assert.doesNotMatch(JSON.stringify(events.rows),/My private day/);
  await pool.query("UPDATE cc_memberships SET membership_status='revoked' WHERE organization_id=$1 AND subject=$2",[org,a]);
  assert.equal((await request(a)).status,404);
  assert.equal((await request(a,campaign,'POST','/daily/review',{reflection:''})).status,404);
 }finally{await new Promise(resolve=>server.close(resolve));await pool.end();}
});
