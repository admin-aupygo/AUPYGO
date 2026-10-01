/* AUPYGO — staff-status.js
 * Statut « STAFF » : pour un compte Staff ou Amiral, les pastilles de forfait
 * (en-tête, barre du bas, menu « Plus ») affichent STAFF avec un badge dédié.
 *
 * Les droits ne changent pas : en base, le forfait du staff reste PREMIUM.
 * Le statut est calculé à partir du rôle (une seule source de vérité), il n'ajoute
 * donc aucune nouvelle valeur dans profiles.subscription.
 */
(function () {
  'use strict';

  var LABEL = 'STAFF';
  var EMOJI = '🛡️';
  var PLAN_CLASSES = ['plan-free', 'plan-standard', 'plan-premium'];
  var BADGE_IDS = ['headerPlanBadge', 'bottomNavPlanBadge', 'moreSheetPlanPill'];

  function isStaffUser() {
    try {
      return (typeof window.isStaff === 'function' && window.isStaff()) ||
             (typeof window.isAmiral === 'function' && window.isAmiral());
    } catch (e) {
      return false;
    }
  }

  function injectStyle() {
    if (document.getElementById('aupygoStaffStatusStyle')) return;
    var st = document.createElement('style');
    st.id = 'aupygoStaffStatusStyle';
    st.textContent =
      '.header-plan-badge.plan-staff,' +
      '.header-plan-badge-sm.plan-staff,' +
      '.msi-plan-pill.plan-staff{background:linear-gradient(135deg,#0f172a,#475569);color:#fff;}';
    document.head.appendChild(st);
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el && el.textContent !== text) el.textContent = text;
  }

  function setStaffBadge(id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (el.textContent !== LABEL) el.textContent = LABEL;
    PLAN_CLASSES.forEach(function (c) { el.classList.remove(c); });
    el.classList.add('plan-staff');
  }

  function clearStaffBadge(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('plan-staff');
  }

  function apply() {
    if (!isStaffUser()) {
      BADGE_IDS.forEach(clearStaffBadge);
      return;
    }
    injectStyle();
    setText('headerPlanAvatar', EMOJI);
    setText('bottomNavAvatar', EMOJI);
    setText('moreSheetAvatar', EMOJI);
    setText('moreSheetPlan', LABEL);
    BADGE_IDS.forEach(setStaffBadge);
  }

  function wrap() {
    if (typeof window.updatePlanAvatarUI !== 'function' || window._staffStatusWrapped) return;
    window._staffStatusWrapped = true;
    var original = window.updatePlanAvatarUI;
    window.updatePlanAvatarUI = function () {
      var result = original.apply(this, arguments);
      apply();
      return result;
    };
  }

  wrap();
  setInterval(function () { wrap(); apply(); }, 2000);
})();
