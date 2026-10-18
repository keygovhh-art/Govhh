// Gabbai Pro internal maker-checker approvals. No card/bank payments occur.
export function gabbaiApprovalsView(state,esc,money){
 const canMake=['owner','manager','finance'].includes(state.gabbaiRole);
 const canReview=['owner','manager'].includes(state.gabbaiRole);
 const categories={planned_expense:'געפלאנטע הוצאה',manual_adjustment:'פארשלאג צו קארעקטירן רעקארד',
  refund_review:'בקשה איבער א צוריקצאלונג',other:'אנדערע'};
 const statuses={pending:'ווארט אויף באשטעטיגונג',approved:'באשטעטיגט',rejected:'אפגעווארפן'};
 const priorityTeams=state.gabbaiPriorities?.teams||[];
 const urgentItems=(state.gabbaiPriorities?.urgentTasks||[]).map(t=>{
  const overdue=t.due_at&&Date.parse(t.due_at)<Date.now();
  return '<article class="item"><div><strong>'+esc(t.title)+'</strong>'+
    '<small>'+esc(t.team_name||'אן א גרופע')+' · '+esc(t.assignee_subject)+
    ' · '+esc(t.priority)+' · '+esc(t.status)+
    (t.due_at?' · טערמין '+esc(String(t.due_at).slice(0,16)):'')+
    (overdue?' · פארשפעטיגט':'')+'</small></div><div class="inline">'+
    (t.status==='open'?'<button data-action="gabbai-task-status" data-id="'+esc(t.id)+
    '" data-status="in_progress">אנהייבן</button>':'')+
    '<button data-action="gabbai-task-status" data-id="'+esc(t.id)+
    '" data-status="done">פארענדיגן</button></div></article>';
 }).join('');
 const priorityBoard=state.gabbaiPriorities?
  '<section class="card"><h2>Gabbai Pro — וויכטיגע גרופע־שריט</h2>'+
  '<p class="muted">דער סדר איז לויט פארשפעטיגטע אויפגאבן, דערנאך באריכטעטע שטערונגען. דער באריכט איז נאר פאר דער הנהלה און זאגט נישט ווער האט גוט אדער שלעכט געארבעט.</p>'+
  (priorityTeams.map(x=>'<article class="item"><div><strong>'+esc(x.team_name||'נישט צוגעטיילט')+
    '</strong><small>אקטיווע עסקנים: '+esc(x.active_members)+'</small>'+
    '<p>אפענע אויפגאבן: '+esc(x.open_tasks)+' · פארשפעטיגט: '+esc(x.overdue_tasks)+
    ' · באריכטעטע שטערונגען: '+esc(x.active_blockers)+'</p></div></article>').join('')||
   '<p class="muted">קיין אקטיווע גרופעס אין דעם קאמפיין.</p>')+
  '<h3>דרינגליכע אויפגאבן — גלייך צו באהאנדלען</h3>'+
  '<p class="muted">די ערשטע 25 אפענע, וויכטיגע אדער נאנטע־טערמין אויפגאבן. א באשלוס דא טוישט זייער אמתן סטאטוס.</p>'+
  (urgentItems||'<p class="muted">נישטא קיין דרינגליכע רעקארדירטע אויפגאבן.</p>')+'</section>':'';
 const ledger=state.gabbaiLedger;
 const net=ledger?.totals||{};
 const ledgerRows=(ledger?.bySource||[]).map(x=>
  '<article class="item"><div><strong>'+esc(x.source_system)+' — '+esc(x.event_kind)+'</strong>'+
  '<small>'+esc(x.event_count)+' רעקארדס · '+money(x.total_amount)+
  ' · אינערליכע באשטעטיגונגס־צייכנס: '+esc(x.internally_marked_verified)+'</small></div></article>').join('');
 const ledgerPanel='<section class="card"><h2>Gabbai Pro — אומפארענדערבארער Ledger איבערבליק</h2>'+
  '<p class="muted">אלע סכומים זענען רעקארדירטע אינערליכע פינאנץ־געשעענישן. קיין באנק אדער באצאל־פירמע האט דא נישט באשטעטיגט זייער אמתע באצאלונג.</p>'+
  '<label>פעריאד<select data-action="gabbai-days">'+[7,30,90,365].map(d=>
   '<option value="'+d+'" '+(state.gabbaiDays===d?'selected':'')+'>'+d+' טעג</option>').join('')+'</select></label>'+
  (ledger?'<div class="metrics"><div><span>התחייבויות</span><strong>'+money(net.pledged)+'</strong></div>'+
   '<div><span>מאנועל באריכטעט באקומען</span><strong>'+money(net.receipts)+'</strong></div>'+
   '<div><span>מאנועל צוריקגעדרייט</span><strong>'+money(net.refunds)+'</strong></div>'+
   '<div><span>נעטא מאנועל באריכטעט</span><strong>'+money(net.reported_net)+'</strong></div></div>'+
   '<p class="muted">קבלות אן פארבונדענער התחייבות: '+esc(ledger.receiptsWithoutPledgeLink)+
   '. דאס איז א באריכט־ווארענונג, נישט א באנק־טעות־באשטעטיגונג.</p>'+
   (ledgerRows||'<p class="muted">קיין איינטראגן אין דעם אויסגעקליבענעם זמן.</p>'):
   '<p class="muted">דער Ledger־איבערבליק איז נאך נישט גרייט אויף דעם סערווער.</p>')+
  '</section>';
 const summary=state.gabbaiSummary||{};
 const filter=state.gabbaiFilter||'pending';
 const search=String(state.gabbaiQuery||'').trim().toLocaleLowerCase();
 const filters=[
  ...(canReview?[['actionable','פאר מיין באשלוס']]:[]),
  ['pending','אלע ווארטנדיגע'],['mine','מיינע פארלאנגען'],
  ['approved','באשטעטיגטע'],['rejected','אפגעווארפענע'],['all','אלע']
 ];
 const show=a=>{
  if(filter==='actionable')return canReview&&a.status==='pending'&&a.requested_by!==state.subject;
  if(filter==='mine')return a.requested_by===state.subject;
  return filter==='all'||a.status===filter;
 };
 const visible=(state.gabbaiApprovals||[]).filter(a=>show(a)&&
  (!search||[a.subject,a.explanation,a.category,a.requested_by].some(v=>
   String(v||'').toLocaleLowerCase().includes(search))));
 const financeWorkDesk='<section class="card"><h2>Gabbai Pro — היינטיגע פינאנציעלע באשלוסן</h2>'+
  '<p class="muted">די ציפערן זענען פון אלע רעקארדירטע פארלאנגען אינעם קאמפיין, נישט נאר די ערשטע 200 אין דער ליסטע. די פארלאנגען און באשלוסן זענען אינערליך; דאס שיקט נישט קיין געלט.</p>'+
  '<div class="metrics"><div><span>ווארטנדיגע פארלאנגען</span><strong>'+esc(summary.pending??0)+'</strong></div>'+
  '<div><span>ווארטנדיגער סכום</span><strong>'+money(summary.pending_amount??0)+'</strong></div>'+
  '<div><span>פאר מיין באשלוס</span><strong>'+esc(canReview?(summary.reviewable_count??0):0)+'</strong></div>'+
  '<div><span>מיינע ווארטנדיגע בקשות</span><strong>'+esc(summary.my_pending??0)+'</strong></div></div>'+
  '<div class="inline">'+filters.map(([key,title])=>
   '<button type="button" data-action="gabbai-filter" data-value="'+key+'" aria-pressed="'+(filter===key?'true':'false')+'">'+
   title+'</button>').join('')+'</div>'+
  '<form data-form="gabbai-filter-search" class="inline">'+
  '<label>זוך פארלאנג<input type="search" name="query" maxlength="120" value="'+esc(state.gabbaiQuery||'')+
  '" placeholder="ענין, בקשה־סארט אדער עסקן"></label><button type="submit">זוכן</button></form>'+
  '<p class="muted">געוויזן '+visible.length+' פון די לעצטע '+(state.gabbaiApprovals||[]).length+
  ' ערלויבטע פארלאנגען. די סכום־ציפערן אויבן זענען פון אלע רעקארדס.</p></section>';
 const rows=visible.map(a=>
  '<article class="item"><div><strong>'+esc(a.subject)+' — '+money(a.amount)+'</strong>'+
  '<small>'+esc(categories[a.category]||a.category)+' · '+esc(statuses[a.status]||a.status)+
  ' · '+esc(a.created_at?.slice(0,16)||'')+'</small>'+
  '<p>'+esc(a.explanation||'קיין פרטים')+'</p>'+
  '<p class="muted">פארגעלייגט דורך: '+esc(a.requested_by)+
  (a.decided_by?' · באשטימט דורך: '+esc(a.decided_by):'')+'</p>'+
  (a.decision_reason?'<p class="muted">באגרינדונג פונעם באשלוס: '+esc(a.decision_reason)+'</p>':'')+
  '</div>'+
  (canReview&&a.status==='pending'&&a.requested_by!==state.subject?
   '<form class="stack" data-form="gabbai-decision" data-id="'+esc(a.id)+'">'+
   '<label>באשלוס<select name="decision"><option value="approved">באשטעטיגן</option>'+
   '<option value="rejected">אפווארפן</option></select></label>'+
   '<label>באגרינדונג (ביים אפווארפן מוז מען שרייבן א הסבר)'+
   '<textarea name="reason" maxlength="500" rows="2"></textarea></label>'+
   '<button type="submit">אפהיטן דעם באשלוס</button></form>':'')+
  '</article>').join('');
 const form=canMake?'<section class="card"><h2>נייער פינאנציעלער פארלאנג</h2>'+
  '<form class="stack" data-form="gabbai-approval-new">'+
  '<label>סארט<select name="category">'+Object.entries(categories).map(([key,label])=>
    '<option value="'+key+'">'+label+'</option>').join('')+'</select></label>'+
  '<label>ענין<input name="subject" required maxlength="180"></label>'+
  '<label>סכום<input name="amount" type="number" min="0.01" step="0.01" required></label>'+
  '<label>דעטאלן<textarea name="explanation" maxlength="1500"></textarea></label>'+
  '<button class="primary">אוועקשטעלן פאר באשטעטיגונג</button>'+
  '</form></section>':'';
 return financeWorkDesk+priorityBoard+ledgerPanel+'<section class="card"><h2>Gabbai Pro — פינאנציעלע באשטעטיגונגען</h2>'+
  '<p class="muted">צוויי באזונדערע מענטשן: איינער בעט און אן אנדערער בארעכטיגטער מנהל באשליסט. דער סיסטעם מאכט נישט קיין באנק־באצאלונג, נישט קיין Refund און נישט קיין פינאנציעלע Ledger־קארעקטור.</p>'+
  (state.gabbaiError?'<p role="alert">'+esc(state.gabbaiError)+'</p>':'')+
  (rows||'<p class="muted">נאך קיין באשטעטיגונגס־בקשות.</p>')+'</section>'+form;
}
