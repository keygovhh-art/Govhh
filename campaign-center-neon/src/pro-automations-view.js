// Askan Pro — transparent, manual-triggered private CRM follow-up automation.
// This UI MUST NOT describe automatic scheduled calls, background jobs or SMS.
export function proAutomationsView(state,esc){
 const data=state.proAutomations;
 const available=state.entitlements?.usableFeatures?.includes('automations');
 if(!available)return '<section class="card"><h2>Askan Pro — Automations</h2>'+
  '<p>פאר דעם אפטיילונג דארף מען א באשטעטיגטן Askan Pro־פלאן.</p></section>';
 const r=data?.rule||{enabled:false,maxTasksPerRun:10};
 const link=(data?.createdLinks||[]).map(x=>'<article class="item"><div>'+
  '<strong>'+esc(x.display_name)+'</strong>'+
  '<small>נייער פריוואטער נאכפאלג־אויפגאבע · טערמין '+esc(String(x.due_snapshot||'').slice(0,16))+'</small></div>'+
  '<button type="button" data-action="pro-automation-open-contact" data-id="'+esc(x.contact_id)+'">עפענען דעם קשר</button></article>').join('');
 const runs=(data?.runs||[]).map(x=>'<p class="muted">'+esc(String(x.ran_at||'').slice(0,16))+
  ' · געשאפן '+esc(x.created_tasks)+' אויפגאבן דורך אייער דרוק</p>').join('');
 return '<section class="card"><h2>Askan Pro — CRM־נאכפאלג־Automations</h2>'+
  '<p class="muted">די מערכת דערקענט פארשפעטיגטע CRM־נאכפאלגן פון קשרים וואס דו האסט אליין אריינגעלייגט. זי מאכט נאר אויפגאבן פאר דיר; נישט קיין רופן, SMS, אימעילס אדער אויטאמאטישע באצאלונגען. זי לויפט נאר ווען דו דרוקסט בפירוש דעם קנעפל.</p>'+
  (state.proAutomationsError?'<p role="alert">'+esc(state.proAutomationsError)+'</p>':'')+
  '<p><strong>'+esc(data?.eligibleCount??0)+'</strong> קשרים זענען איצט גרייט פאר א נאכפאלג־אויפגאבע, נאך דעם וואס Do Not Call און שוין באשאפן אויפגאבן זענען ארויסגעפילטערט.</p>'+
  '<form data-form="pro-automation-settings" class="stack">'+
  '<label><input type="checkbox" name="enabled" '+(r.enabled?'checked':'')+'> איך ערלויב די אייגענע אויפגאבן־פונקציע</label>'+
  '<label>מאקסימום אויפגאבן מיט איין דרוק (1–20)<input type="number" name="maxTasksPerRun" min="1" max="20" step="1" value="'+esc(r.maxTasksPerRun)+'" required></label>'+
  '<button>אפהיטן מיינע כללים</button></form>'+
  (r.enabled?'<button type="button" data-action="pro-automation-run">יעצט שאפן מיינע נאכפאלג־אויפגאבן</button>':
    '<p class="muted">קודם אנצינדן און אפהיטן די כללים, דערנאך קענסטו זיי אויספירן.</p>')+
  '</section><section class="card"><h3>מיינע צוגעגרייטע נאכפאלגן</h3>'+
  (link||'<p class="muted">נאך נישט געשאפן קיין פריוואטע נאכפאלג־אויפגאבן.</p>')+
  '<h3>מיינע לעצטע אויספירונגען</h3>'+ (runs||'<p class="muted">נאך נישט אויסגעפירט.</p>')+'</section>';
}
