// Phone-first Custom-tier workflows. All content is HTML-escaped by caller.
export function customWorkflowsView(state,esc){
 const data=state.customWorkflowData, templates=state.customWorkflowTemplates?.templates||[];
 const runs=data?.runs||[];
 const isLeader=['owner','manager'].includes(state.orgs?.find(x=>x.id===state.orgId)?.role);
 const status={open:'אין ארבעט',blocked:'פארהינדערט',completed:'פארענדיגט',cancelled:'אפגעשטעלט'};
 const line=(x)=>esc(String(x??''));
 const toSteps=t=>Array.isArray(t)?t:[];
 const cards=runs.map(r=>{
  const steps=toSteps(r.step_titles),upNext=steps[r.next_step];
  const own=r.assigned_to===state.subject;
  const canEdit=(isLeader||own)&&['open','blocked'].includes(r.status);
  return '<article class="item"><div><strong>'+line(r.title)+'</strong>'+
   '<p class="muted">'+line(status[r.status]||r.status)+' · '+line(r.next_step)+' / '+line(steps.length)+' שריט'+
   ' · פאראנטווארטליך: '+line(r.assigned_to)+'</p>'+
   (upNext&&r.status!=='cancelled'?'<p><strong>קומענדיגער שריט:</strong> '+line(upNext)+'</p>':'')+
   (r.blocked_reason?'<p><strong>פארהינדערונג:</strong> '+line(r.blocked_reason)+'</p>':'')+
   '</div><div class="inline">'+
   (canEdit&&r.status==='open'?
     '<button type="button" data-action="custom-workflow-progress" data-id="'+line(r.id)+'" data-step="complete_step">פארענדיגן דעם שריט</button>':'')+
   (canEdit&&r.status==='blocked'?
     '<button type="button" data-action="custom-workflow-progress" data-id="'+line(r.id)+'" data-step="resume">ווייטער ארבעטן</button>':'')+
   (isLeader&&canEdit?
     '<button type="button" data-action="custom-workflow-progress" data-id="'+line(r.id)+'" data-step="cancel">אפשטעלן</button>':'')+
   '<button type="button" data-action="custom-workflow-events" data-id="'+line(r.id)+'">היסטאריע</button></div>'+
   (canEdit&&r.status==='open'?'<form data-form="custom-workflow-block" data-id="'+line(r.id)+'" class="stack">'+
    '<label>וואס האלט אפ? <input name="note" maxlength="600" required placeholder="פארוואס קען מען נישט ווייטער?"></label>'+
    '<button type="submit">מעלדן פארהינדערונג</button></form>':'')+'</article>';
 }).join('');
 const tpl=isLeader?'<section class="card"><h3>אייגענע פראצעדורן פארן קאמפיין</h3>'+
   '<form data-form="custom-workflow-template" class="stack">'+
   '<label>נאמען פון דער פראצעדור<input name="title" required maxlength="160" placeholder="למשל: נייע נדבה־מערכה"></label>'+
   '<label>שריט — איין שריט אויף יעדע שורה<textarea name="steps" rows="5" required placeholder="אויסטיילן אויפגאבן&#10;רופן די עסקנים&#10;איבערקוקן די רעזולטאטן"></textarea></label>'+
   '<p class="muted">ביז 12 שריט. דאס זענען נאר מענטשלעכע ארבעטס־שטאפלען, נישט אויטאמאטישע רופן אדער באצאלונגען.</p>'+
   '<button>שאפן אייגענע פראצעדור</button></form>'+
   '<h3>אנצינדן א פראצעדור פאר אן עסקן</h3>'+
   '<form data-form="custom-workflow-run" class="stack"><label>וועלכע פראצעדור?'+
   '<select name="templateId" required>'+templates.filter(t=>!t.archived_at).map(t=>
    '<option value="'+line(t.id)+'">'+line(t.title)+'</option>').join('')+'</select></label>'+
   '<label>אויפגאבע<input name="title" maxlength="160" required placeholder="ארגאניזירן דעם צוות"></label>'+
   '<label>פאראנטווארטליכער עסקן<input name="assignedTo" maxlength="128" required placeholder="מיטגליד־ID"></label>'+
   '<button '+(templates.some(t=>!t.archived_at)?'':'disabled')+'>צוטיילן די פראצעדור</button></form>'+
   (templates.map(t=>'<div class="inline"><strong>'+line(t.title)+'</strong>'+
    '<small>'+line(toSteps(t.step_titles).length)+' שריט</small>'+
    (t.archived_at?'<span class="muted">ארכיוו</span>':
     '<button type="button" data-action="custom-workflow-archive" data-id="'+line(t.id)+'">ארכיווירן</button>')+'</div>').join(''))+
   '</section>':'';
 const events=state.customWorkflowEventsId?
  '<section class="card"><h3>פראצעדור־היסטאריע</h3><button type="button" data-action="custom-workflow-close-events">פארמאכן</button>'+
  (state.customWorkflowEvents||[]).map(e=>'<p>'+line(e.event_kind)+' · '+line(e.actor_subject)+
   ' · '+line(String(e.created_at||'').slice(0,16))+(e.note?' — '+line(e.note):'')+'</p>').join('')+'</section>':'';
 return '<section class="card"><h2>Custom — אייגענע ארבעטס־פראצעדורן</h2>'+
  '<p class="muted">יעדער שריט ווערט דורכגעפירט און באשטעטיגט דורך א מענטש. די נייע פראצעדורן פירן נישט אליין קיין געלט אדער טעלעפאן־אקטיוויטעט אויס.</p>'+
  (state.customWorkflowError?'<p role="alert">'+line(state.customWorkflowError)+'</p>':'')+
  '<div class="inline">'+['open','blocked','completed','cancelled'].map(key=>
   '<span>'+line(status[key])+' ('+line(data?.counts?.[key]||0)+')</span>').join('')+'</div>'+
  (cards.join('')||'<p class="muted">נאך קיין צוגעטיילטע פראצעדורן.</p>')+
  (data?.limit&&runs.length===data.limit?'<p class="muted">געוויזן בלויז די לעצטע 100; מער זוכן קומט אין קומענדיגן אויסבוי.</p>':'')+
  '</section>'+tpl+events;
}
