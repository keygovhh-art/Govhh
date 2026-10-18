import {Router} from 'express';

// Askan Pro — human triage of actual Clarity recommendations.
// A decision is not a phone call, task completion, donation or outbound job.
export default function proNextActionRouter({pool,campaignAccess,bad,log}){
 const router=Router(),wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const elevated=new Set(['owner','manager','finance','auditor']);
 const decisions=new Set(['accepted','deferred','skipped','unmarked']);
 const id=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
 async function eligible(db,req,c,source,sourceId){
  const admin=elevated.has(c.role),squad=c.role==='squad_leader';
  if(source==='task'){
   const r=await db.query(
    "SELECT a.id FROM cc_assignments a WHERE a.id=$1 AND a.organization_id=$2 AND a.campaign_id=$3"+
    " AND a.status IN ('open','in_progress') AND"+
    " ($4::boolean OR a.assignee_subject=$5 OR ($6::boolean AND EXISTS ("+
    " SELECT 1 FROM cc_campaign_members me JOIN cc_campaign_members peer ON"+
    " peer.organization_id=me.organization_id AND peer.campaign_id=me.campaign_id"+
    " AND peer.team_name=me.team_name AND peer.team_name<>''"+
    " WHERE me.organization_id=$2 AND me.campaign_id=$3 AND me.subject=$5"+
    " AND peer.subject=a.assignee_subject)))",
    [sourceId,c.organization_id,c.id,admin,req.userId,squad]);
   return (r.rowCount??0)>0;
  }
  if(source==='crm_followup'){
   const r=await db.query(
    "SELECT c.id FROM cc_contacts c JOIN cc_pro_contact_profiles p"+
    " ON p.contact_id=c.id AND p.organization_id=c.organization_id AND p.campaign_id=c.campaign_id"+
    " WHERE c.id=$1 AND c.organization_id=$2 AND c.campaign_id=$3"+
    " AND c.do_not_call=false AND c.phone<>'' AND p.stage<>'closed' AND p.next_followup_at IS NOT NULL"+
    " AND (c.claimed_by IS NULL OR c.claim_expires_at<=now() OR c.claimed_by=$4)"+
    " AND ((c.privacy='private' AND c.created_by=$4) OR"+
    " (c.privacy='campaign' AND ($5::boolean OR (c.assigned_team<>'' AND c.assigned_team=("+
    " SELECT team_name FROM cc_campaign_members WHERE organization_id=$2 AND campaign_id=$3 AND subject=$4)))))",
    [sourceId,c.organization_id,c.id,req.userId,admin]);
   return (r.rowCount??0)>0;
  }
  return false;
 }
 async function transaction(fn){
  const db=await pool.connect();
  try{await db.query('BEGIN');const r=await fn(db);await db.query('COMMIT');return r;}
  catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}
  finally{db.release();}
 }
 router.get('/campaigns/:cid/next-actions',wrap(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);
  const [choices,events]=await Promise.all([
   pool.query('SELECT source_type,source_id,decision,note,updated_at FROM cc_pro_next_action_choices'+
    ' WHERE organization_id=$1 AND campaign_id=$2 AND author_subject=$3 ORDER BY updated_at DESC LIMIT 120',
    [c.organization_id,c.id,req.userId]),
   pool.query('SELECT source_type,source_id,decision,recorded_at FROM cc_pro_next_action_history'+
    ' WHERE organization_id=$1 AND campaign_id=$2 AND author_subject=$3 ORDER BY recorded_at DESC,id DESC LIMIT 20',
    [c.organization_id,c.id,req.userId])
  ]);
  res.set('Cache-Control','private,no-store').json({
   choices:choices.rows,history:events.rows,ownerOnly:true,
   noAutomaticActions:true,doesNotCompleteTask:true});
 }));
 router.put('/campaigns/:cid/next-actions/:source/:id',wrap(async(req,res)=>{
  const source=req.params.source,sourceId=req.params.id,decision=req.body?.decision,note=req.body?.note??'';
  if(!['task','crm_followup'].includes(source)||!id.test(sourceId))throw bad(400,'Invalid action source');
  if(!decisions.has(decision)||typeof note!=='string'||note.length>300)throw bad(400,'Invalid decision or note');
  const result=await transaction(async db=>{
   const c=await campaignAccess(db,req.params.cid,req.userId);
   if(c.status==='closed')throw bad(409,'Campaign closed');
   if(!await eligible(db,req,c,source,sourceId))
    throw bad(404,'Recommendation is no longer available to you');
   const r=await db.query(
    'INSERT INTO cc_pro_next_action_choices(organization_id,campaign_id,author_subject,source_type,source_id,decision,note)'+
    ' VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(organization_id,campaign_id,author_subject,source_type,source_id)'+
    ' DO UPDATE SET decision=excluded.decision,note=excluded.note,updated_at=now()'+
    ' WHERE cc_pro_next_action_choices.decision IS DISTINCT FROM excluded.decision'+
    ' OR cc_pro_next_action_choices.note IS DISTINCT FROM excluded.note'+
    ' RETURNING source_type,source_id,decision,note,updated_at',
    [c.organization_id,c.id,req.userId,source,sourceId,decision,note.trim()]);
   if(!r.rowCount){
    const old=(await db.query(
     'SELECT source_type,source_id,decision,note,updated_at FROM cc_pro_next_action_choices'+
     ' WHERE organization_id=$1 AND campaign_id=$2 AND author_subject=$3 AND source_type=$4 AND source_id=$5',
     [c.organization_id,c.id,req.userId,source,sourceId])).rows[0];
    return {choice:old,unchanged:true};
   }
   await db.query(
    'INSERT INTO cc_pro_next_action_history(organization_id,campaign_id,author_subject,source_type,source_id,decision,note)'+
    ' VALUES($1,$2,$3,$4,$5,$6,$7)',
    [c.organization_id,c.id,req.userId,source,sourceId,decision,note.trim()]);
   // Shared activity logs never disclose private CRM source IDs or note content.
   await log(db,c.organization_id,c.id,req.userId,'pro.next_action_decided',null,
    {type:source,decision});
   return {choice:r.rows[0],unchanged:false};
  });
  res.set('Cache-Control','private,no-store').json({...result,noAutomaticActions:true,taskStatusUnchanged:true});
 }));
 return router;
}
