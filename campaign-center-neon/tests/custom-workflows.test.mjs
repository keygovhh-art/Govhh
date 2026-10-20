import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import express from 'express';
import pg from 'pg';
import {makePlanPolicy} from '../server/plan-policy.js';
import customWorkflowsRouter from '../server/custom-workflows.js';

const url=process.env.TEST_DATABASE_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Local disposable PostgreSQL only');
const pool=new pg.Pool({connectionString:url,max:5});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const planPolicy=makePlanPolicy({pool,bad});
async function campaignAccess(db,id,user){
 if(!uuid(id))throw bad(400,'Invalid campaign');
 const q=await db.query(
  "SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m"+
  " ON m.organization_id=c.organization_id AND m.subject=$2 AND m.membership_status='active'"+
  " WHERE c.id=$1",[id,user]);
 if(!q.rowCount)throw bad(404,'Campaign not found');
 const c=q.rows[0];
 if(!['owner','manager','finance','auditor'].includes(c.role)){
  const cm=await db.query('SELECT 1 FROM cc_campaign_members WHERE campaign_id=$1 AND subject=$2',[id,user]);
  if(!cm.rowCount)throw bad(404,'Campaign not found');
 }
 return c;
}
const log=(db,org,campaign,actor,type,target,details={})=>db.query(
 'INSERT INTO cc_activity_events(organization_id,campaign_id,actor_subject,event_type,target_id,details)'+
 ' VALUES($1,$2,$3,$4,$5,$6)',[org,campaign,actor,type,target,JSON.stringify(details)]);
test('Custom templates and workers: tenant isolation, human progress, optimistic versioning and append-only history',async()=>{
 for(const p of ['001_core.sql','002_team_connect.sql','026_server_plan_entitlements.sql',
  '036_custom_manual_workflows.sql']){
  if(p==='036_custom_manual_workflows.sql'){
    const exists=await pool.query("SELECT to_regclass('public.cc_custom_workflow_templates') AS table_name");
    if(exists.rows[0].table_name)continue;
  }
  await pool.query(await readFile(join(import.meta.dirname,'../db',p),'utf8'));
 }
 const seed=Date.now()+'_'+Math.random().toString(36).slice(2);
 const owner='cw-owner-'+seed,worker='cw-worker-'+seed,manager='cw-manager-'+seed,
  outsider='cw-other-'+seed;
 const org=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES($1,$2) RETURNING id",['Custom Test',owner])).rows[0].id;
 const other=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES($1,$2) RETURNING id",['Other Test',outsider])).rows[0].id;
 for(const [id,subject,role] of [[org,owner,'owner'],[org,manager,'manager'],
  [org,worker,'askan'],[other,outsider,'owner']])
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at) VALUES($1,$2,$3,'active',now())",[id,subject,role]);
 const camp=(await pool.query("INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Event campaign','active') RETURNING id",[org])).rows[0].id;
 const foreign=(await pool.query("INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Private other campaign','active') RETURNING id",[other])).rows[0].id;
 await pool.query('INSERT INTO cc_campaign_members(organization_id,campaign_id,subject) VALUES($1,$2,$3)',[org,camp,worker]);
 const grant=async code=>pool.query(
  "INSERT INTO cc_plan_entitlements(organization_id,plan_code,provision_reference,provisioned_by)"+
  " VALUES($1,$2,'reviewed-integration-tests','platform-admin')"+
  " ON CONFLICT(organization_id) DO UPDATE SET plan_code=excluded.plan_code",
  [org,code]);
 const app=express();app.use(express.json());
 app.use('/api/custom',(req,_res,next)=>{req.userId=req.get('x-user');next();},
  planPolicy.scoped('custom'),customWorkflowsRouter({pool,campaignAccess,bad,uuid,log}));
 app.use((err,_req,res,_next)=>res.status(err.status||500).json({error:err.message}));
 const server=await new Promise(resolve=>{
  const srv=app.listen(0,'127.0.0.1',()=>resolve(srv));
 });
 const call=async(user,method,path,body)=>{
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/custom'+path,{
   method,headers:{'x-user':user,...(body?{'content-type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json()};
 };
 const base='/campaigns/'+camp;
 try{
  const noPlan=await call(owner,'GET',base+'/workflow-templates');
  assert.equal(noPlan.status,403);
  await grant('organization');
  assert.equal((await call(owner,'GET',base+'/workflow-templates')).status,403,
   'Organization must not silently receive Custom entitlements');
  await grant('custom');
  assert.equal((await call(outsider,'GET',base+'/workflow-runs')).status,404);
  assert.equal((await call(worker,'GET',base+'/workflow-templates')).status,403);
  assert.equal((await call(worker,'POST',base+'/workflow-templates',{title:'Bad',steps:['A']})).status,403);
  assert.equal((await call(owner,'POST',base+'/workflow-templates',{title:'Bad',steps:[]})).status,400);
  assert.equal((await call(owner,'POST',base+'/workflow-templates',{title:'Bad',steps:['Same','Same']})).status,400);
  const template=await call(owner,'POST',base+'/workflow-templates',{
   title:'Committee approval',steps:['Ask the committee','Write down the decision']});
  assert.equal(template.status,201,JSON.stringify(template.data));
  const tpl=template.data.id;
  assert.equal((await call(owner,'POST',base+'/workflow-runs',{
   templateId:tpl,title:'Not valid worker',assignedTo:outsider})).status,400);
  assert.equal((await call(owner,'POST',base+'/workflow-runs',{
   templateId:tpl,title:'Run',assignedTo:manager})).status,400,
   'Manager must join campaign to be task assignee');
  const created=await call(owner,'POST',base+'/workflow-runs',{
   templateId:tpl,title:'Obtain board approval',assignedTo:worker});
  assert.equal(created.status,201,JSON.stringify(created.data));
  const rid=created.data.id,runPath=base+'/workflow-runs/'+rid;
  const workerRuns=await call(worker,'GET',base+'/workflow-runs');
  assert.equal(workerRuns.status,200);
  assert.equal(workerRuns.data.runs.length,1);
  assert.deepEqual(workerRuns.data.runs[0].step_titles,['Ask the committee','Write down the decision']);
  assert.equal(workerRuns.data.scope,'assigned_personal');
  assert.equal((await call(outsider,'POST',runPath+'/action',
   {action:'complete_step',version:1})).status,404);
  const blocked=await call(worker,'POST',runPath+'/action',{action:'block',version:1,note:'Waiting for chairperson'});
  assert.equal(blocked.status,200);
  assert.equal(blocked.data.status,'blocked');
  assert.equal((await call(worker,'POST',runPath+'/action',{action:'complete_step',version:2})).status,409);
  assert.equal((await call(worker,'POST',runPath+'/action',{action:'resume',version:1})).status,409);
  const resume=await call(worker,'POST',runPath+'/action',{action:'resume',version:2});
  assert.equal(resume.status,200);
  assert.equal((await call(worker,'POST',runPath+'/action',{action:'cancel',version:3})).status,403);
  const first=await call(worker,'POST',runPath+'/action',{action:'complete_step',version:3});
  assert.equal(first.status,200);
  assert.equal(first.data.next_step,1);
  const finished=await call(worker,'POST',runPath+'/action',{action:'complete_step',version:4});
  assert.equal(finished.status,200);
  assert.equal(finished.data.status,'completed');
  assert.equal(finished.data.next_step,2);
  assert.equal((await call(worker,'POST',runPath+'/action',{action:'complete_step',version:5})).status,409);
  const events=await call(manager,'GET',runPath+'/events');
  assert.equal(events.status,200);
  assert.deepEqual(events.data.events.map(x=>x.event_kind),
   ['step_completed','step_completed','resumed','blocked','created']);
  assert.equal((await call(outsider,'GET',runPath+'/events')).status,404);
  await assert.rejects(
   pool.query('DELETE FROM cc_custom_workflow_events WHERE run_id=$1',[rid]),
   /append-only/i);
  const arch=await call(owner,'POST',base+'/workflow-templates/'+tpl+'/archive');
  assert.equal(arch.status,200);
  assert.equal((await call(owner,'POST',base+'/workflow-runs',{
   templateId:tpl,title:'No more',assignedTo:worker})).status,404);
  assert.equal((await call(owner,'GET',base+'/workflow-runs')).data.counts.completed,1);
  assert.equal((await call(outsider,'GET','/campaigns/'+foreign+'/workflow-runs')).status,403);
 }finally{await new Promise(resolve=>server.close(resolve));await pool.end();}
});
