// Gabbai Pro operations: real assigned handoffs, manual progress, historical notes.
export function gabbaiHandoffsView(state,esc){
 const data=state.gabbaiHandoffs||{handoffs:[],stats:{}};
 const selected=(data.handoffs||[]).find(x=>x.id===state.gabbaiHandoffId);
 const stats=data.stats||{},filter=state.gabbaiHandoffFilter||'open';
 const isBoss=!!data.canCreate;
 const now=Date.now();
 const status={open:'אפן',in_progress:'אין ארבעט',done:'פארענדיגט'};
 const urgency={normal:'נארמאל',high:'וויכטיג',critical:'קריטיש'};
 const visible=(data.handoffs||[]).filter(h=>
  filter==='all'||(filter==='mine'?h.assigned_to===state.subject&&h.status!=='done':
   filter==='overdue'?h.status!=='done'&&h.due_at&&Date.parse(h.due_at)<now:
   filter==='done'?h.status==='done':h.status!=='done'));
 const date=s=>s?esc(String(s).slice(0,16)):'נישט באשטימט';
 const history=selected?(state.gabbaiHandoffEvents||[]).map(e=>
  '<article class="item"><div><small>'+date(e.created_at)+' · '+esc(e.actor_subject)+
  ' · '+esc(e.kind==='comment'?'באריכט':e.kind==='created'?'נייע איבערגאב':'געענדערטער מצב')+'</small>'+
  (e.body?'<p>'+esc(e.body)+'</p>':'')+
  (e.status_to?'<p class="muted">'+esc(status[e.status_to]||e.status_to)+'</p>':'')+
  '</div></article>').join(''):'';
 const focused=selected?'<section class="card"><h3>איבערגאב — '+esc(selected.title)+'</h3>'+
  '<p>'+esc(selected.instructions||'קיין באזונדערע אנווייזונגען')+'</p>'+
  '<p class="muted">באשטימט צו: '+esc(selected.assigned_to)+' · טערמין: '+date(selected.due_at)+
  ' · מצב: '+esc(status[selected.status])+'</p>'+
  '<div class="inline">'+
  (selected.status==='open'&&(isBoss||selected.assigned_to===state.subject)?
  '<button data-action="gabbai-handoff-status" data-id="'+esc(selected.id)+'" data-status="in_progress">אנגעהויבן</button>':'')+
  (selected.status!=='done'&&(isBoss||selected.assigned_to===state.subject)?
  '<button data-action="gabbai-handoff-status" data-id="'+esc(selected.id)+'" data-status="done">פארטיג</button>':'')+
  (selected.status==='done'&&isBoss?
  '<button data-action="gabbai-handoff-status" data-id="'+esc(selected.id)+'" data-status="open">ווידער עפענען</button>':'')+
  '<button data-action="gabbai-handoff-back">צוריק צום איבערבליק</button></div>'+
  '<h3>באריכטן און איבערגאב־געשיכטע</h3>'+
  (history||'<p class="muted">נאך נישטא קיין פארשריט־באריכט.</p>')+
  '<form data-form="gabbai-handoff-comment" class="stack">'+
  '<label>מיין באריכט / וואס דארף דער קומענדיגער עסקן וויסן<textarea name="body" required maxlength="1500" rows="3"></textarea></label>'+
  '<button>צולייגן דעם באריכט</button></form></section>':'';
 const members=(state.assignees||[]).map(x=>
  '<option value="'+esc(x.subject)+'"'+(x.subject===state.gabbaiNewAssignee?' selected':'')+'>'+esc(x.subject)+' — '+esc(x.team_name||'נישט באשטימט')+'</option>').join('');
 const newForm=isBoss?'<section class="card"><h3>נייע ארבעט איבערגעבן</h3>'+
  '<form data-form="gabbai-handoff-new" class="stack">'+
  '<label>וואס דארף מען טון?<input name="title" maxlength="180" required placeholder="צ.ב. פארענדיגן אלע פארבליבענע רופן"></label>'+
  '<label>וואס דארף דער עסקן וויסן?<textarea name="instructions" maxlength="2000" rows="3"></textarea></label>'+
  '<label>פאראנטווארטליכער עסקן<select name="assignedTo" required><option value="">קלייב אויס</option>'+members+'</select></label>'+
  '<label>חשיבות<select name="priority"><option value="normal">נארמאל</option><option value="high">וויכטיג</option><option value="critical">קריטיש</option></select></label>'+
  '<label>טערמין (אויסוואל)<input name="dueAt" type="datetime-local"></label>'+
  '<button>איבערגעבן די ארבעט</button></form></section>':'';
 return '<section class="card"><h2>Gabbai Pro — אפעראציעס און איבערגאבן</h2>'+
  '<p class="muted">א קלארער סדר: ווער נעמט איבער, וואס איז דער קומענדיגער שריט, ביז ווען, און וואס האט מען שוין געטון. דאס איז א מענטשלעכער ארבעטס־באורד, נישט אויטאמאטישע רופן אדער מעסעדזשעס.</p>'+
  (state.gabbaiHandoffsError?'<p role="alert">'+esc(state.gabbaiHandoffsError)+'</p>':'')+
  '<div class="metrics"><div><span>אפן</span><strong>'+esc(stats.open||0)+'</strong></div>'+
  '<div><span>אין ארבעט</span><strong>'+esc(stats.in_progress||0)+'</strong></div>'+
  '<div><span>פארשפעטיגט</span><strong>'+esc(stats.overdue||0)+'</strong></div>'+
  '<div><span>פארטיג</span><strong>'+esc(stats.done||0)+'</strong></div></div>'+
  '<div class="inline">'+[
   ['open','נאך אפן'],['mine','מיינע ארבעטן'],['overdue','פארשפעטיגט'],['done','פארענדיגט'],['all','אלע']
  ].map(([key,name])=>'<button data-action="gabbai-handoff-filter" data-value="'+key+'"'+
   (filter===key?' aria-pressed="true"':' aria-pressed="false"')+'>'+name+'</button>').join('')+'</div>'+
  '<p class="muted">געוויזן '+visible.length+' פון '+(data.handoffs||[]).length+' ערלויבטע איבערגאבן (מאקסימום 120).</p>'+
  (selected?'':visible.map(h=>
  '<article class="item"><div><strong>'+esc(h.title)+'</strong><small>'+
  esc(status[h.status])+' · '+esc(urgency[h.priority])+' · באשטימט צו '+esc(h.assigned_to)+
  ' · טערמין '+date(h.due_at)+'</small>'+
  (h.status!=='done'&&h.due_at&&Date.parse(h.due_at)<now?'<p class="muted">טערמין איז שוין איבערגעגאנגען</p>':'')+
  '</div><button data-action="gabbai-handoff-open" data-id="'+esc(h.id)+'">עפענען / באריכטן</button></article>').join('')||
  '<p class="muted">קיין איבערגאבן אינעם אויסגעקליבענעם פילטער.</p>')+
  '</section>'+focused+newForm;
}
