import { Router } from 'express';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

// A dedicated Campaign Center line: NO imports, tokens, writes or fallback to Gavhah.
// The authenticated platform-admin gate is installed by server/index.js.
export default function campaignLineRouter({pool, bad, platformAdmin}){
 const router=Router();
 router.use((req,_res,next)=>{
  try{platformAdmin(req.userId);next();}catch(error){next(error);}
 });
 const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const normalizeLine=x=>{
  if(typeof x!=='string'||!/^\+?[0-9 ()-]{7,24}$/.test(x))throw bad(400,'Enter the second line number');
  const digits=x.replace(/\D/g,'');
  if(digits.length<7||digits.length>15)throw bad(400,'Invalid telephone number');
  return digits;
 };
 const oldLine=()=> {
  const value=process.env.GAVHAH_EXISTING_LINE_NUMBER;
  return value?normalizeLine(value):null;
 };
 const safeDifferentNumber=(number)=>{
  const current=oldLine();
  if(current&&current===number)throw bad(409,'This is the existing Gavhah telephone number. Campaign Center requires a different number.');
 };
 const key=()=>{
  const encoded=process.env.CC_YEMOT_ENCRYPTION_KEY||'';
  if(!/^[A-Za-z0-9+/]{43}=$/.test(encoded))throw bad(503,'Campaign Center encrypted storage has not been configured');
  const bytes=Buffer.from(encoded,'base64');
  if(bytes.length!==32||bytes.toString('base64')!==encoded)throw bad(503,'Campaign Center encryption key is invalid');
  return bytes;
 };
 const encrypt=token=>{
  const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),nonce);
  cipher.setAAD(Buffer.from('campaign-center-line-v1','utf8'));
  return {nonce:nonce.toString('base64'),ciphertext:Buffer.concat([cipher.update(token,'utf8'),cipher.final()]).toString('base64'),tag:cipher.getAuthTag().toString('base64')};
 };
 const decrypt=row=>{
  const decipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(row.token_nonce,'base64'));
  decipher.setAAD(Buffer.from('campaign-center-line-v1','utf8'));
  decipher.setAuthTag(Buffer.from(row.token_tag,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(row.token_ciphertext,'base64')),decipher.final()]).toString('utf8');
 };
 const read=async()=> (await pool.query("SELECT line_number, token_nonce, token_ciphertext, token_tag, last_verified_at, last_test_attempt_at, updated_at FROM public.cc_platform_yemot_line WHERE id='campaign-center'")).rows[0];
 const audit=(db,actor,action,number)=>db.query("INSERT INTO public.cc_platform_yemot_audit(actor_subject,event_type,line_number) VALUES($1,$2,$3)",[actor,action,number]);
 const status=row=>({
   configured:!!row, lineNumber:row?.line_number||null,
   verifiedAt:row?.last_verified_at||null, updatedAt:row?.updated_at||null,
   storageReady:(()=>{try{key();return true;}catch{return false;}})(),
   separationReady:!!oldLine(),
   tested:!!row?.last_verified_at,
   active:false, // no routing/number changes are made by these configuration endpoints
   token:'NEVER_RETURNED', provider:'yemot', scope:'campaign-center'
 });
 router.get('/',wrap(async(req,res)=>{
   res.set('Cache-Control','no-store');
   res.json(status(await read()));
 }));
 router.put('/',wrap(async(req,res)=>{
   const token=req.body?.token,number=normalizeLine(req.body?.lineNumber);
   if(typeof token!=='string'||token.length<12||token.length>768||/[^\x21-\x7e]/.test(token))
     throw bad(400,'Invalid Yemot API token');
   safeDifferentNumber(number);
   const encrypted=encrypt(token);
   const db=await pool.connect();
   try{
    await db.query('BEGIN');
    await db.query("INSERT INTO public.cc_platform_yemot_line(id,line_number,token_nonce,token_ciphertext,token_tag,updated_by) VALUES('campaign-center',$1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET line_number=EXCLUDED.line_number,token_nonce=EXCLUDED.token_nonce,token_ciphertext=EXCLUDED.token_ciphertext,token_tag=EXCLUDED.token_tag,last_verified_at=NULL,last_test_attempt_at=NULL,updated_by=EXCLUDED.updated_by,updated_at=now()",[number,encrypted.nonce,encrypted.ciphertext,encrypted.tag,req.userId]);
    await audit(db,req.userId,'credential.saved',number);
    await db.query('COMMIT');
   }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
   res.set('Cache-Control','no-store');
   res.json({configured:true,tested:false,active:false,message:'Saved encrypted in Campaign Center only. No provider routing changed.'});
 }));
 router.post('/test',wrap(async(req,res)=>{
   const current=oldLine();
   if(!current)throw bad(503,'Configure GAVHAH_EXISTING_LINE_NUMBER on Campaign Center before testing separation');
   const dbRow=(await pool.query("UPDATE public.cc_platform_yemot_line SET last_test_attempt_at=now() WHERE id='campaign-center' AND (last_test_attempt_at IS NULL OR last_test_attempt_at < now()-interval '30 seconds') RETURNING line_number,token_nonce,token_ciphertext,token_tag")).rows[0];
   if(!dbRow){
    if(!await read())throw bad(404,'Save the second-line credentials first');
    throw bad(429,'Wait 30 seconds before testing again');
   }
   safeDifferentNumber(dbRow.line_number);
   let token;
   try{token=decrypt(dbRow);}catch{throw bad(503,'Campaign Center cannot decrypt this key');}
   try{
    const response=await fetch('https://www.call2all.co.il/ym/api/GetSession',{
      method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({token}),signal:AbortSignal.timeout(12000),
      redirect:'error',cache:'no-store'
    });
    if(!response.ok)throw Error('Provider rejected connection');
    const data=await response.json();
    if(data?.responseStatus!=='OK'||data?.error||typeof data?.username!=='string')
      throw Error('Invalid provider session');
    const authenticatedNumber=String(data.username).replace(/\D/g,'');
    if(authenticatedNumber!==dbRow.line_number || authenticatedNumber===current)
      return res.status(409).json({connected:false,numberOwnershipVerified:false,error:'Provider token does not belong to the separate Campaign Center number'});
   }catch{
    // Never include provider responses, credentials, URLs with tokens or private caller data.
    return res.status(502).json({connected:false,error:'Second-line read-only provider test failed'});
   }finally{token=undefined;}
   // Do not mark verified if the credential was replaced during the external test.
   const updated=await pool.query("UPDATE public.cc_platform_yemot_line SET last_verified_at=now() WHERE id='campaign-center' AND token_ciphertext=$1 AND line_number=$2 RETURNING line_number",[dbRow.token_ciphertext,dbRow.line_number]);
   if(!updated.rowCount)throw bad(409,'Connection changed during testing; test again');
   await audit(pool,req.userId,'credential.read_only_test_passed',dbRow.line_number);
   res.set('Cache-Control','no-store');
   res.json({connected:true,readOnly:true,active:false,numberOwnershipVerified:true,
     message:'Provider verified this token belongs to the separate Campaign Center number. No provider routing changed yet.'});
 }));
 router.delete('/',wrap(async(req,res)=>{
   const db=await pool.connect();
   try{
    await db.query('BEGIN');
    const row=(await db.query("DELETE FROM public.cc_platform_yemot_line WHERE id='campaign-center' RETURNING line_number")).rows[0];
    if(row)await audit(db,req.userId,'credential.removed',row.line_number);
    await db.query('COMMIT');
   }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
   res.json({configured:false,active:false});
 }));
 return router;
}
