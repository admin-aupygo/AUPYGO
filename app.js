/* AUPYGO — app.js complet (commit stable a5b2c260, ~240 Ko)
 * Upload API limité → charge le blob Git via CDN. Pas de document.write.
 */
(function () {
  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/gh/admin-aupygo/AUPYGO@a5b2c260809d54c4f5d6c268596062867de11ae9/app.js?v=a2-20261007';
  s.async = false;
  document.head.appendChild(s);
})();
