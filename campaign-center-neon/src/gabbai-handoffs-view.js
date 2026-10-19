// Gabbai Pro practical shift handoff board. Human-only; no automatic messages.
export function gabbaiHandoffsView(state,esc){
 const data=state.gabbaiHandoffs||{handoffs:[],staff:[],history:[],counts:{}};
 const status={pending:'ווארט אויף איבערנעמען',acknowledged:'איבערגענומען',done:'פארענדיגט'};
 const priority={normal:'נארמאל',high:'וויכטיג',critical:'קריטיש'};
 const canAssign=!!data.canAssign;
 const current=state.gabbaiHandoffFilter||'active';
 const query=String(state.gabbaiHandoffQuery||'').trim().toLocaleLowerCase();
 const visible=(data.handoffs||[]).filter(item=>{
  const matches=current==='all'||(current==='active'&&item.status!=='done')||
   (current==='mine'&&item.assigned_to===state.subject&&item.status!=='done')||
   current===item.status;
  return matches&&(!query||[item.title,item.instructions,item.assigned_to].some(x=>
   String(x||'').toLocaleLowerCase().includes(query)));
 });
 const filters=[['active','אפענע'],['mine','פאר מיר'],['pending','נאך נישט איבערגענומען'],
  ['acknowledged','איבערגענומען'],['done','פארענדיגט'],['all','אלע']];
 const controls='<div class="inline">'+filters.map(([key,label])=>
   '<button type="button" data-action="gabbai-handoff-filter" data-value="'+key+
   '" aria-pressed="'+(current===key?'true':'false')+'">'+label+'</button>').join('')+
   '</div><form data-form="gabbai-handoff-search" class="inline">'+
   '<input type="search" maxlength="120" name="query" value="'+esc(state.gabbaiHandoffQuery||'')+
   '" placeholder="זוכן איבערגאבעס">'+
   '<button type="submit">זוכן</button></form>';
 const list=visible.map(item=>{
  const mine=item.assigned_to===state.subject;
  const events=(data.history||[]).filter(h=>h.handoff_id===item.id).slice(-8);
  const eventNames={created:'געשאפן',acknowledged:'איבערגענומען',completed:'פארענדיגט'};
  return '<article class="item"><div><strong>'+esc(item.title)+'</strong>'+
   '<small>'+esc(status[item.status]||item.status)+' · '+esc(priority[item.priority]||item.priority)+
   ' · איבערגעגעבן צו '+esc(item.assigned_to)+'</small>'+
   (item.instructions?'<p>'+esc(item.instructions)+'</p>':'')+
   (item.due_at?'<p class="muted">ציל־טערמין: '+esc(String(item.due_at).slice(0,16))+'</p>':'')+
   (events.length?'<details><summary>געשיכטע ('+events.length+')</summary>'+
     events.map(e=>'<p class="muted">'+esc(eventNames[e.event_type]||e.event_type)+
      ' · '+esc(e.actor_subject)+' · '+esc(String(e.recorded_at).slice(0,16))+'</p>').join('')+'</details>':'')+
   '</div><div class="inline">'+
   (mine&&item.status==='pending'?'<button type="button" data-action="gabbai-handoff-ack" data-id="'+esc(item.id)+'">איך האב איבערגענומען</button>':'')+
   ((mine||canAssign)&&item.status==='acknowledged'?
    '<button type="button" data-action="gabbai-handoff-complete" data-id="'+esc(item.id)+'">פארענדיגט</button>':'')+
   '</div></article>';
 }).join('');
 const staff=(data.staff||[]).map(m=>
  '<option value="'+esc(m.subject)+'">'+esc(m.subject)+(m.team_name?' — '+esc(m.team_name):'')+'</option>').join('');
 const form=canAssign?'<section class="card"><h3>געבן איבער אן ענין</h3>'+
  '<form class="stack" data-form="gabbai-handoff-new">'+
  '<label>ענין<input name="title" required maxlength="160" placeholder="וואס דארף דער נעקסטער עסקן טון?"></label>'+
  '<label>פרטים<textarea name="instructions" rows="3" maxlength="1500" placeholder="וואס האט זיך געטון און וואס קומט יעצט?"></textarea></label>'+
  '<label>צו וועמען<select name="assignedTo" required>'+staff+'</select></label>'+
  '<label>חשיבות<select name="priority"><option value="normal">נארמאל</option>'+
  '<option value="high">וויכטיג</option><option value="critical">קריטיש</option></select></label>'+
  '<label>ציל־טערמין (אויסוואל)<input type="datetime-local" name="dueAt"></label>'+
  '<button'+(staff?'':' disabled')+'>איבערגעבן פארן עסקן</button></form>'+
  (staff?'':'<p class="muted">ערשט דארף מען צולייגן אן אקטיוון קאמפיין־מעמבער.</p>')+
  '</section>':'';
 return '<section class="card"><h2>Gabbai Pro — אפעראציע־איבערגאבעס</h2>'+
  '<p class="muted">ווען איין עסקן גיט איבער אן ענין צום צווייטן, קען דער באקומער אנצייכענען אז ער האט עס איבערגענומען און פארענדיגן די ארבעט. קיין אויטאמאטישע טעלעפאן־רופן אדער מעסעדזשעס ווערן נישט געשיקט.</p>'+
  (state.gabbaiHandoffsError?'<p role="alert">'+esc(state.gabbaiHandoffsError)+'</p>':'')+
  '<div class="metrics"><div><span>ווארט אויף איבערנעמען</span><strong>'+esc(data.counts?.pending||0)+'</strong></div>'+
  '<div><span>איבערגענומען</span><strong>'+esc(data.counts?.acknowledged||0)+'</strong></div>'+
  '<div><span>פארענדיגט</span><strong>'+esc(data.counts?.done||0)+'</strong></div></div>'+
  controls+'<p class="muted">געוויזן '+visible.length+' איבערגאבעס פון '+(data.handoffs||[]).length+' ערלויבטע רעקארדס.</p>'+
  (list||'<p class="muted">נישטא קיין איבערגאבעס לויט דעם אויסגעקליבענעם פילטער.</p>')+'</section>'+form;
}
