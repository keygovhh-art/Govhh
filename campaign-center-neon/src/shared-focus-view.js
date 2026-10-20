// Shared Focus: real, human-curated task IDs. Never show unauthorized team
// data or mark a saved board as bank/provider/AI verified.
export function sharedFocusView(state,esc){
 const board=state.sharedFocus,waiting=state.sharedFocusError;
 if(!state.campaignId)return '';
 const alerts=waiting?'<p role="alert">'+esc(waiting)+'</p>':'';
 if(!board)return '<section class="card"><h2>געטיילטער קאמפיין־Focus</h2>'+
  '<p class="muted">דער געטיילטער Focus איז נאכנישט באשטעטיגט פונעם סערווער.</p>'+alerts+'</section>';
 const isLead=['owner','manager'].includes(state.overview?.campaign?.role);
 const teams=board.availableTeams||[];
 const teamSelection=isLead?'<label>וועמען ווילסטו צוטיילן דעם Focus?'+
   '<select data-action="shared-focus-team"><option value="">מנהל — גאנצער קאמפיין</option>'+
   teams.map(t=>'<option value="'+esc(t)+'"'+
    (t===state.sharedFocusTeam?' selected':'')+'>'+esc(t)+'</option>').join('')+
   '</select></label>':'';
 const cards=(board.tasks||[]).map((t,i)=>
  '<article class="item"><strong>'+esc(i+1)+'. '+esc(t.title)+'</strong>'+
  '<small>'+esc(t.priority)+' · '+esc(t.assignee_subject)+'</small></article>').join('');
 const selected=board.tasks||[];
 const options=Array.from(new Map([...(state.sharedFocusCandidates?.candidates||[]),...selected]
  .map(t=>[t.id,t])).values());
 const chooser=(i)=>'<label>שריט '+(i+1)+
  '<select name="focusTaskId"><option value="">נישט צוטיילן</option>'+
  options.map(t=>'<option value="'+esc(t.id)+'"'+
   (selected[i]?.id===t.id?' selected':'')+'>'+esc(t.title)+' — '+esc(t.assignee_subject)+'</option>').join('')+
  '</select></label>';
 const editor=board.editable?'<section class="card"><h3>מנהל־Focus אויסשטעלן</h3>'+
  '<p class="muted">ביז דריי צוגעטיילטע אפענע אויפגאבן. די אויסוואל ווערט אפגעהיטן מיט ווערסיע־קאנטראל און א היסטאריע. זי קען נישט מאכן טעלעפאן־רופן אדער באצאלונגען.</p>'+
  teamSelection+
  '<form data-form="shared-focus-search" class="inline">'+
  '<input name="query" maxlength="100" placeholder="זוך אן אויפגאבע לויט נאמען" value="'+
  esc(state.sharedFocusQuery||'')+'"><button>זוכן</button></form>'+
  '<form data-form="shared-focus-save" class="stack">'+
   chooser(0)+chooser(1)+chooser(2)+
  '<button>אפהיטן דעם Focus</button></form>'+
  '<p class="muted">געוויזן ביז 50 רעזולטאטן; זוך לויט נאמען פאר מער. א געביטענער Focus ווערט נאר אפגעהיטן דורך א בארעכטיגטן מנהל אדער גרופע־פירער.</p>'+
  '</section>':'';
 const history=board.editable?(board.history||[]).map(x=>
  '<p>'+esc(x.version)+'. '+esc(x.actor_subject)+
  ' · '+esc(String(x.created_at||'').slice(0,16))+
  ' · '+esc(x.previous_count)+' → '+esc(x.new_count)+' אויפגאבן</p>').join(''):'';
 return '<section class="card"><h2>געטיילטער קאמפיין־Focus</h2>'+
  '<p class="muted">באשטעטיגטע צוטיילונגען פונעם סערווער · ווערסיע '+esc(board.version)+
  (board.team?' · מאנשאפט '+esc(board.team):' · הנהלה־Focus')+
  '. יעדער עסקן זעט נאר די אויפגאבן וואס ער מעג זען.</p>'+
  alerts+(cards||'<p class="muted">נאך קיין אויסגעקליבענע אפענע אויפגאבן.</p>')+
  '</section>'+editor+
  (history?'<section class="card"><h3>ווער האט געטוישט דעם Focus?</h3>'+history+'</section>':'');
}
