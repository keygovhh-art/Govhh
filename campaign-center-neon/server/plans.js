import { Router } from "express";
import { PLAN_BY_CODE, publicPlans } from "../shared/plan-catalog.js";

// Requested tier ≠ activated subscription. Never grant an entitlement from a
// client-supplied plan name. Every current feature retains its normal role gates.
export default function plansRouter({pool,member,log,bad}) {
 const router=Router();
 const run=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
 router.get('/catalog',(_req,res)=>{
  res.set('Cache-Control','private, no-store');
  res.json({plans:publicPlans(),billingReady:false,entitlementsActive:false,
   message:'Feature levels and capacities are a roadmap. No paid plans can currently be activated.'});
 });
 router.get('/workspaces/:id/interest',run(async(req,res)=>{
  await member(pool,req.params.id,req.userId);
  const r=await pool.query(
   "SELECT details->>'planCode' AS code, created_at AS requested_at FROM cc_activity_events "+
   "WHERE organization_id=$1 AND event_type='plan.interest_requested' ORDER BY created_at DESC,id DESC LIMIT 1",
   [req.params.id]);
  res.set('Cache-Control','private, no-store');
  res.json({requestedPlan:r.rows[0]?.code||null,requestedAt:r.rows[0]?.requested_at||null,
   activePaidPlan:null,billingReady:false});
 }));
 router.post('/workspaces/:id/interest',run(async(req,res)=>{
  const role=await member(pool,req.params.id,req.userId);
  if(role!=='owner')throw bad(403,'Only the workspace owner can request a plan.');
  const planCode=req.body?.planCode;
  if(typeof planCode!=='string'||!Object.hasOwn(PLAN_BY_CODE,planCode))
   throw bad(400,'Choose a listed plan');
  const prev=await pool.query(
   "SELECT details->>'planCode' AS code,created_at AS requested_at FROM cc_activity_events "+
   "WHERE organization_id=$1 AND event_type='plan.interest_requested' ORDER BY created_at DESC,id DESC LIMIT 1",
   [req.params.id]);
  if(prev.rows[0]?.code===planCode){
   return res.json({requestedPlan:planCode,duplicate:true,
    message:'Already recorded. No subscription, charges or feature upgrade activated.'});
  }
  // Append-only audit: no update/delete, no billing provider, no entitlement change.
  await log(pool,req.params.id,null,req.userId,'plan.interest_requested',null,{planCode});
  res.status(201).json({requestedPlan:planCode,activated:false,
   message:'Request recorded for review. No billing, charges, limits or paid features changed.'});
 }));
 return router;
}
