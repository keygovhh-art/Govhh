// Organization Resource Allocation: planned budgets and volunteer-hour capacity.
// No money is transferred and no staff hours are automatically logged.
export function organizationResourcesView(state,esc){
 const pools=state.organizationResources?.pools||[];
 const form='<section class="card"><h2>מוסדישע כוחות־פארטיילונג — נייער חודש</h2>'+
  '<p class="muted">שטעלט אויס וויפיל בודזשעט און וואַלונטיר־שעות דער מוסד פלאנט פאר א באשטימטן חודש און מטבע. דאס איז נאר א פלאן, נישט קיין באצאלונג.</p>'+
  '<form data-form="organization-resource-pool-new" class="stack">'+
  '<label>חודש<input type="month" name="period" required></label>'+
  '<label>מטבע<input name="currency" maxlength="3" minlength="3" pattern="[A-Z]{3}" value="USD" required></label>'+
  '<label>פלאנירטער בודזשעט<input type="number" name="budgetTotal" min="0" step="0.01" required></label>'+
  '<label>וואַלונטיר־שעות<input type="number" name="volunteerHoursTotal" min="0" step="1" required></label>'+
  '<button>שאפן א נייעם חודש־פלאן</button></form></section>';
 const blocks=pools.map(p=>{
  const period=String(p.period_start).slice(0,7);
  const campaigns=(state.campaigns||[]).filter(c=>c.currency===p.currency);
  const options=campaigns.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.title)+'</option>').join('');
  const allocationRows=(p.allocations||[]).map(a=>
   '<form data-form="organization-resource-allocation" data-pool-id="'+esc(p.id)+'" class="stack">'+
   '<strong>'+esc(a.campaign_title)+'</strong>'+
   '<input type="hidden" name="campaignId" value="'+esc(a.campaign_id)+'">'+
   '<label>פארטיילטער בודזשעט<input type="number" name="budgetAllocated" min="0" step="0.01" value="'+esc(a.budget_allocated)+'" required></label>'+
   '<label>פארטיילטע שעה<input type="number" name="volunteerHoursAllocated" min="0" step="1" value="'+esc(a.volunteer_hours_allocated)+'" required></label>'+
   '<button>אפהיטן נייע פארטיילונג</button></form>').join('');
  const newAllocation=options?
   '<form data-form="organization-resource-allocation" data-pool-id="'+esc(p.id)+'" class="stack">'+
   '<label>קאמפיין<select name="campaignId" required>'+options+'</select></label>'+
   '<label>פארטיילן פון בודזשעט<input name="budgetAllocated" type="number" min="0" step="0.01" required value="0"></label>'+
   '<label>פארטיילן שעה<input name="volunteerHoursAllocated" type="number" min="0" step="1" required value="0"></label>'+
   '<button>פארטיילן צו א קאמפיין</button></form>':
   '<p class="muted">נאך נישטא א קאמפיין מיט דעם מטבע.</p>';
  return '<section class="card"><h3>'+esc(period)+' — '+esc(p.currency)+'</h3>'+
   '<p><strong>איבערגעבליבענער בודזשעט: '+esc(p.remaining_budget)+
   ' · איבערגעבליבענע שעה: '+esc(p.remaining_hours)+'</strong></p>'+
   '<form data-form="organization-resource-pool-update" data-pool-id="'+esc(p.id)+'" class="stack">'+
   '<label>גאנצער מאקסימום־בודזשעט<input name="budgetTotal" type="number" min="0" step="0.01" value="'+esc(p.budget_total)+'" required></label>'+
   '<label>גאנצע וואַלונטיר־שעות<input name="volunteerHoursTotal" type="number" min="0" step="1" value="'+esc(p.volunteer_hours_total)+'" required></label>'+
   '<button>אפהיטן חודש־קאפאציטעט</button></form>'+
   '<h3>פארטיילונג צווישן קאמפיינס</h3>'+
   (allocationRows||'<p class="muted">נאך קיין פארטיילונגען.</p>')+
   '<h3>צוטיילן צו א קאמפיין</h3>'+newAllocation+'</section>';
 }).join('');
 return '<section class="card"><h2>Organization — Resource Allocation</h2>'+
  '<p class="muted">א קאמפיין קען נישט באקומען מער ווי דער איבערגעבליבענער חודש־בודזשעט אדער שעה, און מען קען נישט פארמישן מטבעות. יעדע אמתע ענדערונג האט א באשיצטע Audit־געשיכטע.</p>'+
  (state.organizationResourcesError?'<p role="alert">'+esc(state.organizationResourcesError)+'</p>':'')+
  '</section>'+form+(blocks||'<p class="muted">קיין חודש־פלאן איז נאך נישט געשאפן.</p>');
}
