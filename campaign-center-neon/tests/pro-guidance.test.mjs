import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import express from 'express';
import pg from 'pg';
import proGuidanceRouter from '../server/pro-guidance.js';

const conn=process.env.TEST_DATABASE_URL;
if(!conn||!['127.0.0.1','localhost'].includes(new URL(conn).hostname))
 throw Error('Guidance tests require disposable localhost PostgreSQL');
const pool=new pg.Pool({connectionString:conn,max:4});
const bad=(code,text)=>Object.assign(new Error(text),{status:code});
const trim=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const log=(db,org,camp,user,type,id,details)=>db.query(
 'INSERT INTO cc_activity_events(organization_id,campaign_id,actor_subject,event_type,target_id,details) VALUES($1,$2,$3,$4,$5,$6)',
 [org,camp,user,type,id,JSON.stringify(details||{})]);
async function campaignAccess(db,id,user){
 if(!uuid(id))throw bad(400,'Invalid campaign');
 const r=await db.query("SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m ON m.organization_id=c.organization_id AND m.subject=$2 AND m.membership_status='active' WHERE c.id=$1",[id,user]);
 if(!r.rowCount)throw bad(404,'Campaign not found');
 const c=r.rows[0];
 if(!['owner','manager','finance','auditor'].includes(c.role)){
  const joined=await db.query('SELECT 1 FROM cc_campaign_members WHERE campaign_id=$1 AND subject=$2',[id,user]);
  if(!joined.rowCount)throw bad(404,'Campaign not found');
 }
 return c;
}
test('Askan Pro Guidance protects private tickets, manager replies, append-only messages and revocations',async()=>{
 for(const name of ['001_core.sql','002_team_connect.sql','019_askan_pro_guidance.sql','032_guidance_work_ownership.sql'])
  await pool.query(await readFile(join(import.meta.dirname,'../db',name),'utf8'));
 const tag='guidance-ci-'+Date.now(),owner=tag+'owner',manager=tag+'manager',member=tag+'member',peer=tag+'peer',outsider=tag+'foreign';
 const org=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Guidance QA',$1) RETURNING id",[owner])).rows[0].id;
 const otherOrg=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Another QA',$1) RETURNING id",[outsider])).rows[0].id;
 for(const [o,who,role] of [[org,owner,'owner'],[org,manager,'manager'],[org,member,'askan'],[org,peer,'askan'],[otherOrg,outsider,'owner']])
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at) VALUES($1,$2,$3,'active',now())",[o,who,role]);
 const camp=(await pool.query("INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Guidance campaign','active') RETURNING id",[org])).rows[0].id;
 for(const who of [member,peer])await pool.query('INSERT INTO cc_campaign_members(organization_id,campaign_id,subject) VALUES($1,$2,$3)',[org,camp,who]);
 const app=express();app.use(express.json());
 app.use('/api/pro',(req,_res,next)=>{req.userId=req.get('x-guidance-user')||'anonymous';next();});
 app.use('/api/pro',proGuidanceRouter({pool,campaignAccess,bad,trim,uuid,log}));
 app.use((err,_req,res,_next)=>res.status(err.status||500).json({error:err.message}));
 const server=await new Promise(ok=>{const s=app.listen(0,'127.0.0.1',()=>ok(s));});
 async function request(who,method,path,data){
  const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/pro'+path,{
   method,headers:{'x-guidance-user':who,...(data?{'content-type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
  return {status:r.status,data:await r.json()};
 }
 try{
  const base='/campaigns/'+camp+'/guidance';
  assert.equal((await request(outsider,'GET',base)).status,404);
  const created=await request(member,'POST',base,{
   subject:'Need help with calling',description:'Private donor plan details',category:'strategy'});
  assert.equal(created.status,201);
  assert.equal(created.data.staffResponseGuaranteed,false);
  const id=created.data.id;
  assert.equal((await request(member,'GET',base)).data.requests.length,1);
  assert.deepEqual((await request(peer,'GET',base)).data.requests,[]);
  assert.equal((await request(owner,'GET',base)).data.requests.length,1);
  assert.equal((await request(peer,'GET','/guidance/'+id+'/messages')).status,404);
  assert.equal((await request(outsider,'POST','/guidance/'+id+'/messages',{body:'hacked'})).status,404);
  assert.equal((await request(peer,'PATCH','/guidance/'+id+'/close',{})).status,404);
  assert.equal((await request(member,'PATCH','/guidance/'+id+'/triage',{action:'take'})).status,403,
    'Request owner cannot assign management work');
  assert.equal((await request(peer,'PATCH','/guidance/'+id+'/triage',{action:'take'})).status,404);
  assert.equal((await request(outsider,'PATCH','/guidance/'+id+'/triage',{action:'take'})).status,404);
  const take=await request(manager,'PATCH','/guidance/'+id+'/triage',{action:'take'});
  assert.equal(take.status,200);assert.equal(take.data.assignedTo,manager);
  assert.equal(take.data.staffResponseGuaranteed,false);
  assert.equal((await request(manager,'PATCH','/guidance/'+id+'/triage',{action:'take'})).data.unchanged,true);
  assert.equal((await request(owner,'PATCH','/guidance/'+id+'/triage',{action:'take'})).status,409,
    'Second manager must release or override with owner release');
  assert.equal((await request(manager,'PATCH','/guidance/'+id+'/triage',{
   action:'deadline',responseDueAt:'not a date'})).status,400);
  const timed=await request(manager,'PATCH','/guidance/'+id+'/triage',{
   action:'deadline',responseDueAt:'2026-10-01T10:00:00Z'});
  assert.equal(timed.status,200);
  const queue=(await request(owner,'GET',base)).data.requests[0];
  assert.equal(queue.assigned_to,manager);
  assert.equal(queue.response_due_at,'2026-10-01T10:00:00.000Z');
  assert.equal((await request(member,'GET',base)).data.requests[0].assigned_to,manager);
  assert.equal((await request(manager,'PATCH','/guidance/'+id+'/triage',{
   action:'release'})).status,200);
  const released=(await request(owner,'GET',base)).data.requests[0];
  assert.equal(released.assigned_to,null);assert.equal(released.response_due_at,null);
  assert.equal((await request(owner,'PATCH','/guidance/'+id+'/triage',{
   action:'take'})).data.assignedTo,owner);

  assert.equal((await request(owner,'POST','/guidance/'+id+'/messages',{body:'Manager private answer'})).status,201);
  const afterManager=(await request(member,'GET',base)).data.requests[0];
  assert.equal(afterManager.status,'answered');
  assert.equal((await request(member,'POST','/guidance/'+id+'/messages',{body:'Member followup'})).status,201);
  assert.equal((await request(owner,'GET',base)).data.requests[0].status,'open');
  const thread=await request(member,'GET','/guidance/'+id+'/messages');
  assert.equal(thread.status,200);assert.equal(thread.data.messages.length,2);
  const audit=await pool.query("SELECT details FROM cc_activity_events WHERE campaign_id=$1 AND event_type='pro.guidance.replied'",[camp]);
  assert.equal(audit.rowCount,2);
  assert.ok(!JSON.stringify(audit.rows).includes('Manager private answer'),'Shared audit must not include private guidance message');
  await assert.rejects(pool.query('DELETE FROM cc_pro_guidance_messages WHERE id=$1',[thread.data.messages[0].id]),/append-only/);
  assert.equal((await request(member,'PATCH','/guidance/'+id+'/close',{})).status,200);
  assert.equal((await request(member,'POST','/guidance/'+id+'/messages',{body:'late'})).status,409);
  assert.equal((await request(owner,'PATCH','/guidance/'+id+'/triage',{action:'release'})).status,409);
  assert.equal((await request(owner,'PATCH','/guidance/'+id+'/close',{})).data.unchanged,true);
  await pool.query("UPDATE cc_memberships SET membership_status='revoked' WHERE organization_id=$1 AND subject=$2",[org,member]);
  assert.equal((await request(member,'GET','/guidance/'+id+'/messages')).status,404);
 }finally{await new Promise(resolve=>server.close(resolve));await pool.end();}
});
