// Chesed Quick pilot: on-demand campaign Watch, snapshot and seven-day
// author-private Focus memory. No simulated live alerts or automated actions.
export function quickDailyView(state,esc){
 const item=state.quickDaily;
 if(!state.campaignId)return '';
 if(!item){
  return '<section class="card"><h2>היינטיגער איבערבליק</h2><p role="alert">'+
   esc(state.quickDailyError||'דער באריכט איז נאכנישט גרייט')+'</p></section>';
 }
 const s=item.stats||{};
 const count=v=>esc(Number.isFinite(Number(v))?Number(v):0);
 const map={overdue:'אויפגאבן זענען שוין איבערן טערמין',
  due_soon:'אויפגאבן קומען צו אין די קומענדיגע 48 שעה',
  critical:'קריטישע אויפגאבן זענען נאך אפן',
  goals:'צילן דארפן אן איבערקוק'};
 const watches=(item.watch||[]).map(w=>'<p class="muted"><strong>'+count(w.count)+'</strong> — '+esc(map[w.kind]||'נויטיגע אויפמערקזאמקייט')+'</p>').join('');
 const history=(item.reviews||[]).map(r=>
  '<article class="item"><div><strong>'+esc(String(r.review_date||'').slice(0,10))+'</strong>'+
  '<small>אפענע: '+count(r.open_tasks)+' · פארשפעטיגט: '+count(r.overdue_tasks)+
  ' · היינט פארענדיגט: '+count(r.completed_today)+' · ציל־ווארענונגען: '+count(r.goal_warnings)+'</small>'+
  (r.reflection?'<p>'+esc(r.reflection)+'</p>':'')+'</div></article>').join('');
 return '<section class="card"><h2>Chesed Quick — היינט און System Watch</h2>'+
  '<p class="muted">אמתע ציפערן פון בלויז די קאמפיין־אויפגאבן וואס דו מעגסט זען. דאס איז א איבערבליק ווען מ׳עפנט דעם בלאט; עס שיקט נישט קיין אויטאמאטישע ווארענונגען.</p>'+
  '<div class="metrics"><div><span>אפענע אויפגאבן</span><strong>'+count(s.open_tasks)+'</strong></div>'+
  '<div><span>פארשפעטיגט</span><strong>'+count(s.overdue_tasks)+'</strong></div>'+
  '<div><span>היינט פארענדיגט דורך דיר</span><strong>'+count(s.completed_today)+'</strong></div></div>'+
  (watches||'<p class="muted">לויט די יעצטיגע רעקארדס זענען נישטא קיין אקטיווע ווארענונגען.</p>')+
  '</section>'+
  '<section class="card"><h2>טעגליכער איבערבליק — '+esc(item.day)+'</h2>'+
  (item.todaySaved?'<p>דיין היינטיגער באריכט איז שוין אפגעהיטן. מען קען נישט איבערשרייבן אן אלטן באריכט.</p>':
  '<form class="stack" data-form="quick-daily-review">'+
   '<label>מיין קורצע איבערגעגעבענע מסקנא (פריוואט, נישט פארן מאנשאפט)<textarea name="reflection" maxlength="500" rows="3" placeholder="וואס איז געלונגען, און וואס דארף מארגן געהעריג נאכגעפאלגט ווערן?"></textarea></label>'+
   '<button type="submit">אפהיטן היינטיגן איבערבליק</button></form>')+
  '<h3>מיין Focus־געשיכטע — לעצטע 7 טעג</h3>'+
  (history||'<p class="muted">נאך נישט אפגעהיטן קיין טעגלעכע באריכטן. פארגאנגענע טעג ווערן נישט אויסגעטראכט.</p>')+
  '</section>';
}
