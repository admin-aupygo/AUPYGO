/* AUPYGO admin-set-plan.js — restaure version stable + charge CDN si besoin */
(function () {
  'use strict';
  var URLS = [
    'https://cdn.jsdelivr.net/gh/admin-aupygo/AUPYGO@36a1dfcb1baa5df630fae42ceb505936929af443/js/admin-set-plan.js',
    'https://raw.githubusercontent.com/admin-aupygo/AUPYGO/36a1dfcb1baa5df630fae42ceb505936929af443/js/admin-set-plan.js'
  ];
  function load(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'v=plan-restore';
      s.async = false;
      s.onload = function () { resolve(url); };
      s.onerror = function () { reject(new Error(url)); };
      document.head.appendChild(s);
    });
  }
  async function boot() {
    for (var i = 0; i < URLS.length; i++) {
      try {
        await load(URLS[i]);
        console.log('[AUPYGO] admin-set-plan restauré depuis', URLS[i]);
        return;
      } catch (e) {
        console.warn('[AUPYGO] admin-set-plan restore fail', e);
      }
    }
    console.error('[AUPYGO] Impossible de restaurer admin-set-plan.js');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
