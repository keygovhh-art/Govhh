const localTime=v=>v?new Date(v).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
const names={calling:'מען רופט מענטשן',program:'לייוו פראגראם',break:'הפסקה',ended:'פארענדיגט',opening:'פתיחה',manager:'מנהלים',inspiration:'דברי חיזוק',lunch:'לאנטש',technical:'טעכנישע עצות',closing:'סיום',other:'אנדערע'};
const canCall=person=>!person.do_not_call&&!person.claimed_by;
export function eventView(state,esc,money){
 const room=state.rooms.find(r=>r.id===state.joinedRoomId);
 if(!room)return '';
 const manager=['owner','manager'].includes(state.overview?.campaign?.role);
 const event=state.floorProgram;
 const board=state.floorBoard;
 const isChecked=event?.checkedIn===true;
 const live=(event?.programs||[]).find(p=>p.status==='live');
 const isCalling=event?.mode==='calling';
 const metrics=board?.totals||{};
 const user=state.subject;
 const segments=(event?.programs||[]).map(p=>{
   const active=p.status==='live',type=names[p.segment_type]||p.segment_type;
   return '<article class="item event-segment"><div>'+
    '<strong>'+esc(p.title)+'</strong><small>'+esc(localTime(p.scheduled_start))+' – '+esc(localTime(p.scheduled_end))+
    ' · '+esc(type)+' · '+esc(p.status)+'</small>'+
    (p.speaker?'<p>רעדנער: '+esc(p.speaker)+'</p>':'')+
    (p.description?'<p class="muted">'+esc(p.description)+'</p>':'')+
    (active&&p.media_url?'<audio controls preload="none" src="'+esc(p.media_url)+'" class="event-audio">דיין בראוזער שטיצט נישט אודיא.</audio>':'')+
    '</div>'+(manager?'<div class="actions">'+
       (p.status==='scheduled'?'<button data-action="program-start" data-id="'+esc(p.id)+'">אנהייבן</button><button data-action="program-cancel" data-id="'+esc(p.id)+'">אויסלאזן</button>':'')+
       (active?'<button data-action="program-complete" data-id="'+esc(p.id)+'">פארענדיקן און צוריק צום רופן</button>':'')+
       '</div>':'')+'</article>';
 }).join('');
 const segmentForm=manager?'<section class="card"><h3>פראגראם־לוח: לאנטש, דרשות און חיזוק</h3>'+
   '<p class="muted">לייג אריין די ארטיגע צייט פון די באשטימטע פראגראמען. דער מנהל הייבט אָן דעם פראגראם מיט א באשטעטיגונג; די צייטן אליין געבן פאראויס ידיעות.</p>'+
   '<button type="button" data-action="program-lunch-preset">איינשטעלן לאנטש 1:30–2:00</button>'+ 
   '<form data-form="program-add" class="stack">'+
   '<label>פראגראם־נאמען<input name="title" required maxlength="180" placeholder="למשל: לאנטש און דברי חיזוק"></label>'+
   '<label>סארט<select name="segmentType"><option value="inspiration">דברי חיזוק</option><option value="lunch">לאנטש</option><option value="manager">מנהל־אנווייזונגען</option><option value="opening">פתיחה</option><option value="technical">טעכנישע הילף</option><option value="break">הפסקה</option><option value="closing">סיום</option><option value="other">אנדערע</option></select></label>'+
   '<label>רעדנער<input name="speaker" maxlength="180" placeholder="רב / משפיע / עסקן"></label>'+
   '<label>אנהייב<input name="scheduledStart" type="datetime-local" required></label>'+
   '<label>ענדע<input name="scheduledEnd" type="datetime-local" required></label>'+
   '<label>פרטים<textarea name="description" maxlength="1000" rows="2"></textarea></label>'+
   '<label>אודיא־אדרעס (אויב שוין פאראן)<input name="mediaUrl" type="url" placeholder="https://...mp3"></label>'+
   '<button type="submit">אפהיטן אינעם פראגראם־לוח</button></form></section>':'';
 const contacts=(state.leads||[]).filter(p=>!p.do_not_call).slice(0,80).map(p=>{
   const held=p.claimed_by===user && new Date(p.claim_expires_at).getTime()>Date.now();
   const unavailable=p.claimed_by&&new Date(p.claim_expires_at).getTime()>Date.now()&&!held;
   const dial=String(p.phone||'').replace(/[^0-9+]/g,'');
   return '<article class="item"><div><strong>'+esc(p.display_name)+'</strong>'+
   '<small>'+esc(p.assigned_team||'נישט צוגעטיילט')+' · '+esc(p.status)+'</small>'+
   (held?'<p>דיין רוף: '+esc(p.phone)+'</p>':'')+
   '</div><div class="actions">'+(held?
    '<a class="primary call-link" href="tel:'+esc(dial)+'">רופן פון מיין טעלעפאן</a>':
    unavailable?'<span class="muted">אן אנדערער עסקן ארבעט דערויף</span>':
    '<button data-action="claim-lead" data-id="'+esc(p.id)+'">איך נעם דעם קשר</button>')+
   (held?'<button data-action="release-lead" data-id="'+esc(p.id)+'">צוריקגעבן</button>':'')+'</div>'+
   (held?'<form data-form="floor-call" class="stack">'+
     '<input name="contactId" type="hidden" value="'+esc(p.id)+'">'+
     '<label>רוף־רעזולטאט<select name="outcome">'+
       '<option value="spoke">גערעדט</option><option value="no_answer">נישט אויפגעהויבן</option>'+
       '<option value="callback">שפעטער צוריקרופן</option><option value="pledged">צוגעזאגט (געלט באזונדער איינשרייבן)</option>'+
       '<option value="paid">זאגט אז ער האט באצאלט (נישט באשטעטיגט)</option>'+
       '<option value="not_interested">נישט אינטערעסירט</option>'+
       '<option value="do_not_call">בעט מער נישט רופן</option>'+
     '</select></label><label>קורצע הערה<textarea name="note" maxlength="2000" rows="2"></textarea></label>'+
     '<button type="submit">אפהיטן רוף און צוריקגעבן דעם קשר</button></form>':'')+'</article>';
 }).join('');
 const help=(board?.help||[]).map(h=>'<article class="item"><div><strong>'+esc(h.category)+'</strong><small>'+
  esc(h.requested_by)+' · '+esc(h.status)+'</small><p>'+esc(h.summary)+'</p></div>'+
  (manager&&h.status!=='resolved'?'<div class="actions"><button data-action="help-progress" data-id="'+esc(h.id)+'">איך באהאנדל עס</button>'+
  '<button data-action="help-resolve" data-id="'+esc(h.id)+'">פארטיג</button></div>':'')+'</article>').join('');
 const programNotice=live?'<section class="card event-current"><h2>יעצט: '+esc(live.title)+'</h2>'+
   '<p>'+esc(names[live.segment_type]||live.segment_type)+(live.speaker?' · '+esc(live.speaker):'')+'</p>'+
   (live.media_url?'<audio controls preload="none" src="'+esc(live.media_url)+'" class="event-audio"></audio>':
   '<p class="muted">דער פראגראם איז אקטיוו אינעם לוח. אודיא־שידור איז נישט פארבונדן; די מנהל־אנווייזונגען זענען אינעם זאל.</p>')+
   '</section>':'';
 return '<section class="card event-status"><h2>קאמפיין־זאל — לעבעדיגע ארבעט</h2>'+
   '<p class="muted">מען קען סיי ווען אריינקומען, און אלע נייע ציפערן און פראגראמען דערהיינטיגן זיך.</p>'+
   '<div class="metrics"><div><span>מצב</span><strong>'+esc(names[event?.mode]||event?.mode||'...')+'</strong></div>'+
   '<div><span>איינגעטשעקט</span><strong>'+esc(event?.attendance?.checked_in||0)+'</strong></div>'+
   '<div><span>רופן באריכטעט</span><strong>'+esc(metrics.calls?.reported||0)+'</strong></div>'+
   '<div><span>נעטא באריכטעט</span><strong>'+money(metrics.financial?.manually_reported_net)+'</strong></div></div>'+
   (!isChecked?'<button data-action="event-check-in" class="primary">איך בין אנגעקומען — אריינטשעקן</button>':
   '<button data-action="event-check-out">ארויסטשעקן (מיינע רעקארדס בלייבן)</button>')+
   '<div class="inline"><button data-action="event-refresh">יעצט דערפרישן</button></div></section>'+
   programNotice+
   '<section class="card"><h2>פראגראם־לוח און אנזאגן</h2>'+
     (segments||'<p class="muted">דער מנהל האט נאך נישט באשטימט קיין פראגראמען.</p>')+
   '</section>'+segmentForm+
   (isChecked?'<section class="card"><h2>מיין רוף־ארבעטס־טיש</h2>'+
    (isCalling?'<p class="muted">נעם איין קשר, רוף אויף דיין אייגענעם טעלעפאן און שרייב דעם רעזולטאט. דעם זעלבן קשר קען נישט אן אנדערער עסקן כאפן.</p>':
    '<p class="muted">יעצט איז א פראגראם/הפסקה. די רוף־ארבעטס־טיש ווערט נישט אויסגעמעקט; דער מנהל קען נאך דער הפסקה צוריקשטעלן צום רופן.</p>')+
    (isCalling?contacts||'<p class="muted">נאך קיין ערלויבטע קשרים אויף דיין ליסטע.</p>':'')+
    '</section>':'')+
   '<section class="card"><h2>לייוו־הילף פון די מנהלים</h2>'+
    '<form data-form="floor-help" class="stack"><select name="category">'+
    '<option value="technical">טעכנישע הילף</option><option value="donor_question">נדבן־פראגע</option>'+
    '<option value="manager">איך דארף א מנהל</option><option value="motivation">חיזוק</option><option value="other">אנדערע</option></select>'+
    '<textarea name="summary" maxlength="500" required rows="2" placeholder="שרייב א קורצע פראגע — נישט קיין פריוואטע נדבן־נומערן"></textarea>'+
    '<button '+(!isChecked?'disabled':'')+'>שיקן הילף־בקשה</button></form>'+
    (help||'<p class="muted">נאך קיין הילף־בקשות.</p>')+'</section>';
}
