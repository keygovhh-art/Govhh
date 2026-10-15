import { createAuthClient } from '@neondatabase/auth';
import './style.css';
import { teamView } from './team-view.js';
import { hallView } from './hall-view.js';

const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = x => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(x||0));
const state = {auth:null,user:null,orgs:[],orgId:null,campaigns:[],campaignId:null,overview:null,tasks:[],contacts:[],finance:[],tab:'today',notice:'',busy:false,manager:null,members:[],leads:[],assignees:[],invitationCode:'',connectCode:'',linkStatus:null,confirmUnlink:false,rooms:[],hallAnnouncements:[],joinedRoomId:null};
async function api(path,options={}) {
  const token = await state.auth.getJWTToken();
  if(!token)throw new Error('מען דארף זיך איינשרייבן');
  const r=await fetch('/api'+path,{
    ...options,
    headers:{...options.headers,Authorization:'Bearer '+token,...(options.body?{'Content-Type':'application/json'}:{})}
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.error || 'דער פארלאנג איז נישט געלונגען');
  return data;
}
async function refresh() {
  if(!state.user)return;
  const me=await api('/me');
  state.orgs=me.organizations;
  if(!state.orgs.some(x=>x.id===state.orgId))state.orgId=state.orgs[0]?.id||null;
  state.campaigns=state.orgId?await api('/organizations/'+state.orgId+'/campaigns'):[];
  if(!state.campaigns.some(x=>x.id===state.campaignId))state.campaignId=state.campaigns[0]?.id||null;
  if(state.campaignId){
    const id=state.campaignId;
    [state.overview,state.tasks,state.contacts,state.finance]=await Promise.all([
      api('/campaigns/'+id+'/overview'),api('/campaigns/'+id+'/tasks'),
      api('/campaigns/'+id+'/contacts'),api('/campaigns/'+id+'/finance')
    ]);
  }else{state.overview=null;state.tasks=[];state.contacts=[];state.finance=[];}
  state.manager=null;state.members=[];state.leads=[];state.assignees=[];state.rooms=[];state.hallAnnouncements=[];
  if(state.campaignId){
    const rooms=await api('/rooms/campaigns/'+state.campaignId).catch(()=>({rooms:[]}));
    state.rooms=rooms.rooms||[];
    if(state.joinedRoomId){
      const room=state.rooms.find(r=>r.id===state.joinedRoomId&&r.room_status==='open');
      if(room)state.hallAnnouncements=await api('/rooms/'+room.id+'/announcements').catch(()=>[]);
      else state.joinedRoomId=null;
    }
  }
  if(state.orgId){
    const role=state.orgs.find(x=>x.id===state.orgId)?.role;
    const calls=[
      api('/connect/status').then(v=>state.linkStatus=v),
      ...(state.campaignId?[
        api('/team/campaigns/'+state.campaignId+'/assignees').then(v=>state.assignees=v)
      ]:[]),
      ...(state.campaignId&&['owner','manager','finance','auditor'].includes(role)?[
        api('/team/campaigns/'+state.campaignId+'/manager-overview').then(v=>state.manager=v)
      ]:[]),
      ...(state.campaignId&&['owner','manager','squad_leader','askan'].includes(role)?[
        api('/team/campaigns/'+state.campaignId+'/lead-queue').then(v=>state.leads=v)
      ]:[]),
      ...(['owner','manager'].includes(role)?[
        api('/team/organizations/'+state.orgId+'/members').then(v=>state.members=v)
      ]:[])
    ];
    await Promise.allSettled(calls);
  }else{
    try{state.linkStatus=await api('/connect/status');}catch{}
  }
  draw();
}
function authView(){
 return `<main class="auth-wrap"><div class="auth-hero"><div class="logo">✦</div><h1>גבהה קאמפיין סענטער</h1>
 <p>קאמפיינס, עסקנים, קשרים און אויפגאבן — אויף איין ארט.</p><small>Neon־באזירטע פריערדיגע טעסט־ווערסיע</small></div>
 <div class="auth-grid">
 <form data-form="signin" class="card"><h2>אריינגיין</h2><label>בליצפאסט <input type="email" name="email" autocomplete="email" required></label><label>פעסווארט <input type="password" name="password" autocomplete="current-password" required></label><button class="primary">אריינגיין</button></form>
 <form data-form="signup" class="card"><h2>אנהייבן אקאונט</h2><label>נאמען <input name="name" autocomplete="name" required maxlength="120"></label><label>בליצפאסט <input name="email" type="email" autocomplete="email" required></label><label>פעסווארט <input type="password" name="password" autocomplete="new-password" minlength="8" required></label><button>שאפן אקאונט</button></form></div></main>`;
}
function toolbar() {
 const org=state.orgs.find(x=>x.id===state.orgId);
 return `<header class="top"><div><div class="eyebrow">GAVHAH · Campaign Center</div><h1>קאמפיין סענטער</h1><small>שלום ${esc(state.user.name||state.user.email||'עסקן')}</small></div><button class="subtle" data-action="logout">ארויסגיין</button></header>
 <section class="selects">
  <label>מוסד <select data-action="org-select">${state.orgs.map(o=>`<option value="${esc(o.id)}" ${o.id===state.orgId?'selected':''}>${esc(o.name)}</option>`).join('')}</select></label>
  <label>קאמפיין <select data-action="campaign-select">${state.campaigns.map(c=>`<option value="${esc(c.id)}" ${c.id===state.campaignId?'selected':''}>${esc(c.title)}</option>`).join('')}</select></label>
  <div class="eyebrow">${org?'רשות: '+esc(org.role):'נאך קיין מוסד'}</div>
 </section>`;
}
function orgSetup() {
 return `<section class="card"><h2>דער ערשטער שריט</h2><p>שאף א מוסד. דו וועסט זיין דער אייגנטימער; אן אנדער מוסד קען נישט לייענען דיינע דאטן.</p>
 <form data-form="org" class="inline"><input name="name" required maxlength="120" placeholder="נאמען פונעם מוסד"><button class="primary">שאפן מוסד</button></form><h3>איינלאדונג פון א מנהל</h3><form class="inline" data-form="redeem-invite"><input name="invitationCode" required dir="ltr" maxlength="32" placeholder="איינלאדונגס־קאוד"><button>זיך אנשליסן</button></form></section>`;
}
function campaignSetup(){
 return `<section class="card"><h2>קאמפיין שאפן</h2><form data-form="campaign" class="inline"><input name="title" required maxlength="160" placeholder="קאמפיין־נאמען"><input name="goalAmount" type="number" min="0" step="0.01" placeholder="ציל אין $"><button class="primary">שאפן קאמפיין</button></form></section>`;
}
function campaignNav(){
 return `<nav class="tabs">${[['today','היינט'],['people','קשרים'],['finance','נדבות'],['history','היסטאריע'],['team','מאנשאפט'],['hall','עסקנים־זאל']].map(([k,v])=>`<button data-action="tab" data-tab="${k}" class="${state.tab===k?'current':''}">${v}</button>`).join('')}</nav>`;
}
function today(){
 const f=Object.fromEntries((state.overview?.finance||[]).map(x=>[x.event_kind,Number(x.amount)]));
 return `<div class="metrics"><div><span>ציל</span><strong>${money(state.overview?.campaign?.goal_amount)}</strong></div><div><span>צוגעזאגט</span><strong>${money(f.pledge)}</strong></div><div><span>באריכטעט באקומען (נעטא)</span><strong>${money(Math.max(0,(f.receipt||0)-(f.refund||0)))}</strong></div></div>
 <section class="card"><h2>נייע אויפגאבע</h2><form data-form="task" class="inline"><input name="title" required placeholder="וואס דארף געטון ווערן?"><select name="priority"><option value="normal">נארמאל</option><option value="high">וויכטיג</option><option value="critical">קריטיש</option></select><select name="kind"><option value="task">אויפגאבע</option><option value="followup">נאכפאלג</option><option value="call_lead">רופן</option></select><select name="assigneeSubject"><option value="">פאר מיר</option>${state.assignees.map(m=>`<option value="${esc(m.subject)}">${esc(m.subject)} — ${esc(m.team_name||"אנדערע")}</option>`).join("")}</select><button>צולייגן</button></form></section>
 <section class="card"><h2>אויפגאבן <span class="count">${state.tasks.length}</span></h2>${state.tasks.length?state.tasks.map(t=>`<article class="item"><div><strong>${esc(t.title)}</strong><small>${esc(t.kind)} · ${esc(t.priority)} · ${esc(t.status)}</small></div><div class="actions">${t.status!=='done'?`<button data-action="done" data-id="${esc(t.id)}">פארענדיגט</button>`:''}</div></article>`).join(''):'<p class="muted">נאך קיין אויפגאבן.</p>'}</section>`;
}
function people(){
 return `<section class="card"><h2>נייער קשר</h2><form class="stack" data-form="contact"><input name="name" required placeholder="נאמען"><input name="phone" type="tel" placeholder="טעלעפאן"><input name="notes" maxlength="2000" placeholder="נאטיץ"><label>פריוואטקייט <select name="privacy"><option value="campaign">קאמפיין־מיטגלידער</option><option value="private">נאר איך</option></select></label><button>אפהיטן קשר</button></form></section>
 <section class="card"><h2>קשרים <span class="count">${state.contacts.length}</span></h2>
 ${state.contacts.length?state.contacts.map(c=>`<article class="item"><div><strong>${esc(c.display_name)}</strong><small>${esc(c.phone)} · ${esc(c.privacy)} ${c.do_not_call?'· נישט רופן':''}</small></div><button data-action="calls" data-id="${esc(c.id)}">רוף־היסטאריע</button></article>`).join(''):'<p class="muted">נאכנישטא קיין קשרים.</p>'}</section>
 <section class="card"><h2>רוף־רעזולטאט איינשרייבן</h2><p class="muted">דאס רעקארדירט בלויז אן איינגעגעבן רעזולטאט; דער סיסטעם רופט נאכנישט אליין.</p>
 <form class="stack" data-form="call"><select name="contactId" required><option value="">קלייב א קשר</option>${state.contacts.filter(c=>!c.do_not_call).map(c=>`<option value="${esc(c.id)}">${esc(c.display_name)}</option>`).join('')}</select><select name="outcome"><option value="no_answer">נישט געענטפערט</option><option value="spoke">גערעדט</option><option value="callback">צוריקרופן</option><option value="pledged">צוגעזאגט</option><option value="not_interested">נישט אינטערעסירט</option><option value="do_not_call">נישט מער רופן</option></select><input name="note" placeholder="נאטיץ (אויסוואל)"><button>אפהיטן אין היסטאריע</button></form></section>`;
}
function finance(){
 const role=state.overview?.campaign?.role;
 return `<div class="card"><h2>פלעדזשעס און באצאלונגען</h2><p class="muted">א פלעדזש איז נישט באקומען געלט. בלויז א באשטעטיגטע האנטליכע קבלה ווערט גערעכנט אלס באצאלט. דאס איז נישט קיין צאלונג־פראוויידער.</p>
 <form data-form="finance" class="stack"><select name="kind"><option value="pledge">צוגעזאגט</option>${['owner','finance'].includes(role)?'<option value="receipt">באשטעטיגט באקומען</option>':''}</select><input name="amount" required type="number" min=".01" step=".01" placeholder="$ סכום"><input name="verificationReference" placeholder="באשטעטיגונג־רעפערענץ (פאר באקומען געלט)"><button class="primary">אפהיטן</button></form></div>
 <section class="card"><h2>געלט־היסטאריע</h2>${state.finance.length?state.finance.map(x=>`<article class="item"><div><strong>${money(x.amount)}</strong><small>${esc(x.event_kind)} · ${x.verified_at?'באשטעטיגט':'נישט באשטעטיגט'} · ${esc(x.created_at?.slice(0,10)||'')}</small></div></article>`).join(''):'<p class="muted">נאכנישטא קיין פינאנציעלע רעקארדס.</p>'}</section>`;
}
function history(){
 return `<section class="card"><h2>היסטאריע בלייבט</h2><p>אויפגאבן, געשפרעכן און פינאנציעלע רעקארדס ווערן נישט אויטאמאטיש אויסגעמעקט ווען א קאמפיין ענדיגט זיך.</p>
 <p class="muted">דער צענטראלער Audit Trail ווערט אנגעפילט פונעם סערווער. די פארגעשריטענע היסטאריע־זוך, פילטערס, צייט־ליניעס און ארכיוו־אויסשטעל בלייבן נאך צו בויען.</p></section>`;
}
function draw(){
 $('#app').innerHTML= `${state.user?'<div class="shell">'+toolbar()+(state.orgs.length?(!state.campaignId?campaignSetup():campaignNav()+(state.tab==='today'?today():state.tab==='people'?people():state.tab==='finance'?finance():state.tab==='team'?teamView(state,esc,money):state.tab==='hall'?hallView(state,esc):history())):orgSetup())+'</div>':authView()}
 ${state.notice?`<div class="toast" role="status">${esc(state.notice)}</div>`:''}`;
}
function say(message){state.notice=message;draw();}
async function submit(event){
 const form=event.target.closest('form[data-form]');if(!form)return;
 event.preventDefault();if(state.busy)return;
 state.busy=true;
 const d=Object.fromEntries(new FormData(form).entries());
 try {
  switch(form.dataset.form){
   case 'signin': {const r=await state.auth.signIn.email({email:d.email,password:d.password});if(r.error)throw new Error(r.error.message);break;}
   case 'signup': {const r=await state.auth.signUp.email({name:d.name,email:d.email,password:d.password});if(r.error)throw new Error(r.error.message);state.notice='אקאונט געשאפן. אויב מען פארלאנגט באשטעטיגונג, קוק דיין בליצפאסט.';break;}
   case 'org': await api('/organizations',{method:'POST',body:JSON.stringify({name:d.name})});break;
   case 'redeem-invite': await api('/team/invitations/redeem',{method:'POST',body:JSON.stringify({invitationCode:d.invitationCode})});break;
   case 'member-team': await api('/team/campaigns/'+state.campaignId+'/members/'+encodeURIComponent(d.subject)+'/team',{method:'PATCH',body:JSON.stringify({teamName:d.teamName})});break;
   case 'hall-new': await api('/rooms/campaigns/'+state.campaignId,{method:'POST',body:JSON.stringify({title:d.title})});break;
   case 'hall-message': await api('/rooms/'+state.joinedRoomId+'/announcements',{method:'POST',body:JSON.stringify({message:d.message})});break;
   case 'contact-team': await api('/team/campaigns/'+state.campaignId+'/contacts/'+encodeURIComponent(d.contactId)+'/team',{method:'PATCH',body:JSON.stringify({teamName:d.teamName})});break;
   case 'invite': {
     if(d.campaignOnly&&['manager','finance','auditor'].includes(d.role))throw new Error('דאס איז א מוסד־ברייטער ראלע. נעם אראפ דעם צייכן ״בלויז דעם קאמפיין״ אדער קלייב גרופע־פירער/עסקן.');
     const r=await api('/team/organizations/'+state.orgId+'/invitations',{method:'POST',
       body:JSON.stringify({role:d.role,campaignId:d.campaignOnly?state.campaignId:null})});
     state.invitationCode=r.invitationCode;
     break;
   }
   case 'campaign': await api('/organizations/'+state.orgId+'/campaigns',{method:'POST',body:JSON.stringify({title:d.title,goalAmount:d.goalAmount})});break;
   case 'task': await api('/campaigns/'+state.campaignId+'/tasks',{method:'POST',body:JSON.stringify({title:d.title,priority:d.priority,kind:d.kind,assigneeSubject:d.assigneeSubject||undefined})});break;
   case 'contact': await api('/campaigns/'+state.campaignId+'/contacts',{method:'POST',body:JSON.stringify({name:d.name,phone:d.phone,notes:d.notes,privacy:d.privacy})});break;
   case 'call': await api('/contacts/'+d.contactId+'/calls',{method:'POST',body:JSON.stringify({outcome:d.outcome,note:d.note})});break;
   case 'finance': await api('/campaigns/'+state.campaignId+'/finance',{method:'POST',body:JSON.stringify({kind:d.kind,amount:d.amount,verificationReference:d.verificationReference})});break;
  }
  const result=await state.auth.getSession();
  state.user=result.data?.user||null;
  await refresh();
  state.notice='געהיטן!';
  draw();
 } catch(error){say(error.message);}finally{state.busy=false;}
}
async function click(event){
 const btn=event.target.closest('[data-action]');if(!btn)return;
 const a=btn.dataset.action;
 try {
  if(a==='logout'){await state.auth.signOut();state.user=null;state.notice='';draw();return;}
  if(a==='tab'){state.tab=btn.dataset.tab;draw();return;}
  if(a==='done'){await api('/tasks/'+btn.dataset.id,{method:'PATCH',body:JSON.stringify({status:'done'})});await refresh();return;}
  if(a==='new-connect-code'){const r=await api('/connect/code',{method:'POST',body:'{}',headers:{'Content-Type':'application/json'}});state.connectCode=r.code;draw();return;}
  if(a==='unlink-max'){if(!state.confirmUnlink){state.confirmUnlink=true;say('נאכאמאל דרוקן אויסלעשן פארבינדונג צו באשטעטיגן');return;}await api('/connect/unlink',{method:'POST',body:'{}',headers:{'Content-Type':'application/json'}});state.confirmUnlink=false;state.connectCode='';await refresh();return;}
  if(a==='claim-lead'){await api('/team/contacts/'+btn.dataset.id+'/claim',{method:'POST',body:'{}',headers:{'Content-Type':'application/json'}});await refresh();return;}
  if(a==='release-lead'){await api('/team/contacts/'+btn.dataset.id+'/release',{method:'POST',body:'{}',headers:{'Content-Type':'application/json'}});await refresh();return;}
  if(a==='hall-refresh'){await refresh();return;}
  if(a==='hall-open'||a==='hall-pause'||a==='hall-end'){
    const status=a==='hall-open'?'open':a==='hall-pause'?'paused':'ended';
    await api('/rooms/'+btn.dataset.id+'/status',{method:'PATCH',body:JSON.stringify({status})});
    if(status==='ended'&&state.joinedRoomId===btn.dataset.id)state.joinedRoomId=null;
    await refresh();return;
  }
  if(a==='hall-join'){
    await api('/rooms/'+btn.dataset.id+'/join',{method:'POST',body:'{}',headers:{'Content-Type':'application/json'}});
    state.joinedRoomId=btn.dataset.id;await refresh();return;
  }
  if(a==='hall-leave'){
    await api('/rooms/'+btn.dataset.id+'/leave',{method:'POST',body:'{}',headers:{'Content-Type':'application/json'}});
    state.joinedRoomId=null;await refresh();return;
  }
  if(a==='calls'){const c=state.contacts.find(x=>x.id===btn.dataset.id);const calls=await api('/contacts/'+btn.dataset.id+'/calls');say((c?.display_name||'')+' — '+(calls.length?calls.map(x=>x.outcome+' '+x.created_at.slice(0,10)).join(' | '):'נאך קיין רופן'));return;}
  if(a==='org-select'){return;}
  if(a==='campaign-select'){return;}
 }catch(error){say(error.message);}
}
document.addEventListener('submit',submit);
document.addEventListener('click',click);
document.addEventListener('change',async e=>{
 try {
  if(e.target?.dataset?.action==='org-select'){state.orgId=e.target.value;state.campaignId=null;await refresh();}
  if(e.target?.dataset?.action==='campaign-select'){state.campaignId=e.target.value;await refresh();}
 }catch(error){say(error.message);}
});
async function boot(){
 try{
  const cfg=await fetch('/api/config').then(r=>r.json());
  if(!cfg.neonAuthUrl)throw new Error('Neon Auth איז נאכנישט קאנפיגורירט');
  if(!cfg.ready){$('#app').innerHTML='<main class="auth-wrap"><section class="card"><h1>גבהה קאמפיין סענטער</h1><p>דער Render־סערוויס איז צוגעגרייט. פארן אמתן ארבעטן דארף מען נאך אריינלייגן די געהיימע Neon DATABASE_URL אין Render Environment.</p><p class="muted">קיין דאטן זענען נישט אריבערגעפירט געווארן און קיין קאמפיין איז נאך נישט פארעפנטליכט.</p></section></main>';return;}
  state.auth=createAuthClient(cfg.neonAuthUrl);
  const s=await state.auth.getSession();
  state.user=s.data?.user||null;
  if(state.user)await refresh();else draw();
 }catch(error){$('#app').textContent='סיסטעם־פארבינדונג: '+error.message;}
}
boot();
// Heartbeat is sent only while the participant is viewing the page.
// The count is not fake attendance: backend expires stale participants after 45 seconds.
setInterval(async()=>{
 if(!state.joinedRoomId||!state.user||document.visibilityState!=='visible')return;
 try{await api('/rooms/'+state.joinedRoomId+'/heartbeat',{
  method:'POST',body:'{}',headers:{'Content-Type':'application/json'}
 });}
 catch{state.joinedRoomId=null;state.hallAnnouncements=[];}
},30000);
