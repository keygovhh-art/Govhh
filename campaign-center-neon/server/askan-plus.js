import {Router} from 'express';

/**
 * Askan Plus: real member work desk, anonymized team totals and auditable work
 * hand-offs. No subscription or payment-provider state is asserted here.
 * These endpoints always use the authenticated user and db-verified campaign.
 */
export default function askanPlusRouter({pool,campaignAccess,need,bad,uuid,trim,log}){
 const router=Router();
 const handler=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const workRoles=['owner','manager','squad_leader','askan','finance','auditor'];
 const changeRoles=['owner','manager','squad_leader'];
 const isLeader=role=>role==='owner'||role==='manager';
 const validDue=value=>{
  if(value===null||value==='')return null;
  if(typeof value!=='string'||value.length>35||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value))throw bad(400,'Due time must include a timezone');
  const d=new Date(value);
  if(!Number.isFinite(d.getTime()))throw bad(400,'Invalid due time');
  return d.toISOString();
 };
 async function transaction(action){
  const db=await pool.connect();
  try{await db.query('BEGIN');const r=await action(db);await db.query('COMMIT');return r;}
  catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 router.get('/campaigns/:cid/member-desk',handler(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);need(c.role,workRoles);
  const [tasks,calls,money,team]=await Promise.all([
   pool.query("SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status='done')::int done,COUNT(*) FILTER(WHERE status IN ('open','in_progress'))::int open,COUNT(*) FILTER(WHERE status IN ('open','in_progress') AND due_at<now())::int overdue FROM cc_assignments WHERE organization_id=$1 AND campaign_id=$2 AND assignee_subject=$3",[c.organization_id,c.id,req.userId]),
   pool.query("SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE created_at>=now()-interval '7 days')::int last_seven_days,COUNT(*) FILTER(WHERE outcome='callback')::int callbacks FROM cc_call_events WHERE organization_id=$1 AND campaign_id=$2 AND member_subject=$3",[c.organization_id,c.id,req.userId]),
   pool.query("SELECT COALESCE(SUM(amount) FILTER(WHERE event_kind='pledge'),0)::text pledged,(COALESCE(SUM(amount) FILTER(WHERE event_kind='receipt'),0)-COALESCE(SUM(amount) FILTER(WHERE event_kind='refund'),0))::text manually_reported_net FROM cc_finance_events WHERE organization_id=$1 AND campaign_id=$2 AND credited_member_subject=$3",[c.organization_id,c.id,req.userId]),
   pool.query('SELECT team_name FROM cc_campaign_members WHERE organization_id=$1 AND campaign_id=$2 AND subject=$3',[c.organization_id,c.id,req.userId])
  ]);
  res.set('Cache-Control','private,no-store');
  res.json({scope:'only_authenticated_member',campaignId:c.id,subject:req.userId,
   teamName:team.rows[0]?.team_name||'',tasks:tasks.rows[0],calls:calls.rows[0],
   finance:money.rows[0],moneyIsManualNotProcessorVerified:true});
 }));
 router.get('/campaigns/:cid/teams-report',handler(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);
  need(c.role,['owner','manager','finance','auditor']);
  const days=Number(req.query.days||7);
  if(![7,30,90].includes(days))throw bad(400,'Choose 7, 30 or 90 days');
  // Aggregate by team with no donor names or notes. Each underlying event counts
  // only once in its own group; do not join finance rows against call rows.
  const params=[c.organization_id,c.id,days];
  const [members,tasks,calls,finance]=await Promise.all([
   pool.query("SELECT cm.team_name,COUNT(*)::int active_members FROM cc_campaign_members cm JOIN cc_memberships m ON m.organization_id=cm.organization_id AND m.subject=cm.subject AND m.membership_status='active' WHERE cm.organization_id=$1 AND cm.campaign_id=$2 GROUP BY cm.team_name",[c.organization_id,c.id]),
   pool.query("SELECT cm.team_name,COUNT(*)::int tasks,COUNT(*) FILTER(WHERE a.status='done')::int completed FROM cc_assignments a JOIN cc_campaign_members cm ON cm.organization_id=a.organization_id AND cm.campaign_id=a.campaign_id AND cm.subject=a.assignee_subject WHERE a.organization_id=$1 AND a.campaign_id=$2 AND a.created_at>=now()-($3::int*interval '1 day') GROUP BY cm.team_name",params),
   pool.query("SELECT cm.team_name,COUNT(*)::int calls,COUNT(*) FILTER(WHERE call.outcome='callback')::int callbacks FROM cc_call_events call JOIN cc_campaign_members cm ON cm.organization_id=call.organization_id AND cm.campaign_id=call.campaign_id AND cm.subject=call.member_subject WHERE call.organization_id=$1 AND call.campaign_id=$2 AND call.created_at>=now()-($3::int*interval '1 day') GROUP BY cm.team_name",params),
   pool.query("SELECT cm.team_name,COALESCE(SUM(f.amount) FILTER(WHERE f.event_kind='pledge'),0)::text pledged,(COALESCE(SUM(f.amount) FILTER(WHERE f.event_kind='receipt'),0)-COALESCE(SUM(f.amount) FILTER(WHERE f.event_kind='refund'),0))::text manually_reported_net FROM cc_finance_events f JOIN cc_campaign_members cm ON cm.organization_id=f.organization_id AND cm.campaign_id=f.campaign_id AND cm.subject=f.credited_member_subject WHERE f.organization_id=$1 AND f.campaign_id=$2 AND f.created_at>=now()-($3::int*interval '1 day') GROUP BY cm.team_name",params)
  ]);
  const map=new Map();
  function put(rows,allowed){
   for(const row of rows){
    const key=row.team_name||'';
    if(!map.has(key))map.set(key,{teamName:key,activeMembers:0,tasks:0,completed:0,calls:0,callbacks:0,pledged:'0',manuallyReportedNet:'0'});
    const line=map.get(key);
    for(const [from,to] of allowed)if(Object.hasOwn(row,from))line[to]=row[from];
   }
  }
  put(members.rows,[['active_members','activeMembers']]);
  put(tasks.rows,[['tasks','tasks'],['completed','completed']]);
  put(calls.rows,[['calls','calls'],['callbacks','callbacks']]);
  put(finance.rows,[['pledged','pledged'],['manually_reported_net','manuallyReportedNet']]);
  const teams=[...map.values()].sort((a,b)=>a.teamName.localeCompare(b.teamName));
  res.set('Cache-Control','private,no-store');
  res.json({scope:'only_campaign_leadership',days,teams,recordsAreManualNotProviderVerified:true});
 }));
 router.patch('/tasks/:id/handoff',handler(async(req,res)=>{
  if(!uuid(req.params.id))throw bad(400,'Invalid task ID');
  const target=trim(req.body?.assigneeSubject,128);
  if(!target)throw bad(400,'New assignee required');
  const hasDue=Object.hasOwn(req.body||{},'dueAt');
  const due=hasDue?validDue(req.body.dueAt):undefined;
  const record=await transaction(async db=>{
   const task=(await db.query('SELECT * FROM cc_assignments WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(!task)throw bad(404,'Task missing');
   const c=await campaignAccess(db,task.campaign_id,req.userId);
   if(c.organization_id!==task.organization_id)throw bad(404,'Task missing');
   need(c.role,changeRoles);
   if(c.status==='closed'||['done','cancelled'].includes(task.status))throw bad(409,'Finished or closed work cannot be reassigned');
   const involved=(await db.query("SELECT cm.subject,cm.team_name FROM cc_campaign_members cm JOIN cc_memberships m ON m.organization_id=cm.organization_id AND m.subject=cm.subject AND m.membership_status='active' WHERE cm.organization_id=$1 AND cm.campaign_id=$2 AND cm.subject = ANY($3::text[])",[c.organization_id,c.id,[task.assignee_subject,target,req.userId]])).rows;
   const members=new Map(involved.map(m=>[m.subject,m.team_name]));
   if(!members.has(task.assignee_subject)||!members.has(target))throw bad(409,'Both members must have active campaign access');
   if(!isLeader(c.role)){
    const group=members.get(req.userId);
    if(!group||members.get(task.assignee_subject)!==group||members.get(target)!==group)
      throw bad(403,'Squad leader may only transfer tasks within their assigned squad');
   }
   const previousDue=task.due_at?new Date(task.due_at).toISOString():null;
   const nextDue=hasDue?due:previousDue;
   if(target===task.assignee_subject&&nextDue===previousDue)
    return {id:task.id,assignee_subject:task.assignee_subject,due_at:task.due_at,status:task.status,unchanged:true};
   const row=(await db.query(
    'UPDATE cc_assignments SET assignee_subject=$1,due_at=$2 WHERE id=$3 AND organization_id=$4 RETURNING id,assignee_subject,due_at,status',
    [target,nextDue,task.id,c.organization_id])).rows[0];
   await log(db,c.organization_id,c.id,req.userId,'task.handed_off',row.id,{
     previousAssignee:task.assignee_subject,nextAssignee:target,
     previousDue,nextDue});
   return row;
  });
  res.json(record);
 }));
 return router;
}
