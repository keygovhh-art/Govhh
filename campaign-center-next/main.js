import {createAuthClient} from "@neondatabase/auth";
import "./style.css";

const root=document.querySelector("#root");
const authUrl=import.meta.env.VITE_CC_AUTH_URL;
const apiUrl=import.meta.env.VITE_CC_API_URL;
const configured=Boolean(authUrl&&apiUrl&&/^https:\/\//.test(authUrl)
  &&/^https:\/\//.test(apiUrl)&&!authUrl.includes("your-staging"));
const auth=configured?createAuthClient(authUrl):null;
const state={session:null,me:null,organization:null,campaign:null,
  campaigns:[],assignments:[],events:[],members:[],campaignMembers:[],error:"",notice:"",busy:false};
const safe=s=>String(s??"").replaceAll("&","&amp;").replaceAll("<","&lt;")
 .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
const f=v=>"$"+Number(v||0).toLocaleString("en-US",{maximumFractionDigits:2});
const fmtDate=v=>v?new Date(v).toLocaleString("en-US"):"קיין באשטימטע צייט";
function render(inner){root.innerHTML='<div class="shell"><header class="top"><strong class="brand">✦ גבהה קאמפיין סענטער</strong><span class="meta">STAGING · אמת׳ע דאַטן, נישט דעמא</span></header>'+
  (state.error?'<p class="message" role="alert">'+safe(state.error)+'</p>':"")+
  (state.notice?'<p class="message good" role="status">'+safe(state.notice)+'</p>':"")+inner+
  '<p class="hint">דער סיסטעם ווייזט נאר באשטעטיגטע קאמפיין־רעקארדס. פארטיג מאכן מעקט גארנישט אויס.</p></div>';
}
function formRows(fields){return fields.map(([label,name,type="text",required=true])=>
  '<label for="'+safe(name)+'">'+safe(label)+'</label><input id="'+safe(name)+'" name="'+safe(name)+'" type="'+type+'" '+(required?"required ":"")+'autocomplete="off">').join("");}
async function api(path,method="GET",data=null,key=null){
  if(!state.session?.user)throw Error("ערשט דארף מען זיך איינשרייבן");
  const token=await auth.getJWTToken();
  if(!token)throw Error("דער Login איז אויסגעלאפן. ביטע שרייבט אייך ווידער איין.");
  const headers={Authorization:"Bearer "+token};
  if(data!==null)headers["Content-Type"]="application/json";
  if(key)headers["Idempotency-Key"]=key;
  const res=await fetch(apiUrl+path,{
    method,headers,cache:"no-store",body:data===null?undefined:JSON.stringify(data),
  });
  const body=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(body.error||"דער סערווער האט נישט געקענט אויספירן די פעולה");
  return body;
}
function viewLogin(){
  render('<section class="card"><h2>איינשרייבן צום זיכערער קאמפיין־צענטער</h2>'+
    '<p class="hint">דאס איז די נייע, אפגעזונדערטע Neon־ווערסיע. דעמא־חשבונות ווערן נישט געוויזן.</p>'+
    '<form id="login-form">'+formRows([["אימעיל","email","email"],["פעסווארד","password","password"]])+
    '<button class="btn" type="submit">לאג אין</button></form>'+
    '<details><summary>נייע אקאונט</summary><form id="signup-form">'+formRows([["נאמען","name"],["אימעיל","newEmail","email"],["פעסווארד","newPassword","password"]])+
    '<button class="btn" type="submit">עפענען אקאונט</button></form></details></section>');
}
function viewHome(){
  const orgs=state.me?.organizations||[];
  const active=orgs.filter(x=>x.status==="active");
  const invited=orgs.filter(x=>x.status==="invited");
  const rows=active.map(x=>'<div class="item"><strong>'+safe(x.organizationName)+'</strong>'+
    '<p class="meta">ראָלע: '+safe(x.role)+'</p><button class="btn alt" data-org="'+safe(x.organizationId)+'">עפענען די ארגאניזאציע</button></div>').join("");
  const invitations=invited.map(x=>'<div class="item"><strong>'+safe(x.organizationName)+'</strong>'+
    '<p class="meta">איינלאדונג אלס '+safe(x.role)+'</p><button class="btn" data-accept="'+safe(x.organizationId)+'">אננעמען די איינלאדונג</button></div>').join("");
  render('<nav class="nav"><button class="btn alt" id="refresh">דערפרישן</button><button class="btn alt" id="logout">לאג אוט</button></nav>'+
    '<section class="card"><h2>מיינע ארגאניזאציעס</h2>'+(rows||'<p class="hint">נאך נישטא קיין אקטיווע ארגאניזאציע.</p>')+'</section>'+
    (invitations?'<section class="card"><h2>מיינע איינלאדונגען</h2>'+invitations+'</section>':"")+
    '<section class="card"><h2>נייע ארגאניזאציע</h2><form id="create-org">'+formRows([["ארגאניזאציע־נאמען","orgName"]])+
    '<button class="btn" type="submit">שאפן ארגאניזאציע</button></form></section>');
}
function viewOrganization(){
  const o=state.organization;
  const canManage=["owner","manager"].includes(o.role);
  const rows=state.campaigns.map(c=>'<div class="item"><strong>'+safe(c.title)+'</strong>'+
    '<p class="meta">ציל '+safe(f(c.goalAmount))+' · מצב '+safe(c.status)+'</p>'+
    '<button class="btn alt" data-campaign="'+safe(c.id)+'">עפענען דעם קאמפיין</button></div>').join("");
  const manage=canManage?'<section class="card"><h2>נייער קאמפיין</h2>'+
    '<form id="create-campaign">'+formRows([["קאמפיין־נאמען","campaignTitle"],["געלט־ציל ($)","goalAmount","number"]])+
    '<button class="btn" type="submit">שאפן דעם קאמפיין</button></form></section>':"";
  const memberSection=canManage?'<section class="card"><h2>מאנשאפט</h2>'+
    state.members.map(m=>'<div class="item"><strong>'+safe(m.subject)+'</strong><p class="meta">'+safe(m.role)+' · '+safe(m.status)+'</p></div>').join("")+
    (o.role==="owner"?'<form id="invite-member">'+formRows([["באשטעטיגטער באנוצער־ID","memberSubject"]])+
    '<label for="role">ראָלע</label><select id="role" name="role"><option value="askan">עסקן</option><option value="squad_leader">גרופע־פירער</option><option value="manager">מנהל</option><option value="finance">געלט־פארוואלטער</option><option value="auditor">נאכקוקער</option></select>'+
    '<button class="btn" type="submit">איינלאדן</button></form>':"")+
    '</section>':"";
  render('<nav class="nav"><button class="btn alt" id="home">← מיינע ארגאניזאציעס</button><button class="btn alt" id="refresh-org">דערפרישן</button></nav>'+
    '<section class="card"><h2>'+safe(o.organizationName)+'</h2><p class="meta">מיין ראָלע: '+safe(o.role)+'</p>'+
    '<p class="hint">דא ליגן בלויז אמת׳ע קאמפיינס. פארענדיגטע קאמפיינס בלייבן דא אין דער געשיכטע.</p>'+
    (rows||'<p class="hint">נאך נישטא קיין קאמפיינס.</p>')+'</section>'+manage+memberSection);
}
function viewCampaign(){
  const c=state.campaign;
  const canManage=["owner","manager"].includes(c.role);
  const all=state.assignments.map(a=>'<article class="item"><strong>'+safe(a.title)+'</strong>'+
    '<p class="meta">אחראי: '+safe(a.assigneeSubject)+' · '+safe(a.kind)+' · '+safe(a.priority)+
    ' · '+safe(a.status)+' · '+safe(fmtDate(a.dueAt))+'</p>'+
    '<div class="actions">'+(a.status!=="in_progress"?'<button class="btn alt" data-job="'+safe(a.id)+'" data-status="in_progress">אין ארבעט</button>':"")+
    (a.status!=="done"?'<button class="btn" data-job="'+safe(a.id)+'" data-status="done">פארטיג</button>':"")+
    '</div></article>').join("");
  const memberOptions=state.campaignMembers.filter(m=>m.status==="active").map(m=>
    '<option value="'+safe(m.subject)+'">'+safe(m.subject)+'</option>').join("");
  const attachOptions=state.members.filter(m=>m.status==="active"&&
    !state.campaignMembers.some(x=>x.subject===m.subject)).map(m=>
    '<option value="'+safe(m.subject)+'">'+safe(m.subject)+'</option>').join("");
  const manage=canManage?'<section class="card"><h2>קאמפיין־איינשטעלונגען</h2>'+
    '<form id="edit-campaign"><label for="edit-title">נאמען</label><input name="title" id="edit-title" required value="'+safe(c.title)+'">'+
    '<label for="edit-goal">ציל ($)</label><input name="goalAmount" type="number" id="edit-goal" required value="'+safe(c.goal_amount)+'">'+
    '<label for="edit-status">מצב</label><select name="status" id="edit-status">'+
    ["draft","active","paused","closed"].map(x=>'<option value="'+x+'" '+(c.status===x?"selected":"")+'>'+x+'</option>').join("")+
    '</select><button class="btn" type="submit">אפהיטן</button></form></section>'+
    '<section class="card"><h2>מאנשאפט ארייננעמען אינעם קאמפיין</h2>'+
    '<p class="hint">ערשט איינלאדן דעם עסקן צו דער ארגאניזאציע. נאכדעם צולייגן צום קאמפיין.</p>'+
    '<form id="attach-campaign-member"><label for="attachSubject">עסקן</label>'+
    '<select id="attachSubject" name="subject" required>'+attachOptions+'</select>'+
    '<label for="teamName">גרופע־נאמען (נישט מחויב)</label>'+
    '<input id="teamName" name="teamName" maxlength="120">'+
    '<button class="btn" type="submit">צולייגן צום קאמפיין</button></form></section>'+
    '<section class="card"><h2>צוטיילן אן אויפגאבע</h2><form id="create-assignment">'+
    formRows([["אויפגאבע","assignmentTitle"]])+
    '<label for="assigneeSubject">עסקן</label><select id="assigneeSubject" name="assigneeSubject" required>'+memberOptions+'</select>'+
    '<label for="kind">סארט</label><select id="kind" name="kind"><option value="task">אויפגאבע</option><option value="call_lead">רופן</option><option value="followup">נאכפאלג</option><option value="review">נאכקוקן</option></select>'+
    '<label for="priority">וויכטיגקייט</label><select id="priority" name="priority"><option value="normal">נארמאל</option><option value="high">וויכטיג</option><option value="critical">דרינגליך</option><option value="low">שפעטער</option></select>'+
    '<button class="btn" type="submit">צוטיילן</button></form></section>':"";
  const history=canManage?'<section class="card"><h2>קאמפיין־געשיכטע</h2>'+
    state.events.map(e=>'<div class="item"><strong>'+safe(e.eventType)+'</strong>'+
      '<p class="meta">'+safe(e.actorSubject)+' · '+safe(fmtDate(e.createdAt))+'</p></div>').join("")+
    '</section>':"";
  render('<nav class="nav"><button class="btn alt" id="back-org">← צוריק צום ארגאניזאציע</button><button class="btn alt" id="refresh-campaign">דערפרישן</button></nav>'+
    '<section class="card"><h2>'+safe(c.title)+'</h2><p class="meta">קאמפיין־מצב: '+safe(c.status)+'</p>'+
    '<div class="grid"><div><p class="meta">קאמפיין־ציל</p><div class="stat">'+safe(f(c.goal_amount))+'</div></div>'+
    '<div><p class="meta">אויפגאבן</p><div class="stat">'+state.assignments.length+'</div></div></div>'+
    '<p class="hint">ציל איז נישט באקומען געלט. אן א באשטעטיגטן פינאנציעלן מקור ווייזן מיר נישט קיין אויסגעטראכטע אויפגעברענגטע סכומים.</p>'+
    '</section><section class="card"><h2>די אמת׳ע מאנשאפט־אויפגאבן</h2>'+
    (all||'<p class="hint">נאך נישטא קיין צוטיילונגען.</p>')+'</section>'+manage+history);
}
async function refreshMe(){
  state.me=await api("/api/me");state.organization=null;state.campaign=null;
  viewHome();
}
async function openOrg(id){
  const o=state.me.organizations.find(x=>x.organizationId===id&&x.status==="active");
  if(!o)throw Error("ארגאניזאציע נישט געפונען");
  state.organization=o;state.campaign=null;
  state.campaigns=await api("/api/organizations/"+id+"/campaigns");
  state.members=["owner","manager"].includes(o.role)?
    await api("/api/organizations/"+id+"/members"):[];
  viewOrganization();
}
async function openCampaign(id){
  state.campaign=await api("/api/campaigns/"+id);
  state.assignments=await api("/api/campaigns/"+id+"/assignments");
  state.campaignMembers=["owner","manager"].includes(state.campaign.role)?
    await api("/api/campaigns/"+id+"/members"):[];
  state.events=["owner","manager"].includes(state.campaign.role)?
    (await api("/api/campaigns/"+id+"/history")).items:[];
  viewCampaign();
}
async function init(){
  if(!configured){
    render('<section class="card"><h2>דער נייע קאמפיין־מאָטאר איז נאך נישט פארבונדן</h2>'+
      '<p class="message">צושטעלן די STAGING Neon Auth URL און API URL. קיין לעבעדיגע דאַטן ווערן נישט געטוישט.</p></section>');
    return;
  }
  try{
    const result=await auth.getSession();
    state.session=result?.data||null;
    if(state.session?.user)await refreshMe();else viewLogin();
  }catch(e){state.error=e.message||String(e);viewLogin();}
}
root.addEventListener("click",async event=>{
  const el=event.target.closest("button");if(!el||state.busy)return;
  const run=async()=>{
    if(el.id==="home"||el.id==="refresh")return refreshMe();
    if(el.id==="refresh-org"||el.id==="back-org")return openOrg(state.organization.organizationId);
    if(el.id==="refresh-campaign")return openCampaign(state.campaign.id);
    if(el.dataset.org)return openOrg(el.dataset.org);
    if(el.dataset.campaign)return openCampaign(el.dataset.campaign);
    if(el.dataset.accept){
      await api("/api/organizations/"+el.dataset.accept+"/invitations/accept","POST",{});
      state.notice="איינלאדונג אנגענומען";return refreshMe();
    }
    if(el.dataset.job){
      await api("/api/campaigns/"+state.campaign.id+"/assignments/"+el.dataset.job,
        "PATCH",{status:el.dataset.status});
      state.notice="אויפגאבע אפגעהיטן אין דער געשיכטע";
      return openCampaign(state.campaign.id);
    }
    if(el.id==="logout"){await auth.signOut();state.session=null;state.me=null;viewLogin();}
  };
  try{state.busy=true;el.disabled=true;state.error="";state.notice="";await run();}
  catch(e){state.error=e.message||String(e);if(state.campaign)viewCampaign();else if(state.organization)viewOrganization();else viewHome();}
  finally{state.busy=false;el.disabled=false;}
});
root.addEventListener("submit",async event=>{
  const form=event.target;if(!form.id)return;
  event.preventDefault();
  if(state.busy)return;
  state.busy=true;state.error="";state.notice="";
  const data=Object.fromEntries(new FormData(form));
  try{
    if(form.id==="login-form"){
      const result=await auth.signIn.email({email:data.email,password:data.password});
      if(result.error)throw Error(result.error.message||"Login נישט געלונגען");
      const session=await auth.getSession();state.session=session.data;await refreshMe();
    }else if(form.id==="signup-form"){
      const result=await auth.signUp.email({
        name:data.name,email:data.newEmail,password:data.newPassword,
      });
      if(result.error)throw Error(result.error.message||"נישט געלונגען");
      state.notice="אקאונט געשאפן. שרייבט אייך איין.";
      viewLogin();
    }else if(form.id==="create-org"){
      await api("/api/organizations","POST",{name:data.orgName});
      state.notice="ארגאניזאציע געשאפן";await refreshMe();
    }else if(form.id==="create-campaign"){
      await api("/api/organizations/"+state.organization.organizationId+"/campaigns",
        "POST",{title:data.campaignTitle,goalAmount:data.goalAmount});
      state.notice="קאמפיין געשאפן";await openOrg(state.organization.organizationId);
    }else if(form.id==="invite-member"){
      await api("/api/organizations/"+state.organization.organizationId+"/members",
        "POST",{subject:data.memberSubject,role:data.role});
      state.notice="איינלאדונג געשיקט";await openOrg(state.organization.organizationId);
    }else if(form.id==="edit-campaign"){
      await api("/api/campaigns/"+state.campaign.id,"PATCH",data);
      state.notice="קאמפיין אפגעהיטן";await openCampaign(state.campaign.id);
    }else if(form.id==="attach-campaign-member"){
      await api("/api/campaigns/"+state.campaign.id+"/members","POST",{
        subject:data.subject,teamName:data.teamName||"",
      });
      state.notice="דער עסקן איז צוגעלייגט צום קאמפיין";await openCampaign(state.campaign.id);
    }else if(form.id==="create-assignment"){
      await api("/api/campaigns/"+state.campaign.id+"/assignments","POST",{
        title:data.assignmentTitle,assigneeSubject:data.assigneeSubject,
        kind:data.kind,priority:data.priority,
      },crypto.randomUUID());
      state.notice="אויפגאבע צוגעטיילט";await openCampaign(state.campaign.id);
    }
  }catch(e){
    state.error=e.message||String(e);
    if(state.campaign)viewCampaign();else if(state.organization)viewOrganization();else if(state.session)viewHome();else viewLogin();
  }finally{state.busy=false;}
});
await init();
