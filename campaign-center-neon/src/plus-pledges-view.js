// Askan Plus: installment status from append-only financial events.
// No checkout here; no bank/processor payment or refund is claimed.
export function plusPledgesView(state,esc,money) {
 const role=state.overview?.campaign?.role;
 const canReport=['owner','finance'].includes(role);
 const entries=state.plusPledges||[];
 const rows=entries.map(p=>{
  const left=Number(p.outstanding);
  const form=canReport&&left>0?
    '<form data-form="plus-partial-receipt" data-pledge-id="'+esc(p.id)+'" class="stack">'+
    '<p class="muted">מאנועל באריכטן א באקומענעם טייל פון דער התחייבות. די סיסטעם ציט נישט קיין געלט פונעם נדבן.</p>'+
    '<label>סכום<input name="amount" type="number" step="0.01" min="0.01" max="'+esc(p.outstanding)+'" required></label>'+
    '<label>אופן<select name="method"><option value="cash">קעש</option><option value="check">טשעק</option><option value="bank">באנק</option><option value="external">דרויסנדיג</option></select></label>'+
    '<label>רעפערענץ (נויטיג פאר טשעק/באנק/דרויסנדיג)<input name="reference" maxlength="120" placeholder="טשעק נומער אדער רעפערענץ"></label>'+
    '<button type="submit">אפהיטן מאנועל באריכט</button></form>':'';
  return '<article class="item"><div><strong>'+money(p.amount)+' — התחייבות</strong>'+
   '<small>עסקן: '+esc(p.credited_member_subject||'נישט צוגעטיילט')+
   ' · '+esc(p.created_at?.slice(0,10)||'')+'</small>'+
   '<p>מאנועל באריכטעט באקומען: '+money(p.manually_reported_received)+
   ' · צוריקגעדרייט: '+money(p.manually_reversed)+
   ' · <strong>נאכ'ן חשבון אויסשטייענדיג: '+money(p.outstanding)+'</strong></p></div>'+
   form+'</article>';
 }).join('');
 return '<section class="card"><h2>עסקן פלאס — התחייבויות און טייל־באצאלונגען</h2>'+
  '<p class="muted">יעדע התחייבות און מאנועל איינגעשריבענע באצאלונג בלייבן באזונדערע רעקארדס. דער אויסשטייענדיגער רעשט ווערט אויסגערעכנט אן צו ציילן באצאלונגען צוויי מאל. דאס איז נישט באשטעטיגט דורך א באנק אדער קארטל־פירמע.</p>'+
  (state.plusPledgesError?'<p role="alert">דער באצאלונגס־באריכט איז נאך נישט צוטריטבאר: '+esc(state.plusPledgesError)+'</p>':'')+
  (rows||'<p class="muted">נאכנישטא קיין התחייבויות אין דיין ערלויבטן קאמפיין.</p>')+'</section>';
}
