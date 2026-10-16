// Gabbai Pro internal maker-checker approvals. No card/bank payments occur.
export function gabbaiApprovalsView(state,esc,money){
 const canMake=['owner','manager','finance'].includes(state.gabbaiRole);
 const canReview=['owner','manager'].includes(state.gabbaiRole);
 const categories={planned_expense:'געפלאנטע הוצאה',manual_adjustment:'פארשלאג צו קארעקטירן רעקארד',
  refund_review:'בקשה איבער א צוריקצאלונג',other:'אנדערע'};
 const statuses={pending:'ווארט אויף באשטעטיגונג',approved:'באשטעטיגט',rejected:'אפגעווארפן'};
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
 return '<section class="card"><h2>Gabbai Pro — פינאנציעלע באשטעטיגונגען</h2>'+
  '<p class="muted">צוויי באזונדערע מענטשן: איינער בעט און אן אנדערער בארעכטיגטער מנהל באשליסט. דער סיסטעם מאכט נישט קיין באנק־באצאלונג, נישט קיין Refund און נישט קיין פינאנציעלע Ledger־קארעקטור.</p>'+
  (state.gabbaiError?'<p role="alert">'+esc(state.gabbaiError)+'</p>':'')+
  (rows||'<p class="muted">נאך קיין באשטעטיגונגס־בקשות.</p>')+'</section>'+form;
}
