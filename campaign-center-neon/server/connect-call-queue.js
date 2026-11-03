import {Router} from 'express';

/**
 * Olam Chesed MAX gets ONLY explicit Campaign Center memberships and their
 * team-scoped shared donor queue. No caller-ID auth, no private donor export.
 * Server-to-server authentication is inherited from connectServiceRouter.
 */
export function installConnectCallQueue(router,{pool,linked,campaign,bad,uuid,log}){
 const run=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const authorized=async(db,gavhahUserId,campaignId)=>{
   const subject=await linked(db,Number(gavhahUserId));
   const c=await campaign(db,subject,campaignId);
   const m=(await db.query(
    "SELECT cm.team_name,m.role FROM cc_campaign_members cm "+
    "JOIN cc_memberships m ON m.organization_id=cm.organization_id AND m.subject=cm.subject AND m.membership_status='active' "+
    "WHERE cm.campaign_id=$1 AND cm.organization_id=$2 AND cm.subject=$3",
    [c.id,c.organization_id,subject])).rows[0];
   if(!m||!['owner','manager','squad_leader','askan'].includes(m.role))
     throw bad(403,'Active joined campaign calling membership required');
   if(c.status&&c.status!=='active')throw bad(409,'Campaign is not active');
   return {subject,c,team:m.team_name||'',manager:['owner','manager'].includes(m.role)};
 };
 const queueRows=(db,a,limit=80)=>db.query(
   "SELECT t.id,t.display_name,t.phone,t.status,t.next_followup_at,t.assigned_team,"+
   "t.claimed_by,t.claim_expires_at "+
   "FROM cc_contacts t WHERE t.organization_id=$1 AND t.campaign_id=$2 "+
   "AND t.privacy='campaign' AND t.do_not_call=false AND length(t.phone)>=10 "+
   "AND (t.assigned_member_subject=$5 OR (t.assigned_member_subject IS NULL AND ($3::boolean OR t.assigned_team=$4))) "+
   "ORDER BY (t.next_followup_at IS NOT NULL AND t.next_followup_at<=now()) DESC,"+
   "t.next_followup_at ASC NULLS LAST,t.created_at ASC LIMIT $6",
   [a.c.organization_id,a.c.id,a.manager,a.team,a.subject,limit]);
 const publicRow=(r,subject)=>({
   id:r.id,displayName:r.display_name,phone:r.phone,status:r.status,
   dueAt:r.next_followup_at||null,
   claimedByMe:r.claimed_by===subject&&new Date(r.claim_expires_at).getTime()>Date.now(),
   temporarilyBusy:!!r.claimed_by&&r.claimed_by!==subject&&new Date(r.claim_expires_at).getTime()>Date.now()
 });
 router.get('/call-queue/campaigns',run(async(req,res)=>{
   const gavhahUserId=Number(req.query.gavhahUserId);
   const subject=await linked(pool,gavhahUserId);
   const r=await pool.query(
    "SELECT c.id,c.title,c.status,cm.team_name,m.role "+
    "FROM cc_campaign_members cm "+
    "JOIN cc_campaigns c ON c.id=cm.campaign_id AND c.organization_id=cm.organization_id "+
    "JOIN cc_memberships m ON m.organization_id=cm.organization_id AND m.subject=cm.subject "+
    "WHERE cm.subject=$1 AND m.membership_status='active' AND c.status='active' "+
    "AND m.role IN ('owner','manager','squad_leader','askan') "+
    "ORDER BY c.created_at DESC LIMIT 100",[subject]);
   res.set('Cache-Control','private,no-store').json({eligible:r.rowCount>0,campaigns:r.rows});
 }));
 router.get('/call-queue',run(async(req,res)=>{
   const a=await authorized(pool,req.query.gavhahUserId,req.query.campaignId);
   const r=await queueRows(pool,a);
   res.set('Cache-Control','private,no-store').json({
    campaignId:a.c.id,campaignTitle:a.c.title,
    calls:r.rows.map(row=>publicRow(row,a.subject)),maxCallParticipants:3
   });
 }));
 router.post('/call-queue/next',run(async(req,res)=>{
   const gavhahUserId=Number(req.body?.gavhahUserId);
   const campaignId=req.body?.campaignId;
   const result=await (async()=>{
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      const a=await authorized(db,gavhahUserId,campaignId);
      // Enforce one active claim per member per campaign. Repeated clicks are idempotent.
      const mine=(await db.query(
        "SELECT id,display_name,phone,status,next_followup_at,assigned_team,claimed_by,claim_expires_at "+
        "FROM cc_contacts WHERE campaign_id=$1 AND organization_id=$2 AND privacy='campaign' "+
        "AND claimed_by=$3 AND claim_expires_at>now() AND do_not_call=false "+
        "ORDER BY claim_expires_at DESC LIMIT 1 FOR UPDATE",
        [a.c.id,a.c.organization_id,a.subject])).rows[0];
      if(mine){await db.query('COMMIT');return {call:publicRow(mine,a.subject),reused:true,campaignId:a.c.id};}
      // Atomic SKIP LOCKED claim; no simultaneous double dial.
      const row=(await db.query(
       "SELECT id FROM cc_contacts WHERE organization_id=$1 AND campaign_id=$2 "+
       "AND privacy='campaign' AND do_not_call=false AND length(phone)>=10 "+
       "AND (assigned_member_subject=$5 OR (assigned_member_subject IS NULL AND ($3::boolean OR assigned_team=$4))) "+
       "AND (claimed_by IS NULL OR claim_expires_at IS NULL OR claim_expires_at<=now()) "+
       "AND status NOT IN ('do_not_call','closed','completed') "+
       "ORDER BY (next_followup_at IS NOT NULL AND next_followup_at<=now()) DESC,"+
       "next_followup_at ASC NULLS LAST,created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED",
       [a.c.organization_id,a.c.id,a.manager,a.team,a.subject])).rows[0];
      if(!row){await db.query('COMMIT');return {call:null,reused:false,campaignId:a.c.id};}
      const saved=(await db.query(
       "UPDATE cc_contacts SET claimed_by=$1,claim_expires_at=now()+interval '20 minutes' "+
       "WHERE id=$2 RETURNING id,display_name,phone,status,next_followup_at,assigned_team,claimed_by,claim_expires_at",
       [a.subject,row.id])).rows[0];
      await log(db,a.c.organization_id,a.c.id,a.subject,'connect.call_claimed',row.id,{source:'max'});
      await db.query('COMMIT');
      return {call:publicRow(saved,a.subject),reused:false,campaignId:a.c.id};
    }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
   })();
   res.set('Cache-Control','no-store').json(result);
 }));
 router.post('/call-queue/:id/authorize-dial',run(async(req,res)=>{
   if(!uuid(req.params.id))throw bad(400,'Invalid campaign contact');
   const a=await authorized(pool,req.body?.gavhahUserId,req.body?.campaignId);
   const row=(await pool.query(
     "SELECT id,phone,do_not_call,claimed_by,claim_expires_at,assigned_member_subject,assigned_team "+
     "FROM cc_contacts WHERE id=$1 AND campaign_id=$2 AND organization_id=$3 AND privacy='campaign' "+
     "AND do_not_call=false AND claimed_by=$4 AND claim_expires_at>now() AND "+
     "(assigned_member_subject=$4 OR (assigned_member_subject IS NULL AND ($5::boolean OR assigned_team=$6)))",
     [req.params.id,a.c.id,a.c.organization_id,a.subject,a.manager,a.team])).rows[0];
   if(!row)throw bad(409,'Claim expired, reassigned, or Do Not Call; outbound permission revoked');
   res.set('Cache-Control','no-store').json({authorized:true,campaignId:a.c.id,
     contactId:row.id,phone:row.phone,leaseExpiresAt:row.claim_expires_at});
 }));
 router.post('/call-queue/:id/release',run(async(req,res)=>{
   if(!uuid(req.params.id))throw bad(400,'Invalid contact');
   const db=await pool.connect();
   try{
    await db.query('BEGIN');
    const a=await authorized(db,req.body?.gavhahUserId,req.body?.campaignId);
    const item=(await db.query(
     "SELECT id FROM cc_contacts WHERE id=$1 AND campaign_id=$2 AND organization_id=$3 "+
     "AND claimed_by=$4 AND claim_expires_at>now() FOR UPDATE",
     [req.params.id,a.c.id,a.c.organization_id,a.subject])).rows[0];
    if(!item)throw bad(409,'Not your active contact claim');
    await db.query("UPDATE cc_contacts SET claimed_by=NULL,claim_expires_at=NULL WHERE id=$1",[item.id]);
    await log(db,a.c.organization_id,a.c.id,a.subject,'connect.call_released',item.id,{source:'max'});
    await db.query('COMMIT');
    res.json({released:true});
   }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }));
 router.post('/call-queue/:id/result',run(async(req,res)=>{
   if(!uuid(req.params.id))throw bad(400,'Invalid contact');
   const allowed=['no_answer','spoke','callback','pledged','paid','not_interested','do_not_call'];
   const outcome=req.body?.outcome;
   if(!allowed.includes(outcome))throw bad(400,'Invalid call result');
   const note=typeof req.body?.note==='string'?req.body.note.trim().slice(0,2000):'';
   const db=await pool.connect();
   try{
    await db.query('BEGIN');
    const a=await authorized(db,req.body?.gavhahUserId,req.body?.campaignId);
    const item=(await db.query(
     "SELECT * FROM cc_contacts WHERE id=$1 AND campaign_id=$2 AND organization_id=$3 "+
     "AND claimed_by=$4 AND claim_expires_at>now() FOR UPDATE",
     [req.params.id,a.c.id,a.c.organization_id,a.subject])).rows[0];
    if(!item||item.do_not_call)throw bad(409,'No active safe contact claim');
    // This is a MANUAL result, never a provider-verified completed call.
    const event=(await db.query(
     "INSERT INTO cc_call_events(organization_id,campaign_id,contact_id,member_subject,outcome,note) "+
     "VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
     [a.c.organization_id,a.c.id,item.id,a.subject,outcome,note])).rows[0];
    await db.query(
     "UPDATE cc_contacts SET claimed_by=NULL,claim_expires_at=NULL,"+
     "do_not_call=CASE WHEN $2='do_not_call' THEN true ELSE do_not_call END,"+
     "status=CASE WHEN $2='do_not_call' THEN 'do_not_call' ELSE status END WHERE id=$1",
     [item.id,outcome]);
    await log(db,a.c.organization_id,a.c.id,a.subject,'connect.manual_call_result',event.id,{contactId:item.id,outcome});
    await db.query('COMMIT');
    res.status(201).json({saved:true,manual:true,contactId:item.id,eventId:event.id,outcome});
   }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }));
}
