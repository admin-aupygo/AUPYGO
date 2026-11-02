/* AUPYGO — stop spam 401 sur /profiles (role, is_admin, staff_*)
 * Causes :
 *  1) loadProfiles() rappelé trop souvent (wrappers staff + interval)
 *  2) enrich staff (select role/is_admin) bloqué par RLS → 401 en boucle
 */
(function () {
  'use strict';

  var ROLE_BACKOFF_MS = 120000; // 2 min après un 401 "role"
  var LOAD_MIN_MS = 12000;      // min 12 s entre deux loadProfiles réels
  var roleBackoffUntil = 0;
  var lastLoadAt = 0;
  var loadInFlight = null;

  function now() { return Date.now(); }

  function isRoleSelect(url) {
    if (!url || url.indexOf('/rest/v1/profiles') === -1) return false;
    // select=…role… ou is_admin / staff_
    return /[?&]select=[^&]*(role|is_admin|staff_)/i.test(url);
  }

  // --- 1) Backoff global sur les SELECT role/is_admin en 401 ---
  function patchFetch() {
    if (window.__aupygoFetch401Patched) return;
    window.__aupygoFetch401Patched = true;
    var orig = window.fetch.bind(window);
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) ? input.url : '';
      if (isRoleSelect(url) && now() < roleBackoffUntil) {
        // Réponse vide OK → les enrich ne plantent pas et ne spamment plus
        return Promise.resolve(new Response('[]', {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }));
      }
      return orig(input, init).then(function (res) {
        try {
          if (res && res.status === 401 && isRoleSelect(url)) {
            roleBackoffUntil = now() + ROLE_BACKOFF_MS;
            if (!window.__aupygo401Warned) {
              window.__aupygo401Warned = true;
              console.warn('[AUPYGO] profiles role/is_admin → 401 (RLS/session). Pause enrich ' + (ROLE_BACKOFF_MS / 1000) + 's');
              setTimeout(function () { window.__aupygo401Warned = false; }, ROLE_BACKOFF_MS);
            }
          }
        } catch (e) {}
        return res;
      });
    };
  }

  // --- 2) Throttle + dédup loadProfiles ---
  function patchLoadProfiles() {
    if (typeof window.loadProfiles !== 'function') return false;
    if (window.loadProfiles.__aupygo401Throttle) return true;

    var original = window.loadProfiles;
    window.loadProfiles = function () {
      var args = arguments;
      var t = now();
      if (loadInFlight) return loadInFlight;
      if (t - lastLoadAt < LOAD_MIN_MS) {
        return Promise.resolve(window.profiles || []);
      }
      lastLoadAt = t;
      try {
        var ret = original.apply(this, args);
        loadInFlight = Promise.resolve(ret).then(function (v) {
          loadInFlight = null;
          return v;
        }, function (err) {
          loadInFlight = null;
          throw err;
        });
        return loadInFlight;
      } catch (e) {
        loadInFlight = null;
        return Promise.reject(e);
      }
    };
    window.loadProfiles.__aupygo401Throttle = true;
    // garder une ref à l'original pour staff wrappers qui patchent après
    window.loadProfiles.__aupygoOriginal = original;
    return true;
  }

  // --- 3) Si staff-visibility enrich échoue, mémoriser ---
  function softPatchEnrich() {
    // best-effort : si une fonction globale existe
    var names = ['enrichAndFilter', 'enrichProfilesRoles', 'enrichStaffRoles'];
    names.forEach(function (n) {
      if (typeof window[n] === 'function' && !window[n].__aupygo401) {
        var o = window[n];
        window[n] = async function () {
          if (now() < roleBackoffUntil) return;
          try {
            return await o.apply(this, arguments);
          } catch (e) {
            roleBackoffUntil = now() + ROLE_BACKOFF_MS;
          }
        };
        window[n].__aupygo401 = true;
      }
    });
  }

  function boot() {
    patchFetch();
    if (!patchLoadProfiles()) {
      var tries = 0;
      var t = setInterval(function () {
        if (patchLoadProfiles() || ++tries > 80) clearInterval(t);
      }, 100);
    }
    softPatchEnrich();
    setInterval(softPatchEnrich, 5000);
  }

  boot();
  console.info('[AUPYGO] profiles-401-fix actif (throttle loadProfiles + backoff 401 role)');
})();
