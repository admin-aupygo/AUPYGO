/* AUPYGO admin.js — charge la version stable + setRole fix */
(function () {
  'use strict';
  var URLS = [
    'https://cdn.jsdelivr.net/gh/admin-aupygo/AUPYGO@e52daaeaf9f55f7c6e334a496776e26f3267f826/js/admin.js',
    'https://raw.githubusercontent.com/admin-aupygo/AUPYGO/e52daaeaf9f55f7c6e334a496776e26f3267f826/js/admin.js'
  ];
  function load(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url + '?v=admin-restore';
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
        console.log('[AUPYGO] admin.js restauré depuis', URLS[i]);
        var f = document.createElement('script');
        f.src = 'js/admin-setrole-fix.js?v=admin-setrole-1';
        f.async = false;
        document.head.appendChild(f);
        return;
      } catch (e) {
        console.warn('[AUPYGO] admin restore fail', e);
      }
    }
    console.error('[AUPYGO] Impossible de restaurer admin.js');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
