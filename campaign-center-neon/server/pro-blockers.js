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
 // All counts are computed over EVERY authorized task, not the first 200.
 const viewerScope=
  " FROM cc_pro_task_blockers b JOIN cc_assignments t"+
  " ON t.id=b.task_id AND t.organization_id=b.organization_id"+
  " AND t.campaign_id=b.campaign_id"+
  " WHERE b.organization_id=$1 AND b.campaign_id=$2"+
  " AND ($3::boolean OR t.assignee_subject=$4 OR ($5::boolean AND EXISTS("+
  " SELECT 1 FROM cc_campaign_members captain JOIN cc_campaign_members peer"+
  " ON peer.organization_id=captain.organization_id AND peer.campaign_id=captain.campaign_id"+
  " AND peer.team_name=captain.team_name AND captain.team_name<>''"+
  " WHERE captain.organization_id=$1 AND captain.campaign_id=$2"+
  " AND captain.subject=$4 AND peer.subject=t.assignee_subject)))";
 const activeCase="b.is_active AND t.status IN ('open','in_progress')";
 router.get('/campaigns/:cid/blockers',run(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);
  const higher=elevated.includes(c.role),squad=c.role==='squad_leader';
  const page=Number(req.query.page??1),filter=req.query.filter??'all',limit=50;
  if(!Number.isSafeInteger(page)||page<1||page>10000)
   throw bad(400,'Invalid blocker page');
  if(typeof filter!=='string'||!['all','active','inactive'].includes(filter))
   throw bad(400,'Invalid blocker filter');
  const args=[c.organization_id,c.id,higher,req.userId,squad];
  const match=filter==='active'?' AND ('+activeCase+')':
    filter==='inactive'?' AND NOT ('+activeCase+')':'';
  const list="SELECT b.task_id,b.reason,b.details,b.is_active,b.updated_at,"+
   " t.title,t.status,t.assignee_subject,t.due_at"+viewerScope+match+
   " ORDER BY ("+activeCase+") DESC,b.updated_at DESC,b.task_id DESC LIMIT $6 OFFSET $7";
  const totals="SELECT COUNT(*)::int total,"+
   " COUNT(*) FILTER(WHERE "+activeCase+")::int active,"+
   " COUNT(*) FILTER(WHERE NOT ("+activeCase+"))::int inactive"+
   viewerScope;
  const reasonTotals="SELECT b.reason,COUNT(*)::int n"+viewerScope+
   " AND "+activeCase+" GROUP BY b.reason ORDER BY n DESC,b.reason";
  const filteredCount="SELECT COUNT(*)::int total"+viewerScope+match;
  const since="30 days";
  const historyCounts="SELECT h.action,COUNT(*)::int n"+
   " FROM cc_pro_blocker_history h JOIN cc_assignments t"+
   " ON t.id=h.task_id AND t.organization_id=h.organization_id"+
   " AND t.campaign_id=h.campaign_id"+
   " WHERE h.organization_id=$1 AND h.campaign_id=$2"+
   " AND h.created_at>=now()-interval '30 days'"+
   " AND ($3::boolean OR t.assignee_subject=$4 OR ($5::boolean AND EXISTS("+
   " SELECT 1 FROM cc_campaign_members captain JOIN cc_campaign_members peer"+
   " ON peer.organization_id=captain.organization_id AND peer.campaign_id=captain.campaign_id"+
   " AND peer.team_name=captain.team_name AND captain.team_name<>''"+
   " WHERE captain.organization_id=$1 AND captain.campaign_id=$2"+
   " AND captain.subject=$4 AND peer.subject=t.assignee_subject)))"+
   " GROUP BY h.action ORDER BY h.action";
  const [visible,total,filtered,reason,history]=await Promise.all([
   pool.query(list,[...args,limit,(page-1)*limit]),
   pool.query(totals,args),
   pool.query(filteredCount,args),
   pool.query(reasonTotals,args),
   pool.query(historyCounts,args)
  ]);
  res.set('Cache-Control','private,no-store');
  res.json({
   blockers:visible.rows,
   total:total.rows[0].total,activeTotal:total.rows[0].active,
   inactiveTotal:total.rows[0].inactive,filteredTotal:filtered.rows[0].total,
   activeByReason:Object.fromEntries(reason.rows.map(x=>[x.reason,x.n])),
   changesLast30Days:Object.fromEntries(history.rows.map(x=>[x.action,x.n])),
   days:30,page,pageCount:Math.max(1,Math.ceil(filtered.rows[0].total/limit)),
   limit,filter,allVisibleBlockersCounted:true,scoped:true,onlyReportedBlockers:true,
   intelligenceSource:'recorded_blocker_history_not_prediction'
  });
 }));
 router.get('/campaigns/:cid/blocker-candidates',run(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);
  const q=req.query.q??'';
  if(typeof q!=='string'||q.length>100)throw bad(400,'Invalid search');
  const search=q.trim(),higher=elevated.includes(c.role),squad=c.role==='squad_leader';
  const result=await pool.query(
   "SELECT t.id,t.title,t.priority,t.due_at,t.assignee_subject FROM cc_assignments t"+
   " WHERE t.organization_id=$1 AND t.campaign_id=$2"+
   " AND t.status IN ('open','in_progress')"+
   " AND ($3::boolean OR t.assignee_subject=$4 OR ($5::boolean AND EXISTS("+
   " SELECT 1 FROM cc_campaign_members captain JOIN cc_campaign_members peer"+
   " ON peer.organization_id=captain.organization_id AND peer.campaign_id=captain.campaign_id"+
   " AND peer.team_name=captain.team_name AND captain.team_name<>''"+
   " WHERE captain.organization_id=$1 AND captain.campaign_id=$2"+
   " AND captain.subject=$4 AND peer.subject=t.assignee_subject)))"+
   " AND ($6='' OR t.title ILIKE '%'||$6||'%')"+
   " ORDER BY (CASE WHEN t.due_at<now() THEN 0 ELSE 1 END),"+
   " (CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END),"+
   " t.due_at ASC NULLS LAST,t.created_at ASC,t.id ASC LIMIT 50",
   [c.organization_id,c.id,higher,req.userId,squad,search]);
  res.set('Cache-Control','private,no-store');
  res.json({candidates:result.rows,limit:50,search,filteredServerSide:true});
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
