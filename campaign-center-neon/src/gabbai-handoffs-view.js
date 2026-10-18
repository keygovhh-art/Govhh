// Gabbai Pro actual operations handoff — a manager-to-manager work log.
export function gabbaiHandoffsView(state,esc){
 if(!['owner','manager'].includes(state.gabbaiRole))return '';
 const d=state.gabbaiHandoffs||{handoffs:[],pendingForMe:0,urgentPendingForMe:0};
 const show=state.gabbaiHandoffFilter||'pending';
 const items=(d.handoffs||[]).filter(x=>show==='all'||
  (show==='urgent'?x.urgency==='critical':x.written_by!==state.subject&&!x.acknowledged_by_me));
 const priority={normal:'נארמאל',high:'וויכטיג',critical:'קריטיש'};
 const entries=items.map(x=>'<article class="item"><div>'+
  '<strong>'+esc(x.headline)+'</strong>'+
  '<small>'+esc(priority[x.urgency]||x.urgency)+' · אריינגעשריבן דורך '+esc(x.written_by)+
  ' · '+esc(String(x.created_at).slice(0,16))+'</small>'+
  (x.completed_summary?'<p><strong>וואס איז ערלעדיגט:</strong> '+esc(x.completed_summary)+'</p>':'')+
  (x.blockers_summary?'<p><strong>וואס האלט נאך אפ:</strong> '+esc(x.blockers_summary)+'</p>':'')+
  '<p><strong>דער נעקסטער שריט:</strong> '+esc(x.next_action)+'</p>'+
  (x.target_at?'<p class="muted">ציל־צייט: '+esc(String(x.target_at).slice(0,16))+'</p>':'')+
  '<p class="muted">באהאנדלט/געזען דורך '+esc(x.acknowledgements||0)+' מנהלים'+
  (x.acknowledged_by_me?' · דו האסט באשטעטיגט':'')+'</p></div>'+
  (x.written_by!==state.subject&&!x.acknowledged_by_me?
   '<button type="button" data-action="gabbai-handoff-ack" data-id="'+esc(x.id)+'">איך האב איבערגענומען</button>':'')+
  '</article>').join('');
 return '<section class="card"><h2>Gabbai Pro — מסירת־המשמרת און הנהלה־געשיכטע</h2>'+
  '<p class="muted">פונקטליך וואס איז געטאן געווארן, וואס האלט אפ, און וואס דער נעקסטער מנהל דארף טון. אן אפגעהיטענער באריכט מיט אן איבערנעמונג־באשטעטיגונג — נישט קיין אויטאמאטישע קאלס אדער מעסעדזשעס.</p>'+
  (state.gabbaiHandoffsError?'<p role="alert">'+esc(state.gabbaiHandoffsError)+'</p>':'')+
  '<div class="metrics"><div><span>ווארטן אויף מיין איבערנעמונג</span><strong>'+esc(d.pendingForMe||0)+'</strong></div>'+
  '<div><span>קריטישע וואס ווארטן</span><strong>'+esc(d.urgentPendingForMe||0)+'</strong></div></div>'+
  '<form class="stack" data-form="gabbai-handoff-create">'+
  '<h3>א נייע מסירה פארן קומענדיגן מנהל</h3>'+
  '<label>קעפל<input name="headline" required maxlength="140" placeholder="איבערגעבן דעם היינטיגן מצב"></label>'+
  '<label>וואס איז שוין ערלעדיגט?<textarea name="completedSummary" maxlength="1200" rows="2"></textarea></label>'+
  '<label>וואס האלט נאך אפ?<textarea name="blockersSummary" maxlength="1200" rows="2"></textarea></label>'+
  '<label>וואס דארף דער נעקסטער מנהל טון?<textarea name="nextAction" maxlength="1200" rows="3" required></textarea></label>'+
  '<label>וויכטיגקייט<select name="urgency"><option value="normal">נארמאל</option><option value="high">וויכטיג</option><option value="critical">קריטיש</option></select></label>'+
  '<label>ציל־צייט (אויב נויטיג)<input type="datetime-local" name="targetAt"></label>'+
  '<button type="submit">אפהיטן און איבערגעבן די מסירה</button></form></section>'+
  '<section class="card"><h3>הנהלה־מסירות — לעצטע '+esc(state.gabbaiHandoffDays||30)+' טעג</h3>'+
  '<form data-form="gabbai-handoff-filter" class="inline">'+
  '<label>וואס ווייזן<select name="filter">'+[
    ['pending','ווארטן אויף מיר'],['urgent','קריטישע'],['all','אלע מסירות']
   ].map(([k,label])=>'<option value="'+k+'" '+(show===k?'selected':'')+'>'+label+'</option>').join('')+'</select></label>'+
  '<label>פעריאד<select name="days">'+[7,30,90].map(n=>'<option value="'+n+'" '+(state.gabbaiHandoffDays===n?'selected':'')+'>'+n+' טעג</option>').join('')+'</select></label>'+
  '<button type="submit">ווייזן</button></form>'+
  (entries||'<p class="muted">קיין מסירות אינעם אויסגעקליבענעם פילטער.</p>')+'</section>';
}
