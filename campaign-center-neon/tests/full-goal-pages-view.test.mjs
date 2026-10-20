import test from 'node:test';
import assert from 'node:assert/strict';
import {goalsView} from '../src/goals-view.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const base={
 overview:{campaign:{role:'owner'}},goalsPage:2,goalsError:'',
 goals:[{id:'id1',title:'<script>invalid</script>',category:'calls',status:'at_risk',
 target_value:'100',current_value:'25',due_on:'2026-12-25',description:'Milestone'}],
 goalsMeta:{total:230,page:2,pageCount:5,limit:50,goalLimit:250}
};
test('Custom goal manager sees real approved goal quota, all-goal totals and second-page UI',()=>{
 const html=goalsView(base,esc);
 assert.match(html,/קאמפיין־צילן <span class="count">230/);
 assert.match(html,/פלאן־לימיט: 250/);
 assert.match(html,/data-action="goal-page" data-page="1"/);
 assert.match(html,/data-action="goal-page" data-page="3"/);
 assert.match(html,/זייט 2 פון 5/);
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;invalid&lt;\/script&gt;/);
});
test('Workers read own campaign goals but may not create or update them',()=>{
 const state={...base,overview:{campaign:{role:'askan'}}};
 const html=goalsView(state,esc);
 assert.doesNotMatch(html,/data-form="goal-update"/);
 assert.doesNotMatch(html,/data-form="goal"/);
 assert.match(html,/data-action="goal-page"/);
});
test('Missing goal backend never falsely claims complete list',()=>{
 const html=goalsView({...base,goalsMeta:null,goals:[],goalsError:'Cannot load <private>'},esc);
 assert.match(html,/דער סך־הכל ווערט ערשט באשטעטיגט/);
 assert.match(html,/Cannot load &lt;private&gt;/);
 assert.doesNotMatch(html,/<private>/);
});
