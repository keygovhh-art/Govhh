import {Router} from 'express';

// A real multi-person virtual fundraising hall: operator queue, management KPIs,
// dedicated help desk, and a single canonical contact claim. No phone-provider
// dependency; operators use their own phone dialer and log the resulting outcome.
export default function floorRouter({pool,authenticate,campaignAccess,need,log,bad,uuid,trim}){
 const router=Router();router.use(authenticate);
 const handle=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const managers=['owner','manager'];
 async function tx(fn){const db=await pool.connect();try{await db.query('BEGIN');const r=await fn(db);await db.query('COMMIT');return r;}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
 async function context(db,rid,subject,lock=false){
  if(!uuid(rid))throw bad(400,'Invalid fundraising hall');
  const r=(await db.query('SELECT * FROM cc_live_rooms WHERE id=$1'+(lock?' FOR UPDATE':''),[rid])).rows[0];
  if(!r)throw bad(404,'Fundraising hall not found');
  const c=await campaignAccess(db,r.campaign_id,subject);
  if(c.organization_id!==r.organization_id)throw bad(404,'Fundraising hall not found');
  return {room:r,campaign:c,manager:managers.includes(c.role)};
 }
 router.get('/:rid/board',handle(async(req,res)=>{
  const {room,campaign:c,manager}=await context(pool,req.params.rid,req.userId);
  const eligible=['owner','manager','squad_leader','askan'].includes(c.role);
  const [people,tasks,money,calls,help,feed,team]=await Promise.all([
   pool.query("SELECT count(*)::int total,count(*) FILTER(WHERE do_not_call)::int do_not_call,count(*) FILTER(WHERE claimed_by IS NOT NULL AND claim_expires_at>now())::int currently_claimed FROM cc_contacts WHERE campaign_id=$1 AND organization_id=$2 AND privacy='campaign' AND ($3::boolean OR assigned_team=(SELECT team_name FROM cc_campaign_members WHERE campaign_id=$1 AND subject=$4))",[c.id,c.organization_id,manager,req.userId]),
   pool.query("SELECT count(*)::int assigned,count(*) FILTER(WHERE status='done')::int completed,count(*) FILTER(WHERE status='in_progress')::int in_progress FROM cc_assignments WHERE campaign_id=$1 AND organization_id=$2 AND ($3::boolean OR assignee_subject=$4)",[c.id,c.organization_id,manager,req.userId]),
   pool.query("SELECT COALESCE(SUM(amount) FILTER(WHERE event_kind='pledge'),0)::text AS pledged,(COALESCE(SUM(amount) FILTER(WHERE event_kind='receipt'),0)-COALESCE(SUM(amount) FILTER(WHERE event_kind='refund'),0))::text AS manually_reported_net FROM cc_finance_events WHERE campaign_id=$1 AND organization_id=$2 AND ($3::boolean OR credited_member_subject=$4)",[c.id,c.organization_id,manager,req.userId]),
   pool.query("SELECT count(*)::int reported,count(*) FILTER(WHERE outcome='pledged')::int pledged_outcomes,count(*) FILTER(WHERE outcome='callback')::int followups FROM cc_call_events WHERE campaign_id=$1 AND organization_id=$2 AND ($3::boolean OR member_subject=$4)",[c.id,c.organization_id,manager,req.userId]),
   pool.query("SELECT id,requested_by,category,summary,status,assigned_to,created_at FROM cc_floor_help_requests WHERE room_id=$1 AND organization_id=$2 AND ($3::boolean OR requested_by=$4) ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,created_at DESC LIMIT 80",[room.id,c.organization_id,manager,req.userId]),
   pool.query("SELECT event_type,actor_subject,created_at,details FROM cc_activity_events WHERE campaign_id=$1 AND organization_id=$2 AND event_type IN ('call.logged','lead.claimed','lead.released','room.announcement','floor.help_requested','floor.help_status') AND ($3::boolean OR actor_subject=$4) ORDER BY created_at DESC LIMIT 25",[c.id,c.organization_id,manager,req.userId]),
   pool.query("SELECT p.member_subject,p.last_seen_at,m.team_name FROM cc_live_room_participation p LEFT JOIN cc_campaign_members m ON m.campaign_id=$2 AND m.subject=p.member_subject WHERE p.room_id=$1 AND p.left_at IS NULL AND p.last_seen_at>now()-interval '45 seconds' AND ($3::boolean OR p.member_subject=$4) ORDER BY p.last_seen_at DESC LIMIT 300",[room.id,c.id,manager,req.userId]),
  ]);
  res.set('Cache-Control','no-store');
  res.json({room:{id:room.id,title:room.title,status:room.room_status},campaign:{id:c.id,title:c.title,goalAmount:c.goal_amount},
   access:{manager,canCall:eligible,role:c.role},
   totals:{contacts:people.rows[0],tasks:tasks.rows[0],financial:money.rows[0],calls:calls.rows[0]},
   help:help.rows,feed:feed.rows,online:team.rows,
   recentlyOnlineCount:manager?team.rowCount:null,mode:'web_live_reporting_with_manual_calls',pollAfterMs:6500});
 }));
 router.post('/:rid/help',handle(async(req,res)=>{
  const category=trim(req.body?.category,24),summary=trim(req.body?.summary,501);
  if(!['technical','donor_question','manager','motivation','other'].includes(category)||summary.length<2||summary.length>500)
   throw bad(400,'Invalid help request');
  const saved=await tx(async db=>{
   const {room,campaign:c}=await context(db,req.params.rid,req.userId,true);
   if(room.room_status!=='open')throw bad(409,'Fundraising room is closed');
   const joined=await db.query("SELECT 1 FROM cc_live_room_participation WHERE room_id=$1 AND member_subject=$2 AND left_at IS NULL AND last_seen_at>now()-interval '45 seconds'",[room.id,req.userId]);
   if(!joined.rowCount)throw bad(403,'Join the virtual hall first');
   const active=(await db.query("SELECT count(*)::int n FROM cc_floor_help_requests WHERE room_id=$1 AND requested_by=$2 AND status<>'resolved'",[room.id,req.userId])).rows[0].n;
   if(active>=3)throw bad(429,'Resolve an existing request before adding more');
   const r=(await db.query('INSERT INTO cc_floor_help_requests(organization_id,campaign_id,room_id,requested_by,category,summary) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,category,summary,status,created_at',
    [c.organization_id,c.id,room.id,req.userId,category,summary])).rows[0];
   await log(db,c.organization_id,c.id,req.userId,'floor.help_requested',r.id,{category});
   return r;
  });res.status(201).json(saved);
 }));
 router.patch('/:rid/help/:hid',handle(async(req,res)=>{
  const status=trim(req.body?.status,18);
  if(!uuid(req.params.hid)||!['in_progress','resolved','open'].includes(status))throw bad(400,'Invalid help status');
  const saved=await tx(async db=>{
   const {room,campaign:c,manager}=await context(db,req.params.rid,req.userId,true);
   if(!manager)throw bad(403,'Only a campaign manager can direct help requests');
   const prior=(await db.query('SELECT * FROM cc_floor_help_requests WHERE id=$1 AND room_id=$2 AND organization_id=$3 FOR UPDATE',
    [req.params.hid,room.id,c.organization_id])).rows[0];
   if(!prior)throw bad(404,'Help request not found');
   const r=(await db.query("UPDATE cc_floor_help_requests SET status=$1,assigned_to=CASE WHEN $1='in_progress' THEN $2 ELSE assigned_to END,resolved_at=CASE WHEN $1='resolved' THEN now() ELSE NULL END WHERE id=$3 RETURNING id,status,assigned_to,resolved_at",[status,req.userId,prior.id])).rows[0];
   await log(db,c.organization_id,c.id,req.userId,'floor.help_status',r.id,{from:prior.status,to:status});
   return r;
  });res.json(saved);
 }));
 return router;
}
