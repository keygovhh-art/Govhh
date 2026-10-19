// Gabbai Pro staffing: actual open tasks and handoffs per active campaign member.
// No subjective employee ratings. Managers decide assignments themselves.
export function gabbaiWorkloadView(state,esc){
 const workload=state.gabbaiWorkload;
 if(!['owner','manager'].includes(state.gabbaiRole))return '';
 const t=workload?.totals||{};
 const members=workload?.members||[];
 const filter=['all','overdue','soon','unassigned'].includes(state.gabbaiWorkloadFilter)
  ?state.gabbaiWorkloadFilter:'all';
 const query=String(state.gabbaiWorkloadQuery||'').trim().toLocaleLowerCase().slice(0,120);
 const delayed=m=>Number(m.overdue_tasks||0)+Number(m.overdue_handoffs||0);
 const total=m=>Number(m.open_tasks||0)+Number(m.open_handoffs||0);
 const counts={all:members.length,overdue:members.filter(m=>delayed(m)>0).length,
  soon:members.filter(m=>Number(m.due_soon_tasks||0)>0).length,
  unassigned:members.filter(m=>total(m)===0).length};
 const filtered=members.filter(m=>
  (filter==='all'||(filter==='overdue'&&delayed(m)>0)||
   (filter==='soon'&&Number(m.due_soon_tasks||0)>0)||
   (filter==='unassigned'&&total(m)===0))&&
  (!query||[m.subject,m.team_name,m.role].some(v=>String(v||'').toLocaleLowerCase().includes(query))));
 const staff=filtered.map(m=>{
  const delayed=(m.overdue_tasks||0)+(m.overdue_handoffs||0);
  return '<article class="item"><div><strong>'+esc(m.subject)+'</strong>'+
   '<small>'+esc(m.team_name||'נישט אין א גרופע')+' · '+esc(m.role)+'</small>'+
   '<p class="muted">אפענע אויפגאבן: '+esc(m.open_tasks)+' · אפענע איבערגאבן: '+esc(m.open_handoffs)+
   ' · פארשפעטיגט: '+esc(delayed)+
   ' · טערמין אין 48 שעה: '+esc(m.due_soon_tasks)+'</p></div>'+
   '<button type="button" data-action="gabbai-workload-assign" data-subject="'+esc(m.subject)+'">איבערגעבן ארבעט</button></article>';
 }).join('');
 return '<section class="card"><h2>Gabbai Pro — אויפגאבן־לאסט פער עסקן</h2>'+
  '<p class="muted">אמתע ציפערן פון די צוגעטיילטע אויפגאבן און איבערגאבן. ס׳איז נישט קיין פערזענליכער ראַנג, און די מערכת צוטיילט נישט אליין קיין ארבעט.</p>'+
  '<div class="inline">'+[['all','אלע'],['overdue','פארשפעטיגט'],['soon','טערמין אין 48 שעה'],['unassigned','קיין צוגעטיילטע ארבעט']].map(([key,label])=>
   '<button type="button" data-action="gabbai-workload-filter" data-value="'+key+'" aria-pressed="'+(filter===key?'true':'false')+'">'+label+' ('+counts[key]+')</button>').join('')+'</div>'+
  '<form data-form="gabbai-workload-search" class="inline"><label>זוך אן עסקן אדער גרופע'+
  '<input type="search" name="query" maxlength="120" value="'+esc(state.gabbaiWorkloadQuery||'')+
  '" placeholder="נאמען אדער גרופע"></label><button>זוכן</button></form>'+
  '<p class="muted">געוויזן '+filtered.length+' פון '+members.length+
  ' אריינגעלאדענע מיטגלידער (מאקסימום '+esc(workload?.limit||500)+').'+
  ' קיינער אן צוגעטיילטע ארבעט איז נישט בהכרח פריי — איבערפרעגן איידער מען טיילט צו.</p>'+
  (state.gabbaiWorkloadError?'<p role="alert">'+esc(state.gabbaiWorkloadError)+'</p>':'')+
  '<div class="metrics"><div><span>אפענע אויפגאבן</span><strong>'+esc(t.openTasks||0)+'</strong></div>'+
  '<div><span>פארשפעטיגטע אויפגאבן</span><strong>'+esc(t.overdueTasks||0)+'</strong></div>'+
  '<div><span>אפענע איבערגאבן</span><strong>'+esc(t.openHandoffs||0)+'</strong></div>'+
  '<div><span>פארשפעטיגטע איבערגאבן</span><strong>'+esc(t.overdueHandoffs||0)+'</strong></div></div>'+
  (staff||'<p class="muted">קיינער איז נישט געפונען אינעם אויסגעקליבענעם פילטער. טויש דעם פילטער אדער דעם זוך־ווארט.</p>')+'</section>';
}
