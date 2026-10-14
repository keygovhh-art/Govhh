/* Load the Campaign Network as an ordinary script; never eval remote code. */
(function(){
  if(document.querySelector('script[data-campaign-network-main]')) return;
  const script=document.createElement('script');
  script.src=new URL('campaign-network.js?v=2',document.baseURI).href;
  script.dataset.campaignNetworkMain='yes';
  script.onerror=()=>console.error('Campaign Network script failed to load');
  document.head.appendChild(script);
})();
