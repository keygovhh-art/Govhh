window.CAMPAIGN_CENTER_DB = {
  projectUrl: "https://ixugvsijwyjvaqcofoll.supabase.co",
  publicKey: ["sb_publishable_GcgX7B_", "eYiuwmgJrokYpfA_", "fta1Q_I3"].join("")
};

(function loadUltraClarity() {
  if (document.querySelector('link[data-ultra-clarity-v4]')) return;
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = new URL('../campaign-center-v2/ultra-clarity-v4.css?v=1', document.baseURI).href;
  style.dataset.ultraClarityV4 = 'yes';
  document.head.appendChild(style);
})();

(function loadKesherPlanGate() {
  if (document.querySelector('script[data-kesher-plan-gate]')) return;
  const script = document.createElement('script');
  script.src = new URL('../campaign-center-v2/contacts-plan-gate.js?v=1', document.baseURI).href;
  script.dataset.kesherPlanGate = 'yes';
  script.defer = true;
  document.head.appendChild(script);
})();

(function loadCampaignOperationsAndCockpit() {
  function loadCockpit() {
    if (document.querySelector('script[data-campaign-cockpit-v1]')) return;
    const cockpit = document.createElement('script');
    cockpit.src = new URL('../campaign-center-v2/campaign-cockpit-v1.js?v=1', document.baseURI).href;
    cockpit.dataset.campaignCockpitV1 = 'yes';
    document.head.appendChild(cockpit);
  }

  if (document.querySelector('script[data-campaign-network-loader]')) {
    loadCockpit();
    return;
  }

  const network = document.createElement('script');
  network.src = new URL('../campaign-center-v2/campaign-network-loader.js?v=1', document.baseURI).href;
  network.dataset.campaignNetworkLoader = 'yes';
  network.onload = loadCockpit;
  network.onerror = loadCockpit;
  document.head.appendChild(network);
})();
