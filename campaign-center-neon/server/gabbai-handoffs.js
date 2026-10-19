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
  // Search/paginate on the server so members beyond the first 500 can be found.
  // All inputs are validated and bound as PostgreSQL parameters.
  const params=req.query||{};
  function safeText(key,max){
   const v=params[key];
   if(v===undefined)return '';
   if(typeof v!=='string'||v.length>max)throw bad(400,'Invalid workload '+key);
   return v.trim();
  }
  const search=safeText('search',120),team=safeText('team',200);
  const filter=safeText('filter',20)||'all';
  if(!['all','overdue','soon','unassigned'].includes(filter))
   throw bad(400,'Invalid workload filter');
  const parseIntParam=(key,defaultValue,max)=>{
   const v=params[key];
   if(v===undefined)return defaultValue;
   if(typeof v!=='string'||!/^[1-9][0-9]*$/.test(v)||v.length>8||
      Number(v)>max)throw bad(400,'Invalid workload '+key);
   return Number(v);
  };
  const page=parseIntParam('page',1,100000);
  const pageSize=parseIntParam('limit',500,500);
  const offset=(page-1)*pageSize;
  // Compute all-campaign totals BEFORE limiting mobile cards. The earlier LIMIT 500
  // truncated totals and hid team workload for larger institutions.
  const result=await pool.query(
   `WITH active_members AS (
      SELECT cm.subject,cm.team_name,m.role
      FROM cc_campaign_members cm
      JOIN cc_memberships m ON m.organization_id=cm.organization_id
       AND m.subject=cm.subject AND m.membership_status='active'
      WHERE cm.organization_id=$1 AND cm.campaign_id=$2
     ), task_counts AS (
      SELECT a.assignee_subject,
       COUNT(*) FILTER(WHERE a.status IN ('open','in_progress'))::int open_tasks,
       COUNT(*) FILTER(WHERE a.status IN ('open','in_progress') AND a.due_at<now())::int overdue_tasks,
       COUNT(*) FILTER(WHERE a.status IN ('open','in_progress') AND a.due_at>=now()
        AND a.due_at<now()+interval '48 hours')::int due_soon_tasks
      FROM cc_assignments a
      WHERE a.organization_id=$1 AND a.campaign_id=$2 GROUP BY a.assignee_subject
     ), handoff_counts AS (
      SELECT h.assigned_to,
       COUNT(*) FILTER(WHERE h.status<>'done')::int open_handoffs,
       COUNT(*) FILTER(WHERE h.status<>'done' AND h.due_at<now())::int overdue_handoffs
      FROM cc_gabbai_handoffs h
      WHERE h.organization_id=$1 AND h.campaign_id=$2 GROUP BY h.assigned_to
     ), member_work AS (
      SELECT a.subject,a.team_name,a.role,
       COALESCE(t.open_tasks,0)::int open_tasks,
       COALESCE(t.overdue_tasks,0)::int overdue_tasks,
       COALESCE(t.due_soon_tasks,0)::int due_soon_tasks,
       COALESCE(h.open_handoffs,0)::int open_handoffs,
       COALESCE(h.overdue_handoffs,0)::int overdue_handoffs,
       (COALESCE(t.open_tasks,0)+COALESCE(h.open_handoffs,0))::int total_open_work
      FROM active_members a LEFT JOIN task_counts t ON t.assignee_subject=a.subject
       LEFT JOIN handoff_counts h ON h.assigned_to=a.subject
     ), filtered_work AS (
      SELECT * FROM member_work
      WHERE ($3::text='' OR POSITION(LOWER($3::text) IN LOWER(
       CONCAT_WS(' ',subject,team_name,role)))>0)
       AND ($4::text='' OR COALESCE(NULLIF(BTRIM(team_name),''),'נישט אין א גרופע')=$4::text)
       AND ($5::text='all'
        OR ($5::text='overdue' AND overdue_tasks+overdue_handoffs>0)
        OR ($5::text='soon' AND due_soon_tasks>0)
        OR ($5::text='unassigned' AND total_open_work=0))
     )
     SELECT
      COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM
       (SELECT * FROM filtered_work ORDER BY
        (overdue_tasks+overdue_handoffs) DESC,total_open_work DESC,subject ASC
        LIMIT $6::int OFFSET $7::int) p),
        '[]'::jsonb) members,
      (SELECT COUNT(*)::int FROM filtered_work) matching_count,
      (SELECT COUNT(*)::int FROM member_work) member_count,
      (SELECT jsonb_build_object(
       'all',COUNT(*)::int,
       'overdue',COUNT(*) FILTER(WHERE overdue_tasks+overdue_handoffs>0)::int,
       'soon',COUNT(*) FILTER(WHERE due_soon_tasks>0)::int,
       'unassigned',COUNT(*) FILTER(WHERE total_open_work=0)::int
       ) FROM member_work) filter_counts,
      (SELECT jsonb_build_object(
       'openTasks',COALESCE(SUM(open_tasks),0)::int,
       'overdueTasks',COALESCE(SUM(overdue_tasks),0)::int,
       'dueSoonTasks',COALESCE(SUM(due_soon_tasks),0)::int,
       'openHandoffs',COALESCE(SUM(open_handoffs),0)::int,
       'overdueHandoffs',COALESCE(SUM(overdue_handoffs),0)::int
       ) FROM member_work) totals,
      COALESCE((SELECT jsonb_agg(to_jsonb(g)) FROM
       (SELECT COALESCE(NULLIF(TRIM(team_name),''),'נישט אין א גרופע') team_name,
        COUNT(*)::int members,
        SUM(open_tasks)::int open_tasks,SUM(overdue_tasks)::int overdue_tasks,
        SUM(due_soon_tasks)::int due_soon_tasks,
        SUM(open_handoffs)::int open_handoffs,
        SUM(overdue_handoffs)::int overdue_handoffs
        FROM member_work GROUP BY 1
        ORDER BY SUM(overdue_tasks+overdue_handoffs) DESC,SUM(open_tasks+open_handoffs) DESC,1 ASC
        LIMIT 100) g),'[]'::jsonb) teams`,
   [c.organization_id,c.id,search,team,filter,pageSize,offset]);
  const row=result.rows[0]||{};
  const members=row.members||[],totals=row.totals||{};
  res.set('Cache-Control','private,no-store').json({
   members,totals,teams:row.teams||[],totalMembers:row.member_count||0,
   shown:members.length,limit:pageSize,matchingMembers:row.matching_count||0,
   page,pageCount:Math.max(1,Math.ceil((row.matching_count||0)/pageSize)),
   hasNext:offset+members.length<(row.matching_count||0),
   hasPrevious:page>1,serverFiltered:true,filterCounts:row.filter_counts||{},
   truncated:(row.member_count||0)>members.length,
   teamLimit:100,teamSummariesCoverAllMembers:true,
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
