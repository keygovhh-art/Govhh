/* GAVHAH Kesher plan gate: the entire Kesher section starts at Chesed Quick. */
(function () {
  'use strict';

  const allowedPlans = new Set([
    'Chesed Quick',
    'Askan Pro',
    'Gabbai Pro',
    'Organization',
    'Custom'
  ]);

  function currentPlan() {
    return window.state?.campaign?.plan || window.afAccountPlanName || 'Personal Askan';
  }

  function isAllowed() {
    return allowedPlans.has(currentPlan());
  }

  function tr(yi, en) {
    return window.language === 'en' ? en : yi;
  }

  function ensureTeaser() {
    let teaser = document.querySelector('#kesherUpgradeTeaser');
    if (teaser) return teaser;

    const anchor = document.querySelector('#focusHomeCard') || document.querySelector('#homeCurrent');
    if (!anchor) return null;

    teaser = document.createElement('div');
    teaser.id = 'kesherUpgradeTeaser';
    teaser.className = 'kesher-home';
    teaser.innerHTML = `
      <div class="kesher-home-top">
        <div>
          <h3>☎ ${tr('קשרים הייבט זיך אן ביי Chesed Quick', 'Kesher starts with Chesed Quick')}</h3>
          <p>${tr(
            'דער גאנצער פראפעסיאנעלער קשר־ספר, Call Guides, Labels און Follow-ups ווערן געעפנט אינעם ערשטן קאמפיין־פלאן.',
            'The full professional Kesher Book, call guides, labels and follow-ups unlock in the first campaign plan.'
          )}</p>
        </div>
        <button class="soft" type="button" data-kesher-upgrade>${tr('זען פלאנס', 'View plans')}</button>
      </div>
      <div class="kesher-home-tags">
        <span>Chesed Quick+</span>
        <span>${tr('קאמפיין־פיטשער', 'Campaign feature')}</span>
      </div>`;
    anchor.insertAdjacentElement('afterend', teaser);
    return teaser;
  }

  function showPlans() {
    if (typeof window.renderPlanGrid === 'function') {
      window.selectedPlan = 'Chesed Quick';
      window.planMode = 'change';
      window.renderPlanGrid();
    }
    if (typeof window.openModal === 'function') {
      window.openModal('plans');
    } else {
      document.querySelector('#plans')?.classList.add('on');
    }
    if (typeof window.toast === 'function') {
      window.toast(
        'די גאנצע קשרים אפטיילונג הייבט זיך אן ביי Chesed Quick.',
        'The full Kesher section starts with Chesed Quick.'
      );
    }
  }

  function leaveKesherIfLocked() {
    const page = document.querySelector('#kesher');
    if (!page?.classList.contains('on') || isAllowed()) return;

    page.classList.remove('on');
    const fallback = document.querySelector('#focus') || document.querySelector('#home');
    fallback?.classList.add('on');
    document.querySelectorAll('.nav button').forEach((button) => {
      button.classList.toggle('on', button.dataset.page === (fallback?.id || 'home'));
    });
  }

  function applyGate() {
    const allowed = isAllowed();
    const homeCard = document.querySelector('#kesherHome');
    const navButton = document.querySelector('.nav [data-page="kesher"]');
    const page = document.querySelector('#kesher');
    const teaser = ensureTeaser();

    if (homeCard) homeCard.style.display = allowed ? '' : 'none';
    if (navButton) navButton.style.display = allowed ? '' : 'none';
    if (page) page.dataset.planLocked = allowed ? 'false' : 'true';
    if (teaser) teaser.style.display = allowed ? 'none' : '';

    const planNote = document.querySelector('#kesherPlanNote');
    if (planNote && !allowed) {
      planNote.innerHTML = `
        <div class="plan-lock-strip">
          🔒 ${tr(
            'די גאנצע קשרים אפטיילונג — פערזענליכע קשרים, Call History, Guides, Labels און Follow-ups — איז Chesed Quick אדער העכער.',
            'The entire Kesher section — personal contacts, call history, guides, labels and follow-ups — requires Chesed Quick or higher.'
          )}
        </div>`;
    }

    leaveKesherIfLocked();

    const nav = document.querySelector('.nav');
    if (nav) {
      const visible = [...nav.querySelectorAll('button')].filter((button) => button.style.display !== 'none').length;
      nav.style.gridTemplateColumns = `repeat(${Math.max(3, visible)}, 1fr)`;
    }
  }

  document.addEventListener('click', (event) => {
    const upgrade = event.target.closest('[data-kesher-upgrade]');
    if (upgrade) {
      event.preventDefault();
      showPlans();
      return;
    }

    const kesherLink = event.target.closest('[data-page="kesher"]');
    const insideKesher = event.target.closest('#kesher, #kesherEditor, #kesherDetail, #callGuide');
    if (!isAllowed() && (kesherLink || insideKesher)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showPlans();
    }
  }, true);

  const timer = window.setInterval(applyGate, 350);
  window.addEventListener('beforeunload', () => window.clearInterval(timer), { once: true });
  applyGate();
})();
