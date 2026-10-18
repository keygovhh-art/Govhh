import {Router} from 'express';

// Askan Pro AUTOMATION PILOT: a member must actively opt in, then press Run.
// Only THEIR OWN visible, due CRM contacts are converted to THEIR OWN tasks.
// No cron, outbound calls, texts, emails, CRM changes, or payments.
export default function proAutomationRouter({pool,campaignAccess,bad,log}){
 const router=Router(),wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const permitted=new Set(['owner','manager','squad_leader','askan']);
 const configured={enabled:false,maxTasksPerRun:10};
 const sourceSql=
  " FROM cc_contacts c JOIN cc_pro_contact_profiles p"+
  " ON p.contact_id=c.id AND p.organization_id=c.organization_id AND p.campaign_id=c.campaign_id"+
  " WHERE c.organization_id=$1 AND c.campaign_id=$2 AND c.created_by=$3"+
  " AND c.do_not_call=false AND c.phone<>'' AND p.stage<>'closed'"+
  " AND p.next_followup_at IS NOT NULL AND p.next_followup_at<=now()"+
  " AND NOT EXISTS (SELECT 1 FROM cc_pro_automation_task_links l"+
  " WHERE l.organization_id=c.organization_id AND l.campaign_id=c.campaign_id"+
  " AND l.owner_subject=$3 AND l.contact_id=c.id AND l.due_snapshot=p.next_followup_at)";
 async function scope(db,req){
  const c=await campaignAccess(db,req.params.cid,req.userId);
  if(!permitted.has(c.role))throw bad(403,'Only active working members may manage private follow-ups');
  const assigned=(await db.query(
   'SELECT 1 FROM cc_campaign_members WHERE organization_id=$1 AND campaign_id=$2 AND subject=$3',
   [c.organization_id,c.id,req.userId])).rowCount;
  if(!assigned)throw bad(409,'Join the campaign as a member before creating assigned tasks');
  return c;
 }
 async function getRule(db,c,actor,locked=false){
  return (await db.query(
   'SELECT id,enabled,max_tasks_per_run,updated_at FROM cc_pro_automation_rules'+
   ' WHERE organization_id=$1 AND campaign_id=$2 AND owner_subject=$3'+(locked?' FOR UPDATE':''),
   [c.organization_id,c.id,actor])).rows[0]||null;
 }
 async function tx(fn){
  const db=await pool.connect();
  try{await db.query('BEGIN');const out=await fn(db);await db.query('COMMIT');return out;}
  catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
  finally{db.release();}
 }
 router.get('/campaigns/:cid/automations',wrap(async(req,res)=>{
  const c=await scope(pool,req),rule=await getRule(pool,c,req.userId);
  const [number,links,runs]=await Promise.all([
   pool.query('SELECT COUNT(*)::int total'+sourceSql,[c.organization_id,c.id,req.userId]),
   pool.query(
    'SELECT l.id,l.task_id,l.contact_id,l.due_snapshot,l.created_at,c.display_name'+
    ' FROM cc_pro_automation_task_links l JOIN cc_contacts c ON c.id=l.contact_id'+
    ' AND c.organization_id=l.organization_id AND c.campaign_id=l.campaign_id'+
    " WHERE l.organization_id=$1 AND l.campaign_id=$2 AND l.owner_subject=$3 AND c.created_by=$3 AND c.do_not_call=false"+
    ' ORDER BY l.created_at DESC,l.id DESC LIMIT 20',
    [c.organization_id,c.id,req.userId]),
   pool.query(
    'SELECT id,created_tasks,ran_at FROM cc_pro_automation_runs'+
    ' WHERE organization_id=$1 AND campaign_id=$2 AND owner_subject=$3'+
    ' ORDER BY ran_at DESC,id DESC LIMIT 20',[c.organization_id,c.id,req.userId])
  ]);
  res.set('Cache-Control','private,no-store');
  res.json({rule:rule?{enabled:rule.enabled,maxTasksPerRun:rule.max_tasks_per_run}:configured,
   eligibleCount:number.rows[0].total,createdLinks:links.rows,runs:runs.rows,
   privacy:'creator_only',manualRunRequired:true,backgroundScheduleActive:false,
   externalCallsSent:false,doNotCallExcluded:true,limitPerRun:20});
 }));
 router.put('/campaigns/:cid/automations',wrap(async(req,res)=>{
  const {enabled,maxTasksPerRun}=req.body||{};
  if(typeof enabled!=='boolean'||!Number.isInteger(maxTasksPerRun)||maxTasksPerRun<1||maxTasksPerRun>20)
   throw bad(400,'Choose enabled boolean and a task limit between 1 and 20');
  const changed=await tx(async db=>{
   const c=await scope(db,req);
   if(c.status==='closed')throw bad(409,'Closed campaign');
   const result=(await db.query(
    'INSERT INTO cc_pro_automation_rules(organization_id,campaign_id,owner_subject,enabled,max_tasks_per_run)'+
    ' VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id,campaign_id,owner_subject) DO UPDATE'+
    ' SET enabled=excluded.enabled,max_tasks_per_run=excluded.max_tasks_per_run,updated_at=now()'+
    ' RETURNING id,enabled,max_tasks_per_run',
    [c.organization_id,c.id,req.userId,enabled,maxTasksPerRun])).rows[0];
   await log(db,c.organization_id,c.id,req.userId,'pro.followup_automation.settings',result.id,{enabled,maxTasksPerRun});
   return result;
  });
  res.set('Cache-Control','private,no-store').json({rule:{enabled:changed.enabled,maxTasksPerRun:changed.max_tasks_per_run},
   requiresManualRun:true});
 }));
 router.post('/campaigns/:cid/automations/run',wrap(async(req,res)=>{
  const outcome=await tx(async db=>{
   const c=await scope(db,req);
   if(c.status==='closed'||c.status==='paused')throw bad(409,'Paused or closed campaign cannot run automations');
   const rule=await getRule(db,c,req.userId,true);
   if(!rule||!rule.enabled)throw bad(409,'Explicitly enable your private follow-up rule first');
   // FOR UPDATE of the rule serializes two concurrent manual runs. Each
   // due contact/time version can generate at most one task per member.
   const contacts=(await db.query(
    'SELECT c.id,p.next_followup_at,p.priority'+sourceSql+
    ' ORDER BY p.next_followup_at,c.id LIMIT $4',
    [c.organization_id,c.id,req.userId,rule.max_tasks_per_run])).rows;
   const created=[];
   for(const contact of contacts){
    // Transaction-scoped lock on row prevents date changes during linking.
    const current=(await db.query(
     'SELECT c.id,p.next_followup_at,p.priority FROM cc_contacts c'+
     ' JOIN cc_pro_contact_profiles p ON p.contact_id=c.id AND p.organization_id=c.organization_id'+
     ' WHERE c.id=$1 AND c.organization_id=$2 AND c.campaign_id=$3 AND c.created_by=$4 AND c.do_not_call=false'+
     " AND c.phone<>'' AND p.stage<>'closed' AND p.next_followup_at IS NOT NULL AND p.next_followup_at<=now()"+
     ' FOR UPDATE OF c,p',
     [contact.id,c.organization_id,c.id,req.userId])).rows[0];
    if(!current||new Date(current.next_followup_at).getTime()!==new Date(contact.next_followup_at).getTime())continue;
    const exists=(await db.query(
     'SELECT 1 FROM cc_pro_automation_task_links WHERE organization_id=$1 AND campaign_id=$2'+
     ' AND owner_subject=$3 AND contact_id=$4 AND due_snapshot=$5',
     [c.organization_id,c.id,req.userId,current.id,current.next_followup_at])).rowCount;
    if(exists)continue;
    // Title must not contain private CRM names, numbers or notes.
    const task=(await db.query(
     "INSERT INTO cc_assignments(organization_id,campaign_id,assignee_subject,title,priority,kind,due_at)"+
     " VALUES($1,$2,$3,'Private CRM follow-up to review',$4,'followup',GREATEST(now(),$5::timestamptz)) RETURNING id",
     [c.organization_id,c.id,req.userId,current.priority||'normal',current.next_followup_at])).rows[0];
    await db.query(
     'INSERT INTO cc_pro_automation_task_links'+
     '(organization_id,campaign_id,owner_subject,contact_id,due_snapshot,task_id) VALUES($1,$2,$3,$4,$5,$6)',
     [c.organization_id,c.id,req.userId,current.id,current.next_followup_at,task.id]);
    created.push({taskId:task.id,contactId:current.id});
   }
   const run=(await db.query(
    "INSERT INTO cc_pro_automation_runs(organization_id,campaign_id,owner_subject,rule_id,created_tasks,triggered_by)"+
    " VALUES($1,$2,$3,$4,$5,'manual') RETURNING id,created_tasks,ran_at",
    [c.organization_id,c.id,req.userId,rule.id,created.length])).rows[0];
   // The global audit contains no CRM names, numbers, note contents or IDs.
   await log(db,c.organization_id,c.id,req.userId,'pro.followup_automation.manual_run',run.id,
    {createdTasks:created.length});
   return {run,created,manualOnly:true,externalCallsSent:false,externalMessagesSent:false};
  });
  res.set('Cache-Control','private,no-store').status(201).json(outcome);
 }));
 return router;
}
