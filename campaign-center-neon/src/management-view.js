// Yiddish RTL management command center, based solely on authenticated actual
// campaign records and deliberately entered human progress, never AI guesses.
export const managementLabels={
 planned:'געפלאנט',ready:'גרייט אנצוהייבן',in_progress:'אין ארבעט',
 waiting:'ווארט אויף ענטפער',blocked:'פארהינדערט',failed:'נישט מצליח',
 successful:'מצליח',completed:'פארענדיגט',cancelled:'אפגעשטעלט'
};
const priorities={normal:'נארמאל',high:'וויכטיג',critical:'קריטיש'};
const escValue=(v,esc)=>esc(String(v??''));
const valueDate=iso=>{
 if(!iso)return '';
 const date=new Date(iso);
 if(!Number.isFinite(date.getTime()))return '';
 return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
};
export function managementView(state,esc){
 const data=state.management;
 const counts=data?.counts||{};
 const filter=state.managementFilter||'all';
 const selected=(data?.items||[]).find(x=>x.id===state.managementEditorId);
 const editing=Boolean(selected);
 const chosen=selected||{status:'planned',priority:'normal',progress:0,title:'',
  details:'',next_action:'',waiting_on:'',issue_reason:'',due_at:null,
  assigned_to:'',campaign_id:''};
 const statusSelect=(current)=>Object.entries(managementLabels).map(([key,label])=>
  '<option value="'+key+'"'+(key===current?' selected':'')+'>'+esc(label)+'</option>').join('');
 const urgency=(data?.signals||{});
 const signalCards=[
  ['overdue_tasks','פארשפעטיגטע אויפגאבן'],
  ['open_tasks','אפענע אויפגאבן'],
  ['completed_tasks','פארענדיגטע אויפגאבן'],
  ['completed_handoffs','פארענדיגטע איבערגאבן'],
  ['pending_guidance','בקשות אויף הילף וואס ווארטן'],
  ['answered_guidance','פארענטפערטע בקשות'],
  ['approved_approvals','באשטעטיגטע פינאנץ־בקשות'],
  ['rejected_approvals','אפגעווארפענע פינאנץ־בקשות'],
  ['blocked_handoffs','פארהינדערטע איבערגאבן'],
  ['open_handoffs','איבערגאבן נאך אין ארבעט'],
  ['pending_approvals','פינאנץ־בקשות וואס ווארטן'],
  ['pending_decisions','אפענע הנהלה־באשלוסן'],
  ['overdue_plans','פארשפעטיגטע פלענער']
 ].map(([key,label])=>'<div><span>'+label+'</span><strong>'+
  escValue(urgency[key]??'—',esc)+'</strong></div>').join('');
 const actionQueue=state.managementQueue||'all';
 const workQueues=[
  ['all','אלע פלענער'],
  ['mine','מיינע צוגעטיילטע פלענער'],
  ['needs_action','דארף באהאנדלונג'],
  ['overdue','פארשפעטיגט'],
  ['due_soon','טערמין אין 48 שעה'],
  ['unassigned','נישט צוגעטיילט']
 ];
 const workButtons=workQueues.map(([key,label])=>
  '<button type="button" data-action="management-queue" data-value="'+key+'" '+
  'aria-pressed="'+(actionQueue===key?'true':'false')+'">'+esc(label)+' ('+
  escValue(data?.queueCounts?.[key]??0,esc)+')</button>').join('');
 const filters=[['all','אלעס'],...Object.entries(managementLabels)].map(([key,label])=>
  '<button type="button" data-action="management-filter" data-value="'+key+'" '+
  'aria-pressed="'+(filter===key?'true':'false')+'">'+esc(label)+' ('+
  escValue(key==='all'?data?.total??0:counts[key]??0,esc)+')</button>').join('');
 const records=(data?.items||[]).map(item=>{
  const overdue=item.due_at&&!['completed','successful','cancelled'].includes(item.status)&&
   new Date(item.due_at).getTime()<Date.now();
  const waiting=['waiting','blocked','failed'].includes(item.status);
  return '<article class="item"><div><strong>'+esc(item.title)+'</strong>'+
   '<small>'+esc(managementLabels[item.status]||item.status)+' · '+
   escValue(item.progress,esc)+'% · '+esc(priorities[item.priority]||item.priority)+
   (overdue?' · פארשפעטיגט':'')+'</small>'+
   (item.details?'<p>'+esc(item.details)+'</p>':'')+
   (item.campaign_title?'<p>קאמפיין: '+esc(item.campaign_title)+'</p>':'')+
   (item.assigned_to?'<p>פאראנטווארטליך: '+esc(item.assigned_to)+'</p>':'')+
   (item.next_action?'<p><strong>וואס ווייטער?</strong> '+esc(item.next_action)+'</p>':'')+
   (waiting?'<p><strong>פארוואס עס שטייט:</strong> '+esc(item.issue_reason||'')+'</p>':'')+
   (item.waiting_on?'<p><strong>מען ווארט אויף:</strong> '+esc(item.waiting_on)+'</p>':'')+
   (item.due_at?'<small>טערמין: '+esc(String(item.due_at).slice(0,16))+'</small>':'')+
   '<small>לעצטע ענדערונג: '+esc(String(item.updated_at||'').slice(0,16))+'</small>'+
   '</div><div class="inline">'+
   '<button type="button" data-action="management-edit" data-id="'+esc(item.id)+'">באהאנדלען / אפדעיטן</button>'+
   '<button type="button" data-action="management-history" data-id="'+esc(item.id)+'">פארשריט־היסטאריע</button>'+
   '</div></article>';
 }).join('');
 const pick='<option value="">פארן גאנצן מוסד</option>'+
  (state.campaigns||[]).map(c=>
   '<option value="'+esc(c.id)+'"'+(chosen.campaign_id===c.id?' selected':'')+'>'+
   esc(c.title)+'</option>').join('');
 const editor='<section class="card"><h2>'+(editing?'אפטעיטן דעם פלאן':'צולייגן א נייעם פלאן')+'</h2>'+
  '<p class="muted">די הנהלה שרייבט די אמתע מצב; הצלחה אדער דורכפאל ווערט נישט אויטאמאטיש געמשפט. נאך יעדן טויש בלייבט א היסטאריע.</p>'+
  '<form data-form="management-save" class="stack">'+
  '<label>וואס איז די אויפגאבע אדער פלאן?<input name="title" required maxlength="180" value="'+esc(chosen.title)+'"></label>'+
  '<label>קאמפיין<select name="campaignId">'+pick+'</select></label>'+
  '<label>וואס דארף געשען?<textarea name="details" rows="2" maxlength="1800">'+esc(chosen.details||'')+'</textarea></label>'+
  '<div class="inline"><label>מצב<select name="status">'+statusSelect(chosen.status)+'</select></label>'+
  '<label>פריאריטעט<select name="priority">'+Object.entries(priorities).map(([key,label])=>
   '<option value="'+key+'"'+(chosen.priority===key?' selected':'')+'>'+esc(label)+'</option>').join('')+'</select></label></div>'+
  '<label>וויפיל פראצענט פארטיג? (0 ביז 100)<input name="progress" type="number" min="0" max="100" step="1" required value="'+escValue(chosen.progress??0,esc)+'"></label>'+
  '<label>ווער איז פאראנטווארטליך? (מיטגליד־ID, אויב פאראן)<input name="assignedTo" maxlength="128" value="'+esc(chosen.assigned_to||'')+'"></label>'+
  '<label>קומענדיגער שריט<input name="nextAction" maxlength="500" value="'+esc(chosen.next_action||'')+'"></label>'+
  '<label>אויף וועמען/וואס מען ווארט?<input name="waitingOn" maxlength="200" value="'+esc(chosen.waiting_on||'')+'"></label>'+
  '<label>סיבה פון ווארטן / שטערונג / דורכפאל<input name="issueReason" maxlength="500" value="'+esc(chosen.issue_reason||'')+'"></label>'+
  '<label>ציל־טערמין<input name="dueAt" type="datetime-local" value="'+esc(valueDate(chosen.due_at))+'"></label>'+
  '<label>הערה פאר דער היסטאריע<input name="note" maxlength="500"></label>'+
  '<div class="inline"><button type="submit">'+(editing?'אפהיטן דעם אפדעיט':'שאפן דעם פלאן')+'</button>'+
  (editing?'<button type="button" data-action="management-new">צוריק צום נייעם פלאן</button>':'')+
  '</div></form></section>';
 const logs=state.managementHistoryId?'<section class="card"><h2>יעדער טויש — קלארע היסטאריע</h2>'+
  '<button type="button" data-action="management-close-history">פארמאכן היסטאריע</button>'+
  (state.managementHistoryError?'<p role="alert">'+esc(state.managementHistoryError)+'</p>':'')+
  (state.managementHistory?.history||[]).map(row=>
   '<article class="item"><div><strong>'+esc(managementLabels[row.after_state?.status]||row.event_kind)+
   ' · '+escValue(row.after_state?.progress??0,esc)+'%</strong>'+
   '<small>דורך '+esc(row.actor_subject)+' · '+esc(String(row.recorded_at||'').slice(0,16))+'</small>'+
   (row.note?'<p>'+esc(row.note)+'</p>':'')+
   (row.after_state?.next_action?'<p>קומענדיג: '+esc(row.after_state.next_action)+'</p>':'')+
   '</div></article>').join('')+
   ((state.managementHistory?.pageCount||1)>1?'<div class="inline"><span>זייט '+escValue(state.managementHistory.page,esc)+
    ' פון '+escValue(state.managementHistory.pageCount,esc)+'</span>'+
    (state.managementHistory.page>1?'<button type="button" data-action="management-history-page" data-page="'+(state.managementHistory.page-1)+'">פריער</button>':'')+
    (state.managementHistory.page<state.managementHistory.pageCount?'<button type="button" data-action="management-history-page" data-page="'+(state.managementHistory.page+1)+'">ווייטער</button>':'')+
    '</div>':'')+
  '</section>':'';
 return '<section class="card"><h2>מענעדזשמענט — דער גאנצער מצב אויף איין פלאץ</h2>'+
  '<p class="muted">א פערזענליכע הנהלה־רשימה פון אלע פלענער, הצלחות, דורכפעלער, ווארטן און קומענדיגע שריט. דער לוח נעמט אויך סך־הכלן פון די אמתע קאמפיין־רעקארדס; קיין באנק־געלט ווערט דא נישט באשטעטיגט.</p>'+
  (state.managementError?'<p role="alert">'+esc(state.managementError)+'</p>':'')+
  '<h3>וואו דארף מען יעצט אריינקוקן?</h3><div class="metrics">'+signalCards+'</div>'+
  '<h3>וואס דארף איך יעצט טון?</h3>'+
  '<p class="muted">די שנעלע ליסטעס קומען פונעם גאנצן מוסד, נישט בלויז די 40 רעקארדס אויף דער זייט. די מיינע־ליסטע איז נאר פאר די פלאן־אויפגאבעס וואס זענען דיר פאקטיש צוגעטיילט.</p>'+
  '<div class="inline">'+workButtons+'</div>'+
  '<h3>סטאטוס פון אלע איינגעשריבענע פלענער</h3>'+
  '<div class="inline">'+filters+'</div>'+
  '<form data-form="management-search" class="inline"><label>זוך פלאן, שריט אדער פאראנטווארטליכן'+
  '<input name="query" maxlength="120" value="'+esc(state.managementQuery||'')+'"></label><button>זוכן</button></form>'+
  '<p class="muted">געפונען '+escValue(data?.matching??0,esc)+' פון '+escValue(data?.total??0,esc)+
  ' פלענער. א מענטש דארף אפדעיטן די סטאטוסן; דער סיסטעם וועט נישט אויסטראכטן וואס איז געלונגען.</p>'+
  (records||'<p class="muted">קיין פלענער אינעם אויסגעקליבענעם פילטער.</p>')+
  (data?.pageCount>1?'<nav class="inline" aria-label="בלעטער פלענער">'+
   (data.page>1?'<button type="button" data-action="management-page" data-page="'+(data.page-1)+'">פריער</button>':'')+
   '<span>זייט '+escValue(data.page,esc)+' פון '+escValue(data.pageCount,esc)+'</span>'+
   (data.page<data.pageCount?'<button type="button" data-action="management-page" data-page="'+(data.page+1)+'">ווייטער</button>':'')+
   '</nav>':'')+'</section>'+editor+logs;
}
