import express from "express";
import pg from "pg";
import { buildTokenVerifier } from "./auth.mjs";

const isUUID=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const validText=(v,max)=>typeof v==="string"&&v.trim().length>0&&v.trim().length<=max;
const fail=(status,message)=>{const e=Error(message);e.status=status;throw e};
const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const managerial=new Set(["owner","manager"]);
const roles=new Set(["manager","squad_leader","askan","finance","auditor"]);
const statuses=new Set(["draft","active","paused","closed"]);
const priorities=new Set(["low","normal","high","critical"]);
const kinds=new Set(["task","call_lead","followup","review"]);
const jobStatuses=new Set(["open","in_progress","done","cancelled"]);
const digits=v=>typeof v==="string"&&/^(?:0|[1-9][0-9]{0,8})(?:\\.[0-9]{1,2})?$/.test(v)&&Number(v)<=999999999;
const nextDate=v=>v===null||v===undefined||v===""?null:
  typeof v==="string"&&!Number.isNaN(new Date(v).getTime())?new Date(v):fail(400,"Invalid dueAt");

async function transaction(pool,fn){
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const result=await fn(client);
    await client.query("COMMIT");
    return result;
  }catch(e){await client.query("ROLLBACK");throw e}
  finally{client.release()}
}
async function logEvent(client,{orgId,campaignId=null,subject,type,targetId=null,details={}}){
  await client.query(`INSERT INTO cc_activity_events
    (organization_id,campaign_id,actor_subject,event_type,target_id,details)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [orgId,campaignId,subject,type,targetId,JSON.stringify(details)]);
}
async function organizationRole(db,id,subject){
  if(!isUUID(id))fail(400,"Invalid organization ID");
  const {rows}=await db.query(`SELECT organization_id,role,membership_status
    FROM cc_memberships WHERE organization_id=$1 AND subject=$2
      AND membership_status='active'`,[id,subject]);
  if(!rows[0])fail(404,"Organization not found");
  return rows[0].role;
}
async function campaignAccess(db,id,subject){
  if(!isUUID(id))fail(400,"Invalid campaign ID");
  const {rows}=await db.query(`SELECT c.id,c.organization_id,c.title,c.goal_amount,c.status,
      c.currency,m.role,
      EXISTS(SELECT 1 FROM cc_campaign_members cm
        WHERE cm.campaign_id=c.id AND cm.subject=$2) AS assigned
    FROM cc_campaigns c
    JOIN cc_memberships m ON m.organization_id=c.organization_id
      AND m.subject=$2 AND m.membership_status='active'
    WHERE c.id=$1
      AND (m.role IN ('owner','manager')
        OR EXISTS(SELECT 1 FROM cc_campaign_members cm
          WHERE cm.campaign_id=c.id AND cm.subject=$2))`,[id,subject]);
  if(!rows[0])fail(404,"Campaign not found");
  return rows[0];
}
export function createApp({pool,verifyBearer,publicOrigin}){
  if(!pool||!verifyBearer||!publicOrigin)throw Error("Missing API security configuration");
  const trustedOrigin=new URL(publicOrigin).origin;
  const app=express();
  app.disable("x-powered-by");
  app.use((req,res,next)=>{
    res.setHeader("Cache-Control","private, no-store");
    res.setHeader("X-Content-Type-Options","nosniff");
    res.setHeader("Referrer-Policy","no-referrer");
    const origin=req.headers.origin;
    if(origin&&origin!==trustedOrigin)return res.status(403).json({error:"Origin not allowed"});
    if(origin){
      res.setHeader("Access-Control-Allow-Origin",trustedOrigin);
      res.setHeader("Vary","Origin");
      res.setHeader("Access-Control-Allow-Headers","Authorization, Content-Type, Idempotency-Key");
      res.setHeader("Access-Control-Allow-Methods","GET,POST,PATCH,OPTIONS");
    }
    if(req.method==="OPTIONS")return res.sendStatus(204);
    next();
  });
  app.use(express.json({limit:"64kb",strict:true}));
  app.get("/health",(_req,res)=>res.json({ok:true,service:"campaign-center-api",mode:"staging"}));
  app.use("/api",asyncRoute(async(req,_res,next)=>{
    req.account=await verifyBearer(req.headers.authorization);
    next();
  }));
  app.get("/api/me",asyncRoute(async(req,res)=>{
    const {rows}=await pool.query(`
      SELECT m.organization_id AS "organizationId",o.name AS "organizationName",
        m.role,m.membership_status AS "status"
      FROM cc_memberships m JOIN cc_organizations o ON o.id=m.organization_id
      WHERE m.subject=$1 ORDER BY o.created_at DESC LIMIT 100`,[req.account.sub]);
    res.json({subject:req.account.sub,organizations:rows});
  }));
  app.post("/api/organizations",asyncRoute(async(req,res)=>{
    const name=req.body?.name;
    if(!validText(name,150))fail(400,"Organization name is required");
    const created=await transaction(pool,async client=>{
      const {rows:[org]}=await client.query(`
        INSERT INTO cc_organizations(name,owner_subject) VALUES ($1,$2)
        RETURNING id,name,created_at AS "createdAt"`,[name.trim(),req.account.sub]);
      await client.query(`INSERT INTO cc_memberships
        (organization_id,subject,role,membership_status,joined_at)
        VALUES($1,$2,'owner','active',now())`,[org.id,req.account.sub]);
      await logEvent(client,{orgId:org.id,subject:req.account.sub,type:"organization_created",
        targetId:org.id,details:{name:org.name}});
      return org;
    });
    res.status(201).json(created);
  }));
  app.get("/api/organizations/:orgId/members",asyncRoute(async(req,res)=>{
    const role=await organizationRole(pool,req.params.orgId,req.account.sub);
    if(!managerial.has(role))fail(403,"Manager access required");
    const {rows}=await pool.query(`SELECT subject,role,membership_status AS status,
      joined_at AS "joinedAt" FROM cc_memberships WHERE organization_id=$1
      ORDER BY updated_at DESC LIMIT 500`,[req.params.orgId]);
    res.json(rows);
  }));
  // Only trusted managers can invite an existing, known identity subject.
  // This is NOT a public email invitation link or an automatic account creation.
  app.post("/api/organizations/:orgId/members",asyncRoute(async(req,res)=>{
    const {orgId}=req.params;
    const subject=req.body?.subject,role=req.body?.role||"askan";
    if(typeof subject!=="string"||subject.length<3||subject.length>200||!roles.has(role))
      fail(400,"Known member subject and valid role required");
    const row=await transaction(pool,async client=>{
      const self=await organizationRole(client,orgId,req.account.sub);
      if(self!=="owner")fail(403,"Only the owner can invite staff");
      const {rows}=await client.query(`
        INSERT INTO cc_memberships(organization_id,subject,role,membership_status)
        VALUES($1,$2,$3,'invited')
        ON CONFLICT (organization_id,subject) DO NOTHING
        RETURNING subject,role,membership_status AS status`,[orgId,subject,role]);
      if(!rows[0])fail(409,"Existing membership cannot be silently overwritten");
      await logEvent(client,{orgId,subject:req.account.sub,type:"member_invited",
        details:{invitee:subject,role}});
      return rows[0];
    });
    res.status(201).json(row);
  }));
  app.post("/api/organizations/:orgId/invitations/accept",asyncRoute(async(req,res)=>{
    const result=await transaction(pool,async client=>{
      const {rows}=await client.query(`UPDATE cc_memberships SET
        membership_status='active',joined_at=now(),updated_at=now()
        WHERE organization_id=$1 AND subject=$2 AND membership_status='invited'
        RETURNING subject,role,membership_status AS status`,
        [req.params.orgId,req.account.sub]);
      if(!rows[0])fail(404,"Invitation not found");
      await logEvent(client,{orgId:req.params.orgId,subject:req.account.sub,
        type:"invitation_accepted",details:{role:rows[0].role}});
      return rows[0];
    });
    res.json(result);
  }));
  app.get("/api/organizations/:orgId/campaigns",asyncRoute(async(req,res)=>{
    const role=await organizationRole(pool,req.params.orgId,req.account.sub);
    const {rows}=await pool.query(`
      SELECT c.id,c.title,c.goal_amount AS "goalAmount",c.status,c.created_at AS "createdAt"
      FROM cc_campaigns c WHERE c.organization_id=$1 AND (
        $3::boolean OR EXISTS(SELECT 1 FROM cc_campaign_members cm
          WHERE cm.campaign_id=c.id AND cm.subject=$2))
      ORDER BY c.created_at DESC LIMIT 200`,[
        req.params.orgId,req.account.sub,managerial.has(role)]);
    res.json(rows);
  }));
  app.post("/api/organizations/:orgId/campaigns",asyncRoute(async(req,res)=>{
    const {orgId}=req.params,title=req.body?.title,amount=req.body?.goalAmount||"0";
    if(!validText(title,180)||!digits(String(amount)))fail(400,"Invalid campaign name or goal");
    const campaign=await transaction(pool,async client=>{
      const role=await organizationRole(client,orgId,req.account.sub);
      if(!managerial.has(role))fail(403,"Manager access required");
      const {rows:[created]}=await client.query(`
        INSERT INTO cc_campaigns(organization_id,title,goal_amount)
        VALUES($1,$2,$3) RETURNING id,organization_id AS "organizationId",
        title,goal_amount AS "goalAmount",status`,[orgId,title.trim(),String(amount)]);
      await client.query(`INSERT INTO cc_campaign_members
        (organization_id,campaign_id,subject) VALUES($1,$2,$3)`,
        [orgId,created.id,req.account.sub]);
      await logEvent(client,{orgId,campaignId:created.id,subject:req.account.sub,
        type:"campaign_created",targetId:created.id,
        details:{title:created.title,goalAmount:created.goalAmount}});
      return created;
    });
    res.status(201).json(campaign);
  }));
  app.get("/api/campaigns/:campaignId",asyncRoute(async(req,res)=>{
    res.json(await campaignAccess(pool,req.params.campaignId,req.account.sub));
  }));
  app.patch("/api/campaigns/:campaignId",asyncRoute(async(req,res)=>{
    const data=req.body||{};
    if(!Object.keys(data).length||Object.keys(data).some(k=>!["title","goalAmount","status"].includes(k)))
      fail(400,"Invalid campaign changes");
    if(data.title!==undefined&&!validText(data.title,180))fail(400,"Invalid title");
    if(data.goalAmount!==undefined&&!digits(String(data.goalAmount)))fail(400,"Invalid campaign goal");
    if(data.status!==undefined&&!statuses.has(data.status))fail(400,"Invalid status");
    const updated=await transaction(pool,async client=>{
      const campaign=await campaignAccess(client,req.params.campaignId,req.account.sub);
      if(!managerial.has(campaign.role))fail(403,"Manager access required");
      const {rows:[newValue]}=await client.query(`
        UPDATE cc_campaigns SET
          title=COALESCE($2,title),goal_amount=COALESCE($3,goal_amount),
          status=COALESCE($4,status)
        WHERE id=$1 RETURNING id,title,goal_amount AS "goalAmount",status`,
        [campaign.id,data.title?.trim()||null,data.goalAmount===undefined?null:String(data.goalAmount),data.status||null]);
      await logEvent(client,{orgId:campaign.organization_id,campaignId:campaign.id,
        subject:req.account.sub,type:"campaign_updated",targetId:campaign.id,
        details:{before:{title:campaign.title,goalAmount:campaign.goal_amount,status:campaign.status},
          after:newValue}});
      return newValue;
    });
    res.json(updated);
  }));
  app.post("/api/campaigns/:campaignId/members",asyncRoute(async(req,res)=>{
    const subject=req.body?.subject,teamName=req.body?.teamName||"";
    if(typeof subject!=="string"||subject.length<3||subject.length>200||
      typeof teamName!=="string"||teamName.length>120)fail(400,"Invalid team member");
    const row=await transaction(pool,async client=>{
      const campaign=await campaignAccess(client,req.params.campaignId,req.account.sub);
      if(!managerial.has(campaign.role))fail(403,"Manager access required");
      const {rows:[member]}=await client.query(`SELECT subject,membership_status
        FROM cc_memberships WHERE organization_id=$1 AND subject=$2`,
        [campaign.organization_id,subject]);
      if(!member)fail(404,"Invite member to organization first");
      const {rows}=await client.query(`INSERT INTO cc_campaign_members
        (organization_id,campaign_id,subject,team_name) VALUES ($1,$2,$3,$4)
        ON CONFLICT (campaign_id,subject) DO NOTHING RETURNING subject,team_name AS "teamName"`,
        [campaign.organization_id,campaign.id,subject,teamName.trim()]);
      if(!rows[0])fail(409,"Already assigned to this campaign");
      await logEvent(client,{orgId:campaign.organization_id,campaignId:campaign.id,
        subject:req.account.sub,type:"campaign_member_added",
        details:{member:subject,teamName:teamName.trim()}});
      return rows[0];
    });
    res.status(201).json(row);
  }));
  app.get("/api/campaigns/:campaignId/assignments",asyncRoute(async(req,res)=>{
    const campaign=await campaignAccess(pool,req.params.campaignId,req.account.sub);
    const all=managerial.has(campaign.role);
    const {rows}=await pool.query(`SELECT id,assignee_subject AS "assigneeSubject",
      title,kind,priority,status,due_at AS "dueAt",created_at AS "createdAt"
      FROM cc_assignments WHERE campaign_id=$1 AND ($3::boolean OR assignee_subject=$2)
      ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
        created_at DESC LIMIT 500`,
      [campaign.id,req.account.sub,all]);
    res.json(rows);
  }));
  app.post("/api/campaigns/:campaignId/assignments",asyncRoute(async(req,res)=>{
    const requestKey=req.get("Idempotency-Key");
    const {title,assigneeSubject,kind="task",priority="normal",dueAt=null}=req.body||{};
    if(!requestKey||requestKey.length<12||requestKey.length>128||
      !validText(title,240)||typeof assigneeSubject!=="string"||
      assigneeSubject.length<3||assigneeSubject.length>200||
      !kinds.has(kind)||!priorities.has(priority))fail(400,"Invalid assignment or idempotency key");
    const date=nextDate(dueAt);
    const result=await transaction(pool,async client=>{
      const campaign=await campaignAccess(client,req.params.campaignId,req.account.sub);
      if(!managerial.has(campaign.role))fail(403,"Manager access required");
      const {rows:[member]}=await client.query(`SELECT 1 FROM cc_campaign_members cm
        JOIN cc_memberships m ON m.organization_id=cm.organization_id
          AND m.subject=cm.subject AND m.membership_status='active'
        WHERE cm.campaign_id=$1 AND cm.subject=$2`,
        [campaign.id,assigneeSubject]);
      if(!member)fail(409,"Assignee is not an active campaign member");
      const {rows}=await client.query(`INSERT INTO cc_assignments
        (organization_id,campaign_id,assignee_subject,title,kind,priority,due_at,request_key)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (campaign_id,request_key) WHERE request_key IS NOT NULL
        DO NOTHING RETURNING *`,
        [campaign.organization_id,campaign.id,assigneeSubject,title.trim(),kind,priority,date,requestKey]);
      if(rows[0]){
        await logEvent(client,{orgId:campaign.organization_id,campaignId:campaign.id,
          subject:req.account.sub,type:"assignment_created",targetId:rows[0].id,
          details:{assigneeSubject,title:title.trim(),kind,priority,dueAt:date?.toISOString()||null}});
        return {created:true,row:rows[0]};
      }
      const {rows:[old]}=await client.query(`SELECT * FROM cc_assignments
        WHERE campaign_id=$1 AND request_key=$2`,[campaign.id,requestKey]);
      if(!old||old.assignee_subject!==assigneeSubject||old.title!==title.trim()||
        old.kind!==kind||old.priority!==priority||
        (old.due_at?.toISOString()||null)!==(date?.toISOString()||null))
        fail(409,"Idempotency key already used for a different assignment");
      return {created:false,row:old};
    });
    res.status(result.created?201:200).json({
      id:result.row.id,assigneeSubject:result.row.assignee_subject,
      title:result.row.title,kind:result.row.kind,
      priority:result.row.priority,status:result.row.status,
      dueAt:result.row.due_at,duplicate:!result.created,
    });
  }));
  app.patch("/api/campaigns/:campaignId/assignments/:assignmentId",asyncRoute(async(req,res)=>{
    const {status}=req.body||{};
    if(!isUUID(req.params.assignmentId)||!jobStatuses.has(status)||
      Object.keys(req.body||{}).some(k=>k!=="status"))fail(400,"Invalid assignment change");
    const updated=await transaction(pool,async client=>{
      const campaign=await campaignAccess(client,req.params.campaignId,req.account.sub);
      const {rows:[job]}=await client.query(`SELECT * FROM cc_assignments
        WHERE id=$1 AND campaign_id=$2 FOR UPDATE`,
        [req.params.assignmentId,campaign.id]);
      if(!job)fail(404,"Assignment not found");
      if(!managerial.has(campaign.role)){
        if(job.assignee_subject!==req.account.sub||!["in_progress","done"].includes(status))
          fail(403,"No permission to change this assignment");
      }
      if(job.status===status)return job;
      const {rows:[row]}=await client.query(`UPDATE cc_assignments SET status=$2
        WHERE id=$1 RETURNING *`,[job.id,status]);
      await logEvent(client,{orgId:campaign.organization_id,campaignId:campaign.id,
        subject:req.account.sub,type:"assignment_status_changed",targetId:job.id,
        details:{from:job.status,to:status,assigneeSubject:job.assignee_subject}});
      return row;
    });
    res.json({id:updated.id,status:updated.status});
  }));
  app.get("/api/campaigns/:campaignId/history",asyncRoute(async(req,res)=>{
    const campaign=await campaignAccess(pool,req.params.campaignId,req.account.sub);
    if(!managerial.has(campaign.role))fail(403,"Manager access required for full campaign audit");
    const limit=Number(req.query.limit||50),offset=Number(req.query.offset||0);
    if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0||offset>100000)
      fail(400,"Invalid history pagination");
    const {rows}=await pool.query(`SELECT id,event_type AS "eventType",
      actor_subject AS "actorSubject",target_id AS "targetId",
      details,created_at AS "createdAt"
      FROM cc_activity_events WHERE campaign_id=$1 ORDER BY created_at DESC,id DESC
      LIMIT $2 OFFSET $3`,[campaign.id,limit+1,offset]);
    res.json({items:rows.slice(0,limit),hasMore:rows.length>limit,
      nextOffset:offset+Math.min(rows.length,limit)});
  }));
  app.use((err,_req,res,_next)=>{
    const status=err.status||((err.type==="entity.too.large")?413:500);
    if(status>=500)console.error("Campaign API failure:",err);
    res.status(status).json({error:status>=500?"Internal server error":err.message});
  });
  return app;
}
export function appFromEnvironment(){
  const dbUrl=process.env.DATABASE_URL;
  if(!dbUrl)throw Error("DATABASE_URL required");
  const parsed=new URL(dbUrl);
  const isLocal=["127.0.0.1","localhost","::1"].includes(parsed.hostname);
  if(!isLocal&&process.env.CC_EXPECTED_DB_HOST!==parsed.hostname)
    throw Error("Wrong Neon staging target: CC_EXPECTED_DB_HOST must match exactly");
  if(!isLocal&&parsed.searchParams.get("sslmode")!=="require")
    throw Error("Neon TLS required");
  const pool=new pg.Pool({connectionString:dbUrl,max:8,
    connectionTimeoutMillis:6000,idleTimeoutMillis:15000});
  const verifyBearer=buildTokenVerifier({
    issuer:process.env.CC_JWT_ISSUER,
    audience:process.env.CC_JWT_AUDIENCE,
    jwksUrl:process.env.CC_JWKS_URL,
  });
  return createApp({pool,verifyBearer,
    publicOrigin:process.env.CC_PUBLIC_ORIGIN});
}
