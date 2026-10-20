import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import express from 'express';
import pg from 'pg';
import proSprintRouter from '../server/pro-sprints.js';

const url=process.env.TEST_DATABASE_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname)||new URL(url).pathname!=='/campaign_qa')
 throw Error('Disposable local campaign_qa only');
const pool=new pg.Pool({connectionString:url,max:4});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const trim=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
async function access(db,id,subject){
 if(!uuid(id))throw bad(400,'Invalid campaign');
 const r=await db.query("SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m ON m.organization_id=c.organization_id"+
  " AND m.subject=$2 AND m.membership_status='active' WHERE c.id=$1",[id,subject]);
 if(!r.rowCount)throw bad(404,'Campaign missing');
 const c=r.rows[0];if(!['owner','manager','finance','auditor'].includes(c.role)){
  const m=await db.query("SELECT 1 FROM cc_campaign_members WHERE organization_id=$1 AND campaign_id=$2 AND subject=$3",
   [c.organization_id,id,subject]);if(!m.rowCount)throw bad(404,'Campaign missing');
 }
 return c;
}
test('Personal 7-day Sprint and 30-day memory retain 23 plans, 230 changes and private total pagination',async()=>{
 for(const name of ['001_core.sql','002_team_connect.sql','018_askan_pro_focus_sprints.sql'])
  await pool.query(await readFile(join(import.meta.dirname,'../db',name),'utf8'));
 const tag='sprint-paging-'+Date.now()+'-'+Math.random().toString(36).slice(2);
 const owner=tag+'owner',member=tag+'member',other=tag+'other',outside=tag+'outside';
 const org=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Sprint paging QA',$1) RETURNING id",
  [owner])).rows[0].id;
 const foreign=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Outside',$1) RETURNING id",
  [outside])).rows[0].id;
 for(const [oid,user,role] of [[org,owner,'owner'],[org,member,'askan'],
  [org,other,'askan'],[foreign,outside,'owner']])
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at)"+
   " VALUES($1,$2,$3,'active',now())",[oid,user,role]);
 const camp=(await pool.query("INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Memory QA','active') RETURNING id",
  [org])).rows[0].id;
 for(const who of [member,other])
  await pool.query("INSERT INTO cc_campaign_members(organization_id,campaign_id,subject) VALUES($1,$2,$3)",
   [org,camp,who]);
 await pool.query(
  "INSERT INTO cc_pro_sprints(organization_id,campaign_id,owner_subject,title,starts_on,status)"+
  " SELECT $1,$2,$3,'Sprint history '||gs::text,current_date,'archived'"+
  " FROM generate_series(1,23) gs",[org,camp,member]);
 const selected=(await pool.query(
  "SELECT id FROM cc_pro_sprints WHERE organization_id=$1 AND owner_subject=$2 LIMIT 1",
  [org,member])).rows[0].id;
 await pool.query(
  "INSERT INTO cc_pro_sprint_activity(sprint_id,owner_subject,event_type,recorded_at)"+
  " SELECT $1,$2,'created',now()-interval '1 day'"+
  " FROM generate_series(1,230)",[selected,member]);
 const another=(await pool.query(
  "INSERT INTO cc_pro_sprints(organization_id,campaign_id,owner_subject,title,starts_on,status)"+
  " VALUES($1,$2,$3,'Other person private',current_date,'open') RETURNING id",
  [org,camp,other])).rows[0].id;
 await pool.query(
  "INSERT INTO cc_pro_sprint_activity(sprint_id,owner_subject,event_type) VALUES($1,$2,'created')",
  [another,other]);
 const app=express();app.use(express.json());
 app.use('/api/pro',(req,_res,next)=>{req.userId=req.get('x-user')||'';next();},
  proSprintRouter({pool,campaignAccess:access,bad,log:async()=>{},uuid,trim}));
 app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}));
 const server=await new Promise(done=>{const s=app.listen(0,'127.0.0.1',()=>done(s));});
 const get=async(who,endpoint,page=1)=>{
  const r=await fetch('http://127.0.0.1:'+server.address().port+
   '/api/pro/campaigns/'+camp+'/'+endpoint+'?page='+page,
   {headers:{'x-user':who}});
  return {status:r.status,data:await r.json(),cache:r.headers.get('cache-control')};
 };
 try{
  assert.equal((await get(outside,'sprints')).status,404);
  assert.equal((await get(member,'sprints',0)).status,400);
  const one=await get(member,'sprints');
  assert.equal(one.status,200);
  assert.equal(one.data.total,23);
  assert.equal(one.data.pageCount,3);
  assert.equal(one.data.limit,10);
  assert.equal(one.data.allPrivateSprintsCounted,true);
  assert.match(one.cache,/no-store/);
  const ids=[];
  for(let p=1;p<=3;p++){
   const page=await get(member,'sprints',p);
   ids.push(...page.data.sprints.map(x=>x.id));
  }
  assert.equal(new Set(ids).size,23);
  assert.equal((await get(member,'sprints',3)).data.sprints.length,3);
  const personal=await get(member,'focus-history');
  assert.equal(personal.status,200);
  assert.equal(personal.data.days,30);
  assert.equal(personal.data.total,230);
  assert.equal(personal.data.pageCount,5);
  assert.equal(personal.data.limit,50);
  assert.equal(personal.data.allPrivateEventsCounted,true);
  assert.match(personal.cache,/no-store/);
  assert.equal((await get(member,'focus-history',0)).status,400);
  assert.equal((await get(member,'focus-history',5)).data.events.length,30);
  let events=[];
  for(let p=1;p<=5;p++)events.push(...(await get(member,'focus-history',p)).data.events);
  assert.equal(new Set(events.map(x=>x.id)).size,230);
  assert.equal((await get(owner,'focus-history')).data.total,0,
   'Owner cannot see private member progress');
  assert.equal((await get(other,'focus-history')).data.total,1);
  assert.equal((await get(other,'sprints')).data.total,1);
  assert.equal((await get(member,'sprints',4)).data.sprints.length,0);
  await pool.query("UPDATE cc_memberships SET membership_status='revoked' WHERE organization_id=$1 AND subject=$2",
   [org,member]);
  assert.equal((await get(member,'focus-history')).status,404);
 }finally{await new Promise(done=>server.close(done));await pool.end();}
});
