/* AUPYGO join-events-fix.js
 * Corrige PLAN_REQUIRED / join_locked sur les sorties communautaires.
 * - Rafraîchit le forfait depuis Supabase avant le check
 * - FREE peut rejoindre les sorties publiques gratuites (communauté)
 * - STANDARD / PREMIUM : tout (public + friends + payant)
 * - Friends / payant restent STANDARD+
 */
(function () {
  'use strict';

  function normalizePlan(p) {
    var s = String(p || 'FREE').trim().toUpperCase();
    if (s === 'STANDARD' || s === 'PREMIUM' || s === 'FREE') return s;
    return 'FREE';
  }

  async function refreshPlanFromDb() {
    try {
      if (typeof supabaseClient === 'undefined' || !supabaseClient) return normalizePlan(window.currentPlan || currentPlan);
      var user = window.currentUser || (typeof currentUser !== 'undefined' ? currentUser : null);
      if (!user || !user.id) {
        var ur = await supabaseClient.auth.getUser();
        user = ur.data && ur.data.user;
      }
      if (!user || !user.id) return normalizePlan(window.currentPlan || (typeof currentPlan !== 'undefined' ? currentPlan : 'FREE'));

      var res = await supabaseClient
        .from('profiles')
        .select('subscription')
        .eq('id', user.id)
        .maybeSingle();

      var sub = res.data && res.data.subscription;
      var plan = normalizePlan(sub || 'FREE');
      try {
        window.currentPlan = plan;
        if (typeof currentPlan !== 'undefined') currentPlan = plan;
        localStorage.setItem('aupygo_plan', plan);
        if (typeof updatePlanUI === 'function') updatePlanUI();
      } catch (e) {}
      return plan;
    } catch (e) {
      console.warn('[AUPYGO] refreshPlanFromDb', e);
      return normalizePlan(window.currentPlan || (typeof currentPlan !== 'undefined' ? currentPlan : 'FREE'));
    }
  }

  function getEvent(eventId) {
    return (window.cachedEvents || []).find(function (e) { return e && e.id === eventId; }) || null;
  }

  function isCommunityFreeEvent(ev) {
    if (!ev) return false;
    var vis = String(ev.visibility || 'public').toLowerCase();
    if (vis !== 'public') return false;
    if (ev.is_special_aupygo === true) return false;
    if (vis === 'admin' || vis === 'admin_only') return false;
    var paid = !!(ev.is_paid && Number(ev.price) > 0);
    return !paid;
  }

  function canJoinWithPlan(plan, ev) {
    if (plan === 'STANDARD' || plan === 'PREMIUM') return true;
    // FREE : uniquement sorties communautaires publiques gratuites
    return isCommunityFreeEvent(ev);
  }

  function patchJoin() {
    if (typeof window.joinRealEvent !== 'function') return false;
    if (window._joinEventsFixPatched) return true;
    window._joinEventsFixPatched = true;

    var orig = window.joinRealEvent;
    window.joinRealEvent = async function (eventId) {
      var user = window.currentUser || (typeof currentUser !== 'undefined' ? currentUser : null);
      if (!user) {
        if (typeof showToast === 'function') {
          showToast((typeof t === 'function' && t('plans.need_login')) || 'Connecte-toi.', 'error');
        }
        if (typeof go === 'function') go('plans');
        return;
      }

      // Staff : laisser le patch staff-events gérer
      if (typeof isStaff === 'function' && isStaff()) {
        return orig.apply(this, arguments);
      }

      var plan = await refreshPlanFromDb();
      var ev = getEvent(eventId);

      if (!canJoinWithPlan(plan, ev)) {
        if (typeof showToast === 'function') {
          showToast(
            (typeof t === 'function' && t('events.join_locked')) ||
              '🔒 Passe à STANDARD pour rejoindre les sorties privées ou payantes.',
            'error'
          );
        }
        return;
      }

      // Contourne le check FREE trop strict de l'app.js d'origine
      // en forçant temporairement un plan autorisé pour l'appel orig,
      // uniquement si on a déjà validé canJoinWithPlan.
      var prevPlan = typeof currentPlan !== 'undefined' ? currentPlan : window.currentPlan;
      var prevWin = window.currentPlan;
      try {
        if (plan === 'FREE' && isCommunityFreeEvent(ev)) {
          // L'orig refuse FREE → on passe STANDARD le temps de l'insert
          try { currentPlan = 'STANDARD'; } catch (e1) {}
          window.currentPlan = 'STANDARD';
        } else {
          try { currentPlan = plan; } catch (e2) {}
          window.currentPlan = plan;
        }
        return await orig.apply(this, arguments);
      } finally {
        try { currentPlan = prevPlan; } catch (e3) {}
        window.currentPlan = prevWin || plan;
        try { localStorage.setItem('aupygo_plan', plan); } catch (e4) {}
      }
    };

    console.log('[AUPYGO] join-events-fix.js : sorties communautaires OK');
    return true;
  }

  function boot() {
    if (!patchJoin()) {
      setTimeout(boot, 400);
      setTimeout(boot, 1200);
      setTimeout(boot, 3000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  setTimeout(boot, 800);
})();
