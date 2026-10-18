import {Router} from 'express';

// An internal campaign guidance inbox. This is NOT a contracted adviser service
// and creates no claim of a 42-hour or other human response SLA.
export default function proGuidanceRouter({pool,campaignAccess,bad,trim,uuid,log}){
 const router=Router(),run=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const managers=['owner','manager'];
 const validCategories=['strategy','calls','fundraising','technical','other'];
 async function tx(fn){
  const db=await pool.connect();
  try{await db.query('BEGIN');const out=await fn(db);await db.query('COMMIT');return out;}
  catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 async function requestContext(db,id,who,lock=false){
  if(!uuid(id))throw bad(400,'Invalid request ID');
  const row=(await db.query('SELECT * FROM cc_pro_guidance_requests WHERE id=$1'+(lock?' FOR UPDATE':''),[id])).rows[0];
  if(!row)throw bad(404,'Guidance request missing');
  const c=await campaignAccess(db,row.campaign_id,who);
  if(c.organization_id!==row.organization_id)throw bad(404,'Guidance request missing');
  if(row.created_by!==who&&!managers.includes(c.role))throw bad(404,'Guidance request missing');
  return {request:row,campaign:c};
 }
 router.get('/campaigns/:cid/guidance',run(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);
  const all=managers.includes(c.role);
  const r=await pool.query('SELECT id,created_by,category,subject,description,status,created_at,closed_at,assigned_to,response_due_at,triaged_at,'+
   ' (SELECT MAX(m.sent_at) FROM cc_pro_guidance_messages m WHERE m.request_id=cc_pro_guidance_requests.id) last_message_at'+
   ' FROM cc_pro_guidance_requests WHERE organization_id=$1 AND campaign_id=$2 AND ($3::boolean OR created_by=$4)'+
   ' ORDER BY created_at DESC LIMIT 100',[c.organization_id,c.id,all,req.userId]);
  res.set('Cache-Control','private,no-store');
  res.json({requests:r.rows,scope:all?'management':'self',staffResponseGuaranteed:false});
 }));
 router.post('/campaigns/:cid/guidance',run(async(req,res)=>{
  if(!validCategories.includes(req.body?.category)||typeof req.body?.subject!=='string'||
     typeof req.body?.description!=='string'||!req.body.subject.trim()||
     !req.body.description.trim()||req.body.subject.length>160||req.body.description.length>3000)
    throw bad(400,'Invalid guidance request');
  const result=await tx(async db=>{
   const c=await campaignAccess(db,req.params.cid,req.userId);
   if(c.status==='closed')throw bad(409,'Closed campaign');
   const open=(await db.query("SELECT COUNT(*)::int n FROM cc_pro_guidance_requests WHERE organization_id=$1 AND campaign_id=$2 AND created_by=$3 AND status='open'",
    [c.organization_id,c.id,req.userId])).rows[0].n;
   if(open>=10)throw bad(409,'Please close one of your open requests first');
   const row=(await db.query(
    'INSERT INTO cc_pro_guidance_requests(organization_id,campaign_id,created_by,category,subject,description) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,subject,status',
    [c.organization_id,c.id,req.userId,req.body.category,trim(req.body.subject,160),trim(req.body.description,3000)])).rows[0];
   await log(db,c.organization_id,c.id,req.userId,'pro.guidance.created',row.id,{category:req.body.category});
   return row;
  });res.status(201).json({...result,staffResponseGuaranteed:false});
 }));
 // Manager ownership and optional response targets are human work aids,
 // not automatic customer notifications or a promised service SLA.
 router.patch('/guidance/:id/triage',run(async(req,res)=>{
  const action=req.body?.action;
  if(!['take','release','deadline'].includes(action))throw bad(400,'Invalid triage action');
  let deadline;
  if(action==='deadline'){
   const due=req.body?.responseDueAt;
   if(due!==null && (typeof due!=='string'||due.length>45||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(due)||
      !Number.isFinite(Date.parse(due))))throw bad(400,'Response target must include timezone');
   deadline=due===null?null:new Date(due).toISOString();
  }
  const result=await tx(async db=>{
   const {request,campaign:c}=await requestContext(db,req.params.id,req.userId,true);
   if(!managers.includes(c.role))throw bad(403,'Only campaign management can triage guidance');
   if(request.status==='closed')throw bad(409,'Guidance request is closed');
   let assigned=request.assigned_to,due=request.response_due_at;
   if(action==='take'){
    if(assigned&&assigned!==req.userId)throw bad(409,'Another manager has already taken this request');
    assigned=req.userId;
   }else{
    // The owner can override an assignment, a manager may act on their own.
    if(assigned&&assigned!==req.userId&&c.role!=='owner')
      throw bad(409,'Another manager owns this request');
    if(action==='release'){assigned=null;due=null;}
    else{due=deadline;}
   }
   if(assigned===request.assigned_to&&
      (due===null?request.response_due_at===null:new Date(due).getTime()===new Date(request.response_due_at).getTime()))
      return {id:request.id,assignedTo:assigned,responseDueAt:due,unchanged:true};
   const updated=(await db.query(
    'UPDATE cc_pro_guidance_requests SET assigned_to=$1,response_due_at=$2,triaged_at=now()'+
    ' WHERE id=$3 RETURNING id,assigned_to,response_due_at,triaged_at',
    [assigned,due,request.id])).rows[0];
   await log(db,c.organization_id,c.id,req.userId,'pro.guidance.triaged',request.id,
    {action,assigned:!!updated.assigned_to,dueSet:!!updated.response_due_at});
   return {id:updated.id,assignedTo:updated.assigned_to,responseDueAt:updated.response_due_at,
     triagedAt:updated.triaged_at,unchanged:false};
  });
  res.set('Cache-Control','private,no-store').json({...result,voluntaryTarget:true,staffResponseGuaranteed:false});
 }));
 router.get('/guidance/:id/messages',run(async(req,res)=>{
  const {request}=await requestContext(pool,req.params.id,req.userId);
  const r=await pool.query('SELECT id,sender_subject,body,sent_at FROM cc_pro_guidance_messages WHERE request_id=$1 ORDER BY sent_at,id LIMIT 200',[request.id]);
  res.set('Cache-Control','private,no-store');res.json({messages:r.rows,requestStatus:request.status});
 }));
 router.post('/guidance/:id/messages',run(async(req,res)=>{
  if(typeof req.body?.body!=='string'||!req.body.body.trim()||req.body.body.length>3000)
   throw bad(400,'Message required');
  const result=await tx(async db=>{
   const {request,campaign:c}=await requestContext(db,req.params.id,req.userId,true);
   if(request.status==='closed'||c.status==='closed')throw bad(409,'Guidance request is closed');
   const r=(await db.query(
    'INSERT INTO cc_pro_guidance_messages(request_id,sender_subject,body) VALUES($1,$2,$3) RETURNING id,sender_subject,body,sent_at',
    [request.id,req.userId,req.body.body.trim()])).rows[0];
   const next=managers.includes(c.role)&&req.userId!==request.created_by?'answered':'open';
   await db.query('UPDATE cc_pro_guidance_requests SET status=$1 WHERE id=$2',[next,request.id]);
   await log(db,c.organization_id,c.id,req.userId,'pro.guidance.replied',request.id,{replyId:r.id,staff:next==='answered'});
   return r;
  });res.status(201).json(result);
 }));
 router.patch('/guidance/:id/close',run(async(req,res)=>{
  const result=await tx(async db=>{
   const {request,campaign:c}=await requestContext(db,req.params.id,req.userId,true);
   if(request.status==='closed')return {id:request.id,status:'closed',unchanged:true};
   const r=(await db.query("UPDATE cc_pro_guidance_requests SET status='closed',closed_at=now() WHERE id=$1 RETURNING id,status,closed_at",[request.id])).rows[0];
   await log(db,c.organization_id,c.id,req.userId,'pro.guidance.closed',request.id,{});
   return r;
  });res.json(result);
 }));
 return router;
}
