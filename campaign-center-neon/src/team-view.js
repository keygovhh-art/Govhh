// All values rendered in user-controlled fields must be escaped by the caller.
export function teamView(state,esc,money) {
 const org=state.orgs.find(x=>x.id===state.orgId);
 const role=org?.role||'';
 const leader=['owner','manager'].includes(role);
 const manager=state.manager;
 const invited=state.invitationCode;
 const connectCode=state.connectCode;
 const status=state.linkStatus;
 const members=(state.members||[]).map(m=>
  '<article class="item"><div><strong>'+esc(m.subject)+'</strong><small>'+
  esc(m.role)+' · '+esc(m.membership_status)+'</small></div></article>').join('');
 const leads=(state.leads||[]).map(p=>
  '<article class="item"><div><strong>'+esc(p.display_name)+'</strong><small>'+
  esc(p.phone)+' · '+(p.do_not_call?'נישט רופן':p.claimed_by?'געכאפט דורך אן עסקן':'פאראן')+
  '</small></div><div class="actions">'+
  (p.do_not_call?'':p.claimed_by===state.user?.id?
    '<button data-action="release-lead" data-id="'+esc(p.id)+'">צוריקגעבן</button>':
    !p.claimed_by||new Date(p.claim_expires_at).getTime()<Date.now()?
    '<button data-action="claim-lead" data-id="'+esc(p.id)+'">איך נעם עס</button>':'')+
  '</div></article>').join('');
 const stats=manager?'<div class="metrics"><div><span>צוגעזאגט</span><strong>'+
  money(manager.financial.promised)+'</strong></div><div><span>מאנועל באריכטעט</span><strong>'+
  money(manager.financial.manually_reported)+'</strong></div><div><span>באשטעטיגט</span><strong>'+
  money(manager.financial.verified_received)+'</strong></div></div>':'';
 return '<section class="card"><h2>מיין קאמפיין־מאנשאפט</h2>'+
  '<p class="muted">קאמפיין־רעכטן ווערן באשטעטיגט אויפן סערווער. פערזענליכע MAX־דאטן ווערן נישט אוטאמאטיש מיטגעטיילט.</p>'+
  stats+
  (leader?'<h3>נייע עסקנים איינלאדונג</h3><form data-form="invite" class="inline">'+
   '<select name="role"><option value="askan">עסקן</option><option value="squad_leader">גרופע־פירער</option><option value="finance">געלט־פארוואלטער</option><option value="manager">מנהל</option><option value="auditor">אודיט</option></select>'+
   '<label><input type="checkbox" name="campaignOnly" checked> בלויז דעם קאמפיין</label><button>שאפן איין־מאליגן קאוד</button></form>'+
   (invited?'<p>דער איינלאדונגס־קאוד ווערט נאר יעצט געוויזן; ער גייט אויס נאך 48 שעה.</p><input readonly dir="ltr" value="'+esc(invited)+'">':'')+
   '<h3>מאנשאפט־מיטגלידער</h3>'+(members||'<p class="muted">נאך קיין איינגעשריבענע מיטגלידער.</p>'):'')+
  '<h3>רוף־ליסטע און צוטיילונג</h3>'+
  (leads||'<p class="muted">נאך קיין ערלויבטע קאמפיין־קשרים.</p>')+'</section>'+
  '<section class="card"><h2>גבהה קאנעקט</h2>'+
  '<p>דאס פארבינדט דיינע קאמפיין־צוטריט־רעכטן מיט דיין פערזענליכן עולם החסד MAX; קיין פערזענליכע קשרים אדער נאטיצן ווערן נישט מיטגעשיקט.</p>'+
  '<p class="muted">'+(status?.linked?'MAX איז פארבונדן.':'MAX איז דערווייל נישט פארבונדן.')+'</p>'+
  (connectCode?'<p>דער איין־מאליגער קאוד איז גילטיג פאר 10 מינוט. גיי צום MAX־אקאונט און גיב אים דארט אריין.</p><input readonly dir="ltr" value="'+esc(connectCode)+'">':'')+
  '<div class="inline"><button data-action="new-connect-code">נייער פארבינדונגס־קאוד</button>'+
  (status?.linked?'<button data-action="unlink-max">פארבינדונג אויסלעשן</button>':'')+'</div></section>';
}
