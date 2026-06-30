let language = localStorage.getItem('gavhah-language') || 'yi';
let selectedPlan = 'Askan Pro';
let guideStep = 0;
let guideScore = 0;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function tr(yi, en) {
  return language === 'yi' ? yi : en;
}

function toast(yi, en) {
  const el = $('#toast');
  el.textContent = tr(yi, en);
  el.classList.add('on');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => el.classList.remove('on'), 1800);
}

function showPage(id) {
  const target = document.getElementById(id);
  if (!target) return;
  $$('.page').forEach(page => page.classList.remove('on'));
  target.classList.add('on');
  $$('.nav button').forEach(button => button.classList.toggle('on', button.dataset.page === id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('on');
}

function closeModals() {
  $$('.modal').forEach(modal => modal.classList.remove('on'));
}

function applyLanguage() {
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'yi' ? 'rtl' : 'ltr';
  $$('[data-yi][data-en]').forEach(el => {
    el.textContent = el.dataset[language];
  });
  $('#lang').textContent = language === 'yi' ? 'EN' : 'ייִדיש';
  updatePlanButton();
  localStorage.setItem('gavhah-language', language);
}

function updatePlanButton() {
  const button = $('#continuePlan');
  if (!button) return;
  button.textContent = tr(`ווייטער מיט ${selectedPlan}`, `Continue with ${selectedPlan}`);
}

function selectPlan(card) {
  $$('.plan').forEach(plan => plan.classList.remove('selected'));
  card.classList.add('selected');
  selectedPlan = card.dataset.plan;
  updatePlanButton();
}

const guideQuestions = [
  {
    yi: 'וויפיל מענטשן וועלן ארבעטן אינעם קאמפיין?',
    en: 'How many people will work on the campaign?',
    choices: [
      ['נאר איך', 'Just me', 1],
      ['2–10 עסקנים', '2–10 members', 2],
      ['מער ווי 10', 'More than 10', 3]
    ]
  },
  {
    yi: 'וויפיל פינאנציעלע קאנטראל דארפט איר?',
    en: 'How much financial control do you need?',
    choices: [
      ['פשוטע פלעדזשעס און ריפארטס', 'Basic pledges and reports', 1],
      ['Checks, cash, approvals און ledger', 'Checks, cash, approvals and ledger', 3],
      ['עטליכע קאמפיינס אונטער איין מוסד', 'Multiple campaigns under one organization', 4]
    ]
  },
  {
    yi: 'דארפט איר אויטאמאציע און Clarity Engine?',
    en: 'Do you need automation and the Clarity Engine?',
    choices: [
      ['נישט יעצט', 'Not now', 1],
      ['יא, פאר טעסקס און Follow-ups', 'Yes, for tasks and follow-ups', 2],
      ['יא, מיט Advanced reports און alerts', 'Yes, with advanced reports and alerts', 3]
    ]
  },
  {
    yi: 'וועלכע סארט הילף ווילט איר?',
    en: 'What level of help do you want?',
    choices: [
      ['נאר Software', 'Software only', 1],
      ['Professional Eyes און Guidance', 'Professional eyes and guidance', 2],
      ['א קאמפליצירטער Custom workflow', 'A complex custom workflow', 4]
    ]
  }
];

function renderGuide() {
  const body = $('#guideBody');
  const bar = $('#guideBar');
  if (guideStep >= guideQuestions.length) {
    let plan = 'Chesed Quick';
    if (guideScore >= 13) plan = 'Organization';
    else if (guideScore >= 10) plan = 'Gabbai Pro';
    else if (guideScore >= 7) plan = 'Askan Pro';
    else if (guideScore <= 4) plan = 'Personal Askan';
    selectedPlan = plan;
    body.innerHTML = `<div class="result"><div class="eyebrow">${tr('אייער רעקאמענדאציע','Your recommendation')}</div><h3>${plan}</h3><p>${tr('לויט אייערע ענטפערס איז דאס דער בעסטער אנהייב. איר קענט נאך אלץ זען און קלייבן אלע זעקס פלאנס.','Based on your answers, this is the best starting point. You can still compare and choose any of the six plans.')}</p><button id="acceptGuide" class="btn orange block">${tr('זען דעם פלאן','View this plan')}</button></div>`;
    bar.style.width = '100%';
    $('#acceptGuide').onclick = () => {
      closeModals();
      openModal('plans');
      const card = $(`.plan[data-plan="${plan}"]`);
      if (card) selectPlan(card);
    };
    return;
  }
  const question = guideQuestions[guideStep];
  bar.style.width = `${((guideStep + 1) / guideQuestions.length) * 100}%`;
  body.innerHTML = `<h3>${tr(question.yi, question.en)}</h3>${question.choices.map(choice => `<button class="choice guide-answer" data-score="${choice[2]}">${tr(choice[0], choice[1])}</button>`).join('')}`;
  $$('.guide-answer').forEach(button => {
    button.onclick = () => {
      guideScore += Number(button.dataset.score || 0);
      guideStep += 1;
      renderGuide();
    };
  });
}

function resetGuide() {
  guideStep = 0;
  guideScore = 0;
  renderGuide();
}

function addTask() {
  const input = $('#newTaskText');
  const privacy = $('#newTaskPrivacy');
  const text = input.value.trim();
  if (!text) {
    toast('שרייבט אריין די אויפגאבע', 'Enter a task first');
    return;
  }
  const labels = {
    private: tr('פריוואט', 'Private'),
    progress: tr('נאר פארשריט', 'Progress only'),
    shared: tr('טיעם־געטיילט', 'Team shared')
  };
  const tagClass = privacy.value === 'shared' ? 'shared' : 'private';
  const row = document.createElement('div');
  row.className = 'task';
  row.innerHTML = `<button class="check"></button><div><strong></strong><small>${tr('נייע אויפגאבע','New task')}</small></div><span class="tag ${tagClass}">${labels[privacy.value]}</span>`;
  row.querySelector('strong').textContent = text;
  $('#taskList').appendChild(row);
  row.querySelector('.check').onclick = event => event.currentTarget.classList.toggle('done');
  input.value = '';
  closeModals();
  toast('אויפגאבע צוגעלייגט', 'Task added');
}

function saveDonationLink() {
  const url = $('#donationUrl').value.trim();
  const provider = $('#provider').value;
  if (url && !/^https:\/\//i.test(url)) {
    toast('דער לינק דארף אנהייבן מיט https://', 'The link must begin with https://');
    return;
  }
  localStorage.setItem('gavhah-donation-url', url);
  localStorage.setItem('gavhah-donation-provider', provider);
  toast('דער Donation Link איז געהיטן אין דעם פאראויסבליק', 'Donation link saved in this preview');
}

function loadPreviewData() {
  $('#donationUrl').value = localStorage.getItem('gavhah-donation-url') || '';
  $('#provider').value = localStorage.getItem('gavhah-donation-provider') || 'Other';
}

document.addEventListener('click', event => {
  const pageButton = event.target.closest('[data-page]');
  if (pageButton) showPage(pageButton.dataset.page);

  const modalButton = event.target.closest('[data-open-modal]');
  if (modalButton) {
    const id = modalButton.dataset.openModal;
    if (id === 'guide') resetGuide();
    openModal(id);
  }

  if (event.target.closest('[data-close]')) closeModals();

  const plan = event.target.closest('.plan');
  if (plan) selectPlan(plan);

  const done = event.target.closest('.task-done');
  if (done) {
    done.closest('.action').style.opacity = '.5';
    done.textContent = tr('פארענדיקט', 'Completed');
    toast('די אקציע איז פארענדיקט', 'Action completed');
  }

  if (event.target.closest('.demo-action')) {
    toast('די פיטשער־פלאץ איז גרייט; Backend ווערט פארבונדן נאכן Supabase Setup', 'Feature space is ready; backend connects after Supabase setup');
  }
});

$$('.modal').forEach(modal => {
  modal.addEventListener('click', event => {
    if (event.target === modal) closeModals();
  });
});

$('#lang').onclick = () => {
  language = language === 'yi' ? 'en' : 'yi';
  applyLanguage();
};

$('#continuePlan').onclick = () => {
  localStorage.setItem('gavhah-selected-plan', selectedPlan);
  closeModals();
  showPage('workspace');
  toast(`${selectedPlan} איז אויסגעקליבן`, `${selectedPlan} selected`);
};

$('#saveLink').onclick = saveDonationLink;
$('#addTaskBtn').onclick = addTask;

$$('.check').forEach(button => {
  button.onclick = () => button.classList.toggle('done');
});

$$('.switch input').forEach(input => {
  input.onchange = () => toast('די אויסוואל איז אפדעיטעד אינעם פאראויסבליק', 'Setting updated in the preview');
});

applyLanguage();
loadPreviewData();
renderGuide();