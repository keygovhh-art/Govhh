import express from 'express';
import pg from 'pg';
import teamRouter from './team.js';
import webHallRouter from './web-hall.js';
import conferenceRouter from './conferences.js';
import rtcAudioRouter from './rtc-audio.js';
import videoRouter from './video.js';
import floorRouter from './floor.js';
import programRouter from './floor-programs.js';
import campaignAdminRouter from './campaign-admin.js';
import contactsImportRouter from './contacts-import.js';
import goalsRouter from './goals.js';
import donationLinksRouter from './donation-links.js';
import askanPlusRouter from './askan-plus.js';
import plusPledgesRouter from './plus-pledges.js';
import askanProRouter from './askan-pro.js';
import proSprintRouter from './pro-sprints.js';
import proGuidanceRouter from './pro-guidance.js';
import proBlockersRouter from './pro-blockers.js';
import gabbaiApprovalsRouter from './gabbai-approvals.js';
import gabbaiHandoffsRouter from './gabbai-handoffs.js';
import organizationPortfolioRouter from './organization-portfolio.js';
import organizationResourcesRouter from './organization-resources.js';
import organizationMemoryRouter from './organization-memory.js';
import customFocusRouter from './custom-focus.js';
import quickDailyRouter from './quick-daily.js';
import proFilesRouter from './pro-files.js';
import proAutomationRouter from './pro-automations.js';
import proCallListsRouter from './pro-call-lists.js';
import proNextActionRouter from './pro-next-actions.js';
import {makePlanPolicy} from './plan-policy.js';
import { CAMPAIGN_PLANS, PLAN_FEATURES } from '../src/plan-catalog.js';
import { connectUserRouter, connectServiceRouter } from './connect.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const required = ['NEON_AUTH_BASE_URL', 'NEON_AUTH_JWKS_URL'];
const missing = required.filter(key => !process.env[key]);
if (missing.length) {
  console.error('Missing Render environment settings:', missing.join(', '));
  process.exit(1);
}
const authBase = new URL(process.env.NEON_AUTH_BASE_URL);
const jwksUrl = new URL(process.env.NEON_AUTH_JWKS_URL);
if (authBase.protocol !== 'https:' || jwksUrl.protocol !== 'https:' || authBase.origin !== jwksUrl.origin) {
  throw new Error('Neon Auth and JWKS settings must share the same HTTPS origin');
}
const jwks = createRemoteJWKSet(jwksUrl);
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 10000 }) : null;
const app = express();
app.disable('x-powered-by');
app.use('/api/import', express.json({ limit: '1mb' }));
app.use((req,res,next)=>{
  if(req.method==='POST'&&/^\/api\/pro\/campaigns\/[a-f0-9-]{36}\/files$/i.test(req.path))
    return express.json({limit:'1.6mb'})(req,res,next);
  next();
});
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
});

const bad = (status, message) => Object.assign(new Error(message), { status });
const trim = (x, max = 200) => typeof x === 'string' ? x.trim().slice(0, max) : '';
const uuid = x => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const amount = x => {
  const value = String(x ?? '');
  if (!/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(value)) throw bad(400, 'Invalid amount: up to 2 decimals');
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 1000000000000) throw bad(400, 'Invalid positive amount');
  return n.toFixed(2);
};
const log = async (db, org, campaign, actor, type, target = null, details = {}) => {
  await db.query('INSERT INTO cc_activity_events(organization_id,campaign_id,actor_subject,event_type,target_id,details) VALUES ($1,$2,$3,$4,$5,$6)', [org,campaign,actor,type,target,JSON.stringify(details)]);
};
async function transaction(work) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await work(db);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally { db.release(); }
}
const q = (sql, params) => pool.query(sql, params);
async function authenticate(req, _res, next) {
  try {
    const match = /^Bearer\s+([^\s]+)$/i.exec(req.get('authorization') || '');
    if (!match) throw bad(401, 'Please sign in');
    // Managed Neon Auth issues JWTs for the full auth service base path.
    // Accept both documented and legacy issuer forms while JWKS stays pinned
    // to the SAME database branch. Never accept arbitrary issuers.
    const { payload } = await jwtVerify(match[1], jwks, {
      issuer: [authBase.toString().replace(/\/$/,''),authBase.origin]
    });
    if (typeof payload.sub !== 'string' || !payload.sub) throw bad(401, 'Invalid user');
    req.userId = payload.sub;
    next();
  } catch (error) { next(error.status ? error : bad(401, 'Session expired or invalid')); }
}
async function member(db, org, user) {
  if (!uuid(org)) throw bad(400, 'Invalid organization');
  const found = await db.query("SELECT role FROM cc_memberships WHERE organization_id=$1 AND subject=$2 AND membership_status='active'", [org,user]);
  if (!found.rowCount) throw bad(404, 'Workspace not found');
  return found.rows[0].role;
}
async function campaignAccess(db, id, user) {
  if (!uuid(id)) throw bad(400, 'Invalid campaign');
  const found = await db.query("SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m ON m.organization_id=c.organization_id AND m.subject=$2 AND m.membership_status='active' WHERE c.id=$1", [id,user]);
  if (!found.rowCount) throw bad(404, 'Campaign not found');
  const c = found.rows[0];
  if (!['owner','manager','finance','auditor'].includes(c.role)) {
    const joined = await db.query('SELECT 1 FROM cc_campaign_members WHERE campaign_id=$1 AND subject=$2',[id,user]);
    if (!joined.rowCount) throw bad(404, 'Campaign not found');
  }
  return c;
}
function need(role, allowed) { if (!allowed.includes(role)) throw bad(403,'Insufficient permission'); }

async function ensureContactAccess(db,c,contact,subject){
  if(contact.privacy==='private'){
    if(contact.created_by!==subject)throw bad(404,'Contact not found');
    return;
  }
  if(['owner','manager','finance','auditor'].includes(c.role))return;
  const team=(await db.query('SELECT team_name FROM cc_campaign_members WHERE campaign_id=$1 AND subject=$2',[c.id,subject])).rows[0]?.team_name;
  if(team===undefined||team!==contact.assigned_team)throw bad(404,'Contact not assigned to your team');
}
app.get('/api/health', async (req, res, next) => {
  if (!pool) return res.json({ status:'configuration_required',database:'neon_not_connected' });
  try { await q('SELECT 1'); res.json({ status:'ok',database:'neon' }); }
  catch (error) { next(error); }
});
app.get('/api/config', (_req,res) => res.json({ neonAuthUrl: authBase.toString().replace(/\/$/,'') ,ready: Boolean(pool),experimentalAudioEnabled:process.env.CC_EXPERIMENTAL_P2P_AUDIO==='true'}));
// Public product catalogue is informational; no automatic subscription is granted.
app.get('/api/plans',(_req,res)=>res.json({plans:CAMPAIGN_PLANS,features:PLAN_FEATURES,paidPlanActivation:false,guidedManagedAreAddOns:true}));
app.use('/api', (req,res,next) => pool ? next() : res.status(503).json({error:'Neon DATABASE_URL configuration required'}));
// Cross-service endpoint is reachable ONLY with an explicitly configured 32+ byte shared secret.
app.use('/api/connect/service', (req,res,next)=>pool?next():res.status(503).json({error:'Neon not configured'}));
app.use('/api/connect/service', connectServiceRouter({pool,bad,uuid,log}));
app.use('/api', authenticate);
const planPolicy=makePlanPolicy({pool,bad});
app.get('/api/organizations/:oid/entitlements',async(req,res,next)=>{
  try{const plan=await planPolicy.forMember(pool,req.params.oid,req.userId);
    res.set('Cache-Control','private,no-store');res.json({plan,...{limits:plan.limits},
      usableFeatures:PLAN_FEATURES.filter(f=>planPolicy.allowFeature(plan,f.code)).map(f=>f.code),
      unallocatedFeatures:PLAN_FEATURES.filter(f=>f.minTier===null).map(f=>f.code),
      selfServiceUpgradeAvailable:false});
  }catch(error){next(error);}
});
app.use('/api/goals', goalsRouter({pool,campaignAccess,need,bad,trim,uuid,log,planPolicy}));
app.use('/api/quick',quickDailyRouter({pool,campaignAccess,planPolicy,bad,log}));
app.use('/api/donation-links', donationLinksRouter({pool,campaignAccess,need,bad,trim,log}));
app.use('/api/plus',planPolicy.scoped('askan_plus'));
app.use('/api/plus',askanPlusRouter({pool,campaignAccess,need,bad,uuid,trim,log}));
app.use('/api/plus',plusPledgesRouter({pool,campaignAccess,need,bad,uuid,trim,log}));
app.use('/api/pro',planPolicy.scoped('askan_pro'));
app.use('/api/pro',askanProRouter({pool,campaignAccess,bad,trim,log}));
app.use('/api/pro',proFilesRouter({pool,campaignAccess,bad,log}));
app.use('/api/pro',proAutomationRouter({pool,campaignAccess,bad,log}));
app.use('/api/pro',proCallListsRouter({pool,campaignAccess,bad}));
app.use('/api/pro',proNextActionRouter({pool,campaignAccess,bad,log}));
app.use('/api/pro',proSprintRouter({pool,campaignAccess,bad,log,uuid,trim}));
app.use('/api/pro',proGuidanceRouter({pool,campaignAccess,bad,trim,uuid,log}));
app.use('/api/pro',proBlockersRouter({pool,campaignAccess,bad,trim,uuid,log}));
app.use('/api/gabbai',planPolicy.scoped('gabbai_pro'));
app.use('/api/gabbai',gabbaiApprovalsRouter({pool,campaignAccess,bad,uuid,trim,log}));
app.use('/api/gabbai',gabbaiHandoffsRouter({pool,campaignAccess,bad,uuid,log}));
app.use('/api/organization',planPolicy.scoped('organization'));
app.use('/api/organization',organizationPortfolioRouter({pool,bad,uuid,trim,log}));
app.use('/api/organization',organizationResourcesRouter({pool,bad,uuid,log}));
app.use('/api/organization',organizationMemoryRouter({pool,bad,uuid,trim,log}));
app.use('/api/custom',planPolicy.scoped('custom'));
app.use('/api/custom',customFocusRouter({pool,campaignAccess,bad,log}));
app.use('/api/connect', connectUserRouter({pool,authenticate,log,bad}));
app.use('/api/team', (req,res,next)=>{
  // CSV export is Askan Pro. No lower-tier alias via the old team router.
  if(/^\/campaigns\/[a-f0-9-]{36}\/contacts\.csv$/i.test(req.path))return planPolicy.scoped('askan_pro','csv_import')(req,res,next);
  next();
});
app.use('/api/team', teamRouter({pool,authenticate,member,campaignAccess,need,log,bad,uuid,trim,planPolicy}));
// Preserve existing authenticated shared event pilot routes until their
// final paid-tier placement is approved; these are not paid entitlements.
app.use('/api/rooms', webHallRouter({pool,authenticate,campaignAccess,need,log,bad,uuid,trim}));
app.use('/api/conferences',conferenceRouter({pool,authenticate,member,campaignAccess,need,log,bad,uuid,trim}));
app.use('/api/rtc',rtcAudioRouter({pool,authenticate,member,campaignAccess,bad,uuid,log}));
// Global Yemot credentials now live only on Gavhah under the platform super-admin.
// Deny legacy organization-level reads AND writes at the server layer.
app.all('/api/yemot/organizations/{*path}', (_req,res) =>
  res.status(410).json({error:'Individual Yemot credentials were retired. Manage the single central connection in Gavhah.'}));
app.get('/api/yemot/central-status',async(_req,res)=>{
  const secret=process.env.YEMOT_CENTRAL_SHARED_SECRET||'';
  if(secret.length<32)return res.status(503).json({error:'Central connection is not configured on both services'});
  try {
    const url=new URL('/api/yemot/service/status',process.env.GAVHAH_API_BASE_URL||'https://gavhah.onrender.com');
    if(url.protocol!=='https:'||url.username||url.password)throw Error('Invalid central API endpoint');
    const reply=await fetch(url,{headers:{'x-gavhah-connect-secret':secret},
      signal:AbortSignal.timeout(9000),redirect:'error',cache:'no-store'});
    if(!reply.ok)throw Error('Central service unavailable');
    const data=await reply.json();
    res.set('Cache-Control','private, no-store');
    res.json({configured:!!data.configured,connected:!!data.connectedToGlobalProvider,
      lineNumber:data.lineNumber||null, routes:['1 — גבהה','2 — קאמפיין סענטער']});
  }catch{res.status(502).json({error:'Central Gavhah Yemot status unavailable'});}
});
app.use('/api/video',videoRouter({pool,authenticate,member,campaignAccess,need,log,bad,uuid,trim}));
app.use('/api/floor',floorRouter({pool,authenticate,campaignAccess,need,log,bad,uuid,trim}));
app.use('/api/floor-program',programRouter({pool,authenticate,campaignAccess,need,log,bad,uuid,trim}));
app.use('/api/campaigns', campaignAdminRouter({pool,authenticate,campaignAccess,need,bad,log,trim}));
app.use('/api/import',planPolicy.scoped('askan_pro','csv_import'));
app.use('/api/import', contactsImportRouter({pool,authenticate,campaignAccess,need,bad,log}));
app.get('/api/me', async (req,res,next) => {
  try {
    const result = await q("SELECT o.id,o.name,m.role FROM cc_organizations o JOIN cc_memberships m ON m.organization_id=o.id WHERE m.subject=$1 AND m.membership_status='active' ORDER BY o.created_at DESC",[req.userId]);
    res.json({ subject:req.userId, organizations:result.rows });
  } catch(error) { next(error); }
});
app.post('/api/organizations', async (req,res,next) => {
  try {
    const name = trim(req.body?.name,120);
    if (name.length < 2) throw bad(400,'Please enter your workspace name');
    const result = await transaction(async db => {
      const o = (await db.query('INSERT INTO cc_organizations(name,owner_subject) VALUES($1,$2) RETURNING *',[name,req.userId])).rows[0];
      await db.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at) VALUES($1,$2,'owner','active',now())",[o.id,req.userId]);
      await log(db,o.id,null,req.userId,'organization.created',o.id);
      return o;
    });
    res.status(201).json(result);
  } catch(error) { next(error); }
});
app.get('/api/organizations/:oid/campaigns', async(req,res,next) => {
  try {
    const role=await member(pool,req.params.oid,req.userId);
    const result=await q("SELECT id,title,currency,goal_amount,status,created_at FROM cc_campaigns c WHERE organization_id=$1 AND ($2::boolean OR EXISTS (SELECT 1 FROM cc_campaign_members cm WHERE cm.campaign_id=c.id AND cm.subject=$3)) ORDER BY created_at DESC",
      [req.params.oid,['owner','manager','finance','auditor'].includes(role),req.userId]);
    res.json(result.rows);
  } catch(error) {next(error);}
});
app.post('/api/organizations/:oid/campaigns', async(req,res,next) => {
  try {
    const title=trim(req.body?.title,160), goal=Number(req.body?.goalAmount||0);
    if (!title || !Number.isFinite(goal) || goal<0 || goal>1000000000000) throw bad(400,'Invalid campaign details');
    const result=await transaction(async db=>{
      const role=await member(db,req.params.oid,req.userId);need(role,['owner','manager']);
      await db.query('SELECT id FROM cc_organizations WHERE id=$1 FOR UPDATE',[req.params.oid]);
      const access=await planPolicy.forMember(db,req.params.oid,req.userId);
      await planPolicy.checkCapacity(db,access,req.params.oid,'campaigns');
      const c=(await db.query('INSERT INTO cc_campaigns(organization_id,title,goal_amount) VALUES($1,$2,$3) RETURNING *',[req.params.oid,title,goal])).rows[0];
      await db.query('INSERT INTO cc_campaign_members(organization_id,campaign_id,subject) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[req.params.oid,c.id,req.userId]);
      await log(db,req.params.oid,c.id,req.userId,'campaign.created',c.id,{title});
      return c;
    });
    res.status(201).json(result);
  } catch(error) {next(error);}
});
app.get('/api/campaigns/:cid/overview', async(req,res,next)=>{
  try {
    const c=await campaignAccess(pool,req.params.cid,req.userId);
    const stats=await q("SELECT event_kind,COALESCE(SUM(amount),0)::text AS amount FROM cc_finance_events WHERE campaign_id=$1 AND organization_id=$2 AND event_kind IN ('pledge','receipt','refund') GROUP BY event_kind",[c.id,c.organization_id]);
    const tasks=await q('SELECT status,count(*)::int AS total FROM cc_assignments WHERE campaign_id=$1 GROUP BY status',[c.id]);
    res.json({campaign:c,finance:stats.rows,tasks:tasks.rows});
  } catch(error){next(error);}
});
app.get('/api/campaigns/:cid/tasks', async(req,res,next)=>{
  try {
    const c=await campaignAccess(pool,req.params.cid,req.userId);
    const managers=['owner','manager','finance','auditor'].includes(c.role);
    const r=await q("SELECT a.id,a.title,a.kind,a.priority,a.status,a.due_at,a.assignee_subject,a.created_at FROM cc_assignments a WHERE a.organization_id=$1 AND a.campaign_id=$2 AND ($3::boolean OR a.assignee_subject=$4 OR ($5::boolean AND EXISTS (SELECT 1 FROM cc_campaign_members my INNER JOIN cc_campaign_members peer ON peer.campaign_id=my.campaign_id AND peer.team_name=my.team_name WHERE my.campaign_id=$2 AND my.subject=$4 AND peer.subject=a.assignee_subject))) ORDER BY a.created_at DESC LIMIT 200",
      [c.organization_id,c.id,managers,req.userId,c.role==='squad_leader']);
    res.json(r.rows);
  } catch(error){next(error);}
});
app.post('/api/campaigns/:cid/tasks',async(req,res,next)=>{
  try {
    const title=trim(req.body?.title,240), priority=trim(req.body?.priority,16)||'normal', kind=trim(req.body?.kind,16)||'task';
    if(!title || !['low','normal','high','critical'].includes(priority) || !['task','call_lead','followup','review'].includes(kind)) throw bad(400,'Invalid task');
    const due=req.body?.dueAt;
    if(due!==undefined&&due!==null&&(typeof due!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(due)||!Number.isFinite(Date.parse(due))))
      throw bad(400,'Invalid ISO UTC due date');
    const dueAt=due?new Date(due).toISOString():null;
    const result=await transaction(async db=>{
      const c=await campaignAccess(db,req.params.cid,req.userId);need(c.role,['owner','manager','squad_leader']);
      const assignee=trim(req.body?.assigneeSubject,128)||req.userId;
      if(c.role==='squad_leader'){
        const scope=await db.query('SELECT 1 FROM cc_campaign_members leader JOIN cc_campaign_members assigned ON assigned.campaign_id=leader.campaign_id AND assigned.team_name=leader.team_name WHERE leader.campaign_id=$1 AND leader.subject=$2 AND assigned.subject=$3 LIMIT 1',[c.id,req.userId,assignee]);
        if(!scope.rowCount)throw bad(403,'Cannot assign work outside your team');
      }
      const a=(await db.query('INSERT INTO cc_assignments(organization_id,campaign_id,assignee_subject,title,priority,kind,due_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[c.organization_id,c.id,assignee,title,priority,kind,dueAt])).rows[0];
      await log(db,c.organization_id,c.id,req.userId,'task.created',a.id,{assignee,dueAt});
      return a;
    });res.status(201).json(result);
  } catch(error){next(error);}
});
app.patch('/api/tasks/:id',async(req,res,next)=>{
  try {
    if(!uuid(req.params.id)||!['open','in_progress','done','cancelled'].includes(req.body?.status))throw bad(400,'Invalid task update');
    const result=await transaction(async db=>{
      const t=(await db.query('SELECT * FROM cc_assignments WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
      if(!t)throw bad(404,'Task not found');
      const c=await campaignAccess(db,t.campaign_id,req.userId);
      if(t.organization_id!==c.organization_id)throw bad(404,'Task not found');
      if(t.assignee_subject!==req.userId){
        need(c.role,['owner','manager','squad_leader']);
        if(c.role==='squad_leader'){
          const linked=await db.query('SELECT 1 FROM cc_campaign_members leader JOIN cc_campaign_members assigned ON assigned.campaign_id=leader.campaign_id AND assigned.team_name=leader.team_name WHERE leader.campaign_id=$1 AND leader.subject=$2 AND assigned.subject=$3 LIMIT 1',[c.id,req.userId,t.assignee_subject]);
          if(!linked.rowCount)throw bad(403,'Task belongs to another team');
        }
      }
      const done=(await db.query('UPDATE cc_assignments SET status=$1 WHERE id=$2 RETURNING *',[req.body.status,t.id])).rows[0];
      await log(db,c.organization_id,c.id,req.userId,'task.status',t.id,{from:t.status,to:done.status});
      return done;
    });res.json(result);
  } catch(error){next(error);}
});
app.get('/api/campaigns/:cid/contacts',async(req,res,next)=>{
  try {
    const c=await campaignAccess(pool,req.params.cid,req.userId);
    const elevated=['owner','manager','finance','auditor'].includes(c.role);
    const r=await q("SELECT id,display_name,phone,notes,privacy,do_not_call,status,assigned_team,next_followup_at,created_at FROM cc_contacts WHERE campaign_id=$1 AND organization_id=$2 AND ((privacy='private' AND created_by=$3) OR (privacy='campaign' AND ($4::boolean OR assigned_team=(SELECT team_name FROM cc_campaign_members WHERE campaign_id=$1 AND subject=$3)))) ORDER BY created_at DESC LIMIT 200",
     [c.id,c.organization_id,req.userId,elevated]);
    res.json(r.rows);
  } catch(error){next(error);}
});
app.post('/api/campaigns/:cid/contacts',async(req,res,next)=>{
  try {
    const name=trim(req.body?.name,160), phone=trim(req.body?.phone,40), notes=trim(req.body?.notes,2000),privacy=req.body?.privacy==='private'?'private':'campaign';
    if(!name || (phone && !/^[+0-9 ()\-]{7,40}$/.test(phone)))throw bad(400,'Invalid contact');
    const result=await transaction(async db=>{
      const c=await campaignAccess(db,req.params.cid,req.userId);
      need(c.role,['owner','manager','squad_leader','askan']);
      const team=['owner','manager'].includes(c.role)?'':
        (await db.query('SELECT team_name FROM cc_campaign_members WHERE campaign_id=$1 AND subject=$2',[c.id,req.userId])).rows[0]?.team_name;
      if(team===undefined)throw bad(403,'Team membership required for contacts');
      const row=(await db.query('INSERT INTO cc_contacts(organization_id,campaign_id,created_by,display_name,phone,notes,privacy,assigned_team) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,display_name,phone,notes,privacy,status,assigned_team,do_not_call,created_at',[c.organization_id,c.id,req.userId,name,phone,notes,privacy,team])).rows[0];
      await log(db,c.organization_id,c.id,req.userId,'contact.created',row.id,{privacy});
      return row;
    });res.status(201).json(result);
  } catch(error){next(error);}
});
app.get('/api/contacts/:id/calls',async(req,res,next)=>{
  try {
    if(!uuid(req.params.id))throw bad(400,'Invalid contact');
    const contact=(await q('SELECT * FROM cc_contacts WHERE id=$1',[req.params.id])).rows[0];
    if(!contact)throw bad(404,'Contact not found');
    const c=await campaignAccess(pool,contact.campaign_id,req.userId);
    if(c.organization_id!==contact.organization_id)throw bad(404,'Contact not found');
    await ensureContactAccess(pool,c,contact,req.userId);
    const r=await q('SELECT id,member_subject,outcome,note,created_at FROM cc_call_events WHERE contact_id=$1 AND organization_id=$2 ORDER BY created_at DESC LIMIT 200',[contact.id,contact.organization_id]);
    res.json(r.rows);
  } catch(error){next(error);}
});
app.post('/api/contacts/:id/calls',async(req,res,next)=>{
  try {
    if(!uuid(req.params.id))throw bad(400,'Invalid contact');
    const outcome=req.body?.outcome,note=trim(req.body?.note,2000);
    if(!['no_answer','spoke','callback','pledged','paid','not_interested','do_not_call'].includes(outcome))throw bad(400,'Invalid outcome');
    const result=await transaction(async db=>{
      const t=(await db.query('SELECT * FROM cc_contacts WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
      if(!t)throw bad(404,'Contact not found');
      const c=await campaignAccess(db,t.campaign_id,req.userId);
      need(c.role,['owner','manager','squad_leader','askan']);
      if(t.organization_id!==c.organization_id)throw bad(404,'Contact not found');
      await ensureContactAccess(db,c,t,req.userId);
      if(t.do_not_call)throw bad(409,'Do not call: this contact is restricted');
      if(t.claimed_by&&t.claimed_by!==req.userId&&new Date(t.claim_expires_at).getTime()>Date.now())throw bad(409,'This shared contact is currently claimed by another team member');
      const e=(await db.query('INSERT INTO cc_call_events(organization_id,campaign_id,contact_id,member_subject,outcome,note) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[c.organization_id,c.id,t.id,req.userId,outcome,note])).rows[0];
      if(outcome==='do_not_call')await db.query("UPDATE cc_contacts SET do_not_call=true,status='do_not_call' WHERE id=$1",[t.id]);
      await log(db,c.organization_id,c.id,req.userId,'call.logged',e.id,{contactId:t.id,outcome});
      return e;
    });res.status(201).json(result);
  } catch(error){next(error);}
});
app.get('/api/campaigns/:cid/finance',async(req,res,next)=>{
  try {
    const c=await campaignAccess(pool,req.params.cid,req.userId);
    const viewAll=['owner','manager','finance','auditor'].includes(c.role);
    const r=await q('SELECT id,credited_member_subject,event_kind,amount,currency,source_system,verified_at,verification_reference,created_at FROM cc_finance_events WHERE campaign_id=$1 AND organization_id=$2 AND ($3::boolean OR credited_member_subject=$4) ORDER BY created_at DESC LIMIT 200',[c.id,c.organization_id,viewAll,req.userId]);
    res.json(r.rows);
  } catch(error){next(error);}
});
app.post('/api/campaigns/:cid/finance',async(req,res,next)=>{
  try {
    const kind=req.body?.kind;
    if(!['pledge','receipt'].includes(kind))throw bad(400,'Only pledge / manually verified receipt supported');
    const sum=amount(req.body?.amount);
    const reference=trim(req.body?.verificationReference,200);
    if(kind==='receipt' && reference.length<3)throw bad(400,'Treasurer verification reference required');
    const result=await transaction(async db=>{
      const c=await campaignAccess(db,req.params.cid,req.userId);
      if(kind==='receipt')need(c.role,['owner','finance']);
      else need(c.role,['owner','manager','finance','askan','squad_leader']);
      const row=(await db.query("INSERT INTO cc_finance_events(organization_id,campaign_id,credited_member_subject,source_system,source_event_key,event_kind,amount,currency,verified_at,verification_reference) VALUES($1,$2,$3,'manual-neon',$4,$5,$6,$7,$8,$9) RETURNING *",
        [c.organization_id,c.id,req.userId,randomUUID(),kind,sum,c.currency,kind==='receipt'?new Date():null,kind==='receipt'?reference:null])).rows[0];
      await log(db,c.organization_id,c.id,req.userId,'finance.'+kind,row.id,{amount:sum,currency:c.currency,manual:true});
      return row;
    });res.status(201).json(result);
  }catch(error){next(error);}
});
app.get('/api/organizations/:oid/activity',async(req,res,next)=>{
  try {
    const role=await member(pool,req.params.oid,req.userId);
    need(role,['owner','manager','auditor']);
    const r=await q('SELECT id,campaign_id,actor_subject,event_type,target_id,details,created_at FROM cc_activity_events WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 200',[req.params.oid]);
    res.json(r.rows);
  }catch(error){next(error);}
});

const root=dirname(fileURLToPath(import.meta.url));
app.use(express.static(join(root,'../dist'),{index:false,maxAge:'1h'}));
app.get('/{*path}',(req,res)=>{
  if(req.path.startsWith('/api'))return res.status(404).json({error:'Not found'});
  return res.sendFile(join(root,'../dist/index.html'));
});
app.use((error,req,res,_next)=>{
  const status=error.status || (error.code==='23503'?400:error.code==='23505'?409:500);
  if(status===500)console.error('Campaign Center API error',error.message);
  res.status(status).json({error:status===500?'Unexpected server error':error.message});
});
const port=Number(process.env.PORT||10000);
app.listen(port,'0.0.0.0',()=>console.log('Campaign Center Neon API listening on',port));
