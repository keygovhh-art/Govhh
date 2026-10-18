import {Router} from 'express';

// Askan Pro: factual, role-scoped manual call worklists.
// No auto-dial or bulk export; phone numbers never leave an authorized JWT
// response and the Do-Not-Call flag is always respected.
export default function proCallListsRouter({pool,campaignAccess,bad}){
 const router=Router(),run=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const elevated=new Set(['owner','manager','finance','auditor']);
 router.get('/campaigns/:cid/call-list',run(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);
  const mode=req.query.mode||'due';
  if(!['due','high','all'].includes(mode))throw bad(400,'Invalid call-list filter');
  const limitRaw=req.query.limit??'30';
  if(typeof limitRaw!=='string'||!/^([1-9]|[1-4]\d|50)$/.test(limitRaw))
   throw bad(400,'Call-list limit must be 1–50');
  const limit=Number(limitRaw);
  const team=(await pool.query(
   'SELECT team_name FROM cc_campaign_members WHERE organization_id=$1 AND campaign_id=$2 AND subject=$3',
   [c.organization_id,c.id,req.userId])).rows[0]?.team_name||'';
  // A member may see only own private contacts, plus campaign-shared
  // contacts visible to their named team; leaders may see shared campaign
  // contacts across teams, never someone else's private records.
  const visibility=
   " AND ((c.privacy='private' AND c.created_by=$3)"+
   " OR (c.privacy='campaign' AND ($4::boolean OR ($5<>'' AND c.assigned_team=$5))))";
  const filter=mode==='due'?
   ' AND p.next_followup_at IS NOT NULL AND p.next_followup_at<=now()':
   mode==='high'?" AND p.priority='high'":'';
  const from=" FROM cc_contacts c"+
   " LEFT JOIN cc_pro_contact_profiles p ON p.contact_id=c.id AND p.organization_id=c.organization_id"+
   " AND p.campaign_id=c.campaign_id"+
   " WHERE c.organization_id=$1 AND c.campaign_id=$2 AND c.do_not_call=false"+
   " AND c.phone<>'' AND c.status<>'closed' AND COALESCE(p.stage,'new')<>'closed'"+
   " AND (c.claimed_by IS NULL OR c.claim_expires_at<=now() OR c.claimed_by=$3)"+
   visibility+filter;
  const params=[c.organization_id,c.id,req.userId,elevated.has(c.role),team];
  const [count,rows]=await Promise.all([
   pool.query('SELECT COUNT(*)::int total'+from,params),
   pool.query(
    "SELECT c.id,c.display_name,c.phone,c.privacy,c.assigned_team,"+
    " COALESCE(p.stage,'new') AS stage,COALESCE(p.priority,'normal') AS priority,"+
    " p.next_followup_at,c.claimed_by"+from+
    " ORDER BY CASE WHEN p.next_followup_at<now() THEN 0 ELSE 1 END,"+
    " CASE WHEN COALESCE(p.priority,'normal')='high' THEN 0 WHEN COALESCE(p.priority,'normal')='normal' THEN 1 ELSE 2 END,"+
    " p.next_followup_at ASC NULLS LAST,c.created_at DESC,c.id DESC LIMIT $6",
    [...params,limit])
  ]);
  res.set('Cache-Control','private,no-store');
  res.json({
   mode,contacts:rows.rows,totalMatching:count.rows[0].total,shown:rows.rowCount,limit,
   isManualWorklist:true,outboundCallsPlaced:0,providerVerified:false,
   excludesDoNotCall:true,excludesOtherMembersClaims:true,scopedToMembership:true
  });
 }));
 return router;
}
