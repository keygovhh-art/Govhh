// Gabbai Pro internal maker-checker approvals. No card/bank payments occur.
export function gabbaiApprovalsView(state,esc,money){
 const canMake=['owner','manager','finance'].includes(state.gabbaiRole);
 const canReview=['owner','manager'].includes(state.gabbaiRole);
 const categories={planned_expense:'געפלאנטע הוצאה',manual_adjustment:'פארשלאג צו קארעקטירן רעקארד',
  refund_review:'בקשה איבער א צוריקצאלונג',other:'אנדערע'};
 const statuses={pending:'ווארט אויף באשטעטיגונג',approved:'באשטעטיגט',rejected:'אפגעווארפן'};
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
 const rows=(state.gabbaiApprovals||[]).map(a=>
  '<article class="item"><div><strong>'+esc(a.subject)+' — '+money(a.amount)+'</strong>'+
  '<small>'+esc(categories[a.category]||a.category)+' · '+esc(statuses[a.status]||a.status)+
  ' · '+esc(a.created_at?.slice(0,16)||'')+'</small>'+
  '<p>'+esc(a.explanation||'קיין פרטים')+'</p>'+
  '<p class="muted">פארגעלייגט דורך: '+esc(a.requested_by)+
  (a.decided_by?' · באשטימט דורך: '+esc(a.decided_by):'')+'</p></div>'+
  (canReview&&a.status==='pending'&&a.requested_by!==state.subject?
   '<div class="inline"><button data-action="gabbai-decision" data-id="'+esc(a.id)+
     '" data-decision="approved">באשטעטיגן</button>'+
   '<button data-action="gabbai-decision" data-id="'+esc(a.id)+
     '" data-decision="rejected">אפווארפן</button></div>':'')+
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
 return ledgerPanel+'<section class="card"><h2>Gabbai Pro — פינאנציעלע באשטעטיגונגען</h2>'+
  '<p class="muted">צוויי באזונדערע מענטשן: איינער בעט און אן אנדערער בארעכטיגטער מנהל באשליסט. דער סיסטעם מאכט נישט קיין באנק־באצאלונג, נישט קיין Refund און נישט קיין פינאנציעלע Ledger־קארעקטור.</p>'+
  (state.gabbaiError?'<p role="alert">'+esc(state.gabbaiError)+'</p>':'')+
  (rows||'<p class="muted">נאך קיין באשטעטיגונגס־בקשות.</p>')+'</section>'+form;
}
