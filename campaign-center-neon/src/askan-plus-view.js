// Askan Plus uses only authenticated server totals. It does not claim that
// a subscription has been activated or a payment gateway confirmed donations.
export function askanPlusView(state,esc,money) {
 const desk=state.plusDesk;
 const report=state.plusReport;
 const credits=state.plusCredits||[];
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
 const alerts=state.plusAlerts;
 const overdue=(alerts?.overdueTasks||[]).map(t=>
  '<article class="item"><div><strong>'+esc(t.title)+'</strong>'+
  '<small>טערמין: '+esc(t.due_at?.slice(0,16)||'')+' · '+esc(t.priority)+
  (manager?' · צוגעטיילט: '+esc(t.assignee_subject):'')+'</small></div>'+ 
  (t.acknowledged_at?'<small>געזען דורך דיר</small>':
   '<button type="button" data-action="plus-alert-ack" data-id="'+esc(t.id)+'">איך האב געזען די ווארענונג</button>')+
  '</article>'
 ).join('');
 const quiet=manager?(alerts?.quietMembers||[]).map(m=>
  '<p class="muted">'+esc(m.subject)+' · '+esc(m.team_name||'נישט צוגעטיילט')+
  ' · לעצטע מאנועלע רוף־באריכט: '+esc(m.last_manual_call_at?.slice(0,10)||'קיינער')+'</p>'
 ).join(''):'';
 const creditMeta=state.plusCreditMeta;
 const manual=(currency,amount)=>esc(currency||'?')+' '+esc(String(amount??'0'));
 const creditRows=credits.map(item=>{
  const old=!item.current_campaign_member||item.member_status!=='active';
  return '<article class="item"><div><strong>'+esc(item.subject)+'</strong>'+
   '<small>גרופע יעצט: '+esc(item.team_name||'נישט צוגעטיילט')+
   (old?' · היסטארישער קרעדיט (נישט אקטיוו / נישט מער אינעם קאמפיין)':'')+
   '</small><p>צוגעזאגט: '+manual(item.currency,item.pledged)+
   ' · מאנועל באקומען: '+manual(item.currency,item.receipts)+
   ' · צוריקגעדרייט: '+manual(item.currency,item.refunds)+
   ' · נעטא: '+manual(item.currency,item.manual_net)+'</p>'+
   (Number(item.corrections)>0?'<p class="muted">באזונדערע קארעקטורן (נאכנישט אריינגערעכנט אינעם נעטא): '+
     manual(item.currency,item.corrections)+'</p>':'')+
   '</div></article>';
 }).join('');
 const ledgerTotals=(creditMeta?.currencyTotals||[]).map(t=>
  '<article class="item"><strong>'+esc(t.currency)+'</strong>'+
  '<p>צוגעזאגט: '+manual(t.currency,t.pledged)+' · באקומען: '+
  manual(t.currency,t.receipts)+' · צוריקגעדרייט: '+manual(t.currency,t.refunds)+
  ' · נעטא מאנועל באריכטעט: '+manual(t.currency,t.manual_net)+'</p>'+
  '<small>איינטראָגן: '+esc(t.ledger_event_count)+
  (manager?' · נישט צוגעטיילט פאר אן עסקן: '+esc(t.unattributed_events):'')+
  ' · קארעקטורן: '+manual(t.currency,t.corrections)+'</small></article>').join('');
 const creditPaging=creditMeta?.pageCount>1?
  '<nav class="inline" aria-label="קרעדיט־באריכט בלעטער">'+
  (creditMeta.page>1?'<button type="button" data-action="plus-credit-page" data-page="'+
   (creditMeta.page-1)+'">פריער</button>':'')+
  '<span>זייט '+esc(creditMeta.page)+' פון '+esc(creditMeta.pageCount)+'</span>'+
  (creditMeta.page<creditMeta.pageCount?
   '<button type="button" data-action="plus-credit-page" data-page="'+
    (creditMeta.page+1)+'">ווייטער</button>':'')+'</nav>':'';
 const creditPanel='<section class="card"><h2>קרעדיט פער עסקן — גאנצע היסטאריע</h2>'+
  '<p class="muted">אלע היסטארישע מאנועלע פינאנץ־איינטראָגן בלייבן אינעם חשבון, אויך ווען אן עסקן פארלאזט א קאמפיין. סומעס פון פארשידענע וואלוטעס ווערן קיינמאל נישט צוזאמענגערעכנט. קארעקטורן ווערן געוויזן באזונדער. דאס איז נישט באשטעטיגט דורך א באנק אדער פעימענט־פראוויידער.</p>'+
  (state.plusCreditError?'<p role="alert">'+esc(state.plusCreditError)+'</p>':'')+
  (creditMeta?'<p><strong>קרעדיט־רעקארדס: '+esc(creditMeta.totalCreditRows)+
    '</strong> · געוויזן אויף דעם בלאט: '+esc(creditMeta.shown)+'</p>'+
    '<h3>מאנועלע Ledger־ציפערן לויט וואלוטע</h3>'+
    (ledgerTotals||'<p class="muted">קיין מאנועלע געלט־איינטראָגן.</p>')+
    (creditRows||'<p class="muted">קיין פערזענליכע קרעדיט־רעקארדס אויף דעם בלאט.</p>')+
    creditPaging:
    '<p class="muted">דער פינאנץ־באריכט איז נאך נישט צוטריטבאר אין דעם סערווער־רעליס.</p>')+
  '</section>';
 const warnings='<section class="card"><h2>עסקן פלאס — היינטיגע ווארענונגען</h2>'+
   '<p class="muted">דער סיסטעם ציילט בלויז רעקארדירטע פארשפעטיגטע אויפגאבן. קיין Push אדער Email ווערן נישט געשיקט דורך דעם איבערבליק.</p>'+
   (alerts?'<p><strong>פארשפעטיגטע אויפגאבן: '+esc(alerts.overdueCount)+'</strong></p>'+
    (overdue||'<p class="muted">קיין פארשפעטיגטע אויפגאבן אין דיין ערלויבטן געביט.</p>')+
    (manager?'<h3>מאנשאפט אן מאנועלן רוף־באריכט אין 7 טעג</h3>'+
      '<p class="muted">דאס באדייט נישט אז דער עסקן האט נישט געארבעט.</p>'+
      (quiet||'<p class="muted">קיין אזעלכע באריכטן.</p>'):'')
    :'<p class="muted">די ווארענונגען זענען נאך נישט צוטריטבאר אויפן סערווער.</p>')+
   '</section>';
 const teams=(report?.teams||[]).map(team=>
  '<article class="item"><div><strong>'+esc(team.teamName||'נישט צוגעטיילט')+'</strong>'+
  '<small>אקטיווע עסקנים: '+count(team.activeMembers)+' · אויפגאבן: '+count(team.completed)+' / '+count(team.tasks)+
  ' · רוף־באריכטן: '+count(team.calls)+' · צוריק־רופן: '+count(team.callbacks)+'</small>'+
  '<p>התחייבויות: '+money(team.pledged)+' · נעטא מאנועל באריכטעט: '+money(team.manuallyReportedNet)+'</p></div></article>'
 ).join('');
 return '<section class="card"><h2>עסקן פלאס — מיין קאמפיין־דעשבאורד</h2>'+
  '<p class="muted">נאר דיינע באשטעטיגטע קאמפיין־צוטיילונגען, מאנועלע רוף־באריכטן און פינאנציעלע רעקארדס.</p>'+
  stats+'</section>'+creditPanel+warnings+
  (manager?'<section class="card"><h2>עסקן פלאס — גרופע־פארגלייך</h2>'+
   '<p class="muted">פאר דער הנהלה: בלויז צוזאמענגעשטעלטע גרופע־ציפערן. קיין פערזענליכע נדבן־נעמען אדער פריוואטע נאטיצן. א מאנועל באריכטעטע נדבה איז נישט א באשטעטיגטע באנק־באצאלונג.</p>'+
   '<label>באריכט־פעריאד<select data-action="plus-days">'+[7,30,90].map(d=>
     '<option value="'+d+'" '+(state.plusDays===d?'selected':'')+'>'+d+' טעג</option>').join('')+'</select></label>'+
   (report?teams||'<p class="muted">נאכנישטא קיין גרופע־רעזולטאטן.</p>':
    '<p role="status" class="muted">דער גרופע־באריכט איז נאך נישט גרייט אויפן סערווער.</p>')+
   '</section>':'');
}
