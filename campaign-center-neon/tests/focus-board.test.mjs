import test from 'node:test';
import assert from 'node:assert/strict';
import {campaignFocusBoard} from '../src/focus-board.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const focus=(tasks,scope='personal')=>({
 allVisibleTasksConsidered:true,tasks,chosenScope:scope,visibleOpenTaskCount:273,
 ownOpenTaskCount:scope==='personal'?261:0,limit:3
});
test('daily campaign Focus trusts full backend selection, not the latest 200 task list',()=>{
 const html=campaignFocusBoard({subject:'me',tasks:[
  {id:'ignore-a',title:'Misleading newest task that is outside my view',status:'open',priority:'critical'}],
  quickFocus:focus([{id:'a',title:'My & urgent task',status:'open',priority:'critical',assignee_subject:'me',due_at:'2026-10-10T12:00:00Z',kind:'task'}])
 },esc);
 assert.match(html,/My &amp; urgent task/);
 assert.doesNotMatch(html,/Misleading newest/);
 assert.match(html,/סך־הכל ערלויבטע אפענע אויפגאבן: 273/);
 assert.match(html,/data-action="done"/);
});
test('empty focus and missing backend are distinctly labelled without invented action',()=>{
 const empty=campaignFocusBoard({quickFocus:focus([],'permitted_campaign_or_team')},esc);
 assert.match(empty,/דערווייל קיין אפענע אויפגאבן/);
 assert.doesNotMatch(empty,/data-action="done"/);
 const missing=campaignFocusBoard({tasks:[{id:'bad',title:'Old 200-item slice'}],
  quickFocus:null,quickFocusError:'<private>'},esc);
 assert.match(missing,/נישט באשטעטיגט פונעם סערווער/);
 assert.match(missing,/&lt;private&gt;/);
 assert.doesNotMatch(missing,/Old 200-item slice/);
 assert.doesNotMatch(missing,/data-action="done"/);
});
test('selected focus card title escaped and personal scope not confused with a team list',()=>{
 const html=campaignFocusBoard({quickFocus:focus([
  {id:'one',title:'<script>bad</script>',priority:'high',kind:'task'}
 ])},esc);
 assert.match(html,/דיינע אייגענע אפענע אויפגאבן/);
 assert.match(html,/&lt;script&gt;bad&lt;\/script&gt;/);
 assert.doesNotMatch(html,/<script>/);
});
