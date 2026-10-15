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
   pool.query("SELECT event_type,actor_subject,created_at,details FROM cc_activity_events WHERE campaign_id=$1 AND organization_id=$2 AND event_type IN ('call.logged','lead.claimed','lead.released','room.announcement','floor.help_requested','floor.help_status','floor.help_reply','floor.program_scheduled','floor.program_status','floor.checked_in','floor.checked_out') AND ($3::boolean OR actor_subject=$4) ORDER BY created_at DESC LIMIT 25",[c.id,c.organization_id,manager,req.userId]),
   pool.query("SELECT p.member_subject,p.last_seen_at,m.team_name FROM cc_live_room_participation p LEFT JOIN cc_campaign_members m ON m.campaign_id=$2 AND m.subject=p.member_subject WHERE p.room_id=$1 AND p.left_at IS NULL AND p.last_seen_at>now()-interval '45 seconds' AND ($3::boolean OR p.member_subject=$4) ORDER BY p.last_seen_at DESC LIMIT 300",[room.id,c.id,manager,req.userId]),
  ]);
  res.set('Cache-Control','no-store');
  res.json({room:{id:room.id,title:room.title,status:room.room_status},campaign:{id:c.id,title:c.title,goalAmount:c.goal_amount},
   access:{manager,canCall:eligible,role:c.role},
   totals:{contacts:people.rows[0],tasks:tasks.rows[0],financial:money.rows[0],calls:calls.rows[0]},
   help:help.rows,feed:feed.rows,online:team.rows,
   recentlyOnlineCount:manager?team.rowCount:null,mode:'web_live_reporting_with_manual_calls',pollAfterMs:6500});
 }));
 router.post('/:rid/calls/:contactId',handle(async(req,res)=>{
  const outcome=trim(req.body?.outcome,20),note=trim(req.body?.note,2000),attemptId=req.body?.attemptId;
  if(!uuid(req.params.contactId)||!uuid(attemptId)||
   !['no_answer','spoke','callback','pledged','paid','not_interested','do_not_call'].includes(outcome))
   throw bad(400,'Invalid manual call result');
  const result=await tx(async db=>{
   const {room,campaign:c}=await context(db,req.params.rid,req.userId,true);
   need(c.role,['owner','manager','squad_leader','askan']);
   // Idempotent retry must return the identical immutable record, even if the
   // fundraiser has since switched into a lunch/inspiration program.
   const before=(await db.query('SELECT id,member_subject,contact_id,outcome FROM cc_call_events WHERE client_attempt_id=$1',[attemptId])).rows[0];
   if(before){
    if(before.member_subject!==req.userId||before.contact_id!==req.params.contactId||before.outcome!==outcome)
      throw bad(409,'Conflicting call retry');
    return {id:before.id,duplicate:true,manuallyReported:true};
   }
   if(room.room_status!=='open'||room.floor_mode!=='calling')throw bad(409,'Calling is paused for a program or break');
   const check=await db.query('SELECT 1 FROM cc_floor_checkins WHERE room_id=$1 AND member_subject=$2 AND checked_out_at IS NULL',
    [room.id,req.userId]);
   if(!check.rowCount)throw bad(403,'Check into the event before recording calls');
   const lead=(await db.query('SELECT * FROM cc_contacts WHERE id=$1 FOR UPDATE',[req.params.contactId])).rows[0];
   if(!lead||lead.privacy!=='campaign'||lead.campaign_id!==c.id||lead.organization_id!==c.organization_id)
    throw bad(404,'Contact is not on this campaign');
   if(lead.do_not_call)throw bad(409,'Do-not-call contact');
   if(lead.claimed_by!==req.userId||!lead.claim_expires_at||new Date(lead.claim_expires_at).getTime()<=Date.now())
    throw bad(409,'Contact claim has expired or belongs to another operator');
   if(!['owner','manager'].includes(c.role)){
    const team=(await db.query('SELECT team_name FROM cc_campaign_members WHERE campaign_id=$1 AND subject=$2',[c.id,req.userId])).rows[0]?.team_name;
    if(team===undefined||team!==lead.assigned_team)throw bad(404,'Contact belongs to another squad');
   }
   const saved=(await db.query('INSERT INTO cc_call_events(organization_id,campaign_id,contact_id,member_subject,outcome,note,client_attempt_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [c.organization_id,c.id,lead.id,req.userId,outcome,note,attemptId])).rows[0];
   const nextStatus=outcome==='do_not_call'?'do_not_call':outcome;
   await db.query("UPDATE cc_contacts SET do_not_call=CASE WHEN $1='do_not_call' THEN true ELSE do_not_call END,status=$1,claimed_by=NULL,claim_expires_at=NULL WHERE id=$2",
    [nextStatus,lead.id]);
   await log(db,c.organization_id,c.id,req.userId,'call.logged',saved.id,{contactId:lead.id,outcome,roomId:room.id,manuallyReported:true});
   return {id:saved.id,duplicate:false,manuallyReported:true};
  });
  res.status(result.duplicate?200:201).json(result);
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
 async function supportAccess(db,rid,hid,subject){
  if(!uuid(hid))throw bad(400,'Invalid help ticket');
  const {room,campaign:c,manager}=await context(db,rid,subject);
  const ticket=(await db.query('SELECT * FROM cc_floor_help_requests WHERE id=$1 AND room_id=$2 AND organization_id=$3',
   [hid,room.id,c.organization_id])).rows[0];
  if(!ticket||(ticket.requested_by!==subject&&!manager))throw bad(404,'Help ticket not found');
  return {room,c,manager,ticket};
 }
 router.get('/:rid/help/:hid/messages',handle(async(req,res)=>{
  const {ticket}=await supportAccess(pool,req.params.rid,req.params.hid,req.userId);
  const r=await pool.query('SELECT id,authored_by,body,created_at FROM cc_floor_help_messages WHERE request_id=$1 ORDER BY created_at ASC LIMIT 200',[ticket.id]);
  res.set('Cache-Control','no-store');
  res.json({ticketId:ticket.id,status:ticket.status,messages:r.rows});
 }));
 router.post('/:rid/help/:hid/messages',handle(async(req,res)=>{
  const body=trim(req.body?.body,1001);
  if(body.length<1||body.length>1000)throw bad(400,'Invalid support message');
  const created=await tx(async db=>{
   const {room,c,ticket}=await supportAccess(db,req.params.rid,req.params.hid,req.userId);
   if(ticket.status==='resolved')throw bad(409,'The support ticket is resolved');
   const m=(await db.query('INSERT INTO cc_floor_help_messages(request_id,authored_by,body) VALUES($1,$2,$3) RETURNING id,authored_by,body,created_at',
     [ticket.id,req.userId,body])).rows[0];
   await log(db,c.organization_id,c.id,req.userId,'floor.help_reply',ticket.id,{roomId:room.id});
   return m;
  });res.status(201).json(created);
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
