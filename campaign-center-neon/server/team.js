import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';

// The caller has a verified Neon Auth session; all authorization is DB-backed.
export default function teamRouter({pool,authenticate,member,campaignAccess,need,log,bad,uuid,trim}) {
 const router=Router(); router.use(authenticate);
 const digest=s=>createHash('sha256').update(s).digest('hex');
 const run=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 async function tx(fn){const db=await pool.connect();try{await db.query('BEGIN');const result=await fn(db);await db.query('COMMIT');return result;}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
 router.get('/organizations/:oid/members',run(async(req,res)=>{
  need(await member(pool,req.params.oid,req.userId),['owner','manager']);
  const r=await pool.query('SELECT subject,role,membership_status,joined_at FROM cc_memberships WHERE organization_id=$1 ORDER BY joined_at DESC NULLS LAST',[req.params.oid]);
  res.json(r.rows);
 }));
 router.post('/organizations/:oid/invitations',run(async(req,res)=>{
  const role=trim(req.body?.role,20),campaignId=req.body?.campaignId||null;
  if(!['manager','squad_leader','askan','finance','auditor'].includes(role)||(campaignId&&!uuid(campaignId)))throw bad(400,'Invalid invite');
  const secret=randomBytes(24).toString('base64url');
  const invited=await tx(async db=>{
   const caller=await member(db,req.params.oid,req.userId);need(caller,['owner','manager']);
   if(caller!=='owner'&&['manager','finance','auditor'].includes(role))throw bad(403,'Owner must approve elevated role');
   if(campaignId){const found=await db.query('SELECT 1 FROM cc_campaigns WHERE id=$1 AND organization_id=$2',[campaignId,req.params.oid]);if(!found.rowCount)throw bad(404,'Campaign not found');}
   const inv=(await db.query("INSERT INTO cc_team_invites(organization_id,campaign_id,code_hash,invited_role,issued_by,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '48 hours') RETURNING id,expires_at",[req.params.oid,campaignId,digest(secret),role,req.userId])).rows[0];
   await log(db,req.params.oid,campaignId,req.userId,'invite.created',inv.id,{role});return inv;
  });
  res.status(201).json({...invited,invitationCode:secret});
 }));
 router.post('/invitations/redeem',run(async(req,res)=>{
  const code=trim(req.body?.invitationCode,100);
  if(!/^[a-zA-Z0-9_-]{32}$/.test(code))throw bad(400,'Invalid invitation');
  const result=await tx(async db=>{
   const inv=(await db.query('SELECT * FROM cc_team_invites WHERE code_hash=$1 FOR UPDATE',[digest(code)])).rows[0];
   if(!inv||inv.claimed_at||new Date(inv.expires_at).getTime()<Date.now())throw bad(404,'Invitation is expired');
   const prior=(await db.query('SELECT role,membership_status FROM cc_memberships WHERE organization_id=$1 AND subject=$2 FOR UPDATE',[inv.organization_id,req.userId])).rows[0];
   if(prior&&prior.membership_status!=='active')throw bad(403,'Member suspended or revoked');
   if(!prior)await db.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at) VALUES($1,$2,$3,'active',now())",[inv.organization_id,req.userId,inv.invited_role]);
   if(inv.campaign_id)await db.query('INSERT INTO cc_campaign_members(organization_id,campaign_id,subject) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[inv.organization_id,inv.campaign_id,req.userId]);
   await db.query('UPDATE cc_team_invites SET claimed_by=$1,claimed_at=now() WHERE id=$2',[req.userId,inv.id]);
   await log(db,inv.organization_id,inv.campaign_id,req.userId,'invite.redeemed',inv.id,{role:prior?.role||inv.invited_role});
   return {organizationId:inv.organization_id,campaignId:inv.campaign_id,role:prior?.role||inv.invited_role};
  });res.json(result);
 }));
 router.patch('/organizations/:oid/members/:subject',run(async(req,res)=>{
  const status=trim(req.body?.status,20),role=trim(req.body?.role,20);
  if((status&&!['active','suspended','revoked'].includes(status))||(role&&!['manager','squad_leader','askan','finance','auditor'].includes(role))||(!role&&!status))
   throw bad(400,'Invalid member update');
  const result=await tx(async db=>{
   const caller=await member(db,req.params.oid,req.userId);need(caller,['owner','manager']);
   if(req.userId===req.params.subject)throw bad(403,'Cannot update your own access');
   const prior=(await db.query('SELECT * FROM cc_memberships WHERE organization_id=$1 AND subject=$2 FOR UPDATE',[req.params.oid,req.params.subject])).rows[0];
   if(!prior)throw bad(404,'Member missing');
   if(prior.role==='owner')throw bad(403,'Owner cannot be suspended');
   if(caller!=='owner'&&['manager','finance','auditor'].some(r=>r===role||r===prior.role))throw bad(403,'Owner permission required');
   const r=(await db.query('UPDATE cc_memberships SET role=COALESCE($1,role),membership_status=COALESCE($2,membership_status),updated_at=now() WHERE organization_id=$3 AND subject=$4 RETURNING subject,role,membership_status',[role||null,status||null,req.params.oid,req.params.subject])).rows[0];
   await log(db,req.params.oid,null,req.userId,'member.updated',null,{subject:r.subject,before:prior.role,after:r.role,status:r.membership_status});
   return r;
  });res.json(result);
 }));
 router.get('/campaigns/:cid/lead-queue',run(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);need(c.role,['owner','manager','squad_leader','askan']);
  const r=await pool.query("SELECT id,display_name,phone,do_not_call,status,claimed_by,claim_expires_at FROM cc_contacts WHERE campaign_id=$1 AND organization_id=$2 AND privacy='campaign' ORDER BY created_at DESC LIMIT 200",[c.id,c.organization_id]);
  res.json(r.rows);
 }));
 router.post('/contacts/:id/claim',run(async(req,res)=>{
  if(!uuid(req.params.id))throw bad(400,'Invalid contact');
  const r=await tx(async db=>{
   const lead=(await db.query('SELECT * FROM cc_contacts WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(!lead||lead.privacy!=='campaign')throw bad(404,'Shared contact missing');
   const c=await campaignAccess(db,lead.campaign_id,req.userId);need(c.role,['owner','manager','squad_leader','askan']);
   if(lead.do_not_call)throw bad(409,'Do not call');
   if(lead.claimed_by&&lead.claimed_by!==req.userId&&new Date(lead.claim_expires_at).getTime()>Date.now())throw bad(409,'Another member currently claims this contact');
   const found=(await db.query("UPDATE cc_contacts SET claimed_by=$1,claim_expires_at=now()+interval '20 minutes' WHERE id=$2 RETURNING id,claimed_by,claim_expires_at",[req.userId,lead.id])).rows[0];
   await log(db,c.organization_id,c.id,req.userId,'lead.claimed',lead.id);return found;
  });res.json(r);
 }));
 router.post('/contacts/:id/release',run(async(req,res)=>{
  if(!uuid(req.params.id))throw bad(400,'Invalid contact');
  const r=await tx(async db=>{
   const lead=(await db.query('SELECT * FROM cc_contacts WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(!lead||lead.privacy!=='campaign')throw bad(404,'Shared contact missing');
   const c=await campaignAccess(db,lead.campaign_id,req.userId);
   if(lead.claimed_by!==req.userId)need(c.role,['owner','manager']);
   const found=(await db.query('UPDATE cc_contacts SET claimed_by=NULL,claim_expires_at=NULL WHERE id=$1 RETURNING id,claimed_by',[lead.id])).rows[0];
   await log(db,c.organization_id,c.id,req.userId,'lead.released',lead.id);return found;
  });res.json(r);
 }));
 router.get('/campaigns/:cid/manager-overview',run(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);need(c.role,['owner','manager','finance','auditor']);
  const [financial,members,leads,tasks]=await Promise.all([
   pool.query("SELECT COALESCE(SUM(amount) FILTER (WHERE event_kind='pledge'),0)::text promised, COALESCE(SUM(amount) FILTER (WHERE event_kind='receipt' AND verified_at IS NULL),0)::text manually_reported, COALESCE(SUM(amount) FILTER (WHERE event_kind='receipt' AND verified_at IS NOT NULL),0)::text verified_received FROM cc_finance_events WHERE campaign_id=$1 AND organization_id=$2",[c.id,c.organization_id]),
   pool.query("SELECT m.subject,m.role FROM cc_campaign_members cm JOIN cc_memberships m ON m.organization_id=cm.organization_id AND m.subject=cm.subject AND m.membership_status='active' WHERE cm.campaign_id=$1",[c.id]),
   pool.query("SELECT COUNT(*)::int total, COUNT(*) FILTER(WHERE claimed_by IS NOT NULL AND claim_expires_at>now())::int claimed FROM cc_contacts WHERE campaign_id=$1 AND privacy='campaign'",[c.id]),
   pool.query('SELECT status,COUNT(*)::int total FROM cc_assignments WHERE campaign_id=$1 GROUP BY status',[c.id])
  ]);
  res.json({campaign:{id:c.id,title:c.title,goalAmount:c.goal_amount},financial:financial.rows[0],members:members.rows,leads:leads.rows[0],tasks:tasks.rows});
 }));
 return router;
}
