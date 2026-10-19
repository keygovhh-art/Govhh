import test from 'node:test';
import assert from 'node:assert/strict';
import {managementView} from '../src/management-view.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
const datum={
 total:6,matching:2,page:1,pageCount:2,
 counts:{planned:1,ready:0,in_progress:1,waiting:1,blocked:1,failed:1,successful:1,completed:0,cancelled:0},
 queueCounts:{all:6,mine:2,needs_action:4,overdue:1,due_soon:2,unassigned:3},
 signals:{overdue_tasks:4,open_tasks:12,blocked_handoffs:2,open_handoffs:7,
 pending_approvals:3,pending_decisions:1,overdue_plans:2},
 items:[
  {id:'plan-one',title:'<script>harm</script>',details:'Private',status:'blocked',priority:'high',progress:40,
   issue_reason:'Committee did not approve',waiting_on:'',next_action:'Arrange new meeting',
   assigned_to:'member123',campaign_title:'Charity round 1',version:3,
   due_at:'2026-01-01T00:00:00Z'},
  {id:'plan-two',title:'Fundraising milestone',status:'successful',priority:'normal',progress:100,
   version:1,completed_at:'2026-10-19T10:00:00Z'}
 ]
};
const state=()=>({management:datum,managementFilter:'all',managementQuery:'',
 managementQueue:'all',managementEditorId:null,managementHistoryId:null,managementHistory:null,
 managementError:'',campaigns:[{id:'campaign123',title:'Sample charity'}]});
test('Owner sees every outcome, real signals, human responsibilities and next steps',()=>{
 const html=managementView(state(),esc);
 for(const label of ['מענעדזשמענט','פארשפעטיגטע אויפגאבן','ווארט אויף ענטפער',
  'פארהינדערט','נישט מצליח','מצליח','פארענדיגט','וואס ווייטער?']){
  assert.ok(html.includes(label),label);
 }
 assert.match(html,/data-action="management-edit" data-id="plan-one"/);
 assert.match(html,/data-action="management-queue" data-value="mine"/);
 assert.match(html,/מיינע צוגעטיילטע פלענער \(2\)/);
 assert.match(html,/דארף באהאנדלונג \(4\)/);
 assert.match(html,/נישט צוגעטיילט \(3\)/);
 assert.match(html,/data-action="management-history" data-id="plan-one"/);
 assert.match(html,/data-action="management-page" data-page="2"/);
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;harm&lt;\/script&gt;/);
});
test('Mobile forms edit a human plan and show accurate stored history',()=>{
 const s=state();s.managementEditorId='plan-one';s.managementHistoryId='plan-one';
 s.managementHistory={page:1,pageCount:1,history:[{event_kind:'updated',actor_subject:'manager',
  after_state:{status:'failed',progress:70,next_action:'Try alternatives'},
  note:'Attempt was unsuccessful',recorded_at:'2026-10-19T10:00:00Z'}]};
 const html=managementView(s,esc);
 assert.match(html,/data-form="management-save"/);
 assert.match(html,/name="progress"/);
 assert.match(html,/name="waitingOn"/);
 assert.match(html,/name="issueReason"/);
 assert.match(html,/name="nextAction"/);
 assert.match(html,/Try alternatives/);
 assert.match(html,/Attempt was unsuccessful/);
 assert.match(html,/name="campaignId"/);
});
