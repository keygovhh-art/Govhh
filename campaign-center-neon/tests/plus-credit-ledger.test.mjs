import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import express from 'express';
import pg from 'pg';
import askanPlusRouter from '../server/askan-plus.js';

const url=process.env.TEST_DATABASE_URL;
if(!url||!['127.0.0.1','localhost'].includes(new URL(url).hostname))
 throw Error('Refuse nonlocal ledger credit tests');
const pool=new pg.Pool({connectionString:url,max:4});
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const bad=(status,message)=>Object.assign(new Error(message),{status});
const need=(r,allowed)=>{if(!allowed.includes(r))throw bad(403,'Not allowed');};
const trim=(v,n=180)=>String(v??'').trim().slice(0,n);
async function campaignAccess(db,id,subject){
 if(!uuid(id))throw bad(400,'Invalid campaign');
 const q=await db.query(
  "SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m"+
  " ON m.organization_id=c.organization_id AND m.subject=$2 AND m.membership_status='active'"+
  " WHERE c.id=$1",[id,subject]);
 if(!q.rowCount)throw bad(404,'Campaign not found');
 const c=q.rows[0];
 if(!['owner','manager','finance','auditor'].includes(c.role)){
  const found=await db.query(
   "SELECT 1 FROM cc_campaign_members WHERE organization_id=$1 AND campaign_id=$2 AND subject=$3",
   [c.organization_id,c.id,subject]);
  if(!found.rowCount)throw bad(404,'Not in campaign');
 }
 return c;
}
const log=async()=>{};
test('Credit history covers 503 people, 2 currencies, exited workers and unaffiliated money without cross-tenant leaks',async()=>{
 for(const name of ['001_core.sql','002_team_connect.sql']){
  await pool.query(await readFile(join(import.meta.dirname,'../db',name),'utf8'));
 }
 const salt='ledger-'+Date.now()+'-'+Math.random().toString(36).slice(2)+'-';
 const owner=salt+'owner',outsider=salt+'outsider',org=(await pool.query(
  "INSERT INTO cc_organizations(name,owner_subject) VALUES('Credit QA',$1) RETURNING id",
  [owner])).rows[0].id;
 const foreign=(await pool.query(
  "INSERT INTO cc_organizations(name,owner_subject) VALUES('Foreign charity',$1) RETURNING id",
  [outsider])).rows[0].id;
 await pool.query(
  "INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at)"+
  " VALUES($1,$2,'owner','active',now()),($3,$4,'owner','active',now())",
  [org,owner,foreign,outsider]);
 const camp=(await pool.query(
  "INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Ledger QA','active') RETURNING id",
  [org])).rows[0].id;
 await pool.query(
  "INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at)"+
  " SELECT $1,$2||gs::text,'askan',CASE WHEN gs=2 THEN 'revoked' ELSE 'active' END,now()"+
  " FROM generate_series(1,503) gs",[org,salt]);
 const member=salt+'1';
 await pool.query(
  "INSERT INTO cc_campaign_members(organization_id,campaign_id,subject)"+
  " VALUES($1,$2,$3)",[org,camp,member]);
 await pool.query(
  "INSERT INTO cc_finance_events(organization_id,campaign_id,credited_member_subject,"+
  " source_system,source_event_key,event_kind,amount,currency)"+
  " SELECT $1,$2,$3||gs::text,'credit-qa',$3||gs::text,'receipt',1,'USD'"+
  " FROM generate_series(1,503) gs",[org,camp,salt]);
 for(const [subject,key,kind,amount,currency] of [
  [member,'EUR','receipt','90','EUR'],
  [member,'refund','refund','10','USD'],
  [member,'correction','correction','5','USD'],
  [null,'unassigned','receipt','120','USD']]){
  await pool.query(
   "INSERT INTO cc_finance_events(organization_id,campaign_id,credited_member_subject,"+
   " source_system,source_event_key,event_kind,amount,currency)"+
   " VALUES($1,$2,$3,'credit-qa',$4,$5,$6,$7)",
   [org,camp,subject,salt+key,kind,amount,currency]);
 }
 const app=express();app.use(express.json());
 app.use('/api/plus',(req,_res,next)=>{req.userId=req.get('x-user')||'';next();},
  askanPlusRouter({pool,campaignAccess,need,bad,uuid,trim,log}));
 app.use((err,_req,res,_next)=>res.status(err.status||500).json({error:err.message}));
 const server=await new Promise(done=>{const s=app.listen(0,'127.0.0.1',()=>done(s));});
 const req=async(user,page=1,id=camp)=>{
  const response=await fetch('http://127.0.0.1:'+server.address().port+
   '/api/plus/campaigns/'+id+'/credit-report?page='+page,{headers:{'x-user':user}});
  return {status:response.status,data:await response.json(),
   cache:response.headers.get('cache-control')};
 };
 try{
  assert.equal((await req(outsider)).status,404,'Other organizations do not see private credit');
  assert.equal((await req(owner,0)).status,400);
  assert.equal((await req(owner,'invalid')).status,400);
  const first=await req(owner);
  assert.equal(first.status,200,JSON.stringify(first.data));
  assert.equal(first.data.totalCreditRows,504);
  assert.equal(first.data.limit,100);
  assert.equal(first.data.pageCount,6);
  assert.equal(first.data.shown,100);
  assert.equal(first.data.allMemberStatusesRetained,true);
  assert.equal(first.data.manualNotProcessorVerified,true);
  assert.equal(first.data.allCurrenciesSeparated,true);
  assert.match(first.cache,/no-store/);
  const usd=first.data.currencyTotals.find(x=>x.currency==='USD');
  const eur=first.data.currencyTotals.find(x=>x.currency==='EUR');
  assert.equal(usd.ledger_event_count,506);
  assert.equal(usd.unattributed_events,1);
  assert.equal(Number(usd.receipts),623);
  assert.equal(Number(usd.manual_net),613);
  assert.equal(Number(usd.corrections),5);
  assert.equal(Number(eur.receipts),90);
  assert.equal(Number(eur.manual_net),90);
  const tail=await req(owner,6);
  assert.equal(tail.data.credits.length,4);
  let all=[];
  for(let p=1;p<=6;p++){
   const item=await req(owner,p);
   all.push(...item.data.credits);
  }
  assert.equal(all.length,504);
  const old=all.find(x=>x.subject===salt+'2');
  assert.ok(old,'Departed staff money is never lost');
  assert.equal(old.member_status,'revoked');
  assert.equal(old.current_campaign_member,false);
  assert.equal(all.filter(x=>x.subject===member).length,2,'Different currencies do not merge');
  assert.equal(all.filter(x=>x.subject===null).length,0,'Unassigned entries never fake attribution');
  const personal=await req(member);
  assert.equal(personal.status,200);
  assert.equal(personal.data.scope,'self');
  assert.equal(personal.data.credits.length,2);
  assert.equal(personal.data.totalCreditRows,2);
  assert.equal(personal.data.currencyTotals.some(x=>x.unattributed_events>0),false);
  assert.equal((await req(member,2)).status,403);
  assert.equal(JSON.stringify(personal.data).includes(salt+'2'),false);
 }finally{await new Promise(done=>server.close(done));await pool.end();}
});
