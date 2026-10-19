import test from 'node:test';
import assert from 'node:assert/strict';
import {gabbaiHandoffsView} from '../src/gabbai-handoffs-view.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const item={id:'handoff-1',title:'Contact organizers',instructions:'Reach a responsible manager',
 assigned_to:'helper-1',created_by:'owner-1',status:'blocked',priority:'high',
 due_at:'2026-10-19T10:00:00Z'};
function state(){
 return {subject:'helper-1',gabbaiHandoffs:{handoffs:[item],stats:{blocked:1,open:0,in_progress:0,done:0},
 canCreate:false},gabbaiHandoffFilter:'blocked',gabbaiHandoffId:'handoff-1',
 gabbaiHandoffEvents:[{id:'event-1',actor_subject:'helper-1',kind:'status',
 status_to:'blocked',body:'Waiting for approval',created_at:'2026-10-19T01:00:00Z'}]};
}
test('Assigned worker sees the blocker and can resume, without manager creation rights',()=>{
 const s=state(),html=gabbaiHandoffsView(s,esc);
 assert.match(html,/פארהינדערט/);
 assert.match(html,/data-action="gabbai-handoff-filter" data-value="blocked"/);
 assert.match(html,/Waiting for approval/);
 assert.match(html,/data-action="gabbai-handoff-status" data-id="handoff-1" data-status="in_progress"/);
 assert.doesNotMatch(html,/data-form="gabbai-handoff-blocked"/);
 assert.doesNotMatch(html,/data-form="gabbai-handoff-new"/);
});
test('Workers report blockers with a required explanation, and notes remain escaped',()=>{
 const s=state();s.gabbaiHandoffs.handoffs=[{...item,status:'in_progress',
 title:'<script>alert(1)</script>'}];
 s.gabbaiHandoffEvents=[{id:'event-1',actor_subject:'helper-1',kind:'comment',
 body:'<img src=x onerror=1>',created_at:'2026-10-19T01:00:00Z'}];
 const html=gabbaiHandoffsView(s,esc);
 assert.match(html,/data-form="gabbai-handoff-blocked"/);
 assert.match(html,/name="note" rows="3" required maxlength="1500"/);
 assert.doesNotMatch(html,/<script>|<img src=x/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/&lt;img src=x onerror=1&gt;/);
});
