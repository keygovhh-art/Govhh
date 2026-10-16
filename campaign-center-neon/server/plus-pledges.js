import {Router} from 'express';

// Askan Plus partial pledges: manual recordkeeping ONLY.
// A promise is not paid; a staff report is not processor-verified settlement.
export default function plusPledgesRouter({pool,campaignAccess,need,bad,uuid,trim,log}){
 const router=Router(),run=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const modes=new Set(['cash','check','bank','external']);
 const money=v=>{
  const raw=String(v??'');
  if(!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(raw))throw bad(400,'Invalid positive amount');
  const n=Number(raw);
  if(!Number.isFinite(n)||n<=0||n>1000000000000)throw bad(400,'Invalid positive amount');
  return n.toFixed(2);
 };
 const cents=x=>{
  const [whole,fraction='']=String(x).split('.');
  return BigInt(whole)*100n+BigInt((fraction+'00').slice(0,2));
 };
 const roles=['owner','manager','squad_leader','askan','finance','auditor'];
 router.get('/campaigns/:cid/pledges',run(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);need(c.role,roles);
  const seeAll=['owner','manager','finance','auditor'].includes(c.role);
  const sql=
   "SELECT p.id,p.credited_member_subject,p.amount::text amount,p.currency,p.created_at,"+
   " receipts.received::text manually_reported_received,refunds.reversed::text manually_reversed,"+
   " GREATEST(p.amount-receipts.received+refunds.reversed,0)::text outstanding"+
   " FROM cc_finance_events p"+
   " LEFT JOIN LATERAL (SELECT COALESCE(SUM(r.amount),0) received FROM cc_finance_events r"+
   "  WHERE r.related_pledge_id=p.id AND r.event_kind='receipt' AND r.organization_id=p.organization_id AND r.campaign_id=p.campaign_id) receipts ON TRUE"+
   " LEFT JOIN LATERAL (SELECT COALESCE(SUM(f.amount),0) reversed FROM cc_finance_events f"+
   "  JOIN cc_finance_events r ON r.id=f.related_finance_event_id AND r.related_pledge_id=p.id"+
   "  WHERE f.event_kind='refund' AND f.organization_id=p.organization_id AND f.campaign_id=p.campaign_id) refunds ON TRUE"+
   " WHERE p.organization_id=$1 AND p.campaign_id=$2 AND p.event_kind='pledge'"+
   " AND ($3::boolean OR p.credited_member_subject=$4) ORDER BY p.created_at DESC,p.id DESC LIMIT 200";
  const rows=await pool.query(sql,[c.organization_id,c.id,seeAll,req.userId]);
  res.set('Cache-Control','private,no-store');
  res.json({pledges:rows.rows,limit:200,amountsAreManuallyReported:true,providerVerified:false});
 }));
 router.post('/campaigns/:cid/pledges/:id/partial-receipts',run(async(req,res)=>{
  if(!uuid(req.params.id)||!uuid(req.body?.requestId))throw bad(400,'Pledge ID and unique request ID required');
  const method=req.body?.method,ref=trim(req.body?.reference,120),amount=money(req.body?.amount);
  if(!modes.has(method)||(method!=='cash'&&ref.length<3))
    throw bad(400,'Choose cash/check/bank/external and an appropriate reference');
  const db=await pool.connect();
  let result;
  try{
   await db.query('BEGIN');
   const c=await campaignAccess(db,req.params.cid,req.userId);
   need(c.role,['owner','finance']);
   if(c.status==='closed')throw bad(409,'Closed campaign cannot receive new reports');
   // Row-level lock serializes concurrent receipt reports for this one pledge.
   const p=(await db.query(
    "SELECT * FROM cc_finance_events WHERE id=$1 AND campaign_id=$2 AND organization_id=$3 AND event_kind='pledge' FOR UPDATE",
    [req.params.id,c.id,c.organization_id])).rows[0];
   if(!p)throw bad(404,'Pledge not found in this campaign');
   const previous=(await db.query(
    "SELECT r.id,r.amount,r.related_pledge_id,m.method,m.reference FROM cc_finance_events r JOIN cc_plus_manual_receipts m ON m.finance_event_id=r.id WHERE r.organization_id=$1 AND r.source_system='askan-plus-manual' AND r.source_event_key=$2",
    [c.organization_id,req.body.requestId])).rows[0];
   if(previous){
    if(previous.related_pledge_id!==p.id||cents(previous.amount)!==cents(amount)||previous.method!==method||previous.reference!==ref)
     throw bad(409,'Request ID already used for another report');
    result={id:previous.id,pledgeId:p.id,amount,method,idempotent:true,providerVerified:false};
   }else{
    const gross=(await db.query(
      "SELECT COALESCE(SUM(r.amount),0)::text total FROM cc_finance_events r WHERE r.related_pledge_id=$1 AND r.campaign_id=$2 AND r.organization_id=$3 AND r.event_kind='receipt'",
      [p.id,c.id,c.organization_id])).rows[0].total;
    const reversed=(await db.query(
      "SELECT COALESCE(SUM(f.amount),0)::text total FROM cc_finance_events f JOIN cc_finance_events r ON r.id=f.related_finance_event_id WHERE r.related_pledge_id=$1 AND f.campaign_id=$2 AND f.organization_id=$3 AND f.event_kind='refund'",
      [p.id,c.id,c.organization_id])).rows[0].total;
    const remaining=cents(p.amount)-cents(gross)+cents(reversed);
    if(cents(amount)>remaining)throw bad(409,'Reported amount exceeds pledge balance');
    const event=(await db.query(
      "INSERT INTO cc_finance_events(organization_id,campaign_id,credited_member_subject,source_system,source_event_key,event_kind,amount,currency,related_pledge_id,verified_at,verification_reference) VALUES($1,$2,$3,'askan-plus-manual',$4,'receipt',$5,$6,$7,NULL,NULL) RETURNING id",
      [c.organization_id,c.id,p.credited_member_subject,req.body.requestId,amount,p.currency,p.id])).rows[0];
    await db.query(
      'INSERT INTO cc_plus_manual_receipts(finance_event_id,organization_id,campaign_id,pledge_event_id,method,reference,reported_by) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [event.id,c.organization_id,c.id,p.id,method,ref,req.userId]);
    await log(db,c.organization_id,c.id,req.userId,'finance.partial_receipt_reported',event.id,
     {pledgeId:p.id,amount,method,manual:true,providerVerified:false});
    result={id:event.id,pledgeId:p.id,amount,method,idempotent:false,providerVerified:false};
   }
   await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  res.status(result.idempotent?200:201).json(result);
 }));
 return router;
}
