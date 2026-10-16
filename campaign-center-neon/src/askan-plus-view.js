// Askan Plus uses only authenticated server totals. It does not claim that
// a subscription has been activated or a payment gateway confirmed donations.
export function askanPlusView(state,esc,money) {
 const desk=state.plusDesk;
 const report=state.plusReport;
 const role=state.overview?.campaign?.role;
 const manager=['owner','manager','finance','auditor'].includes(role);
 const count=v=>esc(v??0);
 const stats=desk?'<div class="metrics"><div><span>אייגענע אויפגאבן — אפן</span><strong>'+count(desk.tasks?.open)+'</strong></div>'+
  '<div><span>פארענדיגטע אויפגאבן</span><strong>'+count(desk.tasks?.done)+'</strong></div>'+
  '<div><span>פארשפעטיגטע אויפגאבן</span><strong>'+count(desk.tasks?.overdue)+'</strong></div>'+
  '<div><span>מאנועלע רופן — 7 טעג</span><strong>'+count(desk.calls?.last_seven_days)+'</strong></div>'+
  '</div><div class="inline"><span>צוגעזאגט: '+money(desk.finance?.pledged)+'</span>'+
  '<span>נעטא מאנועל באריכטעט: '+money(desk.finance?.manually_reported_net)+'</span></div>'+
  '<p class="muted">דיין גרופע: '+esc(desk.teamName||'נישט צוגעטיילט')+'. קיין פריוואטע MAX־נאטיצן ווערן נישט אריבערגעשיקט.</p>':
  '<p role="status">דער אייגענער דעשבאורד איז נאך נישט צוטריטבאר אין דעם סערווער־רעליס.</p>';
 const teams=(report?.teams||[]).map(team=>
  '<article class="item"><div><strong>'+esc(team.teamName||'נישט צוגעטיילט')+'</strong>'+
  '<small>אקטיווע עסקנים: '+count(team.activeMembers)+' · אויפגאבן: '+count(team.completed)+' / '+count(team.tasks)+
  ' · רוף־באריכטן: '+count(team.calls)+' · צוריק־רופן: '+count(team.callbacks)+'</small>'+
  '<p>התחייבויות: '+money(team.pledged)+' · נעטא מאנועל באריכטעט: '+money(team.manuallyReportedNet)+'</p></div></article>'
 ).join('');
 return '<section class="card"><h2>עסקן פלאס — מיין קאמפיין־דעשבאורד</h2>'+
  '<p class="muted">נאר דיינע באשטעטיגטע קאמפיין־צוטיילונגען, מאנועלע רוף־באריכטן און פינאנציעלע רעקארדס.</p>'+
  stats+'</section>'+
  (manager?'<section class="card"><h2>עסקן פלאס — גרופע־פארגלייך</h2>'+
   '<p class="muted">פאר דער הנהלה: בלויז צוזאמענגעשטעלטע גרופע־ציפערן. קיין פערזענליכע נדבן־נעמען אדער פריוואטע נאטיצן. א מאנועל באריכטעטע נדבה איז נישט א באשטעטיגטע באנק־באצאלונג.</p>'+
   '<label>באריכט־פעריאד<select data-action="plus-days">'+[7,30,90].map(d=>
     '<option value="'+d+'" '+(state.plusDays===d?'selected':'')+'>'+d+' טעג</option>').join('')+'</select></label>'+
   (report?teams||'<p class="muted">נאכנישטא קיין גרופע־רעזולטאטן.</p>':
    '<p role="status" class="muted">דער גרופע־באריכט איז נאך נישט גרייט אויפן סערווער.</p>')+
   '</section>':'');
}
