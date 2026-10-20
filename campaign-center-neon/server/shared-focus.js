import {Router} from 'express';

// Persistent team Focus is human-curated. The API never contacts a telephony,
// finance, payment, notification or AI service.
export default function sharedFocusRouter({pool,campaignAccess,planPolicy,bad,uuid,log}){
 const router=Router(),wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const leaders=new Set(['owner','manager']);
 const readerRoles=new Set(['owner','manager','squad_leader','askan','finance','auditor']);
 function teamParam(req){
  const name=req.query.team??req.body?.team??'';
  if(typeof name!=='string'||name.length>100)throw bad(400,'Invalid team');
  return name.trim();
 }
 async function scope(db,req,canWrite=false){
  const c=await campaignAccess(db,req.params.cid,req.userId);
  const access=await planPolicy.forMember(db,c.organization_id,req.userId);
  planPolicy.requireFeature(access,'shared_focus');
  if(!readerRoles.has(c.role))throw bad(403,'Campaign membership required');
  if(canWrite&&!leaders.has(c.role)&&c.role!=='squad_leader')
   throw bad(403,'Only leadership and team captain can curate Focus');
  const team=teamParam(req);
  if(!leaders.has(c.role)){
   const row=(await db.query(
    "SELECT team_name FROM cc_campaign_members WHERE organization_id=$1"+
    " AND campaign_id=$2 AND subject=$3",
    [c.organization_id,c.id,req.userId])).rows[0];
   if(!row||!row.team_name||team!==row.team_name)
    throw bad(403,'Only your named campaign team is available');
  }
  if(canWrite&&c.status==='closed')throw bad(409,'Closed campaign');
  return {c,team,leader:leaders.has(c.role),curator:leaders.has(c.role)||c.role==='squad_leader'};
 }
 const boardSql="SELECT id,task_ids,version,updated_by,updated_at"+
  " FROM cc_shared_focus_boards WHERE organization_id=$1 AND campaign_id=$2 AND team_name=$3";
 async function board(db,c,team){
  return (await db.query(boardSql,[c.organization_id,c.id,team])).rows[0]||null;
 }
 async function visibleTasks(db,ctx,ids){
  if(!ids?.length)return [];
  const {c,team,leader}=ctx;
  const result=await db.query(
   "SELECT a.id,a.title,a.kind,a.priority,a.status,a.due_at,"+
   " a.assignee_subject,selected.ord FROM unnest($3::uuid[]) WITH ORDINALITY"+
   " AS selected(task_id,ord) JOIN cc_assignments a"+
   " ON a.id=selected.task_id AND a.organization_id=$1 AND a.campaign_id=$2"+
   " WHERE a.status IN ('open','in_progress')"+
   " AND ($4::boolean OR ($5::boolean AND a.assignee_subject=$6)"+
   " OR ($7::boolean AND EXISTS ("+
   " SELECT 1 FROM cc_campaign_members cm WHERE cm.organization_id=$1"+
   " AND cm.campaign_id=$2 AND cm.subject=a.assignee_subject AND cm.team_name=$8)))"+
   " ORDER BY selected.ord",
   [c.organization_id,c.id,ids,leader,c.role==='askan',reqSubject(ctx),c.role==='squad_leader',team]);
  return result.rows.map(({ord,...task})=>task);
 }
 function reqSubject(ctx){return ctx.userId;}
 async function response(db,ctx,withHistory=false){
  const selected=await board(db,ctx.c,ctx.team);
  const tasks=await visibleTasks(db,ctx,selected?.task_ids||[]);
  const result={
   boardId:selected?.id??null,team:ctx.team,version:selected?.version??0,
   tasks,updatedAt:selected?.updated_at??null,
   ...(ctx.curator?{selectedCount:selected?.task_ids?.length??0,
     updatedBy:selected?.updated_by??null}:{}),
   editable:ctx.curator,memberTaskVisibilityRestricted:true,
   sharedFocusPersisted:true,fullyManuallyCurated:true
  };
  if(withHistory&&ctx.curator&&selected){
   const rows=await db.query(
    "SELECT actor_subject,version,created_at,"+
    " cardinality(previous_task_ids)::int previous_count,"+
    " cardinality(new_task_ids)::int new_count"+
    " FROM cc_shared_focus_history WHERE organization_id=$1 AND campaign_id=$2"+
    " AND board_id=$3 ORDER BY version DESC LIMIT 30",
    [ctx.c.organization_id,ctx.c.id,selected.id]);
   result.history=rows.rows;
  }
  return result;
 }
 router.get('/campaigns/:cid/shared-focus',wrap(async(req,res)=>{
  const ctx=await scope(pool,req);ctx.userId=req.userId;
  res.set('Cache-Control','private,no-store').json(await response(pool,ctx,true));
 }));
 router.get('/campaigns/:cid/shared-focus/candidates',wrap(async(req,res)=>{
  const ctx=await scope(pool,req,true),query=req.query.q??'';
  if(typeof query!=='string'||query.length>100)throw bad(400,'Invalid search');
  const {c,team}=ctx;
  const search=query.trim();
  const rows=await pool.query(
   "SELECT a.id,a.title,a.priority,a.due_at,a.assignee_subject"+
   " FROM cc_assignments a"+
   " WHERE a.organization_id=$1 AND a.campaign_id=$2"+
   " AND a.status IN ('open','in_progress')"+
   " AND ($3='' OR EXISTS(SELECT 1 FROM cc_campaign_members cm"+
   " WHERE cm.organization_id=$1 AND cm.campaign_id=$2"+
   " AND cm.subject=a.assignee_subject AND cm.team_name=$3))"+
   " AND ($4='' OR a.title ILIKE '%'||$4||'%')"+
   " ORDER BY (CASE WHEN a.due_at<now() THEN 0 ELSE 1 END),"+
   " (CASE a.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END),"+
   " a.due_at ASC NULLS LAST,a.created_at ASC,a.id ASC LIMIT 50",
   [c.organization_id,c.id,team,search]);
  res.set('Cache-Control','private,no-store').json({
   candidates:rows.rows,limit:50,search,notCompleteList:true,curatorOnly:true
  });
 }));
 router.put('/campaigns/:cid/shared-focus',wrap(async(req,res)=>{
  const ids=req.body?.taskIds,expected=req.body?.expectedVersion;
  if(!Array.isArray(ids)||ids.length>3||ids.some(id=>!uuid(id))||
    new Set(ids).size!==ids.length)throw bad(400,'Choose 0 to 3 distinct task IDs');
  if(!Number.isSafeInteger(expected)||expected<0)throw bad(400,'Expected board version required');
  const db=await pool.connect();
  try{
   await db.query('BEGIN');
   const ctx=await scope(db,req,true);ctx.userId=req.userId;
   const {c,team}=ctx;
   if(team){
    const group=await db.query(
     "SELECT 1 FROM cc_campaign_members WHERE organization_id=$1"+
     " AND campaign_id=$2 AND team_name=$3 LIMIT 1",
     [c.organization_id,c.id,team]);
    if(!group.rowCount)throw bad(400,'Unknown campaign team');
   }
   // Serialize writes on the same campaign board even if it does not exist yet.
   await db.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))",
    [c.id,team]);
   const prior=await board(db,c,team);
   if((prior?.version??0)!==expected)
    throw bad(409,'Another leader updated Shared Focus; reload first');
   if(ids.length){
    const matched=await db.query(
     "SELECT a.id FROM cc_assignments a"+
     " WHERE a.organization_id=$1 AND a.campaign_id=$2 AND a.id=ANY($3::uuid[])"+
     " AND a.status IN ('open','in_progress')"+
     " AND ($4='' OR EXISTS(SELECT 1 FROM cc_campaign_members cm"+
     " WHERE cm.organization_id=$1 AND cm.campaign_id=$2"+
     " AND cm.subject=a.assignee_subject AND cm.team_name=$4))",
     [c.organization_id,c.id,ids,team]);
    if(matched.rowCount!==ids.length)
     throw bad(400,'An assigned Focus task is completed, deleted, or outside the selected team');
   }
   const prev=prior?.task_ids??[];
   if(JSON.stringify(prev)===JSON.stringify(ids)){
    await db.query('COMMIT');
    return res.set('Cache-Control','private,no-store').json({...await response(pool,ctx,true),unchanged:true});
   }
   const changed=prior?(await db.query(
    "UPDATE cc_shared_focus_boards SET task_ids=$4::uuid[],version=version+1,"+
    " updated_by=$5,updated_at=now()"+
    " WHERE organization_id=$1 AND campaign_id=$2 AND team_name=$3"+
    " RETURNING id,version",
    [c.organization_id,c.id,team,ids,req.userId])).rows[0]:
   (await db.query(
    "INSERT INTO cc_shared_focus_boards(organization_id,campaign_id,team_name,"+
    " task_ids,version,updated_by) VALUES($1,$2,$3,$4::uuid[],1,$5)"+
    " RETURNING id,version",[c.organization_id,c.id,team,ids,req.userId])).rows[0];
   await db.query(
    "INSERT INTO cc_shared_focus_history(organization_id,campaign_id,board_id,"+
    " actor_subject,version,previous_task_ids,new_task_ids)"+
    " VALUES($1,$2,$3,$4,$5,$6::uuid[],$7::uuid[])",
    [c.organization_id,c.id,changed.id,req.userId,changed.version,prev,ids]);
   await log(db,c.organization_id,c.id,req.userId,'focus.shared_curated',changed.id,
    {team,version:changed.version,selectedCount:ids.length});
   await db.query('COMMIT');
   res.set('Cache-Control','private,no-store').json(await response(pool,ctx,true));
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
  finally{db.release();}
 }));
 return router;
}
