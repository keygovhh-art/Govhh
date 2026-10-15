import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import express from 'express';
import pg from 'pg';
import teamRouter from '../server/team.js';
import campaignAdminRouter from '../server/campaign-admin.js';
import webHallRouter from '../server/web-hall.js';
import {connectUserRouter,connectServiceRouter} from '../server/connect.js';

const connection=process.env.TEST_DATABASE_URL;
if(!connection)throw new Error('TEST_DATABASE_URL required. Never point this test at production.');
if(!/localhost|127\.0\.0\.1/.test(new URL(connection).hostname))throw new Error('Refusing nonlocal database for test');
const secret='local-ci-shared-test-secret-not-a-production-token-1234';
process.env.GAVHAH_CONNECT_SHARED_SECRET=secret;
const pool=new pg.Pool({connectionString:connection,max:4});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(x);
const trim=(x,n)=>typeof x==='string'?x.trim().slice(0,n):'';
const need=(role,roles)=>{if(!roles.includes(role))throw bad(403,'Permission denied');};
const log=(db,org,camp,actor,kind,id=null,details={})=>db.query(
 'INSERT INTO cc_activity_events(organization_id,campaign_id,actor_subject,event_type,target_id,details) VALUES($1,$2,$3,$4,$5,$6)',
 [org,camp,actor,kind,id,JSON.stringify(details)]);
async function member(db,org,user){
 const r=await db.query("SELECT role FROM cc_memberships WHERE organization_id=$1 AND subject=$2 AND membership_status='active'",[org,user]);
 if(!r.rowCount)throw bad(404,'No membership');return r.rows[0].role;
}
async function campaignAccess(db,id,user){
 if(!uuid(id))throw bad(400,'Invalid campaign');
 const r=await db.query("SELECT c.*,m.role FROM cc_campaigns c JOIN cc_memberships m ON m.organization_id=c.organization_id AND m.subject=$2 AND m.membership_status='active' WHERE c.id=$1",[id,user]);
 if(!r.rowCount)throw bad(404,'No campaign');
 const c=r.rows[0];
 if(!['owner','manager','finance','auditor'].includes(c.role)){
  const link=await db.query('SELECT 1 FROM cc_campaign_members WHERE campaign_id=$1 AND subject=$2',[id,user]);
  if(!link.rowCount)throw bad(404,'Not a campaign team member');
 }
 return c;
}
const auth=(req,res,next)=>{req.userId=req.get('x-test-user')||'anonymous';next();};

async function prepare(){
 // Disposable Postgres on GitHub Actions only; NEVER any external production database.
 for(const file of ['001_core.sql','002_team_connect.sql','003_web_hall.sql']){
  const sql=await readFile(join(import.meta.dirname,'../db',file),'utf8');
  await pool.query(sql);
 }
}
async function launch(){
 const app=express();app.use(express.json({limit:'20kb'}));
 app.use('/api/team',teamRouter({pool,authenticate:auth,member,campaignAccess,need,log,bad,uuid,trim}));
 app.use('/api/campaigns',campaignAdminRouter({pool,authenticate:auth,campaignAccess,need,bad,log,trim}));
 app.use('/api/rooms',webHallRouter({pool,authenticate:auth,campaignAccess,need,log,bad,uuid,trim}));
 app.use('/api/connect/service',connectServiceRouter({pool,bad,uuid,log}));
 app.use('/api/connect',connectUserRouter({pool,authenticate:auth,log,bad}));
 app.use((err,req,res,next)=>res.status(err.status||500).json({error:err.message}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 return {server,url:'http://127.0.0.1:'+server.address().port};
}
test('signed team invitations, lead locks, private linking and exactly-once cross-org ledger',async()=>{
 await prepare();
 const {server,url}=await launch();
 async function req(path,{user,method='GET',data,service=false}={}){
  const r=await fetch(url+'/api'+path,{method,headers:{
   ...(user?{'x-test-user':user}:{}),
   ...(service?{'x-gavhah-connect-secret':secret}:{}),
   ...(data?{'content-type':'application/json'}:{})
  },...(data?{body:JSON.stringify(data)}:{})});
  return {status:r.status,data:await r.json()};
 }
 try{
  const owner='owner-A',first='member-1',second='member-2';
  const org1=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('A', $1) RETURNING id",[owner])).rows[0].id;
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at) VALUES($1,$2,'owner','active',now())",[org1,owner]);
  const c1=(await pool.query("INSERT INTO cc_campaigns(organization_id,title) VALUES($1,'Campaign A') RETURNING id",[org1])).rows[0].id;
  await pool.query('INSERT INTO cc_campaign_members(organization_id,campaign_id,subject) VALUES($1,$2,$3)',[org1,c1,owner]);
  const uninvitedEdit=await req('/campaigns/'+c1,{user:'stranger',method:'PATCH',data:{status:'active'}});
  assert.equal(uninvitedEdit.status,404,'Uninvited account cannot edit campaign');
  const activated=await req('/campaigns/'+c1,{user:owner,method:'PATCH',data:{status:'active',goalAmount:'125000.00'}});
  assert.equal(activated.status,200,'Owner can set target and activate campaign');
  assert.equal(activated.data.status,'active');
  assert.equal(Number(activated.data.goal_amount),125000);
  const closed=await req('/campaigns/'+c1,{user:owner,method:'PATCH',data:{status:'closed'}});
  assert.equal(closed.status,200,'Closed campaign retains data');
  const reopened=await req('/campaigns/'+c1,{user:owner,method:'PATCH',data:{status:'active'}});
  assert.equal(reopened.status,200,'Reopening is an audited lifecycle change');
  const audit=(await pool.query("SELECT COUNT(*)::int n FROM cc_activity_events WHERE event_type='campaign.settings_changed' AND campaign_id=$1",[c1])).rows[0].n;
  assert.equal(audit,3,'Every settings change has retained history');
  const invitePath='/team/organizations/'+org1+'/invitations';
  assert.equal((await req(invitePath,{user:'stranger',method:'POST',data:{role:'askan',campaignId:c1}})).status,404);
  const firstInvite=await req(invitePath,{user:owner,method:'POST',data:{role:'askan',campaignId:c1}});
  assert.equal(firstInvite.status,201);assert.equal(firstInvite.data.invitationCode.length,32);
  const inviteCode=firstInvite.data.invitationCode;
  assert.equal((await req('/team/invitations/redeem',{user:first,method:'POST',data:{invitationCode:inviteCode}})).status,200);
  assert.equal((await req('/team/invitations/redeem',{user:second,method:'POST',data:{invitationCode:inviteCode}})).status,404);
  const secondInvite=await req(invitePath,{user:owner,method:'POST',data:{role:'askan',campaignId:c1}});
  assert.equal((await req('/team/invitations/redeem',{user:second,method:'POST',data:{invitationCode:secondInvite.data.invitationCode}})).status,200);
  const contact=(await pool.query("INSERT INTO cc_contacts(organization_id,campaign_id,created_by,display_name,phone,privacy) VALUES($1,$2,$3,'Test donor','0000000000','campaign') RETURNING id",[org1,c1,owner])).rows[0].id;
  assert.equal((await req('/team/contacts/'+contact+'/claim',{user:first,method:'POST'})).status,200);
  assert.equal((await req('/team/contacts/'+contact+'/claim',{user:second,method:'POST'})).status,409);
  assert.equal((await req('/team/contacts/'+contact+'/release',{user:first,method:'POST'})).status,200);
  assert.equal((await req('/team/contacts/'+contact+'/claim',{user:second,method:'POST'})).status,200);
  assert.equal((await req('/team/contacts/'+contact+'/release',{user:second,method:'POST'})).status,200);
  assert.equal((await req('/team/campaigns/'+c1+'/members/'+first+'/team',{user:owner,method:'PATCH',data:{teamName:'Group A'}})).status,200);
  assert.equal((await req('/team/campaigns/'+c1+'/members/'+second+'/team',{user:owner,method:'PATCH',data:{teamName:'Group B'}})).status,200);
  assert.equal((await req('/team/campaigns/'+c1+'/contacts/'+contact+'/team',{user:owner,method:'PATCH',data:{teamName:'Group B'}})).status,200);
  const firstAssignees=await req('/team/campaigns/'+c1+'/assignees',{user:first});
  const managerAssignees=await req('/team/campaigns/'+c1+'/assignees',{user:owner});
  assert.equal(firstAssignees.status,200);
  assert.equal(firstAssignees.data.length,1,'Askan sees only own assignee ID');
  assert.equal(firstAssignees.data[0].subject,first);
  assert.equal(managerAssignees.data.length,3,'Manager has all active campaign members');
  const firstQueue=await req('/team/campaigns/'+c1+'/lead-queue',{user:first});
  const secondQueue=await req('/team/campaigns/'+c1+'/lead-queue',{user:second});
  assert.equal(firstQueue.data.length,0,'Other squad cannot list this donor');
  assert.equal(secondQueue.data.length,1,'Assigned squad sees donor');
  assert.equal((await req('/team/contacts/'+contact+'/claim',{user:first,method:'POST'})).status,404);
  assert.equal((await req('/team/contacts/'+contact+'/claim',{user:second,method:'POST'})).status,200);
  assert.equal((await req('/team/campaigns/'+c1+'/manager-overview',{user:first})).status,403);
  const manager=await req('/team/campaigns/'+c1+'/manager-overview',{user:owner});
  assert.equal(manager.status,200);assert.equal(manager.data.members.length,3);
  // Web-only virtual fundraiser room: roles, attendance, announcements and finality.
  const roomCreate=await req('/rooms/campaigns/'+c1,{user:owner,method:'POST',data:{title:'Test campaign room'}});
  assert.equal(roomCreate.status,201);assert.equal(roomCreate.data.room_status,'planned');
  const roomId=roomCreate.data.id;
  assert.equal((await req('/rooms/'+roomId+'/join',{user:first,method:'POST'})).status,409);
  assert.equal((await req('/rooms/'+roomId+'/status',{user:first,method:'PATCH',data:{status:'open'}})).status,403);
  assert.equal((await req('/rooms/'+roomId+'/status',{user:owner,method:'PATCH',data:{status:'open'}})).status,200);
  assert.equal((await req('/rooms/'+roomId+'/join',{user:first,method:'POST'})).status,201);
  assert.equal((await req('/rooms/'+roomId+'/join',{user:first,method:'POST'})).status,200);
  assert.equal((await req('/rooms/'+roomId+'/join',{user:second,method:'POST'})).status,201);
  assert.equal((await req('/rooms/'+roomId+'/heartbeat',{user:first,method:'POST'})).status,200);
  const rooms=await req('/rooms/campaigns/'+c1,{user:owner});
  assert.equal(rooms.data.mode,'web_text_only');
  assert.equal(rooms.data.rooms[0].recently_connected,2);
  assert.equal((await req('/rooms/'+roomId+'/announcements',{user:first,method:'POST',data:{message:'Unauthorized'}})).status,403);
  assert.equal((await req('/rooms/'+roomId+'/announcements',{user:owner,method:'POST',data:{message:'Start with assigned leads only'}})).status,201);
  assert.equal((await req('/rooms/'+roomId+'/announcements',{user:first})).data.length,1);
  assert.equal((await req('/rooms/'+roomId+'/leave',{user:first,method:'POST'})).status,200);
  const countAfterLeave=(await req('/rooms/campaigns/'+c1,{user:owner})).data.rooms[0].recently_connected;
  assert.equal(countAfterLeave,1);
  assert.equal((await req('/rooms/'+roomId+'/status',{user:owner,method:'PATCH',data:{status:'ended'}})).status,200);
  assert.equal((await req('/rooms/'+roomId+'/join',{user:second,method:'POST'})).status,409);
  // Link requires authenticated CC account and authenticated Gavhah service.
  const link=await req('/connect/code',{user:first,method:'POST'});
  assert.equal(link.status,201);assert.equal(link.data.code.length,32);
  assert.equal((await req('/connect/service/redeem',{method:'POST',data:{gavhahUserId:7,code:link.data.code}})).status,403);
  const redeemed=await req('/connect/service/redeem',{service:true,method:'POST',data:{gavhahUserId:7,code:link.data.code}});
  assert.equal(redeemed.status,200);
  assert.equal((await req('/connect/service/redeem',{service:true,method:'POST',data:{gavhahUserId:8,code:link.data.code}})).status,404);
  const campaigns=await req('/connect/service/campaigns?gavhahUserId=7',{service:true});
  assert.equal(campaigns.status,200);assert.deepEqual(campaigns.data.campaigns.map(c=>c.id),[c1]);
  assert.equal((await req('/connect/service/campaigns?gavhahUserId=8',{service:true})).status,403);
  const followup={gavhahUserId:7,campaignId:c1,followupId:913,shareScope:'assigned_managers'};
  const linkedFollowup=await req('/connect/service/followups',{service:true,method:'POST',data:followup});
  assert.equal(linkedFollowup.status,201);
  assert.equal((await req('/connect/service/followups',{service:true,method:'POST',data:followup})).data.duplicate,true);
  const seenFollowups=await req('/connect/service/followups?gavhahUserId=7&campaignId='+c1,{service:true});
  assert.equal(seenFollowups.status,200);
  assert.equal(seenFollowups.data.length,1);
  assert.equal(seenFollowups.data[0].max_followup_ref,'gavhah_max:7:913');
  assert.equal('note' in seenFollowups.data[0],false,'No private source text copied');
  const body={gavhahUserId:7,campaignId:c1,kind:'receipt',amount:'20.00',sourceEventKey:'receipt:123'};
  const saved=await req('/connect/service/finance-events',{service:true,method:'POST',data:body});
  assert.equal(saved.status,201);assert.equal(saved.data.verification,'manually_reported');
  const repeated=await req('/connect/service/finance-events',{service:true,method:'POST',data:body});
  assert.equal(repeated.status,200);assert.equal(repeated.data.duplicate,true);
  const mistaken=await req('/connect/service/finance-events',{service:true,method:'POST',data:{...body,amount:'30.00'}});
  assert.equal(mistaken.status,409);
  const row=(await pool.query("SELECT amount,verified_at,source_system FROM cc_finance_events WHERE source_event_key='receipt:123'")).rows;
  assert.equal(row.length,1);assert.equal(row[0].verified_at,null);assert.equal(row[0].source_system,'gavhah_max');
  const total=(await req('/team/campaigns/'+c1+'/manager-overview',{user:owner})).data.financial;
  assert.equal(Number(total.treasurer_confirmed),0);assert.equal(Number(total.net_manual_received),20);
  const correction={gavhahUserId:7,campaignId:c1,originalReceiptId:123,refundId:55,amount:'5.00'};
  const corrected=await req('/connect/service/finance-reversals',{service:true,method:'POST',data:correction});
  assert.equal(corrected.status,201,'First manual reversal');
  assert.equal((await req('/connect/service/finance-reversals',{service:true,method:'POST',data:correction})).data.duplicate,true);
  assert.equal((await req('/connect/service/finance-reversals',{service:true,method:'POST',data:{...correction,refundId:56,amount:'16.00'}})).status,409,'Reversal cannot exceed original receipt');
  const afterCorrection=(await req('/team/campaigns/'+c1+'/manager-overview',{user:owner})).data.financial;
  assert.equal(Number(afterCorrection.net_manual_received),15,'Net manual total after correction');
  assert.equal(Number(afterCorrection.refunded),5,'Audit records the reversal');
  assert.equal((await pool.query("SELECT COUNT(*)::int n FROM cc_finance_events WHERE event_kind='refund'")).rows[0].n,1);

  // An unrelated organization must not count the same money again.
  const org2=(await pool.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('B',$1) RETURNING id",[first])).rows[0].id;
  await pool.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at) VALUES($1,$2,'owner','active',now())",[org2,first]);
  const c2=(await pool.query("INSERT INTO cc_campaigns(organization_id,title) VALUES($1,'Campaign B') RETURNING id",[org2])).rows[0].id;
  assert.equal((await req('/connect/service/finance-events',{service:true,method:'POST',data:{...body,campaignId:c2}})).status,409);
  assert.equal((await pool.query("SELECT COUNT(*)::int total FROM cc_finance_events WHERE source_system='gavhah_max'")).rows[0].total,2,'Exactly one source receipt PLUS one immutable manual reversal');
  // Unlink blocks access and does not delete the append-only financial history.
  assert.equal((await req('/connect/unlink',{user:first,method:'POST'})).status,200);
  assert.equal((await req('/connect/service/campaigns?gavhahUserId=7',{service:true})).status,403);
  assert.equal((await pool.query("SELECT COUNT(*)::int n FROM cc_finance_events WHERE source_event_key='receipt:123'")).rows[0].n,1);
  assert.equal((await req('/campaigns/'+c1,{user:first,method:'PATCH',data:{goalAmount:'10.00'}})).status,403,'An askan cannot edit goal');
  assert.equal((await req('/team/organizations/'+org1+'/members/'+owner,{user:first,method:'PATCH',data:{status:'revoked'}})).status,403,'No one may revoke owner');
  assert.equal((await req('/team/organizations/'+org1+'/members/'+first,{user:first,method:'PATCH',data:{status:'suspended'}})).status,403,'No member can suspend self');
  assert.equal((await req('/team/organizations/'+org1+'/members/'+second,{user:owner,method:'PATCH',data:{status:'suspended'}})).status,200,'Owner may suspend a member');
  assert.equal((await req('/team/campaigns/'+c1+'/lead-queue',{user:second})).status,404,'Suspended member loses access immediately');
  assert.equal((await req('/team/organizations/'+org1+'/members/'+second,{user:owner,method:'PATCH',data:{status:'active'}})).status,200,'Owner may explicitly reactivate');
  assert.equal((await req('/team/campaigns/'+c1+'/assignees',{user:second})).status,200,'Access restored after explicit reactivation');
  const otherCampaign=(await pool.query("INSERT INTO cc_campaigns(organization_id,title) VALUES($1,'Campaign A 2') RETURNING id",[org1])).rows[0].id;
  assert.equal((await req('/campaigns/'+otherCampaign,{user:first,method:'PATCH',data:{status:'active'}})).status,404,'Nonteam askan cannot modify second campaign');

 }finally{await new Promise(resolve=>server.close(resolve));await pool.end();}
});
