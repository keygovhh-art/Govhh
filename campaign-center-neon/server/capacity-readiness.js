import {Router} from 'express';

// Read-only, scoped capacity facts. All quotas are provisioned through trusted
// operator grants; this route cannot buy, increase or activate any plan.
export default function capacityReadinessRouter({pool,planPolicy,bad}){
 const router=Router(),run=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 router.get('/organizations/:oid/capacity',run(async(req,res)=>{
  const access=await planPolicy.forMember(pool,req.params.oid,req.userId);
  if(!['owner','manager'].includes(access.role))throw bad(403,'Leadership only');
  const org=req.params.oid;
  const [counts,goals]=await Promise.all([
   pool.query(
    "SELECT"+
    " (SELECT COUNT(*)::int FROM cc_memberships WHERE organization_id=$1 AND membership_status='active') active_members,"+
    " (SELECT COUNT(*)::int FROM cc_campaigns WHERE organization_id=$1) campaigns",
    [org]),
   pool.query(
    "WITH per_campaign AS ("+
    " SELECT c.id,c.title,COUNT(g.id)::int goals"+
    " FROM cc_campaigns c LEFT JOIN cc_goals g"+
    " ON g.organization_id=c.organization_id AND g.campaign_id=c.id AND g.status<>'archived'"+
    " WHERE c.organization_id=$1 GROUP BY c.id,c.title"+
    " ) SELECT COALESCE(SUM(goals),0)::int total_goals,"+
    " COUNT(*) FILTER (WHERE goals>$2)::int campaigns_over_goal_limit,"+
    " COUNT(*) FILTER (WHERE goals=$2)::int campaigns_at_goal_limit,"+
    " COALESCE(MAX(goals),0)::int max_goals_in_campaign,"+
    " (SELECT COALESCE(json_agg(x), '[]'::json) FROM ("+
    " SELECT id,title,goals FROM per_campaign ORDER BY goals DESC,id LIMIT 10) x) top_campaigns"+
    " FROM per_campaign",
    [org,access.limits.goals])
  ]);
  const used={members:counts.rows[0].active_members,
   campaigns:counts.rows[0].campaigns,goals:goals.rows[0].total_goals};
  const limits={...access.limits};
  const goalStatus=goals.rows[0];
  const breakdown={
   members:{used:used.members,limit:limits.members,
    remaining:Math.max(0,limits.members-used.members),overLimit:used.members>limits.members},
   campaigns:{used:used.campaigns,limit:limits.campaigns,
    remaining:Math.max(0,limits.campaigns-used.campaigns),overLimit:used.campaigns>limits.campaigns},
   goalsPerCampaign:{limit:limits.goals,
    totalAcrossCampaigns:used.goals,
    campaignsAtLimit:goalStatus.campaigns_at_goal_limit,
    campaignsOverLimit:goalStatus.campaigns_over_goal_limit,
    maxObservedPerCampaign:goalStatus.max_goals_in_campaign,
    topTen:goalStatus.top_campaigns}
  };
  res.set('Cache-Control','private,no-store');
  res.json({
   planCode:access.planCode,source:access.source,
   customCapacityGranted:access.planCode==='custom'&&access.source==='trusted_operator_grant',
   grantState:access.grantState,validUntil:access.validUntil,
   breakdown,limitsAreServerEnforced:true,
   goalsLimitIsPerCampaign:true,countsCoverFullOrganization:true,
   contractVerified:false,billingVerified:false,carrierActivated:false,
   selfServiceUpgradeAvailable:false,ownerManagerOnly:true
  });
 }));
 return router;
}
