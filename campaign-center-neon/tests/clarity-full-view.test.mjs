import test from 'node:test';
import assert from 'node:assert/strict';
import {proCrmView} from '../src/pro-crm-view.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={overview:{campaign:{role:'askan'}},proContacts:[],proRecommendations:[
 {source:'task',id:'one',title:'Do <script>not run</script>',priority:'high',status:'open',dueAt:null},
 {source:'crm_followup',id:'two',title:'My followup',priority:'high',dueAt:null}],
 proClarity:{allEligibleActionsConsidered:true,eligibleTotal:382,limit:5},proNextAction:null};
test('Clarity mobile report distinguishes five from all 382 authorized tasks',()=>{
 const html=proCrmView(state,esc);
 assert.match(html,/ערלויבטע אפענע שריט אינגאנצן: 382/);
 assert.match(html,/געוויזן ביז 5 וויכטיגסטע/);
 assert.match(html,/&lt;script&gt;not run&lt;\/script&gt;/);
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/My followup/);
 assert.match(html,/קיין AI־השערות/);
});
test('Failed Clarity endpoint never falsely says no work',()=>{
 const html=proCrmView({...state,proClarity:null,proRecommendations:[],
  proClarityError:'<private> unavailable'},esc);
 assert.match(html,/דער פולער Clarity־באריכט איז נישט באשטעטיגט/);
 assert.match(html,/&lt;private&gt; unavailable/);
 assert.doesNotMatch(html,/איצט זענען נישט דא קיין בארעכטיגטע אפענע שריט/);
 assert.doesNotMatch(html,/<private>/);
});
test('Verified true zero-work screen is different from incomplete response',()=>{
 const html=proCrmView({...state,proClarity:{...state.proClarity,eligibleTotal:0},
  proRecommendations:[]},esc);
 assert.match(html,/ערלויבטע אפענע שריט אינגאנצן: 0/);
 assert.match(html,/איצט זענען נישט דא קיין בארעכטיגטע אפענע שריט/);
});
