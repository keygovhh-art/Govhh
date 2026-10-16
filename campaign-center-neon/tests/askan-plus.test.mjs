import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import express from 'express';
import pg from 'pg';
import askanPlusRouter from '../server/askan-plus.js';

const connection=process.env.TEST_DATABASE_URL;
if(!connection||!['localhost','127.0.0.1'].includes(new URL(connection).hostname))
 throw Error('REFUSED: never run Askan Plus tests on remote/production Postgres');
const pool=new pg.Pool({connectionString:connection,max:4});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const trim=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const need=(role,roles)=>{if(!roles.includes(role))throw bad(403,'No permission');};
const log=(db,org,camp,user,event,target,details)=>db.query(
 'INSERT INTO cc_activity_events(organization_id,campaign_id,actor_subject,event_type,target_id,details) VALUES($1,$2,$3,$4,$5,$6)',
 [org,camp,user,event,target,JSON.stringify(details||{})]);
async function campaignAccess(db,cid,subject){
 if(!uuid(cid))throw bad(400,'Invalid campaign');
 const r=await db.query("SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m ON m.organization_id=c.organization_id AND m.subject=$2 AND m.membership_status='active' WHERE c.id=$1",[cid,subject]);
 if(!r.rowCount)throw bad(404,'No campaign');
 const c=r.rows[0];
 if(!['owner','manager','finance','auditor'].includes(c.role)){
  const a=await db.query('SELECT 1 FROM cc_campaign_members WHERE campaign_id=$1 AND subject=$2',[cid,subject]);
  if(!a.rowCount)throw bad(404,'No member');
 }
 return c;
}

test('Askan Plus: each member has private KPIs; manager teams totals; handoff is permissioned and audited',async()=>{
 // Reviewed base schema is safe to re-apply only to this disposable CI instance.
 for(const file of ['001_core.sql','002_team_connect.sql','015_donation_levels.sql'])
  await pool.query(await readFile(join(import.meta.dirname,'../db',file),'utf8'));
 const unique='ap-ci-'+Date.now();
 const owner=unique+'owner',leader=unique+'leader',a=unique+'askana',b=unique+'askanb',c=unique+'askanc',outsider=unique+'outside';
 const org=(await pool.query('INSERT INTO cc_organizations(name,owner_subject) VALUES($1,$2) RETURNING id',['AP test',owner])).rows[0].id;
 const otherOrg=(await pool.query('INSERT INTO cc_organizations(name,owner_subject) VALUES($1,$2) RETURNING id',['Other org',outsider])).rows[0].id;
 for(const [oid,who,role] of [[org,owner,'owner'],[org,leader,'squad_leader'],[org,a,'askan'],[org,b,'askan'],[org,c,'askan'],[otherOrg,outsider,'owner']])
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at) VALUES($1,$2,$3,'active',now())",[oid,who,role]);
 const campaign=(await pool.query("INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Plus campaign','active') RETURNING id",[org])).rows[0].id;
 for(const [who,team] of [[owner,''],[leader,'A'],[a,'A'],[b,'B'],[c,'A']])
  await pool.query('INSERT INTO cc_campaign_members(organization_id,campaign_id,subject,team_name) VALUES($1,$2,$3,$4)',[org,campaign,who,team]);
 const task=(await pool.query("INSERT INTO cc_assignments(organization_id,campaign_id,assignee_subject,title,priority) VALUES($1,$2,$3,'Call first donor','high') RETURNING id",[org,campaign,a])).rows[0].id;
 for(const [who,kind,amt,n] of [[a,'pledge','100','p'],[a,'receipt','40','r'],[a,'refund','10','rev'],[b,'pledge','200','other']])
  await pool.query('INSERT INTO cc_finance_events(organization_id,campaign_id,credited_member_subject,source_system,source_event_key,event_kind,amount) VALUES($1,$2,$3,$4,$5,$6,$7)',
   [org,campaign,who,'ap-ci',unique+n,kind,amt]);
 const contact=(await pool.query("INSERT INTO cc_contacts(organization_id,campaign_id,created_by,display_name,privacy) VALUES($1,$2,$3,'QA Donor','campaign') RETURNING id",[org,campaign,owner])).rows[0].id;
 for(const [who,outcome] of [[a,'spoke'],[b,'callback']])
  await pool.query('INSERT INTO cc_call_events(organization_id,campaign_id,contact_id,member_subject,outcome) VALUES($1,$2,$3,$4,$5)',[org,campaign,contact,who,outcome]);
 const app=express();app.use(express.json());
 app.use('/api/plus',(req,_res,next)=>{req.userId=req.get('x-ci-user')||'anonymous';next();});
 app.use('/api/plus',askanPlusRouter({pool,campaignAccess,need,bad,uuid,trim,log}));
 app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}));
 const server=await new Promise(resolve=>{const srv=app.listen(0,'127.0.0.1',()=>resolve(srv));});
 async function request(who,method,path,body){
  const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/plus'+path,{method,
   headers:{'x-ci-user':who,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,data:await r.json()};
 }
 const get=(user,path)=>request(user,'GET',path);
 const patch=(user,path,body)=>request(user,'PATCH',path,body);
 try {
  assert.equal((await get(outsider,'/campaigns/'+campaign+'/member-desk')).status,404);
  const my=await get(a,'/campaigns/'+campaign+'/member-desk');
  assert.equal(my.status,200);
  assert.equal(my.data.scope,'only_authenticated_member');
  assert.equal(my.data.subject,a);
  assert.equal(my.data.tasks.open,1);
  assert.equal(my.data.calls.total,1);
  assert.equal(Number(my.data.finance.pledged),100);
  assert.equal(Number(my.data.finance.manually_reported_net),30);
  assert.ok(!JSON.stringify(my.data).includes('200'),'A must not see B pledge');
  assert.equal((await get(a,'/campaigns/'+campaign+'/teams-report')).status,403);
  assert.equal((await get(leader,'/campaigns/'+campaign+'/teams-report')).status,403);
  const report=await get(owner,'/campaigns/'+campaign+'/teams-report?days=7');
  assert.equal(report.status,200);
  assert.equal(report.data.recordsAreManualNotProviderVerified,true);
  const ta=report.data.teams.find(t=>t.teamName==='A');
  const tb=report.data.teams.find(t=>t.teamName==='B');
  assert.equal(ta.activeMembers,3);
  assert.equal(ta.tasks,1);
  assert.equal(ta.calls,1);
  assert.equal(Number(ta.manuallyReportedNet),30);
  assert.equal(tb.activeMembers,1);
  assert.equal(Number(tb.pledged),200);
  assert.ok(!JSON.stringify(report.data).includes('QA Donor'),'Never export donor identity');
  assert.equal((await get(owner,'/campaigns/'+campaign+'/teams-report?days=999')).status,400);
  const amounts='/campaigns/'+campaign+'/donation-levels';
  assert.equal((await get(outsider,amounts)).status,404);
  async function put(who,values) {
   const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/plus'+amounts,{
    method:'PUT',headers:{'x-ci-user':who,'content-type':'application/json'},
    body:JSON.stringify({levels:values})});return {status:r.status,data:await r.json()};
  }
  const presets=[{amount:'50',label:'ברכה'},{amount:'150',label:'נדבה'},{amount:'1000',label:'גדולה'}];
  assert.equal((await put(a,presets)).status,403);
  assert.equal((await put(owner,[{amount:'-10',label:'bad'}])).status,400);
  assert.equal((await put(owner,[{amount:'50',label:'test'},{amount:'150',label:'TEST'}])).status,400);
  const saved=await put(owner,presets);
  assert.equal(saved.status,200);
  assert.equal(saved.data.levels.length,3);
  assert.equal(saved.data.paymentProcessing,false);
  const memberPresets=await get(a,amounts);
  assert.equal(memberPresets.status,200);
  assert.equal(Number(memberPresets.data.levels[1].amount),150);
  const otherCannotSee=await get(outsider,amounts);
  assert.equal(otherCannotSee.status,404);
  assert.equal((await put(owner,[])).status,200);
  assert.deepEqual((await get(a,amounts)).data.levels,[]);
  const presetAudit=await pool.query("SELECT COUNT(*)::int total FROM cc_activity_events WHERE campaign_id=$1 AND event_type='donation_levels.updated'",[campaign]);
  assert.equal(presetAudit.rows[0].total,2,'All level edits leave audit events');
  const handoff='/tasks/'+task+'/handoff';
  assert.equal((await patch(outsider,handoff,{assigneeSubject:b})).status,404);
  assert.equal((await patch(a,handoff,{assigneeSubject:c})).status,403);
  assert.equal((await patch(leader,handoff,{assigneeSubject:b})).status,403);
  assert.equal((await patch(leader,handoff,{assigneeSubject:c,dueAt:'tomorrow'})).status,400);
  const changed=await patch(leader,handoff,{assigneeSubject:c,dueAt:'2026-10-20T09:00:00-04:00'});
  assert.equal(changed.status,200);
  assert.equal(changed.data.assignee_subject,c);
  assert.equal(new Date(changed.data.due_at).toISOString(),'2026-10-20T13:00:00.000Z');
  const repeated=await patch(leader,handoff,{assigneeSubject:c,dueAt:'2026-10-20T13:00:00Z'});
  assert.equal(repeated.status,200);
  assert.equal(repeated.data.unchanged,true);
  const manager=await patch(owner,handoff,{assigneeSubject:b});
  assert.equal(manager.status,200);
  const audit=await pool.query("SELECT actor_subject,details FROM cc_activity_events WHERE campaign_id=$1 AND event_type='task.handed_off'",[campaign]);
  assert.equal(audit.rowCount,2,'Exactly two real handoff events');
  assert.equal(audit.rows[0].actor_subject,leader);
  assert.equal(audit.rows[1].actor_subject,owner);
  await pool.query("UPDATE cc_assignments SET status='done' WHERE id=$1",[task]);
  assert.equal((await patch(owner,handoff,{assigneeSubject:a})).status,409);
 }finally{await new Promise(resolve=>server.close(resolve));await pool.end();}
});
