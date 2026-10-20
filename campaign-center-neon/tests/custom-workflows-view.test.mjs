import test from 'node:test';
import assert from 'node:assert/strict';
import {customWorkflowsView} from '../src/custom-workflows-view.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const owner=()=>({
 orgId:'org1',subject:'owner1',orgs:[{id:'org1',role:'owner'}],
 customWorkflowData:{runs:[{id:'run1',title:'<script>x</script>',status:'open',
  assigned_to:'worker1',step_titles:['Call chairman','Collect answer'],next_step:0,version:1}],
  counts:{open:1,blocked:0,completed:0},limit:100},
 customWorkflowTemplates:{templates:[{id:'tpl1',title:'Committee process',
  step_titles:['Call chairman','Collect answer']}]}
});
test('Human workflow manager can create a custom sequence and sees escaped active task',()=>{
 const html=customWorkflowsView(owner(),esc);
 assert.match(html,/data-form="custom-workflow-template"/);
 assert.match(html,/data-form="custom-workflow-run"/);
 assert.match(html,/data-form="custom-workflow-block"/);
 assert.match(html,/data-action="custom-workflow-progress" data-id="run1"/);
 assert.match(html,/קומענדיגער שריט/);
 assert.match(html,/Call chairman/);
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;x&lt;\/script&gt;/);
 assert.match(html,/טעלעפאן־אקטיוויטעט/);
});
test('Assigned worker cannot see leader-only template editor or other actions',()=>{
 const s=owner();
 s.subject='worker1';s.orgs[0].role='askan';
 let html=customWorkflowsView(s,esc);
 assert.doesNotMatch(html,/data-form="custom-workflow-template"/);
 assert.doesNotMatch(html,/data-form="custom-workflow-run"/);
 assert.doesNotMatch(html,/data-action="custom-workflow-archive"/);
 assert.match(html,/data-action="custom-workflow-progress"/);
 s.customWorkflowData.runs[0].status='blocked';
 s.customWorkflowData.runs[0].blocked_reason='<img src=x>';
 html=customWorkflowsView(s,esc);
 assert.match(html,/ווייטער ארבעטן/);
 assert.doesNotMatch(html,/<img src=x>/);
 assert.match(html,/&lt;img src=x&gt;/);
});
test('Archived templates cannot be used for new assigned workflows',()=>{
 const s=owner();
 s.customWorkflowTemplates.templates=[{...s.customWorkflowTemplates.templates[0],archived_at:'2026-10-20T10:00:00Z'}];
 const html=customWorkflowsView(s,esc);
 assert.match(html,/disabled/);
 assert.doesNotMatch(html,/data-action="custom-workflow-archive"/);
});
