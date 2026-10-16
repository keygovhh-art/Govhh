import { CAMPAIGN_PLANS, PLAN_FEATURES, PLAN_STATUS_LABELS } from './plan-catalog.js';

// Read-only product roadmap. Nothing shown here silently activates a paid feature.
const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const figure = n => n === null ? 'לויט באזונדערן אפמאך' : String(n);

export function plansView(state) {
  const i = Number.isInteger(state.planTierIndex) ? Math.max(0, Math.min(5, state.planTierIndex)) : 0;
  const plan = CAMPAIGN_PLANS[i];
  const allowed = new Set(plan.features);
  const features = PLAN_FEATURES.filter(feature => allowed.has(feature.code));
  const status = status => status === 'pilot' ? 'pilot' : status === 'partial' ? 'partial' : 'pending';
  const counts = features.reduce((a, f) => (a[f.status]++, a), {pilot:0,partial:0,missing:0});
  const buttons = CAMPAIGN_PLANS.map((item, at) =>
    '<button type="button" data-action="plan-tier" data-index="' + at + '" class="plan-choice ' +
      (at === i ? 'chosen' : '') + '" aria-pressed="' + (at === i ? 'true':'false') + '">' +
      '<strong>' + safe(item.name) + '</strong><small>' + safe(item.yi) + '</small></button>'
  ).join('');
  const items = features.map(item =>
    '<li class="plan-feature"><span class="plan-status '+status(item.status)+'" aria-hidden="true"></span>' +
    '<div><strong>'+safe(item.yi)+'</strong><small>'+safe(PLAN_STATUS_LABELS[item.status])+'</small></div></li>'
  ).join('');
  return '<section class="card plan-guide"><h2>די זעקס קאמפיין־פלענער</h2>' +
    '<p>דער מאסטער־פלאן מיט פונקציעס און אמתן אויפבוי־מצב. דאס איז א פירמע־פלאן; ' +
    'דערווייל זענען נישטא קיין באשטעטיגטע פרייזן אדער אקטיווע Paid Subscriptions. ' +
    'א פלאן־פונקציע וואס שטייט דא איז נישט אויטאמאטיש אנגעצונדן.</p>' +
    '<div class="plan-choices" role="group" aria-label="קלייב איינעם פון די זעקס פלענער">' + buttons + '</div>' +
    '<div class="plan-detail"><h3>'+safe(plan.name)+' — '+safe(plan.yi)+'</h3>' +
    '<p class="plan-limits"><strong>עסקנים:</strong> '+figure(plan.members)+
    ' · <strong>צילן:</strong> '+figure(plan.goals)+
    ' · <strong>קאמפיינס:</strong> '+figure(plan.campaigns)+'</p>' +
    '<p><strong>Focus־סיסטעם:</strong> '+safe(plan.focus)+'</p>' +
    '<p class="muted">צוגעשטעלטע פונקציעס לויט פלאן: '+features.length+
    ' · פונקציאנירנדיקע פרואוון: '+counts.pilot+
    ' · טיילווייז: '+counts.partial+' · נאכנישט גרייט: '+counts.missing+'</p>' +
    '<ul class="plan-feature-list">'+items+'</ul>' +
    '<p class="muted">Pilot מיינט נאר געבויט אין קאוד און טיילווייז אויספרובירט; עס מיינט נישט באשטעטיגט פאר גרויסע פראדוקציע־באנוץ.</p>' +
    '<p><strong>Guided Campaign</strong> און <strong>Managed Campaign</strong> זענען עקסטערע באגלייט־סערוויסעס, נישט נאך פלאן־שטאפלען.</p>' +
    '<p class="muted">קיין טעלעפאן־פראוויידער, באשטעטיגטע באנק־צאלונגען אדער 1,000+ לייוו־שידור ווערן דא נישט צוגעזאגט.</p></div></section>';
}
