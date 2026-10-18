// Gabbai Pro operational handoffs: incoming/outgoing duties, acceptance,
// completed work and factual event history. No phone or push messages.
export function gabbaiHandoffsView(state,esc){
 if(!['owner','manager'].includes(state.gabbaiRole))return '';
 const v=state.gabbaiHandoffs;
 const entries=v?.handoffs||[];
 const counts={
  open:entries.filter(x=>x.status==='open').length,
  accepted:entries.filter(x=>x.status==='accepted').length,
  completed:entries.filter(x=>x.status==='completed').length
 };
 const leaders=(v?.managers||[]).map(x=>
  '<option value="'+esc(x.subject)+'">'+esc(x.subject)+' ('+esc(x.role)+')</option>').join('');
 const statuses={open:'ווארט אויף איבערנעמען',accepted:'איבערגענומען',completed:'פארענדיקט'};
 const cards=entries.map(x=>
  '<article class="item"><div><strong>'+esc(x.title)+'</strong>'+
  '<small>'+esc(statuses[x.status]||x.status)+' · פון '+esc(x.created_by)+
  ' צו '+esc(x.assigned_to)+(x.due_at?' · טערמין '+esc(String(x.due_at).slice(0,16)):'')+'</small>'+
  '<p>'+esc(x.instructions||'קיין ווייטערדיגע פרטים')+'</p></div>'+
  (x.assigned_to===state.subject&&x.status!=='completed'?
  '<form data-form="gabbai-handoff-action" data-id="'+esc(x.id)+'" class="stack">'+
  '<input type="hidden" name="action" value="'+(x.status==='open'?'accepted':'completed')+'">'+
  '<label>קורצע איבערגאבע־נאטיץ<textarea name="note" maxlength="500" rows="2"></textarea></label>'+
  '<button type="submit">'+(x.status==='open'?'איך נעם איבער':'איך האב פארענדיקט')+'</button></form>':'')+
  '</article>').join('');
 const history=(v?.history||[]).slice(0,30).map(x=>
  '<p class="muted">'+esc(String(x.recorded_at).slice(0,16))+' — '+esc(x.actor_subject)+
   ': '+esc(statuses[x.action]||x.action)+(x.note?' · '+esc(x.note):'')+'</p>').join('');
 return '<section class="card"><h2>Gabbai Pro — אפעראציעס און Handoffs</h2>'+
  '<p class="muted">א מנהל קען איבערגעבן א וויכטיגע אויפגאבע פאר אן אנדערן מנהל. יענער נעמט עס איבער און פארענדיקט עס מיט א קלארער געשיכטע. דאס שיקט נישט אוטאמאטיש קיין רוף אדער מעסעדזש.</p>'+
  (state.gabbaiHandoffsError?'<p role="alert">'+esc(state.gabbaiHandoffsError)+'</p>':'')+
  '<div class="metrics"><div><span>אפן</span><strong>'+counts.open+'</strong></div>'+
  '<div><span>איבערגענומען</span><strong>'+counts.accepted+'</strong></div>'+
  '<div><span>פארענדיקט</span><strong>'+counts.completed+'</strong></div></div>'+
  '<form data-form="gabbai-handoff-filter" class="inline"><label>ווייזן<select name="filter">'+
  [['open','אקטיווע'],['mine','מיינע איבערגאבעס'],['completed','פארענדיגטע'],['all','אלע']].map(([key,label])=>
   '<option value="'+key+'" '+(state.gabbaiHandoffFilter===key?'selected':'')+'>'+label+'</option>').join('')+
  '</select></label><button>ווייז</button></form>'+
  (leaders?'<form data-form="gabbai-handoff-new" class="stack">'+
   '<label>ענין<input name="title" maxlength="160" required></label>'+
   '<label>צוטיילן צו וועלכן מנהל<select name="assignedTo" required>'+leaders+'</select></label>'+
   '<label>וואס דארף מען דורכפירן<textarea name="instructions" maxlength="1200" rows="3"></textarea></label>'+
   '<label>טערמין (אויסוואל)<input type="datetime-local" name="dueAt"></label>'+
   '<button>איבערגעבן פארן מנהל</button></form>':
   '<p class="muted">קיין אנדערע אקטיווע מנהל־מעמבערס אויף דעם קאמפיין.</p>')+
  '</section><section class="card"><h3>די איבערגאבע־ליסטע</h3>'+
  (cards||'<p class="muted">נאך קיין איבערגאבעס אינעם אויסגעקליבענעם פילטער.</p>')+
  '<details><summary>די געשיכטע פון איבערגאבעס</summary>'+
  (history||'<p class="muted">נאך קיין געשיכטע.</p>')+'</details></section>';
}
