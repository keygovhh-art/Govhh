// All values rendered in user-controlled fields must be escaped by the caller.
export function teamView(state,esc,money) {
 const org=state.orgs.find(x=>x.id===state.orgId);
 const role=org?.role||'';
 const leader=['owner','manager'].includes(role);
 const manager=state.manager;
 const invited=state.invitationCode;
 const connectCode=state.connectCode;
 const status=state.linkStatus;
 const campaignMembers=manager?.members||[];
 const members=(state.members||[]).map(m=>{
  const campaignMember=campaignMembers.find(x=>x.subject===m.subject);
  const canEdit=leader&&m.role!=='owner'&&m.subject!==state.subject&&
   (role==='owner'||!['manager','finance','auditor'].includes(m.role));
  const roles=role==='owner'?['askan','squad_leader','manager','finance','auditor']:['askan','squad_leader'];
  const roleText={askan:'עסקן',squad_leader:'גרופע־פירער',manager:'מנהל',finance:'געלט־פארוואלטער',auditor:'אודיט'};
  const roleOptions=roles.map(v=>'<option value="'+v+'" '+(m.role===v?'selected':'')+'>'+roleText[v]+'</option>').join('');
  const statuses=[['active','אקטיוו'],['suspended','צייטווייליג אפשטעלן'],['revoked','צוטריט אוועקנעמען']];
  const statusOptions=statuses.map(([v,n])=>'<option value="'+v+'" '+(m.membership_status===v?'selected':'')+'>'+n+'</option>').join('');
  const manage=canEdit?
   '<form class="stack member-editor" data-form="member-permission">'+
    '<input type="hidden" name="subject" value="'+esc(m.subject)+'">'+
    '<label>ראלע<select name="role">'+roleOptions+'</select></label>'+
    '<label>צוטריט<select name="status">'+statusOptions+'</select></label>'+
    '<label class="confirm-check"><input type="checkbox" name="confirm" required> איך פארשטיי אז דער טויש קען באגרעניצן צוטריט. אלטע רעקארדס ווערן נישט פארמעקט.</label>'+
    '<button type="submit">רשות־טויש באשטעטיגן</button></form>':'';
  return '<article class="item member-entry"><div><strong>'+esc(m.subject)+'</strong><small>'+
   esc(roleText[m.role]||m.role)+' · '+esc(m.membership_status)+' · גרופע: '+esc(campaignMember?.team_name||'נישט צוגעטיילט')+'</small>'+
   (leader&&campaignMember?'<form data-form="member-team" class="inline"><input type="hidden" name="subject" value="'+esc(m.subject)+'"><input name="teamName" value="'+esc(campaignMember.team_name||'')+'" maxlength="64" placeholder="גרופע־נאמען"><button>אפהיטן גרופע</button></form>':'')+
   manage+'</div></article>';
 }).join('');
 const groups=[...new Set(campaignMembers.map(x=>x.team_name||'').filter(Boolean))];
 const leads=(state.leads||[]).map(p=>
  '<article class="item"><div><strong>'+esc(p.display_name)+'</strong><small>'+
  esc(p.phone)+' · '+(p.do_not_call?'נישט רופן':p.claimed_by?'געכאפט דורך אן עסקן':'פאראן')+
  '</small></div>'+ (leader?'<form data-form="contact-team" class="inline"><input type="hidden" name="contactId" value="'+esc(p.id)+'"><select name="teamName"><option value="">אלע אומצוגעטיילטע</option>'+groups.map(g=>'<option value="'+esc(g)+'" '+(g===p.assigned_team?'selected':'')+'>'+esc(g)+'</option>').join('')+'</select><button>צוטיילן</button></form>':'')+
  '<div class="actions">'+
  (p.do_not_call?'':p.claimed_by===state.user?.id?
    '<button data-action="release-lead" data-id="'+esc(p.id)+'">צוריקגעבן</button>':
    !p.claimed_by||new Date(p.claim_expires_at).getTime()<Date.now()?
    '<button data-action="claim-lead" data-id="'+esc(p.id)+'">איך נעם עס</button>':'')+
  '</div></article>').join('');
 const stats=manager?'<div class="metrics"><div><span>צוגעזאגט</span><strong>'+
  money(manager.financial.promised)+'</strong></div><div><span>מאנועל באריכטעט</span><strong>'+
  money(manager.financial.net_manual_received)+'</strong></div><div><span>געלט־פארוואלטער באשטעטיגט</span><strong>'+
  money(manager.financial.treasurer_confirmed)+'</strong></div></div>':'';
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
