// Authenticated goals for a single selected campaign. All values come from server.
const format=n=>Number(n||0).toLocaleString('en-US',{maximumFractionDigits:2});
export function goalsView(state,esc){
 const role=state.overview?.campaign?.role,manager=['owner','manager'].includes(role);
 const goals=state.goals||[];
 const meta=state.goalsMeta;
 const allowed=Number(meta?.goalLimit||3);
 const total=Number(meta?.total??goals.length);
 const page=Number(meta?.page||1),pages=Number(meta?.pageCount||1);

 const names={money:'געלט',members:'עסקנים',calls:'רופן',pledges:'התחייבויות',tasks:'אויפגאבן',custom:'אנדערע'};
 const statuses={active:'אקטיוו',at_risk:'אין געפאר',completed:'פארענדיגט',paused:'אפגעשטעלט',archived:'ארכיווירט'};
 const form=manager?'<section class="card"><h2>נייער באזונדערער ציל</h2>'+
  '<p class="muted">דער איצטיגער סערווער־פלאן ערלויבט '+esc(allowed)+' נישט־ארכיווירטע צילן פער קאמפיין. די העכערע צאלן דארפן אן באשטעטיגטע פלאן־צוטיילונג; דער סקרין קען נישט אליין העכערן די גרעניצן.</p>'+
  '<form data-form="goal" class="stack"><label>ציל־נאמען<input name="title" required maxlength="160" placeholder="צום ביישפיל: 50 רופן"></label>'+
  '<label>סארט<select name="category">'+Object.entries(names).map(([code,name])=>'<option value="'+code+'">'+name+'</option>').join('')+'</select></label>'+
  '<label>וויפיל איז דער ציל?<input required name="targetValue" min="0.01" step="0.01" type="number"></label>'+
  '<label>דאטום<input name="dueOn" type="date"></label>'+
  '<label>באשרייבונג<textarea name="description" maxlength="1000"></textarea></label>'+
  '<button class="primary">אפהיטן דעם ציל</button></form></section>':'';
 const rows=goals.map(goal=>{
   const target=Number(goal.target_value),current=Number(goal.current_value);
   const percent=target>0?Math.min(100,Math.round(current/target*100)):0;
   return '<article class="item"><div><strong>'+esc(goal.title)+'</strong>'+
    '<small>'+esc(names[goal.category]||goal.category)+' · '+esc(statuses[goal.status]||goal.status)+
    (goal.due_on?' · '+esc(goal.due_on.slice(0,10)):'')+'</small>'+
    '<p>'+format(current)+' / '+format(target)+' — '+percent+'%</p>'+
    '<progress max="100" value="'+percent+'" aria-label="ציל פארשריט"></progress>'+
    (goal.description?'<p class="muted">'+esc(goal.description)+'</p>':'')+'</div>'+
    (manager?'<form data-form="goal-update" data-goal-id="'+esc(goal.id)+'" class="inline">'+
      '<input type="hidden" name="expectedVersion" value="'+esc(goal.version??0)+'">'+
      '<label>יעצט <input name="currentValue" type="number" min="0" step="0.01" required value="'+esc(goal.current_value)+'"></label>'+
      '<label>מצב <select name="status">'+Object.entries(statuses).filter(([code])=>code!=='archived').map(([code,name])=>'<option value="'+code+'" '+(goal.status===code?'selected':'')+'>'+name+'</option>').join('')+'</select></label>'+
      '<button type="submit">אפהיטן</button><button type="button" data-action="goal-archive" data-id="'+esc(goal.id)+'">ארכיוו</button>'+
      '<button type="button" data-action="goal-history" data-id="'+esc(goal.id)+'">ציל־היסטאריע</button></form>':'')+'</article>';
 }).join('');
 const audit=state.goalHistoryData,selected=state.goalHistoryId;
 const auditLabels={created:'געשאפן',updated:'געענדערט',archived:'ארכיווירט'};
 const auditPanel=selected&&manager?
  '<section class="card"><h3>ציל־היסטאריע — ווער האט וואס געטון?</h3>'+
  '<p class="muted">יעדער ענדערונג ווערט געהיטן אומפארענדערליך אין דער קאמפיין־דאטאבאזע; בלויז בארעכטיגטע מנהלים זעען די היסטאריע.</p>'+
  '<button type="button" data-action="goal-history-close">פארמאכן</button>'+
  (state.goalHistoryError?'<p role="alert">'+esc(state.goalHistoryError)+'</p>':'')+
  (audit?'<p>איינטראָגן סך־הכל: '+esc(audit.total)+'</p>'+
   (audit.history||[]).map(entry=>'<article class="item"><strong>'+
    esc(auditLabels[entry.event_kind]||entry.event_kind)+'</strong>'+
    '<p>'+esc(entry.actor_subject)+' · '+esc(String(entry.created_at??'').slice(0,19))+
    '</p><p>מצב: '+esc(entry.status??'—')+
    ' · באריכטעטע צאל: '+esc(entry.current_value??'—')+'</p></article>').join('')+
   ((audit.pageCount||1)>1?'<nav class="inline">'+
    (audit.page>1?'<button type="button" data-action="goal-history-page" data-page="'+(audit.page-1)+'">פריער</button>':'')+
    '<span>זייט '+esc(audit.page)+' פון '+esc(audit.pageCount)+'</span>'+
    (audit.page<audit.pageCount?'<button type="button" data-action="goal-history-page" data-page="'+(audit.page+1)+'">ווייטער</button>':'')+'</nav>':'')
   :'<p>היסטאריע ווערט יעצט געלאדנט.</p>')+'</section>':'';
 const paging=meta&&pages>1?'<nav class="inline" aria-label="קאמפיין־צילן בלעטער">'+
 (page>1?'<button type="button" data-action="goal-page" data-page="'+(page-1)+'">פריער</button>':'')+
 '<span>זייט '+esc(page)+' פון '+esc(pages)+'</span>'+
 (page<pages?'<button type="button" data-action="goal-page" data-page="'+(page+1)+'">ווייטער</button>':'')+
 '</nav>':'';
 return form+'<section class="card"><h2>קאמפיין־צילן <span class="count">'+esc(total)+'</span></h2>'+
 (meta?'<p class="muted">געוויזן '+esc(goals.length)+' פון '+esc(total)+
  ' צילן · איצטיגער פלאן־לימיט: '+esc(allowed)+' פער קאמפיין. קיין צילן ווערן נישט באהאלטן אינעם חשבון.</p>':
  '<p class="muted">דער סך־הכל ווערט ערשט באשטעטיגט דורך דעם סערווער.</p>')+
 (state.goalsError?'<p role="alert">צילן־דאטעבאזע נאך נישט גרייט: '+esc(state.goalsError)+'</p>':'')+
 (rows||'<p class="muted">נאך קיין צילן אויף דעם בלאט. דער הויפט געלט־ציל איז אין קאמפיין־פארוואלטונג.</p>')+paging+'</section>'+auditPanel;
}
