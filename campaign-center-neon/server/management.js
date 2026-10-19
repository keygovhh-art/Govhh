import {Router} from 'express';

// Organization-only, human-recorded management board. No external calls,
// automatic judgements, finance actions or contacts/donor data.
export default function managementRouter({pool,bad,uuid,log}){
 const router=Router();
 const run=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const statuses=new Set(['planned','ready','in_progress','waiting','blocked','failed','successful','completed','cancelled']);
 const priorities=new Set(['normal','high','critical']);
 const terminal=new Set(['completed','successful']);
 const fields=['title','details','status','priority','progress','assigned_to',
  'next_action','waiting_on','issue_reason','due_at','campaign_id'];
 const describe=row=>Object.fromEntries(fields.map(x=>[x,row[x]??null]));
 async function leader(db,oid,subject){
  if(!uuid(oid))throw bad(400,'Invalid organization');
  const found=await db.query(
   "SELECT role FROM cc_memberships WHERE organization_id=$1 AND subject=$2 AND membership_status='active'",
   [oid,subject]);
  if(!found.rowCount)throw bad(404,'Organization not found');
  if(!['owner','manager'].includes(found.rows[0].role))throw bad(403,'Leadership permission required');
 }
 const clean=(v,max,label,required=false)=>{
  if(typeof v!=='string'||v.length>max)throw bad(400,'Invalid '+label);
  const out=v.trim();
  if(required&&!out)throw bad(400,'Required '+label);
  return out;
 };
 function normalize(body){
  if(!body||typeof body!=='object'||Array.isArray(body))throw bad(400,'Invalid plan');
  const status=body.status||'planned',priority=body.priority||'normal';
  if(!statuses.has(status)||!priorities.has(priority))throw bad(400,'Invalid status or priority');
  if(!Number.isInteger(body.progress)||body.progress<0||body.progress>100)
   throw bad(400,'Progress must be an integer between 0 and 100');
  const title=clean(body.title,180,'title',true),
    details=clean(body.details??'',1800,'details'),
    next_action=clean(body.nextAction??'',500,'next action'),
    waiting_on=clean(body.waitingOn??'',200,'waiting on'),
    issue_reason=clean(body.issueReason??'',500,'issue reason');
  const assigned_to=body.assignedTo===null||body.assignedTo===''||body.assignedTo===undefined
   ?null:clean(body.assignedTo,128,'assigned member',true);
  const campaign_id=body.campaignId===null||body.campaignId===''||body.campaignId===undefined
   ?null:body.campaignId;
  if(campaign_id&&!uuid(campaign_id))throw bad(400,'Invalid campaign');
  let due_at=null;
  if(body.dueAt){
   if(typeof body.dueAt!=='string'||body.dueAt.length>40||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(body.dueAt))
    throw bad(400,'Due date must include a timezone');
   const date=new Date(body.dueAt);
   if(!Number.isFinite(date.getTime()))throw bad(400,'Invalid due date');
   due_at=date.toISOString();
  }
  if(['waiting','blocked','failed'].includes(status)&&!issue_reason)
   throw bad(400,'Reason required for waiting, blocked or failed');
  if(status==='waiting'&&!waiting_on)throw bad(400,'Waiting for whom is required');
  if(terminal.has(status)&&body.progress!==100)
   throw bad(400,'Successful/completed items must record 100%');
  return {title,details,status,priority,progress:body.progress,assigned_to,
    campaign_id,due_at,next_action,waiting_on,issue_reason};
 }
 async function validateReferences(db,oid,item){
  if(item.campaign_id){
   const found=await db.query(
    'SELECT 1 FROM cc_campaigns WHERE organization_id=$1 AND id=$2',
    [oid,item.campaign_id]);
   if(!found.rowCount)throw bad(404,'Campaign not in organization');
  }
  if(item.assigned_to){
   const found=await db.query(
    "SELECT 1 FROM cc_memberships WHERE organization_id=$1 AND subject=$2 AND membership_status='active'",
    [oid,item.assigned_to]);
   if(!found.rowCount)throw bad(400,'Assign to an active organization member');
  }
 }
 async function transaction(fn){
  const db=await pool.connect();
  try{await db.query('BEGIN');const result=await fn(db);await db.query('COMMIT');return result;}
  catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 router.get('/organizations/:oid/management',run(async(req,res)=>{
  const oid=req.params.oid;await leader(pool,oid,req.userId);
  const status=req.query.status??'all';
  if(typeof status!=='string'||(status!=='all'&&!statuses.has(status)))
   throw bad(400,'Invalid status filter');
  const queue=req.query.queue??'all';
  const queues=['all','mine','needs_action','overdue','due_soon','unassigned'];
  if(typeof queue!=='string'||!queues.includes(queue))
   throw bad(400,'Invalid action queue');
  const query=req.query.query??'';
  if(typeof query!=='string'||query.length>120)throw bad(400,'Invalid search');
  const page=Number(req.query.page??1);
  if(!Number.isInteger(page)||page<1||page>10000)throw bad(400,'Invalid page');
  const live="p.status NOT IN ('successful','completed','cancelled')";
  const overdue=live+" AND p.due_at<now()";
  const soon=live+" AND p.due_at>=now() AND p.due_at<now()+interval '48 hours'";
  const unassigned=live+" AND p.assigned_to IS NULL";
  const attention="(p.status IN ('blocked','failed','waiting','ready') OR ("+overdue+"))";
  const selection=
   " WHERE p.organization_id=$1 AND ($2='all' OR p.status=$2)"+
   " AND ($3='' OR p.title ILIKE '%'||$3||'%' OR p.next_action ILIKE '%'||$3||'%'"+
   " OR COALESCE(p.assigned_to,'') ILIKE '%'||$3||'%')"+
   " AND ($4='all'"+
   " OR ($4='mine' AND p.assigned_to=$6)"+
   " OR ($4='needs_action' AND "+attention+")"+
   " OR ($4='overdue' AND "+overdue+")"+
   " OR ($4='due_soon' AND "+soon+")"+
   " OR ($4='unassigned' AND "+unassigned+"))";
  const params=[oid,status,query.trim(),queue,(page-1)*40,req.userId];
  const [all,items,signals,queueCounts,matchingRows]=await Promise.all([
   pool.query(
    "SELECT status,COUNT(*)::int count FROM cc_management_plan_items"+
    " WHERE organization_id=$1 GROUP BY status",[oid]),
   pool.query(
    "SELECT p.id,p.campaign_id,p.title,p.details,p.status,p.priority,p.progress,"+
    " p.assigned_to,p.next_action,p.waiting_on,p.issue_reason,p.due_at,p.completed_at,"+
    " p.created_by,p.updated_by,p.updated_at,p.created_at,p.version,c.title campaign_title"+
    " FROM cc_management_plan_items p LEFT JOIN cc_campaigns c"+
    " ON c.organization_id=p.organization_id AND c.id=p.campaign_id"+
    selection+
    " ORDER BY CASE WHEN p.status IN ('blocked','failed') THEN 0"+
    " WHEN p.status='waiting' THEN 1 WHEN p.due_at<now() AND p.status NOT IN"+
    " ('successful','completed','cancelled') THEN 2 ELSE 3 END,"+
    " p.updated_at DESC,p.id DESC LIMIT 40 OFFSET $5",params),
   pool.query(
    "SELECT"+
    " (SELECT COUNT(*)::int FROM cc_assignments WHERE organization_id=$1"+
    " AND status IN ('open','in_progress') AND due_at<now()) overdue_tasks,"+
    " (SELECT COUNT(*)::int FROM cc_assignments WHERE organization_id=$1"+
    " AND status IN ('open','in_progress')) open_tasks,"+
    " (SELECT COUNT(*)::int FROM cc_assignments WHERE organization_id=$1 AND status='done') completed_tasks,"+
    " (SELECT COUNT(*)::int FROM cc_gabbai_handoffs WHERE organization_id=$1 AND status='blocked') blocked_handoffs,"+
    " (SELECT COUNT(*)::int FROM cc_gabbai_handoffs WHERE organization_id=$1 AND status NOT IN ('done')) open_handoffs,"+
    " (SELECT COUNT(*)::int FROM cc_gabbai_handoffs WHERE organization_id=$1 AND status='done') completed_handoffs,"+
    " (SELECT COUNT(*)::int FROM cc_gabbai_approval_requests WHERE organization_id=$1 AND status='pending') pending_approvals,"+
    " (SELECT COUNT(*)::int FROM cc_gabbai_approval_requests WHERE organization_id=$1 AND status='approved') approved_approvals,"+
    " (SELECT COUNT(*)::int FROM cc_gabbai_approval_requests WHERE organization_id=$1 AND status='rejected') rejected_approvals,"+
    " (SELECT COUNT(*)::int FROM cc_pro_guidance_requests WHERE organization_id=$1 AND status='open') pending_guidance,"+
    " (SELECT COUNT(*)::int FROM cc_pro_guidance_requests WHERE organization_id=$1 AND status='answered') answered_guidance,"+
    " (SELECT COUNT(*)::int FROM cc_org_leadership_decisions WHERE organization_id=$1 AND status='open') pending_decisions,"+
    " (SELECT COUNT(*)::int FROM cc_management_plan_items WHERE organization_id=$1"+
    " AND due_at<now() AND status NOT IN ('completed','successful','cancelled')) overdue_plans",
    [oid]),
   pool.query(
    "SELECT COUNT(*)::int all,"+
    " COUNT(*) FILTER (WHERE assigned_to=$2)::int mine,"+
    " COUNT(*) FILTER (WHERE "+attention+")::int needs_action,"+
    " COUNT(*) FILTER (WHERE "+overdue+")::int overdue,"+
    " COUNT(*) FILTER (WHERE "+soon+")::int due_soon,"+
    " COUNT(*) FILTER (WHERE "+unassigned+")::int unassigned"+
    " FROM cc_management_plan_items p WHERE organization_id=$1",[oid,req.userId]),
   pool.query("SELECT COUNT(*)::int n FROM cc_management_plan_items p"+selection,
    params)
  ]);
  const counts=Object.fromEntries([...statuses].map(s=>[s,0]));
  for(const row of all.rows)counts[row.status]=row.count;
  const total=Object.values(counts).reduce((a,b)=>a+b,0);
  const matching=matchingRows.rows[0].n;
  res.set('Cache-Control','private,no-store').json({
   counts,total,matching,page,pageCount:Math.max(1,Math.ceil(matching/40)),
   limit:40,items:items.rows,signals:signals.rows[0],
   queue,queueCounts:queueCounts.rows[0],
   scope:'organization_owner_manager',humanReported:true,
   financialApprovalIsNotPayment:true,signalsAreCountsOnly:true
  });
 }));
 router.post('/organizations/:oid/management/items',run(async(req,res)=>{
  const oid=req.params.oid,item=normalize(req.body),note=clean(req.body?.note??'',500,'note');
  const result=await transaction(async db=>{
   await leader(db,oid,req.userId);await validateReferences(db,oid,item);
   const row=(await db.query(
    "INSERT INTO cc_management_plan_items(organization_id,campaign_id,title,details,status,"+
    " priority,progress,assigned_to,next_action,waiting_on,issue_reason,due_at,"+
    " completed_at,created_by,updated_by) VALUES"+
    " ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,"+
    " CASE WHEN $5 IN ('successful','completed') THEN now() ELSE NULL END,$13,$13) RETURNING *",
    [oid,item.campaign_id,item.title,item.details,item.status,item.priority,item.progress,
     item.assigned_to,item.next_action,item.waiting_on,item.issue_reason,item.due_at,req.userId]
   )).rows[0];
   await db.query(
    "INSERT INTO cc_management_plan_history(organization_id,item_id,actor_subject,event_kind,after_state,note)"+
    " VALUES($1,$2,$3,'created',$4,$5)",
    [oid,row.id,req.userId,JSON.stringify(describe(row)),note]);
   await log(db,oid,item.campaign_id,req.userId,'management.plan.created',row.id,{status:row.status});
   return {id:row.id,version:row.version,status:row.status};
  });
  res.status(201).json(result);
 }));
 router.patch('/organizations/:oid/management/items/:id',run(async(req,res)=>{
  const oid=req.params.oid,id=req.params.id;
  if(!uuid(id))throw bad(400,'Invalid plan id');
  const item=normalize(req.body),note=clean(req.body?.note??'',500,'note');
  if(!Number.isInteger(req.body?.version)||req.body.version<1)
   throw bad(400,'Version required to prevent overwriting concurrent changes');
  const result=await transaction(async db=>{
   await leader(db,oid,req.userId);
   const old=(await db.query(
    'SELECT * FROM cc_management_plan_items WHERE organization_id=$1 AND id=$2 FOR UPDATE',
    [oid,id])).rows[0];
   if(!old)throw bad(404,'Plan not found');
   if(old.version!==req.body.version)throw bad(409,'This plan changed, reload before saving');
   await validateReferences(db,oid,item);
   const updated=(await db.query(
    "UPDATE cc_management_plan_items SET campaign_id=$3,title=$4,details=$5,status=$6,"+
    " priority=$7,progress=$8,assigned_to=$9,next_action=$10,waiting_on=$11,"+
    " issue_reason=$12,due_at=$13,completed_at=CASE WHEN $6 IN ('successful','completed')"+
    " THEN COALESCE(completed_at,now()) ELSE NULL END,"+
    " updated_by=$14,updated_at=now(),version=version+1 WHERE organization_id=$1 AND id=$2 RETURNING *",
    [oid,id,item.campaign_id,item.title,item.details,item.status,item.priority,item.progress,
     item.assigned_to,item.next_action,item.waiting_on,item.issue_reason,item.due_at,req.userId]
   )).rows[0];
   await db.query(
    "INSERT INTO cc_management_plan_history(organization_id,item_id,actor_subject,event_kind,"+
    " before_state,after_state,note) VALUES($1,$2,$3,'updated',$4,$5,$6)",
    [oid,id,req.userId,JSON.stringify(describe(old)),JSON.stringify(describe(updated)),note]);
   await log(db,oid,updated.campaign_id,req.userId,'management.plan.updated',id,
    {previous:old.status,next:updated.status});
   return {id,version:updated.version,status:updated.status};
  });
  res.json(result);
 }));
 router.get('/organizations/:oid/management/items/:id/history',run(async(req,res)=>{
  const oid=req.params.oid,id=req.params.id;await leader(pool,oid,req.userId);
  if(!uuid(id))throw bad(400,'Invalid plan id');
  const item=await pool.query(
   'SELECT 1 FROM cc_management_plan_items WHERE organization_id=$1 AND id=$2',[oid,id]);
  if(!item.rowCount)throw bad(404,'Plan not found');
  const count=await pool.query(
   'SELECT COUNT(*)::int n FROM cc_management_plan_history WHERE organization_id=$1 AND item_id=$2',
   [oid,id]);
  const page=Number(req.query.page??1);
  if(!Number.isInteger(page)||page<1||page>10000)throw bad(400,'Invalid page');
  const rows=await pool.query(
   "SELECT id,actor_subject,event_kind,before_state,after_state,note,recorded_at"+
   " FROM cc_management_plan_history WHERE organization_id=$1 AND item_id=$2"+
   " ORDER BY recorded_at DESC,id DESC LIMIT 30 OFFSET $3",[oid,id,(page-1)*30]);
  res.set('Cache-Control','private,no-store').json({
   history:rows.rows,total:count.rows[0].n,page,
   pageCount:Math.max(1,Math.ceil(count.rows[0].n/30)),appendOnly:true
  });
 }));
 return router;
}
