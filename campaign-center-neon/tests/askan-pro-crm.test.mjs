import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import express from 'express';
import pg from 'pg';
import askanProRouter from '../server/askan-pro.js';

const conn=process.env.TEST_DATABASE_URL;
if(!conn||!['127.0.0.1','localhost'].includes(new URL(conn).hostname))
 throw Error('Askan Pro acceptance runs ONLY against disposable local PostgreSQL');
const pool=new pg.Pool({connectionString:conn,max:4});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const trim=(x,max)=>typeof x==='string'?x.trim().slice(0,max):'';
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(x);
const log=(db,org,camp,subject,type,id,details)=>
 db.query('INSERT INTO cc_activity_events(organization_id,campaign_id,actor_subject,event_type,target_id,details) VALUES($1,$2,$3,$4,$5,$6)',
 [org,camp,subject,type,id,JSON.stringify(details||{})]);
async function campaignAccess(db,id,user){
 if(!uuid(id))throw bad(400,'Invalid campaign');
 const r=await db.query("SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m ON m.organization_id=c.organization_id AND m.subject=$2 AND m.membership_status='active' WHERE c.id=$1",[id,user]);
 if(!r.rowCount)throw bad(404,'Campaign not found');
 const c=r.rows[0];
 if(!['owner','manager','finance','auditor'].includes(c.role)){
  const joined=await db.query('SELECT 1 FROM cc_campaign_members WHERE organization_id=$1 AND campaign_id=$2 AND subject=$3',[c.organization_id,c.id,user]);
  if(!joined.rowCount)throw bad(404,'Campaign not found');
 }
 return c;
}
test('Askan Pro CRM protects private contacts, team notes, history and revocation',async()=>{
 for(const name of ['001_core.sql','002_team_connect.sql','017_askan_pro_crm.sql'])
  await pool.query(await readFile(join(import.meta.dirname,'../db',name),'utf8'));
 const unique='pro-ci-'+Date.now();
 const owner=unique+'owner',alpha=unique+'alpha',beta=unique+'beta',audit=unique+'audit',outsider=unique+'outside';
 const org=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Pro test',$1) RETURNING id",[owner])).rows[0].id;
 const other=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Foreign',$1) RETURNING id",[outsider])).rows[0].id;
 for(const [id,subject,role] of [[org,owner,'owner'],[org,alpha,'askan'],[org,beta,'askan'],[org,audit,'auditor'],[other,outsider,'owner']])
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at) VALUES($1,$2,$3,'active',now())",[id,subject,role]);
 const camp=(await pool.query("INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Active Pro','active') RETURNING id",[org])).rows[0].id;
 for(const [who,team] of [[owner,''],[alpha,'A'],[beta,'B']])
  await pool.query('INSERT INTO cc_campaign_members(organization_id,campaign_id,subject,team_name) VALUES($1,$2,$3,$4)',[org,camp,who,team]);
 async function contact(name,by,privacy,team){
  return (await pool.query("INSERT INTO cc_contacts(organization_id,campaign_id,created_by,display_name,phone,privacy,assigned_team) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
    [org,camp,by,name,name==='Donor A'?'5551235678':name==='Donor B'?'5551235679':'5551235680',privacy,team])).rows[0].id;
 }
 const a=await contact('Donor A',alpha,'campaign','A'),b=await contact('Donor B',beta,'campaign','B');
 const privateOne=await contact('Personal PRIVATE donor',alpha,'private','A');
 await pool.query("INSERT INTO cc_call_events(organization_id,campaign_id,contact_id,member_subject,outcome,note) VALUES($1,$2,$3,$4,'spoke','Call history logged manually')",[org,camp,a,alpha]);
 const app=express();app.use(express.json());
 app.use('/api/pro',(req,_res,next)=>{req.userId=req.get('x-qa-user')||'anonymous';next();});
 app.use('/api/pro',askanProRouter({pool,campaignAccess,bad,trim,log}));
 app.use((err,_req,res,_next)=>res.status(err.status||500).json({error:err.message}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const origin='http://127.0.0.1:'+server.address().port+'/api/pro';
 async function req(who,method,path,data){
  const resp=await fetch(origin+path,{method,headers:{'x-qa-user':who,...(data?{'content-type':'application/json'}:{})},
   ...(data?{body:JSON.stringify(data)}:{})});
  return {status:resp.status,data:await resp.json()};
 }
 const profile=(person,payload)=>req(person,'PUT','/contacts/'+a+'/profile',payload);
 try{
  assert.equal((await req(outsider,'GET','/campaigns/'+camp+'/contacts')).status,404);
  const owned=await req(alpha,'GET','/campaigns/'+camp+'/contacts');
  assert.equal(owned.status,200);
  assert.equal(owned.data.contacts.length,2);
  assert.ok(owned.data.contacts.some(c=>c.id===privateOne));
  assert.ok(!owned.data.contacts.some(c=>c.id===b));
  assert.equal((await req(beta,'GET','/contacts/'+privateOne+'/timeline')).status,404);
  assert.equal((await req(owner,'GET','/contacts/'+privateOne+'/timeline')).status,404,
   'Owner must not see another user private donor');
  assert.equal((await req(alpha,'GET','/contacts/'+b+'/timeline')).status,404);
  const good=await profile(alpha,{stage:'followup',priority:'high',tags:['געטראפן','חשוב'],nextFollowupAt:'2026-01-01T08:00:00Z'});
  assert.equal(good.status,200);
  assert.equal(good.data.stage,'followup');
  assert.equal((await profile(alpha,{stage:'hacked',priority:'high',tags:[]})).status,400);
  assert.equal((await profile(alpha,{stage:'followup',priority:'high',tags:['a','A']})).status,400);
  const overdue=await req(alpha,'GET','/campaigns/'+camp+'/contacts?overdue=true');
  assert.equal(overdue.status,200);
  assert.equal(overdue.data.contacts.length,1);
  assert.equal(overdue.data.contacts[0].id,a);
  await pool.query("INSERT INTO cc_assignments(organization_id,campaign_id,assignee_subject,title,priority,due_at) VALUES($1,$2,$3,'Alpha overdue priority','critical','2026-01-01T06:00:00Z')",[org,camp,alpha]);
  await pool.query("INSERT INTO cc_assignments(organization_id,campaign_id,assignee_subject,title,priority,due_at) VALUES($1,$2,$3,'Beta private team task','critical','2026-01-01T05:00:00Z')",[org,camp,beta]);
  const clarityA=await req(alpha,'GET','/campaigns/'+camp+'/clarity');
  assert.equal(clarityA.status,200);
  assert.equal(clarityA.data.noAiClaims,true);
  assert.ok(clarityA.data.recommendations.some(x=>x.source==='crm_followup'&&x.id===a));
  assert.ok(clarityA.data.recommendations.some(x=>x.title==='Alpha overdue priority'));
  assert.ok(!clarityA.data.recommendations.some(x=>x.title==='Beta private team task'));
  const clarityB=await req(beta,'GET','/campaigns/'+camp+'/clarity');
  assert.equal(clarityB.status,200);
  assert.ok(!clarityB.data.recommendations.some(x=>x.id===a));
  assert.ok(clarityB.data.recommendations.some(x=>x.title==='Beta private team task'));
  assert.equal((await req(outsider,'GET','/campaigns/'+camp+'/clarity')).status,404);
  const note='Do not put secret note in shared audit logs';
  const added=await req(alpha,'POST','/contacts/'+a+'/interactions',{kind:'meeting',note});
  assert.equal(added.status,201);
  assert.equal((await req(beta,'GET','/contacts/'+a+'/timeline')).status,404);
  const history=await req(owner,'GET','/contacts/'+a+'/timeline');
  assert.equal(history.status,200);
  assert.equal(history.data.timeline.length,2);
  assert.ok(history.data.timeline.some(t=>t.kind==='call'));
  assert.ok(history.data.timeline.some(t=>t.note===note));
  assert.ok(!JSON.stringify(history.data).includes('Personal PRIVATE donor'));
  assert.equal((await req(audit,'POST','/contacts/'+a+'/interactions',{kind:'email',note:'not allowed'})).status,403);
  const shared=await pool.query("SELECT details FROM cc_activity_events WHERE campaign_id=$1 AND event_type='crm.interaction_added'",[camp]);
  assert.equal(shared.rowCount,1);
  assert.ok(!JSON.stringify(shared.rows).includes(note),'Notes must never enter shared audit details');
  await assert.rejects(pool.query('DELETE FROM cc_pro_contact_interactions WHERE id=$1',[added.data.id]),/append-only/);
  await pool.query("UPDATE cc_memberships SET membership_status='revoked' WHERE organization_id=$1 AND subject=$2",[org,alpha]);
  assert.equal((await req(alpha,'GET','/contacts/'+a+'/timeline')).status,404);
 }finally{await new Promise(ok=>server.close(ok));await pool.end();}
});
