import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import express from 'express';
import pg from 'pg';
import {makePlanPolicy} from '../server/plan-policy.js';
import teamRouter from '../server/team.js';
import customTeamRolesRouter from '../server/custom-team-roles.js';

const url=process.env.TEST_DATABASE_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname))
 throw Error('Local disposable database only');
const pool=new pg.Pool({connectionString:url,max:6});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const trim=(v,n=500)=>typeof v==='string'?v.trim().slice(0,n):'';
const need=(role,allowed)=>{if(!allowed.includes(role))throw bad(403,'Insufficient permission');};
const member=async(db,org,who)=>{
 const r=await db.query("SELECT role FROM cc_memberships WHERE organization_id=$1 AND subject=$2 AND membership_status='active'",[org,who]);
 if(!r.rowCount)throw bad(404,'Member not found');
 return r.rows[0].role;
};
const campaignAccess=async(db,id,user)=>{
 if(!uuid(id))throw bad(400,'Invalid campaign');
 const r=await db.query("SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m ON m.organization_id=c.organization_id AND m.subject=$2 AND m.membership_status='active' WHERE c.id=$1",[id,user]);
 if(!r.rowCount)throw bad(404,'Campaign not found');
 if(!['owner','manager','finance','auditor'].includes(r.rows[0].role)){
  const joined=await db.query('SELECT 1 FROM cc_campaign_members WHERE campaign_id=$1 AND subject=$2',[id,user]);
  if(!joined.rowCount)throw bad(404,'Campaign not found');
 }
 return r.rows[0];
};
const log=(db,org,campaign,actor,type,target=null,details={})=>db.query(
 'INSERT INTO cc_activity_events(organization_id,campaign_id,actor_subject,event_type,target_id,details) VALUES($1,$2,$3,$4,$5,$6)',
 [org,campaign,actor,type,target,JSON.stringify(details)]);
const policy=makePlanPolicy({pool,bad});
test('Gabbai Pro owner creates restrictive roles that narrow real contact privileges, not expand finance/manager rights',async()=>{
 for(const f of ['001_core.sql','002_team_connect.sql','026_server_plan_entitlements.sql',
  '037_custom_team_role_restrictions.sql']){
  if(f==='037_custom_team_role_restrictions.sql'){
   const ready=await pool.query("SELECT to_regclass('public.cc_custom_team_permission_profiles') AS name");
   if(ready.rows[0].name)continue;
  }
  await pool.query(await readFile(join(import.meta.dirname,'../db',f),'utf8'));
 }
 const salt=Date.now()+'-'+Math.random().toString(36).slice(2);
 const owner='role-owner-'+salt,manager='role-manager-'+salt,worker='role-worker-'+salt,
  outsider='role-outside-'+salt,otherWorker='role-new-'+salt;
 const org=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES($1,$2) RETURNING id",['Custom role QA',owner])).rows[0].id;
 const other=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES($1,$2) RETURNING id",['Foreign QA',outsider])).rows[0].id;
 for(const [o,who,role] of [[org,owner,'owner'],[org,manager,'manager'],[org,worker,'askan'],
  [org,otherWorker,'askan'],[other,outsider,'owner']]){
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at)"+
   " VALUES($1,$2,$3,'active',now())",[o,who,role]);
 }
 const campaign=(await pool.query("INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Shareable fundraiser','active') RETURNING id",[org])).rows[0].id;
 await pool.query('INSERT INTO cc_campaign_members(organization_id,campaign_id,subject) VALUES($1,$2,$3)',[org,campaign,worker]);
 const lead=(await pool.query(
  "INSERT INTO cc_contacts(organization_id,campaign_id,created_by,display_name,phone,privacy)"+
  " VALUES($1,$2,$3,'Donor name','5550101000','campaign') RETURNING id",
  [org,campaign,owner])).rows[0].id;
 const app=express();app.use(express.json());
 const auth=(req,_res,next)=>{req.userId=req.get('x-user')||'';next();};
 app.use('/api/gabbai',auth,policy.scoped('gabbai_pro'),customTeamRolesRouter({pool,member,bad,uuid,log}));
 app.use('/api/team',auth,teamRouter({pool,authenticate:(req,_res,next)=>next(),
  member,campaignAccess,need,log,bad,uuid,trim,planPolicy:policy}));
 app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}));
 const server=await new Promise(done=>{const srv=app.listen(0,'127.0.0.1',()=>done(srv));});
 const call=async(who,method,path,data)=>{
  const res=await fetch('http://127.0.0.1:'+server.address().port+path,{
   method,headers:{'x-user':who,...(data?{'content-type':'application/json'}:{})},
   ...(data?{body:JSON.stringify(data)}:{})});
  const body=res.headers.get('content-type')?.includes('application/json')?
   await res.json():await res.text();
  return {status:res.status,data:body};
 };
 const grant=code=>pool.query(
  "INSERT INTO cc_plan_entitlements(organization_id,plan_code,provision_reference,provisioned_by)"+
  " VALUES($1,$2,'approved-ci-fixture-only','platform-admin') ON CONFLICT(organization_id)"+
  " DO UPDATE SET plan_code=excluded.plan_code",[org,code]);
 const api='/api/gabbai/organizations/'+org,memberUrl=api+'/members/'+encodeURIComponent(worker)+'/permission-profile',
  leadUrl='/api/team/campaigns/'+campaign+'/lead-queue';
 try{
  assert.equal((await call(owner,'GET',api+'/role-profiles')).status,403);
  assert.equal((await call(worker,'GET',leadUrl)).status,200,
   'Without a restrictive profile original built-in role continues to work');
  await grant('gabbai_pro');
  assert.equal((await call(worker,'GET',api+'/role-profiles')).status,403);
  assert.equal((await call(manager,'POST',api+'/role-profiles',{
   title:'No',canViewLeadQueue:true,canClaimLeads:false,canExportSharedContacts:false})).status,403);
  assert.equal((await call(owner,'POST',api+'/role-profiles',{
   title:'Bad',canViewLeadQueue:false,canClaimLeads:true,canExportSharedContacts:false})).status,400);
  const created=await call(owner,'POST',api+'/role-profiles',{
   title:'View only',canViewLeadQueue:true,canClaimLeads:false,canExportSharedContacts:false});
  assert.equal(created.status,201,JSON.stringify(created.data));
  const profile=created.data.id;
  assert.equal((await call(manager,'POST',memberUrl,{profileId:profile})).status,403);
  assert.equal((await call(owner,'POST',memberUrl,{profileId:'00000000-0000-4000-8000-000000000000'})).status,404);
  assert.equal((await call(owner,'POST',api+'/members/'+encodeURIComponent(manager)+'/permission-profile',{profileId:profile})).status,403);
  assert.equal((await call(owner,'POST',memberUrl,{profileId:profile})).status,200);
  const get=await call(owner,'GET',api+'/role-profiles');
  assert.equal(get.data.assignments.find(x=>x.subject===worker).profile_id,profile);
  assert.equal((await call(worker,'GET',leadUrl)).status,200);
  assert.equal((await call(worker,'POST','/api/team/contacts/'+lead+'/claim')).status,403);
  assert.equal((await call(worker,'GET','/api/team/campaigns/'+campaign+'/contacts.csv')).status,403);
  const lock=await call(owner,'POST',api+'/role-profiles',{
   title:'No contact list',canViewLeadQueue:false,canClaimLeads:false,canExportSharedContacts:false});
  assert.equal(lock.status,201);
  assert.equal((await call(owner,'POST',memberUrl,{profileId:lock.data.id})).status,200);
  assert.equal((await call(worker,'GET',leadUrl)).status,403);
  assert.equal((await call(owner,'GET',leadUrl)).status,200,
   'Restricting worker never affects authorized leadership');
  assert.equal((await call(owner,'POST',memberUrl,{profileId:null})).status,200);
  assert.equal((await call(worker,'GET',leadUrl)).status,200);
  assert.equal((await call(owner,'POST',memberUrl,{profileId:null})).data.changed,false);
  const events=await pool.query(
   'SELECT previous_profile_id,next_profile_id FROM cc_custom_team_permission_events WHERE organization_id=$1 AND subject=$2 ORDER BY created_at,id',[org,worker]);
  assert.equal(events.rows.length,3);
  await assert.rejects(pool.query(
   'DELETE FROM cc_custom_team_permission_events WHERE organization_id=$1',[org]),/append-only/i);
  assert.equal((await call(outsider,'GET',api+'/role-profiles')).status,404);
 }finally{await new Promise(done=>server.close(done));await pool.end();}
});
