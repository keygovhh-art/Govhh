// Internal manager/requester guidance, no guaranteed adviser service or SLA.
export function proGuidanceView(state,esc){
 const requests=state.proGuidance||[];
 const selected=requests.find(x=>x.id===state.proGuidanceId);
 const isManager=['owner','manager'].includes(state.overview?.campaign?.role);
 const kind={strategy:'פלאנירן',calls:'רופן',fundraising:'נדבות',technical:'טעכניש',other:'אנדערע'};
 const list=requests.map(x=>
  '<article class="item"><div><strong>'+esc(x.subject)+'</strong>'+
  '<small>'+esc(kind[x.category]||x.category)+' · '+esc(x.status)+' · '+esc(x.created_at?.slice(0,10)||'')+
  (isManager?' · '+esc(x.created_by):'')+'</small></div>'+
  '<button data-action="pro-guidance-open" data-id="'+esc(x.id)+'">עפענען שמועס</button></article>'
 ).join('');
 const form='<section class="card"><h2>Askan Pro — בעטן עצה פון דער קאמפיין־הנהלה</h2>'+
  '<p class="muted">דאס איז א פריוואטער אינערליכער הילף־קאנאל. בלויז דו און די בארעכטיגטע הנהלה קענען זען דעם פארלאנג. קיין 42־שעה ענטפער אדער באצאלטער פראפעסיאנעלער שטאב ווערן נישט צוגעזאגט.</p>'+
  '<form data-form="pro-guidance-new" class="stack">'+
  '<label>אפטיילונג<select name="category">'+Object.entries(kind).map(([v,label])=>'<option value="'+v+'">'+label+'</option>').join('')+'</select></label>'+
  '<label>ענין<input name="subject" required maxlength="160" placeholder="וואס דארף מען העלפן?"></label>'+
  '<label>פרטים<textarea name="description" maxlength="3000" required rows="4"></textarea></label>'+
  '<button class="primary">שיקן דער בקשה</button></form></section>';
 const summary='<section class="card"><h2>מיינע / ערלויבטע בקשות</h2>'+
  (state.proGuidanceError?'<p role="alert">'+esc(state.proGuidanceError)+'</p>':'')+
  (list||'<p class="muted">נאך קיין בקשות.</p>')+'</section>';
 if(!selected)return form+summary;
 const messages=(state.proGuidanceMessages||[]).map(m=>
  '<article class="item"><div><strong>'+esc(m.sender_subject)+'</strong>'+
  '<small>'+esc(m.sent_at?.slice(0,16)||'')+'</small><p>'+esc(m.body)+'</p></div></article>'
 ).join('');
 const reply=selected.status!=='closed'?'<form data-form="pro-guidance-reply" class="stack">'+
  '<label>ענטפער אדער נאכפאלג<textarea name="body" maxlength="3000" required rows="3"></textarea></label>'+
  '<button>שיקן אין פריוואטן שמועס</button></form>':'';
 return form+summary+'<section class="card"><h2>'+esc(selected.subject)+'</h2>'+
  '<p>'+esc(selected.description)+'</p>'+
  '<p class="muted">מצב: '+esc(selected.status)+'. א מענטש דארף טאקע ענטפערן; דער סיסטעם טוט דאס נישט אליין.</p>'+
  (messages||'<p class="muted">נאך קיין ענטפערס.</p>')+reply+
  (selected.status!=='closed'?'<button data-action="pro-guidance-close" data-id="'+esc(selected.id)+'">פארמאכן די בקשה</button>':'')+
  '<button data-action="pro-guidance-back">צוריק צו אלע בקשות</button></section>';
}
