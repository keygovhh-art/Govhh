import test from 'node:test';
import assert from 'node:assert/strict';
import {goalsView} from '../src/goals-view.js';

const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={
 overview:{campaign:{role:'manager'}},
 goals:[{id:'123',title:'<script>do not run</script>',status:'active',category:'calls',
  target_value:'100',current_value:'25.00',description:'Current',version:3}],
 goalsMeta:{goalLimit:20,total:1,page:1,pageCount:1},
 goalHistoryId:'123',goalHistoryData:{
  total:37,page:2,pageCount:2,history:[
   {actor_subject:'manager-2',event_kind:'updated',created_at:'2026-10-20T12:20:00Z',
    status:'at_risk',current_value:'42.00'},
   {actor_subject:'<img src=x>',event_kind:'created',created_at:'2026-10-19T12:00:00Z',
    status:'active',current_value:'0.00'}
  ]
 }
};
test('Leadership sees an auditable, paged goal history and a versioned mobile update',()=>{
 const html=goalsView(state,esc);
 assert.match(html,/data-form="goal-update"/);
 assert.match(html,/name="expectedVersion" value="3"/);
 assert.match(html,/data-action="goal-history"/);
 assert.match(html,/ציל־היסטאריע — ווער האט וואס געטון/);
 assert.match(html,/איינטראָגן סך־הכל: 37/);
 assert.match(html,/data-action="goal-history-page" data-page="1"/);
 assert.doesNotMatch(html,/<script>/);
 assert.doesNotMatch(html,/<img src=x>/);
 assert.match(html,/&lt;img src=x&gt;/);
 assert.match(html,/manager-2/);
});
test('Ordinary member cannot open manager audit or write current totals',()=>{
 const html=goalsView({...state,overview:{campaign:{role:'askan'}}},esc);
 assert.doesNotMatch(html,/data-form="goal-update"/);
 assert.doesNotMatch(html,/data-action="goal-history"/);
 assert.doesNotMatch(html,/ציל־היסטאריע — ווער האט וואס געטון/);
});
test('A failed audit request is escaped, never treated as successful or hidden',()=>{
 const html=goalsView({...state,goalHistoryData:null,goalHistoryError:'<private> no access'},esc);
 assert.match(html,/&lt;private&gt; no access/);
 assert.doesNotMatch(html,/<private>/);
});
