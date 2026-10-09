/* AUPYGO app.js loader — restaure depuis le dernier commit sain pendant correction */
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
    };
    s.onerror = function () {
      load(i + 1);
    };
    (document.head || document.documentElement).appendChild(s);
  }
  load(0);
})();
