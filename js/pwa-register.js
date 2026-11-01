/* AUPYGO — register service worker */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function (e) {
      console.warn('[AUPYGO] SW register', e);
    });
  });
}
