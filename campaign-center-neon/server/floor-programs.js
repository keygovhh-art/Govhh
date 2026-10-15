import {Router} from 'express';

// Browser-native virtual campaign event: 100s of independent operators may
// check in, follow the manager's timed schedule and open their own phone dialer.
// No telephony provider is required and no microphone streaming is implied.
// Idempotent, clock-driven reconciliation invoked when an authenticated member
// views the program. No cron/telephony provider is needed. Room row lock
// serializes many workers arriving at the same scheduled start boundary.
export async function reconcileScheduledProgram(pool,roomId,log){
 const due=await pool.query(
  "SELECT EXISTS(SELECT 1 FROM cc_floor_programs WHERE room_id=$1 AND auto_start AND ((status='scheduled' AND scheduled_start<=now()) OR (status='live' AND scheduled_end<=now()))) AS due",
  [roomId]);
 if(!due.rows[0].due)return;
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  const r=(await db.query('SELECT * FROM cc_live_rooms WHERE id=$1 FOR UPDATE',[roomId])).rows[0];
  if(!r||r.room_status!=='open'){await db.query('COMMIT');return;}
  const oldLive=(await db.query("SELECT * FROM cc_floor_programs WHERE room_id=$1 AND status='live' FOR UPDATE",[roomId])).rows[0];
  if(oldLive?.auto_start&&new Date(oldLive.scheduled_end).getTime()<=Date.now()){
   await db.query("UPDATE cc_floor_programs SET status='completed',completed_at=now() WHERE id=$1",[oldLive.id]);
   await db.query("UPDATE cc_live_rooms SET floor_mode='calling' WHERE id=$1",[roomId]);
   await log(db,r.organization_id,r.campaign_id,'system:scheduler','floor.program_auto_completed',oldLive.id,{roomId});
  }
  const nowLive=(await db.query("SELECT 1 FROM cc_floor_programs WHERE room_id=$1 AND status='live'",[roomId])).rowCount;
  if(!nowLive){
   // Don't start a stale program whose entire time interval has passed.
   await db.query("UPDATE cc_floor_programs SET status='cancelled' WHERE room_id=$1 AND auto_start AND status='scheduled' AND scheduled_end<=now()",[roomId]);
   const next=(await db.query("SELECT * FROM cc_floor_programs WHERE room_id=$1 AND auto_start AND status='scheduled' AND scheduled_start<=now() AND scheduled_end>now() ORDER BY scheduled_start,id LIMIT 1 FOR UPDATE",[roomId])).rows[0];
   if(next){
    await db.query("UPDATE cc_floor_programs SET status='live',started_at=now() WHERE id=$1",[next.id]);
    await db.query('UPDATE cc_live_rooms SET floor_mode=$1 WHERE id=$2',
     [['lunch','break'].includes(next.segment_type)?'break':'program',roomId]);
    await log(db,r.organization_id,r.campaign_id,'system:scheduler','floor.program_auto_started',next.id,{roomId,type:next.segment_type});
   }
  }
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
export default function programRouter({pool,authenticate,campaignAccess,need,log,bad,uuid,trim}){
 const router=Router();router.use(authenticate);
 const handle=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 async function tx(work){
  const db=await pool.connect();
  try{await db.query('BEGIN');const v=await work(db);await db.query('COMMIT');return v;}
  catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 async function room(db,id,user,lock=false){
  if(!uuid(id))throw bad(400,'Invalid fundraiser room');
  const found=(await db.query('SELECT * FROM cc_live_rooms WHERE id=$1'+(lock?' FOR UPDATE':''),[id])).rows[0];
  if(!found)throw bad(404,'Fundraiser room not found');
  const c=await campaignAccess(db,found.campaign_id,user);
  if(c.organization_id!==found.organization_id)throw bad(404,'Fundraiser room not found');
  return {r:found,c};
 }
 const segmentTypes=['opening','manager','inspiration','lunch','break','technical','closing','other'];
 function scheduleDate(raw){
  if(typeof raw!=='string'||!/(?:Z|[+-]\d\d:\d\d)$/.test(raw))return null;
  const d=new Date(raw);return Number.isNaN(d.getTime())?null:d;
 }
 function validateMedia(raw){
  if(raw===undefined||raw===null||raw==='')return null;
  if(typeof raw!=='string'||raw.length>1000)throw bad(400,'Invalid media URL');
  // Stage only: HTTPS link to a recording or a permissioned web audio stream.
  // The server does not transcode audio or operate as a streaming service.
  try{
   const url=new URL(raw);
   if(url.protocol!=='https:'||url.username||url.password||url.hash||url.hostname==='localhost'||
      /^(?:127\.|10\.|192\.168\.|169\.254\.)/.test(url.hostname))throw Error('not public HTTPS');
   return url.href;
  }catch{throw bad(400,'An authorized HTTPS media URL is required');}
 }
 router.get('/:rid/schedule',handle(async(req,res)=>{
  const {r,c}=await room(pool,req.params.rid,req.userId);
  await reconcileScheduledProgram(pool,r.id,log);
  const [schedule,checkins,me,roomMode]=await Promise.all([
   pool.query('SELECT id,title,segment_type,speaker,description,scheduled_start,scheduled_end,status,started_at,completed_at,media_url,auto_start FROM cc_floor_programs WHERE room_id=$1 ORDER BY scheduled_start ASC,created_at ASC LIMIT 200',[r.id]),
   pool.query("SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE checked_out_at IS NULL)::int checked_in FROM cc_floor_checkins WHERE room_id=$1",[r.id]),
   pool.query('SELECT checked_in_at FROM cc_floor_checkins WHERE room_id=$1 AND member_subject=$2 AND checked_out_at IS NULL LIMIT 1',[r.id,req.userId]),
   pool.query('SELECT floor_mode FROM cc_live_rooms WHERE id=$1',[r.id]),
  ]);
  res.set('Cache-Control','no-store');
  res.json({mode:roomMode.rows[0]?.floor_mode||r.floor_mode,roomStatus:r.room_status,programs:schedule.rows,attendance:checkins.rows[0],
   checkedIn:Boolean(me.rowCount),checkedInAt:me.rows[0]?.checked_in_at||null,
   serverTime:new Date().toISOString(),pollAfterMs:6500});
 }));
 router.post('/:rid/check-in',handle(async(req,res)=>{
  const v=await tx(async db=>{
   const {r,c}=await room(db,req.params.rid,req.userId,true);
   if(r.room_status!=='open')throw bad(409,'Event is not open');
   need(c.role,['owner','manager','squad_leader','askan','finance','auditor']);
   const presence=await db.query("SELECT 1 FROM cc_live_room_participation WHERE room_id=$1 AND member_subject=$2 AND left_at IS NULL AND last_seen_at>now()-interval '45 seconds'",[r.id,req.userId]);
   if(!presence.rowCount)throw bad(409,'Enter the event hall first');
   const previous=await db.query("SELECT id,checked_in_at FROM cc_floor_checkins WHERE room_id=$1 AND member_subject=$2 AND checked_out_at IS NULL FOR UPDATE",[r.id,req.userId]);
   if(previous.rowCount)return {checkedIn:true,already:true,checkedInAt:previous.rows[0].checked_in_at};
   const r2=(await db.query("INSERT INTO cc_floor_checkins(organization_id,campaign_id,room_id,member_subject) VALUES($1,$2,$3,$4) RETURNING checked_in_at",[c.organization_id,c.id,r.id,req.userId])).rows[0];
   await log(db,c.organization_id,c.id,req.userId,'floor.checked_in',r.id);
   return {checkedIn:true,already:false,checkedInAt:r2.checked_in_at};
  });res.status(v.already?200:201).json(v);
 }));
 router.post('/:rid/check-out',handle(async(req,res)=>{
  const v=await tx(async db=>{
   const {r,c}=await room(db,req.params.rid,req.userId);
   const changed=await db.query('UPDATE cc_floor_checkins SET checked_out_at=now() WHERE room_id=$1 AND member_subject=$2 AND checked_out_at IS NULL RETURNING id',[r.id,req.userId]);
   if(changed.rowCount)await log(db,c.organization_id,c.id,req.userId,'floor.checked_out',r.id);
   return {checkedIn:false,already:!changed.rowCount};
  });res.json(v);
 }));
 router.post('/:rid/schedule',handle(async(req,res)=>{
  const title=trim(req.body?.title,180),speaker=trim(req.body?.speaker,180),
   description=trim(req.body?.description,1000),segment=trim(req.body?.segmentType,24),
   start=scheduleDate(req.body?.scheduledStart),end=scheduleDate(req.body?.scheduledEnd);
  const media=validateMedia(req.body?.mediaUrl);
  const autoStart=req.body?.autoStart===true;
  if(req.body?.autoStart!==undefined&&typeof req.body.autoStart!=='boolean')throw bad(400,'Invalid automatic schedule flag');
  if(title.length<2||!segmentTypes.includes(segment)||!start||!end||end<=start||
   end.getTime()-start.getTime()>6*60*60*1000)throw bad(400,'Invalid program times or content');
  const result=await tx(async db=>{
   const {r,c}=await room(db,req.params.rid,req.userId,true);
   need(c.role,['owner','manager']);
   if(r.room_status==='ended')throw bad(409,'Event already ended');
   const count=(await db.query("SELECT COUNT(*)::int n FROM cc_floor_programs WHERE room_id=$1 AND status<>'cancelled'",[r.id])).rows[0].n;
   if(count>=200)throw bad(409,'Maximum scheduled segments');
   if(autoStart){
    const overlapping=await db.query("SELECT 1 FROM cc_floor_programs WHERE room_id=$1 AND auto_start AND status NOT IN('cancelled','completed') AND scheduled_start<$3 AND scheduled_end>$2 LIMIT 1",
      [r.id,start,end]);
    if(overlapping.rowCount)throw bad(409,'Two automatic programs cannot overlap');
   }
   const p=(await db.query("INSERT INTO cc_floor_programs(organization_id,campaign_id,room_id,title,speaker,description,segment_type,scheduled_start,scheduled_end,media_url,created_by,auto_start) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,title,segment_type,speaker,scheduled_start,scheduled_end,status,media_url,auto_start",
      [c.organization_id,c.id,r.id,title,speaker,description,segment,start,end,media,req.userId,autoStart])).rows[0];
   await log(db,c.organization_id,c.id,req.userId,'floor.program_scheduled',p.id,{roomId:r.id,type:segment,title,autoStart});
   return p;
  });res.status(201).json(result);
 }));
 router.post('/:rid/programs/:pid/status',handle(async(req,res)=>{
  const status=trim(req.body?.status,16);
  if(!uuid(req.params.pid)||!['live','completed','cancelled'].includes(status))throw bad(400,'Invalid program');
  const result=await tx(async db=>{
   const {r,c}=await room(db,req.params.rid,req.userId,true);
   need(c.role,['owner','manager']);
   const p=(await db.query('SELECT * FROM cc_floor_programs WHERE id=$1 AND room_id=$2 FOR UPDATE',[req.params.pid,r.id])).rows[0];
   if(!p)throw bad(404,'Program not found');
   if(p.status===status)return {program:{id:p.id,status:p.status},already:true};
   if(['completed','cancelled'].includes(p.status))throw bad(409,'Completed program is archived');
   if(status==='live'&&(r.room_status!=='open'||p.status!=='scheduled'))throw bad(409,'Open the fundraising hall first');
   if(status==='cancelled'&&p.status!=='scheduled')throw bad(409,'Cannot cancel a live program; finish it');
   if(status==='completed'&&p.status!=='live')throw bad(409,'Only a live program may be completed');
   if(status==='live'){
    const other=await db.query("SELECT id FROM cc_floor_programs WHERE room_id=$1 AND status='live'",[r.id]);
    if(other.rowCount)throw bad(409,'Another program is currently live');
   }
   const changed=(await db.query("UPDATE cc_floor_programs SET status=$1,started_at=CASE WHEN $1='live' THEN now() ELSE started_at END,completed_at=CASE WHEN $1='completed' THEN now() ELSE completed_at END WHERE id=$2 RETURNING id,title,segment_type,status,scheduled_start,scheduled_end",[status,p.id])).rows[0];
   if(status==='live'){
    const mode=p.segment_type==='break'?'break':'program';
    await db.query('UPDATE cc_live_rooms SET floor_mode=$1 WHERE id=$2',[mode,r.id]);
   }else if(p.status==='live'){
    await db.query("UPDATE cc_live_rooms SET floor_mode='calling' WHERE id=$1",[r.id]);
   }
   await log(db,c.organization_id,c.id,req.userId,'floor.program_status',p.id,{from:p.status,to:status,title:p.title});
   return {program:changed,already:false};
  });res.json(result);
 }));
 return router;
}
