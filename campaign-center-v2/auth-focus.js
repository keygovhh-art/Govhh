/* GAVHAH Campaign Center authentication + free Personal Askan Focus Center */
let afClient = null;
let afCurrentUser = null;
let afAccountPlanName = 'Personal Askan';
let afFocusData = null;
let afFocusSyncAvailable = false;
let afSaveStateOriginal = null;
let afRenderAllOriginal = null;
let afShowPageOriginal = null;

const afPlanCodeToName = {
  personal_askan: 'Personal Askan',
  chesed_quick: 'Chesed Quick',
  askan_pro: 'Askan Pro',
  gabbai_pro: 'Gabbai Pro',
  organization: 'Organization',
  custom: 'Custom'
};

function afTr(yi, en) {
  return typeof language !== 'undefined' && language === 'en' ? en : yi;
}

function afDate() {
  return new Date().toISOString().slice(0, 10);
}

function afEscape(value = '') {
  const div = document.createElement('div');
  div.textContent = String(value);
  return div.innerHTML;
}

function afLoadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find(script => script.src === new URL(src, location.href).href);
    if (existing) {
      if (existing.dataset.loaded === 'yes') resolve();
      else existing.addEventListener('load', resolve, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => { script.dataset.loaded = 'yes'; resolve(); };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function afInjectUi() {
  document.body.classList.add('auth-pending');

  document.body.insertAdjacentHTML('afterbegin', `
    <section id="authGate" class="auth-gate">
      <div class="auth-shell">
        <div class="auth-brand">
          <div class="auth-logo">✦</div>
          <h1>גבהה קאמפיין סענטער</h1>
          <p>א קלארער ארבעטס־צענטער פאר עסקנים — אנצוהייבן פריי, מיט א פריוואטן פאוקעס־טול.</p>
        </div>
        <div class="auth-card">
          <div class="auth-tabs">
            <button class="auth-tab on" data-auth-tab="signup">קריעט אן אקאונט</button>
            <button class="auth-tab" data-auth-tab="login">לאג אין</button>
          </div>

          <form id="signupForm" class="auth-form on">
            <label>אייער נאמען<input id="signupName" autocomplete="name" required></label>
            <label>אימעיל<input id="signupEmail" type="email" autocomplete="email" required></label>
            <label>פעסווארד<input id="signupPassword" type="password" autocomplete="new-password" minlength="6" required></label>
            <button class="btn block" type="submit">אנהייבן פריי</button>
            <div class="auth-free"><strong>Personal Askan — פרייער פלאן</strong><small>מיין היינטיגער פאוקעס, Top 3 Priorities, Follow-ups, Brain Dump, פריוואטע טעסקס און Private Notes.</small></div>
            <p class="auth-small">פאר באנוצער פון 13 יאר און העכער. קיין קארטל פארלאנגט.</p>
          </form>

          <form id="loginForm" class="auth-form">
            <label>אימעיל<input id="loginEmail" type="email" autocomplete="email" required></label>
            <label>פעסווארד<input id="loginPassword" type="password" autocomplete="current-password" required></label>
            <button class="btn block" type="submit">לאג אין</button>
            <button id="forgotPassword" class="soft block" type="button">פארגעסן פעסווארד?</button>
          </form>
          <div id="authMessage" class="auth-message"></div>
        </div>
        <p id="authLoading" class="auth-loading">מען גרייט צו אייער זיכערער אריינגאנג…</p>
      </div>
    </section>
  `);

  const topActions = document.querySelector('.top-actions');
  if (topActions) {
    topActions.insertAdjacentHTML('afterbegin', `<button id="accountButton" class="pill account-chip" type="button">אקאונט</button>`);
  }

  const homeCurrent = document.querySelector('#homeCurrent');
  if (homeCurrent) {
    homeCurrent.insertAdjacentHTML('afterend', `
      <div id="focusHomeCard" class="focus-home-card">
        <div class="focus-home-top">
          <div><h3>🎯 מיין פאוקעס־צענטער</h3><p id="focusHomeText">איין קלארער הויפט פאוקעס, דריי Priorities און א רואיגער פלאץ אויסצוליידיגן דעם קאפ.</p></div>
          <button class="soft" data-page="focus">עפענען</button>
        </div>
        <div class="focus-home-status"><span id="focusHomePlan">Personal Askan · Free</span><span id="focusHomeDone">0 פון 3 געטון</span><span>🔒 פריוואט</span></div>
      </div>
    `);
  }

  const app = document.querySelector('.app');
  if (app) {
    app.insertAdjacentHTML('beforeend', `
      <section id="focus" class="page">
        <button class="back" data-page="home">← <span>צוריק</span></button>
        <div class="focus-hero">
          <div class="eyebrow">Personal Askan · Free Focus Center</div>
          <h2>וואס איז דער איין זאך וואס דארף יעצט באקומען אייער קאפ?</h2>
          <p>נישט נאך א ריזיגע טעסק־ליסטע. איין הויפט פאוקעס, דריי נעקסטע שריט, און א פלאץ ארויסצולייגן די איבעריגע מחשבות.</p>
          <div class="focus-privacy">🔒 אייער פאוקעס, Brain Dump און פריוואטע נאטיצן זענען נאר פאר אייך</div>
          <div class="focus-score"><div><span>היינט</span><strong id="focusDateLabel"></strong></div><div><span>Priorities</span><strong id="focusCompletedStat">0/3</strong></div><div><span>Status</span><strong id="focusStatusStat">אקטיוו</strong></div></div>
        </div>

        <div class="focus-block">
          <h3>1. מיין הויפט פאוקעס</h3>
          <p class="sub">וואס וועט מאכן היינט פילן ווי א מצליח׳דיגער טאג?</p>
          <input id="focusMain" class="focus-main-input" maxlength="180" placeholder="למשל: פארענדיקן די נדבן־Follow-ups">
        </div>

        <div class="focus-block">
          <h3>2. די דריי נעקסטע שריט</h3>
          <p class="sub">נאר דריי. ווייל קלארקייט איז שטערקער ווי א ליסטע פון 700 זאכן.</p>
          <div id="focusPriorities"></div>
          <button id="addFocusPriority" class="soft block" type="button">＋ צולייגן Priority</button>
        </div>

        <div class="focus-grid">
          <div class="focus-block">
            <h3>3. Brain Dump</h3>
            <p class="sub">לייגט דא ארויס אלע אנדערע זאכן, כדי זיי זאלן נישט שרייען אין קאפ.</p>
            <textarea id="focusBrainDump" placeholder="געדאנקען, זאכן פאר שפעטער, מענטשן צו רופן…"></textarea>
          </div>
          <div class="focus-block">
            <h3>4. קלארקייט־קשיות</h3>
            <label>וואס האלט מיר יעצט צוריק?<textarea id="focusBlocker" placeholder="דער עיקר שטער…"></textarea></label>
            <label>וואס איז דער נעקסטער קליינער שריט?<textarea id="focusNextStep" placeholder="א שריט וואס נעמט אונטער 10 מינוט…"></textarea></label>
          </div>
        </div>

        <div class="focus-block">
          <button id="saveFocus" class="btn block" type="button">היטן מיין היינטיגן פאוקעס</button>
          <p id="focusSync" class="focus-sync">מען גרייט צו די פריוואטע פאוקעס־דאטע…</p>
        </div>

        <div class="free-plan-banner"><strong>דאס איז דער הארץ פונעם פרייען פלאן</strong><small>Campaign Center הייבט זיך נישט אן מיט געלט אדער א גרויסן קאמפיין. עס הייבט זיך אן מיט העלפן אן עסקן וויסן וואס צו טון יעצט — אן פארלירן זיין פריוואטקייט.</small></div>
      </section>
    `);
  }

  document.body.insertAdjacentHTML('beforeend', `
    <div id="accountModal" class="modal">
      <div class="modal-card">
        <div class="modal-head"><h2>מיין אקאונט</h2><button class="close" data-close-account>✕</button></div>
        <div class="account-details">
          <div class="account-line"><span>נאמען</span><strong id="accountName">—</strong></div>
          <div class="account-line"><span>אימעיל</span><strong id="accountEmail">—</strong></div>
          <div class="account-line"><span>אקטיווער פלאן</span><strong id="accountPlan">Personal Askan</strong></div>
          <div class="account-line"><span>אקאונט</span><strong id="accountStatus">Active</strong></div>
        </div>
        <div class="free-plan-banner"><strong>Personal Askan איז פריי</strong><small>Focus Center, Private Tasks, Follow-ups, Brain Dump און Private Notes זענען אריינגערעכנט.</small></div>
        <button id="logoutButton" class="danger block" type="button" style="margin-top:14px">לאג אוט</button>
      </div>
    </div>
  `);
}

function afSetAuthMessage(text, good = false) {
  const box = document.querySelector('#authMessage');
  if (!box) return;
  box.textContent = text;
  box.className = `auth-message on ${good ? 'good' : 'bad'}`;
}

function afClearAuthMessage() {
  const box = document.querySelector('#authMessage');
  if (box) box.className = 'auth-message';
}

function afSetAuthBusy(isBusy) {
  document.querySelectorAll('#signupForm button,#loginForm button').forEach(button => button.disabled = isBusy);
  const loading = document.querySelector('#authLoading');
  if (loading) loading.style.display = isBusy ? 'block' : 'none';
}

function afSwitchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(button => button.classList.toggle('on', button.dataset.authTab === tab));
  document.querySelector('#signupForm')?.classList.toggle('on', tab === 'signup');
  document.querySelector('#loginForm')?.classList.toggle('on', tab === 'login');
  afClearAuthMessage();
}

function afUserStorageKey(userId) {
  return `${STORAGE_KEY}:${userId}`;
}

function afCreateFreeWorkspace(user) {
  const fresh = clone(defaultState);
  fresh.campaign = {
    ...fresh.campaign,
    id: `personal-${user.id}`,
    name: afTr('מיין פריוואטער עסקן־Workspace', 'My private askan workspace'),
    description: afTr('פריוואטער פאוקעס, טעסקס, Follow-ups און נאטיצן.', 'Private focus, tasks, follow-ups and notes.'),
    plan: 'Personal Askan',
    goal: 0,
    raised: 0,
    startDate: afDate(),
    endDate: '',
    status: 'active',
    visibility: 'private',
    category: 'Personal Askan'
  };
  fresh.goals = [];
  fresh.members = [];
  fresh.transactions = [];
  fresh.tasks = [
    { id: `welcome-${user.id}`, title: afTr('שטעלן מיין היינטיגן הויפט פאוקעס', 'Set today’s main focus'), note: afTr('עפנט דעם פאוקעס־צענטער', 'Open the Focus Center'), dueDate: afDate(), privacy: 'private', completed: false, archived: false }
  ];
  return fresh;
}

function afMergeWorkspace(saved, user) {
  if (!saved || !saved.campaign) return afCreateFreeWorkspace(user);
  const base = clone(defaultState);
  return {
    ...base,
    ...saved,
    campaign: { ...base.campaign, ...(saved.campaign || {}) },
    donation: { ...base.donation, ...(saved.donation || {}) },
    oversight: { ...base.oversight, ...(saved.oversight || {}) },
    automations: { ...base.automations, ...(saved.automations || {}) },
    goals: Array.isArray(saved.goals) ? saved.goals : [],
    members: Array.isArray(saved.members) ? saved.members : [],
    tasks: Array.isArray(saved.tasks) ? saved.tasks : [],
    transactions: Array.isArray(saved.transactions) ? saved.transactions : []
  };
}

function afLoadUserWorkspace(user) {
  let parsed = null;
  try { parsed = JSON.parse(localStorage.getItem(afUserStorageKey(user.id))); } catch (_) {}
  state = afMergeWorkspace(parsed, user);
  state.campaign.plan = afAccountPlanName;
  saveState();
}

function afPatchStateSaving() {
  if (afSaveStateOriginal) return;
  afSaveStateOriginal = saveState;
  saveState = function () {
    if (afCurrentUser) {
      localStorage.setItem(afUserStorageKey(afCurrentUser.id), JSON.stringify(state));
    } else {
      afSaveStateOriginal();
    }
  };
}

function afAddFreeFeatures() {
  const additions = {
    focus_center: { icon: '🎯', yi: 'מיין פאוקעס־צענטער', en: 'My Focus Center', yiDesc: 'איין הויפט פאוקעס און דריי נעקסטע שריט', enDesc: 'One main focus and three next steps' },
    daily_focus: { icon: '☀', yi: 'היינטיגער פאוקעס', en: 'Daily focus', yiDesc: 'א פרישער קלארער פלאן יעדן טאג', enDesc: 'A fresh, clear plan each day' },
    brain_dump: { icon: '🧠', yi: 'Brain Dump', en: 'Brain dump', yiDesc: 'ארויסלייגן מחשבות אן פארלירן זיי', enDesc: 'Unload thoughts without losing them' },
    personal_followups: { icon: '↪', yi: 'פערזענליכע Follow-ups', en: 'Personal follow-ups', yiDesc: 'אייגענע דערמאנונגען און קשרים', enDesc: 'Private reminders and relationships' }
  };
  Object.assign(featureCatalog, additions);
  const codes = Object.keys(additions);
  Object.values(planDefinitions).forEach(definition => {
    codes.forEach(code => { if (!definition.features.includes(code)) definition.features.unshift(code); });
  });
  codes.slice().reverse().forEach(code => { if (!allFeatures.includes(code)) allFeatures.unshift(code); });
}

function afAdaptPlanUi() {
  const isFree = state.campaign.plan === 'Personal Askan';
  const nav = document.querySelector('.nav');
  const campaignNav = nav?.querySelector('button[data-af-primary],button[data-page="workspace"]');
  const teamNav = nav?.querySelector('button[data-page="team"]');
  const moneyNav = nav?.querySelector('button[data-page="money"]');
  const homeCurrent = document.querySelector('#homeCurrent');
  const focusCard = document.querySelector('#focusHomeCard');

  if (campaignNav && !campaignNav.dataset.afPrimary) campaignNav.dataset.afPrimary = 'yes';
  if (campaignNav) {
    campaignNav.dataset.page = isFree ? 'focus' : 'workspace';
    const icon = campaignNav.querySelector('span');
    const label = campaignNav.querySelector('b');
    if (icon) icon.textContent = isFree ? '🎯' : '🗂';
    if (label) label.textContent = isFree ? afTr('פאוקעס', 'Focus') : afTr('קאמפיין', 'Campaign');
  }
  teamNav?.classList.toggle('free-hide', isFree);
  moneyNav?.classList.toggle('free-hide', isFree);
  nav?.classList.toggle('free-nav', isFree);
  if (homeCurrent) homeCurrent.style.display = isFree ? 'none' : 'block';
  if (focusCard) focusCard.style.display = 'block';

  const topPlan = document.querySelector('#topPlan');
  if (topPlan) topPlan.textContent = isFree ? 'Personal Askan · Free' : state.campaign.plan;
  const accountPlan = document.querySelector('#accountPlan');
  if (accountPlan) accountPlan.textContent = isFree ? 'Personal Askan · Free' : state.campaign.plan;
}

function afPatchAppFunctions() {
  if (!afRenderAllOriginal) {
    afRenderAllOriginal = renderAll;
    renderAll = function () {
      afRenderAllOriginal();
      afAdaptPlanUi();
      afRenderFocusSummary();
    };
  }
  if (!afShowPageOriginal) {
    afShowPageOriginal = showPage;
    showPage = function (id) {
      const gates = { workspace: 'campaign_core', team: 'team', money: 'manual_records', clarity: 'clarity', oversight: 'guidance' };
      if (gates[id] && !hasFeature(gates[id])) {
        selectedPlan = requiredPlan(gates[id]);
        planMode = 'change';
        renderPlanGrid();
        openModal('plans');
        toast(afTr('די אפטיילונג איז אינעם', 'This section is included in'), `${selectedPlan}`);
        return;
      }
      afShowPageOriginal(id);
    };
  }

  const continueButton = document.querySelector('#continuePlan');
  if (continueButton && !continueButton.dataset.afPatched) {
    continueButton.dataset.afPatched = 'yes';
    continueButton.onclick = function () {
      if (selectedPlan !== afAccountPlanName) {
        closeModals();
        toast(afTr('דער פלאן קען ווערן רעזערווירט; באצאלטע Upgrades קומען באלד אי״ה', 'The plan can be reserved; paid upgrades are coming soon'), afTr('דער פלאן קען ווערן רעזערווירט; באצאלטע Upgrades קומען באלד אי״ה', 'The plan can be reserved; paid upgrades are coming soon'));
        return;
      }
      closeModals();
      if (selectedPlan === 'Personal Askan') showPage('focus');
      else showPage('workspace');
    };
  }
}

function afDefaultFocus() {
  return { user_id: afCurrentUser?.id || '', focus_date: afDate(), main_focus: '', priorities: [], brain_dump: '', blocker: '', next_step: '', completed: false };
}

function afFocusLocalKey() {
  return `gavhah-focus:${afCurrentUser?.id || 'guest'}:${afDate()}`;
}

function afNormalizePriorities(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 3).map((item, index) => ({
    id: item.id || `priority-${index}-${Date.now()}`,
    title: String(item.title || ''),
    done: Boolean(item.done)
  }));
}

async function afLoadFocus() {
  if (!afCurrentUser) return;
  let local = null;
  try { local = JSON.parse(localStorage.getItem(afFocusLocalKey())); } catch (_) {}
  afFocusData = { ...afDefaultFocus(), ...(local || {}) };
  afFocusData.priorities = afNormalizePriorities(afFocusData.priorities);
  afFocusSyncAvailable = false;

  if (afClient) {
    try {
      const { data, error } = await afClient.from('daily_focus_sessions').select('user_id,focus_date,main_focus,priorities,brain_dump,blocker,next_step,completed').eq('user_id', afCurrentUser.id).eq('focus_date', afDate()).maybeSingle();
      if (!error) {
        afFocusSyncAvailable = true;
        if (data) {
          afFocusData = { ...afDefaultFocus(), ...data, priorities: afNormalizePriorities(data.priorities) };
          localStorage.setItem(afFocusLocalKey(), JSON.stringify(afFocusData));
        }
      }
    } catch (_) {}
  }
  afRenderFocus();
}

function afCollectFocus() {
  const priorities = [...document.querySelectorAll('.priority-row')].map(row => ({
    id: row.dataset.id,
    title: row.querySelector('input[type="text"]')?.value.trim() || '',
    done: row.querySelector('.priority-check')?.classList.contains('done') || false
  })).filter(item => item.title);
  return {
    user_id: afCurrentUser.id,
    focus_date: afDate(),
    main_focus: document.querySelector('#focusMain')?.value.trim() || '',
    priorities: afNormalizePriorities(priorities),
    brain_dump: document.querySelector('#focusBrainDump')?.value.trim() || '',
    blocker: document.querySelector('#focusBlocker')?.value.trim() || '',
    next_step: document.querySelector('#focusNextStep')?.value.trim() || '',
    completed: priorities.length > 0 && priorities.every(item => item.done)
  };
}

async function afSaveFocus() {
  if (!afCurrentUser) return;
  afFocusData = afCollectFocus();
  localStorage.setItem(afFocusLocalKey(), JSON.stringify(afFocusData));
  let synced = false;
  if (afClient && afFocusSyncAvailable) {
    try {
      const payload = { ...afFocusData, updated_at: new Date().toISOString(), deleted_at: null };
      const { error } = await afClient.from('daily_focus_sessions').upsert(payload, { onConflict: 'user_id,focus_date' });
      synced = !error;
    } catch (_) {}
  }
  afRenderFocus();
  const sync = document.querySelector('#focusSync');
  if (sync) {
    sync.className = `focus-sync ${synced ? 'ok' : 'warn'}`;
    sync.textContent = synced ? afTr('געהיטן זיכער אינעם אקאונט', 'Safely saved to your account') : afTr('געהיטן אויפן Device; Account Sync ווערט אקטיוו נאכן Database Setup', 'Saved on this device; account sync activates after database setup');
  }
  toast(afTr('דער היינטיגער פאוקעס איז געהיטן', 'Today’s focus is saved'), afTr('דער היינטיגער פאוקעס איז געהיטן', 'Today’s focus is saved'));
}

function afRenderPriorities() {
  const container = document.querySelector('#focusPriorities');
  if (!container || !afFocusData) return;
  const items = afNormalizePriorities(afFocusData.priorities);
  container.innerHTML = items.map((item, index) => `<div class="priority-row ${item.done ? 'completed' : ''}" data-id="${afEscape(item.id)}"><button class="priority-check ${item.done ? 'done' : ''}" type="button" aria-label="Done"></button><input type="text" maxlength="140" value="${afEscape(item.title)}" placeholder="Priority ${index + 1}"><button class="mini-btn red remove-priority" type="button">×</button></div>`).join('');
  document.querySelector('#addFocusPriority').style.display = items.length >= 3 ? 'none' : 'block';
}

function afRenderFocus() {
  if (!afFocusData) return;
  const main = document.querySelector('#focusMain');
  const brain = document.querySelector('#focusBrainDump');
  const blocker = document.querySelector('#focusBlocker');
  const next = document.querySelector('#focusNextStep');
  if (main) main.value = afFocusData.main_focus || '';
  if (brain) brain.value = afFocusData.brain_dump || '';
  if (blocker) blocker.value = afFocusData.blocker || '';
  if (next) next.value = afFocusData.next_step || '';
  const dateLabel = document.querySelector('#focusDateLabel');
  if (dateLabel) dateLabel.textContent = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${afDate()}T12:00:00`));
  afRenderPriorities();
  afRenderFocusSummary();
  const sync = document.querySelector('#focusSync');
  if (sync) {
    sync.className = `focus-sync ${afFocusSyncAvailable ? 'ok' : 'warn'}`;
    sync.textContent = afFocusSyncAvailable ? afTr('Account Sync איז גרייט', 'Account sync is ready') : afTr('Local Preview Save איז גרייט', 'Local preview save is ready');
  }
}

function afRenderFocusSummary() {
  if (!afFocusData) return;
  const priorities = afNormalizePriorities(afFocusData.priorities);
  const done = priorities.filter(item => item.done).length;
  const total = Math.max(3, priorities.length);
  const homeDone = document.querySelector('#focusHomeDone');
  if (homeDone) homeDone.textContent = `${done} ${afTr('פון', 'of')} ${total} ${afTr('געטון', 'done')}`;
  const homeText = document.querySelector('#focusHomeText');
  if (homeText) homeText.textContent = afFocusData.main_focus || afTr('שטעלט איין הויפט פאוקעס פאר היינט.', 'Set one main focus for today.');
  const stat = document.querySelector('#focusCompletedStat');
  if (stat) stat.textContent = `${done}/${total}`;
  const status = document.querySelector('#focusStatusStat');
  if (status) status.textContent = afFocusData.completed ? afTr('פארענדיקט', 'Complete') : afTr('אקטיוו', 'Active');
}

async function afFetchAccountPlan(user) {
  afAccountPlanName = 'Personal Askan';
  if (!afClient) return;
  try {
    const { data, error } = await afClient.rpc('get_my_account_plan');
    if (!error && data?.[0]?.plan_code) afAccountPlanName = afPlanCodeToName[data[0].plan_code] || 'Personal Askan';
  } catch (_) {}
  if (!afAccountPlanName && user?.user_metadata?.default_plan) afAccountPlanName = afPlanCodeToName[user.user_metadata.default_plan] || 'Personal Askan';
}

async function afEnsureFreeAccount(user) {
  if (!afClient) return;
  try {
    await afClient.from('profiles').upsert({ id: user.id, display_name: user.user_metadata?.display_name || '', language: language === 'en' ? 'en' : 'yi', updated_at: new Date().toISOString() }, { onConflict: 'id' });
  } catch (_) {}
}

function afUpdateAccountUi(user) {
  const name = user.user_metadata?.display_name || user.email?.split('@')[0] || afTr('באנוצער', 'User');
  const accountButton = document.querySelector('#accountButton');
  if (accountButton) accountButton.textContent = name;
  const accountName = document.querySelector('#accountName');
  const accountEmail = document.querySelector('#accountEmail');
  const accountPlan = document.querySelector('#accountPlan');
  if (accountName) accountName.textContent = name;
  if (accountEmail) accountEmail.textContent = user.email || '—';
  if (accountPlan) accountPlan.textContent = afAccountPlanName === 'Personal Askan' ? 'Personal Askan · Free' : afAccountPlanName;
}

async function afEnterApp(user) {
  afCurrentUser = user;
  afPatchStateSaving();
  await afFetchAccountPlan(user);
  await afEnsureFreeAccount(user);
  afLoadUserWorkspace(user);
  afUpdateAccountUi(user);
  await afLoadFocus();
  renderAll();
  document.querySelector('#authGate')?.classList.add('hidden');
  document.body.classList.remove('auth-pending');
  afSetAuthBusy(false);
  if (state.campaign.plan === 'Personal Askan') showPage('focus');
}

function afLeaveApp() {
  afCurrentUser = null;
  afFocusData = null;
  document.body.classList.add('auth-pending');
  document.querySelector('#authGate')?.classList.remove('hidden');
  document.querySelector('#accountModal')?.classList.remove('on');
  afSwitchAuthTab('login');
  afSetAuthBusy(false);
}

async function afSignup(event) {
  event.preventDefault();
  afClearAuthMessage();
  afSetAuthBusy(true);
  const name = document.querySelector('#signupName').value.trim();
  const email = document.querySelector('#signupEmail').value.trim();
  const password = document.querySelector('#signupPassword').value;
  if (!name || !email || password.length < 6) {
    afSetAuthBusy(false);
    afSetAuthMessage(afTr('ביטע לייגט אריין א נאמען, גילטיגע אימעיל און כאטש 6 צייכנס אין פעסווארד.', 'Enter a name, valid email and a password of at least 6 characters.'));
    return;
  }
  try {
    const { data, error } = await afClient.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name, preferred_language: language === 'en' ? 'en' : 'yi', default_plan: 'personal_askan' },
        emailRedirectTo: `${location.origin}${location.pathname}`
      }
    });
    if (error) throw error;
    if (data.session && data.user) {
      afSetAuthMessage(afTr('אייער פרייער אקאונט איז גרייט.', 'Your free account is ready.'), true);
      await afEnterApp(data.user);
    } else {
      afSetAuthBusy(false);
      afSetAuthMessage(afTr('קוקט אין אייער אימעיל און באשטעטיגט דעם אקאונט. דערנאך קענט איר לאגין.', 'Check your email to confirm the account, then log in.'), true);
    }
  } catch (error) {
    afSetAuthBusy(false);
    afSetAuthMessage(error.message || afTr('דער אקאונט האט נישט געקענט ווערן געשאפן.', 'The account could not be created.'));
  }
}

async function afLogin(event) {
  event.preventDefault();
  afClearAuthMessage();
  afSetAuthBusy(true);
  try {
    const { data, error } = await afClient.auth.signInWithPassword({ email: document.querySelector('#loginEmail').value.trim(), password: document.querySelector('#loginPassword').value });
    if (error) throw error;
    if (!data.user) throw new Error(afTr('מען האט נישט געטראפן דעם אקאונט.', 'Account not found.'));
    await afEnterApp(data.user);
  } catch (error) {
    afSetAuthBusy(false);
    afSetAuthMessage(error.message || afTr('לאגין איז נישט געלונגען.', 'Login failed.'));
  }
}

async function afResetPassword() {
  const email = document.querySelector('#loginEmail').value.trim();
  if (!email) { afSetAuthMessage(afTr('לייגט קודם אריין אייער אימעיל.', 'Enter your email first.')); return; }
  afSetAuthBusy(true);
  try {
    const { error } = await afClient.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}${location.pathname}` });
    if (error) throw error;
    afSetAuthMessage(afTr('א Password Reset לינק איז געשיקט געווארן.', 'A password reset link was sent.'), true);
  } catch (error) {
    afSetAuthMessage(error.message || afTr('מען האט נישט געקענט שיקן דעם לינק.', 'Could not send the reset link.'));
  } finally { afSetAuthBusy(false); }
}

function afBindEvents() {
  document.querySelectorAll('[data-auth-tab]').forEach(button => button.onclick = () => afSwitchAuthTab(button.dataset.authTab));
  document.querySelector('#signupForm').addEventListener('submit', afSignup);
  document.querySelector('#loginForm').addEventListener('submit', afLogin);
  document.querySelector('#forgotPassword').onclick = afResetPassword;
  document.querySelector('#accountButton').onclick = () => document.querySelector('#accountModal').classList.add('on');
  document.querySelector('[data-close-account]').onclick = () => document.querySelector('#accountModal').classList.remove('on');
  document.querySelector('#accountModal').addEventListener('click', event => { if (event.target.id === 'accountModal') event.currentTarget.classList.remove('on'); });
  document.querySelector('#logoutButton').onclick = async () => { if (afClient) await afClient.auth.signOut(); afLeaveApp(); };
  document.querySelector('#saveFocus').onclick = afSaveFocus;
  document.querySelector('#addFocusPriority').onclick = () => {
    afFocusData = afCollectFocus();
    if (afFocusData.priorities.length >= 3) return;
    afFocusData.priorities.push({ id: `priority-${Date.now()}`, title: '', done: false });
    afRenderPriorities();
  };
  document.querySelector('#focusPriorities').addEventListener('click', event => {
    const row = event.target.closest('.priority-row');
    if (!row) return;
    if (event.target.closest('.priority-check')) {
      event.target.closest('.priority-check').classList.toggle('done');
      row.classList.toggle('completed');
      afFocusData = afCollectFocus();
      afRenderFocusSummary();
    }
    if (event.target.closest('.remove-priority')) {
      row.remove();
      afFocusData = afCollectFocus();
      afRenderPriorities();
      afRenderFocusSummary();
    }
  });
}

async function afInitialize() {
  afInjectUi();
  afAddFreeFeatures();
  afPatchAppFunctions();
  afBindEvents();
  renderAll();

  try {
    if (!window.CAMPAIGN_CENTER_DB) await afLoadScript('../campaign-center/supabase-public.js');
    if (!window.supabase?.createClient) await afLoadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
    if (!window.CAMPAIGN_CENTER_DB || !window.supabase?.createClient) throw new Error('Supabase configuration is unavailable.');
    afClient = window.supabase.createClient(window.CAMPAIGN_CENTER_DB.projectUrl, window.CAMPAIGN_CENTER_DB.publicKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    const { data, error } = await afClient.auth.getSession();
    if (error) throw error;
    afClient.auth.onAuthStateChange(async (event, session) => {
      if (session?.user && event !== 'INITIAL_SESSION') await afEnterApp(session.user);
      if (event === 'SIGNED_OUT') afLeaveApp();
    });
    if (data.session?.user) await afEnterApp(data.session.user);
    else { afSetAuthBusy(false); document.querySelector('#authLoading').style.display = 'none'; }
  } catch (error) {
    afSetAuthBusy(false);
    document.querySelector('#authLoading').style.display = 'none';
    afSetAuthMessage(afTr('דער Login Backend איז נאכנישט אקטיוו. די Supabase Setup דארף ווערן פארענדיקט.', 'The login backend is not active yet. Supabase setup must be completed.'));
    console.error(error);
  }
}

afInitialize();
