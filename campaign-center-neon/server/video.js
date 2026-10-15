import {Router} from 'express';

// Optional, externally hosted HTTPS/HLS video. This module DOES NOT publish
// a camera, run a transcoder, issue media-provider signed URLs or implement SFU.
export default function videoRouter({pool,authenticate,member,campaignAccess,need,log,bad,uuid,trim}){
 const router=Router();router.use(authenticate);
 const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const managerRoles=['owner','manager'];
 const deny=()=>bad(403,'Video is not enabled or you have not been approved');
 const resourceFor=(kind)=>kind==='conference'?{
   table:'cc_conference_rooms',grantTable:'cc_conference_video_grants',key:'conference'
 }:kind==='floor'?{
   table:'cc_live_rooms',grantTable:'cc_floor_video_grants',key:'floor'
 }:null;
 async function context(db,kind,id,subject,lock=false){
  const tables=resourceFor(kind);
  if(!tables||!uuid(id))throw bad(400,'Invalid video room');
  const row=(await db.query('SELECT * FROM public.'+tables.table+' WHERE id=$1'+(lock?' FOR UPDATE':''),[id])).rows[0];
  if(!row)throw bad(404,'Video room not found');
  let role;
  if(kind==='conference'){
   role=await member(db,row.organization_id,subject);
   if(row.campaign_id){
    const c=await campaignAccess(db,row.campaign_id,subject);
    if(c.organization_id!==row.organization_id)throw bad(404,'Video room not found');
   }
   if(!managerRoles.includes(role)){
    const forbidden=(await db.query("SELECT 1 FROM cc_conference_access_rules WHERE room_id=$1 AND subject=$2 AND rule='deny_entry' AND enabled=true",[id,subject])).rowCount;
    if(forbidden)throw deny();
   }
  }else{
   const c=await campaignAccess(db,row.campaign_id,subject);
   if(c.organization_id!==row.organization_id)throw bad(404,'Video room not found');
   role=c.role;
  }
  return {row,role,isManager:managerRoles.includes(role),tables};
 }
 async function access(db,kind,entry,subject){
  const {row,isManager,tables}=entry;
  if(row.room_status!=='open')return false;
  if(isManager)return true;
  let attending=false;
  if(kind==='conference'){
   const p=(await db.query("SELECT 1 FROM cc_conference_participants WHERE room_id=$1 AND subject=$2 AND admitted=true AND banned=false AND left_at IS NULL",[row.id,subject])).rowCount;
   attending=!!p;
  }else{
   const p=(await db.query("SELECT 1 FROM cc_floor_checkins ci JOIN cc_live_room_participation rp ON rp.room_id=ci.room_id AND rp.member_subject=ci.member_subject WHERE ci.room_id=$1 AND ci.member_subject=$2 AND ci.checked_out_at IS NULL AND rp.left_at IS NULL AND rp.last_seen_at>now()-interval '45 seconds'",[row.id,subject])).rowCount;
   attending=!!p;
  }
  if(!attending)return false;
  const broad=kind==='conference'?'admitted':'checked_in';
  if(row.video_access_mode===broad)return true;
  const granted=(await db.query("SELECT 1 FROM public."+tables.grantTable+" WHERE room_id=$1 AND subject=$2 AND granted=true",[row.id,subject])).rowCount;
  return !!granted;
 }
 function safeUrl(value){
  if(typeof value!=='string'||value.length>1000)throw bad(400,'Invalid video source');
  try {
   const u=new URL(value);
   if(u.protocol!=='https:'||!u.hostname.includes('.')||u.username||u.password||u.hash||
      /^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(u.hostname)||
      u.hostname.endsWith('.local'))throw Error('not allowed');
   // No server-side fetch. Browsers must support the format and provider CORS.
   return u.href;
  }catch{throw bad(400,'A public HTTPS video source is required');}
 }
 async function tx(fn){
  const db=await pool.connect();
  try{await db.query('BEGIN');const result=await fn(db);await db.query('COMMIT');return result;}
  catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 router.get('/:kind/:id/status',wrap(async(req,res)=>{
  const item=await context(pool,req.params.kind,req.params.id,req.userId);
  const allowed=Boolean(item.row.video_enabled&&item.row.video_url&&await access(pool,req.params.kind,item,req.userId));
  res.set('Cache-Control','no-store');
  res.json({enabled:item.row.video_enabled,allowed,
   accessMode:item.row.video_access_mode,isManager:item.isManager,
   hasSource:Boolean(item.row.video_url),mode:'opt_in_video',requiresUserClick:true,
   // Only the authorized manager may inspect the configured media URL.
   ...(item.isManager?{configuredUrl:item.row.video_url||''}:{})});
 }));
 router.get('/:kind/:id/watch',wrap(async(req,res)=>{
  const item=await context(pool,req.params.kind,req.params.id,req.userId);
  if(!item.row.video_enabled||!item.row.video_url||!await access(pool,req.params.kind,item,req.userId))throw deny();
  res.set('Cache-Control','no-store');
  res.json({url:item.row.video_url,roomId:item.row.id,kind:req.params.kind,
   note:'The external stream provider must independently secure its media URL.'});
 }));
 router.get('/:kind/:id/grants',wrap(async(req,res)=>{
  const item=await context(pool,req.params.kind,req.params.id,req.userId);
  need(item.role,managerRoles);
  const r=await pool.query("SELECT subject,granted,changed_at FROM public."+item.tables.grantTable+
   " WHERE room_id=$1 ORDER BY changed_at DESC LIMIT 500",[item.row.id]);
  res.set('Cache-Control','no-store');
  res.json({grants:r.rows});
 }));
 router.patch('/:kind/:id/config',wrap(async(req,res)=>{
  const {enabled,accessMode,sourceUrl}=req.body||{};
  if(typeof enabled!=='boolean'||typeof accessMode!=='string'||(sourceUrl!==undefined&&typeof sourceUrl!=='string'))
   throw bad(400,'Explicit video enabled and access mode required');
  const allowedModes=req.params.kind==='conference'?['approved_only','admitted']:['approved_only','checked_in'];
  if(!allowedModes.includes(accessMode))throw bad(400,'Invalid video access mode');
  const url=sourceUrl?safeUrl(sourceUrl):null;
  const result=await tx(async db=>{
   const item=await context(db,req.params.kind,req.params.id,req.userId,true);
   need(item.role,managerRoles);
   if(item.row.room_status==='ended')throw bad(409,'Cannot change archived room video settings');
   if(enabled&&!url&&!item.row.video_url)throw bad(409,'Add an HTTPS source before enabling video');
   const changed=(await db.query('UPDATE public.'+item.tables.table+
    ' SET video_enabled=$1,video_access_mode=$2,video_url=CASE WHEN $3::boolean THEN $4 ELSE video_url END WHERE id=$5 RETURNING id,video_enabled,video_access_mode,video_url',
    [enabled,accessMode,sourceUrl!==undefined,url,item.row.id])).rows[0];
   await log(db,item.row.organization_id,item.row.campaign_id,req.userId,'video.config_changed',changed.id,
    {kind:req.params.kind,enabled,accessMode,sourceChanged:sourceUrl!==undefined});
   return changed;
  });
  res.json({enabled:result.video_enabled,accessMode:result.video_access_mode,
   hasSource:Boolean(result.video_url)});
 }));
 router.patch('/:kind/:id/allow/:subject',wrap(async(req,res)=>{
  if(typeof req.body?.allowed!=='boolean'||typeof req.params.subject!=='string'||
     req.params.subject.length<1||req.params.subject.length>128)throw bad(400,'Invalid video viewer permission');
  const result=await tx(async db=>{
   const item=await context(db,req.params.kind,req.params.id,req.userId,true);
   need(item.role,managerRoles);
   if(item.row.room_status==='ended')throw bad(409,'Archived video permissions cannot change');
   const subject=req.params.subject;
   const orgMember=(await db.query("SELECT role FROM cc_memberships WHERE organization_id=$1 AND subject=$2 AND membership_status='active'",
    [item.row.organization_id,subject])).rows[0];
   if(!orgMember)throw bad(404,'Viewer must be an active organization member');
   if(item.row.campaign_id){
    const c=await campaignAccess(db,item.row.campaign_id,subject);
    if(c.organization_id!==item.row.organization_id)throw bad(404,'Viewer is not authorized for this campaign');
   }
   const r=(await db.query('INSERT INTO public.'+item.tables.grantTable+
    '(room_id,subject,granted,changed_by) VALUES($1,$2,$3,$4) ON CONFLICT(room_id,subject) DO UPDATE SET granted=$3,changed_by=$4,changed_at=now() RETURNING subject,granted',
    [item.row.id,subject,req.body.allowed,req.userId])).rows[0];
   await log(db,item.row.organization_id,item.row.campaign_id,req.userId,'video.viewer_permission',item.row.id,
    {kind:req.params.kind,subject,allowed:req.body.allowed});
   return r;
  });
  res.json(result);
 }));
 return router;
}
