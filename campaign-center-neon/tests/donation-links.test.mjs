import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import express from 'express';
import pg from 'pg';
import donationLinksRouter from '../server/donation-links.js';

const connection=process.env.TEST_DATABASE_URL;
if(!connection||!['localhost','127.0.0.1'].includes(new URL(connection).hostname))
 throw Error('Refuse external database in campaign donation link tests');
const pool=new pg.Pool({connectionString:connection,max:4});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const trim=(x,max)=>typeof x==='string'?x.trim().slice(0,max):'';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x);
const need=(role,allowed)=>{if(!allowed.includes(role))throw bad(403,'Forbidden');};
async function campaignAccess(db,id,subject){
 if(!uuid(id))throw bad(400,'Invalid campaign');
 const r=await db.query("SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m ON m.organization_id=c.organization_id AND m.subject=$2 AND m.membership_status='active' WHERE c.id=$1",[id,subject]);
 if(!r.rowCount)throw bad(404,'Not found');
 const c=r.rows[0];
 if(!['owner','manager','finance','auditor'].includes(c.role)){
  const user=await db.query('SELECT 1 FROM cc_campaign_members WHERE campaign_id=$1 AND subject=$2',[id,subject]);
  if(!user.rowCount)throw bad(404,'No campaign access');
 }
 return c;
}
const log=(db,org,camp,user,event,target,details)=>
 db.query('INSERT INTO cc_activity_events(organization_id,campaign_id,actor_subject,event_type,target_id,details) VALUES($1,$2,$3,$4,$5,$6)',[org,camp,user,event,target,JSON.stringify(details||{})]);

test('external HTTPS donation links are tenant-scoped manager settings, NOT payments',async()=>{
 await pool.query(await readFile(join(import.meta.dirname,'../db/014_campaign_external_donation_link.sql'),'utf8'));
 const unique='links-ci-'+Date.now();
 const org=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES($1,$2) RETURNING id",['Org test',unique+'owner'])).rows[0].id;
 const otherOrg=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES($1,$2) RETURNING id",['Other',unique+'outside'])).rows[0].id;
 for(const [oid,user,role] of [[org,unique+'owner','owner'],[org,unique+'askan','askan'],[otherOrg,unique+'outside','owner']])
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status) VALUES($1,$2,$3,'active')",[oid,user,role]);
 const camp=(await pool.query("INSERT INTO cc_campaigns(organization_id,title) VALUES($1,'Donation link test') RETURNING id",[org])).rows[0].id;
 await pool.query('INSERT INTO cc_campaign_members(organization_id,campaign_id,subject) VALUES($1,$2,$3)',[org,camp,unique+'askan']);
 const app=express();app.use(express.json());
 app.use('/api/donation-links',(req,_res,next)=>{req.userId=req.get('x-test-user')||'anonymous';next();});
 app.use('/api/donation-links',donationLinksRouter({pool,campaignAccess,need,bad,trim,log}));
 app.use((err,_req,res,_next)=>res.status(err.status||500).json({error:err.message}));
 const server=await new Promise(ok=>{const s=app.listen(0,'127.0.0.1',()=>ok(s));});
 async function call(user,method='GET',body){
  const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/donation-links/'+camp,{
   method,headers:{'x-test-user':user,...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,data:await r.json()};
 }
 try{
  const owner=unique+'owner',askan=unique+'askan',outside=unique+'outside';
  assert.equal((await call(outside)).status,404);
  assert.equal((await call(askan,'PUT',{url:'https://donations.example.org/support',providerName:'Example'})).status,403);
  for(const badUrl of ['http://example.org','javascript:alert(1)','https://localhost:3000','https://127.0.0.1/test','https://who:secret@example.org']){
   assert.equal((await call(owner,'PUT',{url:badUrl,providerName:'Test'})).status,400,badUrl);
  }
  const saved=await call(owner,'PUT',{url:'https://donations.example.org/support',providerName:'Example'});
  assert.equal(saved.status,200);
  assert.equal(saved.data.verifiedPayments,false);
  const visible=await call(askan);
  assert.equal(visible.status,200);
  assert.equal(visible.data.link.provider_name,'Example');
  assert.equal(visible.data.link.donation_url,'https://donations.example.org/support');
  assert.equal((await call(owner,'PUT',{url:'',providerName:''})).status,200);
  assert.equal((await call(askan)).data.link,null);
  const audit=await pool.query("SELECT event_type,details FROM cc_activity_events WHERE campaign_id=$1 AND event_type LIKE 'donation_link.%' ORDER BY created_at",[camp]);
  assert.equal(audit.rowCount,2);
  assert.equal(audit.rows[0].event_type,'donation_link.updated');
  assert.equal(audit.rows[1].event_type,'donation_link.cleared');
  assert.ok(!JSON.stringify(audit.rows).includes('https://donations.example.org/support'),'Do not log full private URL');
 }finally{
  await new Promise(resolve=>server.close(resolve));
  await pool.end();
 }
});
