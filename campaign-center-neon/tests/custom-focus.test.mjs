import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import express from 'express';
import pg from 'pg';
import customFocusRouter from '../server/custom-focus.js';

const connection=process.env.TEST_DATABASE_URL;
if(!connection||!['localhost','127.0.0.1'].includes(new URL(connection).hostname))
 throw Error('Custom Focus tests refuse production/nonlocal PostgreSQL');
const pool=new pg.Pool({connectionString:connection,max:5});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(x);
const log=(db,o,c,u,type,id,details)=>db.query(
 'INSERT INTO cc_activity_events(organization_id,campaign_id,actor_subject,event_type,target_id,details) VALUES($1,$2,$3,$4,$5,$6)',
 [o,c,u,type,id,JSON.stringify(details||{})]);
async function campaignAccess(db,cid,who){
 if(!uuid(cid))throw bad(400,'Bad campaign');
 const r=await db.query("SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m ON m.organization_id=c.organization_id AND m.subject=$2 AND m.membership_status='active' WHERE c.id=$1",[cid,who]);
 if(!r.rowCount)throw bad(404,'Campaign not found');
 const c=r.rows[0];
 if(!['owner','manager','finance','auditor'].includes(c.role)){
  const m=await db.query('SELECT 1 FROM cc_campaign_members WHERE campaign_id=$1 AND subject=$2',[cid,who]);
  if(!m.rowCount)throw bad(404,'Campaign not found');
 }
 return c;
}

test('Custom Focus weights prioritize actual tasks/contacts while preserving private team scope',async()=>{
 for(const file of ['001_core.sql','002_team_connect.sql','017_askan_pro_crm.sql','025_custom_focus_rules.sql'])
  await pool.query(await readFile(join(import.meta.dirname,'../db',file),'utf8'));
 const tag='custom-ci-'+Date.now(),owner=tag+'owner',manager=tag+'manager',a=tag+'a',b=tag+'b',outside=tag+'outside';
 const org=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Custom QA',$1) RETURNING id",[owner])).rows[0].id;
 const other=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Other QA',$1) RETURNING id",[outside])).rows[0].id;
 for(const [o,u,role] of [[org,owner,'owner'],[org,manager,'manager'],[org,a,'askan'],[org,b,'askan'],[other,outside,'owner']])
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at) VALUES($1,$2,$3,'active',now())",[o,u,role]);
 const camp=(await pool.query("INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Custom Focus QA','active') RETURNING id",[org])).rows[0].id;
 for(const [u,team] of [[owner,''],[manager,''],[a,'A'],[b,'B']])
  await pool.query('INSERT INTO cc_campaign_members(organization_id,campaign_id,subject,team_name) VALUES($1,$2,$3,$4)',[org,camp,u,team]);
 async function task(user,title,priority,due){
  return (await pool.query(
   "INSERT INTO cc_assignments(organization_id,campaign_id,assignee_subject,title,priority,due_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
   [org,camp,user,title,priority,due])).rows[0].id;
 }
 const overdue=new Date(Date.now()-86400000).toISOString();
 const dueSoon=new Date(Date.now()+86400000).toISOString();
 await task(a,'ALPHA HIGH OVERDUE','high',overdue);
 await task(b,'BETA PRIVATE TASK','high',overdue);
 await task(a,'ALPHA SMALL TASK','low',dueSoon);
 async function contact(name,by,privacy,team,doNotCall=false){
  const id=(await pool.query(
   "INSERT INTO cc_contacts(organization_id,campaign_id,created_by,display_name,privacy,assigned_team,do_not_call) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
   [org,camp,by,name,privacy,team,doNotCall])).rows[0].id;
  await pool.query(
   "INSERT INTO cc_pro_contact_profiles(organization_id,campaign_id,contact_id,stage,priority,next_followup_at,last_updated_by) VALUES($1,$2,$3,'followup','high',$4,$5)",
   [org,camp,id,overdue,by]);return id;
 }
 await contact('ALPHA PRIVATE FOLLOWUP',a,'private','A');
 await contact('BETA TEAM FOLLOWUP',b,'campaign','B');
 await contact('DO NOT CALL',a,'campaign','A',true);
 const app=express();app.use(express.json());
 app.use('/api/custom',(req,_res,next)=>{req.userId=req.get('x-qa-user')||'anonymous';next();});
 app.use('/api/custom',customFocusRouter({pool,campaignAccess,bad,log}));
 app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}));
 const server=await new Promise(done=>{const srv=app.listen(0,'127.0.0.1',()=>done(srv));});
 const base='http://127.0.0.1:'+server.address().port+'/api/custom/campaigns/'+camp;
 async function request(user,method,path,payload){
  const r=await fetch(base+path,{method,headers:{'x-qa-user':user,...(payload?{'Content-Type':'application/json'}:{})},
   ...(payload?{body:JSON.stringify(payload)}:{})});
  return {status:r.status,data:await r.json()};
 }
 const get=(u,path)=>request(u,'GET',path);
 const put=(u,w)=>request(u,'PUT','/focus-rules',w);
 try{
  assert.equal((await get(outside,'/focus-preview')).status,404);
  assert.equal((await put(a,{overdueWeight:60,dueSoonWeight:1,highPriorityWeight:1,followupWeight:1})).status,403);
  assert.equal((await put(owner,{overdueWeight:0,dueSoonWeight:0,highPriorityWeight:0,followupWeight:0})).status,400);
  const defaultRules=await get(a,'/focus-rules');
  assert.equal(defaultRules.status,200);assert.equal(defaultRules.data.canEdit,false);
  const rules={overdueWeight:70,dueSoonWeight:5,highPriorityWeight:10,followupWeight:15};
  assert.equal((await put(owner,rules)).status,200);
  const unchanged=await put(owner,rules);assert.equal(unchanged.data.unchanged,true);
  const alpha=await get(a,'/focus-preview');
  assert.equal(alpha.status,200);assert.equal(alpha.data.doesNotTriggerActions,true);
  assert.ok(alpha.data.recommendations.some(r=>r.title==='ALPHA HIGH OVERDUE'));
  assert.ok(alpha.data.recommendations.some(r=>r.title==='ALPHA PRIVATE FOLLOWUP'));
  assert.ok(!JSON.stringify(alpha.data).includes('BETA'));
  assert.ok(!JSON.stringify(alpha.data).includes('DO NOT CALL'));
  assert.ok(alpha.data.recommendations[0].score>=70);
  const beta=await get(b,'/focus-preview');
  assert.equal(beta.status,200);
  assert.ok(!JSON.stringify(beta.data).includes('ALPHA'));
  const managerView=await get(manager,'/focus-preview');
  assert.equal(managerView.status,200);
  assert.ok(JSON.stringify(managerView.data).includes('BETA TEAM FOLLOWUP'));
  assert.ok(!JSON.stringify(managerView.data).includes('ALPHA PRIVATE FOLLOWUP'));
  const history=await pool.query('SELECT id FROM cc_custom_focus_history WHERE organization_id=$1 AND campaign_id=$2',[org,camp]);
  assert.equal(history.rowCount,1,'No audit write for unchanged profile');
  await assert.rejects(pool.query('DELETE FROM cc_custom_focus_history WHERE id=$1',[history.rows[0].id]),/append-only/);
  await pool.query("UPDATE cc_memberships SET membership_status='revoked' WHERE organization_id=$1 AND subject=$2",[org,a]);
  assert.equal((await get(a,'/focus-preview')).status,404);
 }finally{await new Promise(done=>server.close(done));await pool.end();}
});
