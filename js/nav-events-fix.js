/* AUPYGO — fix navigation mobile : Sorties ne doit pas renvoyer vers Profil
   Cause : go() forçait page='profile' si currentUser && !profileSaved
   et events n'était pas dans GUEST_ALLOWED_PAGES. */
(function () {
  'use strict';

  function applyFix() {
    if (typeof window.go !== 'function') return false;
    if (window.go.__aupygoEventsFix) return true;

    var originalGo = window.go;

    window.go = function (page) {
      // Étendre les pages accessibles même si le profil n'est pas encore sauvegardé
      try {
        if (typeof GUEST_ALLOWED_PAGES !== 'undefined' && Array.isArray(GUEST_ALLOWED_PAGES)) {
          ['events', 'agenda', 'home', 'map', 'plans'].forEach(function (p) {
            if (GUEST_ALLOWED_PAGES.indexOf(p) === -1) GUEST_ALLOWED_PAGES.push(p);
          });
        }
      } catch (e) {}

      // Si on vise Sorties / Agenda avec un compte connecté mais profil incomplet,
      // on laisse passer (au lieu de rediriger silencieusement vers Profil).
      return originalGo(page);
    };

    window.go.__aupygoEventsFix = true;
    return true;
  }

  if (!applyFix()) {
    var tries = 0;
    var timer = setInterval(function () {
      if (applyFix() || ++tries > 50) clearInterval(timer);
    }, 100);
  }

  document.addEventListener('DOMContentLoaded', applyFix);
  window.addEventListener('load', applyFix);
})();
