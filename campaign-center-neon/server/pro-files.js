import {Router} from 'express';
import {createHash} from 'node:crypto';
import {TextDecoder} from 'node:util';
const MAX_FILE=1048576, MAX_TOTAL=12582912;
const extensions={'application/pdf':'.pdf','image/jpeg':'.jpg','image/png':'.png','text/plain':'.txt'};
const base64pattern=/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const managerRoles=new Set(['owner','manager','finance','auditor']);
const uploadRoles=new Set(['owner','manager','finance','squad_leader','askan']);
function inspect(bytes,type){
 if(type==='application/pdf')return bytes.subarray(0,5).toString('ascii')==='%PDF-'&&bytes.includes(Buffer.from('%%EOF'));
 if(type==='image/png')return bytes.length>=33&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.subarray(12,16).toString('ascii')==='IHDR';
 if(type==='image/jpeg')return bytes.length>8&&bytes[0]===255&&bytes[1]===216&&bytes[bytes.length-2]===255&&bytes[bytes.length-1]===217;
 if(type==='text/plain'){try{return !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return false;}}
 return false;
}
export default function proFilesRouter({pool,campaignAccess,bad,log}){
 const router=Router(),wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 async function scope(db,req,campaignId){
  const c=await campaignAccess(db,campaignId,req.userId);
  const team=(await db.query('SELECT team_name FROM cc_campaign_members WHERE organization_id=$1 AND campaign_id=$2 AND subject=$3',
   [c.organization_id,c.id,req.userId])).rows[0]?.team_name??'';
  return {...c,team};
 }
 function visible(c,user,f){
  if(f.visibility==='private')return f.uploaded_by===user;
  if(f.visibility==='campaign')return true;
  return managerRoles.has(c.role)||(c.team!==''&&f.team_name===c.team);
 }
 router.get('/campaigns/:cid/files',wrap(async(req,res)=>{
  const c=await scope(pool,req,req.params.cid);
  const rows=await pool.query(
   "SELECT id,original_name,media_type,bytes_length,visibility,team_name,uploaded_by,created_at"+
   " FROM cc_pro_campaign_files WHERE organization_id=$1 AND campaign_id=$2"+
   " AND (visibility='campaign' OR (visibility='private' AND uploaded_by=$3)"+
   " OR (visibility='team' AND ($4::boolean OR (team_name=$5 AND $5<>''))))"+
   " ORDER BY created_at DESC,id DESC LIMIT 25",
   [c.organization_id,c.id,req.userId,managerRoles.has(c.role),c.team]);
  res.set('Cache-Control','private,no-store');
  res.json({files:rows.rows,totalVisible:rows.rowCount,limits:{perFile:MAX_FILE,perCampaign:20,totalBytes:MAX_TOTAL},
   scanningEnabled:false,downloadOnly:true});
 }));
 router.post('/campaigns/:cid/files',wrap(async(req,res)=>{
  const {name,mime,contentBase64,visibility}=req.body||{};
  if(typeof name!=='string'||!name.trim()||name.length>120||/[/\\\u0000-\u001F\u007F]/.test(name))
   throw bad(400,'Invalid filename');
  if(!Object.hasOwn(extensions,mime)||!name.toLowerCase().endsWith(extensions[mime]))
   throw bad(400,'Unsupported file type / extension');
  if(!['private','team','campaign'].includes(visibility))throw bad(400,'Invalid visibility');
  if(typeof contentBase64!=='string'||contentBase64.length>1398104||
      !base64pattern.test(contentBase64))throw bad(413,'Invalid or oversized base64');
  const bytes=Buffer.from(contentBase64,'base64');
  if(bytes.length<1||bytes.length>MAX_FILE||bytes.toString('base64')!==contentBase64||!inspect(bytes,mime))
   throw bad(400,'Unrecognized or oversized file contents');
  const db=await pool.connect();
  try{
   await db.query('BEGIN');
   const c=await scope(db,req,req.params.cid);
   if(c.status==='closed')throw bad(409,'Closed campaign');
   if(!uploadRoles.has(c.role))throw bad(403,'Read-only role cannot upload files');
   if(visibility==='team'&&!c.team)throw bad(403,'You are not assigned to a named team');
   await db.query('SELECT id FROM cc_campaigns WHERE id=$1 FOR UPDATE',[c.id]);
   const usage=(await db.query("SELECT COUNT(*)::int count, COALESCE(SUM(bytes_length),0)::bigint AS bytes"+
     " FROM cc_pro_campaign_files WHERE organization_id=$1 AND campaign_id=$2",
     [c.organization_id,c.id])).rows[0];
   if(usage.count>=20||Number(usage.bytes)+bytes.length>MAX_TOTAL)throw bad(409,'Campaign file quota reached');
   const hash=createHash('sha256').update(bytes).digest('hex');
   const row=(await db.query("INSERT INTO cc_pro_campaign_files"+
     "(organization_id,campaign_id,uploaded_by,visibility,team_name,original_name,media_type,bytes_length,sha256,file_contents)"+
     " VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)"+
     " RETURNING id,original_name,media_type,bytes_length,visibility,team_name,uploaded_by,created_at",
     [c.organization_id,c.id,req.userId,visibility,visibility==='team'?c.team:'',name.trim(),mime,bytes.length,hash,bytes])).rows[0];
   await log(db,c.organization_id,c.id,req.userId,'pro.file_uploaded',row.id,
    {mediaType:mime,bytes:bytes.length,visibility});
   await db.query('COMMIT');
   res.set('Cache-Control','private,no-store').status(201).json({file:row,scanVerified:false});
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
 }));
 router.get('/campaigns/:cid/files/:fid/download',wrap(async(req,res)=>{
  if(!/^[a-f0-9-]{36}$/i.test(req.params.fid))throw bad(404,'File not found');
  const c=await scope(pool,req,req.params.cid);
  const r=await pool.query(
   "SELECT id,original_name,media_type,bytes_length,visibility,team_name,uploaded_by,file_contents"+
   " FROM cc_pro_campaign_files WHERE organization_id=$1 AND campaign_id=$2 AND id=$3",
   [c.organization_id,c.id,req.params.fid]);
  const f=r.rows[0];if(!f||!visible(c,req.userId,f))throw bad(404,'File not found');
  const extension=extensions[f.media_type];
  res.set({
   'Cache-Control':'private,no-store','Content-Type':f.media_type,
   'Content-Disposition':'attachment; filename="campaign-file'+extension+'"; filename*=UTF-8'+"''"+encodeURIComponent(f.original_name),
   'Content-Security-Policy':'sandbox','X-Content-Type-Options':'nosniff',
   'Content-Length':String(f.bytes_length)
  });
  res.status(200).send(f.file_contents);
 }));
 return router;
}
