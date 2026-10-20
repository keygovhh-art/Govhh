// Custom contact permission profiles: restrictive-only add-on, never an elevation.
export function customRoleView(state,esc){
 const role=state.orgs?.find(x=>x.id===state.orgId)?.role;
 if(!['owner','manager'].includes(role))return '';
 const owner=role==='owner';
 const data=state.customRoleData||{profiles:[],assignments:[]};
 const members=(state.members||[]).filter(x=>['askan','squad_leader'].includes(x.role)&&
  x.membership_status==='active');
 const profiles=data.profiles||[];
 const assignments=new Map((data.assignments||[]).map(x=>[x.subject,x.profile_id]));
 const profilesText=profiles.map(p=>
  '<article class="item"><strong>'+esc(p.title)+'</strong><p class="muted">'+
   (p.can_view_lead_queue?'קענען זען רוף־ליסטע':'רוף־ליסטע פארבאטן')+' · '+
   (p.can_claim_leads?'מעג נעמען רופן':'קען נישט נעמען רופן')+' · '+
   (p.can_export_shared_contacts?'מעג עקספארטירן':'קען נישט עקספארטירן')+
   '</p></article>').join('');
 const ownerForm=owner?'<section class="card"><h3>א נייע רשות־מוסטער</h3>'+
   '<p class="muted">די מוסטערן קענען נאר איינשרענקען די עקזיסטירנדע עסקן־רעכטן; קיין מנהל־ אדער באנק־רעכטן ווערן קיינמאל נישט צוגעלייגט.</p>'+
   '<form data-form="custom-role-create" class="stack">'+
    '<label>נאמען<input name="title" maxlength="100" required placeholder="למשל: בלויז זען"></label>'+
    '<label><input name="canViewLeadQueue" type="checkbox" checked> מעג זען צוגעטיילטע רוף־ליסטעס</label>'+
    '<label><input name="canClaimLeads" type="checkbox"> מעג נעמען/צוריקגעבן א צוגעטיילטן קאנטאקט</label>'+
    '<label><input name="canExportSharedContacts" type="checkbox"> מעג עקספארטירן ערלויבטע קאמפיין־קשרים</label>'+
    '<button>שאפן באגרעניצטע רשות</button></form>'+
   '<h3>צוטיילן רשות־מוסטערן</h3>'+
   (members.map(m=>
    '<form data-form="custom-role-assign" class="inline">'+
     '<input type="hidden" name="subject" value="'+esc(m.subject)+'">'+
     '<label>'+esc(m.subject)+' <select name="profileId">'+
      '<option value="">נאר די נארמאלע ראלע</option>'+
      profiles.map(p=>'<option value="'+esc(p.id)+'"'+
       (assignments.get(m.subject)===p.id?' selected':'')+'>'+esc(p.title)+'</option>').join('')+
     '</select></label><button>באשטעטיגן רשות</button></form>').join('')||
    '<p class="muted">נאך קיין אקטיווע עסקנים פאר אן אייגענער רשות.</p>')+
   '</section>':'';
 return '<section class="card"><h2>Custom — מאנשאפט־רעכטן</h2>'+
  '<p class="muted">מוסטערן פאר עסקן און גרופע־פירער: ווער קען זען רוף־ליסטעס, נעמען קשרים און עקספארטירן. קיין מוסטער קען נישט איבערגיין די געבוירענע ראלע אדער דעם פלאן.</p>'+
  (state.customRoleError?'<p role="alert">'+esc(state.customRoleError)+'</p>':'')+
  (profilesText||'<p class="muted">נאך קיין אייגענע רשות־מוסטערן.</p>')+
  '</section>'+ownerForm;
}
