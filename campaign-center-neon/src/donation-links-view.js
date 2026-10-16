// A verified manager-configured HTTPS link to an independent donation provider.
// This is NEVER a native payment processor and never confirms receipt of money.
export function donationLinkView(state,esc){
 const data=state.donationLink||{};
 const link=data.link;
 const canEdit=['owner','manager'].includes(state.overview?.campaign?.role);
 const href=link?.donation_url||'';
 const published=/^https:\/\//i.test(href);
 const display=published?'<p><strong>דרויסנדיגער נדבה־פלאץ:</strong> '+esc(link.provider_name||'אנדערע')+'</p>'+
  '<a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer external" class="primary external-donation-link">גיי צו דער באצאל־זייט (דרויסנדיג)</a>':
  '<p class="muted">דערווייל איז נישט איינגעשטעלט קיין דרויסנדיגער נדבה־לינק.</p>';
 const editor=canEdit?'<form data-form="donation-link" class="stack">'+
  '<label>פראוויידער־נאמען <input name="providerName" maxlength="80" value="'+esc(link?.provider_name||'')+'" placeholder="ביישפיל: די באצאל־פירמע"></label>'+
  '<label>זיכערער HTTPS־לינק <input name="url" dir="ltr" type="url" placeholder="https://..." maxlength="2048" value="'+esc(href)+'"></label>'+
  '<p class="muted">ליידיג מאכן דעם לינק און אפהיטן וועט אוועקנעמען דעם קאמפיין־לינק. קיין געשיכטע פון נדבות ווערט נישט געמעקט.</p>'+
  '<button type="submit">אפהיטן נדבה־לינק</button></form>':'';
 return '<section class="card"><h2>קאמפיין־נדבה־לינק</h2>'+
  '<p class="muted">געלט גייט דירעקט צום אויסערן באצאל־פראוויידער. Campaign Center קען נישט פון דעם לינק אליין וויסן צי א נדבה איז באצאלט.</p>'+
  (data.error?'<p role="alert" class="muted">לינק־איינשטעלונגען זענען נאך נישט גרייט: '+esc(data.error)+'</p>':'')+
  display+editor+'</section>';
}
