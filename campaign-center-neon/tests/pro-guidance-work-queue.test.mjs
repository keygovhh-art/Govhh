import test from 'node:test';
import assert from 'node:assert/strict';
import {proGuidanceView} from '../src/pro-guidance-view.js';

const esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
 .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

test('Manager Guidance inbox has actionable open/answered/closed counters and filtering',()=>{
 const requests=[
  {id:'a',subject:'Urgent callback help',description:'Need more help',category:'calls',
   status:'open',created_by:'person1',created_at:'2026-10-16T10:00:00Z'},
  {id:'b',subject:'Answered appeal',description:'Response sent',category:'strategy',
   status:'answered',created_by:'person2',created_at:'2026-10-15T10:00:00Z'},
  {id:'c',subject:'Closed charity issue',description:'Finished',category:'fundraising',
   status:'closed',created_by:'person3',created_at:'2026-10-14T10:00:00Z'}
 ];
 const state={proGuidance:requests,proGuidanceFilter:'open',proGuidanceQuery:'',proGuidanceId:null,
  proGuidanceMessages:[],overview:{campaign:{role:'manager'}}};
 let html=proGuidanceView(state,esc);
 assert.match(html,/הנהלה — הילף־ארבעטס־אינבאקס/);
 assert.match(html,/Urgent callback help/);
 assert.doesNotMatch(html,/<strong>Answered appeal<\/strong>/);
 assert.doesNotMatch(html,/<strong>Closed charity issue<\/strong>/);
 assert.match(html,/data-action="pro-guidance-filter"/);
 assert.match(html,/data-form="pro-guidance-search"/);
 assert.match(html,/אפן \(1\)/);
 assert.match(html,/פארענטפערט \(1\)/);
 state.proGuidanceFilter='answered';
 html=proGuidanceView(state,esc);
 assert.match(html,/<strong>Answered appeal<\/strong>/);
 assert.doesNotMatch(html,/<strong>Urgent callback help<\/strong>/);
 state.proGuidanceFilter='all';state.proGuidanceQuery='charity';
 html=proGuidanceView(state,esc);
 assert.match(html,/<strong>Closed charity issue<\/strong>/);
 assert.doesNotMatch(html,/<strong>Answered appeal<\/strong>/);
 state.proGuidanceQuery='';
 state.subject='person2';state.proGuidanceFilter='mine';
 requests[1].assigned_to='person2';requests[1].status='answered';requests[1].response_due_at='2026-01-01T09:00:00Z';
 html=proGuidanceView(state,esc);
 assert.match(html,/מיינע באהאנדלונגען \(1\)/);
 assert.match(html,/Answered appeal/);
 assert.doesNotMatch(html,/<strong>Urgent callback help<\/strong>/);
 state.proGuidanceFilter='due';
 html=proGuidanceView(state,esc);
 assert.match(html,/איבערגעצויגענע ציל־צייטן \(1\)/);
 assert.match(html,/דער ציל־טערמין איז איבערגעצויגן/);
 state.proGuidanceQuery='';
 state.proGuidanceId='b';
 html=proGuidanceView(state,esc);
 assert.match(html,/Answered appeal/);
 assert.match(html,/פריוואטן שמועס/);
 assert.match(html,/data-form="pro-guidance-deadline"/);
 assert.match(html,/data-action="pro-guidance-release"/);
});
test('Guidance search and list always escape ticket contents',()=>{
 const html=proGuidanceView({
  proGuidance:[{id:'x',subject:'<script>alert(1)</script>',description:'<b>Private</b>',
   category:'other',status:'open',created_by:'foreign',created_at:'2026-10-18T12:00:00Z'}],
  proGuidanceFilter:'all',proGuidanceQuery:'',proGuidanceId:null,
  overview:{campaign:{role:'askan'}}
 },esc);
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/מיינע בקשות — נאכפאלג/);
 assert.doesNotMatch(html,/data-form="pro-guidance-deadline"/);
});
