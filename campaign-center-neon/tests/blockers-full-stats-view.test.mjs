import test from 'node:test';
import assert from 'node:assert/strict';
import {proBlockersView} from '../src/pro-blockers-view.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const data={
 proBlockerPage:1,proBlockerFilter:'all',proBlockerQuery:'<secret>',
 proBlockerCandidates:{candidates:[{id:'new',title:'<script>risk</script>',assignee_subject:'me'}]},
 proBlockers:{allVisibleBlockersCounted:true,total:258,activeTotal:257,inactiveTotal:1,
  filteredTotal:258,blockers:[{task_id:'abc',title:'Question <private>',
   reason:'approval_needed',status:'open',is_active:true,updated_at:'2026-10-20T09:00Z',details:''}],
  activeByReason:{approval_needed:47,payment_pending:1},
  changesLast30Days:{raised:85,resolved:42,reopened:3,changed:10},
  page:1,pageCount:6}
};
test('Full Askan Pro blocker picture is visible on phone without fake 200-row totals',()=>{
 const html=proBlockersView(data,esc);
 assert.match(html,/באריכטעטע שטערונגען/);
 assert.match(html,/258/);
 assert.match(html,/257/);
 assert.match(html,/42/);
 assert.match(html,/זייט 1 פון 6/);
 assert.match(html,/data-action="pro-blocker-page" data-page="2"/);
 assert.match(html,/data-action="pro-blocker-filter" data-value="active"/);
 assert.match(html,/data-form="pro-blocker-search"/);
 assert.match(html,/data-form="pro-blocker"/);
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;risk&lt;\/script&gt;/);
 assert.match(html,/&lt;secret&gt;/);
 assert.match(html,/&lt;private&gt;/);
});
test('Failure to read all blockers is not mislabeled as zero reports',()=>{
 const html=proBlockersView({...data,proBlockers:null,proBlockersError:'<hidden> gateway'},esc);
 assert.match(html,/נישט באשטעטיגט פונעם סערווער/);
 assert.doesNotMatch(html,/קיינע באריכטעטע אקטיווע שטערונגען/);
 assert.match(html,/&lt;hidden&gt; gateway/);
});
test('Filtered last-page display distinguishes global and local page totals',()=>{
 const s={...data,proBlockerFilter:'inactive',proBlockers:{
  ...data.proBlockers,page:2,pageCount:2,filteredTotal:55,
  blockers:[{task_id:'1',title:'Old blocker',is_active:false,reason:'other',status:'done'}]
 }};
 const html=proBlockersView(s,esc);
 assert.match(html,/צוגעפאסטע רעקארדס: 55/);
 assert.match(html,/געוויזן: 1/);
 assert.match(html,/data-action="pro-blocker-page" data-page="1"/);
 assert.doesNotMatch(html,/data-action="pro-blocker-resolve"/);
});
