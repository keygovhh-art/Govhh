import { Router } from 'express';

// WEB ONLY. This endpoint does not run a telephone conference, microphone,
// conference bridge, SIP trunk, audio stream or outbound caller-ID service.
export default function webHallRouter({pool,authenticate,campaignAccess,need,log,bad,uuid,trim}){
 const router=Router();router.use(authenticate);
 const handle=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 async function tx(fn){const db=await pool.connect();try{await db.query('BEGIN');const result=await fn(db);await db.query('COMMIT');return result;}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
 async function room(db,id,subject,lock=false){
  if(!uuid(id))throw bad(400,'Invalid web hall');
  const r=await db.query('SELECT * FROM cc_live_rooms WHERE id=$1'+(lock?' FOR UPDATE':''),[id]);
  if(!r.rowCount)throw bad(404,'Room missing');
  const c=await campaignAccess(db,r.rows[0].campaign_id,subject);
  if(c.organization_id!==r.rows[0].organization_id)throw bad(404,'Room missing');
  return {room:r.rows[0],campaign:c};
 }
 router.get('/campaigns/:cid',handle(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);
  const r=await pool.query("SELECT r.id,r.title,r.room_status,r.scheduled_at,r.opened_at,r.closed_at,r.created_at,COUNT(p.id) FILTER (WHERE p.left_at IS NULL AND p.last_seen_at>now()-interval '45 seconds')::int AS recently_connected FROM cc_live_rooms r LEFT JOIN cc_live_room_participation p ON p.room_id=r.id WHERE r.campaign_id=$1 AND r.organization_id=$2 GROUP BY r.id ORDER BY r.created_at DESC LIMIT 40",[c.id,c.organization_id]);
  res.json({mode:'web_text_only',rooms:r.rows});
 }));
 router.post('/campaigns/:cid',handle(async(req,res)=>{
  const title=trim(req.body?.title,180);
  const scheduled=typeof req.body?.scheduledAt==='string'&&req.body.scheduledAt?new Date(req.body.scheduledAt):null;
  if(title.length<2||(scheduled&&Number.isNaN(scheduled.getTime())))throw bad(400,'Invalid room');
  const created=await tx(async db=>{
   const c=await campaignAccess(db,req.params.cid,req.userId);need(c.role,['owner','manager']);
   const r=(await db.query('INSERT INTO cc_live_rooms(organization_id,campaign_id,title,scheduled_at) VALUES($1,$2,$3,$4) RETURNING id,title,room_status,scheduled_at',[c.organization_id,c.id,title,scheduled])).rows[0];
   await log(db,c.organization_id,c.id,req.userId,'room.created',r.id,{mode:'web_text_only'});
   return r;
  });res.status(201).json(created);
 }));
 router.patch('/:rid/status',handle(async(req,res)=>{
  const status=trim(req.body?.status,16);if(!['open','paused','ended'].includes(status))throw bad(400,'Invalid room status');
  const updated=await tx(async db=>{
   const {room:r,campaign:c}=await room(db,req.params.rid,req.userId,true);need(c.role,['owner','manager']);
   if(r.room_status==='ended')throw bad(409,'Completed room remains archived; create a new one');
   const update=(await db.query("UPDATE cc_live_rooms SET room_status=$1,opened_at=CASE WHEN $1='open' THEN COALESCE(opened_at,now()) ELSE opened_at END,closed_at=CASE WHEN $1='ended' THEN now() ELSE closed_at END WHERE id=$2 RETURNING id,title,room_status,opened_at,closed_at",[status,r.id])).rows[0];
   if(status==='ended')await db.query('UPDATE cc_live_room_participation SET left_at=now() WHERE room_id=$1 AND left_at IS NULL',[r.id]);
   await log(db,c.organization_id,c.id,req.userId,'room.status_changed',r.id,{from:r.room_status,to:status});
   return update;
  });res.json(updated);
 }));
 router.post('/:rid/join',handle(async(req,res)=>{
  const result=await tx(async db=>{
   const {room:r,campaign:c}=await room(db,req.params.rid,req.userId,true);
   if(r.room_status!=='open')throw bad(409,'This web hall is not open');
   const prior=(await db.query('SELECT id FROM cc_live_room_participation WHERE room_id=$1 AND member_subject=$2 AND left_at IS NULL FOR UPDATE',[r.id,req.userId])).rows[0];
   if(prior){await db.query('UPDATE cc_live_room_participation SET last_seen_at=now() WHERE id=$1',[prior.id]);return {joined:true,duplicate:true};}
   await db.query('INSERT INTO cc_live_room_participation(room_id,member_subject,last_seen_at) VALUES($1,$2,now())',[r.id,req.userId]);
   await log(db,c.organization_id,c.id,req.userId,'room.joined',r.id);
   return {joined:true,duplicate:false};
  });res.status(result.duplicate?200:201).json(result);
 }));
 router.post('/:rid/heartbeat',handle(async(req,res)=>{
  const {room:r}=await room(pool,req.params.rid,req.userId);
  if(r.room_status!=='open')throw bad(409,'Room not open');
  const q=await pool.query('UPDATE cc_live_room_participation SET last_seen_at=now() WHERE room_id=$1 AND member_subject=$2 AND left_at IS NULL RETURNING id',[r.id,req.userId]);
  if(!q.rowCount)throw bad(404,'Join the room first');
  res.json({active:true,mode:'web_text_only'});
 }));
 router.post('/:rid/leave',handle(async(req,res)=>{
  const result=await tx(async db=>{
   const {room:r,campaign:c}=await room(db,req.params.rid,req.userId);
   const update=await db.query('UPDATE cc_live_room_participation SET left_at=now() WHERE room_id=$1 AND member_subject=$2 AND left_at IS NULL RETURNING id',[r.id,req.userId]);
   if(update.rowCount)await log(db,c.organization_id,c.id,req.userId,'room.left',r.id);
   return {left:true};
  });res.json(result);
 }));
 router.get('/:rid/announcements',handle(async(req,res)=>{
  const {room:r}=await room(pool,req.params.rid,req.userId);
  const messages=await pool.query('SELECT id,authored_by,message,created_at FROM cc_room_announcements WHERE room_id=$1 ORDER BY created_at DESC LIMIT 100',[r.id]);
  res.json(messages.rows);
 }));
 router.post('/:rid/announcements',handle(async(req,res)=>{
  const message=trim(req.body?.message,801);
  if(!message||message.length>800)throw bad(400,'Announcement must be 1–800 characters');
  const result=await tx(async db=>{
   const {room:r,campaign:c}=await room(db,req.params.rid,req.userId);need(c.role,['owner','manager']);
   if(r.room_status!=='open')throw bad(409,'Announcements only while web hall open');
   const row=(await db.query('INSERT INTO cc_room_announcements(organization_id,campaign_id,room_id,authored_by,message) VALUES($1,$2,$3,$4,$5) RETURNING id,authored_by,message,created_at',[c.organization_id,c.id,r.id,req.userId,message])).rows[0];
   await log(db,c.organization_id,c.id,req.userId,'room.announcement',row.id,{roomId:r.id});
   return row;
  });res.status(201).json(result);
 }));
 return router;
}
