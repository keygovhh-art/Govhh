import test from 'node:test';
import assert from 'node:assert/strict';
import {gabbaiHandoffsView} from '../src/gabbai-handoffs-view.js';
const esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
 .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

test('Mobile shift handoff board has real assignment controls, search and usable task status actions',()=>{
 const model={
  subject:'staffA',gabbaiHandoffFilter:'active',gabbaiHandoffQuery:'',
  gabbaiHandoffs:{
   canAssign:true,counts:{pending:1,acknowledged:1,done:1},
   staff:[{subject:'staffA',team_name:'A'},{subject:'staffB',team_name:'B'}],
   handoffs:[
    {id:'one',title:'Urgent conference handoff',assigned_to:'staffA',priority:'critical',status:'pending',
     instructions:'Call tomorrow',created_at:'2026-10-18T12:00:00Z'},
    {id:'two',title:'Prepare the next shift',assigned_to:'staffB',priority:'normal',status:'acknowledged'},
    {id:'three',title:'Finished coordination',assigned_to:'staffA',priority:'high',status:'done'}
   ],
   history:[{handoff_id:'one',actor_subject:'boss',event_type:'created',recorded_at:'2026-10-18T12:00:00Z'}]
  }
 };
 let html=gabbaiHandoffsView(model,esc);
 assert.match(html,/אפעראציע־איבערגאבעס/);
 assert.match(html,/Urgent conference handoff/);
 assert.match(html,/Prepare the next shift/);
 assert.doesNotMatch(html,/Finished coordination/);
 assert.match(html,/data-form="gabbai-handoff-new"/);
 assert.match(html,/data-action="gabbai-handoff-ack"/);
 assert.match(html,/data-action="gabbai-handoff-complete"/);
 assert.match(html,/data-form="gabbai-handoff-search"/);
 model.gabbaiHandoffFilter='mine';
 html=gabbaiHandoffsView(model,esc);
 assert.match(html,/Urgent conference handoff/);
 assert.doesNotMatch(html,/Prepare the next shift/);
 model.gabbaiHandoffFilter='all';
 model.gabbaiHandoffQuery='finished';
 html=gabbaiHandoffsView(model,esc);
 assert.match(html,/Finished coordination/);
 assert.doesNotMatch(html,/Urgent conference handoff/);
 model.gabbaiHandoffQuery='';
 model.gabbaiHandoffs.canAssign=false;
 model.gabbaiHandoffs.staff=[];
 html=gabbaiHandoffsView(model,esc);
 assert.doesNotMatch(html,/data-form="gabbai-handoff-new"/);
});

test('Handoff user text is escaped, never included as HTML',()=>{
 const html=gabbaiHandoffsView({subject:'staffA',
  gabbaiHandoffs:{canAssign:false,staff:[],counts:{},
   handoffs:[{id:'x',title:'<img src=x onerror=alert(1)>',
    instructions:'<script>bad()</script>',assigned_to:'staffA',status:'pending',priority:'high'}],history:[]}
 },esc);
 assert.match(html,/&lt;img/);
 assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(html,/<script>/);
});
