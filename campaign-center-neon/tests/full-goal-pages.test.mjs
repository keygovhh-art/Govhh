import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import express from 'express';
import pg from 'pg';
import goalsRouter from '../server/goals.js';
import {makePlanPolicy} from '../server/plan-policy.js';

const url=process.env.TEST_DATABASE_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Disposable local PostgreSQL only');
const pool=new pg.Pool({connectionString:url,max:3});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const uuid=s=>typeof s==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(s);
const trim=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
const need=(role,allowed)=>{if(!allowed.includes(role))throw bad(403,'Forbidden');};
const log=async()=>{};
async function campaignAccess(db,cid,user){
 if(!uuid(cid))throw bad(400,'Invalid campaign');
 const r=await db.query(
  "SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m"+
  " ON m.organization_id=c.organization_id AND m.subject=$2 AND m.membership_status='active'"+
  " WHERE c.id=$1",[cid,user]);
 if(!r.rowCount)throw bad(404,'Campaign not found');
 const c=r.rows[0];
 if(!['owner','manager','finance','auditor'].includes(c.role)){
  const exists=await db.query(
   "SELECT 1 FROM cc_campaign_members WHERE organization_id=$1 AND campaign_id=$2 AND subject=$3",
   [c.organization_id,c.id,user]);
  if(!exists.rowCount)throw bad(404,'Campaign not found');
 }
 return c;
}
test('Custom high-capacity campaign goal paging shows all 230, not truncated at old 200',async()=>{
 for(const file of ['001_core.sql','013_campaign_goals.sql','026_server_plan_entitlements.sql'])
  await pool.query(await readFile(join(import.meta.dirname,'../db',file),'utf8'));
 const tag='goal-page-'+Date.now()+'-'+Math.random().toString(36).slice(2);
 const owner=tag+'-owner',worker=tag+'-worker',other=tag+'-other';
 const org=(await pool.query(
  "INSERT INTO cc_organizations(name,owner_subject) VALUES('Goals page QA',$1) RETURNING id",
  [owner])).rows[0].id;
 const foreign=(await pool.query(
  "INSERT INTO cc_organizations(name,owner_subject) VALUES('Goals private QA',$1) RETURNING id",
  [other])).rows[0].id;
 for(const [oid,subject,role] of [[org,owner,'owner'],[org,worker,'askan'],[foreign,other,'owner']])
  await pool.query(
   "INSERT INTO cc_memberships(organization_id,subject,role,membership_status)"+
   " VALUES($1,$2,$3,'active')",[oid,subject,role]);
 const camp=(await pool.query(
  "INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Large Custom campaign','active') RETURNING id",
  [org])).rows[0].id;
 const foreignCamp=(await pool.query(
  "INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Private campaign','active') RETURNING id",
  [foreign])).rows[0].id;
 await pool.query(
  'INSERT INTO cc_campaign_members(organization_id,campaign_id,subject) VALUES($1,$2,$3)',
  [org,camp,worker]);
 await pool.query(
  "INSERT INTO cc_plan_entitlements(organization_id,plan_code,max_members,max_campaigns,max_goals,provision_reference,provisioned_by)"+
  " VALUES($1,'custom',10,3,250,'CI-only-reviewed','CI-operator')",[org]);
 await pool.query(
  "INSERT INTO cc_goals(organization_id,campaign_id,title,category,target_value,created_by)"+
  " SELECT $1,$2,'Goal '||gs::text,'calls',gs,$3 FROM generate_series(1,230) gs",
  [org,camp,owner]);
 await pool.query(
  "INSERT INTO cc_goals(organization_id,campaign_id,title,target_value,created_by,status)"+
  " VALUES($1,$2,'Archived private goal',100,$3,'archived')",[org,camp,owner]);
 await pool.query(
  "INSERT INTO cc_goals(organization_id,campaign_id,title,target_value,created_by)"+
  " VALUES($1,$2,'Foreign goal',10,$3)",[foreign,foreignCamp,other]);
 const app=express();app.use(express.json());
 app.use('/api/goals',(req,_res,next)=>{req.userId=req.get('x-user')||'';next();},
  goalsRouter({pool,campaignAccess,need,bad,trim,uuid,log,planPolicy:makePlanPolicy({pool,bad})}));
 app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}));
 const server=await new Promise(done=>{const s=app.listen(0,'127.0.0.1',()=>done(s));});
 const call=async(user,page=1,method='GET',body)=>{
  const response=await fetch('http://127.0.0.1:'+server.address().port+
   '/api/goals/campaigns/'+camp+'?page='+page,{
   method,headers:{'x-user':user,...(body?{'content-type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json(),cache:response.headers.get('cache-control')};
 };
 try{
  assert.equal((await call(other)).status,404);
  assert.equal((await call(owner,0)).status,400);
  assert.equal((await call(owner,'banana')).status,400);
  const first=await call(owner,1);
  assert.equal(first.status,200);
  assert.equal(first.data.total,230);
  assert.equal(first.data.limit,50);
  assert.equal(first.data.pageCount,5);
  assert.equal(first.data.goalLimit,250);
  assert.equal(first.data.goals.length,50);
  assert.equal(first.data.allCampaignGoalsCounted,true);
  assert.match(first.cache,/no-store/);
  let found=[];
  for(let page=1;page<=5;page++){
   const response=await call(owner,page);
   assert.equal(response.status,200);
   assert.equal(response.data.page,page);
   found.push(...response.data.goals.map(g=>g.id));
  }
  assert.equal(found.length,230);
  assert.equal(new Set(found).size,230);
  assert.equal((await call(owner,5)).data.goals.length,30);
  const workerView=await call(worker,5);
  assert.equal(workerView.status,200);
  assert.equal(workerView.data.total,230);
  assert.equal(workerView.data.goals.length,30);
  assert.equal((await call(worker,1,'POST',{title:'Not allowed',targetValue:'20'})).status,403);
  const added=await call(owner,1,'POST',{title:'Another valid Custom goal',targetValue:'150'});
  assert.equal(added.status,201,JSON.stringify(added.data));
  assert.equal((await call(owner,1)).data.total,231);
  assert.equal((await call(owner,6)).data.goals.length,0);
 }finally{await new Promise(done=>server.close(done));await pool.end();}
});
