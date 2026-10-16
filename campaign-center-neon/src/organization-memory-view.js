// Manual Organization Memory: exclusively active owner/manager.
// Append-only knowledge revisions; never auto-imports private donor notes.
export function organizationMemoryView(state,esc){
 const kinds={policy:'נהלים',lesson:'ערפארונג / וואס מ\'האט געלערנט',handoff:'איבערגעבן אחריות',risk:'באקאנטע שוועריקייט'};
 const entries=state.organizationMemory||[];
 const campaigns=(state.campaigns||[]).map(c=>'<option value="'+esc(c.id)+'">'+esc(c.title)+'</option>').join('');
 const options=Object.entries(kinds).map(([code,label])=>'<option value="'+code+'">'+label+'</option>').join('');
 const notes=entries.map(x=>{
  const form='<form data-form="organization-memory-revise" data-memory-id="'+esc(x.id)+'" class="stack">'+
   '<h4>אפהיטן א נייע ווערסיע</h4>'+
   '<label>סארט<select name="category">'+Object.entries(kinds).map(([code,label])=>
     '<option value="'+code+'" '+(x.category===code?'selected':'')+'>'+label+'</option>').join('')+'</select></label>'+
   '<label>ענין<input name="title" maxlength="180" required value="'+esc(x.title)+'"></label>'+
   '<label>אויסגעארבעטע פרטים<textarea name="summary" maxlength="3000" rows="4" required>'+esc(x.summary)+'</textarea></label>'+
   '<p class="muted">די פריערדיגע ווערסיע וועט בלייבן אין דער געשיכטע.</p>'+
   '<button>אפהיטן נייע ווערסיע</button></form>';
  return '<article class="item"><div><strong>'+esc(x.title)+'</strong>'+
   '<small>'+esc(kinds[x.category]||x.category)+' · '+esc(x.created_at?.slice(0,16)||'')+
   (x.supersedes_id?' · פארבעסערטע ווערסיע':'')+'</small>'+
   '<p>'+esc(x.summary)+'</p>'+
   (x.review_due_at?'<p>ווידער איבערקוקן: '+esc(x.review_due_at.slice(0,16))+'</p>':'')+
   '<p class="muted">אריינגעשריבן דורך: '+esc(x.author_subject)+'</p></div>'+
   (!state.organizationMemoryHistory?form:'')+'</article>';
 }).join('');
 return '<section class="card"><h2>מוסדישע Memory — פריוואטער הנהלה־זכרון</h2>'+
  '<p class="muted">בלויז מנהלים: נהלים, געלערנטע ערפארונגען, איבערגעגעבענע אינפארמאציע און שוועריקייטן צום געדענקען. קיינע פריוואטע נדבן־נאטיצן ווערן נישט אויטאמאטיש אהער געברענגט. קיינע אויטאמאטישע דערמאנונגען ווערן נישט געשיקט.</p>'+
  (state.organizationMemoryError?'<p role="alert">'+esc(state.organizationMemoryError)+'</p>':'')+
  '<div class="inline"><button data-action="organization-memory-history" data-history="'+(!state.organizationMemoryHistory)+'">'+
  (state.organizationMemoryHistory?'ווייז נאר די לעצטע ווערסיעס':'ווייז גאנצע אפגעהיטענע געשיכטע')+
  '</button></div></section>'+
  '<section class="card"><h2>איינשרייבן מוסדישע אינפארמאציע</h2>'+
  '<form data-form="organization-memory-new" class="stack">'+
  '<label>סארט<select name="category">'+options+'</select></label>'+
  '<label>פאר וועלכן קאמפיין<select name="sourceCampaignId"><option value="">דער גאנצער מוסד</option>'+campaigns+'</select></label>'+
  '<label>ענין<input name="title" maxlength="180" required></label>'+
  '<label>פרטים<textarea name="summary" maxlength="3000" required rows="5"></textarea></label>'+
  '<label>איבערקוקן אויף א באשטימטע צייט (אויב נויטיג)<input type="datetime-local" name="reviewDueAt"></label>'+
  '<button>אפהיטן אין מוסדישע Memory</button></form></section>'+
  '<section class="card"><h2>'+esc(state.organizationMemoryHistory?'אלע ווערסיעס':'אקטיווע מוסדישע נאטיצן')+'</h2>'+
  (notes||'<p class="muted">נאך קיין אפגעהיטענע אינפארמאציע.</p>')+
  '</section>';
}
