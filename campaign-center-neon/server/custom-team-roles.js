import {Router} from 'express';

// Custom-tier restrictive permission presets. These are NEVER super-admin roles.
export default function customTeamRolesRouter({pool,member,bad,uuid,log}){
 const router=Router(),wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const fields=['canViewLeadQueue','canClaimLeads','canExportSharedContacts'];
 async function guard(db,oid,user,ownerOnly=false){
  if(!uuid(oid))throw bad(400,'Invalid organization');
  const role=await member(db,oid,user);
  if(ownerOnly?role!=='owner':!['owner','manager'].includes(role))
   throw bad(403,'Organization leadership required');
 }
 async function tx(fn){
  const db=await pool.connect();
  try{await db.query('BEGIN');const val=await fn(db);await db.query('COMMIT');return val;}
  catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 router.get('/organizations/:oid/role-profiles',wrap(async(req,res)=>{
  await guard(pool,req.params.oid,req.userId);
  const [profiles,bound]=await Promise.all([
   pool.query(
    "SELECT id,title,can_view_lead_queue,can_claim_leads,can_export_shared_contacts,created_at"+
    " FROM cc_custom_team_permission_profiles WHERE organization_id=$1"+
    " ORDER BY created_at DESC LIMIT 60",[req.params.oid]),
   pool.query(
    "SELECT subject,profile_id FROM cc_custom_team_permission_bindings WHERE organization_id=$1",
    [req.params.oid])
  ]);
  res.set('Cache-Control','private,no-store').json({profiles:profiles.rows,
   assignments:bound.rows,restrictionOnly:true,neverElevatesPrivileges:true});
 }));
 router.post('/organizations/:oid/role-profiles',wrap(async(req,res)=>{
  const title=req.body?.title;
  if(typeof title!=='string'||!title.trim()||title.length>100)
   throw bad(400,'Invalid title');
  const flags=fields.map(x=>req.body?.[x]);
  if(flags.some(v=>typeof v!=='boolean'))
   throw bad(400,'Explicit permission choices required');
  const [view,claim,exp]=flags;
  if((claim||exp)&&!view)throw bad(400,'Lead reading required for claim and export');
  const result=await tx(async db=>{
   await guard(db,req.params.oid,req.userId,true);
   const count=await db.query('SELECT COUNT(*)::int n FROM cc_custom_team_permission_profiles WHERE organization_id=$1',[req.params.oid]);
   if(count.rows[0].n>=60)throw bad(409,'Profile limit reached');
   const row=(await db.query(
    "INSERT INTO cc_custom_team_permission_profiles(organization_id,title,can_view_lead_queue,"+
    " can_claim_leads,can_export_shared_contacts,created_by)"+
    " VALUES($1,$2,$3,$4,$5,$6) RETURNING id,title,can_view_lead_queue,can_claim_leads,can_export_shared_contacts",
    [req.params.oid,title.trim(),view,claim,exp,req.userId])).rows[0];
   await log(db,req.params.oid,null,req.userId,'custom_role.profile_created',row.id);
   return row;
  });
  res.status(201).json(result);
 }));
 router.post('/organizations/:oid/permission-profile',wrap(async(req,res)=>{
  const subject=req.body?.subject,profileId=req.body?.profileId??null;
  if(typeof subject!=='string'||!subject||subject.length>128||
   (profileId!==null&&!uuid(profileId)))throw bad(400,'Invalid member or profile');
  const answer=await tx(async db=>{
   await guard(db,req.params.oid,req.userId,true);
   if(subject===req.userId)throw bad(403,'Owner cannot change own privileges');
   const target=(await db.query(
    "SELECT role FROM cc_memberships WHERE organization_id=$1 AND subject=$2"+
    " AND membership_status='active' FOR UPDATE",
    [req.params.oid,subject])).rows[0];
   if(!target)throw bad(404,'Active member not found');
   if(!['askan','squad_leader'].includes(target.role))
    throw bad(403,'Custom restrictions apply only to ordinary workers or captains');
   if(profileId){
    const prof=await db.query(
     "SELECT 1 FROM cc_custom_team_permission_profiles WHERE organization_id=$1 AND id=$2",
     [req.params.oid,profileId]);
    if(!prof.rowCount)throw bad(404,'Profile not in organization');
   }
   const before=(await db.query(
    "SELECT profile_id FROM cc_custom_team_permission_bindings WHERE organization_id=$1"+
    " AND subject=$2 FOR UPDATE",[req.params.oid,subject])).rows[0]?.profile_id||null;
   if(before===profileId)return {subject,profileId,changed:false};
   if(profileId)await db.query(
    "INSERT INTO cc_custom_team_permission_bindings(organization_id,subject,profile_id,assigned_by)"+
    " VALUES($1,$2,$3,$4) ON CONFLICT(organization_id,subject) DO UPDATE"+
    " SET profile_id=excluded.profile_id,assigned_by=excluded.assigned_by,updated_at=now()",
    [req.params.oid,subject,profileId,req.userId]);
   else await db.query("DELETE FROM cc_custom_team_permission_bindings WHERE organization_id=$1 AND subject=$2",
    [req.params.oid,subject]);
   await db.query(
    "INSERT INTO cc_custom_team_permission_events(organization_id,subject,actor_subject,previous_profile_id,next_profile_id)"+
    " VALUES($1,$2,$3,$4,$5)",[req.params.oid,subject,req.userId,before,profileId]);
   await log(db,req.params.oid,null,req.userId,'custom_role.restriction_changed',null,
    {subject,restricted:Boolean(profileId)});
   return {subject,profileId,changed:true};
  });
  res.json(answer);
 }));
 return router;
}

export async function ensureCustomContactRestriction(db,org,user,role,cap,bad){
 if(!['askan','squad_leader'].includes(role))return;
 const query=await db.query(
  "SELECT p.can_view_lead_queue,p.can_claim_leads,p.can_export_shared_contacts"+
  " FROM cc_custom_team_permission_bindings b JOIN cc_custom_team_permission_profiles p"+
  " ON p.organization_id=b.organization_id AND p.id=b.profile_id"+
  " WHERE b.organization_id=$1 AND b.subject=$2",[org,user]);
 if(!query.rowCount)return; // Existing built-in privileges, no custom restriction.
 const columns={view_lead_queue:'can_view_lead_queue',claim_leads:'can_claim_leads',
  export_shared_contacts:'can_export_shared_contacts'};
 if(!columns[cap])throw Error('Unknown custom permission');
 if(query.rows[0][columns[cap]]!==true)throw bad(403,'Custom role restricts this contact action');
}
