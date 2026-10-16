import { Router } from 'express';

// Askan Pro CRM: database-scoped relationships; no external contact import
// or automatic messaging. Audit records never store interaction note contents.
export default function askanProRouter({pool,campaignAccess,bad,trim,log}){
 const router=Router(),run=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const authorized=['owner','manager','finance','auditor'];
 const writers=['owner','manager','squad_leader','askan'];
 const stages=['new','contacted','followup','pledged','donor','closed'];
 async function contactContext(db,id,subject){
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))throw bad(400,'Invalid contact');
  const contact=(await db.query('SELECT * FROM cc_contacts WHERE id=$1',[id])).rows[0];
  if(!contact)throw bad(404,'Contact not found');
  const campaign=await campaignAccess(db,contact.campaign_id,subject);
  if(contact.organization_id!==campaign.organization_id)throw bad(404,'Contact not found');
  if(contact.privacy==='private'){
   if(contact.created_by!==subject)throw bad(404,'Contact not found');
  }else if(!authorized.includes(campaign.role)){
   const me=(await db.query('SELECT team_name FROM cc_campaign_members WHERE organization_id=$1 AND campaign_id=$2 AND subject=$3',
     [campaign.organization_id,campaign.id,subject])).rows[0];
   if(!me||me.team_name!==contact.assigned_team)throw bad(404,'Contact not available to your team');
  }
  return {contact,campaign};
 }
 async function transaction(fn){
  const db=await pool.connect();
  try{await db.query('BEGIN');const result=await fn(db);await db.query('COMMIT');return result;}
  catch(err){await db.query('ROLLBACK');throw err;}finally{db.release();}
 }
 function nextDate(value){
  if(value===null||value==='')return null;
  if(typeof value!=='string'||value.length>35||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||
    !Number.isFinite(Date.parse(value)))throw bad(400,'Follow-up time must include a timezone');
  return new Date(value).toISOString();
 }
 router.get('/campaigns/:cid/clarity',run(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);
  const elevated=authorized.includes(c.role);
  const squad=c.role==='squad_leader';
  const [tasks,followups]=await Promise.all([
   pool.query(
    "SELECT a.id,a.title,a.priority,a.due_at,a.assignee_subject FROM cc_assignments a"+
    " WHERE a.organization_id=$1 AND a.campaign_id=$2 AND a.status IN ('open','in_progress')"+
    " AND ($3::boolean OR a.assignee_subject=$4 OR ($5::boolean AND EXISTS("+
    " SELECT 1 FROM cc_campaign_members l JOIN cc_campaign_members peer"+
    " ON peer.organization_id=l.organization_id AND peer.campaign_id=l.campaign_id"+
    " AND peer.team_name=l.team_name AND peer.team_name<>''"+
    " WHERE l.organization_id=a.organization_id AND l.campaign_id=a.campaign_id AND l.subject=$4"+
    " AND peer.subject=a.assignee_subject)))"+
    " ORDER BY a.due_at ASC NULLS LAST,a.created_at ASC LIMIT 50",
    [c.organization_id,c.id,elevated,req.userId,squad]),
   pool.query(
    "SELECT c.id,c.display_name,p.next_followup_at,p.priority FROM cc_contacts c"+
    " JOIN cc_pro_contact_profiles p ON p.contact_id=c.id AND p.organization_id=c.organization_id"+
    " WHERE c.organization_id=$1 AND c.campaign_id=$2 AND p.next_followup_at IS NOT NULL"+
    " AND ((c.privacy='private' AND c.created_by=$3) OR"+
    " (c.privacy='campaign' AND ($4::boolean OR c.assigned_team=("+
    " SELECT team_name FROM cc_campaign_members WHERE organization_id=$1 AND campaign_id=$2 AND subject=$3))))"+
    " ORDER BY p.next_followup_at ASC LIMIT 50",
    [c.organization_id,c.id,req.userId,elevated])
  ]);
  const now=Date.now();
  const score=(due,priority)=>{
   const delta=due?Date.parse(due)-now:Infinity;
   // Overdue first, then high-priority, then near deadline.
   return (delta<=0?0:delta<86400000?10:delta<604800000?20:30)+
    ({high:0,critical:0,normal:2,low:4}[priority]??3);
  };
  const actions=[
   ...tasks.rows.map(t=>({source:'task',id:t.id,title:t.title,dueAt:t.due_at,
     priority:t.priority,score:score(t.due_at,t.priority)})),
   ...followups.rows.map(p=>({source:'crm_followup',id:p.id,title:p.display_name,dueAt:p.next_followup_at,
     priority:p.priority,score:score(p.next_followup_at,p.priority)}))
  ].sort((a,b)=>a.score-b.score||String(a.dueAt||'9999').localeCompare(String(b.dueAt||'9999'))||
    a.id.localeCompare(b.id)).slice(0,5);
  res.set('Cache-Control','private,no-store');
  res.json({recommendations:actions,scoring:'overdue-then-priority-then-deadline',noAiClaims:true,
    source:'current_authorized_tasks_and_crm_followups',
    note:'Only currently recorded activities; not a predictive or autonomous agent.'});
 }));
 router.get('/campaigns/:cid/contacts',run(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);
  const term=String(req.query.q||'').trim();
  if(term.length>90)throw bad(400,'Search is too long');
  const overdue=req.query.overdue==='true';
  const elevated=authorized.includes(c.role);
  const sql=
    "SELECT c.id,c.display_name,c.phone,c.privacy,c.do_not_call,c.assigned_team,"+
    " COALESCE(p.stage,'new') stage,COALESCE(p.priority,'normal') priority,"+
    " COALESCE(p.tags,'{}'::text[]) tags,p.next_followup_at"+
    " FROM cc_contacts c LEFT JOIN cc_pro_contact_profiles p ON p.contact_id=c.id"+
    " WHERE c.organization_id=$1 AND c.campaign_id=$2"+
    " AND ((c.privacy='private' AND c.created_by=$3) OR"+
    " (c.privacy='campaign' AND ($4::boolean OR c.assigned_team=("+
    " SELECT team_name FROM cc_campaign_members WHERE organization_id=$1 AND campaign_id=$2 AND subject=$3))))"+
    " AND ($5='' OR c.display_name ILIKE '%'||$5||'%' OR c.phone ILIKE '%'||$5||'%')"+
    " AND (NOT $6::boolean OR (p.next_followup_at IS NOT NULL AND p.next_followup_at<now()))"+
    " ORDER BY p.next_followup_at ASC NULLS LAST,c.created_at DESC LIMIT 100";
  const results=await pool.query(sql,[c.organization_id,c.id,req.userId,elevated,term,overdue]);
  res.set('Cache-Control','private,no-store');
  res.json({contacts:results.rows,limit:100,scoped:true});
 }));
 router.get('/contacts/:id/timeline',run(async(req,res)=>{
  const {contact,campaign:c}=await contactContext(pool,req.params.id,req.userId);
  const [profile,interactions,calls]=await Promise.all([
   pool.query('SELECT stage,priority,tags,next_followup_at,updated_at FROM cc_pro_contact_profiles WHERE contact_id=$1 AND organization_id=$2',[contact.id,c.organization_id]),
   pool.query('SELECT id,author_subject,kind,note,created_at FROM cc_pro_contact_interactions WHERE contact_id=$1 AND organization_id=$2 ORDER BY created_at DESC LIMIT 100',[contact.id,c.organization_id]),
   pool.query('SELECT id,member_subject,outcome,note,created_at FROM cc_call_events WHERE contact_id=$1 AND organization_id=$2 ORDER BY created_at DESC LIMIT 100',[contact.id,c.organization_id])
  ]);
  const timeline=[
   ...interactions.rows.map(x=>({id:x.id,kind:x.kind,author:x.author_subject,note:x.note,createdAt:x.created_at,source:'crm'})),
   ...calls.rows.map(x=>({id:x.id,kind:'call',author:x.member_subject,outcome:x.outcome,note:x.note,createdAt:x.created_at,source:'manual_call'}))
  ].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,100);
  res.set('Cache-Control','private,no-store');
  res.json({contact:{id:contact.id,name:contact.display_name,privacy:contact.privacy,doNotCall:contact.do_not_call},
   profile:profile.rows[0]||{stage:'new',priority:'normal',tags:[],next_followup_at:null},
   timeline,manualOnly:true});
 }));
 router.put('/contacts/:id/profile',run(async(req,res)=>{
  const stage=req.body?.stage,priority=req.body?.priority,tags=req.body?.tags,due=req.body?.nextFollowupAt;
  if(!stages.includes(stage)||!['low','normal','high'].includes(priority)||
    !Array.isArray(tags)||tags.length>10||tags.some(x=>typeof x!=='string'||!x.trim()||x.length>32)||
    new Set(tags.map(x=>x.toLocaleLowerCase().trim())).size!==tags.length)
    throw bad(400,'Invalid CRM stage, priority or tags');
  const followup=nextDate(due);
  const result=await transaction(async db=>{
   const {contact,campaign:c}=await contactContext(db,req.params.id,req.userId);
   if(!writers.includes(c.role))throw bad(403,'CRM editor permission required');
   if(c.status==='closed')throw bad(409,'Campaign is closed');
   const previous=(await db.query('SELECT stage,priority,tags,next_followup_at FROM cc_pro_contact_profiles WHERE contact_id=$1 FOR UPDATE',[contact.id])).rows[0]||null;
   const row=(await db.query(
    'INSERT INTO cc_pro_contact_profiles(organization_id,campaign_id,contact_id,stage,priority,tags,next_followup_at,last_updated_by)'+
    ' VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(contact_id) DO UPDATE SET stage=excluded.stage,priority=excluded.priority,tags=excluded.tags,next_followup_at=excluded.next_followup_at,last_updated_by=excluded.last_updated_by,updated_at=now() RETURNING stage,priority,tags,next_followup_at,updated_at',
    [c.organization_id,c.id,contact.id,stage,priority,tags.map(t=>t.trim()),followup,req.userId])).rows[0];
   await log(db,c.organization_id,c.id,req.userId,'crm.profile_changed',contact.id,
    {from:previous?{stage:previous.stage,priority:previous.priority}:null,to:{stage,priority},tagCount:tags.length,dueChanged:(previous?.next_followup_at||null)!==(followup||null)});
   return row;
  });
  res.json(result);
 }));
 router.post('/contacts/:id/interactions',run(async(req,res)=>{
  const kind=req.body?.kind,raw=req.body?.note;
  if(!['meeting','message','email','other'].includes(kind)||typeof raw!=='string'||
     !raw.trim()||raw.length>2000)throw bad(400,'Invalid interaction');
  const result=await transaction(async db=>{
   const {contact,campaign:c}=await contactContext(db,req.params.id,req.userId);
   if(!writers.includes(c.role))throw bad(403,'CRM author permission required');
   if(c.status==='closed')throw bad(409,'Campaign is closed');
   const row=(await db.query(
    'INSERT INTO cc_pro_contact_interactions(organization_id,campaign_id,contact_id,author_subject,kind,note) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,kind,note,created_at',
    [c.organization_id,c.id,contact.id,req.userId,kind,raw.trim()])).rows[0];
   // No note in shared audit log — it may be private donor information.
   await log(db,c.organization_id,c.id,req.userId,'crm.interaction_added',row.id,{contactId:contact.id,kind});
   return row;
  });
  res.status(201).json(result);
 }));
 return router;
}
