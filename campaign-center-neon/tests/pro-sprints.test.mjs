import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import express from 'express';
import pg from 'pg';
import proSprintRouter from '../server/pro-sprints.js';

const conn=process.env.TEST_DATABASE_URL;
if(!conn||!['127.0.0.1','localhost'].includes(new URL(conn).hostname))
 throw Error('Only disposable local PostgreSQL allowed for Focus Sprint tests');
const pool=new pg.Pool({connectionString:conn,max:3});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const trim=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const log=(db,org,camp,actor,event,id,details)=>db.query(
 'INSERT INTO cc_activity_events(organization_id,campaign_id,actor_subject,event_type,target_id,details) VALUES($1,$2,$3,$4,$5,$6)',
 [org,camp,actor,event,id,JSON.stringify(details||{})]);
async function campaignAccess(db,id,subject){
 if(!uuid(id))throw bad(400,'Invalid campaign');
 const q=await db.query("SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m ON m.organization_id=c.organization_id AND m.subject=$2 AND m.membership_status='active' WHERE c.id=$1",[id,subject]);
 if(!q.rowCount)throw bad(404,'Campaign missing');
 const c=q.rows[0];
 if(!['owner','manager','finance','auditor'].includes(c.role)){
  const m=await db.query('SELECT 1 FROM cc_campaign_members WHERE campaign_id=$1 AND subject=$2',[id,subject]);
  if(!m.rowCount)throw bad(404,'Campaign missing');
 }
 return c;
}
test('private seven-day sprints persist history, refuse duplicate open plans and protect each member',async()=>{
 for(const file of ['001_core.sql','002_team_connect.sql','018_askan_pro_focus_sprints.sql'])
  await pool.query(await readFile(join(import.meta.dirname,'../db',file),'utf8'));
 const tag='sprint-ci-'+Date.now(),owner=tag+'owner',member=tag+'member',foreign=tag+'foreign';
 const org=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Sprint Org',$1) RETURNING id",[owner])).rows[0].id;
 const o2=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Other Org',$1) RETURNING id",[foreign])).rows[0].id;
 for(const [o,sub,role] of [[org,owner,'owner'],[org,member,'askan'],[o2,foreign,'owner']])
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at) VALUES($1,$2,$3,'active',now())",[o,sub,role]);
 const camp=(await pool.query("INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Sprint campaign','active') RETURNING id",[org])).rows[0].id;
 await pool.query('INSERT INTO cc_campaign_members(organization_id,campaign_id,subject) VALUES($1,$2,$3)',[org,camp,member]);
 const app=express();app.use(express.json());
 app.use('/api/pro',(req,_res,next)=>{req.userId=req.get('x-sprint-user')||'anonymous';next();});
 app.use('/api/pro',proSprintRouter({pool,campaignAccess,bad,log,uuid,trim}));
 app.use((err,_req,res,_next)=>res.status(err.status||500).json({error:err.message}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 async function call(who,method,path,data){
  const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/pro'+path,{method,headers:{'x-sprint-user':who,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
  return {status:r.status,data:await r.json()};
 }
 const today=new Date().toISOString().slice(0,10);
 const form={title:'Seven days of calling',startsOn:today,steps:[{day:1,title:'Call 5 people'},{day:3,title:'Follow up'}]};
 try{
  assert.equal((await call(foreign,'GET','/campaigns/'+camp+'/sprints')).status,404);
  const first=await call(member,'POST','/campaigns/'+camp+'/sprints',form);
  assert.equal(first.status,201);
  assert.equal((await call(member,'POST','/campaigns/'+camp+'/sprints',form)).status,409);
  assert.equal((await call(member,'POST','/campaigns/'+camp+'/sprints',{...form,steps:[{day:9,title:'No'}]})).status,400);
  const mine=await call(member,'GET','/campaigns/'+camp+'/sprints');
  assert.equal(mine.status,200);
  assert.equal(mine.data.sprints.length,1);
  assert.equal(mine.data.sprints[0].steps.length,2);
  const ownerView=await call(owner,'GET','/campaigns/'+camp+'/sprints');
  assert.equal(ownerView.status,200);
  assert.deepEqual(ownerView.data.sprints,[],'Owner cannot see member private sprint');
  const step=mine.data.sprints[0].steps[0].id;
  const url='/sprints/'+first.data.id+'/steps/'+step;
  assert.equal((await call(owner,'PATCH',url,{status:'done'})).status,404);
  assert.equal((await call(member,'PATCH',url,{status:'done'})).status,200);
  const repeat=await call(member,'PATCH',url,{status:'done'});
  assert.equal(repeat.status,200);assert.equal(repeat.data.unchanged,true);
  const history=await call(member,'GET','/campaigns/'+camp+'/focus-history');
  assert.equal(history.status,200);
  assert.equal(history.data.days,30);
  assert.equal(history.data.events.length,2);
  assert.ok(history.data.events.some(x=>x.event_type==='step_done'));
  assert.deepEqual((await call(owner,'GET','/campaigns/'+camp+'/focus-history')).data.events,[]);
  assert.equal((await call(member,'PATCH','/sprints/'+first.data.id+'/status',{status:'completed'})).status,200);
  assert.equal((await call(member,'PATCH',url,{status:'open'})).status,409);
  assert.equal((await call(member,'POST','/campaigns/'+camp+'/sprints',form)).status,201);
  const activity=await pool.query('SELECT id FROM cc_pro_sprint_activity WHERE sprint_id=$1 LIMIT 1',[first.data.id]);
  await assert.rejects(pool.query('DELETE FROM cc_pro_sprint_activity WHERE id=$1',[activity.rows[0].id]),/append-only/);
  await pool.query("UPDATE cc_memberships SET membership_status='revoked' WHERE organization_id=$1 AND subject=$2",[org,member]);
  assert.equal((await call(member,'GET','/campaigns/'+camp+'/sprints')).status,404);
 }finally{await new Promise(done=>server.close(done));await pool.end();}
});
