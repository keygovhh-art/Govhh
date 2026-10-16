// Private Personal Askan workspace. No campaign information is copied to this screen.
const safe = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const when = value => value ? new Date(value).toLocaleDateString('en-US') : '';

export function personalView(state) {
 const records=state.personalItems||[];
 const open=records.filter(i=>i.status==='open'),done=records.filter(i=>i.status==='done');
 const kind={task:'אויפגאבע',followup:'נאכפאלג',note:'נאטיץ'};
 function row(item) {
   return '<article class="item"><div><strong>'+safe(item.title)+'</strong>'+
    '<small>'+safe(kind[item.item_kind]||'פערזענליך')+' · '+safe(item.priority)+
    (item.due_at?' · '+when(item.due_at):'')+'</small>'+
    (item.details?'<p class="muted">'+safe(item.details)+'</p>':'')+'</div>'+
    '<div class="actions">'+(item.status==='open'?
     '<button data-action="personal-done" data-id="'+safe(item.id)+'">פארענדיגט</button>':
     '<button data-action="personal-reopen" data-id="'+safe(item.id)+'">ווידער עפענען</button>')+
    '<button data-action="personal-archive" data-id="'+safe(item.id)+'">ארכיוו</button></div></article>';
 }
 return '<section class="card"><h2>מיין עסקנות — פריוואט</h2>'+
  '<p>דיין אייגענער היינט־פלאן. קיינער פון דיין קאמפיין־מאנשאפט זעט נישט די פריוואטע נאטיצן, אויפגאבן אדער נאכפאלגן. מען קען זיי נישט אויטאמאטיש אריבערשיקן צו MAX.</p>'+
  (state.personalError?'<p role="alert" class="muted">פריוואטער ארבעטס־פלאץ איז נאכנישט גרייט אויפן סערווער: '+safe(state.personalError)+'</p>':'')+
  '<form data-form="personal-item" class="stack"><label>וואס ווילסטו געדענקען?<input required maxlength="240" name="title" placeholder="אויפגאבע אדער נאכפאלג"></label>'+
  '<label>סארט<select name="kind"><option value="task">אויפגאבע</option><option value="followup">נאכפאלג</option><option value="note">פריוואטע נאטיץ</option></select></label>'+
  '<label>באשרייבונג (פריוואט)<textarea name="details" maxlength="2000" rows="2"></textarea></label>'+
  '<div class="inline"><label>וויכטיגקייט<select name="priority"><option value="normal">נארמאל</option><option value="high">וויכטיג</option><option value="critical">קריטיש</option></select></label>'+
  '<label>ווען<input type="datetime-local" name="dueAt"></label></div>'+
  '<button class="primary">אפהיטן נאר פאר מיר</button></form></section>'+
  '<section class="card"><h2>אפן — '+open.length+'</h2>'+(open.length?open.map(row).join(''):'<p class="muted">נאך קיין אפענע פערזענליכע אויפגאבן.</p>')+'</section>'+
  '<section class="card"><h2>פארענדיגט — '+done.length+'</h2>'+(done.length?done.map(row).join(''):'<p class="muted">נאכנישטא קיין פארענדיגטע אויפגאבן.</p>')+'</section>';
}
