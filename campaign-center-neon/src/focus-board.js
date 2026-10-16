// Server-grounded daily campaign focus. This is NOT an AI-generated forecast
// or the promised 7/30-day snapshot/Clarity module.
export function campaignFocusBoard(state,esc){
  const tasks=(state.tasks||[]).filter(t=>t.status!=='done'&&t.status!=='cancelled');
  const personal=tasks.filter(t=>t.assignee_subject===state.subject);
  const chosen=personal.length?personal:tasks;
  const owned=personal.length>0;
  const rank={critical:0,high:1,normal:2,low:3};
  const ordered=[...chosen].sort((a,b)=>{
    const date=x=>x.due_at?Date.parse(x.due_at):Number.POSITIVE_INFINITY;
    const da=date(a),db=date(b);
    const overdueA=Number.isFinite(da)&&da<=Date.now()?0:1;
    const overdueB=Number.isFinite(db)&&db<=Date.now()?0:1;
    return overdueA-overdueB||(rank[a.priority]??4)-(rank[b.priority]??4)||da-db;
  }).slice(0,3);
  const items=ordered.map((t,i)=>
   '<article class="item"><div><strong>'+(i+1)+'. '+esc(t.title)+'</strong>'+
   '<small>'+esc(t.kind)+' · '+esc(t.priority)+
   (t.due_at?' · '+esc(new Date(t.due_at).toLocaleString('en-US')):'')+'</small></div>'+
   '<button data-action="done" data-id="'+esc(t.id)+'">פארענדיגן</button></article>'
  ).join('');
  return '<section class="card"><h2>מיין היינטיגער קאמפיין־Focus</h2>'+
  '<p class="muted">'+(owned?'דיינע אייגענע דריי וויכטיגסטע אפענע אויפגאבן.':
   'דריי וויכטיגע אפענע אויפגאבן וואס דו מעגסט זען. אפגעזונדערטע פערזענליכע גבהה־נאטיצן ווערן דא נישט געוויזן.')+
  ' אויסגעקליבן לויט שטאפל און Deadline, נישט דורך אומבאשטעטיגטע AI.</p>'+
  (items||'<p class="muted">נאך קיין אפענע אויפגאבן. לייג אריין דעם ערשטן שריט אונטן.</p>')+
  '<p class="muted">Focus Memory / Clarity פאר 3, 7 און 30 טעג דארף נאך א באזונדערן מאסטער־אויפבוי.</p></section>';
}
