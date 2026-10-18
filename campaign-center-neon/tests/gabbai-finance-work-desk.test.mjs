import test from 'node:test';
import assert from 'node:assert/strict';
import {gabbaiApprovalsView} from '../src/gabbai-approvals-view.js';
const esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const money=x=>'$'+Number(x).toFixed(2);
test('Gabbai Pro finance dashboard lets reviewer instantly find their pending financial decisions',()=>{
 const approvals=[
  {id:'a',subject:'Order dinner',amount:'35.50',category:'planned_expense',status:'pending',requested_by:'finance'},
  {id:'b',subject:'Owner equipment',amount:'20.00',category:'other',status:'pending',requested_by:'owner'},
  {id:'c',subject:'Done',amount:'100',category:'refund_review',status:'approved',requested_by:'finance'},
  {id:'d',subject:'Declined',amount:'10',category:'other',status:'rejected',requested_by:'owner'}
 ];
 const state={gabbaiRole:'owner',subject:'owner',gabbaiApprovals:approvals,gabbaiSummary:{
  total:4,pending:2,approved:1,rejected:1,reviewable_count:1,my_pending:1,
  pending_amount:'55.50',reviewable_amount:'35.50'},
  gabbaiFilter:'actionable',gabbaiQuery:'',gabbaiDays:30,gabbaiPriorities:null,gabbaiLedger:null};
 let html=gabbaiApprovalsView(state,esc,money);
 assert.match(html,/היינטיגע פינאנציעלע באשלוסן/);
 assert.match(html,/\$55\.50/);
 assert.match(html,/data-action="gabbai-filter"/);
 assert.match(html,/Order dinner/);
 assert.doesNotMatch(html,/<strong>Owner equipment/);
 assert.equal((html.match(/data-form="gabbai-decision"/g)||[]).length,1,
  'Only the other writer request offers a decision form');
 state.gabbaiFilter='mine';html=gabbaiApprovalsView(state,esc,money);
 assert.match(html,/Owner equipment/);
 assert.doesNotMatch(html,/<strong>Order dinner/);
 assert.equal((html.match(/data-form="gabbai-decision"/g)||[]).length,0);
 state.gabbaiFilter='all';state.gabbaiQuery='dinner';html=gabbaiApprovalsView(state,esc,money);
 assert.match(html,/Order dinner/);
 assert.doesNotMatch(html,/<strong>Owner equipment/);
 state.gabbaiQuery='';
 state.gabbaiRole='owner';
 state.gabbaiFilter='approved';
 approvals[2].decision_reason='Reviewed by another manager';
 html=gabbaiApprovalsView(state,esc,money);
 assert.match(html,/Reviewed by another manager/);
 state.gabbaiQuery='';
 state.gabbaiRole='finance';state.gabbaiFilter='pending';html=gabbaiApprovalsView(state,esc,money);
 assert.doesNotMatch(html,/פאר מיין באשלוס<\/button>/);
 assert.equal((html.match(/data-form="gabbai-decision"/g)||[]).length,0);
});
test('Gabbai financial user input remains escaped',()=>{
 const html=gabbaiApprovalsView({subject:'owner',gabbaiRole:'owner',gabbaiDays:30,
  gabbaiApprovals:[{id:'z',subject:'<script>hi</script>',amount:'1.00',status:'pending',
   requested_by:'other',category:'other',explanation:'<img src=x>'}],
  gabbaiSummary:{pending:1,pending_amount:'1.00'},gabbaiFilter:'all',gabbaiQuery:'',
  gabbaiLedger:null,gabbaiPriorities:null},esc,money);
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/&lt;img src=x&gt;/);
});
