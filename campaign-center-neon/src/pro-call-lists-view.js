// Askan Pro: manual caller's CRM list, not a dialing system.
export function proCallListView(state,esc){
 const enabled=state.entitlements?.usableFeatures?.includes('advanced_call_lists');
 if(!enabled)return '<section class="card"><h2>רוף־ליסטעס</h2><p>דארף אקטיוון Askan Pro־רעכט.</p></section>';
 const d=state.proCallList||{contacts:[],totalMatching:0};
 const modes=[['due','פארשפעטיגטע נאכפאלגן'],['high','וויכטיגע קשרים'],['all','אלע ערלויבטע קשרים']];
 const opts=modes.map(([key,label])=>
  '<option value="'+key+'" '+(state.proCallListMode===key?'selected':'')+'>'+label+'</option>').join('');
 const cards=(d.contacts||[]).map(c=>'<article class="item"><div>'+
  '<strong>'+esc(c.display_name)+'</strong>'+
  '<small>'+esc(c.phone)+' · '+esc(c.priority)+' · '+esc(c.stage)+
  (c.next_followup_at?' · טערמין '+esc(String(c.next_followup_at).slice(0,16)):'')+'</small></div>'+
  '<button type="button" data-action="pro-call-list-open" data-id="'+esc(c.id)+'">עפענען קשר</button></article>').join('');
 return '<section class="card"><h2>Askan Pro — פארגעשריטענע רוף־ליסטעס</h2>'+
  '<p class="muted">נאר ערלויבטע קשרים, אן די וואס האבן Do Not Call אדער זענען פארנומען דורך אן אנדערן עסקן. קיין קאל ווערט נישט אויטאמאטיש געמאכט; מען ארבעט מיט די קשרים איינס נאכן אנדערן.</p>'+
  '<form data-form="pro-call-list-filter" class="inline">'+
  '<label>סארט ליסטע<select name="mode">'+opts+'</select></label>'+
  '<label>וויפיל ווייזן<select name="limit">'+[10,20,30,50].map(n=>
    '<option value="'+n+'" '+(state.proCallListLimit===n?'selected':'')+'>'+n+'</option>').join('')+
  '</select></label><button>ווייז די ליסטע</button></form>'+
  (state.proCallListError?'<p role="alert">'+esc(state.proCallListError)+'</p>':'')+
  '<p class="muted"><strong>'+esc(d.totalMatching??0)+'</strong> ערלויבטע קשרים אינעם אויסגעקליבענעם פילטער. געוויזן '+esc(d.shown??0)+'.</p>'+
  (cards||'<p class="muted">דערווייל נישטא קיין רוף־קשרים אין דעם פילטער.</p>')+'</section>';
}
