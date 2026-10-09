/* ==========================================================================
 * AUPYGO — stripe-select-plan.js
 * Remplace selectPlan (plans payants) pour ouvrir Stripe Checkout.
 * Doit être chargé APRÈS app.js et stripe-checkout.js.
 * ========================================================================== */
(function () {
  'use strict';

  var KEY_MAP = {
    'STANDARD|monthly': 'standard_monthly',
    'STANDARD|pass6': 'standard_6m',
    'PREMIUM|monthly': 'premium_monthly',
    'PREMIUM|pass6': 'premium_6m',
  };

  var original = typeof window.selectPlan === 'function' ? window.selectPlan : null;

  async function selectPlanStripe(plan, billing) {
    if (!window.currentUser && typeof currentUser === 'undefined') {
      if (typeof showToast === 'function') showToast((typeof t === 'function' && t('plans.need_login')) || 'Connecte-toi d’abord.', 'error');
      return;
    }
    var user = window.currentUser || (typeof currentUser !== 'undefined' ? currentUser : null);
    if (!user) {
      if (typeof showToast === 'function') showToast((typeof t === 'function' && t('plans.need_login')) || 'Connecte-toi d’abord.', 'error');
      return;
    }

    if (String(plan).toUpperCase() === 'FREE') {
      if (original) return original.call(this, plan, billing);
      return;
    }

    var bill = billing || 'monthly';
    var priceKey = KEY_MAP[String(plan).toUpperCase() + '|' + bill];
    if (!priceKey) {
      if (typeof showToast === 'function') showToast('Offre inconnue.', 'error');
      return;
    }

    if (typeof window.startCheckout === 'function') {
      window.startCheckout(priceKey);
      return;
    }

    if (typeof showToast === 'function') {
      showToast('Paiement en cours de chargement… réessaie dans 2 s.', 'info');
    }
    setTimeout(function () {
      if (typeof window.startCheckout === 'function') {
        window.startCheckout(priceKey);
      } else if (typeof showToast === 'function') {
        showToast('Module paiement indisponible. Recharge la page.', 'error');
      }
    }, 1500);
  }

  window.selectPlan = selectPlanStripe;
  console.log('[AUPYGO] stripe-select-plan.js — selectPlan → Stripe Checkout');
})();
