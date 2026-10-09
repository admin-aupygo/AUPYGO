/* AUPYGO app.js — charge synchrone le dernier commit sain (évite NaN / courses) */
(function () {
  var urls = [
    'https://cdn.jsdelivr.net/gh/admin-aupygo/AUPYGO@ab78b5551759841cee310b7643e5b5fb5efcba55/app.js',
    'https://raw.githack.com/admin-aupygo/AUPYGO/ab78b5551759841cee310b7643e5b5fb5efcba55/app.js',
    'https://raw.githubusercontent.com/admin-aupygo/AUPYGO/ab78b5551759841cee310b7643e5b5fb5efcba55/app.js'
  ];
  var loaded = false;
  for (var i = 0; i < urls.length && !loaded; i++) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', urls[i], false);
      xhr.send(null);
      if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText && xhr.responseText.indexOf('supabaseClient') !== -1) {
        (0, eval)(xhr.responseText);
        loaded = true;
        console.log('[AUPYGO] app.js sync OK via', urls[i]);
      }
    } catch (e) {
      console.warn('[AUPYGO] app.js sync fail', urls[i], e);
    }
  }
  if (!loaded) {
    console.error('[AUPYGO] app.js introuvable — rechargement async');
    var s = document.createElement('script');
    s.src = urls[0];
    document.head.appendChild(s);
  }
})();
