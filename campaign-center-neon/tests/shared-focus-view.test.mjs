import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedFocusView} from '../src/shared-focus-view.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={
 campaignId:'campaign',subject:'owner',
 overview:{campaign:{role:'owner'}},
 sharedFocusTeam:'A',
 sharedFocus:{
  version:2,team:'A',editable:true,availableTeams:['A','B'],
  tasks:[{id:'1',title:'<script>fake</script>',priority:'high',assignee_subject:'worker'}],
  history:[{actor_subject:'manager',version:2,created_at:'2026-10-20T08:00Z',
   previous_count:2,new_count:1}]
 },
 sharedFocusCandidates:{candidates:[{id:'2',title:'Phone donors',assignee_subject:'worker'}]},
 sharedFocusQuery:'<private>'
};
test('Yiddish phone manager selects actual permitted tasks, team and historical changes',()=>{
 const html=sharedFocusView(state,esc);
 assert.match(html,/data-form="shared-focus-search"/);
 assert.match(html,/data-form="shared-focus-save"/);
 assert.match(html,/data-action="shared-focus-team"/);
 assert.equal((html.match(/name="focusTaskId"/g)||[]).length,3);
 assert.match(html,/value="1" selected/);
 assert.match(html,/value="2"/);
 assert.match(html,/ווערסיע 2/);
 assert.match(html,/manager/);
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;fake&lt;\/script&gt;/);
 assert.match(html,/&lt;private&gt;/);
});
test('Worker can read only server-visible tasks and sees no edit/search/team selector or audit',()=>{
 const worker={...state,overview:{campaign:{role:'askan'}},
  sharedFocus:{version:2,team:'A',editable:false,tasks:[{id:'1',title:'My campaign work',
   assignee_subject:'worker'}]}};
 const html=sharedFocusView(worker,esc);
 assert.match(html,/My campaign work/);
 assert.doesNotMatch(html,/shared-focus-save/);
 assert.doesNotMatch(html,/shared-focus-team/);
 assert.doesNotMatch(html,/manager/);
 assert.doesNotMatch(html,/Phone donors/);
});
test('Unavailable server never pretends the team board is verified',()=>{
 const html=sharedFocusView({...state,sharedFocus:null,sharedFocusError:'<private> timeout'},esc);
 assert.match(html,/נישט באשטעטיגט פונעם סערווער/);
 assert.match(html,/&lt;private&gt; timeout/);
 assert.doesNotMatch(html,/<private>/);
});
