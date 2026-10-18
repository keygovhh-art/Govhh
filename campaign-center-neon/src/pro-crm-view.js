// Read-only presentation; real permissions are checked on the API every time.
// All CRM names, phone numbers, tags and note texts must be escaped by caller.
export function proCrmView(state,esc){
 const contacts=state.proContacts||[];
 const selected=state.proSelected;
 const role=state.overview?.campaign?.role;
 const canWrite=['owner','manager','squad_leader','askan'].includes(role);
 const fmt=value=>value?esc(new Date(value).toLocaleString('en-US')):'נישט באשטימט';
 const forLocal=value=>{if(!value)return '';const d=new Date(value),pad=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());};
 const stage={new:'נייע קשר',contacted:'שוין קאנטאקטירט',followup:'נאכפאלגן',pledged:'התחייבות',donor:'נדבן',closed:'פארמאכט'};
 const priorities={low:'נידעריג',normal:'נארמאל',high:'וויכטיג'};
 const nextChoices=new Map((state.proNextAction?.choices||[]).map(x=>[x.source_type+':'+x.source_id,x]));
 const nextLabels={accepted:'איך נעם עס אן',deferred:'שפעטער',skipped:'איבערגיין',unmarked:'נאך נישט באשלאסן'};
 const suggested=(state.proRecommendations||[]).map((x,i)=>{
  const chosen=nextChoices.get(x.source+':'+x.id);
  const choiceButtons=['accepted','deferred','skipped'].map(value=>
    '<button type="button" data-action="pro-next-choice" data-source="'+esc(x.source)+'" data-id="'+esc(x.id)+'" data-decision="'+value+'">'+esc(nextLabels[value])+'</button>').join(' ');
  return '<article class="item"><div><strong>'+(i+1)+'. '+esc(x.title)+'</strong>'+
   '<small>'+esc(x.source==='task'?'אויפגאבע':'קשר־נאכפאלג')+' · '+esc(x.priority)+' · '+fmt(x.dueAt)+'</small>'+
   (chosen?'<p class="muted">מיין באשלוס: '+esc(nextLabels[chosen.decision]||chosen.decision)+'</p>':'')+
   '</div><div class="inline">'+choiceButtons+
   (x.source==='crm_followup'?'<button data-action="pro-open" data-id="'+esc(x.id)+'">עפענען קשר</button>':
     (x.status==='open'?'<button data-action="pro-next-task-status" data-id="'+esc(x.id)+'" data-status="in_progress">אנהייבן די אויפגאבע</button>':'')+
     '<button data-action="pro-next-task-status" data-id="'+esc(x.id)+'" data-status="done">פארענדיגט די אויפגאבע</button>')+'</div></article>';
 }).join('');
 const nextStats=(state.proNextAction?.choices||[]).reduce((a,x)=>{
   if(x.decision==='accepted')a.accepted++;
   if(x.decision==='deferred')a.deferred++;
   if(x.decision==='skipped')a.skipped++;
   return a;
 },{accepted:0,deferred:0,skipped:0});
 const nextSummary='<p class="muted">מיינע באשלוסן — אנגענומען: '+nextStats.accepted+
  ' · אויף שפעטער: '+nextStats.deferred+' · איבערגעגאנגען: '+nextStats.skipped+
  '. די סימנים טוישן נישט אטאמאטיש דעם מצב פון דער אויפגאבע.</p>';
 const clarity='<section class="card"><h2>Clarity — די קומענדיגע וויכטיגע שריט</h2><p class="muted">א פראקטישע אויסוואל לויט פארשפעטיגונג, וויכטיגקייט און טערמין פון דיינע ערלויבטע קאמפיין־רעקארדס. נישט קיין פארטיגע AI־אנאליז אדער אויטאמאטישע אקציעס.</p>'+nextSummary+(suggested||'<p class="muted">קיין רעקארדירטע אפענע שריט.</p>')+'</section>';
 const listing=contacts.map(c=>
  '<article class="item"><div><strong>'+esc(c.display_name)+'</strong>'+
  '<small>'+esc(c.phone||'קיין נומער')+' · '+esc(stage[c.stage]||c.stage)+
  ' · '+esc(priorities[c.priority]||c.priority)+(c.do_not_call?' · נישט רופן':'')+
  '</small><p class="muted">נאכפאלגן: '+fmt(c.next_followup_at)+' · '+(c.tags||[]).map(esc).join(' · ')+'</p></div>'+
  '<button data-action="pro-open" data-id="'+esc(c.id)+'">עפענען CRM</button></article>'
 ).join('');
 const page='<section class="card"><h2>Askan Pro — קשרים און CRM</h2>'+
  '<p class="muted">קשרים ווערן געוויזן בלויז לויט דיינע אמתע קאמפיין־רעכטן. א פריוואטער קשר בלייבט נאר פאר זיין באשעפער.</p>'+
  '<form data-form="pro-search" class="inline"><input type="search" maxlength="90" name="query" value="'+esc(state.proQuery||'')+'" placeholder="נאמען אדער טעלעפאן"><label>פארשפעטיגט<input type="checkbox" name="overdue" '+(state.proOverdue?'checked':'')+'></label><button>זוכן</button></form>'+
  (state.proError?'<p role="alert">'+esc(state.proError)+'</p>':'')+
  (listing||'<p class="muted">קיינע ערלויבטע קשרים אין דער איצטיגער אויסוואל.</p>')+'</section>';
 if(!selected)return clarity+page;
 const p=selected.profile||{};
 const opt=(values,current)=>values.map(([key,label])=>
  '<option value="'+key+'" '+(key===current?'selected':'')+'>'+label+'</option>').join('');
 const settings=canWrite?'<form data-form="pro-profile" class="stack">'+
  '<label>מצב<select name="stage">'+opt(Object.entries(stage),p.stage||'new')+'</select></label>'+
  '<label>וויכטיגקייט<select name="priority">'+opt(Object.entries(priorities),p.priority||'normal')+'</select></label>'+
  '<label>צייכענונגען, אפגעטיילט מיט קאמא (ביז 10)<input maxlength="350" name="tags" value="'+esc((p.tags||[]).join(', '))+'"></label>'+
  '<label>קומענדיגער נאכפאלג<input type="datetime-local" name="nextFollowupAt" value="'+esc(forLocal(p.next_followup_at))+'"></label>'+
  '<p class="muted">א ליידיגער דאטום וועט אויסמעקן דעם קומענדיגן נאכפאלג־טערמין. די פריערדיגע ענדערונג בלייבט אין Audit.</p>'+
  '<button>אפהיטן CRM־פראפיל</button></form>'+
  '<form data-form="pro-interaction" class="stack"><h3>נייע קשר־אינטעראקציע</h3>'+
  '<label>סארט<select name="kind">'+opt([['meeting','באגעגעניש'],['message','מעסעדזש'],['email','אימעיל'],['other','אנדערע']],'meeting')+'</select></label>'+
  '<label>געשיכטע / נאטיץ<textarea name="note" maxlength="2000" required></textarea></label><button>אפהיטן אין געשיכטע</button></form>':'';
 const history=(selected.timeline||[]).map(item=>
   '<article class="item"><div><strong>'+esc(item.kind==='call'?'מאנועל באריכטעטע רוף':item.kind)+'</strong>'+
   '<small>'+esc(item.author)+' · '+fmt(item.createdAt)+(item.outcome?' · '+esc(item.outcome):'')+'</small>'+
   '<p>'+esc(item.note||'קיין נאטיץ')+'</p></div></article>').join('');
 return clarity+page+'<section class="card"><h2>'+esc(selected.contact.name)+' — קשר־געשיכטע</h2>'+
  '<p class="muted">פריוואטקייט: '+esc(selected.contact.privacy)+(selected.contact.doNotCall?' · נישט רופן':'')+
  '. געשיכטע פון די מאנועל באריכטעטע רופן און דאקומענטירטע קאנטאקטן.</p>'+
  '<p>לעצטער נאכפאלג־טערמין: '+fmt(p.next_followup_at)+'</p>'+
  settings+'<h3>געשיכטע</h3>'+ (history||'<p class="muted">נאך קיין געשיכטע.</p>')+
  '<button data-action="pro-close">צוריק צו אלע קשרים</button></section>';
}
