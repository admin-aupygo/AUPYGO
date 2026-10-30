/* AUPYGO — paypal-checkout.js (Sandbox / Live selon config.js) */
(function () {
  'use strict';
  if (window.__aupygoPaypalCheckout) return;
  window.__aupygoPaypalCheckout = true;

  var KEY_TO_PLAN_ID = {
    standard_monthly: function () {
      return (window.PAYPAL_PLANS && PAYPAL_PLANS.standard_monthly) ||
        (typeof PAYPAL_PLANS !== 'undefined' && PAYPAL_PLANS.standard_monthly) || '';
    },
    premium_monthly: function () {
      return (window.PAYPAL_PLANS && PAYPAL_PLANS.premium_monthly) ||
        (typeof PAYPAL_PLANS !== 'undefined' && PAYPAL_PLANS.premium_monthly) || '';
    },
  };

  var PLAN_ALIAS = {
    'STANDARD|monthly': 'standard_monthly',
    'PREMIUM|monthly': 'premium_monthly',
  };

  function clientId() {
    return (typeof PAYPAL_CLIENT_ID !== 'undefined' && PAYPAL_CLIENT_ID) ||
      window.PAYPAL_CLIENT_ID || '';
  }

  function toast(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type || 'info');
    else console.log('[paypal]', msg);
  }

  function supabaseUrl() {
    return (typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL) || window.SUPABASE_URL || '';
  }

  function loadSdk() {
    return new Promise(function (resolve, reject) {
      if (window.paypal && window.paypal.Buttons) return resolve();
      var id = clientId();
      if (!id) return reject(new Error('PAYPAL_CLIENT_ID manquant'));
      var s = document.createElement('script');
      s.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(id) +
        '&vault=true&intent=subscription&currency=EUR';
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('PayPal SDK load failed')); };
      document.head.appendChild(s);
    });
  }

  function ensureContainer() {
    var el = document.getElementById('paypalButtonsHost');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'paypalButtonsHost';
    el.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:100001;background:#fff;padding:20px;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.35);min-width:280px;max-width:92vw;';
    el.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
      '<strong id="paypalHostTitle">PayPal</strong>' +
      '<button type="button" id="paypalHostClose" style="border:0;background:#eee;border-radius:8px;padding:6px 10px;cursor:pointer">✕</button></div>' +
      '<div id="paypal-button-container"></div>';
    document.body.appendChild(el);
    document.getElementById('paypalHostClose').onclick = function () {
      el.style.display = 'none';
      var c = document.getElementById('paypal-button-container');
      if (c) c.innerHTML = '';
    };
    return el;
  }

  async function activateOnServer(subscriptionID) {
    var sb = window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    if (!sb) throw new Error('Supabase client missing');
    var session = (await sb.auth.getSession()).data.session;
    if (!session) throw new Error('Connecte-toi');
    var url = supabaseUrl().replace(/\/$/, '') + '/functions/v1/paypal-activate-subscription';
    var res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + session.access_token,
        apikey: (typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : ''),
      },
      body: JSON.stringify({ subscriptionID: subscriptionID }),
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  }

  window.startPaypalCheckout = async function (priceKey) {
    try {
      var user = window.currentUser || (typeof currentUser !== 'undefined' ? currentUser : null);
      if (!user) {
        toast('Connecte-toi d’abord.', 'error');
        return;
      }
      var key = priceKey;
      if (!KEY_TO_PLAN_ID[key]) {
        toast('Offre PayPal dispo en mensuel uniquement pour l’instant.', 'error');
        return;
      }
      var planId = KEY_TO_PLAN_ID[key]();
      if (!planId) {
        toast('Plan PayPal non configuré.', 'error');
        return;
      }

      await loadSdk();
      var host = ensureContainer();
      host.style.display = 'block';
      document.getElementById('paypalHostTitle').textContent =
        key.indexOf('premium') >= 0 ? 'PayPal — PREMIUM' : 'PayPal — STANDARD';
      var box = document.getElementById('paypal-button-container');
      box.innerHTML = '';

      window.paypal.Buttons({
        style: { shape: 'pill', color: 'gold', layout: 'vertical', label: 'subscribe' },
        createSubscription: function (data, actions) {
          return actions.subscription.create({ plan_id: planId });
        },
        onApprove: async function (data) {
          try {
            toast('Activation en cours…', 'info');
            var result = await activateOnServer(data.subscriptionID);
            host.style.display = 'none';
            toast('Abonnement ' + (result.plan || '') + ' activé !', 'success');
            if (typeof window.currentPlan !== 'undefined') window.currentPlan = result.plan;
            if (typeof currentPlan !== 'undefined') currentPlan = result.plan;
            if (typeof updatePlanUI === 'function') updatePlanUI();
            if (typeof refreshAuthUI === 'function') refreshAuthUI();
            if (typeof loadProfiles === 'function') loadProfiles();
          } catch (e) {
            console.error(e);
            toast(e.message || String(e), 'error');
          }
        },
        onError: function (err) {
          console.error(err);
          toast('Erreur PayPal', 'error');
        },
      }).render('#paypal-button-container');
    } catch (e) {
      console.error(e);
      toast(e.message || String(e), 'error');
    }
  };

  /* Boutons “PayPal” à côté des plans mensuels */
  function injectButtons() {
    var root = document.getElementById('plans') || document.body;
    if (!root || root._paypalBtns) return;
    root._paypalBtns = true;
    var bar = document.createElement('div');
    bar.id = 'paypalPlanBar';
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin:16px 0;';
    bar.innerHTML =
      '<button type="button" class="btn btn-secondary" id="btnPaypalStandard">PayPal — STANDARD 4,90 €/mois</button>' +
      '<button type="button" class="btn btn-secondary" id="btnPaypalPremium">PayPal — PREMIUM 9,90 €/mois</button>';
    var anchor = document.querySelector('#plans .plans-grid, #plans .grid, #plans');
    if (anchor) anchor.appendChild(bar);
    else root.appendChild(bar);
    document.getElementById('btnPaypalStandard').onclick = function () {
      window.startPaypalCheckout('standard_monthly');
    };
    document.getElementById('btnPaypalPremium').onclick = function () {
      window.startPaypalCheckout('premium_monthly');
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(injectButtons, 600);
    });
  } else {
    setTimeout(injectButtons, 600);
  }
  setTimeout(injectButtons, 2000);

  console.log('[AUPYGO] paypal-checkout.js — ready');
})();
