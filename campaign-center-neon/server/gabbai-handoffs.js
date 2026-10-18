import {Router} from 'express';

// Gabbai Pro Operations Memory: human handover of campaign leadership duties.
// This creates no outgoing phone calls or automatic notifications.
export default function gabbaiHandoffsRouter({pool,campaignAccess,bad,log}){
 const router=Router(),run=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const leaderRoles=['owner','manager'];
 const guid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
 async function tx(fn){
  const db=await pool.connect();
  try{await db.query('BEGIN');const x=await fn(db);await db.query('COMMIT');return x;}
  catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}
  finally{db.release();}
 }
 async function leader(db,req){
  const c=await campaignAccess(db,req.params.cid,req.userId);
  if(!leaderRoles.includes(c.role))throw bad(403,'Campaign management only');
  return c;
 }
 router.get('/campaigns/:cid/handoffs',run(async(req,res)=>{
  const c=await leader(pool,req);
  const filter=req.query.filter||'open';
  if(!['open','mine','all','completed'].includes(filter))throw bad(400,'Invalid handoff filter');
  const members=await pool.query(
   "SELECT subject,role FROM cc_memberships WHERE organization_id=$1 AND membership_status='active'"+
   " AND role IN ('owner','manager') AND EXISTS(SELECT 1 FROM cc_campaign_members cm"+
   " WHERE cm.organization_id=$1 AND cm.campaign_id=$2 AND cm.subject=cc_memberships.subject)"+
   " ORDER BY role,subject LIMIT 100",[c.organization_id,c.id]);
  const conditions=filter==='open'?" AND h.status<>'completed'":filter==='mine'?
   " AND h.assigned_to=$3 AND h.status<>'completed'":filter==='completed'?
   " AND h.status='completed'":'';
  const list=await pool.query(
   "SELECT h.id,h.title,h.instructions,h.due_at,h.status,h.created_by,h.assigned_to,h.created_at,h.updated_at"+
   " FROM cc_gabbai_shift_handoffs h WHERE h.organization_id=$1 AND h.campaign_id=$2"+conditions+
   " ORDER BY CASE h.status WHEN 'open' THEN 0 WHEN 'accepted' THEN 1 ELSE 2 END,"+
   " h.due_at ASC NULLS LAST,h.created_at DESC,h.id DESC LIMIT 100",
   filter==='mine'?[c.organization_id,c.id,req.userId]:[c.organization_id,c.id]);
  const totals=(await pool.query(
   "SELECT COUNT(*) FILTER(WHERE status='open')::int open,"+
   " COUNT(*) FILTER(WHERE status='accepted')::int accepted,"+
   " COUNT(*) FILTER(WHERE status='completed')::int completed"+
   " FROM cc_gabbai_shift_handoffs WHERE organization_id=$1 AND campaign_id=$2",
   [c.organization_id,c.id])).rows[0];
  const history=await pool.query(
   "SELECT event.handoff_id,event.actor_subject,event.action,event.note,event.recorded_at"+
   " FROM cc_gabbai_shift_handoff_history event WHERE event.organization_id=$1 AND event.campaign_id=$2"+
   " AND event.handoff_id=ANY($3::uuid[]) ORDER BY event.recorded_at DESC,event.id DESC LIMIT 150",
   [c.organization_id,c.id,list.rows.map(x=>x.id)]);
  res.set('Cache-Control','private,no-store');
  res.json({handoffs:list.rows,managers:members.rows,history:history.rows,summary:totals,filter,
   humanHandoffOnly:true,externalMessageSent:false});
 }));
 router.post('/campaigns/:cid/handoffs',run(async(req,res)=>{
  const {title,instructions='',assignedTo,dueAt=null}=req.body||{};
  if(typeof title!=='string'||!title.trim()||title.length>160||
    typeof instructions!=='string'||instructions.length>1200||
    typeof assignedTo!=='string'||!assignedTo||assignedTo.length>200||
    (dueAt!==null&&(typeof dueAt!=='string'||!Number.isFinite(Date.parse(dueAt))||dueAt.length>45)))
   throw bad(400,'Invalid handoff');
  const result=await tx(async db=>{
   const c=await leader(db,req);
   if(assignedTo===req.userId)throw bad(409,'Choose a different campaign leader for handoff');
   if(c.status==='closed')throw bad(409,'Closed campaign');
   const target=(await db.query(
    "SELECT m.subject FROM cc_memberships m JOIN cc_campaign_members cm"+
    " ON cm.organization_id=m.organization_id AND cm.subject=m.subject AND cm.campaign_id=$2"+
    " WHERE m.organization_id=$1 AND m.subject=$3 AND m.membership_status='active'"+
    " AND m.role IN ('owner','manager')",[c.organization_id,c.id,assignedTo])).rows[0];
   if(!target)throw bad(404,'Active campaign leader not found');
   const item=(await db.query(
    "INSERT INTO cc_gabbai_shift_handoffs"+
    "(organization_id,campaign_id,created_by,assigned_to,title,instructions,due_at)"+
    " VALUES($1,$2,$3,$4,$5,$6,$7)"+
    " RETURNING id,title,status,assigned_to,created_at",
    [c.organization_id,c.id,req.userId,assignedTo,title.trim(),instructions.trim(),
     dueAt?new Date(dueAt).toISOString():null])).rows[0];
   await db.query(
    "INSERT INTO cc_gabbai_shift_handoff_history"+
    "(organization_id,campaign_id,handoff_id,actor_subject,action) VALUES($1,$2,$3,$4,'created')",
    [c.organization_id,c.id,item.id,req.userId]);
   await log(db,c.organization_id,c.id,req.userId,'gabbai.operations.handoff_created',item.id,
    {hasDueDate:!!dueAt});
   return item;
  });
  res.status(201).json({...result,externalMessageSent:false});
 }));
 router.post('/campaigns/:cid/handoffs/:id/action',run(async(req,res)=>{
  const action=req.body?.action,note=req.body?.note??'';
  if(!guid.test(req.params.id)||!['accepted','completed'].includes(action)||
    typeof note!=='string'||note.length>500)throw bad(400,'Invalid handoff action');
  const result=await tx(async db=>{
   const c=await leader(db,req);
   const item=(await db.query(
    'SELECT * FROM cc_gabbai_shift_handoffs WHERE organization_id=$1 AND campaign_id=$2 AND id=$3 FOR UPDATE',
    [c.organization_id,c.id,req.params.id])).rows[0];
   if(!item)throw bad(404,'Handoff unavailable');
   if(item.assigned_to!==req.userId)throw bad(403,'Only the assigned leader can complete the handoff');
   if(item.status===action)return {id:item.id,status:action,unchanged:true};
   if(item.status==='completed'||(action==='completed'&&item.status!=='accepted')||
     (action==='accepted'&&item.status!=='open'))throw bad(409,'Accept before completing a handoff');
   await db.query(
    'UPDATE cc_gabbai_shift_handoffs SET status=$1,updated_at=now() WHERE id=$2',
    [action,item.id]);
   await db.query(
    'INSERT INTO cc_gabbai_shift_handoff_history'+
    '(organization_id,campaign_id,handoff_id,actor_subject,action,note) VALUES($1,$2,$3,$4,$5,$6)',
    [c.organization_id,c.id,item.id,req.userId,action,note.trim()]);
   await log(db,c.organization_id,c.id,req.userId,'gabbai.operations.handoff_'+action,item.id,{});
   return {id:item.id,status:action,unchanged:false};
  });
  res.set('Cache-Control','private,no-store').json({...result,noExternalActions:true});
 }));
 return router;
}
