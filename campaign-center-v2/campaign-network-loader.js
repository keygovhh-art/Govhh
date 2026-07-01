/* Temporary preview loader: removes the obsolete local render patch before executing the module. */
(async function () {
  try {
    const response = await fetch(new URL('campaign-network.js?v=1', document.baseURI));
    let source = await response.text();
    source = source.replace(
      "function patch(){if(typeof renderAll==='function'&&!window.__networkPatched){const old=renderAll;renderAll=function(){old();renderAll()};window.__networkPatched=true}}",
      "function patch(){}"
    );
    (0, eval)(source);
  } catch (error) {
    console.error('Campaign Network could not load', error);
  }
})();
