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
 router.get('/campaigns/:cid/credit-report',handler(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);
  need(c.role,workRoles);
  const elevated=['owner','manager','finance','auditor'].includes(c.role);
  const page=Number(req.query.page??1);
  if(!Number.isSafeInteger(page)||page<1||page>10000)
   throw bad(400,'Invalid credit report page');
  if(!elevated&&page!==1)throw bad(403,'Personal credit is one page');
  const limit=100;
  // The immutable finance-event source is the authority for historical
  // campaign attribution, even after the originally credited worker leaves
  // the organization or the campaign. Never filter against active membership.
  // Group by currency to avoid mathematically false cross-currency totals.
  const source=
   " FROM cc_finance_events f"+
   " WHERE f.organization_id=$1 AND f.campaign_id=$2"+
   " AND ($3::boolean OR f.credited_member_subject=$4)";
  const params=[c.organization_id,c.id,elevated,req.userId];
  const byMember=
   " WITH amounts AS ("+
   " SELECT f.credited_member_subject subject,f.currency,"+
   " COALESCE(SUM(f.amount) FILTER(WHERE f.event_kind='pledge'),0)::text pledged,"+
   " COALESCE(SUM(f.amount) FILTER(WHERE f.event_kind='receipt'),0)::text receipts,"+
   " COALESCE(SUM(f.amount) FILTER(WHERE f.event_kind='refund'),0)::text refunds,"+
   " COALESCE(SUM(f.amount) FILTER(WHERE f.event_kind='correction'),0)::text corrections,"+
   " (COALESCE(SUM(f.amount) FILTER(WHERE f.event_kind='receipt'),0)"+
   " -COALESCE(SUM(f.amount) FILTER(WHERE f.event_kind='refund'),0))::text manual_net"+
   source+
   " AND f.credited_member_subject IS NOT NULL"+
   " GROUP BY f.credited_member_subject,f.currency"+
   " )"+
   " SELECT a.*,COALESCE(cm.team_name,'') team_name,"+
   " COALESCE(m.membership_status,'not_listed') member_status,"+
   " (cm.subject IS NOT NULL) current_campaign_member"+
   " FROM amounts a LEFT JOIN cc_campaign_members cm"+
   " ON cm.organization_id=$1 AND cm.campaign_id=$2 AND cm.subject=a.subject"+
   " LEFT JOIN cc_memberships m ON m.organization_id=$1 AND m.subject=a.subject"+
   " ORDER BY (a.manual_net)::numeric DESC,a.subject,a.currency"+
   " LIMIT $5 OFFSET $6";
  const countQuery=
   " SELECT COUNT(*)::int total FROM ("+
   " SELECT f.credited_member_subject,f.currency"+source+
   " AND f.credited_member_subject IS NOT NULL"+
   " GROUP BY f.credited_member_subject,f.currency) s";
  const currencyTotals=
   " SELECT f.currency,"+
   " COUNT(*)::int ledger_event_count,"+
   " COUNT(*) FILTER(WHERE f.credited_member_subject IS NULL)::int unattributed_events,"+
   " COALESCE(SUM(f.amount) FILTER(WHERE f.event_kind='pledge'),0)::text pledged,"+
   " COALESCE(SUM(f.amount) FILTER(WHERE f.event_kind='receipt'),0)::text receipts,"+
   " COALESCE(SUM(f.amount) FILTER(WHERE f.event_kind='refund'),0)::text refunds,"+
   " COALESCE(SUM(f.amount) FILTER(WHERE f.event_kind='correction'),0)::text corrections,"+
   " (COALESCE(SUM(f.amount) FILTER(WHERE f.event_kind='receipt'),0)"+
   " -COALESCE(SUM(f.amount) FILTER(WHERE f.event_kind='refund'),0))::text manual_net"+
   source+" GROUP BY f.currency ORDER BY f.currency";
  const [pageRows,countResult,totalsResult]=await Promise.all([
   pool.query(byMember,[...params,limit,(page-1)*limit]),
   pool.query(countQuery,params),
   pool.query(currencyTotals,params)
  ]);
  const total=countResult.rows[0].total;
  res.set('Cache-Control','private,no-store');
  res.json({
   scope:elevated?'leadership':'self',credits:pageRows.rows,
   totalCreditRows:total,page,pageCount:Math.max(1,Math.ceil(total/limit)),
   shown:pageRows.rows.length,limit,currencyTotals:totalsResult.rows,
   allMemberStatusesRetained:true,allCurrenciesSeparated:true,
   immutableAttribution:true,manualNotProcessorVerified:true,
   correctionsNotAppliedWithoutDirection:true,
   explanation:'Manual historical attribution includes departed campaign staff. Per-currency ledger totals include unattributed entries; credit rows exclude those entries. Corrections are separately disclosed, not silently treated as receipts or refunds. This is not verified payment or individual performance.'
  });
 }));
 const visibleAlertTask=
   " AND ($3::boolean OR a.assignee_subject=$4 OR ($5::boolean AND EXISTS ("+
   " SELECT 1 FROM cc_campaign_members leader JOIN cc_campaign_members peer"+
   " ON peer.organization_id=leader.organization_id AND peer.campaign_id=leader.campaign_id"+
   " AND peer.team_name=leader.team_name AND peer.team_name<>''"+
   " WHERE leader.organization_id=a.organization_id AND leader.campaign_id=a.campaign_id"+
   " AND leader.subject=$4 AND peer.subject=a.assignee_subject)))";
 router.get('/campaigns/:cid/alerts',handler(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);need(c.role,workRoles);
  const manager=isLeader(c.role);
  const squad=c.role==='squad_leader';
  const scope=visibleAlertTask;
  const base=" FROM cc_assignments a WHERE a.organization_id=$1 AND a.campaign_id=$2"+
   " AND a.status IN ('open','in_progress') AND a.due_at<now()"+scope;
  const params=[c.organization_id,c.id,manager,req.userId,squad];
  const [total,items]=await Promise.all([
   pool.query('SELECT COUNT(*)::int total'+base,params),
   pool.query('SELECT a.id,a.title,a.priority,a.assignee_subject,a.due_at'+base+
    ' ORDER BY a.due_at ASC LIMIT 20',params)
  ]);
  const ackIds=items.rows.map(t=>t.id);
  const reads=ackIds.length?await pool.query(
   "SELECT task_id,trigger_due_at,acknowledged_at FROM cc_plus_alert_acknowledgements"+
   " WHERE organization_id=$1 AND campaign_id=$2 AND author_subject=$3 AND task_id=ANY($4::uuid[])",
   [c.organization_id,c.id,req.userId,ackIds]):{rows:[]};
  const acknowledgements=new Map(reads.rows.map(x=>[x.task_id+'@'+new Date(x.trigger_due_at).toISOString(),x.acknowledged_at]));
  const taskCards=items.rows.map(t=>({...t,
   acknowledged_at:acknowledgements.get(t.id+'@'+new Date(t.due_at).toISOString())||null}));
  let quietMembers=[];
  if(manager){
   const report=await pool.query(
    "SELECT cm.subject,cm.team_name,MAX(call.created_at) last_manual_call_at"+
    " FROM cc_campaign_members cm JOIN cc_memberships m ON m.organization_id=cm.organization_id"+
    " AND m.subject=cm.subject AND m.membership_status='active'"+
    " LEFT JOIN cc_call_events call ON call.organization_id=cm.organization_id"+
    " AND call.campaign_id=cm.campaign_id AND call.member_subject=cm.subject"+
    " WHERE cm.organization_id=$1 AND cm.campaign_id=$2 AND m.role IN ('askan','squad_leader')"+
    " GROUP BY cm.subject,cm.team_name"+
    " HAVING MAX(call.created_at) IS NULL OR MAX(call.created_at)<now()-interval '7 days'"+
    " ORDER BY cm.team_name,cm.subject LIMIT 30",[c.organization_id,c.id]);
   quietMembers=report.rows;
  }
  res.set('Cache-Control','private,no-store');
  res.json({source:'existing_campaign_records',notificationDelivered:false,
   overdueCount:total.rows[0].total,overdueTasks:taskCards,quietMembers,
   advisory:'A lack of manually logged calls is not proof that a member did no work.'});
 }));
 // An ACK is a per-member read receipt, not task completion or reminder dispatch.
 router.post('/campaigns/:cid/alerts/:tid/ack',handler(async(req,res)=>{
  if(!uuid(req.params.tid))throw bad(400,'Invalid task id');
  const result=await transaction(async db=>{
   const c=await campaignAccess(db,req.params.cid,req.userId);need(c.role,workRoles);
   if(c.status==='closed')throw bad(409,'Closed campaign');
   const manager=isLeader(c.role),squad=c.role==='squad_leader';
   const r=await db.query(
    "SELECT a.id,a.due_at FROM cc_assignments a WHERE a.id=$6 AND a.organization_id=$1"+
    " AND a.campaign_id=$2 AND a.status IN ('open','in_progress') AND a.due_at<now()"+
    visibleAlertTask+" FOR UPDATE OF a",
    [c.organization_id,c.id,manager,req.userId,squad,req.params.tid]);
   const task=r.rows[0];
   if(!task)throw bad(404,'Overdue task not in your permitted view');
   const saved=await db.query(
    "INSERT INTO cc_plus_alert_acknowledgements(organization_id,campaign_id,author_subject,task_id,trigger_due_at)"+
    " VALUES($1,$2,$3,$4,$5)"+
    " ON CONFLICT(organization_id,campaign_id,author_subject,task_id,trigger_due_at) DO NOTHING RETURNING acknowledged_at",
    [c.organization_id,c.id,req.userId,task.id,task.due_at]);
   if(saved.rowCount){
    await log(db,c.organization_id,c.id,req.userId,'plus.task_alert_acknowledged',task.id,{type:'overdue'});
   }
   return {taskId:task.id,acknowledgedAt:saved.rows[0]?.acknowledged_at||null,alreadyAcknowledged:!saved.rowCount,
     reminderStillDue:true,taskStatusUnchanged:true,externalNotificationSent:false};
  });
  res.set('Cache-Control','private,no-store').status(result.alreadyAcknowledged?200:201).json(result);
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

 // Donation amount PRESETS, not a money ledger or a checkout.
 router.get('/campaigns/:cid/donation-levels',handler(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);need(c.role,workRoles);
  const data=await pool.query('SELECT id,label,amount,display_order FROM cc_donation_levels WHERE organization_id=$1 AND campaign_id=$2 ORDER BY display_order',
   [c.organization_id,c.id]);
  res.set('Cache-Control','private,no-store');
  res.json({levels:data.rows,paymentProcessing:false});
 }));
 router.put('/campaigns/:cid/donation-levels',handler(async(req,res)=>{
  const submitted=req.body?.levels;
  if(!Array.isArray(submitted)||submitted.length>8)throw bad(400,'Choose 0 to 8 donation levels');
  const levels=[],names=new Set();
  for(const [index,item] of submitted.entries()){
   if(!item||typeof item!=='object'||Array.isArray(item)||
     typeof item.label!=='string'||item.label.length>60)throw bad(400,'Invalid donation level label');
   const label=item.label.trim();
   const raw=String(item.amount??'');
   if(!label||!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(raw))throw bad(400,'Invalid suggested amount');
   const amount=Number(raw);
   if(!Number.isFinite(amount)||amount<=0||amount>1000000000000)throw bad(400,'Invalid suggested amount');
   const key=label.toLocaleLowerCase();
   if(names.has(key))throw bad(400,'Duplicate donation level label');
   names.add(key);levels.push({label,amount:amount.toFixed(2),order:index});
  }
  const saved=await transaction(async db=>{
   const c=await campaignAccess(db,req.params.cid,req.userId);
   need(c.role,['owner','manager']);
   if(c.status==='closed')throw bad(409,'Closed campaign settings cannot be edited');
   // Lock campaign row so concurrent managers cannot interleave preset writes.
   await db.query('SELECT id FROM cc_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE',[c.id,c.organization_id]);
   await db.query('DELETE FROM cc_donation_levels WHERE campaign_id=$1 AND organization_id=$2',[c.id,c.organization_id]);
   for(const item of levels){
    await db.query('INSERT INTO cc_donation_levels(organization_id,campaign_id,label,amount,display_order,created_by) VALUES($1,$2,$3,$4,$5,$6)',
     [c.organization_id,c.id,item.label,item.amount,item.order,req.userId]);
   }
   await log(db,c.organization_id,c.id,req.userId,'donation_levels.updated',c.id,{
    count:levels.length,labels:levels.map(x=>x.label),amounts:levels.map(x=>x.amount),
    disclaimer:'Suggested amounts only, never real received funds'});
   return levels;
  });
  res.json({levels:saved,paymentProcessing:false});
 }));
 return router;
}
