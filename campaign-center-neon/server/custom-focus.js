import {Router} from 'express';

// Custom Focus is a transparent scoring PREVIEW, not predictive AI.
// It neither schedules tasks nor contacts donors. Source-level visibility
// follows authenticated campaign/team and private-contact rules.
export default function customFocusRouter({pool,campaignAccess,bad,log}){
 const router=Router(),run=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const fields=['overdueWeight','dueSoonWeight','highPriorityWeight','followupWeight'];
 const defaults={overdueWeight:40,dueSoonWeight:15,highPriorityWeight:20,followupWeight:10};
 const leaders=['owner','manager'],elevated=['owner','manager','finance','auditor'];
 const toClient=row=>row?{
  overdueWeight:row.overdue_weight,dueSoonWeight:row.due_soon_weight,
  highPriorityWeight:row.high_priority_weight,followupWeight:row.followup_weight
 }:defaults;
 const verify=x=>{
  if(!x||typeof x!=='object'||Array.isArray(x)||fields.some(f=>!Number.isInteger(x[f])||x[f]<0||x[f]>100)||
    fields.reduce((n,f)=>n+x[f],0)===0)throw bad(400,'Four weights from 0–100, at least one positive');
  return x;
 };
 async function fetchRules(db,c){
  const row=(await db.query(
   'SELECT * FROM cc_custom_focus_profiles WHERE organization_id=$1 AND campaign_id=$2',
   [c.organization_id,c.id])).rows[0];
  return toClient(row);
 }
 router.get('/campaigns/:cid/focus-rules',run(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);
  const weights=await fetchRules(pool,c);
  res.set('Cache-Control','private,no-store');
  res.json({weights,canEdit:leaders.includes(c.role),ruleBasedOnly:true,entitlementNotYetEnforced:true});
 }));
 router.put('/campaigns/:cid/focus-rules',run(async(req,res)=>{
  const weights=verify(req.body);
  const db=await pool.connect();
  let out;
  try{
   await db.query('BEGIN');
   const c=await campaignAccess(db,req.params.cid,req.userId);
   if(!leaders.includes(c.role))throw bad(403,'Custom rule editing requires organization leadership');
   if(c.status==='closed')throw bad(409,'Campaign closed');
   // Serialize simultaneous edits by locking canonical campaign row.
   await db.query('SELECT id FROM cc_campaigns WHERE organization_id=$1 AND id=$2 FOR UPDATE',[c.organization_id,c.id]);
   const old=await fetchRules(db,c);
   if(fields.every(f=>old[f]===weights[f])){
    out={weights,unchanged:true};
   }else{
    await db.query(
     'INSERT INTO cc_custom_focus_profiles(organization_id,campaign_id,overdue_weight,due_soon_weight,high_priority_weight,followup_weight,updated_by)'+
     ' VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(campaign_id) DO UPDATE SET'+
     ' overdue_weight=excluded.overdue_weight,due_soon_weight=excluded.due_soon_weight,'+
     ' high_priority_weight=excluded.high_priority_weight,followup_weight=excluded.followup_weight,'+
     ' updated_by=excluded.updated_by,updated_at=now()',
     [c.organization_id,c.id,weights.overdueWeight,weights.dueSoonWeight,weights.highPriorityWeight,weights.followupWeight,req.userId]);
    await db.query(
     'INSERT INTO cc_custom_focus_history(organization_id,campaign_id,actor_subject,overdue_weight,due_soon_weight,high_priority_weight,followup_weight) VALUES($1,$2,$3,$4,$5,$6,$7)',
     [c.organization_id,c.id,req.userId,weights.overdueWeight,weights.dueSoonWeight,weights.highPriorityWeight,weights.followupWeight]);
    await log(db,c.organization_id,c.id,req.userId,'custom.focus_rules.updated',c.id,{changed:true});
    out={weights,unchanged:false};
   }
   await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  res.json({...out,ruleBasedOnly:true});
 }));
 router.get('/campaigns/:cid/focus-preview',run(async(req,res)=>{
  const c=await campaignAccess(pool,req.params.cid,req.userId);
  const weights=await fetchRules(pool,c);
  const isHigh=elevated.includes(c.role),squad=c.role==='squad_leader';
  const [tasks,followups]=await Promise.all([
   pool.query(
    "SELECT a.id,a.title,a.priority,a.due_at FROM cc_assignments a"+
    " WHERE a.organization_id=$1 AND a.campaign_id=$2 AND a.status IN ('open','in_progress')"+
    " AND ($3::boolean OR a.assignee_subject=$4 OR ($5::boolean AND EXISTS("+
    " SELECT 1 FROM cc_campaign_members leader JOIN cc_campaign_members worker"+
    " ON worker.organization_id=leader.organization_id AND worker.campaign_id=leader.campaign_id"+
    " AND worker.team_name=leader.team_name AND worker.team_name<>''"+
    " WHERE leader.organization_id=$1 AND leader.campaign_id=$2 AND leader.subject=$4"+
    " AND worker.subject=a.assignee_subject)))"+
    " ORDER BY a.created_at DESC LIMIT 100",[c.organization_id,c.id,isHigh,req.userId,squad]),
   pool.query(
    "SELECT c.id,c.display_name,p.priority,p.next_followup_at FROM cc_contacts c"+
    " JOIN cc_pro_contact_profiles p ON p.contact_id=c.id AND p.organization_id=c.organization_id"+
    " WHERE c.organization_id=$1 AND c.campaign_id=$2 AND c.do_not_call=false AND p.next_followup_at IS NOT NULL"+
    " AND ((c.privacy='private' AND c.created_by=$3) OR"+
    " (c.privacy='campaign' AND ($4::boolean OR c.assigned_team=("+
    " SELECT team_name FROM cc_campaign_members WHERE organization_id=$1 AND campaign_id=$2 AND subject=$3))))"+
    " ORDER BY p.next_followup_at ASC LIMIT 100",[c.organization_id,c.id,req.userId,isHigh])
  ]);
  const now=Date.now();
  const score=(due,priority,followup)=>{
   const when=due?new Date(due).getTime():Infinity;
   return (when<=now?weights.overdueWeight:when<=now+172800000?weights.dueSoonWeight:0)+
    (['high','critical'].includes(priority)?weights.highPriorityWeight:0)+
    (followup?weights.followupWeight:0);
  };
  const all=[
   ...tasks.rows.map(t=>({source:'task',id:t.id,title:t.title,dueAt:t.due_at,priority:t.priority,
    score:score(t.due_at,t.priority,false)})),
   ...followups.rows.map(f=>({source:'crm_followup',id:f.id,title:f.display_name,dueAt:f.next_followup_at,priority:f.priority,
    score:score(f.next_followup_at,f.priority,true)}))
  ].sort((a,b)=>b.score-a.score||(new Date(a.dueAt||'9999-01-01')-new Date(b.dueAt||'9999-01-01'))||a.id.localeCompare(b.id)).slice(0,10);
  res.set('Cache-Control','private,no-store');
  res.json({recommendations:all,weights,scoped:true,ruleBasedOnly:true,doesNotTriggerActions:true,
   note:'Scores are computed from currently recorded authorized tasks and contacts. This is not AI, automatic calls, or a performance score.'});
 }));
 return router;
}
