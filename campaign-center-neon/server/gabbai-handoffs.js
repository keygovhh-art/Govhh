import {Router} from 'express';

// Gabbai Pro: real on-screen operational handoffs between campaign members.
// This does not place calls, send notifications or judge worker performance.
export default function gabbaiHandoffsRouter({pool,campaignAccess,bad,log,uuid}){
 const router=Router(),wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const leadership=new Set(['owner','manager']);
 const validPriority=new Set(['normal','high','critical']);
 async function tx(fn){
  const db=await pool.connect();
  try{await db.query('BEGIN');const result=await fn(db);await db.query('COMMIT');return result;}
  catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}
  finally{db.release();}
 }
 async function context(db,id,user,lock=false){
  if(!uuid(id))throw bad(400,'Bad handoff id');
  const row=(await db.query(
   'SELECT * FROM cc_gabbai_handoffs WHERE id=$1'+(lock?' FOR UPDATE':''),[id])).rows[0];
  if(!row)throw bad(404,'Handoff not found');
  const campaign=await campaignAccess(db,row.campaign_id,user);
  if(row.organization_id!==campaign.organization_id)throw bad(404,'Handoff not found');
  if(!leadership.has(campaign.role)&&row.assigned_to!==user&&row.created_by!==user)
   throw bad(404,'Handoff not available');
  return {row,campaign};
 }
 router.get('/campaigns/:cid/handoffs',wrap(async(req,res)=>{
  const campaign=await campaignAccess(pool,req.params.cid,req.userId);
  const isManager=leadership.has(campaign.role);
  const [all,staff]=await Promise.all([
   pool.query(
    "SELECT id,created_by,assigned_to,title,instructions,priority,due_at,status,"+
    " acknowledged_at,completed_at,created_at FROM cc_gabbai_handoffs"+
    " WHERE organization_id=$1 AND campaign_id=$2"+
    " AND ($3::boolean OR assigned_to=$4 OR created_by=$4)"+
    " ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END,"+
    " CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,"+
    " due_at ASC NULLS LAST,created_at DESC LIMIT 150",
    [campaign.organization_id,campaign.id,isManager,req.userId]),
   isManager?pool.query(
    "SELECT cm.subject,cm.team_name,m.role FROM cc_campaign_members cm"+
    " JOIN cc_memberships m ON m.organization_id=cm.organization_id AND m.subject=cm.subject"+
    " WHERE cm.organization_id=$1 AND cm.campaign_id=$2 AND m.membership_status='active'"+
    " ORDER BY cm.team_name,cm.subject LIMIT 200",
    [campaign.organization_id,campaign.id]):Promise.resolve({rows:[]})
  ]);
  const ids=all.rows.map(x=>x.id);
  const events=ids.length?(await pool.query(
   "SELECT handoff_id,actor_subject,event_type,recorded_at FROM cc_gabbai_handoff_history"+
   " WHERE organization_id=$1 AND campaign_id=$2 AND handoff_id=ANY($3::uuid[])"+
   " ORDER BY recorded_at DESC,id DESC LIMIT 180",
   [campaign.organization_id,campaign.id,ids])).rows:[];
  const counts=all.rows.reduce((a,x)=>{a[x.status]++;return a;},{pending:0,acknowledged:0,done:0});
  res.set('Cache-Control','private,no-store').json({
   handoffs:all.rows,staff:staff.rows,history:events,counts,
   canAssign:isManager,memberScoped:true,isManualQueue:true,
   createsPhoneCall:false,autoRemindersEnabled:false
  });
 }));
 router.post('/campaigns/:cid/handoffs',wrap(async(req,res)=>{
  const {title,instructions='',assignedTo,priority='normal',dueAt=null}=req.body||{};
  if(typeof title!=='string'||!title.trim()||title.length>160||
    typeof instructions!=='string'||instructions.length>1500||
    typeof assignedTo!=='string'||!assignedTo||
    !validPriority.has(priority)||
    (dueAt!==null&&(typeof dueAt!=='string'||dueAt.length>45||!Number.isFinite(Date.parse(dueAt))||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(dueAt))))
   throw bad(400,'Valid title, assignee, priority and date required');
  const created=await tx(async db=>{
   const campaign=await campaignAccess(db,req.params.cid,req.userId);
   if(!leadership.has(campaign.role))throw bad(403,'Only campaign managers can create handoffs');
   if(campaign.status==='closed')throw bad(409,'Campaign is closed');
   const active=(await db.query(
    "SELECT 1 FROM cc_campaign_members cm JOIN cc_memberships m"+
    " ON m.organization_id=cm.organization_id AND m.subject=cm.subject"+
    " WHERE cm.organization_id=$1 AND cm.campaign_id=$2 AND cm.subject=$3 AND m.membership_status='active'",
    [campaign.organization_id,campaign.id,assignedTo])).rowCount;
   if(!active)throw bad(404,'Assignee is not an active campaign member');
   const r=(await db.query(
    'INSERT INTO cc_gabbai_handoffs(organization_id,campaign_id,created_by,assigned_to,title,instructions,priority,due_at)'+
    ' VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
    [campaign.organization_id,campaign.id,req.userId,assignedTo,title.trim(),instructions.trim(),
     priority,dueAt?new Date(dueAt).toISOString():null])).rows[0];
   await db.query(
    "INSERT INTO cc_gabbai_handoff_history(organization_id,campaign_id,handoff_id,actor_subject,event_type)"+
    " VALUES($1,$2,$3,$4,'created')",[campaign.organization_id,campaign.id,r.id,req.userId]);
   await log(db,campaign.organization_id,campaign.id,req.userId,'gabbai.handoff.created',r.id,
    {priority,hasDeadline:!!dueAt});
   return r;
  });
  res.set('Cache-Control','private,no-store').status(201).json({handoff:created});
 }));
 router.post('/handoffs/:id/ack',wrap(async(req,res)=>{
  const answer=await tx(async db=>{
   const {row,campaign}=await context(db,req.params.id,req.userId,true);
   if(row.assigned_to!==req.userId)throw bad(403,'Only the person receiving the handoff can acknowledge');
   if(row.status==='acknowledged'||row.status==='done')
    return {id:row.id,status:row.status,unchanged:true};
   if(campaign.status==='closed')throw bad(409,'Campaign is closed');
   const assigned=(await db.query(
    "SELECT 1 FROM cc_campaign_members cm JOIN cc_memberships m"+
    " ON m.organization_id=cm.organization_id AND m.subject=cm.subject"+
    " WHERE cm.organization_id=$1 AND cm.campaign_id=$2 AND cm.subject=$3 AND m.membership_status='active'",
    [campaign.organization_id,campaign.id,req.userId])).rowCount;
   if(!assigned)throw bad(403,'Must still be an active campaign member');
   await db.query(
    "UPDATE cc_gabbai_handoffs SET status='acknowledged',acknowledged_at=now()"+
    " WHERE id=$1",[row.id]);
   await db.query(
    "INSERT INTO cc_gabbai_handoff_history(organization_id,campaign_id,handoff_id,actor_subject,event_type)"+
    " VALUES($1,$2,$3,$4,'acknowledged')",[campaign.organization_id,campaign.id,row.id,req.userId]);
   await log(db,campaign.organization_id,campaign.id,req.userId,'gabbai.handoff.acknowledged',row.id,{});
   return {id:row.id,status:'acknowledged',unchanged:false};
  });
  res.set('Cache-Control','private,no-store').json(answer);
 }));
 router.post('/handoffs/:id/complete',wrap(async(req,res)=>{
  const answer=await tx(async db=>{
   const {row,campaign}=await context(db,req.params.id,req.userId,true);
   if(!leadership.has(campaign.role)&&row.assigned_to!==req.userId)
    throw bad(403,'Only leadership or the assignee may complete handoff');
   if(row.status==='done')return {id:row.id,status:'done',unchanged:true};
   if(row.status!=='acknowledged')throw bad(409,'Assignee must acknowledge the handoff first');
   if(campaign.status==='closed')throw bad(409,'Campaign is closed');
   await db.query("UPDATE cc_gabbai_handoffs SET status='done',completed_at=now() WHERE id=$1",[row.id]);
   await db.query(
    "INSERT INTO cc_gabbai_handoff_history(organization_id,campaign_id,handoff_id,actor_subject,event_type)"+
    " VALUES($1,$2,$3,$4,'completed')",[campaign.organization_id,campaign.id,row.id,req.userId]);
   await log(db,campaign.organization_id,campaign.id,req.userId,'gabbai.handoff.completed',row.id,{});
   return {id:row.id,status:'done',unchanged:false};
  });
  res.set('Cache-Control','private,no-store').json(answer);
 }));
 return router;
}
