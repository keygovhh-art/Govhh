import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import express from 'express';
import pg from 'pg';
import organizationMemoryRouter from '../server/organization-memory.js';

const conn=process.env.TEST_DATABASE_URL;
if(!conn||!['localhost','127.0.0.1'].includes(new URL(conn).hostname))
 throw Error('Organization Memory test refuses nonlocal or production DB');
const pool=new pg.Pool({connectionString:conn,max:4});
const bad=(status,msg)=>Object.assign(new Error(msg),{status});
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const trim=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
const log=(db,o,c,u,type,id,details)=>db.query(
 'INSERT INTO cc_activity_events(organization_id,campaign_id,actor_subject,event_type,target_id,details) VALUES($1,$2,$3,$4,$5,$6)',
 [o,c,u,type,id,JSON.stringify(details||{})]);

test('Institutional memory is private, revised by append only and can be reviewed by due date',async()=>{
 for(const f of ['001_core.sql','002_team_connect.sql','024_organization_memory.sql'])
  await pool.query(await readFile(join(import.meta.dirname,'../db',f),'utf8'));
 const key='memory-ci-'+Date.now(),owner=key+'owner',manager=key+'manager',worker=key+'worker',outsider=key+'outside';
 const org=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Memory QA',$1) RETURNING id",[owner])).rows[0].id;
 const foreign=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Foreign QA',$1) RETURNING id",[outsider])).rows[0].id;
 for(const [oid,subject,role] of [[org,owner,'owner'],[org,manager,'manager'],[org,worker,'askan'],[foreign,outsider,'owner']])
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at) VALUES($1,$2,$3,'active',now())",[oid,subject,role]);
 const camp=(await pool.query("INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Visible campaign','active') RETURNING id",[org])).rows[0].id;
 const otherCamp=(await pool.query("INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'FOREIGN campaign','active') RETURNING id",[foreign])).rows[0].id;
 const app=express();app.use(express.json());
 app.use('/api/organization',(req,_res,next)=>{req.userId=req.get('x-qa-person')||'anonymous';next();});
 app.use('/api/organization',organizationMemoryRouter({pool,bad,uuid,trim,log}));
 app.use((err,_req,res,_next)=>res.status(err.status||500).json({error:err.message}));
 const server=await new Promise(resolve=>{const srv=app.listen(0,'127.0.0.1',()=>resolve(srv));});
 async function req(who,method,path,data){
  const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/organization'+path,{
   method,headers:{'x-qa-person':who,...(data?{'content-type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
  return {status:r.status,data:await r.json()};
 }
 const route='/organizations/'+org+'/memory';
 const post=(u,data)=>req(u,'POST',route,data);
 const list=(u,params='')=>req(u,'GET',route+params);
 const body={category:'handoff',title:'Chief operations handoff',summary:'SECRET: organization manager only',
  sourceCampaignId:camp,reviewDueAt:'2026-01-01T12:00:00Z'};
 try{
  assert.equal((await list(worker)).status,403);
  assert.equal((await list(outsider)).status,404);
  assert.equal((await post(worker,body)).status,403);
  assert.equal((await post(owner,{...body,sourceCampaignId:otherCamp})).status,404);
  assert.equal((await post(owner,{...body,reviewDueAt:'tomorrow'})).status,400);
  const created=await post(owner,body);
  assert.equal(created.status,201);
  assert.equal(created.data.manualKnowledgeOnly,true);
  const id=created.data.id;
  const due=await list(manager,'?due=true');
  assert.equal(due.status,200);
  assert.equal(due.data.entries.length,1);
  assert.equal(due.data.doesNotSendReminders,true);
  const latest=await list(owner);
  assert.equal(latest.data.entries.length,1);
  assert.equal(latest.data.entries[0].summary,body.summary);
  assert.equal((await req(outsider,'GET','/organizations/'+foreign+'/memory')).data.entries.length,0);
  const revised=await post(manager,{...body,summary:'Revised POLICY with confidential details',
   title:'New handoff version',supersedesId:id,reviewDueAt:null});
  assert.equal(revised.status,201);
  assert.equal((await post(owner,{...body,supersedesId:id})).status,409);
  const after=await list(owner);
  assert.equal(after.data.entries.length,1);
  assert.equal(after.data.entries[0].summary,'Revised POLICY with confidential details');
  const history=await list(owner,'?history=true');
  assert.equal(history.data.entries.length,2);
  assert.equal((await list(owner,'?due=true')).data.entries.length,0);
  await assert.rejects(pool.query('UPDATE cc_org_memory_entries SET summary=$1 WHERE id=$2',['rewritten',id]),/append-only/);
  await assert.rejects(pool.query('DELETE FROM cc_org_memory_entries WHERE id=$1',[id]),/append-only/);
  const logs=await pool.query("SELECT details FROM cc_activity_events WHERE organization_id=$1 AND event_type LIKE 'organization.memory.%'",[org]);
  assert.equal(logs.rowCount,2);
  assert.ok(!JSON.stringify(logs.rows).includes('SECRET'),'No confidential memory in global audit');
  await pool.query("UPDATE cc_memberships SET membership_status='revoked' WHERE organization_id=$1 AND subject=$2",[org,manager]);
  assert.equal((await list(manager)).status,404);
 }finally{await new Promise(resolve=>server.close(resolve));await pool.end();}
});
