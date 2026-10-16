import {Router} from 'express';

// Organization institutional notes: append-only leadership knowledge.
// Not a generative AI memory, automated reminder, or donor data sync.
export default function organizationMemoryRouter({pool,bad,uuid,trim,log}){
 const router=Router(),run=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const kinds=['policy','lesson','handoff','risk'];
 async function leader(db,org,user){
  if(!uuid(org))throw bad(400,'Invalid organization');
  const row=(await db.query(
   "SELECT role FROM cc_memberships WHERE organization_id=$1 AND subject=$2 AND membership_status='active'",
   [org,user])).rows[0];
  if(!row)throw bad(404,'Organization not found');
  if(!['owner','manager'].includes(row.role))throw bad(403,'Leadership permission required');
 }
 const checkDue=x=>{
  if(x==null||x==='')return null;
  if(typeof x!=='string'||x.length>35||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(x)||
    !Number.isFinite(Date.parse(x)))throw bad(400,'Review date requires an ISO timezone');
  return new Date(x).toISOString();
 };
 async function tx(fn){
  const db=await pool.connect();
  try{await db.query('BEGIN');const value=await fn(db);await db.query('COMMIT');return value;}
  catch(error){await db.query('ROLLBACK');if(error.code==='23505')throw bad(409,'This memory version has already been replaced');throw error;}
  finally{db.release();}
 }
 router.get('/organizations/:oid/memory',run(async(req,res)=>{
  await leader(pool,req.params.oid,req.userId);
  const history=req.query.history==='true',due=req.query.due==='true';
  const items=(await pool.query(
   "SELECT e.id,e.source_campaign_id,e.author_subject,e.category,e.title,e.summary,e.review_due_at,e.supersedes_id,e.created_at"+
   " FROM cc_org_memory_entries e WHERE e.organization_id=$1"+
   " AND ($2::boolean OR NOT EXISTS(SELECT 1 FROM cc_org_memory_entries successor WHERE successor.supersedes_id=e.id))"+
   " AND (NOT $3::boolean OR (e.review_due_at IS NOT NULL AND e.review_due_at<now()))"+
   " ORDER BY e.created_at DESC,e.id DESC LIMIT 100",
   [req.params.oid,history,due])).rows;
  res.set('Cache-Control','private,no-store');
  res.json({entries:items,limit:100,history,dueOnly:due,scope:'active_organization_leadership',
   manualKnowledgeOnly:true,doesNotSendReminders:true});
 }));
 router.post('/organizations/:oid/memory',run(async(req,res)=>{
  const {category,title,summary,sourceCampaignId=null,supersedesId=null,reviewDueAt=null}=req.body||{};
  if(!kinds.includes(category)||typeof title!=='string'||!title.trim()||title.length>180||
    typeof summary!=='string'||!summary.trim()||summary.length>3000)
   throw bad(400,'Invalid knowledge category/title/summary');
  if(sourceCampaignId&&!uuid(sourceCampaignId))throw bad(400,'Invalid campaign');
  if(supersedesId&&!uuid(supersedesId))throw bad(400,'Invalid memory version');
  const due=checkDue(reviewDueAt);
  const created=await tx(async db=>{
   await leader(db,req.params.oid,req.userId);
   if(sourceCampaignId){
    const valid=(await db.query('SELECT 1 FROM cc_campaigns WHERE organization_id=$1 AND id=$2',
     [req.params.oid,sourceCampaignId])).rowCount;
    if(!valid)throw bad(404,'Campaign not in this organization');
   }
   if(supersedesId){
    const old=(await db.query(
     'SELECT id FROM cc_org_memory_entries WHERE organization_id=$1 AND id=$2 FOR UPDATE',
     [req.params.oid,supersedesId])).rows[0];
    if(!old)throw bad(404,'Knowledge entry not found');
    const next=(await db.query('SELECT 1 FROM cc_org_memory_entries WHERE supersedes_id=$1',[old.id])).rowCount;
    if(next)throw bad(409,'Knowledge entry already superseded');
   }
   const entry=(await db.query(
    'INSERT INTO cc_org_memory_entries(organization_id,source_campaign_id,author_subject,category,title,summary,review_due_at,supersedes_id)'+
    ' VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,category,title,review_due_at,created_at,supersedes_id',
    [req.params.oid,sourceCampaignId,req.userId,category,trim(title,180),trim(summary,3000),due,supersedesId])).rows[0];
   // Never place confidential note contents in the generic activity feed.
   await log(db,req.params.oid,sourceCampaignId,req.userId,'organization.memory.'+(supersedesId?'revised':'created'),
    entry.id,{kind:category,supersedes:!!supersedesId});
   return entry;
  });
  res.status(201).json({...created,manualKnowledgeOnly:true});
 }));
 return router;
}
