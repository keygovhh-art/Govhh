// Gabbai Pro staffing: actual open tasks and handoffs per active campaign member.
// No subjective employee ratings. Managers decide assignments themselves.
export function gabbaiWorkloadView(state,esc){
 const workload=state.gabbaiWorkload;
 if(!['owner','manager'].includes(state.gabbaiRole))return '';
 const t=workload?.totals||{};
 const staff=(workload?.members||[]).map(m=>{
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
  (state.gabbaiWorkloadError?'<p role="alert">'+esc(state.gabbaiWorkloadError)+'</p>':'')+
  '<div class="metrics"><div><span>אפענע אויפגאבן</span><strong>'+esc(t.openTasks||0)+'</strong></div>'+
  '<div><span>פארשפעטיגטע אויפגאבן</span><strong>'+esc(t.overdueTasks||0)+'</strong></div>'+
  '<div><span>אפענע איבערגאבן</span><strong>'+esc(t.openHandoffs||0)+'</strong></div>'+
  '<div><span>פארשפעטיגטע איבערגאבן</span><strong>'+esc(t.overdueHandoffs||0)+'</strong></div></div>'+
  (staff||'<p class="muted">נאך נישטא קיין אקטיווע קאמפיין־עסקנים מיט צוגעטיילטער ארבעט.</p>')+'</section>';
}
