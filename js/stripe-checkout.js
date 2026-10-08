/* ==========================================================================
 * AUPYGO — stripe-checkout.js
 * Boutons de paiement → Edge Function create-checkout-session → Stripe Checkout
 *
 * Usage :
 *   window.startCheckout('standard_monthly')
 *   window.startCheckout('premium_monthly')
 *   window.startCheckout('standard_6m')
 *   window.startCheckout('premium_6m')
 *
 * FREE : pas de paiement, activation immédiate déjà gérée côté profil.
 * ========================================================================== */
(function () {
  'use strict';

  var PRICE_KEYS = {
    standard_monthly: { label: 'Standard 4,90 €/mois', plan: 'STANDARD' },
    premium_monthly: { label: 'Premium 9,90 €/mois', plan: 'PREMIUM' },
    standard_6m: { label: 'Standard Pass 6 mois 24,90 €', plan: 'STANDARD' },
    premium_6m: { label: 'Premium Pass 6 mois 51,60 €', plan: 'PREMIUM' },
  };

  function client() {
    return window.supabaseClient || window.supabase || null;
  }

  function toast(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type || 'info');
    else console.log('[checkout]', type, msg);
  }

  function getFunctionsBase() {
    try {
      if (typeof SUPABASE_URL === 'string' && SUPABASE_URL) {
        return SUPABASE_URL.replace(/\/$/, '') + '/functions/v1';
      }
    } catch (e) {}
    return 'https://zdjcjzsmoinrkcezgivs.supabase.co/functions/v1';
  }

  async function startCheckout(priceKey) {
    if (!PRICE_KEYS[priceKey]) {
      toast('Offre inconnue.', 'error');
      return;
    }

    var user =
      window.currentUser ||
      (typeof currentUser !== 'undefined' ? currentUser : null);
    if (!user || !user.id) {
      toast('Connecte-toi avant de choisir une offre.', 'error');
      if (typeof go === 'function') go('login');
      return;
    }

    var sb = client();
    if (!sb) {
      toast('Connexion indisponible. Réessaie.', 'error');
      return;
    }

    toast('Redirection vers le paiement sécurisé…', 'info');

    try {
      var session = await sb.auth.getSession();
      var token =
        session?.data?.session?.access_token ||
        (await sb.auth.getSession()).data?.session?.access_token;
      if (!token) {
        toast('Session expirée. Reconnecte-toi.', 'error');
        return;
      }

      var res = await fetch(getFunctionsBase() + '/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
          apikey:
            typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : '',
        },
        body: JSON.stringify({ price_key: priceKey }),
      });

      var data = await res.json().catch(function () {
        return {};
      });

      if (!res.ok || !data.url) {
        console.error('[checkout]', data);
        toast(
          data.error === 'stripe_not_configured'
            ? 'Paiement pas encore configuré (secret Stripe manquant).'
            : 'Impossible de démarrer le paiement. Réessaie.',
          'error',
        );
        return;
      }

      window.location.href = data.url;
    } catch (e) {
      console.error('[checkout]', e);
      toast('Erreur réseau. Réessaie.', 'error');
    }
  }

  function handleReturnFromCheckout() {
    try {
      var params = new URLSearchParams(window.location.search);
      var status = params.get('checkout');
      if (!status) return;

      if (status === 'success') {
        var plan = (params.get('plan') || '').toUpperCase();
        toast(
          plan
            ? '🎉 Paiement réussi ! Ton offre ' + plan + ' est active.'
            : '🎉 Paiement réussi ! Ton offre est active.',
          'success',
        );
        if (typeof loadProfile === 'function') {
          try {
            loadProfile();
          } catch (e) {}
        }
        history.replaceState({}, '', window.location.pathname);
      } else if (status === 'cancel') {
        toast('Paiement annulé. Tu peux réessayer quand tu veux.', 'info');
        history.replaceState({}, '', window.location.pathname);
      }
    } catch (e) {}
  }

  async function openBillingPortal() {
    var user =
      window.currentUser ||
      (typeof currentUser !== 'undefined' ? currentUser : null);
    if (!user) {
      toast('Connecte-toi d’abord.', 'error');
      return;
    }
    toast('Portail facturation bientôt disponible.', 'info');
  }

  window.startCheckout = startCheckout;
  window.openBillingPortal = openBillingPortal;
  window.AUPYGO_PRICE_KEYS = PRICE_KEYS;

  function bindButtons() {
    document.querySelectorAll('[data-checkout]').forEach(function (btn) {
      if (btn._checkoutBound) return;
      btn._checkoutBound = true;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var key = btn.getAttribute('data-checkout');
        if (key) startCheckout(key);
      });
    });
  }

  function boot() {
    handleReturnFromCheckout();
    bindButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  setTimeout(bindButtons, 800);
  setTimeout(bindButtons, 2000);

  console.log('[AUPYGO] stripe-checkout.js — ready');
})();
