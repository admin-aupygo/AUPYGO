/* AUPYGO join-events-fix.js
 * FREE :
 *   - voit toutes les sorties (communauté + AUPYGO)
 *   - rejoint UNIQUEMENT les événements AUPYGO staff PAYANTS
 * STANDARD / PREMIUM : rejoignent librement
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
      var client = window.supabaseClient || window.supabase;
      var user = window.currentUser || (typeof currentUser !== 'undefined' ? currentUser : null);
      if (!user || !user.id) return normalizePlan(window.currentPlan || (typeof currentPlan !== 'undefined' ? currentPlan : 'FREE'));
      if (!client) return normalizePlan(window.currentPlan || 'FREE');
      var res = await client.from('profiles').select('subscription').eq('id', user.id).maybeSingle();
      var sub = res.data && res.data.subscription;
      var plan = normalizePlan(sub || 'FREE');
      try { currentPlan = plan; } catch (e) {}
      window.currentPlan = plan;
      try { localStorage.setItem('aupygo_plan', plan); } catch (e2) {}
      return plan;
    } catch (e) {
      return normalizePlan(window.currentPlan || (typeof currentPlan !== 'undefined' ? currentPlan : 'FREE'));
    }
  }

  function getEvent(eventId) {
    return (window.cachedEvents || []).find(function (e) { return e && e.id === eventId; }) || null;
  }

  function isStaffCreatedEvent(ev) {
    if (!ev) return false;
    if (ev.is_special_aupygo === true || ev.is_special_aupygo === 'true') return true;
    if (ev.visibility === 'admin' || ev.visibility === 'admin_only') return true;
    if (String(ev.type || '') === 'special') return true;
    var d = String(ev.description || '');
    if (d.indexOf('[STAFF_EVENT]') !== -1 || d.indexOf('[STAFF_PRESENCE]') !== -1) return true;
    try {
      var c = (window.profiles || []).find(function (p) { return p && p.id === ev.creator_id; });
      if (c && (c.is_admin === true ||
          ['amiral','admin_general','admin','major_staff','sergent_staff',
           'major_moderateur','sergent_moderateur','host','moderator']
            .indexOf(String(c.role || '').toLowerCase()) !== -1)) return true;
    } catch (e) {}
    return false;
  }

  function isStaffPaidEvent(ev) {
    return !!(ev && isStaffCreatedEvent(ev) && (ev.is_paid === true || ev.is_paid === 'true') && Number(ev.price) > 0);
  }

  function canJoinWithPlan(plan, ev) {
    if (plan === 'STANDARD' || plan === 'PREMIUM') return true;
    // FREE : uniquement AUPYGO staff PAYANT
    if (isStaffPaidEvent(ev)) return true;
    return false;
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

      if (typeof isStaff === 'function' && isStaff()) {
        return orig.apply(this, arguments);
      }

      var plan = await refreshPlanFromDb();
      var ev = getEvent(eventId);

      // Payant AUPYGO → modal si dispo (staff-event-notify / cdc)
      if (ev && isStaffPaidEvent(ev)) {
        if (typeof window.openSpecialInviteModal === 'function') {
          return window.openSpecialInviteModal(eventId);
        }
        if (typeof window.openPaidAcceptModal === 'function') {
          return window.openPaidAcceptModal(ev);
        }
      }

      if (!canJoinWithPlan(plan, ev)) {
        if (typeof showToast === 'function') {
          showToast(
            '🔒 FREE : tu vois toutes les sorties. ' +
            'Tu peux participer uniquement aux événements AUPYGO payants. ' +
            'Passe en STANDARD pour les sorties gratuites.',
            'error'
          );
        }
        return;
      }

      // FREE + AUPYGO payant : contourne le check app.js
      var prevPlan = typeof currentPlan !== 'undefined' ? currentPlan : window.currentPlan;
      var prevWin = window.currentPlan;
      try {
        if (plan === 'FREE' && isStaffPaidEvent(ev)) {
          try { currentPlan = 'STANDARD'; } catch (e1) {}
          window.currentPlan = 'STANDARD';
        }
        return await orig.apply(this, arguments);
      } finally {
        try { currentPlan = prevPlan; } catch (e3) {}
        window.currentPlan = prevWin || plan;
      }
    };

    console.log('[AUPYGO] join-events-fix : FREE → AUPYGO payant seulement');
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
})();
