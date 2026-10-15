import {Router} from 'express';
import {randomBytes,createHash} from 'node:crypto';

// An independent conference product, not the fundraising contact/claim room.
// Presence / hand raises / speaking grants are REAL persisted coordination state.
// Audio/telephone calls are not claimed until a separately tested media transport exists.
export default function conferenceRouter({pool,authenticate,member,campaignAccess,need,log,bad,uuid,trim}){
 const router=Router();router.use(authenticate);
 const handle=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const privileged=['owner','manager'];
 const hash=x=>createHash('sha256').update(x).digest('hex');
 const newCode=()=>randomBytes(18).toString('base64url');
 async function tx(work){
  const db=await pool.connect();
  try{await db.query('BEGIN');const result=await work(db);await db.query('COMMIT');return result;}
  catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 async function room(db,roomId,subject,lock=false){
  if(!uuid(roomId))throw bad(400,'Invalid conference');
  const r=await db.query('SELECT * FROM cc_conference_rooms WHERE id=$1'+(lock?' FOR UPDATE':''),[roomId]);
  if(!r.rowCount)throw bad(404,'Conference not found');
  const conf=r.rows[0];const role=await member(db,conf.organization_id,subject);
  if(conf.campaign_id){
   const assigned=await campaignAccess(db,conf.campaign_id,subject);
   if(assigned.organization_id!==conf.organization_id)throw bad(404,'Conference not found');
  }
  return {conf,role,isModerator:privileged.includes(role)};
 }
 async function participant(db,roomId,subject,lock=false){
  const r=await db.query('SELECT * FROM cc_conference_participants WHERE room_id=$1 AND subject=$2'+(lock?' FOR UPDATE':''),[roomId,subject]);
  return r.rows[0]||null;
 }
 function admitted(row,isModerator){
  if(!isModerator&&(!row||row.banned||!row.admitted||row.left_at))
   throw bad(403,'Join the conference and await admission');
 }
 const view=r=>({
  id:r.id,organization_id:r.organization_id,campaign_id:r.campaign_id,
  title:r.title,category:r.category,agenda:r.agenda,room_status:r.room_status,
  access_mode:r.access_mode,speaking_mode:r.speaking_mode,phase:r.phase,
  scheduled_at:r.scheduled_at,created_at:r.created_at
 });
 router.get('/organizations/:oid',handle(async(req,res)=>{
  const role=await member(pool,req.params.oid,req.userId);
  const elevated=privileged.includes(role)||role==='finance'||role==='auditor';
  const r=await pool.query("SELECT c.*, (SELECT COUNT(*)::int FROM cc_conference_participants p WHERE p.room_id=c.id AND p.admitted AND NOT p.banned AND p.left_at IS NULL AND p.last_seen_at>now()-interval '45 seconds') AS online FROM cc_conference_rooms c WHERE c.organization_id=$1 AND ($2::boolean OR c.campaign_id IS NULL OR EXISTS (SELECT 1 FROM cc_campaign_members cm WHERE cm.campaign_id=c.campaign_id AND cm.subject=$3)) ORDER BY c.created_at DESC LIMIT 80",
   [req.params.oid,elevated,req.userId]);
  res.json({conferences:r.rows.map(row=>({...view(row),online:row.online}))});
 }));
 router.post('/organizations/:oid',handle(async(req,res)=>{
  const title=trim(req.body?.title,180),category=trim(req.body?.category,20)||'assembly',
   access=trim(req.body?.accessMode,12)||'members',speaking=trim(req.body?.speakingMode,16)||'moderated',
   agenda=trim(req.body?.agenda,1500),campaignId=req.body?.campaignId||null;
  if(title.length<2||!['assembly','inspiration','technical','advice','other'].includes(category)||
   !['members','code'].includes(access)||!['listeners','moderated','open'].includes(speaking)||
   (campaignId&&!uuid(campaignId)))throw bad(400,'Invalid conference setup');
  const code=access==='code'?newCode():null;
  const created=await tx(async db=>{
   const role=await member(db,req.params.oid,req.userId);need(role,privileged);
   if(campaignId){
    const campaign=await db.query('SELECT id FROM cc_campaigns WHERE id=$1 AND organization_id=$2',[campaignId,req.params.oid]);
    if(!campaign.rowCount)throw bad(404,'Campaign not found');
   }
   const r=(await db.query("INSERT INTO cc_conference_rooms(organization_id,campaign_id,title,category,agenda,access_mode,access_code_hash,speaking_mode,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
    [req.params.oid,campaignId,title,category,agenda,access,code?hash(code):null,speaking,req.userId])).rows[0];
   await log(db,r.organization_id,r.campaign_id,req.userId,'conference.created',r.id,{category,access_mode:access,speaking_mode:speaking});
   return r;
  });
  res.status(201).json({conference:view(created),accessCode:code});
 }));
 router.get('/:rid/snapshot',handle(async(req,res)=>{
  const {conf,role,isModerator}=await room(pool,req.params.rid,req.userId);
  const self=await participant(pool,conf.id,req.userId);
  if(!isModerator && conf.access_mode==='code' && !self?.admitted)
    throw bad(403,'A conference access code is required');
  const online=await pool.query("SELECT subject,admitted,banned,moderator_muted,speaking_granted,hand_raised,joined_at,last_seen_at FROM cc_conference_participants WHERE room_id=$1 AND left_at IS NULL AND last_seen_at>now()-interval '45 seconds' AND ($2::boolean OR admitted) AND (NOT banned OR $2::boolean) ORDER BY hand_raised DESC,joined_at ASC LIMIT 300",[conf.id,isModerator]);
  const messages=await pool.query("SELECT id,authored_by,message_kind,body,created_at FROM cc_conference_messages WHERE room_id=$1 ORDER BY created_at DESC,id DESC LIMIT 80",[conf.id]);
  res.json({conference:view(conf),you:self?{admitted:self.admitted,banned:self.banned,moderatorMuted:self.moderator_muted,speakingGranted:self.speaking_granted,handRaised:self.hand_raised,joined:!self.left_at}:null,
   isModerator,online:online.rows,messages:messages.rows.reverse(),mode:'web_discussion_only',pollAfterMs:8500});
 }));
 router.post('/:rid/join',handle(async(req,res)=>{
  const provided=typeof req.body?.accessCode==='string'?req.body.accessCode:'';
  const result=await tx(async db=>{
   const {conf,role,isModerator}=await room(db,req.params.rid,req.userId,true);
   if(conf.room_status!=='open')throw bad(409,'Conference is not open');
   let prev=await participant(db,conf.id,req.userId,true);
   if(prev?.banned)throw bad(403,'Banned participant cannot rejoin');
   const already=Boolean(prev?.admitted&&!prev.left_at);
   const valid=conf.access_mode==='members'||isModerator||prev?.admitted|| (provided.length===24&&hash(provided)===conf.access_code_hash);
   if(!valid)throw bad(403,'Invalid conference access code');
   const automatic=isModerator||conf.speaking_mode==='open';
   const admit=isModerator||prev?.admitted||conf.speaking_mode==='open';
   // Moderated/listener rooms place new members into a waiting room.
   const row=(await db.query("INSERT INTO cc_conference_participants(room_id,subject,admitted,joined_at,last_seen_at,left_at) VALUES($1,$2,$3,now(),now(),NULL) ON CONFLICT(room_id,subject) DO UPDATE SET admitted=EXCLUDED.admitted,last_seen_at=now(),joined_at=COALESCE(cc_conference_participants.joined_at,now()),left_at=NULL RETURNING *",
     [conf.id,req.userId,admit])).rows[0];
   if(!already)await log(db,conf.organization_id,conf.campaign_id,req.userId,'conference.joined',conf.id,{waiting:!row.admitted});
   return {admitted:row.admitted,waiting:!row.admitted,joined:true};
  });res.json(result);
 }));
 router.post('/:rid/heartbeat',handle(async(req,res)=>{
  const {conf,isModerator}=await room(pool,req.params.rid,req.userId);
  if(conf.room_status!=='open')throw bad(409,'Conference not open');
  const r=await pool.query('UPDATE cc_conference_participants SET last_seen_at=now() WHERE room_id=$1 AND subject=$2 AND left_at IS NULL AND banned=false RETURNING admitted',[conf.id,req.userId]);
  if(!r.rowCount)throw bad(404,'Join first');
  res.json({connected:true,admitted:r.rows[0].admitted,mode:'web_discussion_only'});
 }));
 router.post('/:rid/leave',handle(async(req,res)=>{
  const {conf}=await room(pool,req.params.rid,req.userId);
  await pool.query('UPDATE cc_conference_participants SET left_at=now(),hand_raised=false WHERE room_id=$1 AND subject=$2 AND left_at IS NULL',[conf.id,req.userId]);
  res.json({left:true});
 }));
 router.post('/:rid/hand',handle(async(req,res)=>{
  if(typeof req.body?.raised!=='boolean')throw bad(400,'Invalid hand state');
  const {conf,isModerator}=await room(pool,req.params.rid,req.userId);
  if(conf.room_status!=='open')throw bad(409,'Conference not open');
  const row=await participant(pool,conf.id,req.userId);admitted(row,isModerator);
  const r=await pool.query('UPDATE cc_conference_participants SET hand_raised=$1 WHERE room_id=$2 AND subject=$3 AND banned=false RETURNING hand_raised',[req.body.raised,conf.id,req.userId]);
  res.json({handRaised:r.rows[0].hand_raised});
 }));
 router.post('/:rid/moderate/:subject',handle(async(req,res)=>{
  const action=trim(req.body?.action,20);
  if(!['admit','remove','ban','restore','mute','unmute','grant','revoke'].includes(action))throw bad(400,'Invalid moderation action');
  const result=await tx(async db=>{
   const {conf,role}=await room(db,req.params.rid,req.userId,true);need(role,privileged);
   if(req.params.subject===req.userId&&['remove','ban','mute','revoke'].includes(action))throw bad(403,'Moderator cannot moderate self');
   const p=await participant(db,conf.id,req.params.subject,true);
   if(!p)throw bad(404,'Participant not found');
   if(action!=='restore'&&p.banned)throw bad(409,'Restore banned account first');
   const updates={
    admit:{admitted:true,left_at:null},remove:{admitted:false,left_at:new Date()},
    ban:{banned:true,admitted:false,left_at:new Date(),hand_raised:false},
    restore:{banned:false,admitted:false,left_at:new Date()},
    mute:{moderator_muted:true},unmute:{moderator_muted:false},
    grant:{speaking_granted:true},revoke:{speaking_granted:false}
   };
   const change=updates[action];
   const sets=Object.keys(change).map((key,i)=>key+'=$'+(i+3));
   const r=(await db.query('UPDATE cc_conference_participants SET '+sets.join(',')+' WHERE room_id=$1 AND subject=$2 RETURNING subject,admitted,banned,moderator_muted,speaking_granted,hand_raised',
    [conf.id,req.params.subject,...Object.values(change)])).rows[0];
   await log(db,conf.organization_id,conf.campaign_id,req.userId,'conference.moderation',conf.id,{subject:req.params.subject,action});
   return r;
  });res.json(result);
 }));
 router.patch('/:rid',handle(async(req,res)=>{
  const changes=req.body||{};
  const status=changes.roomStatus,phase=changes.phase,speaking=changes.speakingMode,access=changes.accessMode;
  if(Object.keys(changes).some(k=>!['roomStatus','phase','speakingMode','accessMode','rotateCode'].includes(k))||
   (status!==undefined&&!['open','paused','ended'].includes(status))||
   (phase!==undefined&&!['lecture','qna','discussion'].includes(phase))||
   (speaking!==undefined&&!['listeners','moderated','open'].includes(speaking))||
   (access!==undefined&&!['members','code'].includes(access)))
   throw bad(400,'Invalid conference configuration');
  if(!Object.keys(changes).length)throw bad(400,'No changes');
  const secret=access==='code'||changes.rotateCode===true?newCode():null;
  const result=await tx(async db=>{
   const {conf,role}=await room(db,req.params.rid,req.userId,true);need(role,privileged);
   if(conf.room_status==='ended')throw bad(409,'Ended conferences are retained as archived records');
   const updated=(await db.query("UPDATE cc_conference_rooms SET room_status=COALESCE($2,room_status),phase=COALESCE($3,phase),speaking_mode=COALESCE($4,speaking_mode),access_mode=COALESCE($5,access_mode),access_code_hash=CASE WHEN $5='members' THEN NULL WHEN $6::text IS NOT NULL THEN $6 ELSE access_code_hash END,opened_at=CASE WHEN $2='open' THEN COALESCE(opened_at,now()) ELSE opened_at END,closed_at=CASE WHEN $2='ended' THEN now() ELSE closed_at END WHERE id=$1 RETURNING *",
     [conf.id,status??null,phase??null,speaking??null,access??null,secret?hash(secret):null])).rows[0];
   if(status==='ended')await db.query('UPDATE cc_conference_participants SET left_at=now(),hand_raised=false WHERE room_id=$1 AND left_at IS NULL',[conf.id]);
   await log(db,conf.organization_id,conf.campaign_id,req.userId,'conference.settings_changed',conf.id,
    {from:{status:conf.room_status,phase:conf.phase,speaking:conf.speaking_mode},to:{status:updated.room_status,phase:updated.phase,speaking:updated.speaking_mode}});
   return updated;
  });
  res.json({conference:view(result),accessCode:secret});
 }));
 router.post('/:rid/messages',handle(async(req,res)=>{
  const body=trim(req.body?.body,1201),kind=trim(req.body?.kind,16)||'discussion';
  if(!body||body.length>1200||!['discussion','question','announcement'].includes(kind))throw bad(400,'Invalid conference message');
  const result=await tx(async db=>{
   const {conf,role,isModerator}=await room(db,req.params.rid,req.userId,true);
   if(conf.room_status!=='open')throw bad(409,'Conference not open');
   const p=await participant(db,conf.id,req.userId);admitted(p,isModerator);
   if(kind==='announcement')need(role,privileged);
   if(!isModerator&&kind==='discussion'){
    if(conf.speaking_mode==='listeners'||(conf.speaking_mode==='moderated'&&!p.speaking_granted)||p.moderator_muted)
     throw bad(403,'Speaking is not enabled for this participant');
   }
   if(kind==='question'&&conf.phase!=='qna'&&!isModerator)throw bad(409,'Questions are accepted in Q&A phase');
   const r=(await db.query('INSERT INTO cc_conference_messages(organization_id,room_id,authored_by,message_kind,body) VALUES($1,$2,$3,$4,$5) RETURNING id,authored_by,message_kind,body,created_at',
    [conf.organization_id,conf.id,req.userId,kind,body])).rows[0];
   return r;
  });
  res.status(201).json(result);
 }));
 return router;
}
