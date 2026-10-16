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
 const scoped=(code,feature)=>{
  if(!byCode.has(code))throw Error('Unknown plan');
  return async(req,res,next)=>{
   try {
    const org=await orgFromScopedPath(req,code==='askan_plus'?'plus':code==='askan_pro'?'pro':code==='gabbai_pro'?'gabbai':code);
    if(!org)throw bad(404,'Campaign or organization not found');
    const access=await forMember(pool,org,req.userId);
    if(access.tierIndex<byCode.get(code).index)throw bad(403,'Plan upgrade required: '+code);
    // An implementation still marked "missing" cannot become usable via a
    // broad tier grant. For these routers, only shipped route families map here.
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
