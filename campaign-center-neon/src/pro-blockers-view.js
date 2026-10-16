// Honest blocker intelligence from manually flagged, authorized campaign tasks.
// No AI predictions; only recorded facts. Server enforces member/squad boundaries.
export function proBlockersView(state,esc){
 const data=state.proBlockers||{blockers:[],activeByReason:{}};
 const reasons={no_response:'מען ענטפערט נישט',missing_information:'עס פעלט אינפארמאציע',
  approval_needed:'מען דארף א באשטעטיגונג',payment_pending:'אויסשטייענדיגע באצאלונג',other:'אנדערע'};
 const entries=Object.entries(data.activeByReason||{}).sort((a,b)=>b[1]-a[1]);
 const summary=entries.map(([reason,n])=>'<p><strong>'+esc(reasons[reason]||reason)+': '+esc(n)+'</strong></p>').join('');
 const listing=(data.blockers||[]).map(b=>
  '<article class="item"><div><strong>'+esc(b.title)+'</strong>'+
  '<small>'+esc(reasons[b.reason]||b.reason)+' · '+(b.is_active?'אפן':'אויפגעלייזט')+
  ' · '+esc(b.updated_at?.slice(0,16)||'')+'</small>'+
  (b.details?'<p>'+esc(b.details)+'</p>':'')+'</div>'+
  (b.is_active?'<button data-action="pro-blocker-resolve" data-id="'+esc(b.task_id)+'">אויפלעזן</button>':'')+'</article>').join('');
 const open=(state.tasks||[]).filter(x=>['open','in_progress'].includes(x.status)).slice(0,200);
 const options=open.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.title)+' · '+esc(t.assignee_subject||'')+'</option>').join('');
 return '<section class="card"><h2>Askan Pro — שוועריקייטן און שטערונגען</h2>'+
  '<p class="muted">נאר אפיציעל אריינגעשריבענע שוועריקייטן, פון די אויפגאבן וואס דו ביסט בארעכטיגט צו זען. דאס איז נישט קיין פערזענליכע שאצונג איבער די עסקנים.</p>'+
  (state.proBlockersError?'<p role="alert">'+esc(state.proBlockersError)+'</p>':'')+
  (summary||'<p class="muted">קיינע באריכטעטע אפענע שטערונגען.</p>')+'</section>'+
  '<section class="card"><h2>באריכטן א שטערונג אין אן אויפגאבע</h2>'+
  (options?'<form data-form="pro-blocker" class="stack">'+
   '<label>אויפגאבע<select name="taskId" required>'+options+'</select></label>'+
   '<label>פארוואס שטייט עס?<select name="reason">'+Object.entries(reasons).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')+'</select></label>'+
   '<label>פרטים<textarea name="details" maxlength="500" rows="3"></textarea></label>'+
   '<p class="muted">נאר דער צוגעטיילטער עסקן אדער מנהל קען אויפהייבן א שטערונג. דער שטערונגס־אויפהייב ווערט אפגעהיטן אין דער Audit־געשיכטע.</p>'+
   '<button>אפהיטן די שטערונג</button></form>':
   '<p class="muted">קיין אפענע אויפגאבן צו באריכטן.</p>')+'</section>'+
  '<section class="card"><h2>באריכטעטע שוועריקייטן</h2>'+
   (listing||'<p class="muted">קיין שטערונגען זענען נישט באריכטעט.</p>')+'</section>';
}
