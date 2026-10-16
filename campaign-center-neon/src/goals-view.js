// Authenticated goals for a single selected campaign. All values come from server.
const format=n=>Number(n||0).toLocaleString('en-US',{maximumFractionDigits:2});
export function goalsView(state,esc){
 const role=state.overview?.campaign?.role,manager=['owner','manager'].includes(role);
 const goals=state.goals||[];
 const names={money:'געלט',members:'עסקנים',calls:'רופן',pledges:'התחייבויות',tasks:'אויפגאבן',custom:'אנדערע'};
 const statuses={active:'אקטיוו',at_risk:'אין געפאר',completed:'פארענדיגט',paused:'אפגעשטעלט',archived:'ארכיווירט'};
 const form=manager?'<section class="card"><h2>נייער באזונדערער ציל</h2>'+
  '<p class="muted">פארן איצטיגן Pilot: ביז דריי אקטיווע צילן פער קאמפיין. די העכערע פלאן־לימיטן ווערן נאר אקטיוו נאך Verified Billing/Entitlements.</p>'+
  '<form data-form="goal" class="stack"><label>ציל־נאמען<input name="title" required maxlength="160" placeholder="צום ביישפיל: 50 רופן"></label>'+
  '<label>סארט<select name="category">'+Object.entries(names).map(([code,name])=>'<option value="'+code+'">'+name+'</option>').join('')+'</select></label>'+
  '<label>וויפיל איז דער ציל?<input required name="targetValue" min="0.01" step="0.01" type="number"></label>'+
  '<label>דאטום<input name="dueOn" type="date"></label>'+
  '<label>באשרייבונג<textarea name="description" maxlength="1000"></textarea></label>'+
  '<button class="primary">אפהיטן דעם ציל</button></form></section>':'';
 const rows=goals.map(goal=>{
   const target=Number(goal.target_value),current=Number(goal.current_value);
   const percent=target>0?Math.min(100,Math.round(current/target*100)):0;
   return '<article class="item"><div><strong>'+esc(goal.title)+'</strong>'+
    '<small>'+esc(names[goal.category]||goal.category)+' · '+esc(statuses[goal.status]||goal.status)+
    (goal.due_on?' · '+esc(goal.due_on.slice(0,10)):'')+'</small>'+
    '<p>'+format(current)+' / '+format(target)+' — '+percent+'%</p>'+
    '<progress max="100" value="'+percent+'" aria-label="ציל פארשריט"></progress>'+
    (goal.description?'<p class="muted">'+esc(goal.description)+'</p>':'')+'</div>'+
    (manager?'<form data-form="goal-update" data-goal-id="'+esc(goal.id)+'" class="inline">'+
      '<label>יעצט <input name="currentValue" type="number" min="0" step="0.01" required value="'+esc(goal.current_value)+'"></label>'+
      '<label>מצב <select name="status">'+Object.entries(statuses).filter(([code])=>code!=='archived').map(([code,name])=>'<option value="'+code+'" '+(goal.status===code?'selected':'')+'>'+name+'</option>').join('')+'</select></label>'+
      '<button type="submit">אפהיטן</button><button type="button" data-action="goal-archive" data-id="'+esc(goal.id)+'">ארכיוו</button></form>':'')+'</article>';
 }).join('');
 return form+'<section class="card"><h2>קאמפיין־צילן <span class="count">'+goals.length+'</span></h2>'+
 (state.goalsError?'<p role="alert">צילן־דאטעבאזע נאך נישט גרייט: '+esc(state.goalsError)+'</p>':'')+
 (rows||'<p class="muted">נאך קיין צילן. דער הויפט געלט־ציל איז אויך אין די קאמפיין־פארוואלטונג.</p>')+'</section>';
}
