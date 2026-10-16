import {Router} from 'express';

// Organization-level planning ONLY. No charges or actual labor time recorded.
// Lock each pool BEFORE changing allocations; this serializes quota arithmetic.
export default function organizationResourcesRouter({pool,bad,uuid,log}){
 const router=Router(),run=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const cents=value=>{
  if(!['number','string'].includes(typeof value))throw bad(400,'Amount required');
  const raw=String(value);
  if(!/^(0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(raw))throw bad(400,'Invalid exact decimal amount');
  const [whole,fraction='']=raw.split('.');
  const n=BigInt(whole)*100n+BigInt((fraction+'00').slice(0,2));
  if(n>100000000000000n)throw bad(400,'Planning amount over limit');
  return n;
 };
 const money=n=>String(n/100n)+'.'+String(n%100n).padStart(2,'0');
 const hours=x=>{if(!Number.isSafeInteger(x)||x<0||x>10000000)throw bad(400,'Invalid volunteer hours');return x;};
 const month=x=>{if(typeof x!=='string'||!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(x))throw bad(400,'Use first day of month YYYY-MM-01');return x;};
 async function leader(db,org,user){
  if(!uuid(org))throw bad(400,'Invalid organization');
  const role=(await db.query(
   "SELECT role FROM cc_memberships WHERE organization_id=$1 AND subject=$2 AND membership_status='active'",
   [org,user])).rows[0]?.role;
  if(!role)throw bad(404,'Organization not found');
  if(!['owner','manager'].includes(role))throw bad(403,'Leadership permission required');
 }
 async function tx(fn){
  const db=await pool.connect();
  try{await db.query('BEGIN');const out=await fn(db);await db.query('COMMIT');return out;}
  catch(error){await db.query('ROLLBACK');if(error.code==='23505')throw bad(409,'Duplicate monthly resource pool');throw error;}
  finally{db.release();}
 }
 async function lockedPool(db,org,id){
  if(!uuid(id))throw bad(400,'Invalid pool ID');
  const p=(await db.query('SELECT * FROM cc_org_resource_pools WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,org])).rows[0];
  if(!p)throw bad(404,'Resource pool not found');
  return p;
 }
 async function used(db,poolId){
  const row=(await db.query(
   'SELECT COALESCE(SUM(budget_allocated),0)::text budget,COALESCE(SUM(volunteer_hours_allocated),0)::int hours FROM cc_org_resource_allocations WHERE pool_id=$1',
   [poolId])).rows[0];
  return {budget:cents(row.budget),hours:row.hours};
 }
 router.get('/organizations/:oid/resources',run(async(req,res)=>{
  await leader(pool,req.params.oid,req.userId);
  const entries=(await pool.query(
   'SELECT id,period_start,currency,budget_total::text budget_total,volunteer_hours_total,created_at FROM cc_org_resource_pools'+
   ' WHERE organization_id=$1 ORDER BY period_start DESC,currency,id LIMIT 40',[req.params.oid])).rows;
  const pools=[];
  for(const entry of entries){
   const [allocations,totals]=await Promise.all([
    pool.query('SELECT a.id,a.campaign_id,c.title AS campaign_title,a.budget_allocated::text budget_allocated,'+
     'a.volunteer_hours_allocated,a.updated_at FROM cc_org_resource_allocations a'+
     ' JOIN cc_campaigns c ON c.id=a.campaign_id AND c.organization_id=a.organization_id'+
     ' WHERE a.pool_id=$1 AND a.organization_id=$2 ORDER BY c.title,a.id LIMIT 100',[entry.id,req.params.oid]),
    used(pool,entry.id)
   ]);
   pools.push({...entry,remaining_budget:money(cents(entry.budget_total)-totals.budget),
     remaining_hours:entry.volunteer_hours_total-totals.hours,allocations:allocations.rows});
  }
  res.set('Cache-Control','private,no-store');
  res.json({pools,limitPools:40,limitAllocationsPerPool:100,scope:'organization_leadership_only',
   amountsArePlansNotPayments:true,hoursArePlansNotRecordedWork:true});
 }));
 router.post('/organizations/:oid/resources',run(async(req,res)=>{
  const start=month(req.body?.periodStart),currency=req.body?.currency;
  if(typeof currency!=='string'||!/^[A-Z]{3}$/.test(currency))throw bad(400,'Currency must have three uppercase letters');
  const budget=money(cents(req.body?.budgetTotal)),cap=hours(req.body?.volunteerHoursTotal);
  const result=await tx(async db=>{
   await leader(db,req.params.oid,req.userId);
   const created=(await db.query(
    'INSERT INTO cc_org_resource_pools(organization_id,period_start,currency,budget_total,volunteer_hours_total,created_by)'+
    ' VALUES($1,$2,$3,$4,$5,$6) RETURNING id,period_start,currency,budget_total::text budget_total,volunteer_hours_total',
    [req.params.oid,start,currency,budget,cap,req.userId])).rows[0];
   await db.query(
    "INSERT INTO cc_org_resource_allocation_history(organization_id,pool_id,campaign_id,actor_subject,action,budget_after,hours_after) VALUES($1,$2,NULL,$3,'pool_created',$4,$5)",
    [req.params.oid,created.id,req.userId,budget,cap]);
   await log(db,req.params.oid,null,req.userId,'organization.resource_pool.created',created.id,{periodStart:start,currency});
   return created;
  });
  res.status(201).json({...result,doesNotMoveMoney:true});
 }));
 router.put('/organizations/:oid/resources/:pid',run(async(req,res)=>{
  const budget=money(cents(req.body?.budgetTotal)),cap=hours(req.body?.volunteerHoursTotal);
  const result=await tx(async db=>{
   await leader(db,req.params.oid,req.userId);
   const p=await lockedPool(db,req.params.oid,req.params.pid);
   const total=await used(db,p.id);
   if(cents(budget)<total.budget||cap<total.hours)throw bad(409,'Cannot reduce pool below existing allocations');
   if(cents(budget)===cents(p.budget_total)&&cap===p.volunteer_hours_total)return {id:p.id,unchanged:true};
   await db.query('UPDATE cc_org_resource_pools SET budget_total=$1,volunteer_hours_total=$2,updated_at=now() WHERE id=$3',[budget,cap,p.id]);
   await db.query(
    "INSERT INTO cc_org_resource_allocation_history(organization_id,pool_id,campaign_id,actor_subject,action,budget_before,budget_after,hours_before,hours_after) VALUES($1,$2,NULL,$3,'pool_capacity_changed',$4,$5,$6,$7)",
    [req.params.oid,p.id,req.userId,p.budget_total,budget,p.volunteer_hours_total,cap]);
   await log(db,req.params.oid,null,req.userId,'organization.resource_pool.capacity',p.id,{});
   return {id:p.id,budgetTotal:budget,volunteerHoursTotal:cap,unchanged:false};
  });
  res.json(result);
 }));
 router.put('/organizations/:oid/resources/:pid/allocations/:cid',run(async(req,res)=>{
  const budget=money(cents(req.body?.budgetAllocated)),cap=hours(req.body?.volunteerHoursAllocated);
  if(!uuid(req.params.cid))throw bad(400,'Invalid campaign');
  const result=await tx(async db=>{
   await leader(db,req.params.oid,req.userId);
   const p=await lockedPool(db,req.params.oid,req.params.pid);
   const c=(await db.query('SELECT id,title,currency FROM cc_campaigns WHERE organization_id=$1 AND id=$2',
    [req.params.oid,req.params.cid])).rows[0];
   if(!c)throw bad(404,'Campaign not found in this organization');
   if(c.currency!==p.currency)throw bad(409,'Cannot allocate to campaign using a different currency');
   const previous=(await db.query('SELECT * FROM cc_org_resource_allocations WHERE pool_id=$1 AND campaign_id=$2 FOR UPDATE',
    [p.id,c.id])).rows[0];
   if(previous&&cents(previous.budget_allocated)===cents(budget)&&previous.volunteer_hours_allocated===cap)
    return {campaignId:c.id,poolId:p.id,budgetAllocated:budget,volunteerHoursAllocated:cap,unchanged:true};
   const current=await used(db,p.id);
   const nextBudget=current.budget-cents(previous?.budget_allocated||'0')+cents(budget);
   const nextHours=current.hours-(previous?.volunteer_hours_allocated||0)+cap;
   if(nextBudget>cents(p.budget_total)||nextHours>p.volunteer_hours_total)
    throw bad(409,'Allocation exceeds remaining monthly capacity');
   const changed=(await db.query(
    'INSERT INTO cc_org_resource_allocations(organization_id,pool_id,campaign_id,budget_allocated,volunteer_hours_allocated,updated_by)'+
    ' VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(pool_id,campaign_id) DO UPDATE SET'+
    ' budget_allocated=excluded.budget_allocated,volunteer_hours_allocated=excluded.volunteer_hours_allocated,'+
    ' updated_by=excluded.updated_by,updated_at=now() RETURNING id',
    [req.params.oid,p.id,c.id,budget,cap,req.userId])).rows[0];
   await db.query(
    'INSERT INTO cc_org_resource_allocation_history(organization_id,pool_id,campaign_id,actor_subject,action,budget_before,budget_after,hours_before,hours_after)'+
    ' VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [req.params.oid,p.id,c.id,req.userId,previous?'allocation_changed':'allocation_created',
     previous?.budget_allocated||null,budget,previous?.volunteer_hours_allocated??null,cap]);
   await log(db,req.params.oid,c.id,req.userId,'organization.resource_allocation.changed',changed.id,{poolId:p.id});
   return {id:changed.id,campaignId:c.id,poolId:p.id,budgetAllocated:budget,
    volunteerHoursAllocated:cap,remainingBudget:money(cents(p.budget_total)-nextBudget),
    remainingHours:p.volunteer_hours_total-nextHours,unchanged:false,doesNotMoveMoney:true};
  });
  res.json(result);
 }));
 return router;
}
