/* AUPYGO promo-expire-fix.js
 * Au chargement / login : appelle expire_my_promo_if_needed()
 * pour restaurer le forfait initial si l'avantage promo est terminé.
 * Côté serveur = source de vérité (fonctionne aussi si l'user ne revient pas
 * dès qu'un cron ou un autre user déclenche expire_promo_benefits).
 */
(function () {
  'use strict';

  var lastRun = 0;
  var MIN_INTERVAL_MS = 60 * 1000;

  function client() {
    return window.supabaseClient || window.supabase || null;
  }

  async function runExpire() {
    var now = Date.now();
    if (now - lastRun < MIN_INTERVAL_MS) return;
    var c = client();
    if (!c) return;
    try {
      var sess = await c.auth.getSession();
      var uid = sess && sess.data && sess.data.session && sess.data.session.user
        ? sess.data.session.user.id
        : null;
      if (!uid && window.currentUser) uid = window.currentUser.id;
      if (!uid) return;

      lastRun = now;
      var res = await c.rpc('expire_my_promo_if_needed');
      if (res.error) {
        console.warn('[promo-expire]', res.error.message || res.error);
        return;
      }
      var d = res.data || {};
      if (d.expired) {
        console.log('[promo-expire] avantage terminé → forfait restauré', d.subscription);
        if (typeof showToast === 'function') {
          showToast('Ton avantage promo est terminé. Forfait : ' + (d.subscription || 'FREE'), 'info');
        }
        // Rafraîchir le plan affiché
        try {
          if (typeof window.currentPlan !== 'undefined') {
            window.currentPlan = String(d.subscription || 'FREE').toUpperCase();
          }
          if (typeof currentPlan !== 'undefined') {
            currentPlan = String(d.subscription || 'FREE').toUpperCase();
          }
        } catch (e) {}
        // Recharger le profil si possible
        if (typeof loadProfile === 'function') {
          try { await loadProfile(); } catch (e2) {}
        }
      } else if (d.active_promo) {
        console.log('[promo-expire] promo active jusqu\'au', d.ends_at);
      }
    } catch (e) {
      console.warn('[promo-expire]', e);
    }
  }

  function boot() {
    runExpire();
    setTimeout(runExpire, 2000);
    setTimeout(runExpire, 8000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Après login / navigation
  var origGo = window.go;
  if (typeof origGo === 'function' && !window._promoExpireGoPatched) {
    window._promoExpireGoPatched = true;
    window.go = function () {
      var r = origGo.apply(this, arguments);
      setTimeout(runExpire, 300);
      return r;
    };
  }

  try {
    var c0 = client();
    if (c0 && c0.auth && typeof c0.auth.onAuthStateChange === 'function') {
      c0.auth.onAuthStateChange(function (event) {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
          setTimeout(runExpire, 500);
        }
      });
    }
  } catch (e) {}

  console.log('[AUPYGO] promo-expire-fix.js chargé');
})();
