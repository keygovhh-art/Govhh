import test from 'node:test';
import assert from 'node:assert/strict';
import {proSprintsView} from '../src/pro-sprints-view.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={
 proSprints:[{id:'s1',title:'<script>history</script>',starts_on:'2026-10-15',
  status:'archived',steps:[]}],
 proSprintsMeta:{allPrivateSprintsCounted:true,total:23,page:2,pageCount:3,limit:10},
 proHistory:[{id:'h1',sprint_title:'Private task',recorded_at:'2026-10-20T12:00:00Z',event_type:'created'}],
 proHistoryMeta:{allPrivateEventsCounted:true,total:230,page:4,pageCount:5,limit:50}
};
test('Mobile Sprint history shows both exact totals and previous/next navigation',()=>{
 const html=proSprintsView(state,esc);
 assert.match(html,/Sprint־פלענער: 23/);
 assert.match(html,/געשעענישן: 230/);
 assert.match(html,/data-action="pro-sprints-page" data-page="1"/);
 assert.match(html,/data-action="pro-sprints-page" data-page="3"/);
 assert.match(html,/data-action="pro-memory-page" data-page="3"/);
 assert.match(html,/data-action="pro-memory-page" data-page="5"/);
 assert.match(html,/&lt;script&gt;history&lt;\/script&gt;/);
 assert.doesNotMatch(html,/<script>/);
});
test('History service failure stays visible, never called a verified zero-event record',()=>{
 const html=proSprintsView({...state,proHistory:[],proHistoryMeta:null,
  proHistoryError:'<private> backend'},esc);
 assert.match(html,/פולע 30־טאגיקע היסטאריע איז נישט באשטעטיגט/);
 assert.match(html,/&lt;private&gt; backend/);
 assert.doesNotMatch(html,/נאך קיין Focus־געשיכטע/);
});
test('A genuine zero history is explicitly different from a backend error',()=>{
 const html=proSprintsView({...state,proHistory:[],
  proHistoryMeta:{allPrivateEventsCounted:true,total:0,page:1,pageCount:1}},esc);
 assert.match(html,/געשעענישן: 0/);
 assert.match(html,/נאך קיין Focus־געשיכטע/);
});
