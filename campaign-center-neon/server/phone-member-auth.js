import { Router } from 'express';
import { createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// Entirely Campaign Center-owned member identities (Neon Auth subject).
// Never import or query Gavhah public.users or its session database.
const derive=promisify(scrypt);
const PIN=/^[0-9]{12,16}$/;
function validPin(pin){
 return typeof pin==='string'&&PIN.test(pin)&&
   !/^(\d)\1+$/.test(pin)&&!/(?:0123456789|9876543210)/.test(pin);
}
function key(){
 const val=process.env.CC_PHONE_PIN_PEPPER||'';
 if(val.length<32)throw Error('Campaign Center phone PIN pepper must be configured in this service');
 return val;
}
function lookup(pin){
 return createHmac('sha256',key()).update('campaign-center:phone-pin:v1:'+pin).digest('hex');
}
async function slow(pin,salt){
 return (await derive(pin,salt,64)).toString('hex');
}
async function setPin(pool,subject,pin,actor){
 const salt=randomBytes(16).toString('hex');
 const verifier=await slow(pin,salt);
 await pool.query(
  'INSERT INTO cc_phone_member_pins(subject,pin_index,pin_salt,pin_verifier,assigned_by_subject,failed_attempts,updated_at) '+
  'VALUES($1,$2,$3,$4,$5,0,now()) ON CONFLICT(subject) DO UPDATE SET '+
  'pin_index=EXCLUDED.pin_index,pin_salt=EXCLUDED.pin_salt,pin_verifier=EXCLUDED.pin_verifier,'+
  'failed_attempts=0,locked_until=NULL,assigned_by_subject=EXCLUDED.assigned_by_subject,updated_at=now()',
  [subject,lookup(pin),salt,verifier,actor]
 );
}
async function activeMember(pool,subject){
 const r=await pool.query("SELECT 1 FROM cc_memberships WHERE subject=$1 AND membership_status='active' LIMIT 1",[subject]);
 return r.rowCount>0;
}
function sameSite(req){
 const origin=req.get('origin'),host=req.get('x-forwarded-host')||req.get('host');
 if(req.get('sec-fetch-site')==='cross-site'||!origin||!host)return false;
 try{return new URL(origin).protocol==='https:'&&new URL(origin).host===host;}catch{return false;}
}
function authorizedServer(req){
 const configured=process.env.YEMOT_CENTRAL_SHARED_SECRET||'';
 const supplied=req.get('x-gavhah-connect-secret')||'';
 if(configured.length<32||supplied.length!==configured.length)return false;
 return timingSafeEqual(Buffer.from(configured),Buffer.from(supplied));
}
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const call=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const bad=(status,message)=>Object.assign(new Error(message),{status});

export function campaignPhoneWebRouter({pool,authenticate}){
 const r=Router();
 r.use(authenticate);
 r.get('/status',async(req,res,next)=>{
  try{
   const row=await pool.query('SELECT updated_at FROM cc_phone_member_pins WHERE subject=$1',[req.userId]);
   res.json({owner:'campaign-center',configured:!!row.rowCount,updatedAt:row.rows[0]?.updated_at||null,minDigits:12,maxDigits:16});
  }catch(e){next(e);}
 });
 r.post('/pin',async(req,res,next)=>{
  try{
   if(!sameSite(req))throw bad(403,'Same-origin sign-in required');
   if(!await activeMember(pool,req.userId))throw bad(403,'Become an active Campaign Center member first');
   const pin=req.body?.pin;
   if(!validPin(pin))throw bad(400,'Choose a private 12–16 digit numerical phone PIN');
   try{await setPin(pool,req.userId,pin,req.userId);}
   catch(e){if(e.code==='23505')throw bad(409,'Choose a different private PIN');throw e;}
   res.json({configured:true,owner:'campaign-center'});
  }catch(e){next(e);}
 });
 r.delete('/pin',async(req,res,next)=>{
  try{
   if(!sameSite(req))throw bad(403,'Same-origin sign-in required');
   await pool.query('DELETE FROM cc_phone_member_pins WHERE subject=$1',[req.userId]);
   res.json({configured:false});
  }catch(e){next(e);}
 });
 // Org owners/managers may provision a member PIN only for an ACTIVE member
 // in their SAME organization; they never gain the member's private data.
 r.post('/admin/assign-pin',async(req,res,next)=>{
  try{
   if(!sameSite(req))throw bad(403,'Same-origin sign-in required');
   const org=req.body?.organizationId,subject=req.body?.subject;
   if(!uuid(org)||typeof subject!=='string'||subject.length>160)throw bad(400,'Invalid organization or member');
   const admin=await pool.query(
    "SELECT 1 FROM cc_memberships WHERE organization_id=$1 AND subject=$2 "+
    "AND membership_status='active' AND role IN ('owner','manager')",[org,req.userId]);
   if(!admin.rowCount)throw bad(403,'Organization manager authorization required');
   const target=await pool.query(
    "SELECT 1 FROM cc_memberships WHERE organization_id=$1 AND subject=$2 "+
    "AND membership_status='active'",[org,subject]);
   if(!target.rowCount)throw bad(404,'Active organization member not found');
   const requested=req.body?.pin;
   const pin=requested===undefined?String(randomInt(0,1000000000000)).padStart(12,'0'):requested;
   if(!validPin(pin))throw bad(400,'PIN must have 12 to 16 digits');
   try{await setPin(pool,subject,pin,req.userId);}
   catch(e){if(e.code==='23505')throw bad(409,'PIN already belongs to an account');throw e;}
   // One-time display for generated PIN only. Must be shared securely.
   res.json({updated:true,owner:'campaign-center',...(requested===undefined?{oneTimePin:pin}:{})});
  }catch(e){next(e);}
 });
 return r;
}
export function campaignPhoneServiceRouter({pool}){
 const r=Router();
 r.use((req,res,next)=>{
  if(!authorizedServer(req))return res.status(403).json({error:'Phone bridge not authorized'});
  next();
 });
 r.post('/login',async(req,res,next)=>{
  try{
   const {pin,callHash}=req.body||{};
   if(!validPin(pin)||!call(callHash))throw bad(400,'Invalid telephone login request');
   const digest=lookup(pin);
   const result=await pool.query(
    'SELECT subject,pin_salt,pin_verifier,locked_until FROM cc_phone_member_pins WHERE pin_index=$1',[digest]);
   const row=result.rows[0];
   if(!row||row.locked_until&&new Date(row.locked_until)>new Date()||
      !await activeMember(pool,row.subject)){
    return res.status(401).json({authenticated:false});
   }
   const actual=Buffer.from(await slow(pin,row.pin_salt),'hex');
   const expected=Buffer.from(row.pin_verifier,'hex');
   if(actual.length!==expected.length||!timingSafeEqual(actual,expected)){
    await pool.query('UPDATE cc_phone_member_pins SET failed_attempts=failed_attempts+1,'+
      "locked_until=CASE WHEN failed_attempts>=4 THEN now()+interval '30 minutes' ELSE locked_until END WHERE subject=$1",[row.subject]);
    return res.status(401).json({authenticated:false});
   }
   const client=await pool.connect();
   try{
    await client.query('BEGIN');
    await client.query(
     'INSERT INTO cc_phone_sessions(call_hash,subject,expires_at) VALUES($1,$2,now()+interval \'20 minutes\') '+
     'ON CONFLICT(call_hash) DO UPDATE SET subject=EXCLUDED.subject,expires_at=EXCLUDED.expires_at',
     [callHash,row.subject]);
    await client.query('UPDATE cc_phone_member_pins SET failed_attempts=0,locked_until=NULL WHERE subject=$1',[row.subject]);
    await client.query('COMMIT');
   }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
   return res.json({authenticated:true,owner:'campaign-center',expiresInSeconds:1200});
  }catch(e){next(e);}
 });
 r.post('/logout',async(req,res,next)=>{
  try{
   if(!call(req.body?.callHash))throw bad(400,'Invalid call');
   await pool.query('DELETE FROM cc_phone_sessions WHERE call_hash=$1',[req.body.callHash]);
   res.json({authenticated:false,owner:'campaign-center'});
  }catch(e){next(e);}
 });
 r.post('/snapshot',async(req,res,next)=>{
  try{
   if(!call(req.body?.callHash))throw bad(400,'Invalid call');
   const member=await pool.query(
    'SELECT s.subject FROM cc_phone_sessions s WHERE s.call_hash=$1 AND s.expires_at>now() '+
    "AND EXISTS(SELECT 1 FROM cc_memberships m WHERE m.subject=s.subject AND m.membership_status='active')",
    [req.body.callHash]);
   const subject=member.rows[0]?.subject;
   if(!subject)return res.status(401).json({authenticated:false});
   const organizations=await pool.query(
    'SELECT o.name,m.role,o.id FROM cc_organizations o JOIN cc_memberships m ON m.organization_id=o.id '+
    "WHERE m.subject=$1 AND m.membership_status='active' ORDER BY o.created_at DESC LIMIT 10",[subject]);
   res.json({
    authenticated:true,owner:'campaign-center',
    organizationCount:organizations.rowCount,
    organizations:organizations.rows.map(o=>({name:o.name,role:o.role,id:o.id}))
   });
  }catch(e){next(e);}
 });
 return r;
}
