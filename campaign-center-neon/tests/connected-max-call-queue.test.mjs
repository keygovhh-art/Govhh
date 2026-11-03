import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import express from 'express';
import pg from 'pg';
import {connectServiceRouter} from '../server/connect.js';

const uri=process.env.TEST_DATABASE_URL;
if(!uri||!['127.0.0.1','localhost'].includes(new URL(uri).hostname))
 throw Error('Disposable local Postgres required; refuse to run against Neon production.');
const pool=new pg.Pool({connectionString:uri,max:4});
const secret='local-cc-max-call-queue-fake-shared-secret-20261103-not-production';
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(x);
const bad=(status,message)=>Object.assign(Error(message),{status});
const log=(db,org,camp,actor,kind,target,details)=>db.query(
 'INSERT INTO cc_activity_events(organization_id,campaign_id,actor_subject,event_type,target_id,details) VALUES($1,$2,$3,$4,$5,$6)',
 [org,camp,actor,kind,target,JSON.stringify(details||{})]);

test('Campaign Center MAX queue: membership and tenant security, exclusive lead and canonical result',async()=>{
 process.env.GAVHAH_CONNECT_SHARED_SECRET=secret;
 // Keep schema installation contained entirely within this disposable CI instance.
 for(const file of ['001_core.sql','002_team_connect.sql','031_call_assignment_member_scope.sql']){
  const sql=await readFile(join(import.meta.dirname,'../db',file),'utf8');
  await pool.query(sql);
 }
 const owner='queue-owner-1103';
 const agent='queue-agent-1103';
 const other='queue-other-1103';
 const foreign='queue-outsider-1103';
 const org=(await pool.query(
  "INSERT INTO cc_organizations(name,owner_subject) VALUES('Call queue test',$1) RETURNING id",[owner])).rows[0].id;
 for(const [subject,role] of [[owner,'owner'],[agent,'askan'],[other,'askan'],[foreign,'askan']]){
  await pool.query(
   "INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at) VALUES($1,$2,$3,'active',now())",
   [org,subject,role]);
 }
 const camp=(await pool.query(
  "INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Open calling campaign','active') RETURNING id",[org])).rows[0].id;
 for(const [subject,team] of [[owner,''],[agent,'alpha'],[other,'beta']]){
  await pool.query(
   'INSERT INTO cc_campaign_members(organization_id,campaign_id,subject,team_name) VALUES($1,$2,$3,$4)',
   [org,camp,subject,team]);
 }
 for(const [subject,user] of [[agent,510001],[other,510002],[foreign,510003]]){
  await pool.query(
   "INSERT INTO cc_external_account_links(subject,external_system,external_user_id) VALUES($1,'gavhah_max',$2)",
   [subject,user]);
 }
 const lead=(await pool.query(
  "INSERT INTO cc_contacts(organization_id,campaign_id,created_by,display_name,phone,privacy,assigned_team,assigned_member_subject) "+
  "VALUES($1,$2,$3,'Test donor','2125550123','campaign','alpha',$4) RETURNING id",
  [org,camp,owner,agent])).rows[0].id;
 const app=express();
 app.use(express.json());
 app.use('/api/connect/service',connectServiceRouter({pool,bad,uuid,log}));
 app.use((err,req,res,next)=>res.status(err.status||500).json({error:String(err.message||'Unexpected')}));
 const srv=await new Promise(resolve=>{
  const s=app.listen(0,'127.0.0.1',()=>resolve(s));
 });
 const base='http://127.0.0.1:'+srv.address().port+'/api/connect/service';
 const get=async(path,userId)=>{
  const r=await fetch(base+path,{headers:{'x-gavhah-connect-secret':secret}});
  return {status:r.status,data:await r.json()};
 };
 const post=async(path,body)=>{
  const r=await fetch(base+path,{method:'POST',
   headers:{'x-gavhah-connect-secret':secret,'content-type':'application/json'},
   body:JSON.stringify(body)});
  return {status:r.status,data:await r.json()};
 };
 try{
  const rejected=await fetch(base+'/call-queue/campaigns?gavhahUserId=510001');
  assert.equal(rejected.status,403,'No shared secret may view calling queue');
  const outsider=await get('/call-queue/campaigns?gavhahUserId=510003');
  assert.equal(outsider.status,200);
  assert.equal(outsider.data.eligible,false,'Workspace membership alone does not grant campaign assignments');
  const eligible=await get('/call-queue/campaigns?gavhahUserId=510001');
  assert.equal(eligible.status,200);
  assert.equal(eligible.data.eligible,true);
  assert.equal(eligible.data.campaigns.length,1);
  const otherQueue=await get('/call-queue?gavhahUserId=510002&campaignId='+camp);
  assert.equal(otherQueue.status,200);
  assert.equal(otherQueue.data.calls.length,0,'Different team must not see individually assigned lead');
  const first=await post('/call-queue/next',{gavhahUserId:510001,campaignId:camp});
  assert.equal(first.status,200);
  assert.equal(first.data.call.id,lead);
  const repeat=await post('/call-queue/next',{gavhahUserId:510001,campaignId:camp});
  assert.equal(repeat.data.reused,true,'Repeat click must reuse existing claim');
  const wrong=await post('/call-queue/'+lead+'/release',{gavhahUserId:510002,campaignId:camp});
  assert.notEqual(wrong.status,200,'Another agent cannot release assigned claim');
  const result=await post('/call-queue/'+lead+'/result',{
   gavhahUserId:510001,campaignId:camp,outcome:'no_answer',note:'Test result'});
  assert.equal(result.status,201,'Manual result saved against the canonical CC campaign');
  assert.equal(result.data.manual,true);
  const saved=await pool.query('SELECT member_subject,outcome FROM cc_call_events WHERE contact_id=$1',[lead]);
  assert.equal(saved.rows[0].member_subject,agent);
  assert.equal(saved.rows[0].outcome,'no_answer');
  const free=await pool.query('SELECT claimed_by FROM cc_contacts WHERE id=$1',[lead]);
  assert.equal(free.rows[0].claimed_by,null,'Result releases claim');
  await pool.query("UPDATE cc_memberships SET membership_status='revoked' WHERE organization_id=$1 AND subject=$2",[org,agent]);
  const revoked=await get('/call-queue?gavhahUserId=510001&campaignId='+camp);
  assert.equal(revoked.status,403,'Revoked membership must lose all donor calling rights');
 }finally{
  await new Promise(resolve=>srv.close(resolve));
  await pool.end();
 }
});
