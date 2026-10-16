/* AUPYGO message-rules.js — charge la version complète stable depuis CDN */
(function () {
  'use strict';
  var URLS = [
    'https://cdn.jsdelivr.net/gh/admin-aupygo/AUPYGO@305cb6e603b3845f49eac4231f9c95024fb4660b/js/message-rules.js?v=restore',
    'https://raw.githack.com/admin-aupygo/AUPYGO/305cb6e603b3845f49eac4231f9c95024fb4660b/js/message-rules.js',
    'https://raw.githubusercontent.com/admin-aupygo/AUPYGO/305cb6e603b3845f49eac4231f9c95024fb4660b/js/message-rules.js'
  ];
  function load(i) {
    if (i >= URLS.length) {
      console.error('[AUPYGO] message-rules.js introuvable');
      return;
    }
    var s = document.createElement('script');
    s.src = URLS[i];
    s.async = false;
    s.onerror = function () { load(i + 1); };
    s.onload = function () { console.log('[AUPYGO] message-rules.js OK via', URLS[i]); };
    document.head.appendChild(s);
  }
  load(0);
})();
