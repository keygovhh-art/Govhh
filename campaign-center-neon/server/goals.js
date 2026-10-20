import { Router } from 'express';

// Goal facts are explicitly shared *within one authorized campaign*.
// The server checks approved plan capacity. This endpoint cannot self-provision entitlements.
export default function goalsRouter({pool,campaignAccess,need,bad,trim,uuid,log,planPolicy}) {
 const router=Router(),wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const categories=new Set(['money','members','calls','pledges','tasks','custom']);
 const statuses=new Set(['active','at_risk','completed','paused','archived']);
 const writable=new Set(['owner','manager']);
 const fields='id,title,description,category,target_value,current_value,due_on,status,created_by,created_at,updated_at';
 function positive(value,zero=false) {
   const raw=String(value??'');
   if(!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(raw))throw bad(400,'Invalid goal number');
   const n=Number(raw);
   if(!Number.isFinite(n)||n>1000000000000||(!zero&&n<=0))throw bad(400,'Invalid goal amount');
   return n.toFixed(2);
 }
 function date(value) {
   if(value===undefined)return undefined;
   if(value===null||value==='')return null;
   if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw bad(400,'Invalid due date');
   const d=new Date(value+'T00:00:00Z');
   if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==value)throw bad(400,'Invalid due date');
   return value;
 }
 async function transaction(fn) {
   const db=await pool.connect();
   try {await db.query('BEGIN');const result=await fn(db);await db.query('COMMIT');return result;}
   catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 router.get('/campaigns/:cid',wrap(async(req,res)=>{
   const c=await campaignAccess(pool,req.params.cid,req.userId);
   const page=Number(req.query.page??1),limit=50;
   if(!Number.isSafeInteger(page)||page<1||page>10000)
     throw bad(400,'Invalid goals page');
   // Never confuse the first 50 rows with all goals in a large approved plan.
   // Exact count and paginated data are scoped to this campaign and organization.
   const [rows,count,access]=await Promise.all([
     pool.query(
       'SELECT '+fields.replace(/\b(?:id|title|description|category|target_value|current_value|due_on|status|created_by|created_at|updated_at)\b/g,field=>'g.'+field)+
       ",(SELECT COUNT(*)::int FROM cc_goal_history h WHERE h.organization_id=g.organization_id"+
       " AND h.campaign_id=g.campaign_id AND h.goal_id=g.id) version"+
       ' FROM cc_goals g WHERE g.organization_id=$1 AND g.campaign_id=$2'+
       " AND status<>'archived' ORDER BY created_at DESC,id DESC LIMIT $3 OFFSET $4",
       [c.organization_id,c.id,limit,(page-1)*limit]),
     pool.query(
       "SELECT COUNT(*)::int total FROM cc_goals WHERE organization_id=$1"+
       " AND campaign_id=$2 AND status<>'archived'",[c.organization_id,c.id]),
     planPolicy.forMember(pool,c.organization_id,req.userId)
   ]);
   const total=count.rows[0].total;
   res.set('Cache-Control','private,no-store');
   res.json({goals:rows.rows,total,page,pageCount:Math.max(1,Math.ceil(total/limit)),limit,
     goalLimit:access.limits.goals,planCode:access.planCode,
     serverEnforced:true,allCampaignGoalsCounted:true});
 }));
 router.post('/campaigns/:cid',wrap(async(req,res)=>{
   const title=trim(req.body?.title,160),description=trim(req.body?.description,1000);
   const category=req.body?.category||'custom';
   if(!title||!categories.has(category))throw bad(400,'Invalid goal');
   const target=positive(req.body?.targetValue),current=positive(req.body?.currentValue??0,true);
   const due=date(req.body?.dueOn)||null;
   const goal=await transaction(async db=>{
     const c=await campaignAccess(db,req.params.cid,req.userId);need(c.role,[...writable]);
     await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['cc_goals:'+c.id]);
     const count=await db.query("SELECT count(*)::int total FROM cc_goals WHERE organization_id=$1 AND campaign_id=$2 AND status<>'archived'",[c.organization_id,c.id]);
     const access=await planPolicy.forMember(db,c.organization_id,req.userId);
     if(count.rows[0].total>=access.limits.goals)throw bad(409,'Approved plan goal limit reached');
     const row=(await db.query(
       'INSERT INTO cc_goals(organization_id,campaign_id,title,description,category,target_value,current_value,due_on,created_by) '+
       'VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING '+fields,
       [c.organization_id,c.id,title,description,category,target,current,due,req.userId])).rows[0];
     await db.query("INSERT INTO cc_goal_history(organization_id,campaign_id,goal_id,actor_subject,event_kind,snapshot) VALUES($1,$2,$3,$4,'created',$5)",
       [c.organization_id,c.id,row.id,req.userId,JSON.stringify(row)]);
     await log(db,c.organization_id,c.id,req.userId,'goal.created',row.id,{category});
     return {...row,version:1};
   });
   res.status(201).json(goal);
 }));
 router.patch('/:id',wrap(async(req,res)=>{
   if(!uuid(req.params.id))throw bad(400,'Invalid goal');
   const body=req.body||{},updates=[],values=[];
   const expectedVersion=body.expectedVersion;
   if(!Number.isSafeInteger(expectedVersion)||expectedVersion<0)
     throw bad(400,'An expected goal version is required');
   const add=(key,v)=>{updates.push(key+'=$'+(values.length+1));values.push(v);};
   if(Object.hasOwn(body,'title')){
     const title=trim(body.title,160);if(!title)throw bad(400,'Goal title required');add('title',title);
   }
   if(Object.hasOwn(body,'description'))add('description',trim(body.description,1000));
   if(Object.hasOwn(body,'targetValue'))add('target_value',positive(body.targetValue));
   if(Object.hasOwn(body,'currentValue'))add('current_value',positive(body.currentValue,true));
   if(Object.hasOwn(body,'dueOn'))add('due_on',date(body.dueOn));
   if(Object.hasOwn(body,'status')){
     if(!statuses.has(body.status))throw bad(400,'Invalid goal status');
     add('status',body.status);
   }
   if(!updates.length)throw bad(400,'No goal changes');
   const updated=await transaction(async db=>{
     const previous=(await db.query('SELECT * FROM cc_goals WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
     if(!previous||previous.status==='archived')throw bad(404,'Goal not found');
     const c=await campaignAccess(db,previous.campaign_id,req.userId);
     if(c.organization_id!==previous.organization_id)throw bad(404,'Goal not found');
     need(c.role,[...writable]);
     // A row lock serializes concurrent writers; history is append-only and
     // counts every edit. No additional schema column/migration is needed.
     const currentVersion=(await db.query(
       "SELECT COUNT(*)::int version FROM cc_goal_history"+
       " WHERE organization_id=$1 AND campaign_id=$2 AND goal_id=$3",
       [c.organization_id,c.id,previous.id])).rows[0].version;
     if(currentVersion!==expectedVersion)
       throw bad(409,'Goal changed by another manager; refresh before saving');
     const row=(await db.query(
       'UPDATE cc_goals SET '+updates.join(',')+',updated_at=clock_timestamp() WHERE id=$'+(values.length+1)+
       ' AND organization_id=$'+(values.length+2)+' RETURNING '+fields,
       [...values,previous.id,c.organization_id])).rows[0];
     const action=row.status==='archived'?'archived':'updated';
     await db.query('INSERT INTO cc_goal_history(organization_id,campaign_id,goal_id,actor_subject,event_kind,snapshot) VALUES($1,$2,$3,$4,$5,$6)',
       [c.organization_id,c.id,row.id,req.userId,action,JSON.stringify({before:previous,after:row})]);
     await log(db,c.organization_id,c.id,req.userId,'goal.'+action,row.id);
     return {...row,version:currentVersion+1};
   });
   res.json(updated);
 }));
 router.get('/:id/history',wrap(async(req,res)=>{
   if(!uuid(req.params.id))throw bad(400,'Invalid goal');
   const goal=(await pool.query('SELECT organization_id,campaign_id FROM cc_goals WHERE id=$1',[req.params.id])).rows[0];
   if(!goal)throw bad(404,'Goal not found');
   const c=await campaignAccess(pool,goal.campaign_id,req.userId);
   if(c.organization_id!==goal.organization_id)throw bad(404,'Goal not found');
   need(c.role,['owner','manager','finance','auditor']);
   const page=Number(req.query.page??1),limit=30;
   if(!Number.isSafeInteger(page)||page<1||page>10000)throw bad(400,'Invalid history page');
   const args=[c.organization_id,c.id,req.params.id];
   const [rows,count]=await Promise.all([
    pool.query("SELECT actor_subject,event_kind,created_at,id,"+
     " CASE WHEN event_kind='created' THEN snapshot->>'status'"+
     " ELSE snapshot->'after'->>'status' END status,"+
     " CASE WHEN event_kind='created' THEN snapshot->>'current_value'"+
     " ELSE snapshot->'after'->>'current_value' END current_value"+
     " FROM cc_goal_history WHERE organization_id=$1 AND campaign_id=$2 AND goal_id=$3"+
     " ORDER BY created_at DESC,id DESC LIMIT $4 OFFSET $5",
     [...args,limit,(page-1)*limit]),
    pool.query("SELECT COUNT(*)::int total FROM cc_goal_history"+
     " WHERE organization_id=$1 AND campaign_id=$2 AND goal_id=$3",args)
   ]);
   res.set('Cache-Control','private,no-store');
   res.json({history:rows.rows,total:count.rows[0].total,
    page,pageCount:Math.max(1,Math.ceil(count.rows[0].total/limit)),limit,
    appendOnly:true,organizationScoped:true});
 }));
 return router;
}
