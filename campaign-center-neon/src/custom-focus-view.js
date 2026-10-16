// Custom tier: explicit user-defined weights and source-backed previews.
// Never starts calls, jobs or donor messages and is not an AI prediction.
export function customFocusView(state,esc){
 const rules=state.customFocusRules;
 const weights=rules?.weights||{overdueWeight:40,dueSoonWeight:15,highPriorityWeight:20,followupWeight:10};
 const labels=[['overdueWeight','אויפגאבן שוין איבערן טערמין'],['dueSoonWeight','קומענדיגע 48 שעה'],['highPriorityWeight','הויך וויכטיג'],['followupWeight','קשר־נאכפאלגן']];
 const input=labels.map(([key,name])=>
  '<label>'+name+' — 0 ביז 100<input type="number" min="0" max="100" step="1" required name="'+key+
  '" value="'+esc(weights[key])+'"></label>').join('');
 const list=(state.customFocusPreview?.recommendations||[]).map((r,index)=>
  '<article class="item"><div><strong>'+(index+1)+'. '+esc(r.title)+'</strong>'+
  '<small>'+esc(r.source==='crm_followup'?'קשר־נאכפאלג':'אויפגאבע')+
  ' · וויכטיגקייט: '+esc(r.priority||'נארמאל')+
  ' · טערמין: '+esc(r.dueAt?.slice(0,16)||'נישט באשטימט')+
  ' · חשיבות־פונקטן: '+esc(r.score)+'</small></div></article>').join('');
 return '<section class="card"><h2>Custom — אייגענע Focus־כללים</h2>'+
  '<p class="muted">די מערכת רעכנט די פונקטן לויטן מנהלס כללים. דער אויסגעוויזענער סדר נעמט נאר די ערלויבטע קאמפיין־אויפגאבן און קשרים. קיינע רופן אדער אויטאמאטישע אקציעס ווערן נישט געטאן.</p>'+
  (state.customFocusError?'<p role="alert">'+esc(state.customFocusError)+'</p>':'')+
  (rules?.entitlementNotYetEnforced?'<p class="muted">דאס איז א Custom־טעסט־פונקציע. די באצאלטע פלאן־רעכטן זענען נאך נישט איינגעפירט אין פראדוקציע.</p>':'')+
  (rules?.canEdit?'<form data-form="custom-focus-rules" class="stack">'+input+
   '<p class="muted">כאטש איינע פון די פיר חשיבות־וואגנס מוז זיין העכער 0. ענדערונגען ווערן אפגעהיטן אין דער געשיכטע.</p>'+
   '<button>אפהיטן Custom Focus־כללים</button></form>':'<p class="muted">בלויז א מוסד־מנהל קען רעדאגירן די כללים.</p>')+
  '</section><section class="card"><h2>אויסגערעכנטע קומענדיגע שריט</h2>'+
  (list||'<p class="muted">קיינע אפענע ערלויבטע אויפגאבן אין דעם קאמפיין.</p>')+'</section>';
}
