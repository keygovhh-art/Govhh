// Web text coordination room. Not a telephone bridge, conference, microphone or SIP service.
export function hallView(state,esc){
 const role=state.overview?.campaign?.role;
 const manager=['owner','manager'].includes(role);
 const rooms=state.rooms||[];
 const active=rooms.find(x=>x.id===state.joinedRoomId);
 const entries=rooms.map(r=>{
  const joined=state.joinedRoomId===r.id;
  return '<article class="item '+(state.requestedRoomId===r.id?'requested-hall':'')+'"><div><strong>'+esc(r.title)+'</strong>'+ (state.requestedRoomId===r.id?'<small>דאס איז דער קאמפיין־זאל וואס דו האסט געעפנט פון MAX. דרוק אריינגיין — א לינק אליין גיט נישט קיין צוטריט.</small>':'')+
    '<small>'+esc(r.room_status)+' · לעצטנס פארבונדענע: '+esc(r.recently_connected)+' (וועב בלויז)</small></div>'+
    '<div class="actions">'+
    (r.room_status==='open'?
     (joined?'<button data-action="hall-leave" data-id="'+esc(r.id)+'">פארלאזן</button>':
      '<button data-action="hall-join" data-id="'+esc(r.id)+'">אריינגיין</button>'):'')+
    (manager&&r.room_status==='planned'?'<button data-action="hall-open" data-id="'+esc(r.id)+'">עפענען</button>':'')+
    (manager&&r.room_status==='paused'?'<button data-action="hall-open" data-id="'+esc(r.id)+'">ווייטער</button>':'')+
    (manager&&r.room_status==='open'?'<button data-action="hall-pause" data-id="'+esc(r.id)+'">פאוז</button>':'')+
    (manager&&r.room_status!=='ended'?'<button data-action="hall-end" data-id="'+esc(r.id)+'">פארענדיקן</button>':'')+
    '</div></article>';
 }).join('');
 const announcements=(state.hallAnnouncements||[]).map(a=>
  '<article class="item"><div><strong>'+esc(a.authored_by)+'</strong>'+
  '<small>'+esc((a.created_at||'').slice(0,16))+'</small><p>'+esc(a.message)+'</p></div></article>'
 ).join('');
 return '<section class="card"><h2>כח הרבים — וועב־עסקנים־זאל</h2>'+
  '<p class="muted">דאס איז בלויז אן אינערליכער וועב־ארבעטס־זאל מיט אנווייזונגען. עס האט נישט קיין טעלעפאן־קאנפערענץ, מייקראפאן אדער אויטאמאטישע רופן. ציפערן ווייזן נאר באנוצער וואס האבן זיך לעצטנס אנגעמאלדן.</p>'+
  (manager?'<form data-form="hall-new" class="inline"><input name="title" required maxlength="180" placeholder="נאמען פונעם נייעם זאל"><button>צוגרייטן א זאל</button></form>':'')+
  '<div class="inline"><button data-action="hall-refresh">דערפרישן זאלן</button></div>'+
  (entries||'<p class="muted">נאכנישטא קיין וועב־זאלן.</p>')+'</section>'+
  (active?'<section class="card"><h2>'+esc(active.title)+' — אנווייזונגען</h2>'+
  '<p class="muted">פערזענליכע נדבן־רופן זענען פריוואט; שרייב נישט קיין נדבן־טעלעפאן אדער געהיימע פרטים אינעם זאל.</p>'+
  (manager?'<form data-form="hall-message" class="stack"><textarea name="message" required maxlength="800" rows="3" placeholder="אנווייזונג פון מנהל"></textarea><button>שיקן אנווייזונג</button></form>':'')+
  (announcements||'<p class="muted">נאך קיין אנווייזונגען.</p>')+'</section>':'');
}
