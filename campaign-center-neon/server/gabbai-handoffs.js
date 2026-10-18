import {Router} from 'express';

// Actual Gabbai Pro working shift handoffs: manager records concrete work,
// open blockers and an agreed next step; another manager can acknowledge it.
// Nothing is automatically called, messaged, assigned, or marked complete.
export default function gabbaiHandoffsRouter({pool,campaignAccess,bad,log}){
 const router=Router(),wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const managers=new Set(['owner','manager']);
 const guid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
 async function scope(db,req){
  const campaign=await campaignAccess(db,req.params.cid,req.userId);
  if(!managers.has(campaign.role))throw bad(403,'Only Gabbai campaign leaders can read shift handoffs');
  return campaign;
 }
 async function transaction(fn){
  const db=await pool.connect();
  try{await db.query('BEGIN');const result=await fn(db);await db.query('COMMIT');return result;}
  catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
 }
 const select=
  "SELECT h.id,h.written_by,h.headline,h.completed_summary,h.blockers_summary,h.next_action,"+
  " h.urgency,h.target_at,h.created_at,"+
  " EXISTS(SELECT 1 FROM cc_gabbai_shift_handoff_acks ack"+
  " WHERE ack.handoff_id=h.id AND ack.acknowledged_by=$3) AS acknowledged_by_me,"+
  " (SELECT COUNT(*)::int FROM cc_gabbai_shift_handoff_acks ack WHERE ack.handoff_id=h.id) AS acknowledgements"+
  " FROM cc_gabbai_shift_handoffs h WHERE h.organization_id=$1 AND h.campaign_id=$2";
 router.get('/campaigns/:cid/handoffs',wrap(async(req,res)=>{
  const c=await scope(pool,req);
  const days=Number(req.query.days||30);
  if(![7,30,90].includes(days))throw bad(400,'Choose a 7, 30 or 90 day period');
  const rows=await pool.query(
   select+" AND h.created_at>=now()-($4::int*interval '1 day')"+
   " ORDER BY CASE WHEN h.urgency='critical' AND h.written_by<>$3 AND NOT EXISTS("+
   " SELECT 1 FROM cc_gabbai_shift_handoff_acks ack WHERE ack.handoff_id=h.id AND ack.acknowledged_by=$3)"+
   " THEN 0 ELSE 1 END, h.created_at DESC,h.id DESC LIMIT 60",
   [c.organization_id,c.id,req.userId,days]);
  const pending=rows.rows.filter(x=>x.written_by!==req.userId&&!x.acknowledged_by_me);
  const critical=pending.filter(x=>x.urgency==='critical');
  res.set('Cache-Control','private,no-store').json({
   handoffs:rows.rows,days,shown:rows.rowCount,pendingForMe:pending.length,
   urgentPendingForMe:critical.length,canWrite:true,canAcknowledgeOthers:true,
   notScheduledNotifications:true,recordedWorkNotVerifiedTaskCompletion:true
  });
 }));
 router.post('/campaigns/:cid/handoffs',wrap(async(req,res)=>{
  const {headline,completedSummary='',blockersSummary='',nextAction,urgency='normal',targetAt=null}=req.body||{};
  if(typeof headline!=='string'||!headline.trim()||headline.length>140||
     typeof completedSummary!=='string'||completedSummary.length>1200||
     typeof blockersSummary!=='string'||blockersSummary.length>1200||
     typeof nextAction!=='string'||!nextAction.trim()||nextAction.length>1200||
     !['normal','high','critical'].includes(urgency)||
     (targetAt!==null&&(typeof targetAt!=='string'||targetAt.length>40||
       !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(targetAt)||
       !Number.isFinite(Date.parse(targetAt)))))
   throw bad(400,'Incomplete or invalid shift handoff');
  const item=await transaction(async db=>{
   const c=await scope(db,req);
   if(c.status==='closed')throw bad(409,'Campaign closed');
   const count=await db.query(
    "SELECT COUNT(*)::int total FROM cc_gabbai_shift_handoffs"+
    " WHERE organization_id=$1 AND campaign_id=$2 AND written_by=$3"+
    " AND created_at>now()-interval '24 hours'",[c.organization_id,c.id,req.userId]);
   if(count.rows[0].total>=50)throw bad(409,'Daily personal handoff limit reached');
   const row=(await db.query(
    'INSERT INTO cc_gabbai_shift_handoffs(organization_id,campaign_id,written_by,headline,'+
    ' completed_summary,blockers_summary,next_action,urgency,target_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)'+
    ' RETURNING id,headline,urgency,created_at',
    [c.organization_id,c.id,req.userId,headline.trim(),completedSummary.trim(),
      blockersSummary.trim(),nextAction.trim(),urgency,targetAt])).rows[0];
   // Shared activity log includes no internal content.
   await log(db,c.organization_id,c.id,req.userId,'gabbai.handoff.created',row.id,{urgency});
   return row;
  });
  res.set('Cache-Control','private,no-store').status(201).json({
   handoff:item,manualRecordOnly:true,externalNotificationSent:false
  });
 }));
 router.post('/campaigns/:cid/handoffs/:id/ack',wrap(async(req,res)=>{
  if(!guid.test(req.params.id))throw bad(400,'Invalid handoff');
  const result=await transaction(async db=>{
   const c=await scope(db,req);
   const item=(await db.query(
    'SELECT id,written_by FROM cc_gabbai_shift_handoffs WHERE organization_id=$1 AND campaign_id=$2 AND id=$3 FOR UPDATE',
    [c.organization_id,c.id,req.params.id])).rows[0];
   if(!item)throw bad(404,'Handoff unavailable');
   if(item.written_by===req.userId)throw bad(409,'Another campaign leader must acknowledge this handoff');
   const r=await db.query(
    'INSERT INTO cc_gabbai_shift_handoff_acks(organization_id,campaign_id,handoff_id,acknowledged_by)'+
    ' VALUES($1,$2,$3,$4) ON CONFLICT(handoff_id,acknowledged_by) DO NOTHING'+
    ' RETURNING id,acknowledged_at',
    [c.organization_id,c.id,item.id,req.userId]);
   if(r.rowCount){
    await log(db,c.organization_id,c.id,req.userId,'gabbai.handoff.acknowledged',item.id,{});
   }
   return {id:item.id,acknowledged:true,alreadyAcknowledged:!r.rowCount,
    taskStatusUnchanged:true,externalNotificationSent:false};
  });
  res.set('Cache-Control','private,no-store').status(result.alreadyAcknowledged?200:201).json(result);
 }));
 return router;
}
