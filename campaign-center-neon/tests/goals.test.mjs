import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import express from 'express';
import pg from 'pg';
import goalsRouter from '../server/goals.js';

const connection=process.env.TEST_DATABASE_URL;
if(!connection||!['localhost','127.0.0.1'].includes(new URL(connection).hostname))
 throw Error('Refusing goal tests outside disposable local PostgreSQL');
const pool=new pg.Pool({connectionString:connection,max:4});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const trim=(x,max)=>typeof x==='string'?x.trim().slice(0,max):'';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x);
const need=(role,roles)=>{if(!roles.includes(role))throw bad(403,'Forbidden');};
const log=(db,org,cid,subject,type,id)=>db.query(
 'INSERT INTO cc_activity_events(organization_id,campaign_id,actor_subject,event_type,target_id) VALUES($1,$2,$3,$4,$5)',
 [org,cid,subject,type,id]);
async function campaignAccess(db,id,subject){
 if(!uuid(id))throw bad(400,'Invalid campaign');
 const r=await db.query("SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m ON m.organization_id=c.organization_id AND m.subject=$2 AND m.membership_status='active' WHERE c.id=$1",[id,subject]);
 if(!r.rowCount)throw bad(404,'Not found');
 const c=r.rows[0];
 if(!['owner','manager','finance','auditor'].includes(c.role)){
  const member=await db.query('SELECT 1 FROM cc_campaign_members WHERE campaign_id=$1 AND subject=$2',[id,subject]);
  if(!member.rowCount)throw bad(404,'Not found');
 }
 return c;
}
test('campaign goals are tenant-scoped, role-checked, quota-bounded and append-only',async()=>{
 await pool.query(await readFile(join(import.meta.dirname,'../db/013_campaign_goals.sql'),'utf8'));
 const unique='goals-ci-'+Date.now();
 const org=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES($1,$2) RETURNING id",['CI test',unique+'owner'])).rows[0].id;
 const other=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES($1,$2) RETURNING id",['Other',unique+'other'])).rows[0].id;
 for(const [o,subject,role] of [[org,unique+'owner','owner'],[org,unique+'askan','askan'],[other,unique+'other','owner']])
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status) VALUES($1,$2,$3,'active')",[o,subject,role]);
 const camp=(await pool.query("INSERT INTO cc_campaigns(organization_id,title) VALUES($1,'Test campaign') RETURNING id",[org])).rows[0].id;
 await pool.query('INSERT INTO cc_campaign_members(organization_id,campaign_id,subject) VALUES($1,$2,$3)',[org,camp,unique+'askan']);
 const app=express();app.use(express.json());
 app.use('/api/goals',(req,_res,next)=>{req.userId=req.get('x-ci-user')||'anonymous';next();});
 app.use('/api/goals',goalsRouter({pool,campaignAccess,need,bad,trim,uuid,log}));
 app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port+'/api/goals';
 async function call(subject,path,method='GET',data){
  const response=await fetch(base+path,{method,headers:{'x-ci-user':subject,...(data?{'Content-Type':'application/json'}:{})},
   ...(data?{body:JSON.stringify(data)}:{})});
  return {status:response.status,data:await response.json()};
 }
 try {
  const owner=unique+'owner',askan=unique+'askan',outsider=unique+'other';
  assert.equal((await call(outsider,'/campaigns/'+camp)).status,404);
  assert.equal((await call(askan,'/campaigns/'+camp)).status,200);
  assert.equal((await call(askan,'/campaigns/'+camp,'POST',{title:'No rights',targetValue:'10'})).status,403);
  let goal;
  for(let i=0;i<3;i++){
   const created=await call(owner,'/campaigns/'+camp,'POST',{title:'Milestone '+i,category:'calls',targetValue:'100'});
   assert.equal(created.status,201);goal=created.data;
  }
  assert.equal((await call(owner,'/campaigns/'+camp,'POST',{title:'Fourth',targetValue:'100'})).status,409);
  assert.equal((await call(outsider,'/'+goal.id,'PATCH',{currentValue:'80'})).status,404);
  assert.equal((await call(askan,'/'+goal.id,'PATCH',{currentValue:'80'})).status,403);
  const changed=await call(owner,'/'+goal.id,'PATCH',{currentValue:'80.50',status:'at_risk'});
  assert.equal(changed.status,200);assert.equal(Number(changed.data.current_value),80.5);
  const history=await call(owner,'/'+goal.id+'/history');
  assert.equal(history.status,200);assert.equal(history.data.history.length,2);
  assert.equal((await call(askan,'/'+goal.id+'/history')).status,403);
  assert.equal((await call(owner,'/'+goal.id,'PATCH',{status:'archived'})).status,200);
  assert.equal((await call(owner,'/campaigns/'+camp,'POST',{title:'New goal',targetValue:'5'})).status,201);
  const mutation=await pool.query('SELECT id FROM cc_goal_history WHERE goal_id=$1 LIMIT 1',[goal.id]);
  await assert.rejects(pool.query('DELETE FROM cc_goal_history WHERE id=$1',[mutation.rows[0].id]),/append-only/);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  // The fixtures live only in ephemeral CI Postgres. Never call these cleanup
  // queries on production, where history must remain immutable.
  await pool.end();
 }
});
