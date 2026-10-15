import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import express from 'express';
import pg from 'pg';
import {spawnSync} from 'node:child_process';
import teamRouter from '../server/team.js';
import campaignAdminRouter from '../server/campaign-admin.js';
import contactsImportRouter from '../server/contacts-import.js';
import webHallRouter from '../server/web-hall.js';
import conferenceRouter from '../server/conferences.js';
import rtcAudioRouter from '../server/rtc-audio.js';
import videoRouter from '../server/video.js';
import floorRouter from '../server/floor.js';
import programRouter from '../server/floor-programs.js';
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
 for(const file of ['001_core.sql','002_team_connect.sql','003_web_hall.sql','004_conference_center.sql','005_virtual_campaign_floor.sql','006_floor_program_checkins.sql','007_conference_policy_lists.sql','008_opt_in_video.sql','009_experimental_browser_audio.sql','010_automatic_event_schedule.sql','011_sponsored_max_seats.sql']){
  const sql=await readFile(join(import.meta.dirname,'../db',file),'utf8');
  await pool.query(sql);
 }
}
async function launch(){
 const app=express();app.use('/api/import',express.json({limit:'1mb'}));app.use(express.json({limit:'20kb'}));
 app.use('/api/team',teamRouter({pool,authenticate:auth,member,campaignAccess,need,log,bad,uuid,trim}));
 app.use('/api/campaigns',campaignAdminRouter({pool,authenticate:auth,campaignAccess,need,bad,log,trim}));
 app.use('/api/import',contactsImportRouter({pool,authenticate:auth,campaignAccess,need,bad,log}));
 app.use('/api/rooms',webHallRouter({pool,authenticate:auth,campaignAccess,need,log,bad,uuid,trim}));
 process.env.CC_EXPERIMENTAL_P2P_AUDIO='true';
 app.use('/api/conferences',conferenceRouter({pool,authenticate:auth,member,campaignAccess,need,log,bad,uuid,trim}));
 app.use('/api/rtc',rtcAudioRouter({pool,authenticate:auth,member,campaignAccess,bad,uuid,log}));
 app.use('/api/video',videoRouter({pool,authenticate:auth,member,campaignAccess,need,log,bad,uuid,trim}));
 app.use('/api/floor',floorRouter({pool,authenticate:auth,campaignAccess,need,log,bad,uuid,trim}));
 app.use('/api/floor-program',programRouter({pool,authenticate:auth,campaignAccess,need,log,bad,uuid,trim}));
 app.use('/api/connect/service',connectServiceRouter({pool,bad,uuid,log}));
 app.use('/api/connect',connectUserRouter({pool,authenticate:auth,log,bad}));
 app.use((err,req,res,next)=>res.status(err.status||500).json({error:err.message}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 return {server,url:'http://127.0.0.1:'+server.address().port};
}
test('signed team invitations, lead locks, private linking and exactly-once cross-org ledger',async()=>{
 await prepare();
 // Run the EXACT reviewed release runner against disposable PostgreSQL.
 // A fully migrated schema must produce a no-op, and a 'production' invocation
 // without owner approval must fail even on localhost.
 const migrated=spawnSync(process.execPath,[join(import.meta.dirname,'../scripts/apply-reviewed-schema.mjs')],{
  env:{...process.env,DATABASE_URL:connection,CC_EXPECTED_DB_HOST:new URL(connection).hostname,CC_MIGRATION_MODE:'staging'},
  encoding:'utf8',timeout:30000
 });
 assert.equal(migrated.status,0,'Read-only already-migrated schema check must pass: '+migrated.stderr);
 assert.match(migrated.stdout,/Already migrated: 29 CC tables/);
 const unapproved=spawnSync(process.execPath,[join(import.meta.dirname,'../scripts/apply-reviewed-schema.mjs')],{
  env:{...process.env,DATABASE_URL:connection,CC_EXPECTED_DB_HOST:new URL(connection).hostname,
   CC_MIGRATION_MODE:'production',CC_PRODUCTION_MIGRATION_APPROVED:'no',CC_PRODUCTION_BACKUP_BRANCH_ID:''},
  encoding:'utf8',timeout:30000
 });
 assert.notEqual(unapproved.status,0,'Production runner must fail closed without owner approval');
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
  // The audit trail is real, tenant scoped, and remains available after closing rooms.
  const ownerAudit=await req('/team/campaigns/'+c1+'/activity',{user:owner});
  const firstAudit=await req('/team/campaigns/'+c1+'/activity',{user:first});
  assert.equal(ownerAudit.status,200);
  assert.equal(ownerAudit.data.scope,'campaign');
  assert.ok(ownerAudit.data.events.some(x=>x.event_type==='room.announcement'));
  assert.equal(firstAudit.status,200);
  assert.equal(firstAudit.data.scope,'personal');
  assert.ok(firstAudit.data.events.every(x=>x.actor_subject===first));
  assert.equal((await req('/team/campaigns/'+c1+'/activity',{user:'stranger'})).status,404);
  // CSV export: a squad cannot export another group's contact; private donor notes
  // and spreadsheet formula injection must not leak or execute.
  const dangerous=(await pool.query("INSERT INTO cc_contacts(organization_id,campaign_id,created_by,display_name,phone,privacy,assigned_team,notes) VALUES($1,$2,$3,$4,$5,'campaign','Group B',$6) RETURNING id",
    [org1,c1,second,'=HYPERLINK("https://bad.example","Click")','0000000001','private donor note'])).rows[0].id;
  const privateOwner=(await pool.query("INSERT INTO cc_contacts(organization_id,campaign_id,created_by,display_name,phone,privacy,assigned_team,notes) VALUES($1,$2,$3,'Private owner entry','0000000002','private','', 'owner secret memo') RETURNING id",[org1,c1,owner])).rows[0].id;
  async function csv(user){
   const raw=await fetch(url+'/api/team/campaigns/'+c1+'/contacts.csv?page=1',{headers:{'x-test-user':user}});
   return {status:raw.status,body:await raw.text(),type:raw.headers.get('content-type')};
  }
  const firstCsv=await csv(first);
  const secondCsv=await csv(second);
  const managerCsv=await csv(owner);
  assert.equal(firstCsv.status,200);
  assert.ok(!firstCsv.body.includes(dangerous),'Group A must not export Group B contact');
  assert.ok(!firstCsv.body.includes('owner secret memo'),'Owner private memo not exported');
  assert.ok(secondCsv.body.includes(dangerous),'Group B can export own squad record');
  assert.ok(!secondCsv.body.includes('owner secret memo'),'Owner private record not exported to others');
  assert.ok(secondCsv.body.includes("'=HYPERLINK"),'Spreadsheet formula neutralized');
  assert.ok(managerCsv.body.includes(dangerous),'Manager may export shared group contacts');
  assert.ok(managerCsv.body.includes(privateOwner),'Manager sees own private record');
  assert.ok(!managerCsv.body.includes('private donor note'),'Manager must not export other creator private notes');
  assert.equal((await csv('stranger')).status,404);
  // Import is a dry run first, owner/manager only. A retry never duplicates
  // contacts or overwrites opt-outs and historical notes.
  const importPath='/import/campaigns/'+c1+'/contacts/import';
  const contactRows=[
    {name:'New Donor One',phone:'+1 (315) 555-0200',notes:'Imported by manager'},
    {name:'Duplicate Format',phone:'13155550200',notes:'Should not duplicate'},
    {name:'New Donor Two',phone:'315-555-0201',notes:''},
  ];
  assert.equal((await req(importPath,{user:first,method:'POST',data:{rows:contactRows,dryRun:true}})).status,403,'Askan cannot import whole campaign contact lists');
  assert.equal((await req(importPath,{user:owner,method:'POST',data:{rows:[{name:'X',phone:'123'}],dryRun:true}})).status,422,'Invalid phone must fail closed');
  const beforePreview=(await pool.query('SELECT count(*)::int n FROM cc_contacts WHERE campaign_id=$1',[c1])).rows[0].n;
  const preview=await req(importPath,{user:owner,method:'POST',data:{rows:contactRows,dryRun:true}});
  assert.equal(preview.status,200);assert.equal(preview.data.importable,2);
  assert.equal(preview.data.inFileDuplicates,1);
  assert.equal((await pool.query('SELECT count(*)::int n FROM cc_contacts WHERE campaign_id=$1',[c1])).rows[0].n,beforePreview,'Preview writes nothing');
  const imported=await req(importPath,{user:owner,method:'POST',data:{rows:contactRows,dryRun:false}});
  assert.equal(imported.status,201);assert.equal(imported.data.created,2);
  const twice=await req(importPath,{user:owner,method:'POST',data:{rows:contactRows,dryRun:false}});
  assert.equal(twice.status,201);assert.equal(twice.data.created,0);
  const normalized=(await pool.query("SELECT count(*)::int n FROM cc_contacts WHERE campaign_id=$1 AND regexp_replace(phone,'[^0-9]','','g')='13155550200'",[c1])).rows[0].n;
  assert.equal(normalized,1,'Phone normalization deduplicates spreadsheet variants');
  const importedHistory=(await pool.query("SELECT count(*)::int n FROM cc_activity_events WHERE campaign_id=$1 AND event_type='contacts.csv_import'",[c1])).rows[0].n;
  assert.equal(importedHistory,2,'Both first submission and retry keep audit events');
  // Independent 'Hitkabtzu' conference: every test participant is a member
  // of this organization, but only moderators can manage floor/waiting room.
  const confCreated=await req('/conferences/organizations/'+org1,{user:owner,method:'POST',data:{
    title:'Asifas Chizuk',category:'inspiration',accessMode:'code',
    speakingMode:'moderated',agenda:'Lecture then questions'
  }});
  assert.equal(confCreated.status,201);
  assert.equal(confCreated.data.accessCode.length,24);
  const conferenceId=confCreated.data.conference.id;
  assert.equal((await req('/conferences/organizations/'+org1,{user:first,method:'POST',data:{title:'Hijack'}})).status,403);
  assert.equal((await req('/conferences/'+conferenceId+'/join',{user:first,method:'POST',data:{accessCode:confCreated.data.accessCode}})).status,409,'Planned conference must not admit anyone');
  assert.equal((await req('/conferences/'+conferenceId,{user:owner,method:'PATCH',data:{roomStatus:'open'}})).status,200);
  assert.equal((await req('/conferences/'+conferenceId+'/join',{user:first,method:'POST',data:{accessCode:'bad'}})).status,403,'Invalid code');
  assert.equal((await req('/conferences/'+conferenceId+'/join',{user:owner,method:'POST'})).data.admitted,true);
  const waiting=await req('/conferences/'+conferenceId+'/join',{user:first,method:'POST',data:{accessCode:confCreated.data.accessCode}});
  assert.equal(waiting.status,200);assert.equal(waiting.data.waiting,true,'Moderated meetings use waiting room');
  const waitingView=await req('/conferences/'+conferenceId+'/snapshot',{user:first});
  assert.equal(waitingView.data.waiting,true);assert.deepEqual(waitingView.data.messages,[],'Waiting attendees cannot read private discussion');

  // Internet video is OPTIONAL, server-disabled by default and requires the
  // human viewer to be admitted and actively permitted, regardless of URL knowledge.
  const videoConf='/video/conference/'+conferenceId;
  const externalVideo='https://media.example.org/approved-chizuk-live.m3u8';
  assert.equal((await req(videoConf+'/status',{user:first})).data.enabled,false,'Video defaults OFF');
  assert.equal((await req(videoConf+'/watch',{user:owner})).status,403,'Even manager cannot watch disabled video');
  assert.equal((await req(videoConf+'/config',{user:first,method:'PATCH',data:{enabled:true,accessMode:'admitted',sourceUrl:externalVideo}})).status,403,'No volunteer may configure stream');
  assert.equal((await req(videoConf+'/config',{user:owner,method:'PATCH',data:{enabled:true,accessMode:'approved_only'}})).status,409,'Cannot enable without approved external source');
  assert.equal((await req(videoConf+'/config',{user:owner,method:'PATCH',data:{enabled:true,accessMode:'approved_only',sourceUrl:externalVideo}})).status,200);
  assert.equal((await req(videoConf+'/watch',{user:first})).status,403,'Waiting attendee never sees video link');
  assert.equal((await req(videoConf+'/watch',{user:owner})).data.url,externalVideo,'Manager can preview configured video');
  assert.equal((await req(videoConf+'/status',{user:first})).data.configuredUrl,undefined,'Viewer never receives admin source setup');


  const feedUrl='https://example.org/secure-conference-lecture.mp3';
  assert.equal((await req('/conferences/'+conferenceId,{user:owner,method:'PATCH',data:{mediaUrl:'http://localhost:3000/private'}})).status,400,'Internal or insecure media links are rejected');
  assert.equal((await req('/conferences/'+conferenceId,{user:first,method:'PATCH',data:{mediaUrl:feedUrl}})).status,403,'Attendee cannot replace conference audio');
  assert.equal((await req('/conferences/'+conferenceId,{user:owner,method:'PATCH',data:{mediaUrl:feedUrl}})).status,200);
  const waitingWithAudio=await req('/conferences/'+conferenceId+'/snapshot',{user:first});
  assert.equal(waitingWithAudio.data.conference.media_url,undefined,'Unadmitted attendee cannot discover private audio stream');
  const orgListing=await req('/conferences/organizations/'+org1,{user:first});
  assert.equal(orgListing.data.conferences[0].media_url,undefined,'Room directory does not disclose private media URL');
  assert.equal((await req('/conferences/'+conferenceId+'/snapshot',{user:owner})).data.conference.media_url,feedUrl,'Admitted manager sees configured lecture stream');

  assert.equal((await req('/conferences/'+conferenceId+'/messages',{user:first,method:'POST',data:{body:'not admitted'}})).status,403);
  assert.equal((await req('/conferences/'+conferenceId+'/moderate/'+first,{user:second,method:'POST',data:{action:'admit'}})).status,403);
  assert.equal((await req('/conferences/'+conferenceId+'/moderate/'+first,{user:owner,method:'POST',data:{action:'admit'}})).status,200);
  assert.equal((await req('/conferences/'+conferenceId+'/snapshot',{user:first})).data.you.admitted,true);

  // Small-room browser-to-browser audio (explicit opt-in), not a hotline or
  // advertised scalable media conference. Synthetic SDP only, no real microphone.
  const rtc='/rtc/'+conferenceId;
  assert.equal((await req(rtc+'/join',{user:second,method:'POST',data:{mode:'listener'}})).status,403,'Unadmitted visitor cannot join audio even with organization membership');
  assert.equal((await req(rtc+'/join',{user:first,method:'POST',data:{mode:'speaker'}})).status,403,'Moderator must grant a microphone to a regular attendee');
  assert.equal((await req(rtc+'/join',{user:owner,method:'POST',data:{mode:'speaker'}})).status,200,'Manager may explicitly publish microphone');
  assert.equal((await req(rtc+'/join',{user:first,method:'POST',data:{mode:'listener'}})).status,200,'Admitted person may explicitly listen to pilot');
  const offer=await req(rtc+'/signal',{user:owner,method:'POST',data:{to:first,kind:'offer',payload:{sdp:{type:'offer',sdp:'v=0\\r\\n'}}}});
  assert.equal(offer.status,201);
  assert.equal((await req(rtc+'/state',{user:first})).data.signals.length,1,'Listener receives only the SDP addressed to their own account');
  assert.equal((await req(rtc+'/state',{user:first})).data.signals[0].sender_subject,owner);
  assert.equal((await req(rtc+'/state',{user:second})).status,403,'Waiting/not-joined attendee may not read media signaling');
  assert.equal((await req(rtc+'/signal',{user:first,method:'POST',data:{to:owner,kind:'offer',payload:{sdp:'forbidden'}}})).status,403,'Listener cannot inject microphone offer');
  assert.equal((await req(rtc+'/signal',{user:first,method:'POST',data:{to:owner,kind:'answer',payload:{sdp:{type:'answer',sdp:'v=0'}}}})).status,201);
  assert.equal((await req(rtc+'/state',{user:owner})).data.signals.length,1,'Speaker sees only own addressed answer');
  assert.equal((await req(rtc+'/leave',{user:first,method:'POST',data:{}})).status,200);
  assert.equal((await req(rtc+'/state',{user:first})).status,403,'Left participant cannot read any more signals');


  assert.equal((await req(videoConf+'/watch',{user:first})).status,403,'Admission alone insufficient for approved-only video');
  assert.equal((await req(videoConf+'/allow/'+first,{user:second,method:'PATCH',data:{allowed:true}})).status,403,'Other member cannot grant video');
  assert.equal((await req(videoConf+'/allow/'+first,{user:owner,method:'PATCH',data:{allowed:true}})).status,200);
  assert.equal((await req(videoConf+'/watch',{user:first})).data.url,externalVideo,'Explicitly approved attendee may open stream on user click');
  assert.equal((await req(videoConf+'/allow/'+first,{user:owner,method:'PATCH',data:{allowed:false}})).status,200);
  assert.equal((await req(videoConf+'/watch',{user:first})).status,403,'Revoked viewer permission is immediately enforced');
  assert.equal((await req(videoConf+'/config',{user:owner,method:'PATCH',data:{enabled:true,accessMode:'admitted'}})).status,200);
  assert.equal((await req(videoConf+'/watch',{user:first})).status,200,'Manager can allow all admitted viewers');
  assert.equal((await req(videoConf+'/config',{user:owner,method:'PATCH',data:{enabled:false,accessMode:'admitted'}})).status,200);
  assert.equal((await req(videoConf+'/watch',{user:first})).status,403,'Live video OFF blocks all viewers');

  assert.equal((await req('/conferences/'+conferenceId+'/snapshot',{user:first})).data.conference.media_url,feedUrl,'Admitted listener may play authorized stream');
  assert.equal((await req('/conferences/'+conferenceId+'/messages',{user:first,method:'POST',data:{body:'Muted discussion'}})).status,403);
  assert.equal((await req('/conferences/'+conferenceId+'/hand',{user:first,method:'POST',data:{raised:true}})).data.handRaised,true);
  assert.equal((await req('/conferences/'+conferenceId+'/moderate/'+first,{user:owner,method:'POST',data:{action:'grant'}})).status,200);
  assert.equal((await req('/conferences/'+conferenceId+'/messages',{user:first,method:'POST',data:{body:'Thank you'}})).status,201);
  const policies='/conferences/'+conferenceId+'/policies';
  assert.equal((await req(policies,{user:first})).status,403,'Only manager may inspect policy lists');
  assert.equal((await req(policies+'/'+owner,{user:owner,method:'PATCH',data:{rule:'deny_entry',enabled:true}})).status,403,'Cannot deny a conference manager');
  assert.equal((await req(policies+'/'+first,{user:second,method:'PATCH',data:{rule:'deny_messages',enabled:true}})).status,403,'Volunteer cannot edit access lists');
  assert.equal((await req(policies+'/'+first,{user:owner,method:'PATCH',data:{rule:'deny_messages',enabled:true}})).status,200);
  assert.equal((await req('/conferences/'+conferenceId+'/messages',{user:first,method:'POST',data:{body:'policy bypass'}})).status,403,'Server must enforce message deny list');
  assert.ok((await req(policies,{user:owner})).data.policies.some(p=>p.rule==='deny_messages'&&p.enabled),'Policy appears in manager panel');
  assert.equal((await req(policies+'/'+first,{user:owner,method:'PATCH',data:{rule:'deny_messages',enabled:false}})).status,200);

  assert.equal((await req('/conferences/'+conferenceId+'/moderate/'+first,{user:owner,method:'POST',data:{action:'mute'}})).status,200);
  assert.equal((await req('/conferences/'+conferenceId+'/messages',{user:first,method:'POST',data:{body:'Muted'}})).status,403);
  assert.equal((await req('/conferences/'+conferenceId+'/moderate/'+first,{user:owner,method:'POST',data:{action:'unmute'}})).status,200);
  assert.equal((await req('/conferences/'+conferenceId+'/messages',{user:first,method:'POST',data:{kind:'question',body:'Question before Q&A'}})).status,409);
  assert.equal((await req('/conferences/'+conferenceId,{user:owner,method:'PATCH',data:{phase:'qna',speakingMode:'listeners'}})).status,200);
  assert.equal((await req('/conferences/'+conferenceId+'/messages',{user:first,method:'POST',data:{kind:'question',body:'Can we discuss next steps?'}})).status,201);
  assert.equal((await req('/conferences/'+conferenceId+'/messages',{user:first,method:'POST',data:{body:'Listener unauthorized discussion'}})).status,403);
  const board=await req('/conferences/'+conferenceId+'/snapshot',{user:owner});
  assert.equal(board.data.conference.phase,'qna');
  assert.ok(board.data.messages.some(m=>m.message_kind==='question'));
  assert.equal(board.data.online.filter(m=>m.hand_raised).length,1);
  assert.equal((await req('/conferences/'+conferenceId+'/moderate/'+first,{user:owner,method:'POST',data:{action:'ban'}})).status,200);
  assert.equal((await req('/conferences/'+conferenceId+'/join',{user:first,method:'POST',data:{accessCode:confCreated.data.accessCode}})).status,403,'Banned user cannot reuse code');
  assert.equal((await req('/conferences/'+conferenceId+'/moderate/'+first,{user:owner,method:'POST',data:{action:'restore'}})).status,200);
  assert.equal((await req('/conferences/'+conferenceId+'/join',{user:first,method:'POST',data:{accessCode:confCreated.data.accessCode}})).data.waiting,true,'Restored member must be readmitted');
  assert.equal((await req(policies+'/'+first,{user:owner,method:'PATCH',data:{rule:'skip_waiting',enabled:true}})).status,200);
  assert.equal((await req('/conferences/'+conferenceId+'/snapshot',{user:first})).data.you.admitted,true,'Approved list admits a waiting participant');
  assert.equal((await req(policies+'/'+first,{user:owner,method:'PATCH',data:{rule:'deny_entry',enabled:true}})).status,200);
  assert.equal((await req('/conferences/'+conferenceId+'/snapshot',{user:first})).status,403,'Entry deny takes effect immediately, even for previous attendees');
  assert.equal((await req('/conferences/'+conferenceId+'/join',{user:first,method:'POST',data:{accessCode:confCreated.data.accessCode}})).status,403,'Valid code cannot bypass blocked list');
  assert.equal((await req(policies+'/'+first,{user:owner,method:'PATCH',data:{rule:'deny_entry',enabled:false}})).status,200);
  assert.equal((await req('/conferences/'+conferenceId+'/join',{user:first,method:'POST',data:{accessCode:confCreated.data.accessCode}})).data.admitted,true,'Authorized skip-waiting returns after unblocking');

  assert.equal((await req('/conferences/'+conferenceId,{user:owner,method:'PATCH',data:{roomStatus:'ended'}})).status,200);
  assert.equal((await req('/conferences/'+conferenceId+'/join',{user:first,method:'POST',data:{accessCode:confCreated.data.accessCode}})).status,409);
  assert.equal((await req('/conferences/'+conferenceId,{user:owner,method:'PATCH',data:{roomStatus:'open'}})).status,409,'Ended conference is an archive');
  assert.equal((await req('/conferences/'+conferenceId+'/snapshot',{user:'stranger'})).status,404,'Other organization has no conference access');
  // Real virtual fundraiser event, independent of phone carrier: check in,
  // receive agenda, pause operators for 1:30pm lunch, resume and report calls.
  const eventCreated=await req('/rooms/campaigns/'+c1,{user:owner,method:'POST',data:{title:'Virtual Fundraising Rally'}});
  assert.equal(eventCreated.status,201);
  const eventId=eventCreated.data.id;
  assert.equal((await req('/rooms/'+eventId+'/status',{user:owner,method:'PATCH',data:{status:'open'}})).status,200);
  assert.equal((await req('/rooms/'+eventId+'/join',{user:owner,method:'POST'})).status,201);
  assert.equal((await req('/rooms/'+eventId+'/join',{user:first,method:'POST'})).status,201);
  assert.equal((await req('/floor-program/'+eventId+'/check-in',{user:'stranger',method:'POST'})).status,404,'Unrelated member cannot check in');
  assert.equal((await req('/floor-program/'+eventId+'/check-in',{user:first,method:'POST'})).status,201);
  assert.equal((await req('/floor-program/'+eventId+'/check-in',{user:first,method:'POST'})).data.already,true,'Repeated check-in not counted twice');
  assert.equal((await req('/floor-program/'+eventId+'/check-in',{user:owner,method:'POST'})).status,201);

  const videoFloor='/video/floor/'+eventId;
  assert.equal((await req(videoFloor+'/status',{user:first})).data.enabled,false,'Fundraiser floor video is opt-in and OFF');
  assert.equal((await req(videoFloor+'/config',{user:owner,method:'PATCH',data:{enabled:true,accessMode:'checked_in',sourceUrl:'https://media.example.org/live-campaign.m3u8'}})).status,200);
  assert.equal((await req(videoFloor+'/watch',{user:first})).data.url,'https://media.example.org/live-campaign.m3u8','Checked-in operator can choose to watch video');
  assert.equal((await req(videoFloor+'/watch',{user:second})).status,403,'Un-checked-in operator is not a viewer');
  assert.equal((await req(videoFloor+'/config',{user:owner,method:'PATCH',data:{enabled:true,accessMode:'approved_only'}})).status,200);
  assert.equal((await req(videoFloor+'/watch',{user:first})).status,403,'Approved-only mode never auto-grants everyone');
  assert.equal((await req(videoFloor+'/allow/'+first,{user:owner,method:'PATCH',data:{allowed:true}})).status,200);
  assert.equal((await req(videoFloor+'/watch',{user:first})).status,200,'Manager-approved operator can watch');
  assert.equal((await req(videoFloor+'/config',{user:owner,method:'PATCH',data:{enabled:false,accessMode:'approved_only'}})).status,200);
  assert.equal((await req(videoFloor+'/watch',{user:first})).status,403,'Fundraiser video OFF takes effect immediately');

  const eventBoard=await req('/floor/'+eventId+'/board',{user:owner});
  assert.equal(eventBoard.status,200);assert.equal(eventBoard.data.mode,'web_live_reporting_with_manual_calls');
  const agenda=await req('/floor-program/'+eventId+'/schedule',{user:first});
  assert.equal(agenda.status,200);assert.equal(agenda.data.attendance.checked_in,2);
  const scheduleBody={
   title:'Lunch and Chizuk',segmentType:'lunch',speaker:'Guest speaker',
   scheduledStart:'2026-10-16T13:30:00-04:00',scheduledEnd:'2026-10-16T14:00:00-04:00',
   description:'Pause all fundraising calls for half an hour'
  };
  assert.equal((await req('/floor-program/'+eventId+'/schedule',{user:first,method:'POST',data:scheduleBody})).status,403,'Askan cannot schedule a speaker');
  const programCreated=await req('/floor-program/'+eventId+'/schedule',{user:owner,method:'POST',data:scheduleBody});
  assert.equal(programCreated.status,201);
  const programId=programCreated.data.id;
  const shared=(await pool.query("INSERT INTO cc_contacts(organization_id,campaign_id,created_by,display_name,phone,privacy,assigned_team) VALUES($1,$2,$3,'Fundraiser donor','3155550707','campaign','Group A') RETURNING id",
    [org1,c1,owner])).rows[0].id;
  assert.equal((await req('/team/contacts/'+shared+'/claim',{user:first,method:'POST'})).status,200);
  const attempt='00000000-0000-4000-8000-000000000707';
  const callBody={outcome:'spoke',note:'manual report from own phone',attemptId:attempt};
  assert.equal((await req('/floor/'+eventId+'/calls/'+shared,{user:second,method:'POST',data:callBody})).status,403,'Non-checked-in member cannot log any floor call');
  const help=await req('/floor/'+eventId+'/help',{user:first,method:'POST',data:{category:'technical',summary:'I need setup help'}});
  assert.equal(help.status,201);
  const ticketPath='/floor/'+eventId+'/help/'+help.data.id+'/messages';
  assert.equal((await req(ticketPath,{user:'stranger'})).status,404,'Help messages are hidden from outside org');
  assert.equal((await req(ticketPath,{user:second})).status,404,'Other volunteer cannot read private manager support');
  assert.equal((await req(ticketPath,{user:first,method:'POST',data:{body:'Can somebody guide my browser?'}})).status,201);
  assert.equal((await req(ticketPath,{user:owner,method:'POST',data:{body:'Try the call desk, then press Claim.'}})).status,201);
  assert.equal((await req(ticketPath,{user:first})).data.messages.length,2,'Volunteer sees own back-and-forth with manager');
  assert.equal((await req('/floor/'+eventId+'/help/'+help.data.id,{user:first,method:'PATCH',data:{status:'resolved'}})).status,403);
  assert.equal((await req('/floor/'+eventId+'/help/'+help.data.id,{user:owner,method:'PATCH',data:{status:'resolved'}})).status,200);
  assert.equal((await req(ticketPath,{user:first,method:'POST',data:{body:'after resolved'}})).status,409,'Resolved help requests do not silently accept new messages');
  const start=await req('/floor-program/'+eventId+'/programs/'+programId+'/status',{user:owner,method:'POST',data:{status:'live'}});
  assert.equal(start.status,200);
  const during=await req('/floor-program/'+eventId+'/schedule',{user:first});
  assert.equal(during.data.mode,'program','Lunch pauses fundraising call floor');
  assert.equal(during.data.programs.find(x=>x.id===programId).status,'live');
  assert.equal((await req('/floor/'+eventId+'/calls/'+shared,{user:first,method:'POST',data:callBody})).status,409,'Direct API cannot log a fundraiser-floor call during lunch');
  assert.equal((await req('/floor-program/'+eventId+'/programs/'+programId+'/status',{user:first,method:'POST',data:{status:'completed'}})).status,403,'Askan cannot end speaker program');
  assert.equal((await req('/floor-program/'+eventId+'/programs/'+programId+'/status',{user:owner,method:'POST',data:{status:'completed'}})).status,200);
  assert.equal((await req('/floor-program/'+eventId+'/schedule',{user:first})).data.mode,'calling');
  const called=await req('/floor/'+eventId+'/calls/'+shared,{user:first,method:'POST',data:callBody});
  assert.equal(called.status,201,'Fundraiser resumed after lunch and operator saved manual call');
  assert.equal((await req('/floor/'+eventId+'/calls/'+shared,{user:first,method:'POST',data:callBody})).data.duplicate,true,'Call retry cannot inflate totals');
  assert.equal((await pool.query('SELECT count(*)::int n FROM cc_call_events WHERE client_attempt_id=$1',[attempt])).rows[0].n,1);
  assert.equal((await req('/floor-program/'+eventId+'/check-out',{user:first,method:'POST'})).status,200);
  assert.equal((await req('/floor-program/'+eventId+'/check-in',{user:first,method:'POST'})).status,201,'Late return is new check-in');
  const attendanceAfter=await req('/floor-program/'+eventId+'/schedule',{user:owner});
  assert.equal(attendanceAfter.data.attendance.checked_in,2);
  assert.equal(attendanceAfter.data.attendance.total,3,'Attendance keeps earlier visit history');

  // Optional clock-driven scheduled lunch: managers may choose automation
  // without cron or a telephone provider. The server must enforce a pause
  // even for a direct manual-call API request at the boundary.
  const nowMs=Date.now();
  const autoPayload={title:'Auto lunch',segmentType:'lunch',autoStart:true,
    scheduledStart:new Date(nowMs-60000).toISOString(),
    scheduledEnd:new Date(nowMs+150000).toISOString()};
  const autoCreated=await req('/floor-program/'+eventId+'/schedule',{user:owner,method:'POST',data:autoPayload});
  assert.equal(autoCreated.status,201);
  assert.equal(autoCreated.data.auto_start,true);
  const conflict=await req('/floor-program/'+eventId+'/schedule',{user:owner,method:'POST',data:{...autoPayload,title:'Overlapping automatic segment'}});
  assert.equal(conflict.status,409,'Two overlapping clock-driven programs must not silently conflict');
  const concurrent=await Promise.all([
   req('/floor-program/'+eventId+'/schedule',{user:first}),
   req('/floor-program/'+eventId+'/schedule',{user:owner})
  ]);
  assert.equal(concurrent[0].data.mode,'break','Clock starts the lunch break without manager button');
  assert.equal(concurrent[1].data.mode,'break','Simultaneous polling produces same authoritative mode');
  assert.equal(concurrent[0].data.programs.find(x=>x.id===autoCreated.data.id).status,'live');
  const autoEvents=await pool.query("SELECT COUNT(*)::int n FROM cc_activity_events WHERE target_id=$1 AND event_type='floor.program_auto_started'",[autoCreated.data.id]);
  assert.equal(autoEvents.rows[0].n,1,'Idempotent clock start despite concurrent members');
  const newDonor=(await pool.query("INSERT INTO cc_contacts(organization_id,campaign_id,created_by,display_name,phone,privacy,assigned_team) VALUES($1,$2,$3,'Auto pause donor','3155550909','campaign','Group A') RETURNING id",
    [org1,c1,owner])).rows[0].id;
  assert.equal((await req('/team/contacts/'+newDonor+'/claim',{user:first,method:'POST'})).status,200);
  assert.equal((await req('/floor/'+eventId+'/calls/'+newDonor,{user:first,method:'POST',data:{
    outcome:'spoke',attemptId:'00000000-0000-4000-8000-000000000908'
  }})).status,409,'Direct call endpoint respects automatic lunch');
  await pool.query("UPDATE cc_floor_programs SET scheduled_end=now()-interval '1 second' WHERE id=$1",[autoCreated.data.id]);
  const afterAuto=await req('/floor-program/'+eventId+'/schedule',{user:first});
  assert.equal(afterAuto.data.mode,'calling','Clock-driven end resumes the calling floor');
  assert.equal(afterAuto.data.programs.find(x=>x.id===autoCreated.data.id).status,'completed');
  const nextProgram=await req('/floor-program/'+eventId+'/schedule',{user:owner,method:'POST',data:{
    ...scheduleBody,title:'Final address',segmentType:'closing',
    scheduledStart:'2026-10-16T15:00:00-04:00',scheduledEnd:'2026-10-16T15:20:00-04:00'
  }});
  assert.equal(nextProgram.status,201);
  assert.equal((await req('/floor-program/'+eventId+'/programs/'+nextProgram.data.id+'/status',{user:owner,method:'POST',data:{status:'live'}})).status,200);
  assert.equal((await req('/rooms/'+eventId+'/status',{user:owner,method:'PATCH',data:{status:'ended'}})).status,200);
  const afterClose=await req('/floor-program/'+eventId+'/schedule',{user:owner});
  assert.equal(afterClose.data.mode,'ended');
  assert.equal(afterClose.data.attendance.checked_in,0,'Closing event checks everyone out');
  assert.equal(afterClose.data.programs.find(x=>x.id===nextProgram.data.id).status,'completed','Active speaker event is closed and archived');
  assert.equal((await req('/floor-program/'+eventId+'/check-in',{user:first,method:'POST'})).status,409);

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

  const visibleToMax=(await pool.query("INSERT INTO cc_live_rooms(organization_id,campaign_id,title,room_status,floor_mode) VALUES($1,$2,'Private active event','open','calling') RETURNING id",[org1,c1])).rows[0].id;
  const roomPath='/connect/service/rooms?gavhahUserId=7&campaignId='+c1;
  assert.equal((await req(roomPath)).status,403,'MAX virtual event lookup needs authenticated server secret');
  const maxRooms=await req(roomPath,{service:true});
  assert.equal(maxRooms.status,200);assert.equal(maxRooms.data.mode,'web_campaign_event_only');
  assert.ok(maxRooms.data.rooms.some(x=>x.id===visibleToMax),'Linked MAX can see its own active event');
  assert.ok(!JSON.stringify(maxRooms.data).includes('phone'),'Only event name, room and schedule are shared with MAX');
  assert.equal((await req('/connect/service/rooms?gavhahUserId=8&campaignId='+c1,{service:true})).status,403,'Unlinked MAX identity cannot inspect rooms');
  assert.equal((await req('/connect/service/rooms?gavhahUserId=7&campaignId=00000000-0000-4000-8000-000000000099',{service:true})).status,403,'Linked MAX cannot inspect another organization');

  // Personal MAX updates only its own canonical campaign task; retries are inert.
  const memberTask=(await pool.query("INSERT INTO cc_assignments(organization_id,campaign_id,assignee_subject,title,kind) VALUES($1,$2,$3,'Call assigned contacts','task') RETURNING id",[org1,c1,first])).rows[0].id;
  const otherTask=(await pool.query("INSERT INTO cc_assignments(organization_id,campaign_id,assignee_subject,title,kind) VALUES($1,$2,$3,'Private task','task') RETURNING id",[org1,c1,second])).rows[0].id;
  const assignedPath='/connect/service/assignments/'+memberTask+'/status';
  const change={gavhahUserId:7,campaignId:c1,status:'done'};
  assert.equal((await req(assignedPath,{method:'POST',data:change})).status,403,'No shared secret');
  assert.equal((await req('/connect/service/assignments/'+otherTask+'/status',{service:true,method:'POST',data:change})).status,404,'Cannot update another team member task');
  const completed=await req(assignedPath,{service:true,method:'POST',data:change});
  assert.equal(completed.status,200);assert.equal(completed.data.status,'done');assert.equal(completed.data.unchanged,false);
  const repeatedDone=await req(assignedPath,{service:true,method:'POST',data:change});
  assert.equal(repeatedDone.status,200);assert.equal(repeatedDone.data.unchanged,true);
  const statusEvents=(await pool.query("SELECT COUNT(*)::int n FROM cc_activity_events WHERE event_type='connect.assignment_status' AND target_id=$1",[memberTask])).rows[0].n;
  assert.equal(statusEvents,1,'Retries must not produce a second completion event');
  assert.equal((await req(assignedPath,{service:true,method:'POST',data:{...change,gavhahUserId:8}})).status,403,'Unknown MAX user cannot update task');
  assert.equal((await req(assignedPath,{service:true,method:'POST',data:{...change,status:'open'}})).data.status,'open','MAX reopens same task');
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

  const progress=await req('/team/campaigns/'+c1+'/member-progress',{user:owner});
  assert.equal(progress.status,200,'Campaign manager may inspect real work totals');
  assert.equal(progress.data.memberProgress.length,3);
  const firstStats=progress.data.memberProgress.find(m=>m.subject===first);
  assert.equal(firstStats.assigned_tasks,1);
  assert.equal(firstStats.completed_tasks,0,'Reopened MAX assignment is not falsely completed');
  assert.equal(Number(firstStats.manually_reported_net),15,'Member-level accounting applies manual reversal');
  assert.equal((await req('/team/campaigns/'+c1+'/member-progress',{user:first})).status,403,'Askan cannot read full team earnings');
  assert.equal((await req('/team/campaigns/'+c1+'/member-progress',{user:'stranger'})).status,404,'Unrelated organization cannot inspect totals');
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
