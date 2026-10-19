import test from 'node:test';
import assert from 'node:assert/strict';
import {gabbaiWorkloadView} from '../src/gabbai-workload-view.js';

const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const members=[
 {subject:'ask1',team_name:'Rufers',role:'askan',open_tasks:2,overdue_tasks:1,
  due_soon_tasks:0,open_handoffs:1,overdue_handoffs:1},
 {subject:'ask2',team_name:'Available group',role:'askan',open_tasks:0,overdue_tasks:0,
  due_soon_tasks:0,open_handoffs:0,overdue_handoffs:0},
 {subject:'ask3',team_name:'Donor calls',role:'askan',open_tasks:1,overdue_tasks:0,
  due_soon_tasks:1,open_handoffs:0,overdue_handoffs:0}
];
const state=()=>({gabbaiRole:'manager',gabbaiWorkload:{members,teams:[
 {team_name:'Rufers',members:1,open_tasks:2,overdue_tasks:1,due_soon_tasks:0,open_handoffs:1,overdue_handoffs:1},
 {team_name:'Donor calls',members:1,open_tasks:1,overdue_tasks:0,due_soon_tasks:1,open_handoffs:0,overdue_handoffs:0},
 {team_name:'Available group',members:704,open_tasks:0,overdue_tasks:0,due_soon_tasks:0,open_handoffs:0,overdue_handoffs:0}],totalMembers:706,truncated:true,
 totals:{openTasks:3,overdueTasks:1,dueSoonTasks:1,openHandoffs:1,overdueHandoffs:1},
 limit:500},gabbaiWorkloadFilter:'all',gabbaiWorkloadQuery:'',gabbaiWorkloadTeam:''});

test('Manager can see actual staffing counts and choose overdue or unassigned members',()=>{
 const s=state();
 let html=gabbaiWorkloadView(s,esc);
 assert.match(html,/Gabbai Pro — אויפגאבן־לאסט פער עסקן/);
 assert.match(html,/פארשפעטיגט \(1\)/);
 assert.match(html,/קיין צוגעטיילטע ארבעט \(1\)/);
 assert.match(html,/טערמין אין 48 שעה \(1\)/);
 assert.match(html,/data-form="gabbai-workload-search"/);
 assert.match(html,/data-action="gabbai-workload-assign" data-subject="ask1"/);
 assert.match(html,/גרופעס וואס דארפן אויפמערקזאמקייט/);
 assert.match(html,/data-form="gabbai-workload-team"/);
 assert.match(html,/data-action="gabbai-workload-team" data-team="Rufers"/);
 assert.match(html,/סך הכל 706/);
 assert.match(html,/די יעצטיגע פילטערס ארבעטן אויף די אריינגעלאדענע קארטלעך/);
 s.gabbaiWorkloadTeam='Available group';
 html=gabbaiWorkloadView(s,esc);
 assert.match(html,/<strong>ask2<\/strong>/);
 assert.doesNotMatch(html,/<strong>ask1<\/strong>/);
 s.gabbaiWorkloadTeam='';
 s.gabbaiWorkloadFilter='overdue';html=gabbaiWorkloadView(s,esc);
 assert.match(html,/<strong>ask1<\/strong>/);
 assert.doesNotMatch(html,/<strong>ask2<\/strong>/);
 assert.doesNotMatch(html,/<strong>ask3<\/strong>/);
 s.gabbaiWorkloadFilter='unassigned';html=gabbaiWorkloadView(s,esc);
 assert.match(html,/<strong>ask2<\/strong>/);
 assert.doesNotMatch(html,/<strong>ask1<\/strong>/);
 assert.match(html,/נישט בהכרח פריי/);
 s.gabbaiWorkloadFilter='soon';html=gabbaiWorkloadView(s,esc);
 assert.match(html,/<strong>ask3<\/strong>/);
 assert.doesNotMatch(html,/<strong>ask2<\/strong>/);
});
test('Server-backed Gabbai workload paging shows actual global matches',()=>{
 const s=state();
 s.gabbaiWorkload={
  ...s.gabbaiWorkload,members:[members[2]],serverFiltered:true,
  filterCounts:{all:706,overdue:1,soon:1,unassigned:704},
  matchingMembers:51,page:2,pageCount:3,hasNext:true,hasPrevious:true,limit:50
 };
 s.gabbaiWorkloadFilter='soon';
 s.gabbaiWorkloadQuery='Donor';
 let html=gabbaiWorkloadView(s,esc);
 assert.match(html,/אלע \(706\)/);
 assert.match(html,/קיין צוגעטיילטע ארבעט \(704\)/);
 assert.match(html,/געפונען 51/);
 assert.match(html,/זוך און פילטערס ארבעטן איבער אלע מיטגלידער/);
 assert.match(html,/data-action="gabbai-workload-page" data-page="1"/);
 assert.match(html,/data-action="gabbai-workload-page" data-page="3"/);
 assert.match(html,/זייט 2 פון 3/);
 // The API is the source of truth; no second local substring-filter may discard
 // authorized page results that were already searched on the server.
 s.gabbaiWorkloadQuery='a different search handled by the server';
 html=gabbaiWorkloadView(s,esc);
 assert.match(html,/<strong>ask3<\/strong>/);
});

test('Workload search is scoped to loaded permitted members and escapes private text',()=>{
 const s=state();
 s.gabbaiWorkloadQuery='Donor';
 let html=gabbaiWorkloadView(s,esc);
 assert.match(html,/<strong>ask3<\/strong>/);
 assert.doesNotMatch(html,/<strong>ask1<\/strong>/);
 s.gabbaiWorkloadQuery='No matches';html=gabbaiWorkloadView(s,esc);
 assert.match(html,/קיינער איז נישט געפונען/);
 s.gabbaiWorkloadQuery='';
 s.gabbaiWorkload.members=[{...members[0],subject:'<script>x</script>',team_name:'<img onerror=alert(1)>'}];
 html=gabbaiWorkloadView(s,esc);
 assert.doesNotMatch(html,/<script>|<img/);
 assert.match(html,/&lt;script&gt;x&lt;\/script&gt;/);
 assert.match(html,/&lt;img onerror=alert\(1\)&gt;/);
 s.gabbaiRole='askan';assert.equal(gabbaiWorkloadView(s,esc),'');
 s.gabbaiRole='manager';s.gabbaiWorkloadFilter='unknown';
 s.gabbaiWorkload.teams=[{team_name:'<img src=x onerror=1>',members:1,open_tasks:0,overdue_tasks:0,open_handoffs:0,overdue_handoffs:0,due_soon_tasks:0}];
 const safe=gabbaiWorkloadView(s,esc);
 assert.doesNotMatch(safe,/<img src=x/);
 assert.match(safe,/&lt;img src=x onerror=1&gt;/);
 assert.match(gabbaiWorkloadView(s,esc),/אלע \(1\)/);
});
