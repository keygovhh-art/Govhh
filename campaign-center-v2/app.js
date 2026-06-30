const STORAGE_KEY = 'gavhah-campaign-center-v2-state';
let language = localStorage.getItem('gavhah-language') || 'yi';
let selectedPlan = 'Askan Pro';
let planMode = 'change';
let campaignEditorMode = 'edit';
let guideStep = 0;
let guideScore = 0;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const today = () => new Date().toISOString().slice(0, 10);

const featureCatalog = {
  personal_tasks: { icon: '✓', yi: 'פערזענליכע טעסקס', en: 'Personal tasks', yiDesc: 'Private tasks, reminders and follow-ups', enDesc: 'Private tasks, reminders and follow-ups' },
  private_notes: { icon: '🔒', yi: 'Private Notes', en: 'Private notes', yiDesc: 'שטרענג פריוואטע נאטיצן און פלאנירונג', enDesc: 'Strictly private notes and planning' },
  contacts: { icon: '☎', yi: 'קשרים', en: 'Contacts', yiDesc: 'פערזענליכע און קאמפיין־קשרים', enDesc: 'Personal and campaign contacts' },
  campaign_core: { icon: '🗂', yi: 'קאמפיין Dashboard', en: 'Campaign dashboard', yiDesc: 'נאמען, ציל, דאטעס, Status און Progress', enDesc: 'Name, goal, dates, status and progress' },
  goals: { icon: '🎯', yi: 'קאמפיין צילן', en: 'Campaign goals', yiDesc: 'מערערע צילן מיט Target און Deadline', enDesc: 'Multiple goals with targets and deadlines' },
  tasks: { icon: '☑', yi: 'קאמפיין טעסקס', en: 'Campaign tasks', yiDesc: 'Assign, edit, complete and archive', enDesc: 'Assign, edit, complete and archive' },
  pledges: { icon: '🤝', yi: 'פלעדזשעס', en: 'Pledges', yiDesc: 'Pledge status און Follow-up', enDesc: 'Pledge status and follow-up' },
  manual_records: { icon: '$', yi: 'Manual נדבה רעקארדס', en: 'Manual donation records', yiDesc: 'Checks, cash, pledges און external payments', enDesc: 'Checks, cash, pledges and external payments' },
  external_link: { icon: '↗', yi: 'External Donation Link', en: 'External donation link', yiDesc: 'געלט גייט דירעקט צום קאמפיין׳ס Provider', enDesc: 'Funds go directly to the campaign provider' },
  basic_reports: { icon: '▥', yi: 'Basic Reports', en: 'Basic reports', yiDesc: 'Totals, goals און progress summaries', enDesc: 'Totals, goals and progress summaries' },
  team: { icon: '👥', yi: 'טיעם און Roles', en: 'Team and roles', yiDesc: 'עסקנים, Admins און Treasurers', enDesc: 'Members, admins and treasurers' },
  member_progress: { icon: '📈', yi: 'עסקן־פארשריט', en: 'Member progress', yiDesc: 'סכומים, Calls און completed actions', enDesc: 'Amounts, calls and completed actions' },
  crm: { icon: '◉', yi: 'Advanced CRM', en: 'Advanced CRM', yiDesc: 'נדבנים, קשר־היסטאריע און Follow-ups', enDesc: 'Donors, relationship history and follow-ups' },
  files: { icon: '📎', yi: 'פיילס', en: 'Files', yiDesc: 'קאמפיין דאקומענטן און Attachments', enDesc: 'Campaign documents and attachments' },
  call_lists: { icon: '☎', yi: 'Call Lists', en: 'Call lists', yiDesc: 'געטיילטע און פערזענליכע רוף־ליסטעס', enDesc: 'Shared and personal call lists' },
  csv_import: { icon: '⇩', yi: 'CSV / Excel Import', en: 'CSV / Excel import', yiDesc: 'אימפארטירן נדבות און טרעפן Duplicates', enDesc: 'Import donations and find duplicates' },
  clarity: { icon: '✨', yi: 'Clarity Engine', en: 'Clarity Engine', yiDesc: 'וואס שטעקט און וואס צו טון נעקסט', enDesc: 'What is stuck and what to do next' },
  automations: { icon: '⚙', yi: 'אויטאמאציעס', en: 'Automations', yiDesc: 'Reminders, alerts און daily briefs', enDesc: 'Reminders, alerts and daily briefs' },
  system_watch: { icon: '👁', yi: 'System Watch', en: 'System Watch', yiDesc: 'אויטאמאטישע קאמפיין־געזונטהייט', enDesc: 'Automated campaign health monitoring' },
  guidance: { icon: '💬', yi: 'Professional Guidance', en: 'Professional guidance', yiDesc: 'בקשה פאר מענטשלעכע עצה, best effort', enDesc: 'Request human guidance on a best-effort basis' },
  finance: { icon: '▤', yi: 'Advanced Finance', en: 'Advanced finance', yiDesc: 'Checks, cash, reconciliation און controls', enDesc: 'Checks, cash, reconciliation and controls' },
  ledger: { icon: '📒', yi: 'Ledger', en: 'Ledger', yiDesc: 'פולע פינאנציעלע ביכער', enDesc: 'Full financial ledger' },
  approvals: { icon: '✓✓', yi: 'Approvals', en: 'Approvals', yiDesc: 'Dual approval און controlled workflows', enDesc: 'Dual approval and controlled workflows' },
  audit: { icon: '🕘', yi: 'Audit History', en: 'Audit history', yiDesc: 'ווער האט געטוישט וואס און ווען', enDesc: 'Who changed what and when' },
  refunds: { icon: '↩', yi: 'Refunds און Corrections', en: 'Refunds and corrections', yiDesc: 'No hard-delete פאר financial records', enDesc: 'No hard-delete for financial records' },
  auto_sync: { icon: '⟳', yi: 'Automatic Reporting Sync', en: 'Automatic reporting sync', yiDesc: 'Secure webhook/API records', enDesc: 'Secure webhook/API records' },
  priority_oversight: { icon: '★', yi: 'Priority Oversight', en: 'Priority oversight', yiDesc: 'טיפערע און פריאריטעט איבערזיכט', enDesc: 'Deeper, priority review' },
  multi_campaign: { icon: '▦', yi: 'מערערע קאמפיינס', en: 'Multiple campaigns', yiDesc: 'איין מוסד, מערערע קאמפיינס', enDesc: 'One organization, multiple campaigns' },
  departments: { icon: '🏢', yi: 'Departments', en: 'Departments', yiDesc: 'Teams און אפטיילונגען אונטער איין ארגאניזאציע', enDesc: 'Teams and departments under one organization' },
  shared_crm: { icon: '◫', yi: 'Shared CRM', en: 'Shared CRM', yiDesc: 'איין נדבן־סיסטעם איבער אלע קאמפיינס', enDesc: 'One donor system across campaigns' },
  portfolio: { icon: '📊', yi: 'Portfolio Reports', en: 'Portfolio reports', yiDesc: 'ארגאניזאציע־ברייטע ריפארטס', enDesc: 'Organization-wide reporting' },
  custom_roles: { icon: '🔑', yi: 'Custom Roles', en: 'Custom roles', yiDesc: 'בויען אייגענע Permissions', enDesc: 'Build custom permissions' },
  hotline: { icon: '📞', yi: 'Hotline Integration', en: 'Hotline integration', yiDesc: 'RSS, audio און hotline workflows', enDesc: 'RSS, audio and hotline workflows' },
  api: { icon: '⌁', yi: 'API Integrations', en: 'API integrations', yiDesc: 'ספעציעלע Connections און Workflows', enDesc: 'Special connections and workflows' }
};

const personalBase = ['personal_tasks', 'private_notes', 'contacts'];
const quickBase = [...personalBase, 'campaign_core', 'goals', 'tasks', 'pledges', 'manual_records', 'external_link', 'basic_reports', 'team', 'member_progress', 'system_watch'];
const proBase = [...quickBase, 'crm', 'files', 'call_lists', 'csv_import', 'clarity', 'automations', 'guidance'];
const gabbaiBase = [...proBase, 'finance', 'ledger', 'approvals', 'audit', 'refunds', 'auto_sync', 'priority_oversight', 'custom_roles'];
const orgBase = [...gabbaiBase, 'multi_campaign', 'departments', 'shared_crm', 'portfolio'];
const allFeatures = [...new Set([...orgBase, 'hotline', 'api'])];

const planDefinitions = {
  'Personal Askan': {
    badgeYi: 'פריי', badgeEn: 'Free',
    yi: 'פאר פערזענליכע עסקן־ארבעט, נישט פאר א פולן טיעם־קאמפיין.',
    en: 'For personal askan work, not a full team campaign.',
    features: personalBase,
    memberLimit: 1, goalLimit: 0, campaignLimit: 0,
    oversightYi: 'קיין קאמפיין־איבערזיכט. דער פערזענליכער Workspace בלייבט פריוואט.',
    oversightEn: 'No campaign oversight. The personal workspace stays private.'
  },
  'Chesed Quick': {
    badgeYi: 'Founder Beta', badgeEn: 'Founder Beta',
    yi: 'פאר א קליינעם אדער שנעלן קאמפיין מיט פשוטע טיעם־ארבעט.',
    en: 'For a small or fast campaign with simple team operations.',
    features: quickBase,
    memberLimit: 5, goalLimit: 3, campaignLimit: 1,
    oversightYi: 'System Watch און לייכטע Periodic Review, לויט Capacity.',
    oversightEn: 'System Watch and light periodic review, subject to capacity.'
  },
  'Askan Pro': {
    badgeYi: 'רעקאמענדירט', badgeEn: 'Recommended',
    yi: 'דער פולער זעקס־פונקטן אפעראציע סיסטעם פאר א רצינות׳דיגן קאמפיין.',
    en: 'The full six-point operations system for a serious campaign.',
    features: proBase,
    memberLimit: 25, goalLimit: 20, campaignLimit: 1,
    oversightYi: 'System Watch, Human Review און Guidance Request — best effort ביז 42 שעה, בלי נדר.',
    oversightEn: 'System Watch, human review and guidance requests — best effort within 42 hours.'
  },
  'Gabbai Pro': {
    badgeYi: 'Advanced Beta', badgeEn: 'Advanced Beta',
    yi: 'פאר גרויסע קאמפיינס מיט פינאנץ, Approvals און Audit.',
    en: 'For large campaigns with finance, approvals and audit controls.',
    features: gabbaiBase,
    memberLimit: 100, goalLimit: 100, campaignLimit: 3,
    oversightYi: 'Priority Oversight, טיפערע Briefings און Advanced Finance Review.',
    oversightEn: 'Priority oversight, deeper briefings and advanced finance review.'
  },
  'Organization': {
    badgeYi: 'Pilot', badgeEn: 'Pilot',
    yi: 'פאר א מוסד מיט מערערע קאמפיינס, Departments און Shared CRM.',
    en: 'For an organization with multiple campaigns, departments and a shared CRM.',
    features: orgBase,
    memberLimit: 500, goalLimit: 500, campaignLimit: 50,
    oversightYi: 'Portfolio און Executive Review איבער אלע קאמפיינס.',
    oversightEn: 'Portfolio and executive review across campaigns.'
  },
  'Custom': {
    badgeYi: 'לויטן געברויך', badgeEn: 'Custom fit',
    yi: 'פאר ספעציעלע Permissions, Hotline, API און Custom Workflows.',
    en: 'For special permissions, hotline, API and custom workflows.',
    features: allFeatures,
    memberLimit: 9999, goalLimit: 9999, campaignLimit: 9999,
    oversightYi: 'Custom Oversight, Guided אדער Managed Add-ons לויט אפמאך.',
    oversightEn: 'Custom oversight and guided or managed add-ons by arrangement.'
  }
};

const defaultState = {
  version: 3,
  campaign: {
    id: 'campaign-demo',
    name: 'חברים לדבר מצוה — הילף פאר א משפחה',
    description: 'א קאמפיין צו העלפן א חשובע משפחה זיך צוריקשטעלן אויף די פיס.',
    plan: 'Askan Pro',
    goal: 100000,
    raised: 68240,
    startDate: '2026-06-01',
    endDate: '2026-08-15',
    status: 'active',
    visibility: 'private',
    currency: 'USD',
    category: 'משפחה הילף'
  },
  goals: [
    { id: 'goal-main', title: 'דערגרייכן דעם הויפט קאמפיין־ציל', description: 'די גאנצע געלט־מטרה פונעם קאמפיין', target: 100000, current: 68240, dueDate: '2026-08-15', status: 'active', category: 'money', archived: false },
    { id: 'goal-pledges', title: 'פארענדיקן 50 גרויסע פלעדזשעס', description: 'Follow-up מיט די הויפט נדבנים', target: 50, current: 32, dueDate: '2026-07-20', status: 'active', category: 'pledges', archived: false },
    { id: 'goal-members', title: 'אקטיוויזירן 30 עסקנים', description: 'יעדער עסקן זאל האבן א קלארן פערזענליכן ציל', target: 30, current: 24, dueDate: '2026-07-05', status: 'at_risk', category: 'members', archived: false }
  ],
  members: [
    { id: 'member-yoel', name: 'ר׳ יואל בערגער', goal: 10000, raised: 8200, calls: 32, actions: 19, role: 'askan', status: 'active' },
    { id: 'member-menachem', name: 'ר׳ מנחם קליין', goal: 8000, raised: 5440, calls: 21, actions: 14, role: 'askan', status: 'active' },
    { id: 'member-avrum', name: 'ר׳ אברהם ווייס', goal: 7500, raised: 2950, calls: 17, actions: 8, role: 'askan', status: 'quiet' }
  ],
  tasks: [
    { id: 'task-1', title: 'רופן 4 גרויסע פלעדזשעס', note: '$6,750 overdue', dueDate: '2026-07-01', privacy: 'shared', completed: false, archived: false },
    { id: 'task-2', title: 'אקטיוויזירן 6 שטילע עסקנים', note: 'קיין אקציע היינט', dueDate: '2026-07-02', privacy: 'progress', completed: false, archived: false },
    { id: 'task-3', title: 'באשטעטיגן 3 טשעק־נדבות', note: '$4,850', dueDate: '2026-07-01', privacy: 'shared', completed: false, archived: false }
  ],
  transactions: [
    { id: 'tx-1', donor: 'ר׳ דוד לעבאוויטש', amount: 2500, type: 'pledge', date: '2026-06-27', status: 'pledged', memberId: 'member-yoel', note: 'Follow-up Wednesday', corrections: [] },
    { id: 'tx-2', donor: 'משפחת פרידמאן', amount: 1800, type: 'check', date: '2026-06-28', status: 'received', memberId: 'member-menachem', note: 'Check #1048', corrections: [] },
    { id: 'tx-3', donor: 'Anonymous', amount: 500, type: 'external', date: '2026-06-29', status: 'received', memberId: '', note: 'External link report', corrections: [] }
  ],
  donation: { url: '', provider: 'Other' },
  oversight: { summary: true, teamActivity: true, donorContacts: false },
  automations: { pledgeReminder: true, quietMember: true, dailyBrief: false }
};

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !saved.campaign) return clone(defaultState);
    return {
      ...clone(defaultState),
      ...saved,
      campaign: { ...clone(defaultState.campaign), ...(saved.campaign || {}) },
      donation: { ...clone(defaultState.donation), ...(saved.donation || {}) },
      oversight: { ...clone(defaultState.oversight), ...(saved.oversight || {}) },
      automations: { ...clone(defaultState.automations), ...(saved.automations || {}) },
      goals: Array.isArray(saved.goals) ? saved.goals : clone(defaultState.goals),
      members: Array.isArray(saved.members) ? saved.members : clone(defaultState.members),
      tasks: Array.isArray(saved.tasks) ? saved.tasks : clone(defaultState.tasks),
      transactions: Array.isArray(saved.transactions) ? saved.transactions : clone(defaultState.transactions)
    };
  } catch (error) {
    return clone(defaultState);
  }
}
let state = loadState();
selectedPlan = state.campaign.plan;

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function tr(yi, en) { return language === 'yi' ? yi : en; }
function plan() { return planDefinitions[state.campaign.plan] || planDefinitions['Chesed Quick']; }
function hasFeature(code) { return plan().features.includes(code); }
function requiredPlan(code) {
  return Object.keys(planDefinitions).find(name => planDefinitions[name].features.includes(code)) || 'Custom';
}
function num(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function formatMoney(value) {
  try { return new Intl.NumberFormat(language === 'yi' ? 'en-US' : 'en-US', { style: 'currency', currency: state.campaign.currency || 'USD', maximumFractionDigits: 0 }).format(num(value)); }
  catch { return `$${Math.round(num(value)).toLocaleString()}`; }
}
function formatDate(value) {
  if (!value) return tr('קיין דאטום', 'No date');
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat(language === 'yi' ? 'en-US' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}
function daysBetween(from, to) {
  if (!from || !to) return null;
  return Math.ceil((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 86400000);
}
function activeMembers() { return state.members.filter(member => member.status !== 'archived'); }
function activeGoals() { return state.goals.filter(goal => !goal.archived); }
function activeTasks() { return state.tasks.filter(task => !task.archived); }
function escapeHtml(text = '') {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
function toast(yi, en) {
  const el = $('#toast');
  el.textContent = tr(yi, en);
  el.classList.add('on');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => el.classList.remove('on'), 1900);
}
function localizeElement(el) {
  const text = el.dataset[language];
  if (text === undefined) return;
  if (!el.children.length) {
    el.textContent = text;
    return;
  }
  let textNode = [...el.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
  if (!textNode) {
    textNode = document.createTextNode('');
    el.insertBefore(textNode, el.firstChild);
  }
  textNode.textContent = `${text} `;
}
function applyLanguage() {
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'yi' ? 'rtl' : 'ltr';
  $$('[data-yi][data-en]').forEach(localizeElement);
  $('#lang').textContent = language === 'yi' ? 'EN' : 'ייִדיש';
  localStorage.setItem('gavhah-language', language);
  renderAll();
}
function showPage(id) {
  const target = document.getElementById(id);
  if (!target) return;
  $$('.page').forEach(pageEl => pageEl.classList.remove('on'));
  target.classList.add('on');
  $$('.nav button').forEach(button => button.classList.toggle('on', button.dataset.page === id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function openModal(id) { const modal = document.getElementById(id); if (modal) modal.classList.add('on'); }
function closeModals() { $$('.modal').forEach(modal => modal.classList.remove('on')); }

function renderHome() {
  const percent = state.campaign.goal ? Math.min(100, Math.round(state.campaign.raised / state.campaign.goal * 100)) : 0;
  $('#homeCurrent').innerHTML = `<div class="home-current-top"><div><h3>${escapeHtml(state.campaign.name)}</h3><p>${state.campaign.plan} · ${formatMoney(state.campaign.raised)} / ${formatMoney(state.campaign.goal)}</p></div><button class="soft" data-page="workspace">${tr('ווייטער ארבעטן','Continue')}</button></div><div class="mini"><i style="width:${percent}%"></i></div>`;
}

function renderCampaign() {
  $('#topPlan').textContent = state.campaign.plan;
  $('#campaignName').textContent = state.campaign.name;
  $('#campaignDescription').textContent = state.campaign.description || '';
  $('#planBadge').textContent = state.campaign.plan;
  $('#statusBadge').textContent = state.campaign.status;
  $('#visibilityBadge').textContent = state.campaign.visibility.replace('_', ' ');
  $('#raisedValue').textContent = formatMoney(state.campaign.raised);
  $('#goalValue').textContent = formatMoney(state.campaign.goal);
  $('#membersValue').textContent = activeMembers().length;
  const percent = state.campaign.goal ? Math.min(100, Math.max(0, state.campaign.raised / state.campaign.goal * 100)) : 0;
  $('#campaignProgress').style.width = `${percent}%`;
  $('#progressPercent').textContent = `${Math.round(percent)}% ${tr('פארענדיגט','complete')}`;
  $('#remainingAmount').textContent = `${formatMoney(Math.max(0, state.campaign.goal - state.campaign.raised))} ${tr('פארבליבן','remaining')}`;
  $('#campaignDates').textContent = `${formatDate(state.campaign.startDate)} — ${formatDate(state.campaign.endDate)}`;
  const days = daysBetween(today(), state.campaign.endDate);
  $('#daysRemaining').textContent = days === null ? tr('קיין Deadline', 'No deadline') : days < 0 ? tr('Deadline איז אריבער', 'Deadline passed') : `${days} ${tr('טעג פארבליבן','days left')}`;
  $('#planQuickNote').textContent = tr(`${state.campaign.plan} עפנט ${plan().features.length} הויפט פיטשערס.`, `${state.campaign.plan} unlocks ${plan().features.length} core features.`);
}

function renderGoals() {
  const list = $('#goalsList');
  const goals = activeGoals();
  if (!goals.length) {
    list.innerHTML = `<div class="empty">${tr('נאך נישטא קיין צילן. לייגט אריין א געלט־ציל, עסקן־ציל, Calls אדער א Custom Goal.','No goals yet. Add a money, member, calls or custom goal.')}</div>`;
    return;
  }
  list.innerHTML = goals.map(goal => {
    const percent = goal.target ? Math.min(100, Math.round(goal.current / goal.target * 100)) : 0;
    const amountText = goal.category === 'money' ? `${formatMoney(goal.current)} / ${formatMoney(goal.target)}` : `${num(goal.current).toLocaleString()} / ${num(goal.target).toLocaleString()}`;
    return `<div class="goal" data-id="${goal.id}"><div class="goal-top"><div><h4>${escapeHtml(goal.title)}</h4><div class="goal-meta"><span>${escapeHtml(goal.category)}</span><span>${escapeHtml(goal.status)}</span><span>${formatDate(goal.dueDate)}</span></div></div><div class="edit-row"><button class="mini-btn edit-goal">✎</button><button class="mini-btn red archive-goal">×</button></div></div>${goal.description ? `<p class="sub">${escapeHtml(goal.description)}</p>` : ''}<div class="mini"><i style="width:${percent}%"></i></div><div class="goal-amounts"><span>${amountText}</span><strong>${percent}%</strong></div></div>`;
  }).join('');
}

const quickFeatureCodes = ['goals', 'tasks', 'crm', 'pledges', 'files', 'call_lists', 'basic_reports', 'automations', 'ledger', 'approvals', 'audit', 'hotline'];
function featureCard(code, action = '') {
  const item = featureCatalog[code];
  const active = hasFeature(code);
  return `<button class="feature-card ${active ? 'active' : 'locked'}" data-feature="${code}" ${action ? `data-action="${action}"` : ''}><span class="feature-icon">${item.icon}</span><strong>${tr(item.yi, item.en)}</strong><small>${tr(item.yiDesc, item.enDesc)}</small>${active ? '' : `<span class="plan-needed">${tr('דארף','Requires')} ${requiredPlan(code)}</span>`}</button>`;
}
function renderQuickFeatures() {
  const actions = { goals: 'goal', tasks: 'task', crm: 'crm', pledges: 'money', files: 'files', call_lists: 'calls', basic_reports: 'reports', automations: 'clarity', ledger: 'ledger', approvals: 'approvals', audit: 'audit', hotline: 'hotline' };
  $('#quickFeatures').innerHTML = quickFeatureCodes.map(code => featureCard(code, actions[code])).join('');
}

function privacyLabel(value) {
  return { private: tr('פריוואט', 'Private'), progress: tr('נאר פארשריט', 'Progress only'), shared: tr('טיעם־געטיילט', 'Team shared') }[value] || value;
}
function renderTasks() {
  const list = $('#taskList');
  const tasks = activeTasks();
  if (!tasks.length) { list.innerHTML = `<div class="empty">${tr('נאך נישטא קיין אויפגאבן.','No tasks yet.')}</div>`; return; }
  list.innerHTML = tasks.map(task => `<div class="task" data-id="${task.id}"><button class="check ${task.completed ? 'done' : ''} toggle-task"></button><div><strong style="${task.completed ? 'text-decoration:line-through;opacity:.6' : ''}">${escapeHtml(task.title)}</strong><small>${task.dueDate ? formatDate(task.dueDate) : tr('קיין Due date','No due date')}${task.note ? ` · ${escapeHtml(task.note)}` : ''}</small></div><div><span class="tag ${task.privacy === 'shared' ? 'shared' : 'private'}">${privacyLabel(task.privacy)}</span><div class="edit-row" style="margin-top:6px"><button class="mini-btn edit-task">✎</button><button class="mini-btn red archive-task">×</button></div></div></div>`).join('');
}

function renderMembers() {
  const list = $('#memberList');
  const members = activeMembers();
  if (!members.length) { list.innerHTML = `<div class="empty">${tr('נאך נישטא קיין עסקנים.','No members yet.')}</div>`; }
  else list.innerHTML = members.map(member => {
    const percent = member.goal ? Math.min(100, Math.round(member.raised / member.goal * 100)) : 0;
    return `<div class="member" data-id="${member.id}"><div class="avatar">${escapeHtml(member.name.replace('ר׳ ', '').slice(0, 1) || '?')}</div><div class="member-info"><strong>${escapeHtml(member.name)}</strong><small>${formatMoney(member.raised)} / ${formatMoney(member.goal)} · ${member.actions} actions · ${member.calls} calls · ${member.role}</small><div class="mini"><i style="width:${percent}%"></i></div></div><div class="member-actions"><strong>${percent}%</strong><button class="mini-btn edit-member">✎</button></div></div>`;
  }).join('');
  const limit = plan().memberLimit;
  $('#memberLimitNote').textContent = tr(`${state.campaign.plan}: ${members.length} פון ${limit === 9999 ? 'Unlimited' : limit} עסקנים גענוצט.`, `${state.campaign.plan}: ${members.length} of ${limit === 9999 ? 'Unlimited' : limit} members used.`);
}

function transactionEffect(transaction) {
  if (transaction.status === 'received') return num(transaction.amount);
  if (transaction.status === 'refunded') return -num(transaction.amount);
  return 0;
}
function renderMoney() {
  const received = state.transactions.filter(tx => tx.status === 'received').reduce((sum, tx) => sum + num(tx.amount), 0);
  const pledged = state.transactions.filter(tx => ['pledged', 'pending'].includes(tx.status)).reduce((sum, tx) => sum + num(tx.amount), 0);
  const refunded = state.transactions.filter(tx => tx.status === 'refunded').reduce((sum, tx) => sum + num(tx.amount), 0);
  $('#moneySummary').innerHTML = `<div class="summary-box"><span>${tr('קאמפיין Total','Campaign total')}</span><strong>${formatMoney(state.campaign.raised)}</strong></div><div class="summary-box"><span>${tr('רעקארדירט Received','Recorded received')}</span><strong>${formatMoney(received)}</strong></div><div class="summary-box"><span>${tr('Open פלעדזשעס','Open pledges')}</span><strong>${formatMoney(pledged)}</strong></div><div class="summary-box"><span>${tr('Refunded','Refunded')}</span><strong>${formatMoney(refunded)}</strong></div>`;
  const list = $('#transactionList');
  if (!state.transactions.length) { list.innerHTML = `<div class="empty">${tr('נאך נישטא קיין Financial Records.','No financial records yet.')}</div>`; }
  else list.innerHTML = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date)).map(tx => {
    const member = state.members.find(item => item.id === tx.memberId);
    return `<div class="transaction ${tx.status === 'void' ? 'void' : ''}" data-id="${tx.id}"><div><strong><i class="status-dot ${tx.status}"></i>${escapeHtml(tx.donor || tr('אומבאקאנט','Unknown'))}</strong><small>${escapeHtml(tx.type)} · ${formatDate(tx.date)} · ${escapeHtml(tx.status)}${member ? ` · ${escapeHtml(member.name)}` : ''}${tx.note ? ` · ${escapeHtml(tx.note)}` : ''}${tx.corrections?.length ? ` · ${tx.corrections.length} correction(s)` : ''}</small></div><div class="amount"><strong>${formatMoney(tx.amount)}</strong><div class="edit-row"><button class="mini-btn correct-transaction">${tr('Correct','Correct')}</button>${tx.status !== 'void' ? `<button class="mini-btn red void-transaction">${tr('Void','Void')}</button>` : ''}</div></div></div>`;
  }).join('');
  $('#donationUrl').value = state.donation.url || '';
  $('#provider').value = state.donation.provider || 'Other';
}

function renderReportingFeatures() {
  const codes = ['manual_records', 'external_link', 'csv_import', 'auto_sync'];
  $('#reportingFeatures').innerHTML = codes.map(code => featureCard(code, code)).join('') + `<div class="feature-card locked"><span class="feature-icon">💳</span><strong>${tr('Native Processing','Native processing')}</strong><small>${tr('Campaign Center פראצעסירט אליין די נדבה','Campaign Center processes the donation itself')}</small><span class="plan-needed">${tr('קומט באלד אי״ה','Coming soon')}</span></div>`;
}

function renderClarity() {
  const enabled = hasFeature('clarity');
  $('#clarityContent').style.display = enabled ? 'block' : 'none';
  $('#clarityGate').innerHTML = enabled ? '' : `<div class="card"><h3>🔒 ${tr('Clarity Engine איז נישט אינעם יעצטיגן פלאן','Clarity Engine is not included in the current plan')}</h3><p class="sub">${tr(`דער ${state.campaign.plan} פלאן האט Basic Reports. Askan Pro עפנט נעקסטע־שריט בריעפינגס און Automations.`, `${state.campaign.plan} includes basic reports. Askan Pro unlocks next-step briefings and automations.`)}</p><button class="btn" data-open-modal="plans">${tr('פארגלייכן פלאנס','Compare plans')}</button></div>`;
  if (!enabled) return;
  const overduePledges = state.transactions.filter(tx => ['pledged', 'pending'].includes(tx.status));
  const pledgeValue = overduePledges.reduce((sum, tx) => sum + num(tx.amount), 0);
  const quietMembers = activeMembers().filter(member => member.status === 'quiet');
  const percent = state.campaign.goal ? Math.round(state.campaign.raised / state.campaign.goal * 100) : 0;
  $('#clarityBrief').innerHTML = `<div class="action"><div class="num">!</div><div><strong>${overduePledges.length} ${tr('פלעדזשעס ווארטן אויף נאכפאלג','pledges need follow-up')}</strong><small>${formatMoney(pledgeValue)}</small></div><button class="soft" data-page="money">${tr('עפענען','Open')}</button></div><div class="action"><div class="num">2</div><div><strong>${quietMembers.length} ${tr('עסקנים זענען שטיל','members are quiet')}</strong><small>${tr('א פריינטליכע דערמאנונג קען זיי צוריקברענגען','A friendly reminder may reactivate them')}</small></div><button class="soft" data-page="team">${tr('עפענען','Open')}</button></div><div class="action"><div class="num">3</div><div><strong>${percent}% ${tr('פונעם הויפט ציל איז דערגרייכט','of the main goal is reached')}</strong><small>${formatMoney(Math.max(0, state.campaign.goal - state.campaign.raised))} ${tr('פארבליבן','remaining')}</small></div><button class="soft" data-page="workspace">${tr('צילן','Goals')}</button></div>`;
  const automationEnabled = hasFeature('automations');
  $('#automationList').innerHTML = automationEnabled ? `<div class="setting"><div><strong>Overdue pledge reminder</strong><small>${tr('נאך 48 שעה אן Update','After 48 hours without an update')}</small></div><label class="switch"><input data-automation="pledgeReminder" type="checkbox" ${state.automations.pledgeReminder ? 'checked' : ''}><span class="slider"></span></label></div><div class="setting"><div><strong>Quiet member alert</strong><small>${tr('ווען אן עסקן איז שטיל 2 טעג','When a member is quiet for 2 days')}</small></div><label class="switch"><input data-automation="quietMember" type="checkbox" ${state.automations.quietMember ? 'checked' : ''}><span class="slider"></span></label></div><div class="setting"><div><strong>Daily owner brief</strong><small>${tr('א קורצער בריעף יעדן אינדערפרי','A short brief every morning')}</small></div><label class="switch"><input data-automation="dailyBrief" type="checkbox" ${state.automations.dailyBrief ? 'checked' : ''}><span class="slider"></span></label></div>` : `<div class="plan-warning">${tr('Automations פארלאנגען Askan Pro אדער העכער.','Automations require Askan Pro or higher.')}</div>`;
}

function renderOversight() {
  const p = plan();
  const systemActive = hasFeature('system_watch');
  const guidanceActive = hasFeature('guidance');
  const priority = hasFeature('priority_oversight');
  $('#oversightStatus').innerHTML = `<div class="card"><h3>${tr('אייער Oversight Status','Your oversight status')}</h3><div class="plan-current"><strong>${state.campaign.plan}</strong><small>${tr(p.oversightYi, p.oversightEn)}</small></div><div class="setting"><div><strong>System Watch</strong><small>${tr('אויטאמאטישע קאמפיין־געזונטהייט און Alerts','Automated campaign health and alerts')}</small></div><span class="tag ${systemActive ? 'shared' : 'private'}">${systemActive ? tr('אקטיוו','Active') : tr('נישט אינעם פלאן','Not included')}</span></div><div class="setting"><div><strong>Human Professional Review</strong><small>${tr('נאר ערלויבטע קאטעגאריעס; Private Notes בלייבן פארשפארט','Authorized categories only; private notes stay locked')}</small></div><span class="tag ${guidanceActive ? 'shared' : ''}">${guidanceActive ? tr('Available','Available') : tr('Upgrade','Upgrade')}</span></div><div class="setting"><div><strong>${tr('Priority Review','Priority review')}</strong><small>${tr('טיפערע און שנעלערע Review מדריגה','Deeper and faster review tier')}</small></div><span class="tag ${priority ? 'shared' : ''}">${priority ? tr('אקטיוו','Active') : tr('Gabbai Pro+','Gabbai Pro+')}</span></div>${guidanceActive ? `<button class="btn block guidance-request">${tr('שיקן Guidance Request','Send guidance request')}</button>` : `<button class="soft block" data-open-modal="plans">${tr('זען Guidance פלאנס','View guidance plans')}</button>`}</div>`;
  $$('[data-setting]').forEach(input => { input.checked = Boolean(state.oversight[input.dataset.setting]); });
}

function renderPlanGrid() {
  $('#planGrid').innerHTML = Object.entries(planDefinitions).map(([name, details]) => {
    const sample = details.features.slice(0, 8).map(code => `<span>${tr(featureCatalog[code].yi, featureCatalog[code].en)}</span>`).join('');
    return `<button class="plan ${selectedPlan === name ? 'selected' : ''}" data-plan="${name}"><div class="plan-top"><h3>${name}</h3><span class="badge">${tr(details.badgeYi, details.badgeEn)}</span></div><p>${tr(details.yi, details.en)}</p><div class="feature-checks">${sample}</div><div class="plan-summary">${tr('עסקנים','Members')}: ${details.memberLimit === 9999 ? 'Unlimited' : details.memberLimit} · ${tr('צילן','Goals')}: ${details.goalLimit === 9999 ? 'Unlimited' : details.goalLimit} · ${tr('קאמפיינס','Campaigns')}: ${details.campaignLimit === 9999 ? 'Unlimited' : details.campaignLimit}</div></button>`;
  }).join('');
  updatePlanButton();
}
function updatePlanButton() {
  $('#continuePlan').textContent = planMode === 'new' ? tr(`אנהייבן נייעם ${selectedPlan} Workspace`, `Start new ${selectedPlan} workspace`) : tr(`טוישן צו ${selectedPlan}`, `Change to ${selectedPlan}`);
}
function renderCurrentPlan() {
  const p = plan();
  $('#currentPlanCard').innerHTML = `<div class="plan-current"><strong>${state.campaign.plan}</strong><small>${tr(p.yi, p.en)}</small><div class="summary-strip"><div class="summary-box"><span>${tr('עסקנים Limit','Member limit')}</span><strong>${p.memberLimit === 9999 ? '∞' : p.memberLimit}</strong></div><div class="summary-box"><span>${tr('צילן Limit','Goal limit')}</span><strong>${p.goalLimit === 9999 ? '∞' : p.goalLimit}</strong></div><div class="summary-box"><span>${tr('קאמפיינס Limit','Campaign limit')}</span><strong>${p.campaignLimit === 9999 ? '∞' : p.campaignLimit}</strong></div><div class="summary-box"><span>${tr('אקטיווע פיטשערס','Active features')}</span><strong>${p.features.length}</strong></div></div></div>`;
  $('#allFeatures').innerHTML = allFeatures.map(code => featureCard(code, code)).join('');
}

function renderAll() {
  renderHome();
  renderCampaign();
  renderGoals();
  renderQuickFeatures();
  renderTasks();
  renderMembers();
  renderMoney();
  renderReportingFeatures();
  renderClarity();
  renderOversight();
  renderCurrentPlan();
  renderPlanGrid();
}

function fillCampaignEditor(isNew = false) {
  campaignEditorMode = isNew ? 'new' : 'edit';
  const c = isNew ? { name: '', description: '', goal: 0, raised: 0, startDate: today(), endDate: '', status: 'draft', visibility: 'private', currency: 'USD', category: '' } : state.campaign;
  $('#editCampaignName').value = c.name || '';
  $('#editCampaignDescription').value = c.description || '';
  $('#editCampaignGoal').value = c.goal || 0;
  $('#editCampaignRaised').value = c.raised || 0;
  $('#editCampaignStart').value = c.startDate || '';
  $('#editCampaignEnd').value = c.endDate || '';
  $('#editCampaignStatus').value = c.status || 'draft';
  $('#editCampaignVisibility').value = c.visibility || 'private';
  $('#editCampaignCurrency').value = c.currency || 'USD';
  $('#editCampaignCategory').value = c.category || '';
}
function saveCampaign() {
  const name = $('#editCampaignName').value.trim();
  if (!name) { toast('א קאמפיין דארף א נאמען', 'A campaign needs a name'); return; }
  const campaignData = {
    id: campaignEditorMode === 'new' ? uid('campaign') : state.campaign.id,
    name,
    description: $('#editCampaignDescription').value.trim(),
    plan: campaignEditorMode === 'new' ? selectedPlan : state.campaign.plan,
    goal: num($('#editCampaignGoal').value),
    raised: num($('#editCampaignRaised').value),
    startDate: $('#editCampaignStart').value,
    endDate: $('#editCampaignEnd').value,
    status: $('#editCampaignStatus').value,
    visibility: $('#editCampaignVisibility').value,
    currency: $('#editCampaignCurrency').value,
    category: $('#editCampaignCategory').value.trim()
  };
  if (campaignEditorMode === 'new') {
    state = { ...clone(defaultState), campaign: campaignData, goals: [], members: [], tasks: [], transactions: [], donation: { url: '', provider: 'Other' } };
  } else {
    state.campaign = campaignData;
    const mainGoal = state.goals.find(goal => goal.id === 'goal-main' && !goal.archived);
    if (mainGoal) { mainGoal.target = campaignData.goal; mainGoal.current = campaignData.raised; mainGoal.dueDate = campaignData.endDate; }
  }
  saveState(); closeModals(); renderAll(); showPage('workspace');
  toast(campaignEditorMode === 'new' ? 'דער נייער קאמפיין איז געשאפן' : 'דער קאמפיין איז אפדעיטעד', campaignEditorMode === 'new' ? 'New campaign created' : 'Campaign updated');
}

function resetGoalEditor(goal = null) {
  $('#goalId').value = goal?.id || '';
  $('#goalTitle').value = goal?.title || '';
  $('#goalDescription').value = goal?.description || '';
  $('#goalTarget').value = goal?.target || 0;
  $('#goalCurrent').value = goal?.current || 0;
  $('#goalDue').value = goal?.dueDate || '';
  $('#goalStatus').value = goal?.status || 'active';
  $('#goalCategory').value = goal?.category || 'money';
  $('#goalEditorTitle').textContent = goal ? tr('עדיטירן קאמפיין ציל', 'Edit campaign goal') : tr('נייער קאמפיין ציל', 'New campaign goal');
}
function saveGoal() {
  if (!hasFeature('goals')) { requireFeature('goals'); return; }
  const id = $('#goalId').value;
  if (!id && activeGoals().length >= plan().goalLimit) { toast('דער פלאן האט דערגרייכט דעם צילן־Limit', 'This plan has reached its goal limit'); return; }
  const title = $('#goalTitle').value.trim();
  if (!title) { toast('שרייבט אריין א ציל נאמען', 'Enter a goal name'); return; }
  const record = { id: id || uid('goal'), title, description: $('#goalDescription').value.trim(), target: num($('#goalTarget').value), current: num($('#goalCurrent').value), dueDate: $('#goalDue').value, status: $('#goalStatus').value, category: $('#goalCategory').value, archived: false };
  const index = state.goals.findIndex(goal => goal.id === id);
  if (index >= 0) state.goals[index] = record; else state.goals.push(record);
  saveState(); closeModals(); renderAll(); toast('דער ציל איז געהיטן', 'Goal saved');
}

function fillMemberEditor(member = null) {
  $('#memberId').value = member?.id || '';
  $('#memberName').value = member?.name || '';
  $('#memberGoal').value = member?.goal || 0;
  $('#memberRaised').value = member?.raised || 0;
  $('#memberCalls').value = member?.calls || 0;
  $('#memberActions').value = member?.actions || 0;
  $('#memberRole').value = member?.role || 'askan';
  $('#memberStatus').value = member?.status || 'active';
  $('#memberEditorTitle').textContent = member ? tr('עדיטירן עסקן־פארשריט', 'Edit member progress') : tr('נייער עסקן', 'New member');
  $('#moneyMember').innerHTML = `<option value="">${tr('קיינער','None')}</option>${activeMembers().map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('')}`;
}
function saveMember() {
  if (!hasFeature('team')) { requireFeature('team'); return; }
  const id = $('#memberId').value;
  if (!id && activeMembers().length >= plan().memberLimit) { toast('דער פלאן האט דערגרייכט דעם עסקן־Limit', 'This plan has reached its member limit'); return; }
  const name = $('#memberName').value.trim();
  if (!name) { toast('שרייבט אריין דעם עסקן נאמען', 'Enter the member name'); return; }
  const member = { id: id || uid('member'), name, goal: num($('#memberGoal').value), raised: num($('#memberRaised').value), calls: num($('#memberCalls').value), actions: num($('#memberActions').value), role: $('#memberRole').value, status: $('#memberStatus').value };
  const index = state.members.findIndex(item => item.id === id);
  if (index >= 0) state.members[index] = member; else state.members.push(member);
  saveState(); closeModals(); renderAll(); toast('עסקן־פארשריט איז אפדעיטעד', 'Member progress updated');
}

function fillTaskEditor(task = null) {
  $('#taskId').value = task?.id || '';
  $('#taskTitle').value = task?.title || '';
  $('#taskDue').value = task?.dueDate || '';
  $('#taskPrivacy').value = task?.privacy || 'private';
  $('#taskNote').value = task?.note || '';
  $('#taskEditorTitle').textContent = task ? tr('עדיטירן אויפגאבע', 'Edit task') : tr('נייע אויפגאבע', 'New task');
}
function saveTask() {
  if (!hasFeature('personal_tasks')) { requireFeature('personal_tasks'); return; }
  const id = $('#taskId').value;
  const title = $('#taskTitle').value.trim();
  if (!title) { toast('שרייבט אריין די אויפגאבע', 'Enter a task'); return; }
  const existing = state.tasks.find(task => task.id === id);
  const task = { id: id || uid('task'), title, note: $('#taskNote').value.trim(), dueDate: $('#taskDue').value, privacy: $('#taskPrivacy').value, completed: existing?.completed || false, archived: false };
  const index = state.tasks.findIndex(item => item.id === id);
  if (index >= 0) state.tasks[index] = task; else state.tasks.push(task);
  saveState(); closeModals(); renderAll(); toast('די אויפגאבע איז געהיטן', 'Task saved');
}

function fillMoneyEditor(transaction = null) {
  $('#moneyRecordId').value = transaction?.id || '';
  $('#moneyAmount').value = transaction?.amount || '';
  $('#moneyType').value = transaction?.type || 'donation';
  $('#moneyDonor').value = transaction?.donor || '';
  $('#moneyDate').value = transaction?.date || today();
  $('#moneyStatus').value = transaction?.status || 'received';
  $('#moneyMember').innerHTML = `<option value="">${tr('קיינער','None')}</option>${activeMembers().map(member => `<option value="${member.id}">${escapeHtml(member.name)}</option>`).join('')}`;
  $('#moneyMember').value = transaction?.memberId || '';
  $('#moneyNote').value = transaction?.note || '';
  $('#moneyEditorTitle').textContent = transaction ? tr('Correct Financial Record', 'Correct financial record') : tr('נייע נדבה אדער פלעדזש', 'New donation or pledge');
}
function adjustTotals(transaction, direction) {
  const effect = transactionEffect(transaction) * direction;
  state.campaign.raised = Math.max(0, num(state.campaign.raised) + effect);
  if (transaction.memberId) {
    const member = state.members.find(item => item.id === transaction.memberId);
    if (member) member.raised = Math.max(0, num(member.raised) + effect);
  }
}
function saveMoney() {
  if (!hasFeature('manual_records')) { requireFeature('manual_records'); return; }
  const id = $('#moneyRecordId').value;
  const amount = num($('#moneyAmount').value);
  if (amount <= 0) { toast('דער סכום דארף זיין גרעסער פון 0', 'Amount must be greater than 0'); return; }
  const record = { id: id || uid('tx'), donor: $('#moneyDonor').value.trim() || tr('אומבאקאנט', 'Unknown'), amount, type: $('#moneyType').value, date: $('#moneyDate').value || today(), status: $('#moneyStatus').value, memberId: $('#moneyMember').value, note: $('#moneyNote').value.trim(), corrections: [] };
  const index = state.transactions.findIndex(tx => tx.id === id);
  if (index >= 0) {
    const old = state.transactions[index];
    adjustTotals(old, -1);
    record.corrections = [...(old.corrections || []), { at: new Date().toISOString(), old: { amount: old.amount, status: old.status, memberId: old.memberId, type: old.type, date: old.date } }];
    state.transactions[index] = record;
  } else state.transactions.push(record);
  adjustTotals(record, 1);
  const mainGoal = state.goals.find(goal => goal.id === 'goal-main' && !goal.archived);
  if (mainGoal) mainGoal.current = state.campaign.raised;
  saveState(); closeModals(); renderAll(); toast(id ? 'די Correction איז געהיטן אין History' : 'די נדבה־רעקארד איז צוגעלייגט', id ? 'Correction saved in history' : 'Financial record added');
}
function voidTransaction(id) {
  const tx = state.transactions.find(item => item.id === id);
  if (!tx || tx.status === 'void') return;
  adjustTotals(tx, -1);
  tx.corrections = [...(tx.corrections || []), { at: new Date().toISOString(), old: { status: tx.status }, action: 'void' }];
  tx.status = 'void';
  const mainGoal = state.goals.find(goal => goal.id === 'goal-main' && !goal.archived);
  if (mainGoal) mainGoal.current = state.campaign.raised;
  saveState(); renderAll(); toast('דער רעקארד איז Void; ער איז נישט אויסגעמעקט', 'Record voided; it was not deleted');
}

function saveDonationLink() {
  const url = $('#donationUrl').value.trim();
  if (url && !/^https:\/\//i.test(url)) { toast('דער לינק דארף אנהייבן מיט https://', 'The link must begin with https://'); return; }
  state.donation.url = url;
  state.donation.provider = $('#provider').value;
  saveState(); toast('דער Donation Link איז געהיטן', 'Donation link saved');
}
function requireFeature(code) {
  selectedPlan = requiredPlan(code);
  planMode = 'change';
  renderPlanGrid();
  openModal('plans');
  toast(`${tr(featureCatalog[code].yi, featureCatalog[code].en)} ${tr('פארלאנגט','requires')} ${selectedPlan}`, `${tr(featureCatalog[code].yi, featureCatalog[code].en)} requires ${selectedPlan}`);
}
function runFeatureAction(code, action) {
  if (!hasFeature(code)) { requireFeature(code); return; }
  const actions = {
    goal: () => { resetGoalEditor(); openModal('goalEditor'); },
    task: () => { fillTaskEditor(); openModal('taskEditor'); },
    money: () => { fillMoneyEditor(); openModal('moneyEditor'); },
    clarity: () => showPage('clarity'),
    csv_import: () => toast('CSV Import UI איז דער נעקסטער פראדוקציע־שטאפל', 'CSV import UI is the next production step'),
    auto_sync: () => toast('Secure Provider Connection וועט ווערן צוגעלייגט מיטן Backend', 'Secure provider connection will be added with the backend')
  };
  if (actions[action]) actions[action]();
  else toast('די פיטשער איז אקטיוו אינעם פלאן', 'This feature is active in the plan');
}

const guideQuestions = [
  { yi: 'וויפיל מענטשן וועלן ארבעטן אינעם קאמפיין?', en: 'How many people will work on the campaign?', choices: [['נאר איך', 'Just me', 1], ['2–10 עסקנים', '2–10 members', 2], ['מער ווי 10', 'More than 10', 3]] },
  { yi: 'וויפיל פינאנציעלע קאנטראל דארפט איר?', en: 'How much financial control do you need?', choices: [['פשוטע פלעדזשעס און ריפארטס', 'Basic pledges and reports', 1], ['Checks, cash, approvals און ledger', 'Checks, cash, approvals and ledger', 3], ['עטליכע קאמפיינס אונטער איין מוסד', 'Multiple campaigns under one organization', 4]] },
  { yi: 'דארפט איר Clarity און אויטאמאציע?', en: 'Do you need clarity and automation?', choices: [['נישט יעצט', 'Not now', 1], ['יא, פאר Follow-ups', 'Yes, for follow-ups', 2], ['יא, מיט Advanced alerts', 'Yes, with advanced alerts', 3]] },
  { yi: 'וועלכע סארט הילף ווילט איר?', en: 'What level of help do you want?', choices: [['נאר Software', 'Software only', 1], ['Professional Eyes און Guidance', 'Professional eyes and guidance', 2], ['Custom / Managed workflow', 'Custom / managed workflow', 4]] }
];
function renderGuide() {
  const body = $('#guideBody'); const bar = $('#guideBar');
  if (guideStep >= guideQuestions.length) {
    let result = 'Chesed Quick';
    if (guideScore >= 13) result = 'Organization'; else if (guideScore >= 10) result = 'Gabbai Pro'; else if (guideScore >= 7) result = 'Askan Pro'; else if (guideScore <= 4) result = 'Personal Askan';
    selectedPlan = result;
    body.innerHTML = `<div class="result"><div class="eyebrow">${tr('אייער רעקאמענדאציע','Your recommendation')}</div><h3>${result}</h3><p>${tr(planDefinitions[result].yi, planDefinitions[result].en)}</p><button id="acceptGuide" class="btn orange block">${tr('זען דעם פלאן','View this plan')}</button></div>`;
    bar.style.width = '100%';
    $('#acceptGuide').onclick = () => { closeModals(); planMode = 'new'; renderPlanGrid(); openModal('plans'); };
    return;
  }
  const question = guideQuestions[guideStep];
  bar.style.width = `${((guideStep + 1) / guideQuestions.length) * 100}%`;
  body.innerHTML = `<h3>${tr(question.yi, question.en)}</h3>${question.choices.map(choice => `<button class="choice guide-answer" data-score="${choice[2]}">${tr(choice[0], choice[1])}</button>`).join('')}`;
  $$('.guide-answer').forEach(button => button.onclick = () => { guideScore += num(button.dataset.score); guideStep += 1; renderGuide(); });
}
function resetGuide() { guideStep = 0; guideScore = 0; renderGuide(); }

function handleOpenModal(trigger, id) {
  if (id === 'plans') {
    const currentPage = $('.page.on')?.id;
    planMode = currentPage === 'home' ? 'new' : 'change';
    selectedPlan = planMode === 'change' ? state.campaign.plan : 'Askan Pro';
    renderPlanGrid();
  }
  if (id === 'guide') resetGuide();
  if (id === 'editCampaign') fillCampaignEditor(false);
  if (id === 'moneyEditor') fillMoneyEditor();
  if (id === 'goalEditor') {
    if (!hasFeature('goals')) { requireFeature('goals'); return; }
    if (activeGoals().length >= plan().goalLimit) { toast('דער פלאן האט דערגרייכט דעם צילן־Limit', 'This plan has reached its goal limit'); return; }
    resetGoalEditor();
  }
  if (id === 'memberEditor') {
    if (!hasFeature('team')) { requireFeature('team'); return; }
    if (activeMembers().length >= plan().memberLimit) { toast('דער פלאן האט דערגרייכט דעם עסקן־Limit', 'This plan has reached its member limit'); return; }
    fillMemberEditor();
  }
  if (id === 'taskEditor') fillTaskEditor();
  openModal(id);
}

document.addEventListener('click', event => {
  const featureTrigger = event.target.closest('[data-feature]');
  if (featureTrigger && !hasFeature(featureTrigger.dataset.feature)) {
    event.preventDefault();
    requireFeature(featureTrigger.dataset.feature);
    return;
  }

  const pageButton = event.target.closest('[data-page]');
  if (pageButton) showPage(pageButton.dataset.page);

  const openTrigger = event.target.closest('[data-open-modal]');
  const shouldClose = event.target.closest('[data-close]');
  if (shouldClose) closeModals();
  if (openTrigger) handleOpenModal(openTrigger, openTrigger.dataset.openModal);

  const planCard = event.target.closest('.plan');
  if (planCard) { selectedPlan = planCard.dataset.plan; renderPlanGrid(); }

  const featureCardEl = event.target.closest('.feature-card[data-feature]');
  if (featureCardEl && hasFeature(featureCardEl.dataset.feature)) runFeatureAction(featureCardEl.dataset.feature, featureCardEl.dataset.action || featureCardEl.dataset.feature);

  const goalRow = event.target.closest('.goal');
  if (goalRow && event.target.closest('.edit-goal')) { const goal = state.goals.find(item => item.id === goalRow.dataset.id); resetGoalEditor(goal); openModal('goalEditor'); }
  if (goalRow && event.target.closest('.archive-goal')) { const goal = state.goals.find(item => item.id === goalRow.dataset.id); if (goal) { goal.archived = true; saveState(); renderAll(); toast('דער ציל איז ארכיווירט', 'Goal archived'); } }

  const memberRow = event.target.closest('.member');
  if (memberRow && event.target.closest('.edit-member')) { const member = state.members.find(item => item.id === memberRow.dataset.id); fillMemberEditor(member); openModal('memberEditor'); }

  const taskRow = event.target.closest('.task');
  if (taskRow && event.target.closest('.toggle-task')) { const task = state.tasks.find(item => item.id === taskRow.dataset.id); if (task) { task.completed = !task.completed; saveState(); renderTasks(); } }
  if (taskRow && event.target.closest('.edit-task')) { const task = state.tasks.find(item => item.id === taskRow.dataset.id); fillTaskEditor(task); openModal('taskEditor'); }
  if (taskRow && event.target.closest('.archive-task')) { const task = state.tasks.find(item => item.id === taskRow.dataset.id); if (task) { task.archived = true; saveState(); renderTasks(); toast('די אויפגאבע איז ארכיווירט', 'Task archived'); } }

  const transactionRow = event.target.closest('.transaction');
  if (transactionRow && event.target.closest('.correct-transaction')) { const tx = state.transactions.find(item => item.id === transactionRow.dataset.id); fillMoneyEditor(tx); openModal('moneyEditor'); }
  if (transactionRow && event.target.closest('.void-transaction')) voidTransaction(transactionRow.dataset.id);

  if (event.target.closest('.guidance-request')) toast('די Guidance Request איז צוגעגרייט אלס Beta בקשה', 'Guidance request prepared as a beta request');
});

$$('.modal').forEach(modal => modal.addEventListener('click', event => { if (event.target === modal) closeModals(); }));

$('#lang').onclick = () => { language = language === 'yi' ? 'en' : 'yi'; applyLanguage(); };
$('#continuePlan').onclick = () => {
  if (planMode === 'new') {
    closeModals(); fillCampaignEditor(true); openModal('editCampaign');
  } else {
    state.campaign.plan = selectedPlan;
    saveState(); closeModals(); renderAll(); toast(`${selectedPlan} איז יעצט אקטיוו`, `${selectedPlan} is now active`);
  }
};
$('#saveCampaign').onclick = saveCampaign;
$('#saveGoal').onclick = saveGoal;
$('#saveMember').onclick = saveMember;
$('#saveTask').onclick = saveTask;
$('#saveMoney').onclick = saveMoney;
$('#saveLink').onclick = saveDonationLink;

document.addEventListener('change', event => {
  const setting = event.target.closest('[data-setting]');
  if (setting) { state.oversight[setting.dataset.setting] = setting.checked; saveState(); toast('די Privacy אויסוואל איז אפדעיטעד', 'Privacy setting updated'); }
  const automation = event.target.closest('[data-automation]');
  if (automation) { state.automations[automation.dataset.automation] = automation.checked; saveState(); toast('די אויטאמאציע איז אפדעיטעד', 'Automation updated'); }
});

applyLanguage();
renderGuide();