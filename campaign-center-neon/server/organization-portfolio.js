import {Router} from 'express';

// Organization portfolio exposes only aggregated, per-campaign counters to
// ACTIVE workspace owner/manager. It never returns donor identities or notes.
export default function organizationPortfolioRouter({pool,bad,uuid,trim,log}){
 const router=Router(),run=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 async function leader(db,id,user){
  if(!uuid(id))throw bad(400,'Invalid organization');
  const role=(await db.query(
   "SELECT role FROM cc_memberships WHERE organization_id=$1 AND subject=$2 AND membership_status='active'",
   [id,user])).rows[0]?.role;
  if(!role)throw bad(404,'Organization not found');
  if(!['owner','manager'].includes(role))throw bad(403,'Only organization leadership');
  return role;
 }
 async function transaction(fn){
  const db=await pool.connect();
  try{await db.query('BEGIN');const out=await fn(db);await db.query('COMMIT');return out;}
  catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 router.get('/organizations/:oid/decisions',run(async(req,res)=>{
  await leader(pool,req.params.oid,req.userId);
  const q=await pool.query(
   'SELECT id,campaign_id,title,context,status,resolution,created_by,decided_by,created_at,decided_at'+
   ' FROM cc_org_leadership_decisions WHERE organization_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100',
   [req.params.oid]);
  res.set('Cache-Control','private,no-store');
  res.json({decisions:q.rows,scope:'organization_owner_or_manager'});
 }));
 router.post('/organizations/:oid/decisions',run(async(req,res)=>{
  if(typeof req.body?.title!=='string'||!req.body.title.trim()||req.body.title.length>180||
     typeof req.body?.context!=='string'||req.body.context.length>1500)throw bad(400,'Invalid decision proposal');
  const target=req.body?.campaignId||null;
  if(target&&!uuid(target))throw bad(400,'Invalid campaign');
  const result=await transaction(async db=>{
   await leader(db,req.params.oid,req.userId);
   if(target){
    const found=await db.query('SELECT 1 FROM cc_campaigns WHERE organization_id=$1 AND id=$2',
     [req.params.oid,target]);
    if(!found.rowCount)throw bad(404,'Campaign does not belong to this organization');
   }
   const row=(await db.query(
    'INSERT INTO cc_org_leadership_decisions(organization_id,campaign_id,created_by,title,context) VALUES($1,$2,$3,$4,$5) RETURNING id,status',
    [req.params.oid,target,req.userId,trim(req.body.title,180),trim(req.body.context,1500)])).rows[0];
   // No confidential leadership rationale in broadly accessible activity.
   await log(db,req.params.oid,target,req.userId,'organization.decision.proposed',row.id,{});
   return row;
  });
  res.status(201).json(result);
 }));
 router.post('/decisions/:id/resolve',run(async(req,res)=>{
  if(!uuid(req.params.id)||typeof req.body?.resolution!=='string'||
    !req.body.resolution.trim()||req.body.resolution.length>1500)throw bad(400,'Resolution required');
  const result=await transaction(async db=>{
   const item=(await db.query('SELECT * FROM cc_org_leadership_decisions WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(!item)throw bad(404,'Decision not found');
   await leader(db,item.organization_id,req.userId);
   if(item.status!=='open')throw bad(409,'Decision already finalized');
   const row=(await db.query(
    "UPDATE cc_org_leadership_decisions SET status='decided',resolution=$1,decided_by=$2,decided_at=now() WHERE id=$3 RETURNING id,status,decided_at",
    [trim(req.body.resolution,1500),req.userId,item.id])).rows[0];
   await log(db,item.organization_id,item.campaign_id,req.userId,'organization.decision.finalized',item.id,{});
   return row;
  });
  res.json(result);
 }));
 router.get('/organizations/:oid/portfolio',run(async(req,res)=>{
  if(!uuid(req.params.oid))throw bad(400,'Invalid organization');
  const role=(await pool.query(
   "SELECT role FROM cc_memberships WHERE organization_id=$1 AND subject=$2 AND membership_status='active'",
   [req.params.oid,req.userId])).rows[0]?.role;
  if(!role)throw bad(404,'Organization not found');
  if(!['owner','manager'].includes(role))throw bad(403,'Organization leadership access required');
  const total=(await pool.query('SELECT COUNT(*)::int n FROM cc_campaigns WHERE organization_id=$1',[req.params.oid])).rows[0].n;
  const query=
   "SELECT c.id,c.title,c.currency,c.status,c.goal_amount::text goal_amount,c.created_at,"+
   " COALESCE(task.open_tasks,0)::int open_tasks,"+
   " COALESCE(task.overdue_tasks,0)::int overdue_tasks,"+
   " COALESCE(team.active_members,0)::int active_members,"+
   " COALESCE(fin.pledges,0)::text pledged,"+
   " COALESCE(fin.receipts,0)::text manually_reported_receipts,"+
   " COALESCE(fin.refunds,0)::text manually_reported_refunds"+
   " FROM cc_campaigns c"+
   " LEFT JOIN LATERAL (SELECT COUNT(*) FILTER(WHERE a.status IN ('open','in_progress')) open_tasks,"+
   " COUNT(*) FILTER(WHERE a.status IN ('open','in_progress') AND a.due_at<now()) overdue_tasks"+
   " FROM cc_assignments a WHERE a.organization_id=c.organization_id AND a.campaign_id=c.id) task ON TRUE"+
   " LEFT JOIN LATERAL (SELECT COUNT(*) active_members FROM cc_campaign_members cm"+
   " JOIN cc_memberships m ON m.organization_id=cm.organization_id AND m.subject=cm.subject"+
   " AND m.membership_status='active' WHERE cm.organization_id=c.organization_id AND cm.campaign_id=c.id) team ON TRUE"+
   " LEFT JOIN LATERAL (SELECT COALESCE(SUM(f.amount) FILTER(WHERE f.event_kind='pledge'),0) pledges,"+
   " COALESCE(SUM(f.amount) FILTER(WHERE f.event_kind='receipt'),0) receipts,"+
   " COALESCE(SUM(f.amount) FILTER(WHERE f.event_kind='refund'),0) refunds"+
   " FROM cc_finance_events f WHERE f.organization_id=c.organization_id AND f.campaign_id=c.id) fin ON TRUE"+
   " WHERE c.organization_id=$1 ORDER BY c.created_at DESC,c.id DESC LIMIT 50";
  const campaigns=(await pool.query(query,[req.params.oid])).rows;
  // Never total USD, GBP and other currencies together. Group by currency.
  const byCurrency={};
  for(const campaign of campaigns){
   const k=campaign.currency;
   if(!byCurrency[k])byCurrency[k]={currency:k,goal:'0',pledged:'0',manualNet:'0',campaigns:0};
   const cents=x=>{
    const [a,b='']=String(x??0).split('.');
    return BigInt(a)*100n+BigInt((b+'00').slice(0,2));
   };
   const fmt=n=>(n<0n?'-':'')+(n<0n?-n:n)/100n+'.'+String((n<0n?-n:n)%100n).padStart(2,'0');
   const row=byCurrency[k];row.campaigns++;
   row.goal=fmt(cents(row.goal)+cents(campaign.goal_amount));
   row.pledged=fmt(cents(row.pledged)+cents(campaign.pledged));
   row.manualNet=fmt(cents(row.manualNet)+cents(campaign.manually_reported_receipts)-cents(campaign.manually_reported_refunds));
  }
  res.set('Cache-Control','private,no-store');
  res.json({totalCampaigns:total,returned:campaigns.length,truncated:total>campaigns.length,
   campaigns,currencies:Object.values(byCurrency),
   scope:'workspace_leadership_only',
   totalsAreManuallyRecordedNotPaymentVerified:true});
 }));
 return router;
}
