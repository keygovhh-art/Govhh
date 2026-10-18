import {Router} from 'express';

// Gabbai Pro maker-checker requests. Human approval is documentation only:
// this NEVER executes a charge, refund, transfer or ledger correction.
export default function gabbaiApprovalsRouter({pool,campaignAccess,bad,uuid,trim,log}){
 const router=Router(),run=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const readers=['owner','manager','finance','auditor'];
 const makers=['owner','manager','finance'];
 const reviewers=['owner','manager'];
 const categories=['planned_expense','manual_adjustment','refund_review','other'];
 const money=raw=>{
  if(typeof raw!=='string'&&typeof raw!=='number')throw bad(400,'Invalid amount');
  const s=String(raw);
  if(!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(s)||Number(s)<=0||Number(s)>1000000000000)
   throw bad(400,'Invalid amount');
  return Number(s).toFixed(2);
 };
 async function tx(fn){
  const db=await pool.connect();
  try{await db.query('BEGIN');const answer=await fn(db);await db.query('COMMIT');return answer;}
  catch(err){await db.query('ROLLBACK');throw err;}finally{db.release();}
 }
 router.get('/campaigns/:cid/approvals',run(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);
  if(!readers.includes(c.role))throw bad(403,'Finance access required');
  const status=req.query.status||'all';
  if(!['all','pending','approved','rejected'].includes(status))throw bad(400,'Invalid status filter');
  const q=await pool.query(
   "SELECT id,category,amount::text amount,currency,subject,explanation,status,requested_by,created_at,decided_by,decided_at"+
   " FROM cc_gabbai_approval_requests WHERE organization_id=$1 AND campaign_id=$2"+
   " AND ($3='all' OR status=$3) ORDER BY created_at DESC,id DESC LIMIT 200",
   [c.organization_id,c.id,status]);
  // Accurate whole-campaign counters, independent of the 200 newest rows.
  // "Can review" always excludes one's own requests (two-person approval).
  const summary=(await pool.query(
   "SELECT COUNT(*)::int total,"+
   " COUNT(*) FILTER (WHERE status='pending')::int pending,"+
   " COUNT(*) FILTER (WHERE status='approved')::int approved,"+
   " COUNT(*) FILTER (WHERE status='rejected')::int rejected,"+
   " COUNT(*) FILTER (WHERE status='pending' AND requested_by<>$3)::int reviewable_count,"+
   " COUNT(*) FILTER (WHERE requested_by=$3 AND status='pending')::int my_pending,"+
   " COALESCE(SUM(amount) FILTER (WHERE status='pending'),0)::text pending_amount,"+
   " COALESCE(SUM(amount) FILTER (WHERE status='pending' AND requested_by<>$3),0)::text reviewable_amount"+
   " FROM cc_gabbai_approval_requests WHERE organization_id=$1 AND campaign_id=$2",
   [c.organization_id,c.id,req.userId])).rows[0];
  res.set('Cache-Control','private,no-store');
  res.json({requests:q.rows,summary,limit:200,role:c.role,approvalDoesNotMoveMoney:true,
   dualControl:true,summaryAcrossAllRows:true});
 }));
 router.get('/campaigns/:cid/priority-oversight',run(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);
  if(!['owner','manager'].includes(c.role))throw bad(403,'Leadership oversight required');
  // One task row per assignee, one optional blocker row per task. Never join
  // call and finance events here (doing so would multiply aggregates).
  const data=await pool.query(
   "SELECT cm.team_name,COUNT(DISTINCT cm.subject)::int active_members,"+
   " COUNT(a.id) FILTER(WHERE a.status IN ('open','in_progress'))::int open_tasks,"+
   " COUNT(a.id) FILTER(WHERE a.status IN ('open','in_progress') AND a.due_at<now())::int overdue_tasks,"+
   " COUNT(b.task_id) FILTER(WHERE b.is_active AND a.status IN ('open','in_progress'))::int active_blockers"+
   " FROM cc_campaign_members cm"+
   " JOIN cc_memberships m ON m.organization_id=cm.organization_id AND m.subject=cm.subject"+
   " AND m.membership_status='active'"+
   " LEFT JOIN cc_assignments a ON a.organization_id=cm.organization_id"+
   " AND a.campaign_id=cm.campaign_id AND a.assignee_subject=cm.subject"+
   " LEFT JOIN cc_pro_task_blockers b ON b.task_id=a.id AND b.organization_id=cm.organization_id"+
   " AND b.campaign_id=cm.campaign_id"+
   " WHERE cm.organization_id=$1 AND cm.campaign_id=$2"+
   " GROUP BY cm.team_name ORDER BY overdue_tasks DESC,active_blockers DESC,open_tasks DESC,cm.team_name LIMIT 50",
   [c.organization_id,c.id]);
  res.set('Cache-Control','private,no-store');
  res.json({teams:data.rows,priorityOrder:'overdue-then-reported-blockers-then-open',
   isBasedOnRecordedTasksOnly:true,noEmployeePerformanceJudgement:true});
 }));
 router.get('/campaigns/:cid/ledger-review',run(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);
  if(!readers.includes(c.role))throw bad(403,'Finance review access required');
  const days=Number(req.query.days||30);
  if(![7,30,90,365].includes(days))throw bad(400,'Choose 7, 30, 90 or 365 days');
  const params=[c.organization_id,c.id,days];
  const [bySource,net,unlinked]=await Promise.all([
   pool.query(
    "SELECT event_kind,source_system,COUNT(*)::int event_count,"+
    " COALESCE(SUM(amount),0)::text total_amount,COUNT(*) FILTER(WHERE verified_at IS NOT NULL)::int internally_marked_verified"+
    " FROM cc_finance_events WHERE organization_id=$1 AND campaign_id=$2"+
    " AND created_at>=now()-($3::int*interval '1 day')"+
    " GROUP BY event_kind,source_system ORDER BY event_kind,source_system",params),
   pool.query(
    "SELECT COALESCE(SUM(amount) FILTER(WHERE event_kind='pledge'),0)::text pledged,"+
    " COALESCE(SUM(amount) FILTER(WHERE event_kind='receipt'),0)::text receipts,"+
    " COALESCE(SUM(amount) FILTER(WHERE event_kind='refund'),0)::text refunds,"+
    " (COALESCE(SUM(amount) FILTER(WHERE event_kind='receipt'),0)-"+
    " COALESCE(SUM(amount) FILTER(WHERE event_kind='refund'),0))::text reported_net"+
    " FROM cc_finance_events WHERE organization_id=$1 AND campaign_id=$2"+
    " AND created_at>=now()-($3::int*interval '1 day')",params),
   pool.query(
    "SELECT COUNT(*)::int count FROM cc_finance_events WHERE organization_id=$1 AND campaign_id=$2"+
    " AND event_kind='receipt' AND related_pledge_id IS NULL"+
    " AND created_at>=now()-($3::int*interval '1 day')",params)
  ]);
  res.set('Cache-Control','private,no-store');
  res.json({days,totals:net.rows[0],bySource:bySource.rows,
   receiptsWithoutPledgeLink:unlinked.rows[0].count,
   internalStampsNotBankVerification:true,noExternalReconciliation:true,
   note:'This review summarizes existing immutable manual ledger entries. It does not confirm payment settlement, bank clearing or payment processor synchronization.'});
 }));
 router.post('/campaigns/:cid/approvals',run(async(req,res)=>{
  if(!categories.includes(req.body?.category)||typeof req.body?.subject!=='string'||!req.body.subject.trim()||
    req.body.subject.length>180||typeof req.body?.explanation!=='string'||req.body.explanation.length>1500)
   throw bad(400,'Invalid approval request');
  const amount=money(req.body.amount);
  const result=await tx(async db=>{
   const c=await campaignAccess(db,req.params.cid,req.userId);
   if(!makers.includes(c.role))throw bad(403,'Only campaign leaders or treasurer may propose an approval');
   if(c.status==='closed')throw bad(409,'Campaign closed');
   const row=(await db.query(
    "INSERT INTO cc_gabbai_approval_requests(organization_id,campaign_id,requested_by,category,amount,currency,subject,explanation) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,status,amount::text amount",
    [c.organization_id,c.id,req.userId,req.body.category,amount,c.currency,trim(req.body.subject,180),trim(req.body.explanation,1500)])).rows[0];
   // Audit never contains financial explanation or private donor context.
   await log(db,c.organization_id,c.id,req.userId,'gabbai.approval.created',row.id,
    {category:req.body.category,amount});
   return row;
  });
  res.status(201).json({...result,approvalDoesNotMoveMoney:true});
 }));
 router.post('/approvals/:id/decision',run(async(req,res)=>{
  if(!uuid(req.params.id)||!['approved','rejected'].includes(req.body?.decision)||
     (req.body.reason!==undefined&&(typeof req.body.reason!=='string'||req.body.reason.length>500)))
   throw bad(400,'Invalid review');
  const result=await tx(async db=>{
   const item=(await db.query('SELECT * FROM cc_gabbai_approval_requests WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(!item)throw bad(404,'Approval not found');
   const c=await campaignAccess(db,item.campaign_id,req.userId);
   if(c.organization_id!==item.organization_id)throw bad(404,'Approval not found');
   if(!reviewers.includes(c.role))throw bad(403,'Owner or manager reviewer required');
   if(item.requested_by===req.userId)throw bad(403,'Two-person control: cannot approve your own request');
   if(c.status==='closed')throw bad(409,'Campaign closed');
   if(item.status!=='pending')throw bad(409,'Request was already decided');
   const reason=trim(req.body.reason||'',500);
   const d=(await db.query(
    'INSERT INTO cc_gabbai_approval_decisions(request_id,organization_id,campaign_id,reviewer_subject,decision,reason) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,decision,decided_at',
    [item.id,c.organization_id,c.id,req.userId,req.body.decision,reason])).rows[0];
   await db.query('UPDATE cc_gabbai_approval_requests SET status=$1,decided_by=$2,decided_at=$3 WHERE id=$4',
    [d.decision,req.userId,d.decided_at,item.id]);
   await log(db,c.organization_id,c.id,req.userId,'gabbai.approval.decided',item.id,
    {decision:d.decision,reviewer:req.userId});
   return {id:item.id,status:d.decision,decidedBy:req.userId,doesNotMoveMoney:true};
  });
  res.json(result);
 }));
 return router;
}
