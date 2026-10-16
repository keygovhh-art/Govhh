// Organization plan: aggregate read-only overview for active workspace owner/manager.
// No donor identity, no private notes, no inter-currency arithmetic.
export function organizationPortfolioView(state,esc,money){
 const portfolio=state.organizationPortfolio;
 const stats=portfolio?.currencies||[];
 const labels=stats.map(x=>'<article class="item"><div><strong>'+esc(x.currency)+' — '+
   esc(x.campaigns)+' קאמפיינס</strong>'+
   '<p>צילן: '+esc(x.goal)+' · התחייבויות: '+esc(x.pledged)+
   ' · נעטא מאנועל באריכטעט: '+esc(x.manualNet)+'</p></div></article>').join('');
 const leadership=(state.organizationDecisions||[]).map(item=>
  '<article class="item"><div><strong>'+esc(item.title)+'</strong>'+
  '<small>'+esc(item.status==='decided'?'באשלאסן':'ווארט אויף הנהלה')+
  ' · '+esc(item.created_at?.slice(0,10)||'')+'</small>'+
  '<p>'+esc(item.context||'קיין פרטים')+'</p>'+
  (item.status==='decided'?'<p><strong>באשלוס:</strong> '+esc(item.resolution)+
    '</p><small>באשטימט דורך '+esc(item.decided_by)+'</small>':'')+
  '</div>'+(item.status==='open'?'<form data-form="organization-resolve" data-id="'+esc(item.id)+'" class="stack">'+
   '<label>באשלוס־אויספיר<textarea name="resolution" rows="3" maxlength="1500" required></textarea></label>'+
   '<button>אפהיטן די אפיציעלע החלטה</button></form>':'')+'</article>').join('');
 const chooseCampaign='<option value="">פארן גאנצן מוסד</option>'+
  (portfolio?.campaigns||[]).map(c=>'<option value="'+esc(c.id)+'">'+esc(c.title)+'</option>').join('');
 const decisions='<section class="card"><h2>הנהלה־באשלוסן פונעם מוסד</h2>'+
  '<p class="muted">נאר בארעכטיגטע מנהלים קענען לייענען, פארשלאגן און פארענדיקן. נאך א באשלוס קען מען נישט איבערשרייבן זיין אויספיר; דער Audit בלייבט אפגעהיטן.</p>'+
  '<form data-form="organization-decision" class="stack">'+
  '<label>פאר וועמען<select name="campaignId">'+chooseCampaign+'</select></label>'+
  '<label>ענין<input name="title" required maxlength="180"></label>'+
  '<label>הינטערגרונט<textarea name="context" rows="3" maxlength="1500"></textarea></label>'+
  '<button>איינגעבן צום הנהלה־לוח</button></form>'+
  (leadership||'<p class="muted">נאך קיין הנהלה־באשלוסן.</p>')+'</section>';
 const entries=(portfolio?.campaigns||[]).map(c=>'<article class="item"><div><strong>'+esc(c.title)+'</strong>'+
   '<small>'+esc(c.status)+' · '+esc(c.currency)+' · אקטיווע עסקנים: '+esc(c.active_members)+'</small>'+
   '<p>ציל: '+esc(c.goal_amount)+' · צוגעזאגט: '+esc(c.pledged)+
   ' · מאנועל באריכטעט באקומען: '+esc(c.manually_reported_receipts)+
   ' · צוריקגעדרייט: '+esc(c.manually_reported_refunds)+'</p>'+
   '<p>אפענע אויפגאבן: '+esc(c.open_tasks)+' · פארשפעטיגט: '+esc(c.overdue_tasks)+'</p></div>'+
   '<button data-action="organization-campaign" data-id="'+esc(c.id)+'">עפענען דעם קאמפיין</button></article>').join('');
 return '<section class="card"><h2>Organization — אלע קאמפיינס אויף איין פלאץ</h2>'+
  '<p class="muted">בלויז פאר דער הנהלה פונעם מוסד. דא זעט מען געמיינזאמע חשבונות אן פריוואטע נדבן־נעמען, רוף־נאטיצן אדער אויסגעטיילטע קשר־דאטעס.</p>'+
  (state.organizationError?'<p role="alert">'+esc(state.organizationError)+'</p>':'')+
  (portfolio?'<p><strong>'+esc(portfolio.totalCampaigns)+' קאמפיינס</strong> אינעם מוסד.</p>'+
   (portfolio.truncated?'<p class="muted">געוויזן בלויז די ערשטע '+esc(portfolio.returned)+' קאמפיינס; די סך־הכלן רעכענען נאר אריינגעוויזענע קאמפיינס.</p>':'')+
   '<h3>סך־הכל פער מטבע</h3>'+(labels||'<p class="muted">נאך קיין קאמפיינס.</p>')+
   '<h3>קאמפיין־דורך־קאמפיין</h3>'+(entries||'<p class="muted">נאך קיין קאמפיינס.</p>'):
   '<p class="muted">דער מוסד־Portfolio איז נאך נישט צוטריטבאר פאר דיין ראלע.</p>')+
  '<p class="muted">קיין רעזולטאט איז נישט באשטעטיגט אלס באנק־געלט. באזונדערע מטבעות ווערן נישט צוזאמענגעציילט.</p></section>'+decisions;
}
