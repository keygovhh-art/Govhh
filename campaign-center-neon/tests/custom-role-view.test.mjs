import test from 'node:test';
import assert from 'node:assert/strict';
import {customRoleView} from '../src/custom-role-view.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
test('Gabbai Pro owner sees permission fields and can select active non-leadership members',()=>{
 const state={orgId:'org',orgs:[{id:'org',role:'owner'}],
  members:[{subject:'workerA',role:'askan',membership_status:'active'},
   {subject:'owner',role:'owner',membership_status:'active'},
   {subject:'sleepy',role:'askan',membership_status:'suspended'}],
  customRoleData:{profiles:[{id:'profileA',title:'<No> lead export',
   can_view_lead_queue:true,can_claim_leads:false,can_export_shared_contacts:false}],
   assignments:[{subject:'workerA',profile_id:'profileA'}]}};
 const html=customRoleView(state,esc);
 assert.match(html,/data-form="custom-role-create"/);
 assert.match(html,/data-form="custom-role-assign"/);
 assert.match(html,/value="profileA" selected/);
 assert.match(html,/workerA/);
 assert.doesNotMatch(html,/sleepy/);
 assert.doesNotMatch(html,/<No>/);
 assert.match(html,/&lt;No&gt;/);
 assert.match(html,/קיין מנהל־ אדער באנק־רעכטן/);
});
test('Nonleaders cannot inspect role details and managers cannot edit',()=>{
 const state={orgId:'org',orgs:[{id:'org',role:'manager'}],
  members:[],customRoleData:{profiles:[],assignments:[]}};
 let html=customRoleView(state,esc);
 assert.match(html,/Gabbai Pro/);
 assert.doesNotMatch(html,/data-form="custom-role-create"/);
 state.orgs[0].role='askan';html=customRoleView(state,esc);
 assert.equal(html,'');
});
