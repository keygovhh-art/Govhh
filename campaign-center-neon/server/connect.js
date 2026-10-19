import { Router } from 'express';
import { randomBytes,createHash,timingSafeEqual } from 'node:crypto';

const digest=s=>createHash('sha256').update(s).digest('hex');
const code=()=>randomBytes(24).toString('base64url');
const pass=(provided,secret)=>typeof provided==='string'&&typeof secret==='string'&&secret.length>=32
 &&Buffer.byteLength(provided)===Buffer.byteLength(secret)
 &&timingSafeEqual(Buffer.from(provided),Buffer.from(secret));
const money=v=>typeof v==='string'&&/^(?:0|[1-9]\d{0,11})\.\d{2}$/.test(v)&&Number(v)>0;
const numericUser=v=>Number.isSafeInteger(v)&&v>0;
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const transaction=async(pool,fn)=>{
 const db=await pool.connect();try{await db.query('BEGIN');const result=await fn(db);await db.query('COMMIT');return result;}
 catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
};
// Only one owner-signed action links two separate authentication systems.
// A MAX user may never link by matching their email/phone with an org roster.
export function connectUserRouter({pool,authenticate,log,bad}) {
 const router=Router();router.use(authenticate);
 router.post('/code',wrap(async(req,res)=>{
  const result=await transaction(pool,async db=>{
   const prior=await db.query("SELECT COUNT(*)::int AS count FROM cc_connect_codes WHERE subject=$1 AND created_at>now()-interval '1 hour'",[req.userId]);
   if(prior.rows[0].count>=5)throw bad(429,'Please wait before requesting another link code');
   const raw=code();
   await db.query("INSERT INTO cc_connect_codes(code_hash,subject,expires_at) VALUES($1,$2,now()+interval '10 minutes')",[digest(raw),req.userId]);
   return {code:raw,expiresInMinutes:10};
  });
  res.status(201).json(result);
 }));
 router.get('/status',wrap(async(req,res)=>{
  const r=await pool.query("SELECT external_system,linked_at FROM cc_external_account_links WHERE subject=$1 AND revoked_at IS NULL",[req.userId]);
  res.json({linked:r.rowCount>0,connections:r.rows});
 }));
 // Read-only leadership summary; accounts in other organizations and all
 // personal MAX records remain unavailable. A count is NOT remote health.
 router.get('/organizations/:oid/overview',wrap(async(req,res)=>{
  const oid=req.params.oid;
  if(typeof oid!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(oid))
   throw bad(400,'Invalid organization');
  const role=(await pool.query(
   "SELECT role FROM cc_memberships WHERE organization_id=$1 AND subject=$2"+
   " AND membership_status='active'",[oid,req.userId])).rows[0]?.role;
  if(!role)throw bad(404,'Organization not found');
  if(!['owner','manager'].includes(role))throw bad(403,'Leadership required');
  const [memberCounts,followups,finance]=await Promise.all([
   pool.query(
    "SELECT COUNT(*)::int active_members,"+
    " COUNT(*) FILTER(WHERE EXISTS(SELECT 1 FROM cc_external_account_links x"+
    " WHERE x.subject=m.subject AND x.external_system='gavhah_max'"+
    " AND x.revoked_at IS NULL))::int linked_members"+
    " FROM cc_memberships m WHERE m.organization_id=$1 AND m.membership_status='active'",
    [oid]),
   pool.query(
    "SELECT COUNT(*)::int shared_followup_links FROM cc_shared_followup_links"+
    " WHERE organization_id=$1",[oid]),
   pool.query(
    "SELECT COUNT(*)::int reported_finance_events FROM cc_finance_events"+
    " WHERE organization_id=$1 AND source_system='gavhah_max'",[oid])
  ]);
  const row=memberCounts.rows[0];
  res.set('Cache-Control','private,no-store');
  res.json({
   activeMembers:row.active_members,linkedMembers:row.linked_members,
   notLinkedMembers:row.active_members-row.linked_members,
   sharedFollowupLinks:followups.rows[0].shared_followup_links,
   reportedFinanceEvents:finance.rows[0].reported_finance_events,
   scope:'current_organization_leadership',countsOnly:true,
   financeReportsNotProcessorVerified:true,remoteHealthyNotImplied:true
  });
 }));
 router.post('/unlink',wrap(async(req,res)=>{
  await transaction(pool,async db=>{
   const r=await db.query("UPDATE cc_external_account_links SET revoked_at=now() WHERE subject=$1 AND external_system='gavhah_max' AND revoked_at IS NULL RETURNING id",[req.userId]);
   if(r.rowCount)await db.query("INSERT INTO cc_activity_events(organization_id,actor_subject,event_type,details) SELECT organization_id,$1,'connect.unlinked',$2 FROM cc_memberships WHERE subject=$1 AND membership_status='active'",[req.userId,JSON.stringify({source:'gavhah_max'})]);
  });
  res.json({unlinked:true});
 }));
 return router;
}
export function connectServiceRouter({pool,bad,uuid,log}) {
 const router=Router();
 router.use((req,res,next)=>{
  if(!pass(req.get('x-gavhah-connect-secret'),process.env.GAVHAH_CONNECT_SHARED_SECRET)){
   res.status(403).json({error:'Server-to-server connection is disabled or not authorized'});return;
  }
  next();
 });
 async function linked(db,gavhahUserId){
  if(!numericUser(gavhahUserId))throw bad(400,'Invalid external user');
  const r=await db.query("SELECT subject FROM cc_external_account_links WHERE external_system='gavhah_max' AND external_user_id=$1 AND revoked_at IS NULL",[gavhahUserId]);
  if(!r.rowCount)throw bad(403,'Accounts not yet explicitly linked');
  return r.rows[0].subject;
 }
 async function campaign(db,subject,campaignId){
  if(!uuid(campaignId))throw bad(400,'Invalid campaign');
  const r=await db.query("SELECT c.id,c.organization_id,c.title,m.role FROM cc_campaigns c JOIN cc_memberships m ON m.organization_id=c.organization_id AND m.subject=$2 AND m.membership_status='active' WHERE c.id=$1 AND (m.role IN ('owner','manager','finance','auditor') OR EXISTS (SELECT 1 FROM cc_campaign_members cm WHERE cm.campaign_id=c.id AND cm.subject=$2))",[campaignId,subject]);
  if(!r.rowCount)throw bad(403,'No active campaign membership');
  return r.rows[0];
 }
 // Real server-to-server handshake, not a claim that a member is linked.
 // The shared secret gate above is mandatory even for this minimal diagnostic.
 router.get('/capabilities',wrap(async(_req,res)=>{
  await pool.query('SELECT 1');
  res.set('Cache-Control','private,no-store');
  res.json({service:'campaign_center',protocol:'gavhah-connect-v1',
   connectedBackend:true,accountLinking:true,ownAssignments:true,
   memberStatusUpdates:true,manualFinanceShare:true,manualFinanceReversals:true,
   scopedSharedFollowups:true,scopedLiveRooms:true,
   personalDonorSync:false,automaticPhoneCalls:false,verifiedPaymentProcessor:false});
 }));
 router.post('/redeem',wrap(async(req,res)=>{
  const gavhahUserId=req.body?.gavhahUserId,raw=req.body?.code;
  if(!numericUser(gavhahUserId)||typeof raw!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(raw))throw bad(400,'Invalid link request');
  const result=await transaction(pool,async db=>{
   const found=(await db.query('SELECT * FROM cc_connect_codes WHERE code_hash=$1 FOR UPDATE',[digest(raw)])).rows[0];
   if(!found||found.redeemed_at||new Date(found.expires_at).getTime()<Date.now())throw bad(404,'Link code expired or used');
   const other=(await db.query("SELECT subject,external_user_id FROM cc_external_account_links WHERE revoked_at IS NULL AND ((subject=$1 AND external_system='gavhah_max') OR (external_user_id=$2 AND external_system='gavhah_max')) FOR UPDATE",[found.subject,gavhahUserId])).rows[0];
   if(other&&(other.subject!==found.subject||Number(other.external_user_id)!==gavhahUserId))throw bad(409,'Either account is already connected elsewhere');
   if(!other){
    // Re-link the same previously disconnected identity without conflicting
    // with historical UNIQUE constraints. Separate audit events keep the full timeline.
    const restored=await db.query("UPDATE cc_external_account_links SET revoked_at=NULL,linked_at=now() WHERE id=(SELECT id FROM cc_external_account_links WHERE subject=$1 AND external_system='gavhah_max' AND external_user_id=$2 AND revoked_at IS NOT NULL ORDER BY linked_at DESC LIMIT 1) RETURNING id",[found.subject,gavhahUserId]);
    if(!restored.rowCount)await db.query("INSERT INTO cc_external_account_links(subject,external_system,external_user_id) VALUES($1,'gavhah_max',$2)",[found.subject,gavhahUserId]);
   }
   await db.query('UPDATE cc_connect_codes SET redeemed_at=now() WHERE id=$1',[found.id]);
   // Activity log without storing code/secret/Gavhah private records.
   await db.query("INSERT INTO cc_activity_events(organization_id,actor_subject,event_type,details) SELECT organization_id,$1,'connect.linked',$2 FROM cc_memberships WHERE subject=$1 AND membership_status='active'",[found.subject,JSON.stringify({source:'gavhah_max'})]);
   return {linked:true};
  });
  res.json(result);
 }));
 router.post('/unlink',wrap(async(req,res)=>{
  const gavhahUserId=req.body?.gavhahUserId;
  if(!numericUser(gavhahUserId))throw bad(400,'Invalid user');
  const r=await pool.query("UPDATE cc_external_account_links SET revoked_at=now() WHERE external_system='gavhah_max' AND external_user_id=$1 AND revoked_at IS NULL RETURNING id",[gavhahUserId]);
  res.json({unlinked:r.rowCount>0});
 }));
 router.get('/campaigns',wrap(async(req,res)=>{
  const gavhahUserId=Number(req.query.gavhahUserId),subject=await linked(pool,gavhahUserId);
  const r=await pool.query("SELECT c.id,c.title,c.goal_amount,c.status,m.role FROM cc_campaigns c JOIN cc_memberships m ON m.organization_id=c.organization_id AND m.subject=$1 AND m.membership_status='active' WHERE m.role IN ('owner','manager','finance','auditor') OR EXISTS (SELECT 1 FROM cc_campaign_members cm WHERE cm.campaign_id=c.id AND cm.subject=$1) ORDER BY c.created_at DESC",[subject]);
  res.json({linked:true,campaigns:r.rows});
 }));
 // Personal MAX receives only its linked member's campaign event program,
 // NEVER a donor list or private call note. Joining still requires Neon Auth.
 router.get('/rooms',wrap(async(req,res)=>{
  const gavhahUserId=Number(req.query.gavhahUserId),campaignId=String(req.query.campaignId||'');
  const subject=await linked(pool,gavhahUserId);
  const c=await campaign(pool,subject,campaignId);
  const rows=await pool.query(
   "SELECT r.id,r.title,r.room_status,r.floor_mode,"+
   " (SELECT p.title FROM cc_floor_programs p WHERE p.room_id=r.id AND p.status='live' ORDER BY p.started_at DESC LIMIT 1) AS live_program,"+
   " (SELECT p.scheduled_start FROM cc_floor_programs p WHERE p.room_id=r.id AND p.status='scheduled' ORDER BY p.scheduled_start ASC LIMIT 1) AS next_program_at"+
   " FROM cc_live_rooms r WHERE r.campaign_id=$1 AND r.organization_id=$2 AND r.room_status IN('planned','open','paused') ORDER BY r.created_at DESC LIMIT 30",
   [c.id,c.organization_id]);
  res.set('Cache-Control','no-store');
  res.json({rooms:rows.rows,mode:'web_campaign_event_only'});
 }));
 router.get('/assignments',wrap(async(req,res)=>{
  const gavhahUserId=Number(req.query.gavhahUserId),campaignId=req.query.campaignId,subject=await linked(pool,gavhahUserId);
  const c=await campaign(pool,subject,campaignId);
  // The personal MAX workspace sees its own assignments, never another team member's.
  const r=await pool.query('SELECT id,title,kind,priority,status,due_at FROM cc_assignments WHERE campaign_id=$1 AND organization_id=$2 AND assignee_subject=$3 ORDER BY created_at DESC LIMIT 200',[c.id,c.organization_id,subject]);
  res.json(r.rows);
 }));
 router.post('/assignments/:id/status',wrap(async(req,res)=>{
  const {gavhahUserId,campaignId,status}=req.body||{};
  if(!uuid(req.params.id)||!numericUser(gavhahUserId)||!['open','in_progress','done'].includes(status))throw bad(400,'Invalid task update');
  const result=await transaction(pool,async db=>{
    const subject=await linked(db,gavhahUserId);
    const c=await campaign(db,subject,campaignId);
    const task=(await db.query('SELECT * FROM cc_assignments WHERE id=$1 AND campaign_id=$2 AND organization_id=$3 FOR UPDATE',
      [req.params.id,c.id,c.organization_id])).rows[0];
    if(!task||task.assignee_subject!==subject)throw bad(404,'This is not your assignment');
    if(task.status==='cancelled')throw bad(409,'Cancelled task cannot be updated in MAX');
    if(task.status===status)return {id:task.id,status:task.status,unchanged:true};
    const next=(await db.query('UPDATE cc_assignments SET status=$1 WHERE id=$2 RETURNING id,status',[status,task.id])).rows[0];
    await log(db,c.organization_id,c.id,subject,'connect.assignment_status',task.id,{from:task.status,to:status});
    return {id:next.id,status:next.status,unchanged:false};
  });
  res.json(result);
 }));
 router.post('/followups',wrap(async(req,res)=>{
  const {gavhahUserId,campaignId,followupId,shareScope}=req.body||{};
  if(!numericUser(gavhahUserId)||!numericUser(followupId)||!['campaign','assigned_managers'].includes(shareScope))throw bad(400,'Invalid shared follow-up');
  const result=await transaction(pool,async db=>{
   const subject=await linked(db,gavhahUserId);
   const c=await campaign(db,subject,campaignId);
   if(c.role==='auditor')throw bad(403,'Read-only role');
   // A foreign key ID reference, not a second copy of the follow-up's private body.
   const ref='gavhah_max:'+gavhahUserId+':'+followupId;
   const saved=await db.query("INSERT INTO cc_shared_followup_links(organization_id,campaign_id,member_subject,max_followup_ref,share_scope) VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id,campaign_id,max_followup_ref) DO NOTHING RETURNING id",[c.organization_id,c.id,subject,ref,shareScope]);
   if(saved.rowCount){
    await log(db,c.organization_id,c.id,subject,'connect.followup_linked',saved.rows[0].id,{source:'gavhah_max',followupRef:ref});
    return {id:saved.rows[0].id,duplicate:false};
   }
   const prior=(await db.query('SELECT id,member_subject,share_scope FROM cc_shared_followup_links WHERE organization_id=$1 AND campaign_id=$2 AND max_followup_ref=$3',[c.organization_id,c.id,ref])).rows[0];
   if(!prior||prior.member_subject!==subject||prior.share_scope!==shareScope)throw bad(409,'Conflicting link already exists');
   return {id:prior.id,duplicate:true};
  });
  res.status(result.duplicate?200:201).json(result);
 }));
 router.get('/followups',wrap(async(req,res)=>{
  const gavhahUserId=Number(req.query.gavhahUserId);
  const campaignId=String(req.query.campaignId||'');
  const subject=await linked(pool,gavhahUserId);
  const c=await campaign(pool,subject,campaignId);
  const r=await pool.query("SELECT id,max_followup_ref,share_scope,created_at FROM cc_shared_followup_links WHERE campaign_id=$1 AND member_subject=$2 ORDER BY created_at DESC LIMIT 200",[c.id,subject]);
  res.json(r.rows);
 }));
 router.post('/finance-reversals',wrap(async(req,res)=>{
  const {gavhahUserId,campaignId,originalReceiptId,refundId,amount}=req.body||{};
  if(!numericUser(gavhahUserId)||!numericUser(originalReceiptId)||!numericUser(refundId)||!money(amount))throw bad(400,'Invalid manual reversal');
  const result=await transaction(pool,async db=>{
   const subject=await linked(db,gavhahUserId);
   const c=await campaign(db,subject,campaignId);
   if(c.role==='auditor')throw bad(403,'Read only campaign role');
   const sourceEventKey='refund:'+refundId;
   const originalKey='receipt:'+originalReceiptId;
   const original=(await db.query("SELECT * FROM cc_finance_events WHERE source_system='gavhah_max' AND source_event_key=$1 AND campaign_id=$2 AND credited_member_subject=$3 AND event_kind='receipt' AND organization_id=$4 FOR UPDATE",[originalKey,c.id,subject,c.organization_id])).rows[0];
   if(!original)throw bad(409,'Original receipt was not explicitly shared with this campaign');
   const saved=await db.query("INSERT INTO cc_finance_events(organization_id,campaign_id,credited_member_subject,source_system,source_event_key,event_kind,amount,currency,related_finance_event_id) VALUES($1,$2,$3,'gavhah_max',$4,'refund',$5,'USD',$6) ON CONFLICT DO NOTHING RETURNING id",[c.organization_id,c.id,subject,sourceEventKey,amount,original.id]);
   if(!saved.rowCount){
    const prev=(await db.query("SELECT id,organization_id,campaign_id,credited_member_subject,event_kind,amount,related_finance_event_id FROM cc_finance_events WHERE source_system='gavhah_max' AND source_event_key=$1",[sourceEventKey])).rows[0];
    if(!prev||prev.organization_id!==c.organization_id||prev.campaign_id!==c.id||prev.credited_member_subject!==subject||prev.event_kind!=='refund'||prev.related_finance_event_id!==original.id||Number(prev.amount).toFixed(2)!==amount)
     throw bad(409,'Conflicting duplicate manual reversal');
    return {id:prev.id,duplicate:true,verification:'manually_reported'};
   }
   const sums=await db.query("SELECT COALESCE(SUM(amount),0)::text AS reversed FROM cc_finance_events WHERE related_finance_event_id=$1 AND event_kind='refund'",[original.id]);
   if(Number(sums.rows[0].reversed)>Number(original.amount))throw bad(409,'Reversal exceeds source receipt total');
   await log(db,c.organization_id,c.id,subject,'connect.manual_reversal',saved.rows[0].id,{originalFinanceEventId:original.id,sourceEventKey,verification:'manually_reported'});
   return {id:saved.rows[0].id,duplicate:false,verification:'manually_reported'};
  });
  res.status(result.duplicate?200:201).json(result);
 }));
 router.post('/finance-events',wrap(async(req,res)=>{
  const {gavhahUserId,campaignId,kind,amount,sourceEventKey}=req.body||{};
  if(!numericUser(gavhahUserId)||!['pledge','receipt'].includes(kind)||!money(amount)||typeof sourceEventKey!=='string'||!/^(?:pledge|receipt):[1-9]\d{0,15}$/.test(sourceEventKey))
    throw bad(400,'Invalid source finance event');
  const result=await transaction(pool,async db=>{
   const subject=await linked(db,gavhahUserId);
   const c=await campaign(db,subject,campaignId);
   if(['auditor'].includes(c.role))throw bad(403,'Read only role');
   const r=await db.query("INSERT INTO cc_finance_events(organization_id,campaign_id,credited_member_subject,source_system,source_event_key,event_kind,amount,currency,verified_at) VALUES($1,$2,$3,'gavhah_max',$4,$5,$6,'USD',NULL) ON CONFLICT DO NOTHING RETURNING *",[c.organization_id,c.id,subject,sourceEventKey,kind,amount]);
   if(!r.rowCount){
    const old=(await db.query("SELECT id,organization_id,campaign_id,credited_member_subject,event_kind,amount FROM cc_finance_events WHERE source_system='gavhah_max' AND source_event_key=$1",[sourceEventKey])).rows[0];
    if(!old||old.organization_id!==c.organization_id||old.campaign_id!==c.id||old.credited_member_subject!==subject||old.event_kind!==kind||Number(old.amount).toFixed(2)!==amount)throw bad(409,'Source event already attributed to a different campaign or with conflicting details');
    return {id:old.id,duplicate:true,verification:'manually_reported'};
   }
   await log(db,c.organization_id,c.id,subject,'connect.finance_reported',r.rows[0].id,{kind,sourceEventKey,verification:'manually_reported'});
   return {id:r.rows[0].id,duplicate:false,verification:'manually_reported'};
  });
  res.status(result.duplicate?200:201).json(result);
 }));
 return router;
}
