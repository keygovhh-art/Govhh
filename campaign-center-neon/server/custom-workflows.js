import {Router} from 'express';

// Custom plan only: a transparent HUMAN checklist linked to a campaign.
// No actions reach phone providers, payment processors, AI or other organizations.
export default function customWorkflowsRouter({pool,campaignAccess,bad,uuid,log}){
 const router=Router(),wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const leaders=new Set(['owner','manager']);
 const text=(value,max,label,required=false)=>{
  if(typeof value!=='string'||value.length>max)throw bad(400,'Invalid '+label);
  const result=value.trim();
  if(required&&!result)throw bad(400,'Missing '+label);
  return result;
 };
 async function tx(fn){
  const db=await pool.connect();
  try{await db.query('BEGIN');const output=await fn(db);await db.query('COMMIT');return output;}
  catch(err){await db.query('ROLLBACK');throw err;}finally{db.release();}
 }
 async function assigneeValid(db,c,who){
  const user=await db.query(
   "SELECT 1 FROM cc_campaign_members cm JOIN cc_memberships m"+
   " ON m.organization_id=cm.organization_id AND m.subject=cm.subject"+
   " WHERE cm.organization_id=$1 AND cm.campaign_id=$2 AND cm.subject=$3"+
   " AND m.membership_status='active'",
   [c.organization_id,c.id,who]);
  if(!user.rowCount)throw bad(400,'Assign to an active campaign participant');
 }
 router.get('/campaigns/:cid/workflow-templates',wrap(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);
  if(!leaders.has(c.role))throw bad(403,'Only a campaign leader can configure workflows');
  const results=await pool.query(
   "SELECT id,title,step_titles,archived_at,created_by,created_at"+
   " FROM cc_custom_workflow_templates WHERE organization_id=$1 AND campaign_id=$2"+
   " ORDER BY created_at DESC,id DESC LIMIT 100",[c.organization_id,c.id]);
  res.set('Cache-Control','private,no-store').json({templates:results.rows,editable:true,manualOnly:true});
 }));
 router.post('/campaigns/:cid/workflow-templates',wrap(async(req,res)=>{
  const title=text(req.body?.title,160,'title',true),steps=req.body?.steps;
  if(!Array.isArray(steps)||steps.length<1||steps.length>12)throw bad(400,'Use 1–12 checklist steps');
  const names=steps.map(x=>text(x,180,'step',true));
  if(new Set(names.map(x=>x.toLocaleLowerCase())).size!==names.length)
   throw bad(400,'Duplicate steps');
  const result=await tx(async db=>{
   const c=await campaignAccess(db,req.params.cid,req.userId);
   if(!leaders.has(c.role))throw bad(403,'Only a campaign leader can configure workflows');
   if(c.status==='closed')throw bad(409,'Campaign closed');
   const row=(await db.query(
    "INSERT INTO cc_custom_workflow_templates(organization_id,campaign_id,title,step_titles,created_by)"+
    " VALUES($1,$2,$3,$4,$5) RETURNING id,title,step_titles,created_at",
    [c.organization_id,c.id,title,JSON.stringify(names),req.userId])).rows[0];
   await log(db,c.organization_id,c.id,req.userId,'custom.workflow.template_created',row.id);
   return row;
  });
  res.status(201).json(result);
 }));
 router.post('/campaigns/:cid/workflow-templates/:id/archive',wrap(async(req,res)=>{
  if(!uuid(req.params.id))throw bad(400,'Invalid workflow template');
  const result=await tx(async db=>{
   const c=await campaignAccess(db,req.params.cid,req.userId);
   if(!leaders.has(c.role))throw bad(403,'Leader required');
   const row=(await db.query(
    "UPDATE cc_custom_workflow_templates SET archived_at=now()"+
    " WHERE organization_id=$1 AND campaign_id=$2 AND id=$3 AND archived_at IS NULL"+
    " RETURNING id,archived_at",[c.organization_id,c.id,req.params.id])).rows[0];
   if(!row)throw bad(404,'Active template not found');
   await log(db,c.organization_id,c.id,req.userId,'custom.workflow.template_archived',row.id);
   return row;
  });
  res.json(result);
 }));
 router.get('/campaigns/:cid/workflow-runs',wrap(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);
  const isLead=leaders.has(c.role);
  const status=req.query.status??'all';
  if(typeof status!=='string'||!['all','open','blocked','completed','cancelled'].includes(status))
   throw bad(400,'Invalid workflow filter');
  const [rows,summary]=await Promise.all([
   pool.query(
    "SELECT r.id,r.title,r.template_id,r.assigned_to,r.status,r.blocked_reason,"+
    " r.next_step,r.version,r.created_at,r.updated_at,t.step_titles"+
    " FROM cc_custom_workflow_runs r JOIN cc_custom_workflow_templates t"+
    " ON t.organization_id=r.organization_id AND t.campaign_id=r.campaign_id AND t.id=r.template_id"+
    " WHERE r.organization_id=$1 AND r.campaign_id=$2"+
    " AND ($3::boolean OR r.assigned_to=$4)"+
    " AND ($5='all' OR r.status=$5)"+
    " ORDER BY CASE r.status WHEN 'blocked' THEN 0 WHEN 'open' THEN 1 ELSE 2 END,"+
    " r.updated_at DESC,r.id DESC LIMIT 100",
    [c.organization_id,c.id,isLead,req.userId,status]),
   pool.query(
    "SELECT status,COUNT(*)::int n FROM cc_custom_workflow_runs"+
    " WHERE organization_id=$1 AND campaign_id=$2 AND ($3::boolean OR assigned_to=$4)"+
    " GROUP BY status",[c.organization_id,c.id,isLead,req.userId])
  ]);
  res.set('Cache-Control','private,no-store').json({
   runs:rows.rows,counts:Object.fromEntries(summary.rows.map(x=>[x.status,x.n])),
   limit:100,scope:isLead?'campaign_leadership':'assigned_personal',
   humanConfirmedOnly:true,externalExecution:false
  });
 }));
 router.post('/campaigns/:cid/workflow-runs',wrap(async(req,res)=>{
  const templateId=req.body?.templateId,assigned=text(req.body?.assignedTo,128,'assignee',true),
   title=text(req.body?.title,160,'title',true);
  if(!uuid(templateId))throw bad(400,'Invalid workflow template');
  const output=await tx(async db=>{
   const c=await campaignAccess(db,req.params.cid,req.userId);
   if(!leaders.has(c.role))throw bad(403,'Campaign leader required');
   if(c.status==='closed')throw bad(409,'Campaign closed');
   await assigneeValid(db,c,assigned);
   const template=(await db.query(
    "SELECT id FROM cc_custom_workflow_templates"+
    " WHERE organization_id=$1 AND campaign_id=$2 AND id=$3 AND archived_at IS NULL",
    [c.organization_id,c.id,templateId])).rows[0];
   if(!template)throw bad(404,'Active workflow template missing');
   const row=(await db.query(
    "INSERT INTO cc_custom_workflow_runs(organization_id,campaign_id,template_id,"+
    " title,assigned_to,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,title,status,version",
    [c.organization_id,c.id,templateId,title,assigned,req.userId])).rows[0];
   await db.query(
    "INSERT INTO cc_custom_workflow_events(organization_id,campaign_id,run_id,actor_subject,event_kind)"+
    " VALUES($1,$2,$3,$4,'created')",[c.organization_id,c.id,row.id,req.userId]);
   await log(db,c.organization_id,c.id,req.userId,'custom.workflow.run_created',row.id,{assigned});
   return row;
  });
  res.status(201).json(output);
 }));
 router.post('/campaigns/:cid/workflow-runs/:id/action',wrap(async(req,res)=>{
  if(!uuid(req.params.id))throw bad(400,'Invalid workflow run');
  const action=req.body?.action;
  if(!['complete_step','block','resume','cancel'].includes(action))throw bad(400,'Invalid workflow action');
  const note=text(req.body?.note??'',600,'note');
  const version=req.body?.version;
  if(!Number.isSafeInteger(version)||version<1)throw bad(400,'Version required');
  if(action==='block'&&!note)throw bad(400,'A blocker reason is required');
  const result=await tx(async db=>{
   const c=await campaignAccess(db,req.params.cid,req.userId);
   const row=(await db.query(
    "SELECT r.*,t.step_titles FROM cc_custom_workflow_runs r"+
    " JOIN cc_custom_workflow_templates t ON t.organization_id=r.organization_id"+
    " AND t.campaign_id=r.campaign_id AND t.id=r.template_id"+
    " WHERE r.organization_id=$1 AND r.campaign_id=$2 AND r.id=$3 FOR UPDATE OF r",
    [c.organization_id,c.id,req.params.id])).rows[0];
   if(!row)throw bad(404,'Workflow run not found');
   if(!leaders.has(c.role)&&row.assigned_to!==req.userId)
    throw bad(404,'Workflow run not found');
   if(row.version!==version)throw bad(409,'Another member updated this workflow; reload');
   if(action==='cancel'&&!leaders.has(c.role))throw bad(403,'Only leadership can cancel');
   if(['completed','cancelled'].includes(row.status))throw bad(409,'Workflow already closed');
   if(action==='complete_step'&&row.status!=='open')throw bad(409,'Resume blocked workflow first');
   if(action==='block'&&row.status!=='open')throw bad(409,'Only open workflows may be blocked');
   if(action==='resume'&&row.status!=='blocked')throw bad(409,'Only blocked workflows may resume');
   const nextStep=row.next_step+(action==='complete_step'?1:0);
   const finished=action==='complete_step'&&nextStep===row.step_titles.length;
   const status=action==='cancel'?'cancelled':action==='block'?'blocked':finished?'completed':'open';
   const updated=(await db.query(
    "UPDATE cc_custom_workflow_runs SET status=$4,next_step=$5,blocked_reason=$6,"+
    " version=version+1,updated_at=now(),completed_at=CASE WHEN $4='completed'"+
    " THEN now() ELSE NULL END WHERE organization_id=$1 AND campaign_id=$2 AND id=$3"+
    " RETURNING id,status,next_step,version",
    [c.organization_id,c.id,row.id,status,nextStep,action==='block'?note:''])).rows[0];
   await db.query(
    "INSERT INTO cc_custom_workflow_events(organization_id,campaign_id,run_id,"+
    " actor_subject,event_kind,step_index,note) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [c.organization_id,c.id,row.id,req.userId,action==='complete_step'?'step_completed':action==='block'?'blocked':action==='resume'?'resumed':'cancelled',
     action==='complete_step'?row.next_step:null,note]);
   await log(db,c.organization_id,c.id,req.userId,'custom.workflow.progress',row.id,
    {action,status,step:updated.next_step});
   return updated;
  });
  res.json(result);
 }));
 router.get('/campaigns/:cid/workflow-runs/:id/events',wrap(async(req,res)=>{
  if(!uuid(req.params.id))throw bad(400,'Invalid workflow');
  const c=await campaignAccess(pool,req.params.cid,req.userId);
  const found=(await pool.query(
   "SELECT assigned_to FROM cc_custom_workflow_runs WHERE organization_id=$1 AND campaign_id=$2 AND id=$3",
   [c.organization_id,c.id,req.params.id])).rows[0];
  if(!found||(found.assigned_to!==req.userId&&!leaders.has(c.role)))throw bad(404,'Workflow not found');
  const events=await pool.query(
   "SELECT actor_subject,event_kind,step_index,note,created_at"+
   " FROM cc_custom_workflow_events WHERE organization_id=$1 AND campaign_id=$2 AND run_id=$3"+
   " ORDER BY created_at DESC,id DESC LIMIT 100",[c.organization_id,c.id,req.params.id]);
  res.set('Cache-Control','private,no-store').json({events:events.rows,immutable:true,limit:100});
 }));
 return router;
}
