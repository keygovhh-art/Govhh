import {Router} from 'express';

// Experimental peer-to-peer AUDIO only, for at most EIGHT participants.
// Browser STUN works on some networks. There is deliberately no claim of
// scalable conferencing, background delivery, or guaranteed NAT traversal.
export default function rtcRouter({pool,authenticate,member,campaignAccess,bad,uuid,log}){
 const router=Router();router.use(authenticate);
 const handle=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const enabled=process.env.CC_EXPERIMENTAL_P2P_AUDIO==='true';
 const managed=['owner','manager'];
 const forbid=()=>bad(403,'Conference audio permission denied');
 async function tx(work){
  const db=await pool.connect();
  try{await db.query('BEGIN');const result=await work(db);await db.query('COMMIT');return result;}
  catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 async function context(db,id,subject,lock=false){
  if(!enabled)throw bad(404,'Browser audio pilot is disabled');
  if(!uuid(id))throw bad(400,'Invalid conference');
  const c=(await db.query('SELECT * FROM cc_conference_rooms WHERE id=$1'+(lock?' FOR UPDATE':''),[id])).rows[0];
  if(!c)throw bad(404,'Conference not found');
  const role=await member(db,c.organization_id,subject);
  if(c.campaign_id){
   const campaign=await campaignAccess(db,c.campaign_id,subject);
   if(campaign.organization_id!==c.organization_id)throw bad(404,'Conference not found');
  }
  const isManager=managed.includes(role);
  if(c.room_status!=='open')throw bad(409,'Conference is not open');
  const row=(await db.query('SELECT * FROM cc_conference_participants WHERE room_id=$1 AND subject=$2',[id,subject])).rows[0];
  if(!row||!row.admitted||row.banned||row.left_at)throw forbid();
  if(!isManager){
   const denied=(await db.query("SELECT 1 FROM cc_conference_access_rules WHERE room_id=$1 AND subject=$2 AND enabled AND rule='deny_entry'",[id,subject])).rowCount;
   if(denied)throw forbid();
  }
  const canSpeak=!row.moderator_muted&&(isManager||c.speaking_mode==='open'||(c.speaking_mode==='moderated'&&row.speaking_granted));
  return {conference:c,participant:row,isManager,canSpeak};
 }
 router.post('/:rid/join',handle(async(req,res)=>{
  const mode=req.body?.mode;
  if(!['listener','speaker'].includes(mode))throw bad(400,'Select speaker or listener');
  const result=await tx(async db=>{
   const contextInfo=await context(db,req.params.rid,req.userId,true);
   if(mode==='speaker'&&!contextInfo.canSpeak)throw forbid();
   // Current live peers are bounded; use a row lock on the same room to
   // serialize two simultaneous joins and avoid exceeding the eight-person cap.
   const existing=(await db.query('SELECT mode FROM cc_conference_rtc_peers WHERE room_id=$1 AND subject=$2 FOR UPDATE',[req.params.rid,req.userId])).rows[0];
   const peers=await db.query("SELECT subject,mode FROM cc_conference_rtc_peers WHERE room_id=$1 AND last_seen_at>now()-interval '45 seconds'",[req.params.rid]);
   if(!existing&&peers.rowCount>=8)throw bad(409,'Small browser audio session is full (maximum 8)');
   const speakers=peers.rows.filter(p=>p.mode==='speaker'&&p.subject!==req.userId);
   if(mode==='speaker'&&speakers.length>=2)throw bad(409,'Two speakers maximum; another speaker must leave first');
   await db.query("INSERT INTO cc_conference_rtc_peers(room_id,subject,mode) VALUES($1,$2,$3) ON CONFLICT(room_id,subject) DO UPDATE SET mode=$3,last_seen_at=now()",
    [req.params.rid,req.userId,mode]);
   await log(db,contextInfo.conference.organization_id,contextInfo.conference.campaign_id,req.userId,'conference.rtc_join',req.params.rid,{mode});
   return {mode,limit:8};
  });res.json(result);
 }));
 router.get('/:rid/state',handle(async(req,res)=>{
  const c=await context(pool,req.params.rid,req.userId);
  const mine=(await pool.query("SELECT mode FROM cc_conference_rtc_peers WHERE room_id=$1 AND subject=$2 AND last_seen_at>now()-interval '45 seconds'",[req.params.rid,req.userId])).rows[0];
  if(!mine)throw forbid();
  if(mine.mode==='speaker'&&!c.canSpeak)throw forbid();
  const after=Number(req.query.after||0);
  if(!Number.isSafeInteger(after)||after<0)throw bad(400,'Invalid signal cursor');
  // A legitimate listener can only see signals addressed to them.
  const [peers,signals]=await Promise.all([
   pool.query("SELECT subject,mode FROM cc_conference_rtc_peers WHERE room_id=$1 AND last_seen_at>now()-interval '45 seconds' ORDER BY subject LIMIT 8",[req.params.rid]),
   pool.query("SELECT id,sender_subject,kind,payload FROM cc_conference_rtc_signals WHERE room_id=$1 AND recipient_subject=$2 AND id>$3 AND created_at>now()-interval '3 minutes' ORDER BY id ASC LIMIT 80",
    [req.params.rid,req.userId,after])
  ]);
  await pool.query('UPDATE cc_conference_rtc_peers SET last_seen_at=now() WHERE room_id=$1 AND subject=$2',[req.params.rid,req.userId]);
  res.set('Cache-Control','no-store');
  res.json({mode:mine.mode,canSpeak:c.canSpeak,peers:peers.rows,signals:signals.rows,pollAfterMs:1800});
 }));
 router.post('/:rid/signal',handle(async(req,res)=>{
  const {to,kind,payload}=req.body||{};
  if(typeof to!=='string'||to.length<1||to.length>128||to===req.userId||
   !['offer','answer','ice','bye'].includes(kind)||
   !payload||typeof payload!=='object'||Array.isArray(payload)||
   JSON.stringify(payload).length>18000)throw bad(400,'Invalid browser media signal');
  const created=await tx(async db=>{
   const c=await context(db,req.params.rid,req.userId);
   const self=(await db.query("SELECT mode FROM cc_conference_rtc_peers WHERE room_id=$1 AND subject=$2 AND last_seen_at>now()-interval '45 seconds'",[req.params.rid,req.userId])).rows[0];
   if(!self)throw forbid();
   if(kind==='offer'&&(self.mode!=='speaker'||!c.canSpeak))throw forbid();
   if(self.mode==='speaker'&&!c.canSpeak)throw forbid();
   const target=(await db.query("SELECT p.mode FROM cc_conference_rtc_peers p JOIN cc_conference_participants a ON a.room_id=p.room_id AND a.subject=p.subject WHERE p.room_id=$1 AND p.subject=$2 AND p.last_seen_at>now()-interval '45 seconds' AND a.admitted AND NOT a.banned AND a.left_at IS NULL",[req.params.rid,to])).rows[0];
   if(!target)throw bad(404,'Peer no longer in conference');
   if(kind==='offer'&&target.mode!=='listener')throw bad(400,'Speakers cannot offer to another speaker');
   const r=(await db.query('INSERT INTO cc_conference_rtc_signals(room_id,sender_subject,recipient_subject,kind,payload) VALUES($1,$2,$3,$4,$5) RETURNING id',
    [req.params.rid,req.userId,to,kind,JSON.stringify(payload)])).rows[0];
   // Signaling is ephemeral; never store permanent recordings or SDP in audit.
   await db.query("DELETE FROM cc_conference_rtc_signals WHERE room_id=$1 AND created_at<now()-interval '10 minutes'",[req.params.rid]);
   return r.id;
  });res.status(201).json({signalId:created});
 }));
 router.post('/:rid/leave',handle(async(req,res)=>{
  await tx(async db=>{
   const c=await context(db,req.params.rid,req.userId);
   await db.query('DELETE FROM cc_conference_rtc_peers WHERE room_id=$1 AND subject=$2',[req.params.rid,req.userId]);
   await log(db,c.conference.organization_id,c.conference.campaign_id,req.userId,'conference.rtc_leave',req.params.rid);
  });res.json({left:true});
 }));
 return router;
}
