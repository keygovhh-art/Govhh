// Central server-side plan policy. No plan may be changed by a browser,
// a campaign manager, API payload, JWT claims, or customer-facing route.
// Provisioning is controlled solely through independently reviewed SQL.
import {CAMPAIGN_PLANS,PLAN_FEATURES} from '../src/plan-catalog.js';

const byCode=new Map(CAMPAIGN_PLANS.map(p=>[p.code,p]));
const tiers=CAMPAIGN_PLANS.map(p=>p.code);
const starter=CAMPAIGN_PLANS[0];
const activeFeature=new Map(PLAN_FEATURES.filter(f=>f.minTier!==null&&f.status!=='missing').map(f=>[f.code,f.minTier]));
const guid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const caps=['members','goals','campaigns'];
const columns={members:'max_members',goals:'max_goals',campaigns:'max_campaigns'};

export function makePlanPolicy({pool,bad}){
 async function entitlement(db,org){
  if(!guid.test(org))throw bad(400,'Invalid workspace');
  const result=await db.query(
   "SELECT plan_code,status,valid_from,valid_until,max_members,max_goals,max_campaigns FROM cc_plan_entitlements WHERE organization_id=$1",
   [org]);
  const row=result.rows[0];
  const now=Date.now();
  const valid=row&&row.status==='active'&&new Date(row.valid_from).getTime()<=now&&
   (row.valid_until===null||new Date(row.valid_until).getTime()>now)&&byCode.has(row.plan_code);
  const plan=valid?byCode.get(row.plan_code):starter;
  const limits={};
  for(const key of caps){
   const stored=valid?row[columns[key]]:null;
   const approved=Number.isSafeInteger(stored)&&stored>0?stored:null;
   // Unnegotiated/null tier capacities are NOT "unlimited". Until approved,
   // they can use at most starter limits, even when tier is higher.
   limits[key]=approved??plan[key]??starter[key];
  }
  return {
   planCode:plan.code,planName:plan.name,tierIndex:plan.index,limits,
   source:valid?'trusted_operator_grant':'starter_fallback',
   grantState:row?(!valid?'not_currently_valid':'active'):'none',
   validUntil:valid?row.valid_until:null,
   billingVerified:false,providerActivated:false
  };
 }
 async function forMember(db,org,user){
  if(!guid.test(org))throw bad(400,'Invalid workspace');
  const member=(await db.query(
   "SELECT role FROM cc_memberships WHERE organization_id=$1 AND subject=$2 AND membership_status='active'",
   [org,user])).rows[0];
  if(!member)throw bad(404,'Workspace not found');
  return {...await entitlement(db,org),role:member.role};
 }
 function allowFeature(access,feature){
  const min=activeFeature.get(feature);
  if(min===undefined)return false; // unallocated or missing feature is NEVER implicitly granted
  return access.tierIndex>=min;
 }
 function requireFeature(access,feature){
  if(!allowFeature(access,feature))throw bad(403,'Plan entitlement required for '+feature);
 }
 function cap(access,key){if(!caps.includes(key))throw Error('Invalid capacity key');return access.limits[key];}
 async function checkCapacity(db,access,org,key){
  const q=key==='campaigns'?
   "SELECT COUNT(*)::int total FROM cc_campaigns WHERE organization_id=$1":
   key==='members'?
   "SELECT COUNT(*)::int total FROM cc_memberships WHERE organization_id=$1 AND membership_status='active'":
   null;
  if(!q)throw Error('Use campaign-scoped goal counter for goal cap');
  const used=(await db.query(q,[org])).rows[0].total;
  if(used>=cap(access,key))throw bad(409,'Plan '+key+' limit reached');
  return used;
 }
 // No user-supplied org id is ever trusted without confirming ownership
 // of the canonical target row and an active membership.
 async function orgFromScopedPath(req,type){
  const route=req.path;
  let match;
  if((match=route.match(/^\/organizations\/([a-f0-9-]{36})(?:\/|$)/i)))return match[1];
  if((match=route.match(/^\/campaigns\/([a-f0-9-]{36})(?:\/|$)/i))){
   const row=(await pool.query('SELECT organization_id FROM cc_campaigns WHERE id=$1',[match[1]])).rows[0];
   return row?.organization_id;
  }
  const aliases={
   plus:[['tasks','cc_assignments']],
   pro:[['contacts','cc_contacts'],['sprints','cc_pro_sprints'],['guidance','cc_pro_guidance_requests'],['tasks','cc_assignments']],
   gabbai:[['approvals','cc_gabbai_approval_requests']],
   organization:[['decisions','cc_org_leadership_decisions']],
   custom:[]
  };
  for(const [segment,table] of aliases[type]||[]){
   match=route.match(new RegExp('^/'+segment+'/([a-f0-9-]{36})(?:/|$)','i'));
   if(match){const row=(await pool.query('SELECT organization_id FROM '+table+' WHERE id=$1',[match[1]])).rows[0];return row?.organization_id;}
  }
  return null;
 }
 // Never grant a future premium API route just because its prefix is gated.
 const routeSpecs={
 plus: [
  ["GET","campaigns/:id/member-desk","member_dashboard"],
  ["GET","campaigns/:id/credit-report","team_credit"],
  ["GET","campaigns/:id/alerts","basic_alerts"],
  ["POST","campaigns/:id/alerts/:id/ack","basic_alerts"],
  ["GET","campaigns/:id/teams-report","detailed_reports"],
  ["PATCH","tasks/:id/handoff","advanced_tasks"],
  ["GET","campaigns/:id/donation-levels","donation_levels"],
  ["PUT","campaigns/:id/donation-levels","donation_levels"],
  ["GET","campaigns/:id/pledges","partial_pledges"],
  ["POST","campaigns/:id/pledges/:id/partial-receipts","partial_pledges"]
 ],
 pro: [
  ["GET","campaigns/:id/clarity","clarity"],
  ["GET","campaigns/:id/files","files"],
  ["POST","campaigns/:id/files","files"],
  ["GET","campaigns/:id/files/:id/download","files"],
  ["GET","campaigns/:id/contacts","crm"],
  ["GET","contacts/:id/timeline","relationship_history"],
  ["PUT","contacts/:id/profile","crm"],
  ["POST","contacts/:id/interactions","relationship_history"],
  ["GET","campaigns/:id/sprints","sprint_memory"],
  ["POST","campaigns/:id/sprints","sprint_memory"],
  ["PATCH","sprints/:id/steps/:id","sprint_memory"],
  ["PATCH","sprints/:id/status","sprint_memory"],
  ["GET","campaigns/:id/focus-history","sprint_memory"],
  ["GET","campaigns/:id/guidance","guidance"],
  ["POST","campaigns/:id/guidance","guidance"],
  ["GET","guidance/:id/messages","guidance"],
  ["POST","guidance/:id/messages","guidance"],
  ["PATCH","guidance/:id/close","guidance"],
  ["GET","campaigns/:id/blockers","blocker_intelligence"],
  ["PUT","tasks/:id/blocker","blocker_intelligence"]
 ],
 gabbai: [
  ["GET","campaigns/:id/approvals","approvals"],
  ["POST","campaigns/:id/approvals","approvals"],
  ["GET","campaigns/:id/priority-oversight","priority_oversight"],
  ["GET","campaigns/:id/ledger-review","ledger"],
  ["POST","approvals/:id/decision","approvals"]
 ],
 organization: [
  ["GET","organizations/:id/portfolio","portfolio"],
  ["GET","organizations/:id/decisions","leadership_decisions"],
  ["POST","organizations/:id/decisions","leadership_decisions"],
  ["POST","decisions/:id/resolve","leadership_decisions"],
  ["GET","organizations/:id/resources","resource_allocation"],
  ["POST","organizations/:id/resources","resource_allocation"],
  ["PUT","organizations/:id/resources/:id","resource_allocation"],
  ["PUT","organizations/:id/resources/:id/allocations/:id","resource_allocation"],
  ["GET","organizations/:id/memory","organization_memory"],
  ["POST","organizations/:id/memory","organization_memory"]
 ],
 custom: [
  ["GET","campaigns/:id/focus-rules","custom_focus"],
  ["PUT","campaigns/:id/focus-rules","custom_focus"],
  ["GET","campaigns/:id/focus-preview","custom_focus"]
 ]
 };
 const featureForRoute=(tier,method,path)=>{
  const uid=/^[a-f0-9-]{36}$/i;
  const parts=path.split('/').filter(Boolean);
  for(const [verb,pattern,feature] of routeSpecs[tier]||[]){
   if(method!==verb)continue;
   const segments=pattern.split('/');
   if(parts.length===segments.length&&segments.every((x,i)=>x===':id'?uid.test(parts[i]):x===parts[i]))return feature;
  }
  return null;
 };
 const scoped=(code,feature)=>{
  if(!byCode.has(code))throw Error('Unknown plan');
  return async(req,res,next)=>{
   try {
    const routeType=code==='askan_plus'?'plus':code==='askan_pro'?'pro':code==='gabbai_pro'?'gabbai':code;
    const importOrExport=feature==='csv_import'&&(
      (req.baseUrl==='/api/import'&&req.method==='POST'&&/^\/campaigns\/[a-f0-9-]{36}\/contacts\/import$/i.test(req.path))||
      (req.baseUrl==='/api/team'&&req.method==='GET'&&/^\/campaigns\/[a-f0-9-]{36}\/contacts\.csv$/i.test(req.path)));
    const routeFeature=importOrExport?'csv_import':featureForRoute(routeType,req.method,req.path);
    if(!routeFeature)throw bad(404,'Unknown or unallocated plan route');
    const org=await orgFromScopedPath(req,routeType);
    if(!org)throw bad(404,'Campaign or organization not found');
    const access=await forMember(pool,org,req.userId);
    if(access.tierIndex<byCode.get(code).index)throw bad(403,'Plan upgrade required: '+code);
    // An implementation still marked "missing" cannot become usable via a
    // broad tier grant. For these routers, only shipped route families map here.
    requireFeature(access,routeFeature);
    if(feature)requireFeature(access,feature);
    req.planAccess=access;
    next();
   }catch(error){next(error);}
  };
 };
 async function assertPlan(db,c,user,feature){
  const access=await forMember(db,c.organization_id,user);
  requireFeature(access,feature);
  return access;
 }
 return {entitlement,forMember,allowFeature,requireFeature,cap,checkCapacity,scoped,assertPlan};
}
