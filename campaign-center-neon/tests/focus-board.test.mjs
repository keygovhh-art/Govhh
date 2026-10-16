import test from 'node:test';
import assert from 'node:assert/strict';
import {campaignFocusBoard} from '../src/focus-board.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
test('daily campaign Focus lists only authorized server tasks and favors this member',()=>{
 const html=campaignFocusBoard({subject:'me',tasks:[
  {id:'a',title:'My & urgent task',status:'open',priority:'critical',assignee_subject:'me',due_at:'2026-10-10T12:00:00Z',kind:'task'},
  {id:'b',title:'A team private item not assigned to me',status:'open',priority:'critical',assignee_subject:'other',kind:'followup'},
  {id:'c',title:'My finished task',status:'done',priority:'critical',assignee_subject:'me',kind:'task'},
 ]},esc);
 assert.match(html,/My &amp; urgent task/);
 assert.ok(!html.includes('not assigned to me'));
 assert.ok(!html.includes('finished task'));
 assert.match(html,/data-action="done"/);
});
test('no invented actions on an empty campaign',()=>{
 const html=campaignFocusBoard({subject:'owner',tasks:[]},esc);
 assert.match(html,/נאך קיין אפענע אויפגאבן/);
 assert.doesNotMatch(html,/data-action="done"/);
});
