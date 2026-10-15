import {Router} from 'express';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';

// Server-side, organization-scoped Yemot HaMashiach connectivity.
// This is a SETTINGS + READ-ONLY connection test only, never launches campaigns,
// buys phone numbers, changes caller ID, or runs any expensive telephony actions.
export default function yemotRouter({pool,authenticate,member,log,bad,uuid}){
 const router=Router();
 router.use(authenticate);
 const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const encryptionKey=()=>{
  const s=process.env.YEMOT_ENCRYPTION_KEY||'';
  // Enforce EXACTLY 32 raw bytes, base64 encoded. Do not invent a fallback key.
  if(!/^[A-Za-z0-9+/]{43}=$/.test(s))throw bad(503,'Yemot secure storage is not configured on the server');
  const key=Buffer.from(s,'base64');
  if(key.length!==32||key.toString('base64')!==s)
   throw bad(503,'Yemot secure storage is not configured on the server');
  return key;
 };
 const seal=(secret,org)=>{
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);
  cipher.setAAD(Buffer.from('yemot:'+org,'utf8'));
  const encrypted=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);
  return {nonce:iv.toString('base64'),body:encrypted.toString('base64'),tag:cipher.getAuthTag().toString('base64')};
 };
 const unseal=(row,org)=>{
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(row.token_nonce,'base64'));
  decipher.setAAD(Buffer.from('yemot:'+org,'utf8'));
  decipher.setAuthTag(Buffer.from(row.token_tag,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(row.token_ciphertext,'base64')),decipher.final()]).toString('utf8');
 };
 async function gate(db,org,subject){
  if(!uuid(org))throw bad(400,'Invalid organization');
  const role=await member(db,org,subject);
  if(role!=='owner')throw bad(403,'Only an organization owner may manage its Yemot connection');
  return role;
 }
 async function tx(work){
  const db=await pool.connect();
  try{await db.query('BEGIN');const val=await work(db);await db.query('COMMIT');return val;}
  catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 router.get('/organizations/:oid',wrap(async(req,res)=>{
  await gate(pool,req.params.oid,req.userId);
  const row=(await pool.query(
   'SELECT enabled,updated_at,last_verified_at FROM cc_yemot_connections WHERE organization_id=$1',
   [req.params.oid])).rows[0];
  res.set('Cache-Control','no-store');
  res.json({configured:Boolean(row),enabled:Boolean(row?.enabled),
   storageReady:(()=>{try{encryptionKey();return true;}catch{return false;}})(),
   updatedAt:row?.updated_at||null,verifiedAt:row?.last_verified_at||null,token:'NEVER_RETURNED'});
 }));
 router.put('/organizations/:oid',wrap(async(req,res)=>{
  const raw=req.body?.token;
  if(typeof raw!=='string'||raw.length<12||raw.length>768||/\s/.test(raw)||/[^\x21-\x7e]/.test(raw))
   throw bad(400,'Invalid Yemot API token');
  // Avoid passwords/keys in audit logs, query strings, browser storage or results.
  const saved=await tx(async db=>{
   await gate(db,req.params.oid,req.userId);
   const v=seal(raw,req.params.oid);
   await db.query(
    "INSERT INTO cc_yemot_connections(organization_id,token_nonce,token_ciphertext,token_tag,enabled,updated_by) VALUES($1,$2,$3,$4,false,$5) ON CONFLICT(organization_id) DO UPDATE SET token_nonce=EXCLUDED.token_nonce,token_ciphertext=EXCLUDED.token_ciphertext,token_tag=EXCLUDED.token_tag,enabled=false,last_verified_at=NULL,last_test_attempt_at=NULL,updated_by=EXCLUDED.updated_by,updated_at=now()",
    [req.params.oid,v.nonce,v.body,v.tag,req.userId]);
   await log(db,req.params.oid,null,req.userId,'integration.yemot_saved',req.params.oid,{provider:'yemot'});
   return true;
  });
  res.json({configured:saved,enabled:false,message:'Saved encrypted. Test before enabling.'});
 }));
 router.delete('/organizations/:oid',wrap(async(req,res)=>{
  await tx(async db=>{
   await gate(db,req.params.oid,req.userId);
   await db.query('DELETE FROM cc_yemot_connections WHERE organization_id=$1',[req.params.oid]);
   await log(db,req.params.oid,null,req.userId,'integration.yemot_removed',req.params.oid);
  });
  res.json({configured:false,enabled:false});
 }));
 router.post('/organizations/:oid/test',wrap(async(req,res)=>{
  await gate(pool,req.params.oid,req.userId);
  const row=(await pool.query(
   "UPDATE cc_yemot_connections SET last_test_attempt_at=now() WHERE organization_id=$1 AND (last_test_attempt_at IS NULL OR last_test_attempt_at<now()-interval '20 seconds') RETURNING token_nonce,token_ciphertext,token_tag",
   [req.params.oid])).rows[0];
  if(!row){
   const exists=(await pool.query("SELECT 1 FROM cc_yemot_connections WHERE organization_id=$1",[req.params.oid])).rowCount;
   if(!exists)throw bad(404,'Save a Yemot API token first');
   throw bad(429,'Please wait 20 seconds between provider tests');
  }
  let token;
  try{token=unseal(row,req.params.oid);}catch{
   throw bad(503,'Saved key could not be decrypted; verify server encryption configuration');
  }
  // Provider docs: POST application/json supports token in the body.
  // GetTemplates is READ ONLY. No campaign initiation, number purchase or dial.
  let healthy=false,templates=0;
  try{
   const result=await fetch('https://www.call2all.co.il/ym/api/GetTemplates',{
    method:'POST',
    headers:{'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify({token}),
    signal:AbortSignal.timeout(12000),
    redirect:'error',
    cache:'no-store'
   });
   if(!result.ok)throw Error('provider rejected');
   const data=await result.json();
   // Do not return or log upstream content; it may include private caller IDs.
   if(!data||typeof data!=='object'||data.responseStatus!=='OK'||data.error)throw Error('provider error');
   if(!Array.isArray(data.templates))throw Error('unexpected result');
   templates=data.templates.length;healthy=true;
  }catch{
   // Not include token, HTTP body, user phone or upstream error in logs.
   return res.status(502).json({connected:false,error:'Yemot validation failed. Check the token and provider access.'});
  }finally{token=undefined;}
  await pool.query('UPDATE cc_yemot_connections SET last_verified_at=now() WHERE organization_id=$1 AND token_ciphertext=$2',[req.params.oid,row.token_ciphertext]);
  res.set('Cache-Control','no-store');
  res.json({connected:healthy,templateCount:templates,readOnly:true});
 }));
 router.patch('/organizations/:oid/enabled',wrap(async(req,res)=>{
  if(typeof req.body?.enabled!=='boolean')throw bad(400,'Explicit enabled boolean required');
  const result=await tx(async db=>{
   await gate(db,req.params.oid,req.userId);
   const row=(await db.query(
    'UPDATE cc_yemot_connections SET enabled=$1,updated_by=$2,updated_at=now() WHERE organization_id=$3 AND ($1=false OR last_verified_at IS NOT NULL) RETURNING enabled',
    [req.body.enabled,req.userId,req.params.oid])).rows[0];
   if(!row)throw bad(409,'Save and successfully test the Yemot token before enabling');
   await log(db,req.params.oid,null,req.userId,'integration.yemot_enabled_changed',req.params.oid,{enabled:row.enabled});
   return row;
  });
  res.json({configured:true,enabled:result.enabled});
 }));
 return router;
}
