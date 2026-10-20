import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import express from 'express';
import pg from 'pg';
import askanProRouter from '../server/askan-pro.js';

const uri=process.env.TEST_DATABASE_URL;
if(!uri||!['localhost','127.0.0.1'].includes(new URL(uri).hostname)||
 new URL(uri).pathname!=='/campaign_qa')
 throw Error('Clarity acceptance only runs on disposable campaign_qa');
const pool=new pg.Pool({connectionString:uri,max:4});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const trim=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const log=async()=>{};
async function campaignAccess(db,cid,who){
 if(!uuid(cid))throw bad(400,'Invalid campaign');
 const r=await db.query("SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m"+
  " ON m.organization_id=c.organization_id AND m.subject=$2 AND m.membership_status='active'"+
  " WHERE c.id=$1",[cid,who]);
 if(!r.rowCount)throw bad(404,'Campaign not found');
 const c=r.rows[0];
 if(!['owner','manager','finance','auditor'].includes(c.role)){
  const m=await db.query("SELECT 1 FROM cc_campaign_members WHERE organization_id=$1 AND campaign_id=$2 AND subject=$3",
   [c.organization_id,c.id,who]);
  if(!m.rowCount)throw bad(404,'Campaign not found');
 }
 return c;
}
test('Clarity considers 380 real candidate rows, including older urgent work and CRM beyond former 50 cap',async()=>{
 for(const file of ['001_core.sql','002_team_connect.sql','017_askan_pro_crm.sql'])
  await pool.query(await readFile(join(import.meta.dirname,'../db',file),'utf8'));
 const salt='clarity-qa-'+Date.now()+'-'+Math.random().toString(36).slice(2);
 const owner=salt+'owner',a=salt+'memberA',b=salt+'memberB',captain=salt+'leader',outside=salt+'outside';
 const org=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Clarity QA',$1) RETURNING id",[owner])).rows[0].id;
 const foreign=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Other QA',$1) RETURNING id",[outside])).rows[0].id;
 for(const [o,person,role] of [[org,owner,'owner'],[org,a,'askan'],[org,b,'askan'],
  [org,captain,'squad_leader'],[foreign,outside,'owner']])
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at)"+
   " VALUES($1,$2,$3,'active',now())",[o,person,role]);
 const cid=(await pool.query(
  "INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Clarity stress','active') RETURNING id",
  [org])).rows[0].id;
 for(const [person,team] of [[a,'A'],[b,'B'],[captain,'A']])
  await pool.query(
   "INSERT INTO cc_campaign_members(organization_id,campaign_id,subject,team_name) VALUES($1,$2,$3,$4)",
   [org,cid,person,team]);
 // 260 normal tasks have earlier due dates than the special candidate sorting
 // in the legacy query but are not overdue; the old endpoint truncated at 50.
 await pool.query(
  "INSERT INTO cc_assignments(organization_id,campaign_id,assignee_subject,title,priority,due_at)"+
  " SELECT $1,$2,$3,'Later standard '||gs::text,'normal',now()+interval '2 days'"+
  " FROM generate_series(1,260) gs",[org,cid,a]);
 const urgent=(await pool.query(
  "INSERT INTO cc_assignments(organization_id,campaign_id,assignee_subject,title,priority,due_at,created_at)"+
  " VALUES($1,$2,$3,'Old overdue urgent key','critical',now()-interval '50 days',now()-interval '60 days')"+
  " RETURNING id",[org,cid,a])).rows[0].id;
 await pool.query(
  "INSERT INTO cc_assignments(organization_id,campaign_id,assignee_subject,title,priority,due_at)"+
  " VALUES($1,$2,$3,'Team B private overdue','critical',now()-interval '70 days')",
  [org,cid,b]);
 await pool.query(
  "INSERT INTO cc_contacts(organization_id,campaign_id,created_by,display_name,phone,privacy,assigned_team)"+
  " SELECT $1,$2,$3,'Followup '||gs::text,'2125551234','campaign','A'"+
  " FROM generate_series(1,120) gs",[org,cid,a]);
 await pool.query(
  "INSERT INTO cc_pro_contact_profiles(organization_id,campaign_id,contact_id,stage,priority,next_followup_at,last_updated_by)"+
  " SELECT $1,$2,id,'followup','normal',now()+interval '2 days',$3"+
  " FROM cc_contacts WHERE organization_id=$1 AND campaign_id=$2",[org,cid,a]);
 const bestContact=(await pool.query(
  "INSERT INTO cc_contacts(organization_id,campaign_id,created_by,display_name,phone,privacy,assigned_team)"+
  " VALUES($1,$2,$3,'Critical CRM overdue','2125557777','campaign','A') RETURNING id",
  [org,cid,a])).rows[0].id;
 await pool.query(
  "INSERT INTO cc_pro_contact_profiles(organization_id,campaign_id,contact_id,stage,priority,next_followup_at,last_updated_by)"+
  " VALUES($1,$2,$3,'followup','high',now()-interval '30 days',$4)",
  [org,cid,bestContact,a]);
 for(const [name,dnc,team,privacy] of [
  ['DNC protected',true,'A','campaign'],
  ['Private another team',false,'B','private'],
  ['Empty team secret',false,'','campaign']
 ]){
  const id=(await pool.query(
   "INSERT INTO cc_contacts(organization_id,campaign_id,created_by,display_name,phone,privacy,assigned_team,do_not_call)"+
   " VALUES($1,$2,$3,$4,'2125554444',$5,$6,$7) RETURNING id",
   [org,cid,b,name,privacy,team,dnc])).rows[0].id;
  await pool.query(
   "INSERT INTO cc_pro_contact_profiles(organization_id,campaign_id,contact_id,stage,priority,next_followup_at,last_updated_by)"+
   " VALUES($1,$2,$3,'followup','high',now()-interval '90 days',$4)",
   [org,cid,id,b]);
 }
 const app=express();app.use(express.json());
 app.use('/api/pro',(req,_res,next)=>{req.userId=req.get('x-qa-user')||'';next();},
  askanProRouter({pool,campaignAccess,bad,trim,log}));
 app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));
 const server=await new Promise(done=>{const s=app.listen(0,'127.0.0.1',()=>done(s));});
 async function read(who){
  const res=await fetch('http://127.0.0.1:'+server.address().port+
   '/api/pro/campaigns/'+cid+'/clarity',{headers:{'x-qa-user':who}});
  return {status:res.status,data:await res.json(),cache:res.headers.get('cache-control')};
 }
 try{
  assert.equal((await read(outside)).status,404);
  const mine=await read(a);
  assert.equal(mine.status,200,JSON.stringify(mine.data));
  assert.equal(mine.data.eligibleTotal,382);
  assert.equal(mine.data.limit,5);
  assert.equal(mine.data.recommendations.length,5);
  assert.equal(mine.data.allEligibleActionsConsidered,true);
  assert.equal(mine.data.noAiClaims,true);
  assert.match(mine.cache,/no-store/);
  assert.equal(mine.data.recommendations[0].id,urgent);
  assert.ok(mine.data.recommendations.some(x=>x.id===bestContact));
  assert.ok(!JSON.stringify(mine.data).includes('Team B private overdue'));
  assert.ok(!JSON.stringify(mine.data).includes('DNC protected'));
  assert.ok(!JSON.stringify(mine.data).includes('Empty team secret'));
  const leader=await read(captain);
  assert.equal(leader.status,200);
  assert.equal(leader.data.eligibleTotal,382);
  assert.ok(leader.data.recommendations.some(x=>x.id===urgent));
  const ownerView=await read(owner);
  assert.equal(ownerView.status,200);
  assert.equal(ownerView.data.eligibleTotal,384);
  // A private contact owned by someone else must not be counted at owner level.
  assert.ok(ownerView.data.recommendations.every(x=>x.title!=='Private another team'));
  await pool.query("UPDATE cc_contacts SET do_not_call=true WHERE id=$1",[bestContact]);
  const afterDnc=await read(a);
  assert.equal(afterDnc.data.eligibleTotal,381);
  assert.ok(afterDnc.data.recommendations.every(x=>x.id!==bestContact));
  await pool.query("UPDATE cc_memberships SET membership_status='revoked'"+
   " WHERE organization_id=$1 AND subject=$2",[org,a]);
  assert.equal((await read(a)).status,404);
 }finally{await new Promise(ok=>server.close(ok));await pool.end();}
});
