import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import express from 'express';
import pg from 'pg';
import personalRouter from '../server/personal.js';
import {CAMPAIGN_PLANS,PLAN_FEATURES} from '../src/plan-catalog.js';

const connection=process.env.TEST_DATABASE_URL;
if(!connection)throw new Error('TEST_DATABASE_URL required');
if(!['127.0.0.1','localhost'].includes(new URL(connection).hostname))
  throw new Error('Refusing to test a non-local database');
const pool=new pg.Pool({connectionString:connection,max:4});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const trim=(x,max)=>typeof x==='string'?x.trim().slice(0,max):'';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x);

test('six plans have accurate cumulative features and explicit capacities',()=>{
 assert.equal(CAMPAIGN_PLANS.length,6);
 assert.equal(PLAN_FEATURES.length,34);
 assert.deepEqual(CAMPAIGN_PLANS.map(p=>p.code),
  ['personal_askan','chesed_quick','askan_pro','gabbai_pro','organization','custom']);
 for(let i=1;i<6;i++)for(const code of CAMPAIGN_PLANS[i-1].features)
  assert.ok(CAMPAIGN_PLANS[i].features.includes(code),'Lost inherited feature '+code);
 assert.deepEqual(CAMPAIGN_PLANS.slice(0,5).map(p=>p.members),[1,5,25,100,500]);
 assert.deepEqual(CAMPAIGN_PLANS.slice(0,5).map(p=>p.goals),[0,3,20,100,500]);
 assert.deepEqual(CAMPAIGN_PLANS.slice(0,5).map(p=>p.campaigns),[0,1,1,3,50]);
 assert.equal(CAMPAIGN_PLANS[5].members,null,'Never pretend 9999 means unlimited');
 assert.equal(CAMPAIGN_PLANS[0].features.includes('contacts'),false,'No contacts for free tier');
 assert.equal(CAMPAIGN_PLANS[4].features.includes('hotline'),false);
});

test('private personal tasks/notes/followups are server-backed and strictly owner scoped',async()=>{
 const sql=await readFile(join(import.meta.dirname,'../db/013_personal_askan.sql'),'utf8');
 await pool.query(sql); // Disposable local GitHub Actions database only.
 const prefix='personal-ci-'+Date.now()+'-';
 const owners=[prefix+'a',prefix+'b'];
 const app=express();app.use(express.json({limit:'32kb'}));
 app.use('/api/personal',(req,_res,next)=>{req.userId=req.get('x-test-user')||'stranger';next();});
 app.use('/api/personal',personalRouter({pool,bad,trim,uuid}));
 app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port+'/api/personal/items';
 async function call(user,method='GET',path='',data){
  const r=await fetch(base+path,{method,headers:{'x-test-user':user,...(data?{'Content-Type':'application/json'}:{})},
   ...(data?{body:JSON.stringify(data)}:{})});
  return {status:r.status,data:await r.json()};
 }
 try{
  const a=await call(owners[0],'POST','',{title:'א פריוואטע נאטיץ',kind:'note',details:'Only A'});
  assert.equal(a.status,201);
  const task=await call(owners[0],'POST','',{title:'Call tomorrow',kind:'followup',dueAt:'2026-10-18T10:00:00Z'});
  assert.equal(task.status,201);
  const other=await call(owners[1]);
  assert.deepEqual(other.data.items,[]);
  const blocked=await call(owners[1],'PATCH','/'+a.data.id,{status:'done'});
  assert.equal(blocked.status,404);
  const b=await call(owners[1],'POST','',{title:'Only B',kind:'task'});
  assert.equal(b.status,201);
  const aItems=await call(owners[0]);
  assert.equal(aItems.data.items.length,2);
  assert.ok(!aItems.data.items.some(x=>x.title==='Only B'));
  assert.equal((await call(owners[0],'PATCH','/'+a.data.id,{status:'done'})).status,200);
  assert.equal((await call(owners[0],'PATCH','/'+a.data.id,{status:'archived'})).status,200);
  const visible=await call(owners[0]);
  assert.equal(visible.data.items.length,1);
  assert.equal((await call(owners[0],'POST','',{title:'',kind:'note'})).status,400);
  assert.equal((await call(owners[0],'POST','',{title:'Test',kind:'unsupported'})).status,400);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  await pool.query('DELETE FROM cc_personal_items WHERE owner_subject=ANY($1::text[])',[owners]);
  await pool.end();
 }
});
