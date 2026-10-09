/* AUPYGO app.js loader — restaure depuis le dernier commit sain */
(function () {
  var urls = [
    'https://cdn.jsdelivr.net/gh/admin-aupygo/AUPYGO@ab78b5551759841cee310b7643e5b5fb5efcba55/app.js',
    'https://raw.githack.com/admin-aupygo/AUPYGO/ab78b5551759841cee310b7643e5b5fb5efcba55/app.js',
    'https://raw.githubusercontent.com/admin-aupygo/AUPYGO/ab78b5551759841cee310b7643e5b5fb5efcba55/app.js'
  ];
  function load(i) {
    if (i >= urls.length) {
      console.error('[AUPYGO] impossible de charger app.js');
      return;
    }
    var s = document.createElement('script');
    s.src = urls[i];
    s.onload = function () {
      console.log('[AUPYGO] app.js chargé depuis', urls[i]);
      // Réapplique le correctif profil si déjà chargé
      if (typeof window.__aupygoReapplySaveProfile === 'function') {
        try { window.__aupygoReapplySaveProfile(); } catch (e) {}
      }
      // Charge le fix explicitement si pas encore présent
      if (!window.__aupygoSaveProfileFixed) {
        var f = document.createElement('script');
        f.src = 'js/save-profile-fix.js?v=fix-20261009-saveprofile2';
        (document.head || document.documentElement).appendChild(f);
      }
    };
    s.onerror = function () { load(i + 1); };
    (document.head || document.documentElement).appendChild(s);
  }
  load(0);
})();
