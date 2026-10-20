import {Router} from 'express';

// Chesed Quick pilot: truthful, on-demand daily Focus, warning counts and
// PRIVATE author-only 7-day history. No background job, no SMS/calls or AI.
export function nyDay(date=new Date()){
 const pieces=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const part=name=>pieces.find(p=>p.type===name)?.value;
 return part('year')+'-'+part('month')+'-'+part('day');
}

export default function quickDailyRouter({pool,campaignAccess,planPolicy,bad,log}){
 const router=Router();
 const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const elevated=new Set(['owner','manager','finance','auditor']);
 const fields='id,review_date::text AS review_date,open_tasks,overdue_tasks,due_soon_tasks,critical_tasks,completed_today,goal_warnings,reflection,created_at';
 async function scope(db,req){
  const c=await campaignAccess(db,req.params.cid,req.userId);
  const access=await planPolicy.forMember(db,c.organization_id,req.userId);
  planPolicy.requireFeature(access,'daily_review');
  return c;
 }
 async function snapshot(db,req,c){
  // Exactly the permission classes of GET /api/campaigns/:cid/tasks,
  // but COUNT aggregates ALL accessible rows, not a paginated 200.
  // A squad leader without a named team never inherits empty-team tasks.
  const [tasks,done,goals]=await Promise.all([
   db.query(
    "SELECT COUNT(*) FILTER (WHERE a.status IN ('open','in_progress'))::int AS open_tasks,"+
    " COUNT(*) FILTER (WHERE a.status IN ('open','in_progress') AND a.due_at<now())::int AS overdue_tasks,"+
    " COUNT(*) FILTER (WHERE a.status IN ('open','in_progress') AND a.due_at>=now() AND a.due_at<now()+interval '48 hours')::int AS due_soon_tasks,"+
    " COUNT(*) FILTER (WHERE a.status IN ('open','in_progress') AND a.priority='critical')::int AS critical_tasks"+
    " FROM cc_assignments a WHERE a.organization_id=$1 AND a.campaign_id=$2 AND"+
    " ($3::boolean OR a.assignee_subject=$4 OR ($5::boolean AND EXISTS("+
    " SELECT 1 FROM cc_campaign_members me JOIN cc_campaign_members teammate"+
    " ON teammate.organization_id=me.organization_id AND teammate.campaign_id=me.campaign_id"+
    " AND teammate.team_name=me.team_name AND teammate.team_name<>''"+
    " WHERE me.organization_id=$1 AND me.campaign_id=$2 AND me.subject=$4"+
    " AND teammate.subject=a.assignee_subject)))",
    [c.organization_id,c.id,elevated.has(c.role),req.userId,c.role==='squad_leader']),
   db.query(
    "SELECT COUNT(*)::int AS completed_today FROM cc_activity_events WHERE"+
    " organization_id=$1 AND campaign_id=$2 AND actor_subject=$3 AND event_type='task.status'"+
    " AND details->>'to'='done' AND (created_at AT TIME ZONE 'America/New_York')::date=$4::date",
    [c.organization_id,c.id,req.userId,nyDay()]),
   db.query(
    "SELECT COUNT(*)::int AS goal_warnings FROM cc_goals WHERE"+
    " organization_id=$1 AND campaign_id=$2 AND"+
    " (status='at_risk' OR (status='active' AND due_on<$3::date))",
    [c.organization_id,c.id,nyDay()])
  ]);
  return {...tasks.rows[0],...done.rows[0],...goals.rows[0]};
 }
 const watch=s=>[
  ...(s.overdue_tasks?[{kind:'overdue',count:s.overdue_tasks,level:'attention'}]:[]),
  ...(s.critical_tasks?[{kind:'critical',count:s.critical_tasks,level:'attention'}]:[]),
  ...(s.goal_warnings?[{kind:'goals',count:s.goal_warnings,level:'attention'}]:[]),
  ...(s.due_soon_tasks?[{kind:'due_soon',count:s.due_soon_tasks,level:'info'}]:[])
 ];
 async function history(db,req,c,day){
  const r=await db.query(
   "SELECT "+fields+" FROM cc_quick_daily_reviews WHERE organization_id=$1"+
   " AND campaign_id=$2 AND author_subject=$3"+
   " AND review_date BETWEEN ($4::date - INTERVAL '6 days')::date AND $4::date"+
   " ORDER BY review_date DESC LIMIT 7",
   [c.organization_id,c.id,req.userId,day]);
  return r.rows;
 }
 // Shared campaign Focus uses the entire database, never the front-end's
 // 200 most-recent-task page. Keep exactly the same team visibility as
 // the authenticated Quick Watch, including rejecting blank team names.
 router.get('/campaigns/:cid/focus',wrap(async(req,res)=>{
  const c=await scope(pool,req);
  const args=[c.organization_id,c.id,elevated.has(c.role),req.userId,c.role==='squad_leader'];
  const visible=
   " WITH visible AS ("+
   " SELECT a.id,a.title,a.kind,a.priority,a.status,a.due_at,"+
   " a.assignee_subject,a.created_at,(a.assignee_subject=$4) mine"+
   " FROM cc_assignments a WHERE a.organization_id=$1 AND a.campaign_id=$2"+
   " AND a.status IN ('open','in_progress')"+
   " AND ($3::boolean OR a.assignee_subject=$4 OR ($5::boolean AND EXISTS ("+
   " SELECT 1 FROM cc_campaign_members me JOIN cc_campaign_members peer"+
   " ON peer.organization_id=me.organization_id AND peer.campaign_id=me.campaign_id"+
   " AND peer.team_name=me.team_name AND me.team_name<>''"+
   " WHERE me.organization_id=$1 AND me.campaign_id=$2 AND me.subject=$4"+
   " AND peer.subject=a.assignee_subject)))"+
   " )";
  const [count,chosen]=await Promise.all([
   pool.query(visible+" SELECT COUNT(*)::int visible_open,"+
    " COUNT(*) FILTER(WHERE mine)::int own_open FROM visible",args),
   pool.query(visible+", scope AS (SELECT COUNT(*)::int own_open FROM visible WHERE mine)"+
    " SELECT v.id,v.title,v.kind,v.priority,v.status,v.due_at,v.assignee_subject,"+
    " v.created_at,v.mine FROM visible v CROSS JOIN scope sc"+
    " WHERE v.mine OR sc.own_open=0"+
    " ORDER BY (CASE WHEN v.due_at<now() THEN 0 ELSE 1 END),"+
    " (CASE v.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1"+
    " WHEN 'normal' THEN 2 WHEN 'low' THEN 3 ELSE 4 END),"+
    " v.due_at ASC NULLS LAST,v.created_at ASC,v.id ASC LIMIT 3",args)
  ]);
  const totals=count.rows[0],personal=totals.own_open>0;
  res.set('Cache-Control','private,no-store').json({
   tasks:chosen.rows,visibleOpenTaskCount:totals.visible_open,
   ownOpenTaskCount:totals.own_open,
   chosenScope:personal?'personal':'permitted_campaign_or_team',
   allVisibleTasksConsidered:true,limit:3,
   selection:'overdue_then_priority_then_due_date_then_created_at',
   artificialIntelligence:false,automatedNotifications:false
  });
 }));
 router.get('/campaigns/:cid/daily',wrap(async(req,res)=>{
  const c=await scope(pool,req),day=nyDay();
  const [stats,saved]=await Promise.all([snapshot(pool,req,c),history(pool,req,c,day)]);
  res.set('Cache-Control','private,no-store');
  res.json({
   day,stats,watch:watch(stats),reviews:saved,
   todaySaved:saved.some(x=>String(x.review_date).slice(0,10)===day),
   dailySource:'current_database',watchIsOnDemand:true,
   lastSevenDaysOnly:true,historyIsAuthorPrivate:true,automatedNotifications:false
  });
 }));
 router.post('/campaigns/:cid/daily/review',wrap(async(req,res)=>{
  const reflection=req.body?.reflection;
  if(typeof reflection!=='string'||reflection.length>500)throw bad(400,'Reflection must be text of up to 500 characters');
  // Keep notes private: never store them in the public/global audit feed.
  const db=await pool.connect();
  try{
   await db.query('BEGIN');
   const c=await scope(db,req);
   if(c.status==='closed')throw bad(409,'Closed campaigns cannot create new daily reviews');
   const day=nyDay();
   const old=(await history(db,req,c,day)).find(x=>String(x.review_date).slice(0,10)===day);
   if(old){
    await db.query('COMMIT');
    res.set('Cache-Control','private,no-store').json({review:old,alreadySaved:true});
    return;
   }
   const stats=await snapshot(db,req,c);
   const saved=await db.query(
    "INSERT INTO cc_quick_daily_reviews("+
    " organization_id,campaign_id,author_subject,review_date,open_tasks,"+
    " overdue_tasks,due_soon_tasks,critical_tasks,completed_today,goal_warnings,reflection)"+
    " VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)"+
    " ON CONFLICT(organization_id,campaign_id,author_subject,review_date) DO NOTHING RETURNING "+fields,
    [c.organization_id,c.id,req.userId,day,stats.open_tasks,stats.overdue_tasks,
     stats.due_soon_tasks,stats.critical_tasks,stats.completed_today,stats.goal_warnings,reflection.trim()]);
   const inserted=saved.rows[0];
   if(inserted){
    await log(db,c.organization_id,c.id,req.userId,'quick.daily_review_saved',inserted.id,{day});
   }
   const review=inserted||(await history(db,req,c,day)).find(x=>String(x.review_date).slice(0,10)===day);
   await db.query('COMMIT');
   res.set('Cache-Control','private,no-store').status(inserted?201:200).json({review,alreadySaved:!inserted});
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
 }));
 return router;
}
