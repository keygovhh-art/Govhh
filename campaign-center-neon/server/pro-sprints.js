import {Router} from 'express';

// Source-owned seven-day goals; no autonomous scheduling or notifications.
// Users see ONLY their own sprint records even if their organization role is owner.
export default function proSprintRouter({pool,campaignAccess,bad,log,uuid,trim}){
 const router=Router(),run=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 async function tx(fn){
  const db=await pool.connect();
  try{await db.query('BEGIN');const result=await fn(db);await db.query('COMMIT');return result;}
  catch(err){await db.query('ROLLBACK');if(err.code==='23505')throw bad(409,'Only one open personal focus sprint per campaign');throw err;}
  finally{db.release();}
 }
 const validDate=value=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||
     !Number.isFinite(Date.parse(value+'T00:00:00Z'))||
     new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)
    throw bad(400,'Invalid sprint start date');
  return value;
 };
 async function ownedSprint(db,id,user,lock=false){
  if(!uuid(id))throw bad(400,'Invalid sprint ID');
  const q='SELECT * FROM cc_pro_sprints WHERE id=$1 AND owner_subject=$2'+(lock?' FOR UPDATE':'');
  const row=(await db.query(q,[id,user])).rows[0];
  if(!row)throw bad(404,'Private sprint not found');
  const campaign=await campaignAccess(db,row.campaign_id,user);
  if(campaign.organization_id!==row.organization_id)throw bad(404,'Private sprint not found');
  return {sprint:row,campaign};
 }
 router.get('/campaigns/:cid/sprints',run(async(req,res)=>{
  const campaign=await campaignAccess(pool,req.params.cid,req.userId);
  const found=await pool.query(
   'SELECT id,title,starts_on,status,created_at FROM cc_pro_sprints WHERE organization_id=$1 AND campaign_id=$2 AND owner_subject=$3 ORDER BY created_at DESC,id DESC LIMIT 10',
   [campaign.organization_id,campaign.id,req.userId]);
  const sprints=[];
  for(const row of found.rows){
   const steps=await pool.query(
    'SELECT id,day_number,title,completed_at FROM cc_pro_sprint_steps WHERE sprint_id=$1 ORDER BY day_number,created_at,id',[row.id]);
   sprints.push({...row,steps:steps.rows});
  }
  res.set('Cache-Control','private,no-store');
  res.json({sprints,scope:'self'});
 }));
 router.post('/campaigns/:cid/sprints',run(async(req,res)=>{
  const title=trim(req.body?.title,160),startsOn=validDate(req.body?.startsOn);
  const input=req.body?.steps;
  if(!title||!Array.isArray(input)||input.length<1||input.length>21)throw bad(400,'One to 21 actions required');
  const steps=input.map(item=>{
   if(!item||!Number.isInteger(item.day)||item.day<1||item.day>7||
      typeof item.title!=='string'||!item.title.trim()||item.title.length>200)
      throw bad(400,'Invalid day or action');
   return {day:item.day,title:item.title.trim()};
  });
  const result=await tx(async db=>{
   const c=await campaignAccess(db,req.params.cid,req.userId);
   if(c.status==='closed')throw bad(409,'Closed campaign');
   const open=await db.query("SELECT 1 FROM cc_pro_sprints WHERE organization_id=$1 AND campaign_id=$2 AND owner_subject=$3 AND status='open' FOR UPDATE",[c.organization_id,c.id,req.userId]);
   if(open.rowCount)throw bad(409,'Finish your current sprint before starting another');
   const row=(await db.query(
    "INSERT INTO cc_pro_sprints(organization_id,campaign_id,owner_subject,title,starts_on) VALUES($1,$2,$3,$4,$5) RETURNING id,title,starts_on,status",
    [c.organization_id,c.id,req.userId,title,startsOn])).rows[0];
   for(const item of steps){
    await db.query('INSERT INTO cc_pro_sprint_steps(sprint_id,day_number,title) VALUES($1,$2,$3)',
     [row.id,item.day,item.title]);
   }
   await db.query("INSERT INTO cc_pro_sprint_activity(sprint_id,owner_subject,event_type) VALUES($1,$2,'created')",[row.id,req.userId]);
   await log(db,c.organization_id,c.id,req.userId,'pro.sprint.created',row.id,{actionCount:steps.length});
   return row;
  });
  res.status(201).json(result);
 }));
 router.patch('/sprints/:sid/steps/:id',run(async(req,res)=>{
  if(!uuid(req.params.id)||!['done','open'].includes(req.body?.status))throw bad(400,'Invalid step/status');
  const result=await tx(async db=>{
   const {sprint,campaign}=await ownedSprint(db,req.params.sid,req.userId,true);
   if(sprint.status!=='open'||campaign.status==='closed')throw bad(409,'Sprint cannot be updated');
   const step=(await db.query('SELECT * FROM cc_pro_sprint_steps WHERE id=$1 AND sprint_id=$2 FOR UPDATE',
    [req.params.id,sprint.id])).rows[0];
   if(!step)throw bad(404,'Step missing');
   const isDone=req.body.status==='done';
   if(Boolean(step.completed_at)===isDone)return {id:step.id,completed_at:step.completed_at,unchanged:true};
   const changed=(await db.query('UPDATE cc_pro_sprint_steps SET completed_at=$1 WHERE id=$2 RETURNING id,completed_at',
    [isDone?new Date():null,step.id])).rows[0];
   await db.query('INSERT INTO cc_pro_sprint_activity(sprint_id,step_id,owner_subject,event_type) VALUES($1,$2,$3,$4)',
    [sprint.id,step.id,req.userId,isDone?'step_done':'step_reopened']);
   await log(db,campaign.organization_id,campaign.id,req.userId,'pro.sprint.step',sprint.id,
    {stepId:step.id,status:req.body.status});
   return changed;
  });
  res.json(result);
 }));
 router.patch('/sprints/:id/status',run(async(req,res)=>{
  if(!['completed','archived'].includes(req.body?.status))throw bad(400,'Invalid sprint status');
  const result=await tx(async db=>{
   const {sprint,campaign}=await ownedSprint(db,req.params.id,req.userId,true);
   if(sprint.status!=='open'||campaign.status==='closed')throw bad(409,'Sprint is already closed');
   const row=(await db.query('UPDATE cc_pro_sprints SET status=$1,updated_at=now() WHERE id=$2 RETURNING id,status',
    [req.body.status,sprint.id])).rows[0];
   await db.query('INSERT INTO cc_pro_sprint_activity(sprint_id,owner_subject,event_type) VALUES($1,$2,$3)',
    [sprint.id,req.userId,req.body.status]);
   await log(db,campaign.organization_id,campaign.id,req.userId,'pro.sprint.closed',sprint.id,{status:req.body.status});
   return row;
  });
  res.json(result);
 }));
 router.get('/campaigns/:cid/focus-history',run(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);
  const result=await pool.query(
   "SELECT a.event_type,a.recorded_at,s.title AS sprint_title,st.title AS step_title,st.day_number"+
   " FROM cc_pro_sprint_activity a JOIN cc_pro_sprints s ON s.id=a.sprint_id"+
   " LEFT JOIN cc_pro_sprint_steps st ON st.id=a.step_id"+
   " WHERE s.organization_id=$1 AND s.campaign_id=$2 AND s.owner_subject=$3"+
   " AND a.recorded_at>=now()-interval '30 days' ORDER BY a.recorded_at DESC,a.id DESC LIMIT 200",
   [c.organization_id,c.id,req.userId]);
  res.set('Cache-Control','private,no-store');
  res.json({days:30,events:result.rows,scope:'self',notAutomated:true});
 }));
 return router;
}
