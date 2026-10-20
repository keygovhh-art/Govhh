import { createAuthClient } from '@neondatabase/auth';
import Papa from 'papaparse';
import './style.css';
import './plan-view.css';
import { plansView } from './plan-view.js';
import { goalsView } from './goals-view.js';
import { campaignFocusBoard } from './focus-board.js';
import { sharedFocusView } from './shared-focus-view.js';
import { quickDailyView } from './quick-daily-view.js';
import { donationLinkView } from './donation-links-view.js';
import { teamView } from './team-view.js';
import { askanPlusView } from './askan-plus-view.js';
import { plusPledgesView } from './plus-pledges-view.js';
import { proCrmView } from './pro-crm-view.js';
import { proFilesView } from './pro-files-view.js';
import { proAutomationsView } from './pro-automations-view.js';
import { proCallListView } from './pro-call-lists-view.js';
import { proSprintsView } from './pro-sprints-view.js';
import { proGuidanceView } from './pro-guidance-view.js';
import { proBlockersView } from './pro-blockers-view.js';
import { gabbaiApprovalsView } from './gabbai-approvals-view.js';
import { gabbaiHandoffsView } from './gabbai-handoffs-view.js';
import { gabbaiWorkloadView } from './gabbai-workload-view.js';
import { organizationPortfolioView } from './organization-portfolio-view.js';
import { managementView } from './management-view.js';
import { gavhahConnectView } from './gavhah-connect-view.js';
import { organizationResourcesView } from './organization-resources-view.js';
import { organizationMemoryView } from './organization-memory-view.js';
import { customFocusView } from './custom-focus-view.js';
import { customWorkflowsView } from './custom-workflows-view.js';
import { customRoleView } from './custom-role-view.js';
import { hallView } from './hall-view.js';
import { eventView } from './event-view.js';
import { conferenceView } from './conference-view.js';
import { startSmallAudio,stopSmallAudio } from './browser-audio.js';
import { watchOptionalVideo,stopOptionalVideo,playingOptionalVideo,watchedContext } from './video-view.js';

const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = x => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(x||0));
const state = {auth:null,user:null,subject:null,showCampaignForm:false,orgs:[],orgId:null,campaigns:[],campaignId:null,overview:null,tasks:[],contacts:[],finance:[],tab:'today',connectStatus:null,connectOrgSummary:null,connectError:'',connectCode:'',connectCodeDeadline:0,gavhahPublicUrl:'',planTierIndex:0,entitlements:null,entitlementError:'',capacityAudit:null,capacityError:'',goals:[],goalsPage:1,goalsMeta:null,goalsError:'',goalHistoryId:null,goalHistoryData:null,goalHistoryError:'',goalHistoryPage:1,quickDaily:null,quickDailyError:'',quickFocus:null,quickFocusError:'',sharedFocus:null,sharedFocusError:'',sharedFocusTeam:'',sharedFocusQuery:'',sharedFocusCandidates:null,donationLink:null,notice:'',busy:false,manager:null,members:[],memberProgress:[],plusDesk:null,plusReport:null,plusAlerts:null,plusCredits:[],plusCreditMeta:null,plusCreditPage:1,plusCreditError:'',plusDays:7,donationLevels:[],donationLevelsError:'',plusPledges:[],plusPledgesError:'',receiptRequests:{},organizationPortfolio:null,management:null,managementOrgId:null,managementError:'',managementFilter:'all',managementQueue:'all',managementQuery:'',managementPage:1,managementEditorId:null,managementHistoryId:null,managementHistory:null,managementHistoryError:'',organizationDecisions:[],organizationError:'',organizationResources:{pools:[]},organizationResourcesError:'',organizationMemory:[],organizationMemoryError:'',organizationMemoryHistory:false,customFocusRules:null,customFocusPreview:null,customFocusError:'',customWorkflowData:null,customWorkflowTemplates:null,customWorkflowError:'',customWorkflowEventsId:null,customWorkflowEvents:[],customRoleData:null,customRoleError:'',gabbaiApprovals:[],gabbaiSummary:null,gabbaiFilter:'pending',gabbaiQuery:'',gabbaiWorkload:null,gabbaiWorkloadError:'',gabbaiWorkloadFilter:'all',gabbaiWorkloadQuery:'',gabbaiWorkloadTeam:'',gabbaiWorkloadPage:1,gabbaiNewAssignee:'',gabbaiHandoffs:null,gabbaiHandoffsError:'',gabbaiHandoffId:null,gabbaiHandoffEvents:[],gabbaiHandoffFilter:'open',gabbaiRole:null,gabbaiError:'',gabbaiLedger:null,gabbaiPriorities:null,gabbaiDays:30,proBlockers:{blockers:[],activeByReason:{}},proBlockersError:'',proGuidance:[],proGuidanceFilter:'open',proGuidanceQuery:'',proGuidanceId:null,proGuidanceMessages:[],proGuidanceError:'',proSprints:[],proHistory:[],proRecommendations:[],proNextAction:null,proNextActionError:'',proContacts:[],proFiles:null,proFilesError:'',proAutomations:null,proAutomationsError:'',proCallList:null,proCallListError:'',proCallListMode:'due',proCallListLimit:30,proSelected:null,proContactId:null,proQuery:'',proOverdue:false,proError:'',leads:[],assignees:[],invitationCode:'',connectCode:'',linkStatus:null,confirmUnlink:false,rooms:[],hallAnnouncements:[],joinedRoomId:null,floorBoard:null,floorProgram:null,selectedHelpId:null,helpMessages:[],callKeys:{},activity:[],activityNextOffset:null,activityScope:'personal',csvPage:1,importRows:null,importPreview:null,conferences:[],conferenceId:null,conferenceSnapshot:null,conferencePolicies:[],experimentalAudioEnabled:false,conferenceCode:'',videoStatus:{floor:null,conference:null},videoGrants:{floor:[],conference:[]},yemot:null};
// Deep links coming from MAX do not grant any permission or sign users in.
// They only select a room AFTER the normal Neon Auth membership checks.
const deepLink=new URLSearchParams(window.location.search);
const deepCampaign=deepLink.get('campaign'),deepHall=deepLink.get('hall');
if(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(deepCampaign||'') &&
 /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(deepHall||'')){
 state.campaignId=deepCampaign;state.requestedRoomId=deepHall;state.tab='hall';
}
// The default Neon Better Auth client exposes .token() via jwtClient, not
// .getJWTToken(). Never send an opaque session identifier as the API bearer JWT.
async function getApiJwt(){
  if(!state.auth)return null;
  // Neon injects a JWT into session.token when available; an opaque session
  // cookie cannot be used as a bearer token.
  const session=await state.auth.getSession();
  const stored=session.data?.session?.token;
  if(typeof stored==='string' && stored.split('.').length===3)return stored;
  const result=await state.auth.token();
  if(result.error)throw new Error(result.error.message||'נישט געלונגען צו באקומען אן אריינלאגיר־באשטעטיגונג');
  const token=result.data?.token;
  return typeof token==='string' && token.split('.').length===3 ? token : null;
}
async function api(path,options={}) {
  const token = await getApiJwt();
  if(!token)throw new Error('מען דארף זיך איינשרייבן');
  const r=await fetch('/api'+path,{
    ...options,
    headers:{...options.headers,Authorization:'Bearer '+token,...(options.body?{'Content-Type':'application/json'}:{})}
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.error || 'דער פארלאנג איז נישט געלונגען');
  return data;
}
async function refresh() {
  if(!state.user)return;
  // Linking has a separate authentication scope. A bad bridge must not stop Campaign Center.
  try{state.connectStatus=await api('/connect/status');state.connectError='';}
  catch(error){state.connectStatus=null;state.connectError='דער פארבינדונגס־מצב איז נישט באקאנט: '+error.message;}
  if(state.connectStatus?.linked){state.connectCode='';state.connectCodeDeadline=0;}
  const me=await api('/me');
  state.subject=me.subject;
  state.orgs=me.organizations;
  if(!state.orgs.some(x=>x.id===state.orgId))state.orgId=state.orgs[0]?.id||null;
  state.campaigns=state.orgId?await api('/organizations/'+state.orgId+'/campaigns'):[];
  if(state.orgId){try{
    const result=await api('/organizations/'+state.orgId+'/entitlements');
    state.entitlements=result;state.entitlementError='';
  }catch(error){state.entitlements=null;state.entitlementError=error.message;}}
  else{state.entitlements=null;state.entitlementError='';}
  // Real plan capacities are scoped to the current authenticated organization.
  // Keep the panel hidden on switching organizations, failure or logout.
  state.capacityAudit=null;state.capacityError='';
  if(state.orgId&&['owner','manager'].includes(state.orgs.find(o=>o.id===state.orgId)?.role)){
    try{state.capacityAudit=await api('/capacity/organizations/'+state.orgId+'/capacity');}
    catch(error){state.capacityError=error.message;}
  }
  if(state.managementOrgId!==state.orgId){
    state.managementOrgId=state.orgId;state.management=null;
    state.managementEditorId=null;state.managementHistoryId=null;
    state.managementHistory=null;state.managementHistoryError='';
    state.managementFilter='all';state.managementQueue='all';state.managementQuery='';state.managementPage=1;
  }
  const orgRole=state.orgs.find(o=>o.id===state.orgId)?.role;
  state.connectOrgSummary=null;
  if(state.tab==='connect'&&state.orgId&&['owner','manager'].includes(orgRole)){
   try{state.connectOrgSummary=await api('/connect/organizations/'+state.orgId+'/overview');}
   catch{state.connectOrgSummary=null;}
  }
  if(state.orgId&&['owner','manager'].includes(orgRole)){
    try{
      const p=new URLSearchParams({status:state.managementFilter||'all',
       queue:state.managementQueue||'all',
       query:state.managementQuery||'',page:String(state.managementPage||1)});
      state.management=await api('/management/organizations/'+state.orgId+'/management?'+p.toString());
      state.managementError='';
    }catch(error){state.management=null;state.managementError=error.message;}
    try{state.organizationPortfolio=await api('/organization/organizations/'+state.orgId+'/portfolio');
      const decisions=await api('/organization/organizations/'+state.orgId+'/decisions');state.organizationDecisions=decisions.decisions||[];state.organizationError='';}
    
    catch(error){state.organizationPortfolio=null;state.organizationDecisions=[];state.organizationError=error.message;}
    try{state.organizationResources=await api('/organization/organizations/'+state.orgId+'/resources');state.organizationResourcesError='';}
    catch(error){state.organizationResources={pools:[]};state.organizationResourcesError=error.message;}
    try{const memory=await api('/organization/organizations/'+state.orgId+'/memory?history='+state.organizationMemoryHistory);
      state.organizationMemory=memory.entries||[];state.organizationMemoryError='';}
    catch(error){state.organizationMemory=[];state.organizationMemoryError=error.message;}
  }else{state.management=null;state.managementError='';state.managementEditorId=null;state.managementHistoryId=null;state.managementHistory=null;state.managementHistoryError='';state.organizationPortfolio=null;state.organizationDecisions=[];state.organizationError='';state.organizationResources={pools:[]};state.organizationResourcesError='';state.organizationMemory=[];state.organizationMemoryError='';}
  // Centralized, read-only status; never fetch organization-specific credentials.
  state.yemot=await api('/yemot/central-status').catch(()=>({configured:false,connected:false,lineNumber:null}));
  state.conferences=[];
  if(state.orgId){
   const rooms=await api('/conferences/organizations/'+state.orgId).catch(()=>({conferences:[]}));
   state.conferences=rooms.conferences||[];
  }
  if(state.conferenceId&&!state.conferences.some(r=>r.id===state.conferenceId))state.conferenceId=null;
  state.conferencePolicies=[];state.videoStatus.conference=null;state.videoGrants.conference=[];
  if(state.conferenceId){
    state.conferenceSnapshot=await api('/conferences/'+state.conferenceId+'/snapshot').catch(()=>null);
    const v=await api('/video/conference/'+state.conferenceId+'/status').catch(()=>null);
    state.videoStatus.conference=v;
    if(state.conferenceSnapshot?.isModerator){
      const [policy,grants]=await Promise.all([
       api('/conferences/'+state.conferenceId+'/policies').catch(()=>({policies:[]})),
       api('/video/conference/'+state.conferenceId+'/grants').catch(()=>({grants:[]}))
      ]);
      state.conferencePolicies=policy.policies||[];state.videoGrants.conference=grants.grants||[];
    }
  }
  if(!state.campaigns.some(x=>x.id===state.campaignId))state.campaignId=state.campaigns[0]?.id||null;
  if(state.campaignId){
    const id=state.campaignId;
    [state.overview,state.tasks,state.contacts,state.finance]=await Promise.all([
      api('/campaigns/'+id+'/overview'),api('/campaigns/'+id+'/tasks'),
      api('/campaigns/'+id+'/contacts'),api('/campaigns/'+id+'/finance')
    ]);
    try{state.quickDaily=await api('/quick/campaigns/'+id+'/daily');state.quickDailyError='';}
    catch(error){state.quickDaily=null;state.quickDailyError=error.message;}
    try{state.quickFocus=await api('/quick/campaigns/'+id+'/focus');state.quickFocusError='';}
    catch(error){state.quickFocus=null;state.quickFocusError=error.message;}
    try{
      const teamQ=state.sharedFocusTeam?'?team='+encodeURIComponent(state.sharedFocusTeam):'';
      state.sharedFocus=await api('/quick/campaigns/'+id+'/shared-focus'+teamQ);
      state.sharedFocusError='';
      if(state.sharedFocus.editable){
        state.sharedFocusCandidates=await api('/quick/campaigns/'+id+'/shared-focus/candidates'+
         (teamQ||'?team=')+(teamQ?'&':'&')+'q='+encodeURIComponent(state.sharedFocusQuery));
      }else state.sharedFocusCandidates=null;
    }catch(error){state.sharedFocus=null;state.sharedFocusCandidates=null;state.sharedFocusError=error.message;}
    try{
      let goalResult=await api('/goals/campaigns/'+id+'?page='+state.goalsPage);
      // Archiving the last goal on the final page must not strand mobile users
      // on an empty page with an older, invalid page number.
      if(state.goalsPage>goalResult.pageCount&&goalResult.pageCount>=1){
        state.goalsPage=goalResult.pageCount;
        goalResult=await api('/goals/campaigns/'+id+'?page='+state.goalsPage);
      }
      state.goals=goalResult.goals||[];state.goalsMeta=goalResult;state.goalsError='';
    }
    catch(error){state.goals=[];state.goalsMeta=null;state.goalsError=error.message||'נישט צוטריטבאר';}
    try{state.donationLink=await api('/donation-links/'+id);}catch(error){state.donationLink={link:null,error:error.message};}
    try{state.plusDesk=await api('/plus/campaigns/'+id+'/member-desk');}catch(error){state.plusDesk=null;}
    try{const credits=await api('/plus/campaigns/'+id+'/credit-report?page='+state.plusCreditPage);state.plusCredits=credits.credits||[];state.plusCreditMeta=credits;state.plusCreditError='';}catch(error){state.plusCredits=[];state.plusCreditMeta=null;state.plusCreditError=error.message;}
    try{state.plusAlerts=await api('/plus/campaigns/'+id+'/alerts');}catch(error){state.plusAlerts=null;}
    try{const levels=await api('/plus/campaigns/'+id+'/donation-levels');state.donationLevels=levels.levels||[];state.donationLevelsError='';}
    catch(error){state.donationLevels=[];state.donationLevelsError=error.message;}
    try{const pledges=await api('/plus/campaigns/'+id+'/pledges');state.plusPledges=pledges.pledges||[];state.plusPledgesError='';}
    catch(error){state.plusPledges=[];state.plusPledgesError=error.message;}
    try{const list=await api('/pro/campaigns/'+id+'/call-list?mode='+state.proCallListMode+'&limit='+state.proCallListLimit);state.proCallList=list;state.proCallListError='';}
    catch(error){state.proCallList=null;state.proCallListError=error.message;}
    try{state.proAutomations=await api('/pro/campaigns/'+id+'/automations');state.proAutomationsError='';}
    catch(error){state.proAutomations=null;state.proAutomationsError=error.message;}
    try{const fileList=await api('/pro/campaigns/'+id+'/files');state.proFiles=fileList;state.proFilesError='';}
    catch(error){state.proFiles={files:[]};state.proFilesError=error.message;}
    try{const pro=await api('/pro/campaigns/'+id+'/contacts?q='+encodeURIComponent(state.proQuery)+'&overdue='+state.proOverdue);state.proContacts=pro.contacts||[];state.proError='';}
    catch(error){state.proContacts=[];state.proError=error.message;}
    try{const next=await api('/pro/campaigns/'+id+'/clarity');state.proRecommendations=next.recommendations||[];}catch(error){state.proRecommendations=[];}
    try{state.proNextAction=await api('/pro/campaigns/'+id+'/next-actions');state.proNextActionError='';}
    catch(error){state.proNextAction=null;state.proNextActionError=error.message;}
    try{state.customFocusRules=await api('/custom/campaigns/'+id+'/focus-rules');
      state.customFocusPreview=await api('/custom/campaigns/'+id+'/focus-preview');state.customFocusError='';}
    catch(error){state.customFocusRules=null;state.customFocusPreview=null;state.customFocusError=error.message;}
    try{state.customWorkflowData=await api('/custom/campaigns/'+id+'/workflow-runs');
      state.customWorkflowError='';}
    catch(error){state.customWorkflowData=null;state.customWorkflowError=error.message;}
    try{state.customWorkflowTemplates=await api('/custom/campaigns/'+id+'/workflow-templates');}
    catch(error){state.customWorkflowTemplates=null;}
    try{const sprintData=await api('/pro/campaigns/'+id+'/sprints');state.proSprints=sprintData.sprints||[];}catch(error){state.proSprints=[];}
    try{const memory=await api('/pro/campaigns/'+id+'/focus-history');state.proHistory=memory.events||[];}catch(error){state.proHistory=[];}
    try{const help=await api('/pro/campaigns/'+id+'/guidance');state.proGuidance=help.requests||[];state.proGuidanceError='';}catch(error){state.proGuidance=[];state.proGuidanceError=error.message;}
    try{const gabbai=await api('/gabbai/campaigns/'+id+'/approvals');state.gabbaiApprovals=gabbai.requests||[];state.gabbaiSummary=gabbai.summary||null;state.gabbaiRole=gabbai.role;state.gabbaiError='';
      state.gabbaiLedger=await api('/gabbai/campaigns/'+id+'/ledger-review?days='+state.gabbaiDays);
      if(['owner','manager'].includes(gabbai.role))state.gabbaiPriorities=await api('/gabbai/campaigns/'+id+'/priority-oversight');
      else state.gabbaiPriorities=null;
    }catch(error){state.gabbaiApprovals=[];state.gabbaiSummary=null;state.gabbaiRole=null;state.gabbaiLedger=null;state.gabbaiPriorities=null;state.gabbaiError=error.message;}
    try{if(['owner','manager'].includes(state.overview?.campaign?.role)){
       const workloadParams=new URLSearchParams({
        search:state.gabbaiWorkloadQuery||'',
        team:state.gabbaiWorkloadTeam||'',
        filter:state.gabbaiWorkloadFilter||'all',
        page:String(state.gabbaiWorkloadPage||1),limit:'50'
       });
       state.gabbaiWorkload=await api('/gabbai/campaigns/'+id+
        '/member-workload?'+workloadParams.toString());
       state.gabbaiWorkloadError='';
     }else{state.gabbaiWorkload=null;state.gabbaiWorkloadError='';}}
    catch(error){state.gabbaiWorkload=null;state.gabbaiWorkloadError=error.message;}
    try{state.gabbaiHandoffs=await api('/gabbai/campaigns/'+id+'/handoffs');state.gabbaiHandoffsError='';
      if(state.gabbaiHandoffId&&!state.gabbaiHandoffs.handoffs.some(h=>h.id===state.gabbaiHandoffId)){state.gabbaiHandoffId=null;state.gabbaiHandoffEvents=[];}
      if(state.gabbaiHandoffId){const details=await api('/gabbai/handoffs/'+state.gabbaiHandoffId+'/events');state.gabbaiHandoffEvents=details.events||[];}}
    catch(error){state.gabbaiHandoffs=null;state.gabbaiHandoffsError=error.message;state.gabbaiHandoffEvents=[];}
    try{state.proBlockers=await api('/pro/campaigns/'+id+'/blockers');state.proBlockersError='';}
    catch(error){state.proBlockers={blockers:[],activeByReason:{}};state.proBlockersError=error.message;}
    if(state.proGuidanceId&&!state.proGuidance.some(g=>g.id===state.proGuidanceId)){state.proGuidanceId=null;state.proGuidanceMessages=[];}
    if(state.proGuidanceId){try{const thread=await api('/pro/guidance/'+state.proGuidanceId+'/messages');state.proGuidanceMessages=thread.messages||[];}catch(error){state.proGuidanceMessages=[];}}
    if(state.proContactId){try{state.proSelected=await api('/pro/contacts/'+state.proContactId+'/timeline');}
    catch(error){state.proSelected=null;state.proContactId=null;}}
    if(['owner','manager','finance','auditor'].includes(state.overview?.campaign?.role)){
      try{state.plusReport=await api('/plus/campaigns/'+id+'/teams-report?days='+state.plusDays);}catch(error){state.plusReport=null;}
    }else state.plusReport=null;
  }else{state.overview=null;state.tasks=[];state.contacts=[];state.finance=[];state.goals=[];state.goalsMeta=null;state.goalsError='';state.quickDaily=null;state.quickDailyError='';state.quickFocus=null;state.quickFocusError='';state.sharedFocus=null;state.sharedFocusCandidates=null;state.sharedFocusError='';state.donationLink=null;state.plusDesk=null;state.plusReport=null;state.plusAlerts=null;state.plusCredits=[];state.plusCreditMeta=null;state.plusCreditError='';state.donationLevels=[];state.donationLevelsError='';state.plusPledges=[];state.plusPledgesError='';state.proContacts=[];state.proFiles=null;state.proFilesError='';state.proAutomations=null;state.proAutomationsError='';state.proCallList=null;state.proCallListError='';state.customFocusRules=null;state.customFocusPreview=null;state.customFocusError='';state.gabbaiApprovals=[];state.gabbaiSummary=null;state.gabbaiHandoffs=null;state.gabbaiHandoffsError='';state.gabbaiWorkload=null;state.gabbaiWorkloadError='';state.gabbaiNewAssignee='';state.gabbaiHandoffId=null;state.gabbaiHandoffEvents=[];state.gabbaiRole=null;state.gabbaiError='';state.gabbaiLedger=null;state.gabbaiPriorities=null;state.proBlockers={blockers:[],activeByReason:{}};state.proBlockersError='';state.proGuidance=[];state.proGuidanceId=null;state.proGuidanceMessages=[];state.proSprints=[];state.proHistory=[];state.proRecommendations=[];state.proNextAction=null;state.proNextActionError='';state.proSelected=null;state.proContactId=null;state.proError='';}
  state.manager=null;state.members=[];state.memberProgress=[];state.leads=[];state.assignees=[];state.rooms=[];state.hallAnnouncements=[];state.floorBoard=null;state.floorProgram=null;state.videoStatus.floor=null;state.videoGrants.floor=[];state.helpMessages=[];state.activity=[];state.activityNextOffset=null;
  if(state.campaignId){
    const activity=await api('/team/campaigns/'+state.campaignId+'/activity').catch(()=>({events:[],nextOffset:null,scope:'personal'}));
    state.activity=activity.events||[];state.activityNextOffset=activity.nextOffset;state.activityScope=activity.scope;
    const rooms=await api('/rooms/campaigns/'+state.campaignId).catch(()=>({rooms:[]}));
    state.rooms=rooms.rooms||[];
    if(state.joinedRoomId){
      const room=state.rooms.find(r=>r.id===state.joinedRoomId&&r.room_status==='open');
      if(room){
        const [msgs,board,program]=await Promise.all([
          api('/rooms/'+room.id+'/announcements').catch(()=>[]),
          api('/floor/'+room.id+'/board').catch(()=>null),
          api('/floor-program/'+room.id+'/schedule').catch(()=>null)
        ]);
        state.hallAnnouncements=msgs;state.floorBoard=board;state.floorProgram=program;
        state.videoStatus.floor=await api('/video/floor/'+room.id+'/status').catch(()=>null);
        if(state.videoStatus.floor?.isManager){
          const grants=await api('/video/floor/'+room.id+'/grants').catch(()=>({grants:[]}));
          state.videoGrants.floor=grants.grants||[];
        }
        if(state.selectedHelpId&&board?.help?.some(h=>h.id===state.selectedHelpId)){
          const thread=await api('/floor/'+room.id+'/help/'+state.selectedHelpId+'/messages').catch(()=>({messages:[]}));
          state.helpMessages=thread.messages||[];
        }else state.selectedHelpId=null;
      }
      else state.joinedRoomId=null;
    }
  }
  if(state.orgId){
    const role=state.orgs.find(x=>x.id===state.orgId)?.role;
    const calls=[
      api('/connect/status').then(v=>state.linkStatus=v),
      ...(state.campaignId?[
        api('/team/campaigns/'+state.campaignId+'/assignees').then(v=>state.assignees=v)
      ]:[]),
      ...(state.campaignId&&['owner','manager','finance','auditor'].includes(role)?[
        api('/team/campaigns/'+state.campaignId+'/manager-overview').then(v=>state.manager=v),
        api('/team/campaigns/'+state.campaignId+'/member-progress').then(v=>state.memberProgress=v.memberProgress||[])
      ]:[]),
      ...(state.campaignId&&['owner','manager','squad_leader','askan'].includes(role)?[
        api('/team/campaigns/'+state.campaignId+'/lead-queue').then(v=>state.leads=v)
      ]:[]),
      ...(['owner','manager'].includes(role)?[
        api('/team/organizations/'+state.orgId+'/members').then(v=>state.members=v)
      ]:[]),
      ...(['owner','manager'].includes(role)&&state.entitlements?.usableFeatures?.includes('custom_roles')?[
        api('/gabbai/organizations/'+state.orgId+'/role-profiles')
          .then(v=>{state.customRoleData=v;state.customRoleError='';})
          .catch(error=>{state.customRoleData=null;state.customRoleError=error.message;})
      ]:[])
    ];
    await Promise.allSettled(calls);
  }else{
    try{state.linkStatus=await api('/connect/status');}catch{}
  }
  draw();
}
function authError(error){
 const status=Number(error?.status||0);
 if(status===404||/HTTP\s*404/i.test(String(error?.message||'')))
   return 'די Login־סערוויס געפינט נישט דעם פארלאנג (HTTP 404). די סיסטעם־אדרעס דארף ווערן איבערגעקוקט. קיינער דארף נישט נאכאמאל שאפן אן אקאונט ביז דאס איז פארראכטן.';
 if(status===401||error?.code==='INVALID_EMAIL_OR_PASSWORD')return 'דער בליצפאסט אדער פעסווארט איז נישט ריכטיג.';
 return String(error?.message||'אריינלאגירן איז נישט געלונגען');
}
function authView(){
 return `<main class="auth-wrap"><div class="auth-hero"><div class="logo">✦</div><h1>גבהה קאמפיין סענטער</h1>
 <p>הייב אן אליין מיט דיין ערשטן קאמפיין. ווען דו וואקסט, קענסטו צולייגן א גאנצע מאנשאפט.</p><small>פאר יעדן — פון אנהייבער ביז א גרויסע מאנשאפט</small></div>
 <div class="auth-grid">
 <form data-form="signin" class="card"><h2>אריינגיין</h2><label>בליצפאסט <input type="email" name="email" autocomplete="email" required></label><label>פעסווארט <input type="password" name="password" autocomplete="current-password" required></label><button class="primary">אריינגיין</button></form>
 <form data-form="signup" class="card"><h2>אנהייבן אקאונט</h2><label>נאמען <input name="name" autocomplete="name" required maxlength="120"></label><label>בליצפאסט <input name="email" type="email" autocomplete="email" required></label><label>פעסווארט <input type="password" name="password" autocomplete="new-password" minlength="8" required></label><button>שאפן אקאונט</button></form></div></main>`;
}
function toolbar() {
 const org=state.orgs.find(x=>x.id===state.orgId);
 return `<header class="top"><div><div class="eyebrow">GAVHAH · Campaign Center</div><h1>קאמפיין סענטער</h1><small>שלום ${esc(state.user.name||state.user.email||'פריינט')}</small></div><div class="inline"><button class="subtle" data-action="connect-open">גבהה קאנעקט</button><button class="subtle" data-action="plan-open">די 6 פלענער</button><button class="subtle" data-action="logout">ארויסגיין</button></div></header>
 <section class="selects">
  <label>דיין ארבעטס־פלאץ <select data-action="org-select">${state.orgs.map(o=>`<option value="${esc(o.id)}" ${o.id===state.orgId?'selected':''}>${esc(o.name)}</option>`).join('')}</select></label>
  <label>קאמפיין <select data-action="campaign-select">${state.campaigns.map(c=>`<option value="${esc(c.id)}" ${c.id===state.campaignId?'selected':''}>${esc(c.title)}</option>`).join('')}</select></label>
  <div class="eyebrow">${org?'רשות: '+esc(org.role):'נאך קיין ארבעטס־פלאץ'}</div>
 </section>
 <section class="card invite-redeem">
  <details><summary>איך האב נאך אן איינלאדונגס־קאוד</summary>
   <form class="inline" data-form="redeem-invite">
    <input name="invitationCode" required dir="ltr" maxlength="32" pattern="[A-Za-z0-9_-]{32}" autocomplete="off" placeholder="איינמאליגער איינלאדונגס־קאוד">
    <button>אננעמען איינלאדונג</button>
   </form>
  </details>
  ${['owner','manager'].includes(org?.role)&&state.campaignId?'<button data-action="new-campaign">נייער קאמפיין</button>':''}
 </section>`;
}
function orgSetup() {
 return `<section class="card"><h2>דער ערשטער שריט</h2><p>מאך דיין אייגענעם ארבעטס־פלאץ — אפילו דו ביסט נאך אליין. ווען דו וועסט וואקסן, קענסטו איינלאדן א מאנשאפט. דיינע דאטן בלייבן פריוואט.</p>
 <form data-form="org" class="inline"><input name="name" required maxlength="120" placeholder="נאמען פון דיין פלאץ"><button class="primary">אנהייבן</button></form><h3>איינלאדונג פון א מנהל</h3><form class="inline" data-form="redeem-invite"><input name="invitationCode" required dir="ltr" maxlength="32" placeholder="איינלאדונגס־קאוד"><button>זיך אנשליסן</button></form></section>`;
}
function campaignSetup(){
 const role=state.orgs.find(o=>o.id===state.orgId)?.role;
 if(!['owner','manager'].includes(role))return '<section class="card"><h2>נאכנישט קיין ערלויבטער קאמפיין</h2><p>דו דארפסט אן איינלאדונג פאר דעם קאמפיין. גיב אריין דעם קאוד אויבן.</p></section>';
 return `<section class="card"><h2>קאמפיין שאפן</h2><form data-form="campaign" class="inline"><input name="title" required maxlength="160" placeholder="קאמפיין־נאמען"><input name="goalAmount" type="number" min="0" step="0.01" placeholder="ציל אין $"><button class="primary">שאפן קאמפיין</button></form></section>`;
}
function campaignNav(){
 const allowed=new Set(state.entitlements?.usableFeatures||[]);
 const nav=[['today','היינט',null],['management','מענעדזשמענט — דער גאנצער מצב',null],['goals','צילן','goals'],['people','קשרים','contacts'],
  ['crm','Askan Pro CRM','crm'],['sprint','7־טאג Focus','sprint_memory'],
  ['guidance','עצה און הילף','guidance'],['files','קאמפיין־פיילן','files'],['automations','אויטאמאטישע נאכפאלגן','automations'],['calllists','רוף־ליסטעס','advanced_call_lists'],['blockers','שוועריקייטן','blocker_intelligence'],
  ['gabbai','Gabbai Pro — באשטעטיגונגען','approvals'],
  ['organization','Organization — מוסד','portfolio'],['orgmemory','מוסדישע Memory','organization_memory'],
  ['custom','Custom Focus','custom_focus'],['workflows','Custom־פראצעדורן','custom_workflows'],['finance','נדבות','manual_records'],
  ['history','היסטאריע',null],['team','מאנשאפט','team'],
  ['hall','עסקנים־זאל','virtual_floor'],['conference','התקבצו אסיפות','hitkabtzu'],
  ['yemot','ימות — צענטראל',null],['plans','די 6 פלענער',null]];
 return '<nav class="tabs">'+nav.map(([key,label,feature])=>{
  // Shared meeting/floor pilots existed before pricing decisions and remain accessible
  // under their original authenticated team/privacy rules (NOT paid plan rights).
  const legacyPilot=feature==='virtual_floor'||feature==='hitkabtzu';
  const managementAllowed=key!=='management'||['owner','manager'].includes(state.orgs.find(o=>o.id===state.orgId)?.role);
  const enabled=managementAllowed&&(!feature||allowed.has(feature)||legacyPilot);
  return '<button type="button" data-action="tab" data-tab="'+key+'" '+
   (enabled?'':'disabled title="דעם פלאן־רעכט דארף מען באשטעטיגן" ')+
   'class="'+(state.tab===key?'current':'')+'">'+(enabled?'':'🔒 ')+label+'</button>';
 }).join('')+'</nav>';
}
function yemotPanel(){
 const setting=state.yemot||{configured:false,connected:false,lineNumber:null};
 return '<section class="card"><h2>ימות המשיח — איין צענטראלער האטליין</h2>'+
  '<p class="muted">נאר דער גבהה־סופער־עדמין קען פארבינדן דעם איינציגן ימות API־שליסל. אנדערע באנוצער קענען נישט אויפשטעלן באזונדערע שליסלען.</p>'+
  '<p>נומער: <strong>'+esc(setting.lineNumber||'נאכנישט באשטימט')+'</strong> · פארבינדונג: <strong>'+(setting.connected?'אקטיוו':'נאכנישט אקטיוו')+'</strong></p>'+
  '<p>מעניו: <strong>1 — גבהה</strong> · <strong>2 — קאמפיין סענטער</strong> (דערווייל פלאן; נישט ארויפגעלייגט אויף ימות).</p>'+
  '<p class="muted">צו פארוואלטן דעם איינציגן API שליסל: גיי צו גבהה → אדמיניסטראציע → ימות API — צענטראל.</p>'+
  '</section>';
}
function campaignAdminPanel(){
 const campaign=state.overview?.campaign;
 if(!campaign||!['owner','manager'].includes(campaign.role))return '';
 const statuses=[['draft','אין צוגרייטונג'],['active','אקטיוו'],['paused','אויפגעהאלטן'],['closed','פארענדיגט']];
 return `<section class="card"><h2>קאמפיין־פארוואלטונג</h2><p class="muted">טוישן דעם ציל אדער מצב וועט ווערן אפגעהיטן אינעם אודיט. פארענדיקן מעקט נישט אויס קיין היסטאריע.</p>
 <form data-form="campaign-settings" class="inline"><label>ציל אין דאלארן<input name="goalAmount" type="number" min="0" max="1000000000000" step="0.01" value="${esc(campaign.goal_amount)}" required></label>
 <label>קאמפיין־מצב<select name="status">${statuses.map(([v,n])=>`<option value="${v}" ${campaign.status===v?'selected':''}>${n}</option>`).join('')}</select></label>
 <button type="submit">אפהיטן קאמפיין־טויש</button></form></section>`;
}
function today(){
 const f=Object.fromEntries((state.overview?.finance||[]).map(x=>[x.event_kind,Number(x.amount)]));
 return `${campaignFocusBoard(state,esc)}${sharedFocusView(state,esc)}${quickDailyView(state,esc)}<div class="metrics"><div><span>ציל</span><strong>${money(state.overview?.campaign?.goal_amount)}</strong></div><div><span>צוגעזאגט</span><strong>${money(f.pledge)}</strong></div><div><span>באריכטעט באקומען (נעטא)</span><strong>${money(Math.max(0,(f.receipt||0)-(f.refund||0)))}</strong></div></div>
 ${campaignAdminPanel()}
 ${donationLinkView(state,esc)}
 <section class="card"><h2>נייע אויפגאבע</h2><form data-form="task" class="inline"><input name="title" required placeholder="וואס דארף געטון ווערן?"><select name="priority"><option value="normal">נארמאל</option><option value="high">וויכטיג</option><option value="critical">קריטיש</option></select><select name="kind"><option value="task">אויפגאבע</option><option value="followup">נאכפאלג</option><option value="call_lead">רופן</option></select><label>טערמין (אויסוואל)<input name="dueAt" type="datetime-local"></label><select name="assigneeSubject"><option value="">פאר מיר</option>${state.assignees.map(m=>`<option value="${esc(m.subject)}">${esc(m.subject)} — ${esc(m.team_name||"אנדערע")}</option>`).join("")}</select><button>צולייגן</button></form></section>
 <section class="card"><h2>אויפגאבן <span class="count">${state.tasks.length}</span></h2>${state.tasks.length?state.tasks.map(t=>`<article class="item"><div><strong>${esc(t.title)}</strong><small>${esc(t.kind)} · ${esc(t.priority)} · ${esc(t.status)} · ${esc(t.assignee_subject===state.subject?'מיין אויפגאבע':'צוגעטיילט: '+t.assignee_subject)}</small></div><div class="actions">${t.status!=='done'?`<button data-action="done" data-id="${esc(t.id)}">פארענדיגט</button>`:''}</div>${['owner','manager','squad_leader'].includes(state.overview?.campaign?.role)&&!['done','cancelled'].includes(t.status)?`<form data-form="plus-handoff" data-task-id="${esc(t.id)}" class="inline"><label>איבערגעבן פאר<select name="assigneeSubject" required>${state.assignees.map(a=>`<option value="${esc(a.subject)}" ${a.subject===t.assignee_subject?'selected':''}>${esc(a.subject)} — ${esc(a.team_name||'נישט צוגעטיילט')}</option>`).join('')}</select></label><label>טערמין<input type="datetime-local" name="dueAt"></label><button type="submit">איבערגעבן מיט Audit</button></form>`:''}</article>`).join(''):'<p class="muted">נאך קיין אויפגאבן.</p>'}</section>`;
}
function people(){
 const role=state.overview?.campaign?.role;
 const manager=['owner','manager'].includes(role);
 const preview=state.importPreview;
 const importer=manager?'<section class="card"><h2>קשרים אימפארטירן פון CSV</h2>'+
  '<p class="muted">בלויז פאר דער קאמפיין־הנהלה. קודם פרובירט מען אָן אפהיטן; מען קען נישט איבערשרייבן אלטע קשרים אדער נישט־רופן־צייכענונגען. איין פייל קען האבן ביז 500 שורות.</p>'+
  '<form data-form="import-preview" class="stack"><label>CSV־פייל (name,phone,notes)<input type="file" accept=".csv,text/csv" name="csvFile" required></label><button>פאראויסבליק אן שרייבן</button></form>'+
  (preview?'<p><strong>גאנצע שורות: '+esc(preview.received)+' | נייע: '+esc(preview.importable)+' | שוין פאראן אדער דאבל: '+esc(preview.duplicates)+'</strong></p>'+
    (preview.preview||[]).map(r=>'<p class="muted">'+esc(r.name)+' · '+esc(r.phone)+'</p>').join('')+
    '<button data-action="import-confirm" class="primary">באשטעטיגן און אריינלייגן בלויז די נייע קשרים</button>':'')+
 '</section>':'';
 return `${importer}<section class="card"><h2>נייער קשר</h2><form class="stack" data-form="contact"><input name="name" required placeholder="נאמען"><input name="phone" type="tel" placeholder="טעלעפאן"><input name="notes" maxlength="2000" placeholder="נאטיץ"><label>פריוואטקייט <select name="privacy"><option value="campaign">קאמפיין־מיטגלידער</option><option value="private">נאר איך</option></select></label><button>אפהיטן קשר</button></form></section>
 <section class="card"><h2>קשרים <span class="count">${state.contacts.length}</span></h2>
 ${state.contacts.length?state.contacts.map(c=>`<article class="item"><div><strong>${esc(c.display_name)}</strong><small>${esc(c.phone)} · ${esc(c.privacy)} ${c.do_not_call?'· נישט רופן':''}</small></div><button data-action="calls" data-id="${esc(c.id)}">רוף־היסטאריע</button></article>`).join(''):'<p class="muted">נאכנישטא קיין קשרים.</p>'}</section>
 <section class="card"><h2>רוף־רעזולטאט איינשרייבן</h2><p class="muted">דאס רעקארדירט בלויז אן איינגעגעבן רעזולטאט; דער סיסטעם רופט נאכנישט אליין.</p>
 <form class="stack" data-form="call"><select name="contactId" required><option value="">קלייב א קשר</option>${state.contacts.filter(c=>!c.do_not_call).map(c=>`<option value="${esc(c.id)}">${esc(c.display_name)}</option>`).join('')}</select><select name="outcome"><option value="no_answer">נישט געענטפערט</option><option value="spoke">גערעדט</option><option value="callback">צוריקרופן</option><option value="pledged">צוגעזאגט</option><option value="not_interested">נישט אינטערעסירט</option><option value="do_not_call">נישט מער רופן</option></select><input name="note" placeholder="נאטיץ (אויסוואל)"><button>אפהיטן אין היסטאריע</button></form></section>`;
}
function finance(){
 const role=state.overview?.campaign?.role;
 const manager=['owner','manager'].includes(role);
 const suggested='<section class="card"><h2>עסקן פלאס — פארגעשלאגענע נדבה־סכומים</h2><p class="muted">קלייב א סכום פאר א מאנועלן באריכט. דאס איז נישט א באצאל־קנעפל, און מאכט קיין נדבה נישט אויטאמאטיש באצאלט.</p><div class="inline">'+state.donationLevels.map(x=>'<button type="button" data-action="plus-preset" data-amount="'+esc(x.amount)+'">'+esc(x.label)+' — '+money(x.amount)+'</button>').join('')+'</div>'+(state.donationLevelsError?'<p role="alert">די נייער סעטינג־טאבעלע איז נאך נישט גרייט: '+esc(state.donationLevelsError)+'</p>':'')+(manager?'<form data-form="plus-donation-levels" class="stack"><label>סכומים און נעמען, איינס פער שורה (סכום | נאמען)<textarea name="levels" rows="5" placeholder="50 | קליינע נדבה\n150 | שטיצע\n1000 | גרויסע נדבה">'+esc(state.donationLevels.map(x=>x.amount+' | '+x.label).join('\n'))+'</textarea></label><p class="muted">ביז אכט סכומים. א ליידיגע ליסטע נעמט אראפ אלע פארשלאגן, נישט קיין אמתע געלט־רעקארדס.</p><button>אפהיטן נדבה־סכומים</button></form>':'')+'</section>';
 return `${suggested}<div class="card"><h2>פלעדזשעס און באצאלונגען</h2><p class="muted">א פלעדזש איז נישט באקומען געלט. בלויז א באשטעטיגטע האנטליכע קבלה ווערט גערעכנט אלס באצאלט. דאס איז נישט קיין צאלונג־פראוויידער.</p>
 <form data-form="finance" class="stack"><select name="kind"><option value="pledge">צוגעזאגט</option>${['owner','finance'].includes(role)?'<option value="receipt">מאנועל באקומען — לויטן געלט־פארוואלטער</option>':''}</select><input name="amount" required type="number" min=".01" step=".01" placeholder="$ סכום"><input name="verificationReference" placeholder="באשטעטיגונג־רעפערענץ (פאר באקומען געלט)"><button class="primary">אפהיטן</button></form></div>
 <section class="card"><h2>געלט־היסטאריע</h2>${state.finance.length?state.finance.map(x=>`<article class="item"><div><strong>${money(x.amount)}</strong><small>${esc(x.event_kind)} · ${x.source_system==='askan-plus-manual'?'מאנועל באריכטעט — נישט באנק־באשטעטיגט':x.verified_at?'אינערליך באשטעטיגט — נישט באנק־באשטעטיגט':'נישט אויסערליך באשטעטיגט'} · ${esc(x.created_at?.slice(0,10)||'')}</small></div></article>`).join(''):'<p class="muted">נאכנישטא קיין פינאנציעלע רעקארדס.</p>'}</section>`;
}
function history(){
 const visible=state.activity||[];
 const names={
 'campaign.created':'קאמפיין געשאפן','campaign.settings_changed':'קאמפיין־טויש',
 'task.created':'אויפגאבע געשאפן','task.status':'אויפגאבע־מצב',
 'invite.created':'עסקן־איינלאדונג','invite.redeemed':'עסקן אנגעשלאסן',
 'member.updated':'מיטגליד־רשות','team.member_assigned':'גרופע צוטיילונג',
 'contact.assigned_team':'קשר־גרופע','contact.created':'נייער קשר',
 'call.logged':'רוף־באריכט','lead.claimed':'קשר געכאפט','lead.released':'קשר צוריקגעגעבן',
 'finance.pledge':'צוגעזאגט','finance.receipt':'באקומען מאנועל',
 'connect.finance_reported':'MAX געלט־באריכט','connect.manual_reversal':'MAX קארעקטור',
 'connect.assignment_status':'MAX אויפגאבע','connect.followup_linked':'MAX נאכפאלג',
 'room.created':'וועב־זאל געשאפן','room.joined':'וועב־זאל אריינגיין',
 'room.left':'וועב־זאל פארלאזן','room.announcement':'מנהל־אנווייזונג',
 'room.status_changed':'וועב־זאל מצב'
 };
 return `<section class="card"><h2>שטענדיגע קאמפיין־היסטאריע</h2>
 <p class="muted">די ריכטיגע אפגעהיטענע סערווער־געשעענישן. ${state.activityScope==='personal'?'דו זעסט נאר דיין אייגענע געשיכטע.':'דו זעסט די ערלויבטע קאמפיין־געשיכטע.'} פינאנציעלע געשעענישן ווערן נישט אויטאמאטיש אויסגעמעקט.</p>
 <div class="inline"><button data-action="refresh-history">דערפרישן געשיכטע</button><button data-action="export-contacts">ארויסנעמען קשרים אלס CSV (ביז 1,000 פער בלאט)</button></div>
 ${visible.length?visible.map(x=>`<article class="item"><div><strong>${esc(names[x.event_type]||x.event_type)}</strong>
 <small>${esc(x.actor_subject)} · ${esc((x.created_at||'').replace('T',' ').slice(0,16))}</small></div></article>`).join(''):'<p class="muted">נאכנישטא קיין געשיכטע אינעם אויסגעקליבענעם קאמפיין.</p>'}
 ${state.activityNextOffset!==null?'<button data-action="more-history">ווייז נאך געשיכטע</button>':''}
 </section>`;
}
async function exportContactsPage(){
 if(!state.campaignId)throw new Error('קלייב א קאמפיין');
 const page=state.csvPage;
 const jwt=await getApiJwt();
 const url='/api/team/campaigns/'+state.campaignId+'/contacts.csv?page='+page;
 const response=await fetch(url,{headers:{Authorization:'Bearer '+jwt},cache:'no-store'});
 if(!response.ok)throw new Error('מען קען יעצט נישט ארויסנעמען די קשרים: '+response.status);
 const blob=await response.blob();
 const address=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=address;a.download='קאמפיין-קשרים-בלאט-'+page+'.csv';
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(address),5000);
 const more=response.headers.get('X-Export-Has-More')==='true';
 state.csvPage=more?page+1:1;
 say(more?'די ערשטע 1,000 קשרים זענען ארויסגענומען. דרוק נאכאמאל פארן קומענדיגן בלאט.':'די דערלויבטע קשרים פון דעם בלאט זענען ארויסגענומען.');
}

function draw(){
 $('#app').innerHTML= `${state.user?'<div class="shell">'+toolbar()+(state.tab==='plans'?plansView(state):state.tab==='connect'?gavhahConnectView(state,esc):state.orgs.length?(!state.campaignId?'<div class="inline"><button data-action="conference-home">התקבצו — אסיפות</button>'+
 (['owner','manager'].includes(state.orgs.find(o=>o.id===state.orgId)?.role)?
 '<button data-action="management-home">מענעדזשמענט — אלע פלענער</button>':'')+
 '</div>'+ (state.tab==='management'?managementView(state,esc):state.tab==='conference'?conferenceView(state,esc):campaignSetup()):campaignNav()+(state.showCampaignForm?campaignSetup():'')+(state.tab==='today'?today():state.tab==='management'?managementView(state,esc):state.tab==='goals'?goalsView(state,esc):state.tab==='people'?people():state.tab==='crm'?proCrmView(state,esc):state.tab==='files'?proFilesView(state,esc):state.tab==='automations'?proAutomationsView(state,esc):state.tab==='calllists'?proCallListView(state,esc):state.tab==='sprint'?proSprintsView(state,esc):state.tab==='guidance'?proGuidanceView(state,esc):state.tab==='blockers'?proBlockersView(state,esc):state.tab==='gabbai'?gabbaiWorkloadView(state,esc)+gabbaiHandoffsView(state,esc)+gabbaiApprovalsView(state,esc,money):state.tab==='organization'?organizationPortfolioView(state,esc,money)+organizationResourcesView(state,esc):state.tab==='orgmemory'?organizationMemoryView(state,esc):state.tab==='custom'?customFocusView(state,esc):state.tab==='workflows'?customWorkflowsView(state,esc):state.tab==='finance'?finance()+(state.entitlements?.usableFeatures?.includes('partial_pledges')?plusPledgesView(state,esc,money):''):state.tab==='team'?teamView(state,esc,money)+(state.entitlements?.usableFeatures?.includes('custom_roles')?customRoleView(state,esc):'')+(state.entitlements?.usableFeatures?.includes('teams_captains')?askanPlusView(state,esc,money):''):state.tab==='hall'?hallView(state,esc)+eventView(state,esc,money):state.tab==='conference'?conferenceView(state,esc):state.tab==='yemot'?yemotPanel():history())):orgSetup())+'</div>':authView()}
 ${state.notice?`<div class="toast" role="status">${esc(state.notice)}</div>`:''}`;
}
function say(message){state.notice=message;draw();}
async function submit(event){
 const form=event.target.closest('form[data-form]');if(!form)return;
 event.preventDefault();if(state.busy)return;
 state.busy=true;
 const d=Object.fromEntries(new FormData(form).entries());
 try {
  switch(form.dataset.form){
   case 'custom-role-create': {
     if(!state.orgId)throw new Error('קלייב אן ארגאניזאציע');
     const data={title:d.title,canViewLeadQueue:d.canViewLeadQueue==='on',
      canClaimLeads:d.canClaimLeads==='on',
      canExportSharedContacts:d.canExportSharedContacts==='on'};
     if((data.canClaimLeads||data.canExportSharedContacts)&&!data.canViewLeadQueue)
      throw new Error('צו נעמען אדער עקספארטירן דארף מען אויך קענען זען');
     await api('/gabbai/organizations/'+state.orgId+'/role-profiles',{
      method:'POST',body:JSON.stringify(data)});
     break;
   }
   case 'custom-role-assign': {
     const person=state.members?.find(m=>m.subject===d.subject);
     if(!person||!['askan','squad_leader'].includes(person.role))
      throw new Error('דאס קען נאר ווערן צוגעטיילט פאר א געווענליכן עסקן');
     if(d.profileId&&!state.customRoleData?.profiles?.some(p=>p.id===d.profileId))
      throw new Error('די רשות איז נישט געפונען');
     if(!confirm('באשטעטיגן דעם צוטריט־טויש פאר דעם עסקן?'))break;
     await api('/gabbai/organizations/'+state.orgId+'/permission-profile',{
       method:'POST',body:JSON.stringify({subject:d.subject,profileId:d.profileId||null})});
     break;
   }
   case 'custom-workflow-template': {
     const steps=String(d.steps||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
     if(steps.length<1||steps.length>12)throw new Error('שרייב 1 ביז 12 שריט');
     await api('/custom/campaigns/'+state.campaignId+'/workflow-templates',{
       method:'POST',body:JSON.stringify({title:d.title,steps})});
     break;
   }
   case 'custom-workflow-run': {
     await api('/custom/campaigns/'+state.campaignId+'/workflow-runs',{
       method:'POST',body:JSON.stringify({
        title:d.title,templateId:d.templateId,assignedTo:d.assignedTo})});
     break;
   }
   case 'custom-workflow-block': {
     const run=state.customWorkflowData?.runs?.find(x=>x.id===form.dataset.id);
     if(!run)throw new Error('די פראצעדור איז נישט געפונען');
     await api('/custom/campaigns/'+state.campaignId+'/workflow-runs/'+run.id+'/action',{
       method:'POST',body:JSON.stringify({action:'block',version:run.version,note:d.note})});
     break;
   }
   case 'custom-focus-rules': {
     const payload={overdueWeight:Number(d.overdueWeight),dueSoonWeight:Number(d.dueSoonWeight),
       highPriorityWeight:Number(d.highPriorityWeight),followupWeight:Number(d.followupWeight)};
     await api('/custom/campaigns/'+state.campaignId+'/focus-rules',{method:'PUT',body:JSON.stringify(payload)});break;
   }
   case 'organization-memory-new': {
     const raw=d.reviewDueAt?new Date(d.reviewDueAt):null;
     if(raw&&!Number.isFinite(raw.getTime()))throw new Error('די איבערקוק־צייט איז נישט ריכטיג');
     await api('/organization/organizations/'+state.orgId+'/memory',{
       method:'POST',body:JSON.stringify({category:d.category,title:d.title,summary:d.summary,
        sourceCampaignId:d.sourceCampaignId||null,reviewDueAt:raw?raw.toISOString():null})});break;
   }
   case 'organization-memory-revise': {
     await api('/organization/organizations/'+state.orgId+'/memory',{
       method:'POST',body:JSON.stringify({category:d.category,title:d.title,summary:d.summary,
        sourceCampaignId:d.sourceCampaignId||null,reviewDueAt:d.reviewDueAt||null,
        supersedesId:form.dataset.memoryId})});break;
   }
   case 'organization-resource-pool-new': {
     if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(d.period||'')))throw new Error('קלייב אויס א חודש');
     await api('/organization/organizations/'+state.orgId+'/resources',{
       method:'POST',body:JSON.stringify({periodStart:d.period+'-01',currency:d.currency,
        budgetTotal:d.budgetTotal,volunteerHoursTotal:Number(d.volunteerHoursTotal)})});break;
   }
   case 'organization-resource-pool-update': {
     await api('/organization/organizations/'+state.orgId+'/resources/'+form.dataset.poolId,{
       method:'PUT',body:JSON.stringify({budgetTotal:d.budgetTotal,volunteerHoursTotal:Number(d.volunteerHoursTotal)})});break;
   }
   case 'organization-resource-allocation': {
     await api('/organization/organizations/'+state.orgId+'/resources/'+form.dataset.poolId+
       '/allocations/'+d.campaignId,{method:'PUT',
       body:JSON.stringify({budgetAllocated:d.budgetAllocated,volunteerHoursAllocated:Number(d.volunteerHoursAllocated)})});break;
   }
   case 'management-search': {
     state.managementQuery=String(d.query||'').trim().slice(0,120);
     state.managementPage=1;break;
   }
   case 'management-save': {
     const current=state.management?.items?.find(x=>x.id===state.managementEditorId);
     const local=d.dueAt?new Date(d.dueAt):null;
     if(local&&!Number.isFinite(local.getTime()))throw new Error('די צייט איז נישט ריכטיג');
     const payload={
      title:d.title,details:d.details||'',status:d.status,priority:d.priority,
      progress:Number(d.progress),assignedTo:d.assignedTo||null,nextAction:d.nextAction||'',
      waitingOn:d.waitingOn||'',issueReason:d.issueReason||'',
      dueAt:local?local.toISOString():null,campaignId:d.campaignId||null,
      note:d.note||'',...(current?{version:current.version}:{})
     };
     const parent='/management/organizations/'+state.orgId+'/management/items';
     await api(current?parent+'/'+current.id:parent,{
      method:current?'PATCH':'POST',body:JSON.stringify(payload)});
     state.managementEditorId=null;state.managementHistoryId=null;break;
   }
   case 'organization-decision': {
     await api('/organization/organizations/'+state.orgId+'/decisions',{method:'POST',body:JSON.stringify({title:d.title,context:d.context||'',campaignId:d.campaignId||null})});break;
   }
   case 'organization-resolve': {
     await api('/organization/decisions/'+form.dataset.id+'/resolve',{method:'POST',body:JSON.stringify({resolution:d.resolution})});break;
   }
   case 'gabbai-handoff-new': {
     if(!state.campaignId)throw new Error('קלייב ערשט א קאמפיין');
     const due=d.dueAt?new Date(d.dueAt):null;
     if(due&&!Number.isFinite(due.getTime()))throw new Error('דער טערמין איז נישט ריכטיג');
     await api('/gabbai/campaigns/'+state.campaignId+'/handoffs',{
      method:'POST',body:JSON.stringify({title:d.title,instructions:d.instructions||'',
       assignedTo:d.assignedTo,priority:d.priority,dueAt:due?due.toISOString():null})});break;
   }
   case 'gabbai-handoff-blocked': {
     if(!state.gabbaiHandoffId)throw new Error('עפען קודם אן איבערגאב');
     const note=String(d.note||'').trim();
     if(!note||note.length>1500)throw new Error('שרייב א קורצן סיבה וואס האלט אפ');
     await api('/gabbai/handoffs/'+state.gabbaiHandoffId+'/status',{
      method:'PATCH',body:JSON.stringify({status:'blocked',note})});break;
   }
   case 'gabbai-handoff-comment': {
     if(!state.gabbaiHandoffId)throw new Error('עפען קודם אן איבערגאב');
     await api('/gabbai/handoffs/'+state.gabbaiHandoffId+'/comments',{
      method:'POST',body:JSON.stringify({body:d.body})});break;
   }
   case 'gabbai-filter-search': {
     state.gabbaiQuery=String(d.query||'').trim().slice(0,120);break;
   }
   case 'gabbai-decision': {
     const id=form.dataset.id,decision=String(d.decision||''),reason=String(d.reason||'').trim();
     if(!state.gabbaiApprovals?.some(x=>x.id===id&&x.status==='pending')||
        !['approved','rejected'].includes(decision))throw new Error('אויסקלייבן אן ערלויבטן באשלוס');
     if(decision==='rejected'&&!reason)throw new Error('ביים אפווארפן שרייב א באגרינדונג');
     if(!confirm('דעם פינאנציעלן באשלוס קען מען נישט צוריקדרייען. זאל מען אים אפהיטן?'))break;
     await api('/gabbai/approvals/'+id+'/decision',{method:'POST',body:JSON.stringify({decision,reason})});
     break;
   }
   case 'gabbai-approval-new': {
     await api('/gabbai/campaigns/'+state.campaignId+'/approvals',{method:'POST',body:JSON.stringify({category:d.category,subject:d.subject,amount:d.amount,explanation:d.explanation||''})});break;
   }
   case 'pro-blocker': {
     await api('/pro/tasks/'+d.taskId+'/blocker',{method:'PUT',body:JSON.stringify({active:true,reason:d.reason,details:d.details||''})});break;
   }
   case 'gabbai-workload-team': {
     const selected=String(d.team||'');
     if(selected&&!state.gabbaiWorkload?.teams?.some(x=>x.team_name===selected))
       throw new Error('די גרופע איז נישט געפונען');
     state.gabbaiWorkloadTeam=selected;state.gabbaiWorkloadPage=1;break;
   }
   case 'gabbai-workload-search': {
     state.gabbaiWorkloadQuery=String(d.query||'').trim().slice(0,120);state.gabbaiWorkloadPage=1;break;
   }
   case 'pro-guidance-search': {
     state.proGuidanceQuery=String(d.query||'').trim().slice(0,120);break;
   }
   case 'pro-guidance-deadline': {
     if(!state.proGuidanceId)throw new Error('קודם עפען א בקשה');
     const due=d.responseDueAt?new Date(d.responseDueAt):null;
     if(due&&!Number.isFinite(due.getTime()))throw new Error('די ציל־צייט איז נישט ריכטיג');
     await api('/pro/guidance/'+state.proGuidanceId+'/triage',{
       method:'PATCH',body:JSON.stringify({action:'deadline',responseDueAt:due?due.toISOString():null})});
     break;
   }
   case 'pro-guidance-new': {
     await api('/pro/campaigns/'+state.campaignId+'/guidance',{method:'POST',
       body:JSON.stringify({category:d.category,subject:d.subject,description:d.description})});break;
   }
   case 'pro-guidance-reply': {
     if(!state.proGuidanceId)throw new Error('עפען א בקשה');
     await api('/pro/guidance/'+state.proGuidanceId+'/messages',{method:'POST',body:JSON.stringify({body:d.body})});break;
   }
   case 'pro-sprint-new': {
     const steps=String(d.steps||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(line=>{
       const split=line.indexOf('|');
       if(split<0)throw new Error('יעדע שורה: טאג | אויפגאבע');
       return {day:Number(line.slice(0,split).trim()),title:line.slice(split+1).trim()};
     });
     await api('/pro/campaigns/'+state.campaignId+'/sprints',{method:'POST',body:JSON.stringify({title:d.title,startsOn:d.startsOn,steps})});break;
   }
   case 'pro-call-list-filter': {
     const mode=String(d.mode||'due'),limit=Number(d.limit);
     if(!['due','high','all'].includes(mode)||![10,20,30,50].includes(limit))throw new Error('ליסטע־פילטער איז נישט ריכטיג');
     state.proCallListMode=mode;state.proCallListLimit=limit;break;
   }
   case 'pro-automation-settings': {
     if(!state.campaignId)throw new Error('קודם קלייב א קאמפיין');
     const max=Number(d.maxTasksPerRun);
     if(!Number.isInteger(max)||max<1||max>20)throw new Error('נאר 1 ביז 20 אויפגאבן');
     await api('/pro/campaigns/'+state.campaignId+'/automations',
      {method:'PUT',body:JSON.stringify({enabled:d.enabled==='on',maxTasksPerRun:max})});break;
   }
   case 'pro-file-upload': {
     if(!state.campaignId)throw new Error('קודם קלייב א קאמפיין');
     const file=form.querySelector('input[type=file]')?.files?.[0];
     if(!file||file.size<1||file.size>1048576)throw new Error('פייל דארף זיין צווישן 1 בייט און 1 MB');
     const types={'.pdf':'application/pdf','.jpg':'image/jpeg','.png':'image/png','.txt':'text/plain'};
     const extension='.'+file.name.split('.').pop().toLowerCase();
     const mime=types[extension];
     if(!mime||file.name.length>120)throw new Error('בלויז PDF, JPG, PNG און TXT');
     const raw=await new Promise((resolve,reject)=>{
       const reader=new FileReader();
       reader.onerror=()=>reject(new Error('פייל נישט געליינט'));
       reader.onload=()=>resolve(String(reader.result||''));
       reader.readAsDataURL(file);
     });
     const base64=raw.split(',')[1]||'';
     await api('/pro/campaigns/'+state.campaignId+'/files',{
       method:'POST',body:JSON.stringify({name:file.name,mime,contentBase64:base64,visibility:d.visibility})});
     break;
   }
   case 'pro-search': {
     state.proQuery=String(d.query||'').trim();state.proOverdue=d.overdue==='on';
     state.proSelected=null;state.proContactId=null;break;
   }
   case 'pro-profile': {
     if(!state.proContactId)throw new Error('ערשט עפענען א קשר');
     const tags=String(d.tags||'').split(',').map(x=>x.trim()).filter(Boolean);
     const date=d.nextFollowupAt?new Date(d.nextFollowupAt):null;
     if(date&&!Number.isFinite(date.getTime()))throw new Error('די נאכפאלג־צייט איז נישט ריכטיג');
     await api('/pro/contacts/'+state.proContactId+'/profile',{method:'PUT',body:JSON.stringify({stage:d.stage,priority:d.priority,tags,nextFollowupAt:date?date.toISOString():null})});break;
   }
   case 'pro-interaction': {
     if(!state.proContactId)throw new Error('ערשט עפענען א קשר');
     await api('/pro/contacts/'+state.proContactId+'/interactions',{method:'POST',body:JSON.stringify({kind:d.kind,note:d.note})});break;
   }
   case 'signin': {
     let r;
     try {r=await state.auth.signIn.email({email:d.email,password:d.password});}
     catch(e){throw new Error(authError(e));}
     if(r.error)throw new Error(authError(r.error));
     break;
   }
   case 'signup': {
     let r;
     try {r=await state.auth.signUp.email({name:d.name,email:d.email,password:d.password});}
     catch(e){throw new Error(authError(e));}
     if(r.error)throw new Error(authError(r.error));
     state.notice='אקאונט געשאפן. דו קענסט זיך אריינלאגירן מיט דעם בליצפאסט און פעסווארט.';
     break;
   }
   case 'org': await api('/organizations',{method:'POST',body:JSON.stringify({name:d.name})});break;
   case 'redeem-invite': {
     const joined=await api('/team/invitations/redeem',{method:'POST',body:JSON.stringify({invitationCode:d.invitationCode})});
     state.orgId=joined.organizationId;state.campaignId=joined.campaignId||null;
     state.invitationCode='';state.connectCode='';state.joinedRoomId=null;state.showCampaignForm=false;
     state.tab='today';break;
   }
   case 'campaign-settings': {
     if(!state.campaignId)throw new Error('קלייב א קאמפיין');
     await api('/campaigns/'+state.campaignId,{method:'PATCH',body:JSON.stringify({goalAmount:d.goalAmount,status:d.status})});break;
   }
   case 'member-permission': {
     if(d.confirm!=='on')throw new Error('באשטעטיג דעם רשות־טויש');
     const member=state.members.find(m=>m.subject===d.subject);
     if(!member||member.role==='owner'||member.subject===state.subject)throw new Error('מען קען נישט ענדערן א באשיצטן מיטגליד');
     await api('/team/organizations/'+state.orgId+'/members/'+encodeURIComponent(d.subject),{
       method:'PATCH',body:JSON.stringify({role:d.role,status:d.status})
     });break;
   }
   case 'member-team': await api('/team/campaigns/'+state.campaignId+'/members/'+encodeURIComponent(d.subject)+'/team',{method:'PATCH',body:JSON.stringify({teamName:d.teamName})});break;
   case 'plus-partial-receipt': {
     const id=form.dataset.pledgeId;
     if(!state.plusPledges.some(p=>p.id===id))throw new Error('די התחייבות איז נישט פאראן אין דעם קאמפיין');
     const signature=[id,d.amount,d.method,d.reference||''].join('|');
     if(!state.receiptRequests[signature])state.receiptRequests[signature]=crypto.randomUUID();
     await api('/plus/campaigns/'+state.campaignId+'/pledges/'+id+'/partial-receipts',{
       method:'POST',body:JSON.stringify({requestId:state.receiptRequests[signature],amount:d.amount,method:d.method,reference:d.reference||''})
     });
     delete state.receiptRequests[signature];
     break;
   }
   case 'plus-donation-levels': {
     const levels=String(d.levels||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>{
       const parts=line.split('|');if(parts.length!==2)throw new Error('יעדע שורה דארף זיין: סכום | נאמען');
       return {amount:parts[0].trim(),label:parts[1].trim()};
     });
     await api('/plus/campaigns/'+state.campaignId+'/donation-levels',{method:'PUT',body:JSON.stringify({levels})});break;
   }
   case 'plus-handoff': {
     if(!state.campaignId||!state.tasks.some(t=>t.id===form.dataset.taskId))throw new Error('אויפגאבע נישט געפונען');
     const dueAt=d.dueAt?new Date(d.dueAt).toISOString():undefined;
     await api('/plus/tasks/'+form.dataset.taskId+'/handoff',{method:'PATCH',body:JSON.stringify({assigneeSubject:d.assigneeSubject,dueAt})});break;
   }
   case 'video-config': {
     const kind=d.kind;
     const id=kind==='floor'?state.joinedRoomId:kind==='conference'?state.conferenceId:null;
     if(!id)throw new Error('קלייב א צימער');
     const payload={enabled:d.enabled==='true',accessMode:d.accessMode};
     if(d.sourceUrl?.trim())payload.sourceUrl=d.sourceUrl.trim();
     await api('/video/'+kind+'/'+id+'/config',{method:'PATCH',body:JSON.stringify(payload)});
     if(!payload.enabled&&watchedContext()?.kind===kind&&watchedContext()?.roomId===id)stopOptionalVideo();
     break;
   }
   case 'video-grant': {
     const kind=d.kind;
     const id=kind==='floor'?state.joinedRoomId:kind==='conference'?state.conferenceId:null;
     if(!id||!d.subject?.trim())throw new Error('קלייב א באשטעטיגטן מיטגליד');
     await api('/video/'+kind+'/'+id+'/allow/'+encodeURIComponent(d.subject.trim()),{
       method:'PATCH',body:JSON.stringify({allowed:d.allowed==='true'})
     });
     break;
   }
   case 'conference-new': {
     const created=await api('/conferences/organizations/'+state.orgId,{method:'POST',
       body:JSON.stringify({title:d.title,category:d.category,accessMode:d.accessMode,
        speakingMode:d.speakingMode,agenda:d.agenda,campaignId:d.campaignOnly?state.campaignId:null})});
     state.conferenceId=created.conference.id;state.conferenceCode=created.accessCode||'';state.tab='conference';break;
   }
   case 'conference-join': {
     const joined=await api('/conferences/'+state.conferenceId+'/join',{method:'POST',body:JSON.stringify({accessCode:d.accessCode||''})});
     state.notice=joined.waiting?'דו ווארטסט פארן מנהל־באשטעטיגונג.':'ביסט אינעם אסיפה־צימער.';
     break;
   }
   case 'conference-settings': {
     await api('/conferences/'+state.conferenceId,{method:'PATCH',
       body:JSON.stringify({roomStatus:d.roomStatus,phase:d.phase,speakingMode:d.speakingMode,mediaUrl:d.mediaUrl||null})});
     break;
   }
   case 'conference-policy': {
     if(!state.conferenceId)throw new Error('קלייב אן אסיפה');
     await api('/conferences/'+state.conferenceId+'/policies/'+encodeURIComponent(d.subject.trim()),{
       method:'PATCH',body:JSON.stringify({rule:d.rule,enabled:d.enabled==='true'})
     });break;
   }
   case 'conference-message': {
     await api('/conferences/'+state.conferenceId+'/messages',{method:'POST',body:JSON.stringify({kind:d.kind,body:d.body})});
     break;
   }
   case 'program-add': {
     const start=new Date(d.scheduledStart),end=new Date(d.scheduledEnd);
     if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)throw new Error('די פראגראם־צייטן זענען נישט ריכטיג');
     await api('/floor-program/'+state.joinedRoomId+'/schedule',{method:'POST',
       body:JSON.stringify({title:d.title,speaker:d.speaker,segmentType:d.segmentType,
        description:d.description,mediaUrl:d.mediaUrl||null,autoStart:d.autoStart==='on',
        scheduledStart:start.toISOString(),scheduledEnd:end.toISOString()})});break;
   }
   case 'help-reply': {
     if(!state.selectedHelpId||!state.joinedRoomId)throw new Error('קלייב א הילף־שמועס');
     await api('/floor/'+state.joinedRoomId+'/help/'+state.selectedHelpId+'/messages',{method:'POST',
       body:JSON.stringify({body:d.body})});break;
   }
   case 'floor-help': {
     if(!state.floorProgram?.checkedIn)throw new Error('קודם טשעקט זיך אריין צום קאמפיין־אוונט');
     await api('/floor/'+state.joinedRoomId+'/help',{method:'POST',
      body:JSON.stringify({category:d.category,summary:d.summary})});break;
   }
   case 'floor-call': {
     if(state.floorProgram?.mode!=='calling'||!state.floorProgram?.checkedIn)
       throw new Error('די רופן זענען יעצט אפגעשטעלט פאר א פראגראם אדער הפסקה');
     const lead=state.leads.find(p=>p.id===d.contactId);
     if(!lead||lead.claimed_by!==state.subject||new Date(lead.claim_expires_at).getTime()<=Date.now())
       throw new Error('קודם נעם דעם קשר פאר דיין רוף');
     const attemptId=state.callKeys[d.contactId]||crypto.randomUUID();
     state.callKeys[d.contactId]=attemptId;
     const recorded=await api('/floor/'+state.joinedRoomId+'/calls/'+encodeURIComponent(d.contactId),{
       method:'POST',body:JSON.stringify({outcome:d.outcome,note:d.note||'',attemptId})
     });
     delete state.callKeys[d.contactId];
     break;
   }
   case 'hall-new': await api('/rooms/campaigns/'+state.campaignId,{method:'POST',body:JSON.stringify({title:d.title})});break;
   case 'hall-message': await api('/rooms/'+state.joinedRoomId+'/announcements',{method:'POST',body:JSON.stringify({message:d.message})});break;
   case 'contact-team': await api('/team/campaigns/'+state.campaignId+'/contacts/'+encodeURIComponent(d.contactId)+'/team',{method:'PATCH',body:JSON.stringify({teamName:d.teamName})});break;
   case 'invite': {
     if(d.campaignOnly&&['manager','finance','auditor'].includes(d.role))throw new Error('דאס איז א ראלע פארן גאנצן ארבעטס־פלאץ. נעם אראפ דעם צייכן ״בלויז דעם קאמפיין״ אדער קלייב גרופע־פירער/עסקן.');
     const r=await api('/team/organizations/'+state.orgId+'/invitations',{method:'POST',
       body:JSON.stringify({role:d.role,campaignId:d.campaignOnly?state.campaignId:null})});
     state.invitationCode=r.invitationCode;
     break;
   }
   case 'campaign': {
     const created=await api('/organizations/'+state.orgId+'/campaigns',{method:'POST',body:JSON.stringify({title:d.title,goalAmount:d.goalAmount})});
     state.campaignId=created.id;state.showCampaignForm=false;
     state.tab='today';break;
   }
   case 'shared-focus-search': {
     state.sharedFocusQuery=String(d.query||'').trim().slice(0,100);
     await refresh();
     break;
   }
   case 'shared-focus-save': {
     if(!state.sharedFocus?.editable||!state.campaignId)
      throw new Error('איר זענט נישט בארעכטיגט צו טוישן דעם Focus');
     const ids=[...form.querySelectorAll('select[name="focusTaskId"]')]
      .map(sel=>sel.value).filter(Boolean);
     if(new Set(ids).size!==ids.length)throw new Error('קלייבט נישט די זעלבע אויפגאבע צוויי מאל');
     const uri='/quick/campaigns/'+state.campaignId+'/shared-focus';
     try{
       await api(uri,{method:'PUT',body:JSON.stringify({
        team:state.sharedFocus.team,expectedVersion:state.sharedFocus.version,
        taskIds:ids})});
     }catch(error){await refresh();throw error;}
     break;
   }
   case 'quick-daily-review': {
     if(!state.campaignId)throw new Error('קודם קלייב א קאמפיין');
     await api('/quick/campaigns/'+state.campaignId+'/daily/review',{
      method:'POST',body:JSON.stringify({reflection:String(d.reflection||'')})});break;
   }
   case 'goal': await api('/goals/campaigns/'+state.campaignId,{method:'POST',body:JSON.stringify({title:d.title,category:d.category,targetValue:d.targetValue,dueOn:d.dueOn||null,description:d.description})});state.goalsPage=1;break;
    case 'donation-link': await api('/donation-links/'+state.campaignId,{method:'PUT',body:JSON.stringify({url:d.url,providerName:d.providerName})});break;
    case 'goal-update': {
     const item=state.goals?.find(g=>g.id===form.dataset.goalId);
     if(!item)throw new Error('דער ציל איז נישט מער אויף דעם בלאט');
     const v=Number(d.expectedVersion);
     if(!Number.isSafeInteger(v)||v<0||v!==item.version)
       throw new Error('דער ציל איז געענדערט געווארן. פריש אויף דעם בלאט איידער אפהיטן.');
     try{
       await api('/goals/'+encodeURIComponent(item.id),{
         method:'PATCH',body:JSON.stringify({
          currentValue:d.currentValue,status:d.status,expectedVersion:v})});
     }catch(error){await refresh();throw error;}
     // The history panel must never keep showing stale audit data after an edit.
     if(state.goalHistoryId===item.id){
       try{
         state.goalHistoryData=await api('/goals/'+encodeURIComponent(item.id)+'/history?page=1');
         state.goalHistoryPage=1;state.goalHistoryError='';
       }catch(error){state.goalHistoryData=null;state.goalHistoryError=error.message;}
     }
     break;
   }
    case 'task': {const raw=d.dueAt?new Date(d.dueAt):null;
     if(raw&&!Number.isFinite(raw.getTime()))throw new Error('טערמין איז נישט ריכטיג');
     await api('/campaigns/'+state.campaignId+'/tasks',{method:'POST',body:JSON.stringify({title:d.title,priority:d.priority,kind:d.kind,assigneeSubject:d.assigneeSubject||undefined,dueAt:raw?raw.toISOString():null})});break;}
   case 'import-preview': {
     const file=form.querySelector('input[type=file]')?.files?.[0];
     if(!file||file.size>1024*1024)throw new Error('CSV פייל דארף זיין קלענער ווי 1MB');
     const parsed=Papa.parse(await file.text(),{header:true,skipEmptyLines:'greedy',dynamicTyping:false});
     if(parsed.errors.length)throw new Error('CSV־פארמאט איז נישט ריכטיג: '+parsed.errors[0].message);
     const columns=(parsed.meta.fields||[]).map(x=>x.trim().toLowerCase());
     if(!columns.includes('name')||!columns.includes('phone'))throw new Error('CSV דארף האבן name און phone שפאלטן');
     if(parsed.data.length<1||parsed.data.length>500)throw new Error('ביטע קלייב 1 ביז 500 קשרים פער אימפארט');
     const rows=parsed.data.map(row=>{
       const cols=Object.fromEntries(Object.entries(row).map(([k,v])=>[k.trim().toLowerCase(),v]));
       return {name:cols.name||'',phone:cols.phone||'',notes:cols.notes||''};
     });
     const preview=await api('/import/campaigns/'+state.campaignId+'/contacts/import',{
       method:'POST',body:JSON.stringify({rows,dryRun:true})
     });
     state.importRows=rows;state.importPreview=preview;break;
   }
   case 'contact': await api('/campaigns/'+state.campaignId+'/contacts',{method:'POST',body:JSON.stringify({name:d.name,phone:d.phone,notes:d.notes,privacy:d.privacy})});break;
   case 'call': await api('/contacts/'+d.contactId+'/calls',{method:'POST',body:JSON.stringify({outcome:d.outcome,note:d.note})});break;
   case 'finance': await api('/campaigns/'+state.campaignId+'/finance',{method:'POST',body:JSON.stringify({kind:d.kind,amount:d.amount,verificationReference:d.verificationReference})});break;
  }
  const result=await state.auth.getSession();
  state.user=result.data?.user||null;
  await refresh();
  state.notice='געהיטן!';
  draw();
 } catch(error){say(error.message);}finally{state.busy=false;}
}
async function click(event){
 const btn=event.target.closest('[data-action]');if(!btn)return;
 const a=btn.dataset.action;
 try {
  if(a==='logout'){await stopSmallAudio();stopOptionalVideo();await state.auth.signOut();state.user=null;state.connectCode='';state.connectCodeDeadline=0;state.connectStatus=null;state.connectOrgSummary=null;state.connectError='';state.capacityAudit=null;state.capacityError='';state.goals=[];state.goalsMeta=null;state.goalHistoryId=null;state.goalHistoryData=null;state.goalHistoryError='';state.quickFocus=null;state.quickFocusError='';state.sharedFocus=null;state.sharedFocusCandidates=null;state.sharedFocusTeam='';state.sharedFocusQuery='';state.quickDaily=null;state.quickDailyError='';state.notice='';draw();return;}
  if(a==='connect-open'){state.tab='connect';state.connectCode='';state.connectCodeDeadline=0;await refresh();draw();return;}
  if(a==='connect-refresh'){state.connectCode='';state.connectCodeDeadline=0;await refresh();draw();return;}
  if(a==='connect-generate'){
    if(state.connectStatus?.linked)throw new Error('דער אקאונט איז שוין פארבונדן');
    const result=await api('/connect/code',{method:'POST'});
    if(!/^[A-Za-z0-9_-]{32}$/.test(result.code||''))throw new Error('אומגילטיגער קאנעקט־קאוד');
    state.connectCode=result.code;state.connectCodeDeadline=Date.now()+Math.min(Number(result.expiresInMinutes||10),10)*60000;
    state.connectError='';draw();return;
  }
  if(a==='connect-copy'){
    if(!state.connectCode||Date.now()>=state.connectCodeDeadline)
      throw new Error('דער קאוד איז שוין אויסגעלאפן. מאך א נייעם קאוד.');
    await navigator.clipboard.writeText(state.connectCode);
    say('דער איינמאליגער קאוד איז קאפירט');return;
  }
  if(a==='connect-unlink'){
    if(!state.connectStatus?.linked||!confirm('אויפלעזן די פארבינדונג צווישן די צוויי אקאונטס?'))return;
    await api('/connect/unlink',{method:'POST'});
    state.connectCode='';state.connectCodeDeadline=0;state.connectStatus=null;await refresh();draw();return;
  }
  if(a==='tab'){state.tab=btn.dataset.tab;draw();return;}
   if(a==='plan-open'){state.tab='plans';draw();return;}
   if(a==='goal-archive'){
     const target=state.goals?.find(g=>g.id===btn.dataset.id);
     if(!target)throw new Error('ציל נישט געפונען. פריש אויף דעם בלאט.');
     if(!confirm('דעם ציל ארכיווירן? די היסטאריע בלייבט אפגעהיטן.'))return;
     try{
       await api('/goals/'+encodeURIComponent(target.id),{
        method:'PATCH',body:JSON.stringify({status:'archived',expectedVersion:target.version})});
     }catch(error){await refresh();throw error;}
     state.goalHistoryId=null;state.goalHistoryData=null;await refresh();return;
   }
   if(a==='plan-tier'){const n=Number(btn.dataset.index);if(Number.isInteger(n)&&n>=0&&n<6){state.planTierIndex=n;draw();}return;}
  if(a==='organization-memory-history'){
    state.organizationMemoryHistory=btn.dataset.history==='true';await refresh();return;
  }
  if(a==='custom-workflow-progress'){
    const run=state.customWorkflowData?.runs?.find(x=>x.id===btn.dataset.id);
    const action=btn.dataset.step;
    if(!run||!['complete_step','resume','cancel'].includes(action))
      throw new Error('די פראצעדור אדער שריט איז נישט געפונען');
    if((action==='complete_step'||action==='cancel')&&
      !confirm(action==='cancel'?'פארמאכן די פראצעדור?':'באשטעטיגן אז דער שריט איז באמת פארטיג?'))return;
    await api('/custom/campaigns/'+state.campaignId+'/workflow-runs/'+run.id+'/action',{
      method:'POST',body:JSON.stringify({action,version:run.version})});
    await refresh();return;
  }
  if(a==='custom-workflow-archive'){
    if(!state.customWorkflowTemplates?.templates?.some(t=>t.id===btn.dataset.id&&!t.archived_at))return;
    if(!confirm('ארכיווירן דעם מוסטער? עקזיסטירנדע פראצעדורן בלייבן אפגעהיטן.'))return;
    await api('/custom/campaigns/'+state.campaignId+'/workflow-templates/'+btn.dataset.id+'/archive',{method:'POST'});
    await refresh();return;
  }
  if(a==='custom-workflow-events'){
    if(!state.customWorkflowData?.runs?.some(x=>x.id===btn.dataset.id))return;
    state.customWorkflowEventsId=btn.dataset.id;
    const result=await api('/custom/campaigns/'+state.campaignId+'/workflow-runs/'+btn.dataset.id+'/events');
    state.customWorkflowEvents=result.events||[];
    draw();return;
  }
  if(a==='custom-workflow-close-events'){
    state.customWorkflowEventsId=null;state.customWorkflowEvents=[];draw();return;
  }
  if(a==='management-home'){state.tab='management';draw();return;}
  if(a==='management-queue'){
    const value=btn.dataset.value;
    if(!['all','mine','needs_action','overdue','due_soon','unassigned'].includes(value))
      return;
    state.managementQueue=value;state.managementPage=1;
    state.managementEditorId=null;state.managementHistoryId=null;state.managementHistory=null;
    await refresh();return;
  }
  if(a==='management-filter'){
    const value=btn.dataset.value;
    if(!['all','planned','ready','in_progress','waiting','blocked',
      'failed','successful','completed','cancelled'].includes(value))return;
    state.managementFilter=value;state.managementPage=1;state.managementEditorId=null;
    await refresh();return;
  }
  if(a==='management-page'){
    const page=Number(btn.dataset.page);
    if(!Number.isInteger(page)||page<1||page>(state.management?.pageCount||1))return;
    state.managementPage=page;state.managementEditorId=null;await refresh();return;
  }
  if(a==='management-edit'){
    if(!state.management?.items?.some(x=>x.id===btn.dataset.id))return;
    state.managementEditorId=btn.dataset.id;draw();return;
  }
  if(a==='management-new'){state.managementEditorId=null;draw();return;}
  if(a==='management-history'){
    if(!state.management?.items?.some(x=>x.id===btn.dataset.id))return;
    state.managementHistoryId=btn.dataset.id;
    state.managementHistoryError='';
    try{state.managementHistory=await api('/management/organizations/'+state.orgId+
      '/management/items/'+btn.dataset.id+'/history');}
    catch(error){state.managementHistory=null;state.managementHistoryError=error.message;}
    draw();return;
  }
  if(a==='management-history-page'){
    const page=Number(btn.dataset.page);
    if(!Number.isInteger(page)||page<1||page>(state.managementHistory?.pageCount||1)||
       !state.managementHistoryId)return;
    state.managementHistory=await api('/management/organizations/'+state.orgId+
     '/management/items/'+state.managementHistoryId+'/history?page='+page);
    draw();return;
  }
  if(a==='management-close-history'){
    state.managementHistoryId=null;state.managementHistory=null;draw();return;
  }
  if(a==='organization-campaign'){
    if(!state.organizationPortfolio?.campaigns?.some(c=>c.id===btn.dataset.id)&&
       !state.organizationPortfolio?.attentionQueue?.some(c=>c.id===btn.dataset.id))
      throw new Error('קאמפיין נישט געפונען');
    state.campaignId=btn.dataset.id;state.tab='today';await refresh();return;
  }
  if(a==='gabbai-workload-team'){
    const team=btn.dataset.team||'';
    if(!state.gabbaiWorkload?.teams?.some(x=>x.team_name===team))
      throw new Error('די גרופע איז נישט געפונען');
    state.gabbaiWorkloadTeam=team;state.gabbaiWorkloadPage=1;await refresh();return;
  }
  if(a==='gabbai-workload-filter'){
    if(['all','overdue','soon','unassigned'].includes(btn.dataset.value)){
      state.gabbaiWorkloadFilter=btn.dataset.value;state.gabbaiWorkloadPage=1;await refresh();
    }return;
  }
  if(a==='gabbai-workload-page'){
    const next=Number(btn.dataset.page);
    const max=state.gabbaiWorkload?.pageCount||1;
    if(!Number.isSafeInteger(next)||next<1||next>max)
      throw new Error('די זייט איז נישט פאראן');
    state.gabbaiWorkloadPage=next;await refresh();return;
  }
  if(a==='gabbai-workload-assign'){
    const subject=btn.dataset.subject;
    if(!state.gabbaiWorkload?.members?.some(m=>m.subject===subject))
      throw new Error('מעמבער נישט געפונען אין דעם קאמפיין');
    state.gabbaiNewAssignee=subject;state.gabbaiHandoffId=null;state.gabbaiHandoffEvents=[];
    state.tab='gabbai';draw();
    document.querySelector('form[data-form="gabbai-handoff-new"]')?.scrollIntoView({behavior:'smooth',block:'center'});
    return;
  }
  if(a==='gabbai-handoff-filter'){
    if(['open','mine','blocked','overdue','done','all'].includes(btn.dataset.value)){
      state.gabbaiHandoffFilter=btn.dataset.value;draw();
    }return;
  }
  if(a==='gabbai-handoff-open'){
    if(!state.gabbaiHandoffs?.handoffs?.some(h=>h.id===btn.dataset.id))
      throw new Error('די איבערגאב איז נישט אין דיין ליסטע');
    state.gabbaiHandoffId=btn.dataset.id;
    const details=await api('/gabbai/handoffs/'+state.gabbaiHandoffId+'/events');
    state.gabbaiHandoffEvents=details.events||[];draw();return;
  }
  if(a==='gabbai-handoff-back'){state.gabbaiHandoffId=null;state.gabbaiHandoffEvents=[];draw();return;}
  if(a==='gabbai-handoff-status'){
    if(!state.gabbaiHandoffs?.handoffs?.some(h=>h.id===btn.dataset.id))throw new Error('איבערגאב נישט געפונען');
    await api('/gabbai/handoffs/'+btn.dataset.id+'/status',{
      method:'PATCH',body:JSON.stringify({status:btn.dataset.status})});
    await refresh();return;
  }
  if(a==='gabbai-task-status'){
    const task=state.gabbaiPriorities?.urgentTasks?.find(t=>t.id===btn.dataset.id);
    const next=btn.dataset.status;
    if(!task||!['in_progress','done'].includes(next))
      throw new Error('די דרינגליכע אויפגאבע איז נישט אין דעם קאמפיין');
    if(next==='done'&&!confirm('באשטעטיג, די אויפגאבע איז טאקע פארענדיגט?'))return;
    await api('/tasks/'+encodeURIComponent(task.id),{
      method:'PATCH',body:JSON.stringify({status:next})});
    await refresh();say(next==='done'?'די אויפגאבע איז פארענדיגט':'די אויפגאבע איז אנגעהויבן');return;
  }
  if(a==='gabbai-filter'){
    const value=btn.dataset.value;
    if(['actionable','pending','mine','approved','rejected','all'].includes(value)){
      state.gabbaiFilter=value;draw();
    }
    return;
  }
  if(a==='pro-blocker-resolve'){
    const old=state.proBlockers?.blockers?.find(x=>x.task_id===btn.dataset.id);
    if(!old)throw new Error('שוועריקייט נישט געפונען');
    await api('/pro/tasks/'+old.task_id+'/blocker',{method:'PUT',body:JSON.stringify({active:false,reason:old.reason})});
    await refresh();return;
  }
  if(a==='pro-guidance-filter'){
    const value=btn.dataset.value;
    if(['open','answered','closed','all','mine','due'].includes(value)){state.proGuidanceFilter=value;draw();}
    return;
  }
  if(a==='pro-guidance-take'||a==='pro-guidance-release'){
    const id=btn.dataset.id;
    if(!state.proGuidance.some(x=>x.id===id))throw new Error('בקשה נישט געפונען');
    await api('/pro/guidance/'+id+'/triage',{
      method:'PATCH',body:JSON.stringify({action:a==='pro-guidance-take'?'take':'release'})});
    await refresh();say('די הנהלה־צוטיילונג איז אפגעהיטן');return;
  }
  if(a==='pro-guidance-open'){
    state.proGuidanceId=btn.dataset.id;
    const thread=await api('/pro/guidance/'+state.proGuidanceId+'/messages');
    state.proGuidanceMessages=thread.messages||[];draw();return;
  }
  if(a==='pro-guidance-back'){state.proGuidanceId=null;state.proGuidanceMessages=[];draw();return;}
  if(a==='pro-guidance-close'){
    if(!confirm('די בקשה פארמאכן? די פריערדיגע שמועס בלייבט.'))return;
    await api('/pro/guidance/'+btn.dataset.id+'/close',{method:'PATCH',body:'{}'});
    await refresh();return;
  }
  if(a==='pro-step'){
    await api('/pro/sprints/'+btn.dataset.sprintId+'/steps/'+btn.dataset.id,{
      method:'PATCH',body:JSON.stringify({status:btn.dataset.status})});await refresh();return;
  }
  if(a==='pro-sprint-close'){
    if(!confirm('דעם Sprint '+(btn.dataset.status==='completed'?'פארענדיגן':'ארכיווירן')+'? די געשיכטע בלייבט.'))return;
    await api('/pro/sprints/'+btn.dataset.id+'/status',{method:'PATCH',body:JSON.stringify({status:btn.dataset.status})});
    await refresh();return;
  }
  if(a==='pro-next-task-status'){
    const id=btn.dataset.id,status=btn.dataset.status;
    const task=state.proRecommendations?.find(x=>x.source==='task'&&x.id===id);
    if(!state.campaignId||!task||!['in_progress','done'].includes(status))
      throw new Error('אויפגאבע נישט ערלויבט');
    await api('/tasks/'+encodeURIComponent(id),{
      method:'PATCH',body:JSON.stringify({status})});
    await refresh();say(status==='done'?'די אויפגאבע איז פארענדיגט':'די אויפגאבע איז אנגעהויבן');return;
  }
  if(a==='pro-next-choice'){
    const source=btn.dataset.source,id=btn.dataset.id,decision=btn.dataset.decision;
    if(!state.campaignId||!['accepted','deferred','skipped'].includes(decision)||
      !state.proRecommendations?.some(x=>x.source===source&&x.id===id))
      throw new Error('די אויסגעקליבענע אויפגאבע איז נישט דערלויבט');
    await api('/pro/campaigns/'+state.campaignId+'/next-actions/'+source+'/'+encodeURIComponent(id),
      {method:'PUT',body:JSON.stringify({decision,note:''})});
    await refresh();say('דיין באשלוס איז אפגעהיטן');return;
  }
  if(a==='pro-open'){state.proContactId=btn.dataset.id;state.proSelected=await api('/pro/contacts/'+state.proContactId+'/timeline');draw();return;}
  if(a==='pro-close'){state.proSelected=null;state.proContactId=null;draw();return;}
  if(a==='refresh-history'){await refresh();return;}
  if(a==='more-history'){
    if(!state.campaignId||state.activityNextOffset===null)return;
    const result=await api('/team/campaigns/'+state.campaignId+'/activity?offset='+state.activityNextOffset);
    state.activity=[...state.activity,...result.events];state.activityNextOffset=result.nextOffset;draw();return;
  }
  if(a==='export-contacts'){await exportContactsPage();return;}
  if(a==='import-confirm'){
    if(!state.importRows||!state.importPreview)throw new Error('קודם מאך א פאראויסבליק');
    if(state.busy)return;
    state.busy=true;
    try{
      const r=await api('/import/campaigns/'+state.campaignId+'/contacts/import',{
        method:'POST',body:JSON.stringify({rows:state.importRows,dryRun:false})
      });
      state.importRows=null;state.importPreview=null;
      await refresh();
      say('אריינגעלייגט '+r.created+' נייע קשרים. אויסגעלאזט '+r.duplicates+' דאבליקאטן.');
    }finally{state.busy=false;}
    return;
  }


  if(a==='pro-automation-run'){
    if(!state.campaignId||!state.proAutomations?.rule?.enabled)throw new Error('קודם אנצינדן די נאכפאלג־כללים');
    const outcome=await api('/pro/campaigns/'+state.campaignId+'/automations/run',
      {method:'POST',body:'{}'});
    await refresh();say('געשאפן '+outcome.run.created_tasks+' נאכפאלג־אויפגאבן פאר דיר');
    return;
  }
  if(a==='pro-call-list-open'){
    if(!state.proCallList?.contacts?.some(c=>c.id===btn.dataset.id))
      throw new Error('קשר נישט אין דיין ערלויבטן רוף־ליסטע');
    state.proContactId=btn.dataset.id;
    state.proSelected=await api('/pro/contacts/'+state.proContactId+'/timeline');
    state.tab='crm';draw();return;
  }
  if(a==='pro-automation-open-contact'){
    if(!state.proAutomations?.createdLinks?.some(x=>x.contact_id===btn.dataset.id))
      throw new Error('דאס איז נישט דיין נאכפאלג־קשר');
    state.proContactId=btn.dataset.id;
    state.proSelected=await api('/pro/contacts/'+state.proContactId+'/timeline');
    state.tab='crm';draw();return;
  }
  if(a==='pro-file-download'){
    const file=state.proFiles?.files?.find(x=>x.id===btn.dataset.id);
    if(!state.campaignId||!file)throw new Error('דער פייל איז נישט אין דיין ערלויבטן רשימה');
    const jwt=await getApiJwt();
    if(!jwt)throw new Error('מען דארף זיך נאכאמאל איינשרייבן');
    const path='/api/pro/campaigns/'+encodeURIComponent(state.campaignId)+'/files/'+encodeURIComponent(file.id)+'/download';
    const response=await fetch(path,{headers:{Authorization:'Bearer '+jwt},cache:'no-store'});
    if(!response.ok)throw new Error('פייל קען נישט אראפגענומען ווערן: '+response.status);
    const blob=await response.blob(),url=URL.createObjectURL(blob);
    try{
      const link=document.createElement('a');link.href=url;link.download=file.original_name;
      document.body.appendChild(link);link.click();link.remove();
    }finally{setTimeout(()=>URL.revokeObjectURL(url),5000);}
    return;
  }
  if(a==='goal-history'){
    const item=state.goals?.find(g=>g.id===btn.dataset.id);
    const role=state.overview?.campaign?.role;
    if(!item||!['owner','manager','finance','auditor'].includes(role))
      throw new Error('ציל־היסטאריע נישט צוטריטבאר');
    state.goalHistoryId=item.id;state.goalHistoryPage=1;
    state.goalHistoryData=null;state.goalHistoryError='';
    const id=item.id,campaign=state.campaignId;
    try{
      const result=await api('/goals/'+encodeURIComponent(id)+'/history?page=1');
      if(state.campaignId===campaign&&state.goalHistoryId===id)state.goalHistoryData=result;
    }catch(error){if(state.goalHistoryId===id)state.goalHistoryError=error.message;}
    draw();return;
  }
  if(a==='goal-history-close'){
    state.goalHistoryId=null;state.goalHistoryData=null;
    state.goalHistoryError='';state.goalHistoryPage=1;draw();return;
  }
  if(a==='goal-history-page'){
    const requested=Number(btn.dataset.page);
    if(!state.goalHistoryId||!Number.isSafeInteger(requested)||
       requested<1||requested>(state.goalHistoryData?.pageCount||1))return;
    const id=state.goalHistoryId,campaign=state.campaignId;
    const result=await api('/goals/'+encodeURIComponent(id)+'/history?page='+requested);
    if(state.campaignId!==campaign||state.goalHistoryId!==id)return;
    state.goalHistoryPage=requested;state.goalHistoryData=result;draw();return;
  }
  if(a==='goal-page'){
    const requested=Number(btn.dataset.page);
    if(!Number.isSafeInteger(requested)||requested<1||
      requested>(state.goalsMeta?.pageCount||1))return;
    state.goalsPage=requested;
    state.goalHistoryId=null;state.goalHistoryData=null;
    state.goalHistoryError='';state.goalHistoryPage=1;
    await refresh();return;
  }
  if(a==='plus-credit-page'){
    const requested=Number(btn.dataset.page);
    if(!Number.isInteger(requested)||requested<1||
      requested>(state.plusCreditMeta?.pageCount||1))return;
    state.plusCreditPage=requested;await refresh();return;
  }
  if(a==='plus-alert-ack'){
    if(!state.campaignId||!state.plusAlerts?.overdueTasks?.some(t=>t.id===btn.dataset.id))throw new Error('ווארענונג נישט געפונען');
    await api('/plus/campaigns/'+state.campaignId+'/alerts/'+encodeURIComponent(btn.dataset.id)+'/ack',{method:'POST',body:'{}'});
    await refresh();return;
  }
  if(a==='plus-preset'){
    const amountField=document.querySelector('form[data-form="finance"] input[name="amount"]');
    if(amountField){amountField.value=btn.dataset.amount;amountField.focus();}return;
  }
  if(a==='new-campaign'){state.showCampaignForm=!state.showCampaignForm;draw();return;}
  if(a==='done'){await api('/tasks/'+btn.dataset.id,{method:'PATCH',body:JSON.stringify({status:'done'})});await refresh();return;}
  if(a==='new-connect-code'){const r=await api('/connect/code',{method:'POST',body:'{}',headers:{'Content-Type':'application/json'}});state.connectCode=r.code;draw();return;}
  if(a==='unlink-max'){if(!state.confirmUnlink){state.confirmUnlink=true;say('נאכאמאל דרוקן אויסלעשן פארבינדונג צו באשטעטיגן');return;}await api('/connect/unlink',{method:'POST',body:'{}',headers:{'Content-Type':'application/json'}});state.confirmUnlink=false;state.connectCode='';await refresh();return;}
  if(a==='claim-lead'){await api('/team/contacts/'+btn.dataset.id+'/claim',{method:'POST',body:'{}',headers:{'Content-Type':'application/json'}});await refresh();return;}
  if(a==='release-lead'){await api('/team/contacts/'+btn.dataset.id+'/release',{method:'POST',body:'{}',headers:{'Content-Type':'application/json'}});await refresh();return;}
  if(a==='video-revoke'){
    const kind=btn.dataset.kind;
    const roomId=kind==='floor'?state.joinedRoomId:kind==='conference'?state.conferenceId:null;
    if(!roomId||!btn.dataset.subject)throw new Error('קלייב א מיטגליד און צימער');
    await api('/video/'+kind+'/'+roomId+'/allow/'+encodeURIComponent(btn.dataset.subject),
      {method:'PATCH',body:JSON.stringify({allowed:false})});
    await refresh();return;
  }
  if(a==='video-watch'){
    const kind=btn.dataset.kind,roomId=btn.dataset.id;
    if(!['conference','floor'].includes(kind)||!roomId)throw new Error('דער ווידעא־צימער פעלט');
    const allowed=await api('/video/'+kind+'/'+roomId+'/watch');
    await watchOptionalVideo(allowed.url,kind,roomId);
    return;
  }
  if(a==='conference-home'){state.tab='conference';await refresh();return;}
  if(a==='conference-select'){
    state.conferenceId=btn.dataset.id;state.conferenceCode='';state.tab='conference';
    await refresh();return;
  }
  if(a==='conference-refresh'){await refresh();return;}
  if(a==='rtc-speak'||a==='rtc-listen'){
    if(!state.experimentalAudioEnabled||!state.conferenceId||!state.subject)throw new Error('דער קליינער מייקראפאן־פרואוו איז נאך נישט ערלויבט');
    const mode=a==='rtc-speak'?'speaker':'listener';
    await startSmallAudio({roomId:state.conferenceId,mode,subject:state.subject,api});
    draw();return;
  }
  if(a==='rtc-stop'){await stopSmallAudio();draw();return;}
  if(a==='conference-hand'||a==='conference-leave'){
    if(a==='conference-leave')await stopSmallAudio();
    const cmd=a==='conference-hand'?'/hand':'/leave';
    const raised=!state.conferenceSnapshot?.you?.handRaised;
    await api('/conferences/'+state.conferenceId+cmd,{method:'POST',
      body:JSON.stringify(a==='conference-hand'?{raised}:{})});
    await refresh();return;
  }
  if(a.startsWith('conference-')&&['admit','remove','ban','restore','mute','unmute','grant','revoke'].includes(a.slice(11))){
    const action=a.slice(11);
    if(['ban','remove'].includes(action)&&!confirm('זיכער? דער מענטש וועט ווערן ארויסגענומען פונעם אסיפה־צימער.'))return;
    await api('/conferences/'+state.conferenceId+'/moderate/'+encodeURIComponent(btn.dataset.subject),
     {method:'POST',body:JSON.stringify({action})});
    await refresh();return;
  }
  if(a==='event-refresh'){await refresh();return;}
  if(a==='event-check-in'||a==='event-check-out'){
    if(!state.joinedRoomId)throw new Error('קודם גיי אריין אין דעם קאמפיין־זאל');
    await api('/floor-program/'+state.joinedRoomId+(a==='event-check-in'?'/check-in':'/check-out'),{method:'POST',body:'{}'});
    await refresh();return;
  }
  if(a==='program-lunch-preset'){
    const form=document.querySelector('form[data-form="program-add"]');
    if(!form)throw new Error('קודם גיי אריין אינעם קאמפיין־זאל');
    const today=new Date(),lunch=new Date();
    lunch.setHours(13,30,0,0);
    if(lunch<today)lunch.setDate(lunch.getDate()+1);
    const end=new Date(lunch.getTime()+30*60000);
    const localInput=v=>v.getFullYear()+'-'+String(v.getMonth()+1).padStart(2,'0')+'-'+String(v.getDate()).padStart(2,'0')+'T'+String(v.getHours()).padStart(2,'0')+':'+String(v.getMinutes()).padStart(2,'0');
    form.elements.title.value='לאנטש און דברי חיזוק';
    form.elements.segmentType.value='lunch';
    form.elements.scheduledStart.value=localInput(lunch);
    form.elements.scheduledEnd.value=localInput(end);
    form.elements.description.value='א האלבע שעה הפסקה פון די רופן, מיט א פראגראם פון דברי חיזוק און אנווייזונגען.';
    form.elements.speaker.focus();
    return;
  }
  if(a==='program-start'||a==='program-complete'||a==='program-cancel'){
    const status=a==='program-start'?'live':a==='program-complete'?'completed':'cancelled';
    await api('/floor-program/'+state.joinedRoomId+'/programs/'+encodeURIComponent(btn.dataset.id)+'/status',{method:'POST',body:JSON.stringify({status})});
    await refresh();return;
  }
  if(a==='help-open'){
    state.selectedHelpId=btn.dataset.id;
    const r=await api('/floor/'+state.joinedRoomId+'/help/'+state.selectedHelpId+'/messages');
    state.helpMessages=r.messages||[];
    draw();return;
  }
  if(a==='help-progress'||a==='help-resolve'){
    const status=a==='help-progress'?'in_progress':'resolved';
    await api('/floor/'+state.joinedRoomId+'/help/'+encodeURIComponent(btn.dataset.id),{method:'PATCH',body:JSON.stringify({status})});
    await refresh();return;
  }
  if(a==='hall-refresh'){await refresh();return;}
  if(a==='hall-open'||a==='hall-pause'||a==='hall-end'){
    const status=a==='hall-open'?'open':a==='hall-pause'?'paused':'ended';
    await api('/rooms/'+btn.dataset.id+'/status',{method:'PATCH',body:JSON.stringify({status})});
    if(status==='ended'&&state.joinedRoomId===btn.dataset.id)state.joinedRoomId=null;
    await refresh();return;
  }
  if(a==='hall-join'){
    await api('/rooms/'+btn.dataset.id+'/join',{method:'POST',body:'{}',headers:{'Content-Type':'application/json'}});
    state.joinedRoomId=btn.dataset.id;await refresh();return;
  }
  if(a==='hall-leave'){
    await api('/rooms/'+btn.dataset.id+'/leave',{method:'POST',body:'{}',headers:{'Content-Type':'application/json'}});
    state.joinedRoomId=null;await refresh();return;
  }
  if(a==='calls'){const c=state.contacts.find(x=>x.id===btn.dataset.id);const calls=await api('/contacts/'+btn.dataset.id+'/calls');say((c?.display_name||'')+' — '+(calls.length?calls.map(x=>x.outcome+' '+x.created_at.slice(0,10)).join(' | '):'נאך קיין רופן'));return;}
  if(a==='org-select'){return;}
  if(a==='campaign-select'){return;}
 }catch(error){say(error.message);}
}
document.addEventListener('submit',submit);
document.addEventListener('click',click);
document.addEventListener('change',async e=>{
 try {
  if(e.target?.dataset?.action==='org-select'){state.orgId=e.target.value;state.campaignId=null;state.sharedFocusTeam='';state.sharedFocusQuery='';state.sharedFocus=null;state.sharedFocusCandidates=null;state.goalHistoryId=null;state.goalHistoryData=null;state.goalHistoryError='';state.goalHistoryPage=1;state.goalsPage=1;state.goalsMeta=null;state.plusCreditPage=1;state.plusCreditMeta=null;state.plusCredits=[];state.customRoleData=null;state.customRoleError='';state.customWorkflowEventsId=null;state.customWorkflowEvents=[];state.customWorkflowData=null;state.customWorkflowTemplates=null;state.proContactId=null;state.proSelected=null;state.proGuidanceId=null;state.proGuidanceMessages=[];state.gabbaiHandoffId=null;state.gabbaiHandoffEvents=[];state.proQuery='';state.joinedRoomId=null;state.showCampaignForm=false;state.invitationCode='';state.connectCode='';state.csvPage=1;state.importRows=null;state.importPreview=null;await refresh();}
  if(e.target?.dataset?.action==='campaign-select'){state.campaignId=e.target.value;state.sharedFocusTeam='';state.sharedFocusQuery='';state.sharedFocus=null;state.sharedFocusCandidates=null;state.goalHistoryId=null;state.goalHistoryData=null;state.goalHistoryError='';state.goalHistoryPage=1;state.goalsPage=1;state.goalsMeta=null;state.plusCreditPage=1;state.plusCreditMeta=null;state.plusCredits=[];state.customWorkflowEventsId=null;state.customWorkflowEvents=[];state.customWorkflowData=null;state.customWorkflowTemplates=null;state.csvPage=1;state.joinedRoomId=null;state.proContactId=null;state.proSelected=null;state.proGuidanceId=null;state.proGuidanceMessages=[];state.gabbaiHandoffId=null;state.gabbaiHandoffEvents=[];state.proQuery='';await refresh();}
  if(e.target?.dataset?.action==='shared-focus-team'){
    state.sharedFocusTeam=e.target.value;state.sharedFocusQuery='';
    state.sharedFocus=null;state.sharedFocusCandidates=null;await refresh();
  }
  if(e.target?.dataset?.action==='plus-days'){state.plusDays=Number(e.target.value);await refresh();}
  if(e.target?.dataset?.action==='gabbai-days'){state.gabbaiDays=Number(e.target.value);await refresh();}
 }catch(error){say(error.message);}
});
async function boot(){
 try{
  const configResponse=await fetch('/api/config',{cache:'no-store'});
  if(!configResponse.ok)throw new Error('די Login־קאנפיגוראציע איז נישט צוטריטבאר: HTTP '+configResponse.status);
  const cfg=await configResponse.json();
  if(!cfg.neonAuthUrl)throw new Error('Neon Auth איז נאכנישט קאנפיגורירט');
  state.experimentalAudioEnabled=cfg.experimentalAudioEnabled===true;
  state.gavhahPublicUrl=typeof cfg.gavhahPublicUrl==='string'?cfg.gavhahPublicUrl:'';
  if(!cfg.ready){$('#app').innerHTML='<main class="auth-wrap"><section class="card"><h1>גבהה קאמפיין סענטער</h1><p>דער Render־סערוויס איז צוגעגרייט. פארן אמתן ארבעטן דארף מען נאך אריינלייגן די געהיימע Neon DATABASE_URL אין Render Environment.</p><p class="muted">קיין דאטן זענען נישט אריבערגעפירט געווארן און קיין קאמפיין איז נאך נישט פארעפנטליכט.</p></section></main>';return;}
  state.auth=createAuthClient(cfg.neonAuthUrl);
  const s=await state.auth.getSession();
  state.user=s.data?.user||null;
  if(state.user)await refresh();else draw();
 }catch(error){$('#app').textContent='סיסטעם־פארבינדונג: '+error.message;}
}
boot();
// Heartbeat is sent only while the participant is viewing the page.
// The count is not fake attendance: backend expires stale participants after 45 seconds.
setInterval(async()=>{
 if(!state.joinedRoomId||!state.user||document.visibilityState!=='visible')return;
 try{await api('/rooms/'+state.joinedRoomId+'/heartbeat',{
  method:'POST',body:'{}',headers:{'Content-Type':'application/json'}
 });}
 catch{state.joinedRoomId=null;state.hallAnnouncements=[];}
},30000);
// Attendance for Hitkabtzu must be based on real heartbeat, not a one-time join.
// Including waiting participants makes manager admissions accurate. User may
// leave at any time; a background tab is not counted as continuously present.
setInterval(async()=>{
 if(!state.user||!state.conferenceId||state.tab!=='conference'||document.visibilityState!=='visible')return;
 const id=state.conferenceId;
 if(!state.conferenceSnapshot?.you?.joined)return;
 try{
  await api('/conferences/'+id+'/heartbeat',{method:'POST',body:'{}'});
 }catch{
  if(id===state.conferenceId)state.conferenceSnapshot=null;
 }
},20000);
// Only refresh an open event hall while visible. All totals are authoritative
// server figures. The browser does not simulate progress or dial calls.
setInterval(async()=>{
 if(!state.user||!state.joinedRoomId||state.tab!=='hall'||document.visibilityState!=='visible')return;
 try{
  const roomId=state.joinedRoomId;
  const [board,program,messages,leads]=await Promise.all([
   api('/floor/'+roomId+'/board'),api('/floor-program/'+roomId+'/schedule'),
   api('/rooms/'+roomId+'/announcements'),
   state.campaignId?api('/team/campaigns/'+state.campaignId+'/lead-queue').catch(()=>[]):Promise.resolve([])
  ]);
  if(roomId!==state.joinedRoomId||state.tab!=='hall')return;
  state.floorBoard=board;state.floorProgram=program;state.hallAnnouncements=messages;state.leads=leads;
  if(state.selectedHelpId){
   const thread=await api('/floor/'+roomId+'/help/'+state.selectedHelpId+'/messages').catch(()=>null);
   if(thread)state.helpMessages=thread.messages||[];
  }
  const playing=Array.from(document.querySelectorAll('#app audio')).some(a=>!a.paused);
  if(playing){
    // Keep audio element mounted while updating live figures.
    const vals={mode:({calling:'מען רופט מענטשן',program:'לייוו פראגראם',break:'הפסקה',ended:'פארענדיגט'})[program.mode]||program.mode,
      attendance:program.attendance?.checked_in||0,calls:board.totals?.calls?.reported||0,
      net:money(board.totals?.financial?.manually_reported_net)};
    for(const [key,val] of Object.entries(vals)){
      const el=document.querySelector('[data-live-metric="'+key+'"]');if(el)el.textContent=String(val);
    }
  }else if(!document.activeElement?.matches?.('input,textarea,select'))draw();
 }catch(e){console.warn('Temporary live hall refresh failed');}
},7500);

setInterval(async()=>{
 if(!state.user||!state.conferenceId||state.tab!=='conference'||document.visibilityState!=='visible')return;
 try{
  const id=state.conferenceId;
  const snapshot=await api('/conferences/'+id+'/snapshot');
  if(id!==state.conferenceId||state.tab!=='conference')return;
  state.conferenceSnapshot=snapshot;
  // Streaming HTML5 audio must not restart every 8.5s.
  const playing=Array.from(document.querySelectorAll('#app audio')).some(a=>!a.paused);
  if(!playing&&!document.activeElement?.matches?.('input,textarea,select'))draw();
 }catch(e){console.warn('Temporary conference refresh error');}
},8500);


// Video permission is revalidated while the app is open. Removing permission
// immediately hides the player on the next status poll. The EXTERNAL media
// provider must still enforce expiring signed URLs against copied links.
setInterval(async()=>{
 const current=watchedContext();
 if(!current||!state.user||document.visibilityState!=='visible')return;
 try{
  const status=await api('/video/'+current.kind+'/'+current.roomId+'/status');
  if(!status.allowed||!status.enabled){stopOptionalVideo();state.notice='דער ווידעא־שידור איז אויסגעלאשן אדער דיינע רעכטן האבן זיך געענדערט.';}
 }catch{stopOptionalVideo();}
},12000);
