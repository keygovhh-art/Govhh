// Private Askan Pro 7-day Sprint + 30-day factual memory.
// Never implies jobs have been automatically scheduled or performed.
export function proSprintsView(state,esc){
 const sprints=state.proSprints||[];
 const labels={created:'געשאפן',step_done:'פארענדיגט',step_reopened:'צוריק געעפנט',completed:'פארענדיגט',archived:'ארכיווירט'};
 const list=sprints.map(sprint=>{
  const steps=(sprint.steps||[]).map(x=>'<article class="item"><div><strong>טאג '+esc(x.day_number)+' — '+esc(x.title)+'</strong>'+
   '<small>'+(x.completed_at?'פארענדיגט: '+esc(x.completed_at.slice(0,10)):'נאך אפן')+'</small></div>'+
   (sprint.status==='open'?'<button type="button" data-action="pro-step" data-sprint-id="'+esc(sprint.id)+
     '" data-id="'+esc(x.id)+'" data-status="'+(x.completed_at?'open':'done')+'">'+
     (x.completed_at?'צוריק עפענען':'פארענדיגט')+'</button>':'')+'</article>').join('');
  return '<section class="card"><h3>'+esc(sprint.title)+'</h3><p class="muted">אנגעהויבן: '+
   esc(String(sprint.starts_on).slice(0,10))+' · מצב: '+esc(sprint.status)+'</p>'+steps+
   (sprint.status==='open'?'<div class="inline"><button data-action="pro-sprint-close" data-id="'+esc(sprint.id)+
    '" data-status="completed">פארענדיגן Sprint</button>'+
    '<button data-action="pro-sprint-close" data-id="'+esc(sprint.id)+
    '" data-status="archived">ארכיווירן</button></div>':'')+'</section>';
 }).join('');
 const history=(state.proHistory||[]).map(x=>'<article class="item"><div><strong>'+esc(labels[x.event_type]||x.event_type)+
  '</strong><small>'+esc(x.sprint_title)+' · '+esc(x.recorded_at?.slice(0,16)||'')+'</small>'+
  (x.step_title?'<p>'+esc(x.step_title)+' — טאג '+esc(x.day_number)+'</p>':'')+'</div></article>').join('');
 const sprintMeta=state.proSprintsMeta,historyMeta=state.proHistoryMeta;
 const pager=(meta,action)=>meta?.pageCount>1?'<nav class="inline" aria-label="געשיכטע־בלעטער">'+
  (meta.page>1?'<button type="button" data-action="'+action+'" data-page="'+(meta.page-1)+'">פריער</button>':'')+
  '<span>זייט '+esc(meta.page)+' פון '+esc(meta.pageCount)+'</span>'+
  (meta.page<meta.pageCount?'<button type="button" data-action="'+action+'" data-page="'+(meta.page+1)+'">ווייטער</button>':'')+
  '</nav>':'';
 const sprintSummary=sprintMeta?.allPrivateSprintsCounted?
  '<p class="muted">אלע דיינע רעקארדירטע Sprint־פלענער: '+esc(sprintMeta.total)+
  ' · אויף דעם בלאט: '+esc(sprints.length)+'</p>':
  '<p role="alert">Sprint־ליסטע נישט באשטעטיגט: '+esc(state.proSprintsError||'נישט צוטריטבאר')+'</p>';
 const historySummary=historyMeta?.allPrivateEventsCounted?
  '<p class="muted">דיינע רעקארדירטע 30־טאגיקע געשעענישן: '+esc(historyMeta.total)+
  ' · געוויזן אויף דעם בלאט: '+esc((state.proHistory||[]).length)+
  '. נאר אמתע דאטן — קיין אויפגאבן ווערן נישט אויטאמאטיש פארענדיגט.</p>':
  '<p role="alert">די פולע 30־טאגיקע היסטאריע איז נישט באשטעטיגט: '+
  esc(state.proHistoryError||'נישט צוטריטבאר')+'</p>';
 const today=new Date(),pad=n=>String(n).padStart(2,'0');
 const local=today.getFullYear()+'-'+pad(today.getMonth()+1)+'-'+pad(today.getDate());
 const form='<section class="card"><h2>נייער 7־טאגיקער Focus־פלאן</h2>'+
  '<p class="muted">יעדער עסקן קען האבן איין אפענעם פערזענליכן Sprint פער קאמפיין. דער Sprint מאכט נישט אליין קיינעם קיין רופן אדער באצאלונגען.</p>'+
  '<form data-form="pro-sprint-new" class="stack">'+
  '<label>פלאן־נאמען<input name="title" maxlength="160" required placeholder="צום ביישפיל: די וואך 20 וויכטיגע רופן"></label>'+
  '<label>אנהייב־דאטום<input type="date" name="startsOn" required value="'+local+'"></label>'+
  '<label>שריט — איינס פער שורה, טאג | אויפגאבע<textarea name="steps" rows="6" maxlength="6000" required placeholder="1 | רופן די ערשטע 5 קשרים&#10;2 | נאכפאלגן די התחייבויות&#10;7 | אויסרעכענען די רעזולטאטן"></textarea></label>'+
  '<p class="muted">1 ביז 21 שריט, אויף טאג 1 ביז 7. מען קען איינמאליג שאפן, נאכפאלגן און פארענדיקן.</p>'+
  '<button class="primary">שאפן Focus־Sprint</button></form></section>';
 return form+'<section class="card"><h2>מיינע 7־טאגיקע Focus־פלענער</h2>'+
  sprintSummary+(sprintMeta?list||'<p class="muted">נאך קיין Sprint־פלענער.</p>':'')+
  pager(sprintMeta,'pro-sprints-page')+'</section>'+
  '<section class="card"><h2>פערזענליכע 30־טאגיקע Focus־געשיכטע</h2>'+
  '<p class="muted">וואס איז טאקע איינגעשריבן, אנגעהויבן און פארענדיגט געווארן אין דעם קאמפיין. נאר דיין אייגענע היסטאריע, אן קיין AI־אויסגעטראכטע געשעענישן.</p>'+
  historySummary+(historyMeta?history||'<p class="muted">נאך קיין Focus־געשיכטע.</p>':'')+
  pager(historyMeta,'pro-memory-page')+'</section>';
}
