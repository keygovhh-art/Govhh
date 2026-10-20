// Askan Pro facts from all AUTHORIZED blocker records, not client-limited 200.
export function proBlockersView(state,esc){
 const data=state.proBlockers;
 const reasons={no_response:'מען ענטפערט נישט',missing_information:'עס פעלט אינפארמאציע',
  approval_needed:'מען דארף א באשטעטיגונג',payment_pending:'אויסשטייענדיגע באצאלונג',other:'אנדערע'};
 const format=n=>esc(String(n??0));
 if(!data||data.allVisibleBlockersCounted!==true)
  return '<section class="card"><h2>Askan Pro — שוועריקייטן</h2>'+
   '<p role="alert">דער פולער באריכט איז נישט באשטעטיגט פונעם סערווער: '+
   esc(state.proBlockersError||'נישט צוטריטבאר')+'</p></section>';
 const entries=Object.entries(data.activeByReason||{}).sort((a,b)=>b[1]-a[1]);
 const summary=entries.map(([reason,n])=>'<p><strong>'+esc(reasons[reason]||reason)+': '+format(n)+'</strong></p>').join('');
 const listing=(data.blockers||[]).map(b=>
  '<article class="item"><div><strong>'+esc(b.title)+'</strong>'+
  '<small>'+esc(reasons[b.reason]||b.reason)+' · '+(b.is_active?'אפן':'אויפגעלייזט')+
  ' · '+esc(String(b.updated_at||'').slice(0,16))+'</small>'+
  (b.details?'<p>'+esc(b.details)+'</p>':'')+'</div>'+
  (b.is_active&&['open','in_progress'].includes(b.status)?
   '<button type="button" data-action="pro-blocker-resolve" data-id="'+esc(b.task_id)+'">אויפלעזן</button>':'')+
  '</article>').join('');
 const opts=(state.proBlockerCandidates?.candidates||[]).map(t=>
  '<option value="'+esc(t.id)+'">'+esc(t.title)+' · '+esc(t.assignee_subject||'')+'</option>').join('');
 const paging=data.pageCount>1?'<nav class="inline">'+
  (data.page>1?'<button type="button" data-action="pro-blocker-page" data-page="'+(data.page-1)+'">פריער</button>':'')+
  '<span>זייט '+format(data.page)+' פון '+format(data.pageCount)+'</span>'+
  (data.page<data.pageCount?'<button type="button" data-action="pro-blocker-page" data-page="'+(data.page+1)+'">ווייטער</button>':'')+
  '</nav>':'';
 const filters=['all','active','inactive'].map((key)=>
  '<button type="button" data-action="pro-blocker-filter" data-value="'+key+'">'+
   esc(({all:'אלע',active:'אפענע',inactive:'אויפגעלייזטע'})[key])+
   (state.proBlockerFilter===key?' ✓':'')+'</button>').join('');
 const trends=data.changesLast30Days||{};
 const changes=['raised','reopened','resolved','changed'].map(key=>
  '<span>'+esc(({raised:'געמאלדענע',reopened:'צוריק געעפנטע',resolved:'אויפגעלייזטע',changed:'געענדערטע'})[key])+
   ': '+format(trends[key]||0)+'</span>').join(' · ');
 return '<section class="card"><h2>Askan Pro — שוועריקייטן און שטערונגען</h2>'+
  '<p class="muted">אמתע סך־הכלן פונעם גאנצן ערלויבטן קאמפיין, נישט נאר די ערשטע 200 רעקארדס. קיין AI־השערות אדער אויטאמאטישע ווארענונגען.</p>'+
  '<div class="metrics"><div><span>באריכטעטע שטערונגען</span><strong>'+format(data.total)+'</strong></div>'+
  '<div><span>נאך אקטיוו</span><strong>'+format(data.activeTotal)+'</strong></div>'+
  '<div><span>אויפגעלייזט אדער נישט מער אפן</span><strong>'+format(data.inactiveTotal)+'</strong></div></div>'+
  (summary||'<p class="muted">קיינע באריכטעטע אקטיווע שטערונגען.</p>')+
  '<h3>פארשריט — לעצטע 30 טעג</h3><p class="muted">'+changes+'</p></section>'+
  '<section class="card"><h2>באריכטן א שטערונג</h2>'+
  '<form data-form="pro-blocker-search" class="inline"><input name="query" maxlength="100" value="'+
  esc(state.proBlockerQuery||'')+'" placeholder="זוך אייער אפענע אויפגאבע"><button>זוכן</button></form>'+
  (opts?'<form data-form="pro-blocker" class="stack">'+
   '<label>אויפגאבע<select name="taskId" required>'+opts+'</select></label>'+
   '<label>פארוואס שטייט עס?<select name="reason">'+Object.entries(reasons).map(([k,v])=>
    '<option value="'+k+'">'+esc(v)+'</option>').join('')+'</select></label>'+
   '<label>פרטים<textarea name="details" maxlength="500" rows="3"></textarea></label>'+
   '<p class="muted">נאר דער צוגעטיילטער עסקן אדער דער מנהל קען מעלדן. די ענדערונג ווערט געהיטן אינעם Audit־חשבון.</p>'+
   '<button>אפהיטן די שטערונג</button></form>':
   '<p class="muted">קיין צוגעפאסטע אפענע אויפגאבן אין די זוך־רעזולטאטן.</p>')+'</section>'+
  '<section class="card"><h2>באריכטעטע שוועריקייטן</h2>'+
  '<div class="inline">'+filters+'</div>'+
  '<p class="muted">צוגעפאסטע רעקארדס: '+format(data.filteredTotal)+
   ' · געוויזן: '+format((data.blockers||[]).length)+'</p>'+
  (listing||'<p class="muted">קיין רעקארדס אויף דעם בלאט.</p>')+paging+'</section>';
}
