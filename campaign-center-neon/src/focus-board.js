// Chesed Quick: server-selected top three from ALL authorized campaign tasks.
// Never rank the 200 most recent items returned by the legacy task list.
export function campaignFocusBoard(state,esc){
 const focus=state.quickFocus;
 if(!focus||focus.allVisibleTasksConsidered!==true||!Array.isArray(focus.tasks)){
  return '<section class="card"><h2>מיין היינטיגער קאמפיין־Focus</h2>'+
   '<p role="alert">דער פולער Focus־באריכט איז נישט באשטעטיגט פונעם סערווער: '+
   esc(state.quickFocusError||'פארבינדונג נישט גרייט')+
   '. מיר ווייזן נישט קיין אפגעשניטענע ליסטע אלס א פולן באריכט.</p></section>';
 }
 const items=focus.tasks.map((t,i)=>
  '<article class="item"><div><strong>'+esc(i+1)+'. '+esc(t.title)+'</strong>'+
  '<small>'+esc(t.kind)+' · '+esc(t.priority)+
  (t.due_at?' · '+esc(String(t.due_at).slice(0,16)):'')+
  '</small></div><button type="button" data-action="done" data-id="'+esc(t.id)+
  '">פארענדיגן</button></article>'
 ).join('');
 const description=focus.chosenScope==='personal'?
  'דיינע אייגענע אפענע אויפגאבן ווערן ערשט באהאנדלט.':
  'די דריי וויכטיגסטע אפענע אויפגאבן פון די קאמפיין־אויפגאבן וואס דו מעגסט זען.';
 return '<section class="card"><h2>מיין היינטיגער קאמפיין־Focus</h2>'+
  '<p class="muted">'+description+
  ' סך־הכל ערלויבטע אפענע אויפגאבן: '+esc(focus.visibleOpenTaskCount)+
  ' · אייגענע אפענע: '+esc(focus.ownOpenTaskCount)+
  ' · געוויזן ביז 3. אויסגעקליבן אויפן סערווער פון אלע ערלויבטע אויפגאבן לויט פארשפעטיגונג, פריאריטעט און טערמין; נישט דורך אומבאשטעטיגטע AI.</p>'+
  (items||'<p class="muted">דערווייל קיין אפענע אויפגאבן אין דיין ערלויבטן קאמפיין־ארבעטס־פלאץ.</p>')+
  '</section>';
}
