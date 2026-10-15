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
  if(campaignId&&['manager','finance','auditor'].includes(role))throw bad(400,'Elevated roles are organization-wide; choose an organization invitation, not one campaign');
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
 async function checkLeadTeam(db,c,subject,assignedTeam){
  if(['owner','manager'].includes(c.role))return;
  const r=await db.query('SELECT team_name FROM cc_campaign_members WHERE campaign_id=$1 AND subject=$2',[c.id,subject]);
  if(!r.rowCount||r.rows[0].team_name!==assignedTeam)throw bad(404,'Contact not assigned to your team');
 }
 router.patch('/campaigns/:cid/members/:subject/team',run(async(req,res)=>{
  const team=trim(req.body?.teamName,64);
  if(team.length>64)throw bad(400,'Invalid team');
  const result=await tx(async db=>{
   const c=await campaignAccess(db,req.params.cid,req.userId);need(c.role,['owner','manager']);
   const row=(await db.query('UPDATE cc_campaign_members SET team_name=$1 WHERE campaign_id=$2 AND subject=$3 RETURNING subject,team_name',[team,c.id,req.params.subject])).rows[0];
   if(!row)throw bad(404,'Campaign member not found');
   await log(db,c.organization_id,c.id,req.userId,'team.member_assigned',null,{subject:req.params.subject,team});
   return row;
  });res.json(result);
 }));
 router.patch('/campaigns/:cid/contacts/:id/team',run(async(req,res)=>{
  if(!uuid(req.params.id))throw bad(400,'Invalid contact');
  const team=trim(req.body?.teamName,64);
  const result=await tx(async db=>{
   const c=await campaignAccess(db,req.params.cid,req.userId);need(c.role,['owner','manager']);
   const found=(await db.query('SELECT * FROM cc_contacts WHERE id=$1 AND campaign_id=$2 FOR UPDATE',[req.params.id,c.id])).rows[0];
   if(!found||found.privacy!=='campaign')throw bad(404,'Shared contact not found');
   if(found.claimed_by&&new Date(found.claim_expires_at).getTime()>Date.now())throw bad(409,'Wait until the current claim is released');
   if(team){
    const valid=await db.query("SELECT 1 FROM cc_campaign_members cm JOIN cc_memberships m ON m.organization_id=cm.organization_id AND m.subject=cm.subject AND m.membership_status='active' WHERE cm.campaign_id=$1 AND cm.team_name=$2 LIMIT 1",[c.id,team]);
    if(!valid.rowCount)throw bad(400,'Assign an active member to this team first');
   }
   const row=(await db.query('UPDATE cc_contacts SET assigned_team=$1 WHERE id=$2 RETURNING id,assigned_team',[team,found.id])).rows[0];
   await log(db,c.organization_id,c.id,req.userId,'contact.assigned_team',row.id,{from:found.assigned_team,to:team});
   return row;
  });res.json(result);
 }));
 router.get('/campaigns/:cid/assignees',run(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);
  need(c.role,['owner','manager','squad_leader','askan']);
  const elevated=['owner','manager'].includes(c.role);
  const squad=c.role==='squad_leader';
  const q=await pool.query("SELECT cm.subject,cm.team_name,m.role FROM cc_campaign_members cm JOIN cc_memberships m ON m.organization_id=cm.organization_id AND m.subject=cm.subject AND m.membership_status='active' WHERE cm.campaign_id=$1 AND ($2::boolean OR ($3::boolean AND cm.team_name=(SELECT team_name FROM cc_campaign_members WHERE campaign_id=$1 AND subject=$4)) OR cm.subject=$4) ORDER BY cm.team_name,cm.subject",[c.id,elevated,squad,req.userId]);
  res.json(q.rows);
 }));
 router.get('/campaigns/:cid/lead-queue',run(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);need(c.role,['owner','manager','squad_leader','askan']);
  const isManager=['owner','manager'].includes(c.role);
  const r=await pool.query("SELECT id,display_name,phone,do_not_call,status,assigned_team,claimed_by,claim_expires_at FROM cc_contacts WHERE campaign_id=$1 AND organization_id=$2 AND privacy='campaign' AND ($3::boolean OR assigned_team=(SELECT team_name FROM cc_campaign_members WHERE campaign_id=$1 AND subject=$4)) ORDER BY created_at DESC LIMIT 200",
    [c.id,c.organization_id,isManager,req.userId]);
  res.json(r.rows);
 }));
 router.post('/contacts/:id/claim',run(async(req,res)=>{
  if(!uuid(req.params.id))throw bad(400,'Invalid contact');
  const r=await tx(async db=>{
   const lead=(await db.query('SELECT * FROM cc_contacts WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(!lead||lead.privacy!=='campaign')throw bad(404,'Shared contact missing');
   const c=await campaignAccess(db,lead.campaign_id,req.userId);need(c.role,['owner','manager','squad_leader','askan']);
   await checkLeadTeam(db,c,req.userId,lead.assigned_team);
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
   await checkLeadTeam(db,c,req.userId,lead.assigned_team);
   if(lead.claimed_by!==req.userId)need(c.role,['owner','manager']);
   const found=(await db.query('UPDATE cc_contacts SET claimed_by=NULL,claim_expires_at=NULL WHERE id=$1 RETURNING id,claimed_by',[lead.id])).rows[0];
   await log(db,c.organization_id,c.id,req.userId,'lead.released',lead.id);return found;
  });res.json(r);
 }));

 router.get('/campaigns/:cid/activity',run(async(req,res)=>{
   const c=await campaignAccess(pool,req.params.cid,req.userId);
   const all=['owner','manager','auditor'].includes(c.role);
   const offset=Number(req.query.offset||0);
   if(!Number.isSafeInteger(offset)||offset<0||offset>100000)throw bad(400,'Invalid activity offset');
   const r=await pool.query(
    'SELECT id,actor_subject,event_type,target_id,details,created_at FROM cc_activity_events WHERE campaign_id=$1 AND organization_id=$2 AND ($3::boolean OR actor_subject=$4) ORDER BY created_at DESC,id DESC LIMIT 200 OFFSET $5',
    [c.id,c.organization_id,all,req.userId,offset]
   );
   res.json({events:r.rows,nextOffset:r.rowCount===200?offset+200:null,scope:all?'campaign':'personal'});
 }));
 router.get('/campaigns/:cid/contacts.csv',run(async(req,res)=>{
   const c=await campaignAccess(pool,req.params.cid,req.userId);
   if(!['owner','manager','finance','auditor','squad_leader','askan'].includes(c.role))
     throw bad(403,'Not permitted to export contacts');
   const all=['owner','manager','finance','auditor'].includes(c.role);
   const page=Number(req.query.page||1);
   if(!Number.isSafeInteger(page)||page<1||page>10000)throw bad(400,'Invalid export page');
   const size=1000;
   const r=await pool.query(
    "SELECT id,display_name,phone,status,do_not_call,privacy,assigned_team,created_at,CASE WHEN created_by=$3 THEN notes ELSE '' END notes FROM cc_contacts WHERE campaign_id=$1 AND organization_id=$2 AND ((privacy='private' AND created_by=$3) OR (privacy='campaign' AND ($4::boolean OR (assigned_team<>'' AND assigned_team=(SELECT team_name FROM cc_campaign_members WHERE campaign_id=$1 AND subject=$3)) OR (assigned_team='' AND created_by=$3)))) ORDER BY created_at,id LIMIT $5 OFFSET $6",
    [c.id,c.organization_id,req.userId,all,size+1,(page-1)*size]
   );
   const rows=r.rows.slice(0,size);
   const safe=value=>{
      const raw=String(value??'');
      const sanitized=/^\s*[=+\-@\t\r]/.test(raw)?"'"+raw:raw;
      return '"'+sanitized.replaceAll('"','""').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'')+'"';
   };
   const fields=['id','display_name','phone','status','do_not_call','privacy','assigned_team','created_at','notes'];
   const lines=[fields.map(safe).join(','),...rows.map(row=>fields.map(key=>safe(row[key])).join(','))];
   res.setHeader('Content-Type','text/csv; charset=utf-8');
   res.setHeader('Content-Disposition','attachment; filename="campaign-contacts-'+c.id+'-page-'+page+'.csv"');
   res.setHeader('Cache-Control','no-store');
   res.setHeader('X-Export-Has-More',r.rowCount>size?'true':'false');
   res.send('\uFEFF'+lines.join('\r\n')+'\r\n');
 }));
 router.get('/campaigns/:cid/manager-overview',run(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);need(c.role,['owner','manager','finance','auditor']);
  const [financial,members,leads,tasks]=await Promise.all([
   pool.query("SELECT COALESCE(SUM(amount) FILTER (WHERE event_kind='pledge'),0)::text promised, (COALESCE(SUM(amount) FILTER (WHERE event_kind='receipt' AND verified_at IS NULL),0)-COALESCE(SUM(amount) FILTER (WHERE event_kind='refund'),0))::text net_manual_received, COALESCE(SUM(amount) FILTER (WHERE event_kind='refund'),0)::text refunded, COALESCE(SUM(amount) FILTER (WHERE event_kind='receipt' AND verified_at IS NOT NULL),0)::text treasurer_confirmed FROM cc_finance_events WHERE campaign_id=$1 AND organization_id=$2",[c.id,c.organization_id]),
   pool.query("SELECT m.subject,m.role,cm.team_name FROM cc_campaign_members cm JOIN cc_memberships m ON m.organization_id=cm.organization_id AND m.subject=cm.subject AND m.membership_status='active' WHERE cm.campaign_id=$1",[c.id]),
   pool.query("SELECT COUNT(*)::int total, COUNT(*) FILTER(WHERE claimed_by IS NOT NULL AND claim_expires_at>now())::int claimed FROM cc_contacts WHERE campaign_id=$1 AND privacy='campaign'",[c.id]),
   pool.query('SELECT status,COUNT(*)::int total FROM cc_assignments WHERE campaign_id=$1 GROUP BY status',[c.id])
  ]);
  res.json({campaign:{id:c.id,title:c.title,goalAmount:c.goal_amount},financial:financial.rows[0],members:members.rows,leads:leads.rows[0],tasks:tasks.rows});
 }));
 return router;
}
