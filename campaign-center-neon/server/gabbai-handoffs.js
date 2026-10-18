import {Router} from 'express';

// Gabbai Pro human operations handoffs. A status update represents a
// staff member's manual report, not a phone call or external notification.
export default function gabbaiHandoffsRouter({pool,campaignAccess,bad,uuid,log}){
 const router=Router(),run=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const management=new Set(['owner','manager']);
 const activeStates=new Set(['open','in_progress','done']);
 async function tx(fn){
  const db=await pool.connect();
  try{await db.query('BEGIN');const x=await fn(db);await db.query('COMMIT');return x;}
  catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
 }
 async function find(db,req,lock=false){
  if(!uuid(req.params.id))throw bad(400,'Invalid handoff');
  const h=(await db.query(
   'SELECT * FROM cc_gabbai_handoffs WHERE id=$1'+(lock?' FOR UPDATE':''),
   [req.params.id])).rows[0];
  if(!h)throw bad(404,'Handoff not found');
  const c=await campaignAccess(db,h.campaign_id,req.userId);
  if(c.organization_id!==h.organization_id)throw bad(404,'Handoff not found');
  if(!management.has(c.role)&&h.created_by!==req.userId&&h.assigned_to!==req.userId)
   throw bad(404,'Handoff not found');
  return {c,h};
 }
 router.get('/campaigns/:cid/handoffs',run(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);
  const manager=management.has(c.role);
  const [cards,stats]=await Promise.all([
   pool.query(
    "SELECT id,title,instructions,priority,status,due_at,created_at,updated_at,"+
    " created_by,assigned_to,completed_by,completed_at FROM cc_gabbai_handoffs"+
    " WHERE organization_id=$1 AND campaign_id=$2"+
    " AND ($3::boolean OR created_by=$4 OR assigned_to=$4)"+
    " ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,"+
    " CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,"+
    " due_at ASC NULLS LAST,created_at DESC LIMIT 120",
    [c.organization_id,c.id,manager,req.userId]),
   pool.query(
    "SELECT COUNT(*) FILTER (WHERE status='open')::int open,"+
    " COUNT(*) FILTER (WHERE status='in_progress')::int in_progress,"+
    " COUNT(*) FILTER (WHERE status='done')::int done,"+
    " COUNT(*) FILTER (WHERE status<>'done' AND due_at<now())::int overdue,"+
    " COUNT(*) FILTER (WHERE status<>'done' AND assigned_to=$4)::int assigned_to_me"+
    " FROM cc_gabbai_handoffs WHERE organization_id=$1 AND campaign_id=$2"+
    " AND ($3::boolean OR created_by=$4 OR assigned_to=$4)",
    [c.organization_id,c.id,manager,req.userId])
  ]);
  res.set('Cache-Control','private,no-store');
  res.json({handoffs:cards.rows,stats:stats.rows[0],canCreate:manager,limit:120,
   source:'human_operations',automatedExternalNotifications:false});
 }));
 // Exact per-member counts support managerial work redistribution.
 // No productivity score, personal donor names, or call-statistics assumptions.
 router.get('/campaigns/:cid/member-workload',run(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);
  if(!management.has(c.role))throw bad(403,'Management dashboard only');
  const rows=await pool.query(
   "SELECT cm.subject,cm.team_name,m.role,"+
   " COALESCE(t.open_tasks,0)::int AS open_tasks,"+
   " COALESCE(t.overdue_tasks,0)::int AS overdue_tasks,"+
   " COALESCE(t.due_soon_tasks,0)::int AS due_soon_tasks,"+
   " COALESCE(h.open_handoffs,0)::int AS open_handoffs,"+
   " COALESCE(h.overdue_handoffs,0)::int AS overdue_handoffs,"+
   " (COALESCE(t.open_tasks,0)+COALESCE(h.open_handoffs,0))::int AS total_open_work"+
   " FROM cc_campaign_members cm JOIN cc_memberships m"+
   " ON m.organization_id=cm.organization_id AND m.subject=cm.subject AND m.membership_status='active'"+
   " LEFT JOIN LATERAL (SELECT"+
   " COUNT(*) FILTER(WHERE a.status IN ('open','in_progress'))::int open_tasks,"+
   " COUNT(*) FILTER(WHERE a.status IN ('open','in_progress') AND a.due_at<now())::int overdue_tasks,"+
   " COUNT(*) FILTER(WHERE a.status IN ('open','in_progress') AND a.due_at>=now()"+
   " AND a.due_at<now()+interval '48 hours')::int due_soon_tasks"+
   " FROM cc_assignments a WHERE a.organization_id=cm.organization_id"+
   " AND a.campaign_id=cm.campaign_id AND a.assignee_subject=cm.subject) t ON true"+
   " LEFT JOIN LATERAL (SELECT"+
   " COUNT(*) FILTER(WHERE x.status<>'done')::int open_handoffs,"+
   " COUNT(*) FILTER(WHERE x.status<>'done' AND x.due_at<now())::int overdue_handoffs"+
   " FROM cc_gabbai_handoffs x WHERE x.organization_id=cm.organization_id"+
   " AND x.campaign_id=cm.campaign_id AND x.assigned_to=cm.subject) h ON true"+
   " WHERE cm.organization_id=$1 AND cm.campaign_id=$2"+
   " ORDER BY (COALESCE(t.overdue_tasks,0)+COALESCE(h.overdue_handoffs,0)) DESC, (COALESCE(t.open_tasks,0)+COALESCE(h.open_handoffs,0)) DESC,cm.subject ASC LIMIT 500",
   [c.organization_id,c.id]);
  const members=rows.rows;
  const totals=members.reduce((s,m)=>{
   s.openTasks+=m.open_tasks;s.overdueTasks+=m.overdue_tasks;
   s.dueSoonTasks+=m.due_soon_tasks;
   s.openHandoffs+=m.open_handoffs;s.overdueHandoffs+=m.overdue_handoffs;return s;
  },{openTasks:0,overdueTasks:0,dueSoonTasks:0,openHandoffs:0,overdueHandoffs:0});
  res.set('Cache-Control','private,no-store').json({
   members,totals,shown:members.length,limit:500,
   dataSource:'assigned_campaign_tasks_and_operational_handoffs',
   basedOnActualRecords:true,noStaffPerformanceRating:true,doesNotReassignAutomatically:true
  });
 }));
 router.post('/campaigns/:cid/handoffs',run(async(req,res)=>{
  const {title,instructions='',assignedTo,priority='normal',dueAt=null}=req.body||{};
  if(typeof title!=='string'||!title.trim()||title.length>180||
     typeof instructions!=='string'||instructions.length>2000||
     typeof assignedTo!=='string'||assignedTo.length>300||
     !['normal','high','critical'].includes(priority)||
     (dueAt!==null&&(typeof dueAt!=='string'||!Number.isFinite(Date.parse(dueAt))||
       !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dueAt))))
   throw bad(400,'Invalid handoff details');
  const result=await tx(async db=>{
   const c=await campaignAccess(db,req.params.cid,req.userId);
   if(!management.has(c.role))throw bad(403,'Manager required to assign operational handoffs');
   if(c.status==='closed')throw bad(409,'Closed campaign');
   // Target must be active in this same campaign, not just in the workspace.
   const target=(await db.query(
    "SELECT m.subject FROM cc_campaign_members cm JOIN cc_memberships m"+
    " ON m.organization_id=cm.organization_id AND m.subject=cm.subject"+
    " WHERE cm.organization_id=$1 AND cm.campaign_id=$2 AND cm.subject=$3"+
    " AND m.membership_status='active'",
    [c.organization_id,c.id,assignedTo])).rows[0];
   if(!target)throw bad(400,'Choose an active campaign member');
   const row=(await db.query(
    "INSERT INTO cc_gabbai_handoffs("+
    " organization_id,campaign_id,created_by,assigned_to,title,instructions,priority,due_at)"+
    " VALUES($1,$2,$3,$4,$5,$6,$7,$8)"+
    " RETURNING id,title,status,priority,assigned_to,due_at",
    [c.organization_id,c.id,req.userId,assignedTo,title.trim(),instructions.trim(),
     priority,dueAt?new Date(dueAt).toISOString():null])).rows[0];
   await db.query(
    "INSERT INTO cc_gabbai_handoff_events(organization_id,campaign_id,handoff_id,actor_subject,kind,status_to)"+
    " VALUES($1,$2,$3,$4,'created','open')",[c.organization_id,c.id,row.id,req.userId]);
   await log(db,c.organization_id,c.id,req.userId,'gabbai.handoff.created',row.id,
    {assigneeAssigned:true,priority});
   return row;
  });
  res.set('Cache-Control','private,no-store').status(201).json({handoff:result,notifiedExternally:false});
 }));
 router.get('/handoffs/:id/events',run(async(req,res)=>{
  const {c,h}=await find(pool,req);
  const events=await pool.query(
   "SELECT id,actor_subject,kind,body,status_to,created_at FROM cc_gabbai_handoff_events"+
   " WHERE organization_id=$1 AND campaign_id=$2 AND handoff_id=$3"+
   " ORDER BY created_at ASC,id ASC LIMIT 200",[c.organization_id,c.id,h.id]);
  res.set('Cache-Control','private,no-store').json({handoffId:h.id,events:events.rows});
 }));
 router.post('/handoffs/:id/comments',run(async(req,res)=>{
  const body=req.body?.body;
  if(typeof body!=='string'||!body.trim()||body.length>1500)
   throw bad(400,'Write a short progress update');
  const result=await tx(async db=>{
   const {c,h}=await find(db,req,true);
   if(c.status==='closed')throw bad(409,'Closed campaign');
   const row=(await db.query(
    "INSERT INTO cc_gabbai_handoff_events(organization_id,campaign_id,handoff_id,actor_subject,kind,body)"+
    " VALUES($1,$2,$3,$4,'comment',$5) RETURNING id,kind,body,actor_subject,created_at",
    [c.organization_id,c.id,h.id,req.userId,body.trim()])).rows[0];
   await log(db,c.organization_id,c.id,req.userId,'gabbai.handoff.comment',h.id,{commentAdded:true});
   return row;
  });
  res.set('Cache-Control','private,no-store').status(201).json({event:result,notifiedExternally:false});
 }));
 router.patch('/handoffs/:id/status',run(async(req,res)=>{
  const status=req.body?.status;
  if(!activeStates.has(status))throw bad(400,'Invalid handoff status');
  const outcome=await tx(async db=>{
   const {c,h}=await find(db,req,true);
   if(c.status==='closed')throw bad(409,'Closed campaign');
   if(status==='open'&&!management.has(c.role))
    throw bad(403,'Only management can reopen a handoff');
   if(status!=='open'&&!management.has(c.role)&&h.assigned_to!==req.userId)
    throw bad(403,'Only the assignee or manager can mark progress');
   if(h.status===status)return {handoff:{id:h.id,status:h.status},unchanged:true};
   const row=(await db.query(
    "UPDATE cc_gabbai_handoffs SET status=$1,updated_at=now(),"+
    " completed_by=CASE WHEN $1='done' THEN $2::text ELSE NULL END,"+
    " completed_at=CASE WHEN $1='done' THEN now() ELSE NULL END WHERE id=$3"+
    " RETURNING id,status,completed_by,completed_at",
    [status,req.userId,h.id])).rows[0];
   await db.query(
    "INSERT INTO cc_gabbai_handoff_events(organization_id,campaign_id,handoff_id,actor_subject,kind,status_to)"+
    " VALUES($1,$2,$3,$4,'status',$5)",[c.organization_id,c.id,h.id,req.userId,status]);
   await log(db,c.organization_id,c.id,req.userId,'gabbai.handoff.status',h.id,{status});
   return {handoff:row,unchanged:false};
  });
  res.set('Cache-Control','private,no-store').json(outcome);
 }));
 return router;
}
