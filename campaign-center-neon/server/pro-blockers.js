import {Router} from 'express';

// Factual blocker tracking; does NOT use AI, rankings or external notifications.
// Every read/write is verified against authenticated campaign membership.
export default function proBlockersRouter({pool,campaignAccess,bad,trim,uuid,log}){
 const router=Router();
 const run=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const reasons=['no_response','missing_information','approval_needed','payment_pending','other'];
 const elevated=['owner','manager','finance','auditor'];
 async function scopedTask(db,id,user,lock=false){
  if(!uuid(id))throw bad(400,'Invalid task');
  const t=(await db.query('SELECT * FROM cc_assignments WHERE id=$1'+(lock?' FOR UPDATE':''),[id])).rows[0];
  if(!t)throw bad(404,'Task not found');
  const c=await campaignAccess(db,t.campaign_id,user);
  if(t.organization_id!==c.organization_id)throw bad(404,'Task not found');
  const higher=elevated.includes(c.role);
  if(!higher && t.assignee_subject!==user){
   if(c.role!=='squad_leader')throw bad(404,'Task not found');
   const r=await db.query(
    "SELECT 1 FROM cc_campaign_members leader JOIN cc_campaign_members worker"+
    " ON worker.organization_id=leader.organization_id AND worker.campaign_id=leader.campaign_id"+
    " AND leader.team_name=worker.team_name AND leader.team_name<>''"+
    " WHERE leader.organization_id=$1 AND leader.campaign_id=$2"+
    " AND leader.subject=$3 AND worker.subject=$4",
    [c.organization_id,c.id,user,t.assignee_subject]);
   if(!r.rowCount)throw bad(404,'Task not found');
  }
  return {task:t,campaign:c};
 }
 async function tx(fn){
  const db=await pool.connect();
  try{await db.query('BEGIN');const out=await fn(db);await db.query('COMMIT');return out;}
  catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 router.get('/campaigns/:cid/blockers',run(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);
  const higher=elevated.includes(c.role);
  const squad=c.role==='squad_leader';
  const result=await pool.query(
   "SELECT b.task_id,b.reason,b.details,b.is_active,b.updated_at,t.title,t.status,t.assignee_subject,t.due_at"+
   " FROM cc_pro_task_blockers b JOIN cc_assignments t ON t.id=b.task_id"+
   " WHERE b.organization_id=$1 AND b.campaign_id=$2"+
   " AND ($3::boolean OR t.assignee_subject=$4 OR ($5::boolean AND EXISTS("+
   " SELECT 1 FROM cc_campaign_members leader JOIN cc_campaign_members worker"+
   " ON worker.organization_id=leader.organization_id AND worker.campaign_id=leader.campaign_id"+
   " AND worker.team_name=leader.team_name AND leader.team_name<>''"+
   " WHERE leader.organization_id=$1 AND leader.campaign_id=$2 AND leader.subject=$4"+
   " AND worker.subject=t.assignee_subject)))"+
   " ORDER BY b.is_active DESC,b.updated_at DESC LIMIT 200",
   [c.organization_id,c.id,higher,req.userId,squad]);
  const counts={};
  const visible=result.rows.filter(x=>x.is_active&&['open','in_progress'].includes(x.status));
  for(const x of visible)counts[x.reason]=(counts[x.reason]||0)+1;
  res.set('Cache-Control','private,no-store');
  res.json({blockers:result.rows,activeByReason:counts,scoped:true,onlyReportedBlockers:true});
 }));
 router.put('/tasks/:id/blocker',run(async(req,res)=>{
  const isActive=req.body?.active;
  if(typeof isActive!=='boolean')throw bad(400,'active must be boolean');
  const reason=req.body?.reason;
  const details=trim(req.body?.details,500);
  if(isActive&&!reasons.includes(reason))throw bad(400,'Valid reason required');
  if(req.body?.details!==undefined&&(typeof req.body.details!=='string'||req.body.details.length>500))
   throw bad(400,'Details too long');
  const result=await tx(async db=>{
   const {task:t,campaign:c}=await scopedTask(db,req.params.id,req.userId,true);
   if(c.status==='closed'||!['open','in_progress'].includes(t.status))
    throw bad(409,'Task not open');
   if(!['owner','manager'].includes(c.role) && t.assignee_subject!==req.userId)
    throw bad(403,'Only assignee or campaign manager may update a blocker');
   const previous=(await db.query('SELECT * FROM cc_pro_task_blockers WHERE task_id=$1 FOR UPDATE',[t.id])).rows[0];
   if(!previous&&!isActive)throw bad(404,'No blocker to resolve');
   const nextReason=isActive?reason:previous.reason;
   const nextDetails=isActive?details:'';
   if(previous&&previous.is_active===isActive&&previous.reason===nextReason&&previous.details===nextDetails)
    return {taskId:t.id,reason:previous.reason,active:previous.is_active,unchanged:true};
   const change=!previous?'raised':previous.is_active&&!isActive?'resolved':
     !previous.is_active&&isActive?'reopened':'changed';
   await db.query(
    'INSERT INTO cc_pro_task_blockers(task_id,organization_id,campaign_id,reason,details,is_active,updated_by)'+
    ' VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(task_id) DO UPDATE SET reason=excluded.reason,'+
    ' details=excluded.details,is_active=excluded.is_active,updated_by=excluded.updated_by,updated_at=now()',
    [t.id,c.organization_id,c.id,nextReason,nextDetails,isActive,req.userId]);
   await db.query(
    'INSERT INTO cc_pro_blocker_history(task_id,organization_id,campaign_id,actor_subject,reason,action) VALUES($1,$2,$3,$4,$5,$6)',
    [t.id,c.organization_id,c.id,req.userId,nextReason,change]);
   // Do not store private details in globally visible audit metadata.
   await log(db,c.organization_id,c.id,req.userId,'pro.task.blocker',t.id,{reason:nextReason,change});
   return {taskId:t.id,reason:nextReason,active:isActive,change};
  });
  res.json(result);
 }));
 return router;
}
