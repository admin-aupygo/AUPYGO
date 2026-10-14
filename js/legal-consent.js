/* ==========================================================================
 * AUPYGO — legal-consent.js
 * 1) Liens juridiques en pied de page (+ lien « Gérer / résilier mon abonnement »)
 * 2) Case à cocher obligatoire CGU/Confidentialité sur le bouton « Créer mon compte »
 * 3) Fenêtre d'acceptation bloquante après connexion si aucune acceptation de la
 *    version courante n'est enregistrée (nouveaux comptes, comptes existants, nouvelle version)
 * 4) Fenêtre de confirmation AVANT paiement : acceptation des CGV + demande d'exécution
 *    immédiate (art. L221-25 Code conso) → preuves enregistrées dans `legal_consents`
 *
 * À charger APRÈS stripe-checkout.js et stripe-select-plan.js (dernier de la liste).
 * Table requise : supabase/sql/06_legal.sql
 * ========================================================================== */
(function () {
  'use strict';

  /* Doit rester identique à `version` dans legal/legal-config.js */
  var VERSION = '1.0';
  var BASE = '/legal/';
  var PENDING_KEY = 'aupygo_legal_pending';

  var PLANS = {
    standard_monthly: { fr: 'STANDARD — 4,90 € / mois', renew: true },
    premium_monthly:  { fr: 'PREMIUM — 9,90 € / mois', renew: true },
    standard_6m:      { fr: 'STANDARD — Pass 6 mois : 24,90 € (paiement unique)', renew: false },
    premium_6m:       { fr: 'PREMIUM — Pass 6 mois : 51,60 € (paiement unique)', renew: false }
  };

  var T = {
    fr: {
      signup: 'J’ai 18 ans ou plus et j’accepte les <a href="' + BASE + 'cgu.html" target="_blank" rel="noopener">Conditions d’utilisation</a>, la <a href="' + BASE + 'confidentialite.html" target="_blank" rel="noopener">Politique de confidentialité</a> et la <a href="' + BASE + 'charte-communaute.html" target="_blank" rel="noopener">Charte de la communauté</a>.',
      needCheck: 'Merci de cocher la case d’acceptation pour continuer.',
      gateTitle: 'Nos règles et ta vie privée',
      gateText: 'Pour utiliser AUPYGO, merci de confirmer que tu as <strong>18 ans ou plus</strong> et que tu acceptes nos documents (version ' + VERSION + ').',
      gateAccept: 'Accepter et continuer',
      gateRefuse: 'Refuser et me déconnecter',
      payTitle: 'Confirmer ta commande',
      payRenewYes: 'Abonnement <strong>renouvelé automatiquement chaque mois</strong>, résiliable à tout moment en ligne (effet à la fin de la période payée).',
      payRenewNo: 'Paiement unique : <strong>aucun renouvellement automatique</strong>. Retour au forfait FREE après 6 mois.',
      chkA: 'J’ai lu et j’accepte les <a href="' + BASE + 'cgv.html" target="_blank" rel="noopener">Conditions générales de vente</a> et les <a href="' + BASE + 'cgu.html" target="_blank" rel="noopener">CGU</a>.',
      chkB: 'Je demande l’<strong>activation immédiate</strong> de mon forfait et je reconnais que, si je me rétracte dans les 14 jours, je devrai payer un montant proportionnel au service déjà fourni (<a href="' + BASE + 'cgv.html#retractation" target="_blank" rel="noopener">détails</a>).',
      payBtn: 'Commande avec obligation de paiement',
      cancel: 'Annuler',
      manage: 'Gérer / résilier mon abonnement',
      noSub: 'Aucun abonnement à gérer pour ce compte.',
      links: ['Mentions légales', 'CGU', 'CGV', 'Confidentialité', 'Charte & sécurité', 'FAQ', 'Rétractation']
    },
    en: {
      signup: 'I am 18 or older and I accept the <a href="' + BASE + 'cgu.html" target="_blank" rel="noopener">Terms of Use</a>, the <a href="' + BASE + 'confidentialite.html" target="_blank" rel="noopener">Privacy Policy</a> and the <a href="' + BASE + 'charte-communaute.html" target="_blank" rel="noopener">Community Charter</a> (documents in French).',
      needCheck: 'Please tick the box to continue.',
      gateTitle: 'Our rules and your privacy',
      gateText: 'To use AUPYGO, please confirm you are <strong>18 or older</strong> and accept our documents (version ' + VERSION + ', French language).',
      gateAccept: 'Accept and continue',
      gateRefuse: 'Decline and log out',
      payTitle: 'Confirm your order',
      payRenewYes: 'Subscription <strong>automatically renewed every month</strong>, cancellable online at any time (effective at the end of the paid period).',
      payRenewNo: 'One-time payment: <strong>no automatic renewal</strong>. Back to FREE after 6 months.',
      chkA: 'I have read and accept the <a href="' + BASE + 'cgv.html" target="_blank" rel="noopener">Terms of Sale</a> and the <a href="' + BASE + 'cgu.html" target="_blank" rel="noopener">Terms of Use</a> (French).',
      chkB: 'I request <strong>immediate activation</strong> of my plan and acknowledge that, if I withdraw within 14 days, I must pay a proportionate amount for the service already provided.',
      payBtn: 'Order with obligation to pay',
      cancel: 'Cancel',
      manage: 'Manage / cancel my subscription',
      noSub: 'No subscription to manage for this account.',
      links: ['Legal notice', 'Terms of Use', 'Terms of Sale', 'Privacy', 'Charter & safety', 'FAQ', 'Withdrawal']
    },
    es: {
      signup: 'Tengo 18 años o más y acepto las <a href="' + BASE + 'cgu.html" target="_blank" rel="noopener">Condiciones de uso</a>, la <a href="' + BASE + 'confidentialite.html" target="_blank" rel="noopener">Política de privacidad</a> y la <a href="' + BASE + 'charte-communaute.html" target="_blank" rel="noopener">Carta de la comunidad</a> (documentos en francés).',
      needCheck: 'Marca la casilla para continuar.',
      gateTitle: 'Nuestras normas y tu privacidad',
      gateText: 'Para usar AUPYGO, confirma que tienes <strong>18 años o más</strong> y que aceptas nuestros documentos (versión ' + VERSION + ', en francés).',
      gateAccept: 'Aceptar y continuar',
      gateRefuse: 'Rechazar y cerrar sesión',
      payTitle: 'Confirmar tu pedido',
      payRenewYes: 'Suscripción <strong>renovada automáticamente cada mes</strong>, cancelable en línea en cualquier momento (efecto al final del periodo pagado).',
      payRenewNo: 'Pago único: <strong>sin renovación automática</strong>. Vuelves a FREE tras 6 meses.',
      chkA: 'He leído y acepto las <a href="' + BASE + 'cgv.html" target="_blank" rel="noopener">Condiciones de venta</a> y las <a href="' + BASE + 'cgu.html" target="_blank" rel="noopener">Condiciones de uso</a> (en francés).',
      chkB: 'Solicito la <strong>activación inmediata</strong> de mi plan y reconozco que, si desisto en 14 días, deberé pagar un importe proporcional al servicio ya prestado.',
      payBtn: 'Pedido con obligación de pago',
      cancel: 'Cancelar',
      manage: 'Gestionar / cancelar mi suscripción',
      noSub: 'No hay suscripción que gestionar en esta cuenta.',
      links: ['Aviso legal', 'Condiciones de uso', 'Condiciones de venta', 'Privacidad', 'Carta y seguridad', 'FAQ', 'Desistimiento']
    }
  };

  function lang() {
    var l = 'fr';
    try {
      l = (window.currentLang || localStorage.getItem('aupygo_lang') || localStorage.getItem('lang') ||
           document.documentElement.lang || 'fr');
    } catch (e) {}
    l = String(l).slice(0, 2).toLowerCase();
    return T[l] ? l : 'fr';
  }
  function tr() { return T[lang()]; }

  function getClient() {
    var cands = [window.supabaseClient, window.supabase];
    try { if (typeof supabaseClient !== 'undefined') cands.push(supabaseClient); } catch (e) {}
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      if (c && typeof c.from === 'function' && c.auth) return c;
    }
    return null;
  }
  function toast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type || 'info');
    else alert(msg);
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  /* ---------------- styles ---------------- */
  var css = '' +
    '#aupygo-legal-links{max-width:960px;margin:24px auto 0;padding:14px 16px 96px;text-align:center;font-size:12.5px;line-height:1.9;opacity:.85}' +
    '#aupygo-legal-links a{color:inherit;text-decoration:underline;margin:0 7px;white-space:nowrap;cursor:pointer}' +
    '.aupygo-legal-ck{display:flex;gap:8px;align-items:flex-start;margin:10px 0;font-size:13px;line-height:1.45;text-align:left}' +
    '.aupygo-legal-ck input{margin-top:3px;flex:0 0 auto;width:18px;height:18px}' +
    '.aupygo-legal-ck.err{outline:2px solid #d9534f;border-radius:8px;padding:4px}' +
    '#aupygo-legal-modal{position:fixed;inset:0;z-index:100000;background:rgba(10,10,20,.62);display:flex;align-items:center;justify-content:center;padding:16px}' +
    '#aupygo-legal-modal .box{background:#fff;color:#1f2430;border-radius:16px;max-width:460px;width:100%;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.4);max-height:92vh;overflow:auto}' +
    'html[data-theme="dark"] #aupygo-legal-modal .box{background:#1c1b25;color:#e9e8f0}' +
    '#aupygo-legal-modal h3{margin:0 0 8px;font-size:19px}' +
    '#aupygo-legal-modal a{color:#6d4aff}' +
    'html[data-theme="dark"] #aupygo-legal-modal a{color:#a592ff}' +
    '#aupygo-legal-modal .sum{background:rgba(109,74,255,.10);border-radius:10px;padding:10px 12px;margin:10px 0;font-size:13.5px}' +
    '#aupygo-legal-modal .row{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}' +
    '#aupygo-legal-modal button{flex:1 1 auto;border:0;border-radius:10px;padding:11px 14px;font:inherit;font-weight:600;cursor:pointer}' +
    '#aupygo-legal-modal .ok{background:#6d4aff;color:#fff}' +
    '#aupygo-legal-modal .ok[disabled]{opacity:.5;cursor:not-allowed}' +
    '#aupygo-legal-modal .no{background:transparent;color:inherit;border:1px solid rgba(128,128,128,.5)}';
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  /* ---------------- 1) pied de page ---------------- */
  function renderFooter() {
    var old = document.getElementById('aupygo-legal-links');
    if (old) old.remove();
    var t = tr();
    var files = ['mentions-legales', 'cgu', 'cgv', 'confidentialite', 'charte-communaute', 'faq', 'retractation'];
    var box = document.createElement('div');
    box.id = 'aupygo-legal-links';
    var html = '';
    files.forEach(function (f, i) { html += '<a href="' + BASE + f + '.html" target="_blank" rel="noopener">' + t.links[i] + '</a>'; });
    html += '<br><a id="aupygo-manage-sub" style="display:none">' + t.manage + '</a>';
    box.innerHTML = html;
    document.body.appendChild(box);
    box.querySelector('#aupygo-manage-sub').addEventListener('click', openBillingPortal);
    refreshManageLink();
  }
  async function refreshManageLink() {
    var a = document.getElementById('aupygo-manage-sub');
    if (!a) return;
    var c = getClient();
    try {
      var r = c && await c.auth.getSession();
      a.style.display = (r && r.data && r.data.session) ? '' : 'none';
    } catch (e) {}
  }

  /* ---------------- portail Stripe (résiliation en ligne) ---------------- */
  async function openBillingPortal() {
    var c = getClient();
    if (!c) return;
    try {
      var s = await c.auth.getSession();
      var token = s && s.data && s.data.session && s.data.session.access_token;
      if (!token) { toast('Connecte-toi d’abord.', 'error'); return; }
      var base = (typeof SUPABASE_URL === 'string' ? SUPABASE_URL : '').replace(/\/$/, '') + '/functions/v1';
      var res = await fetch(base + '/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, apikey: (typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : '') },
        body: '{}'
      });
      var data = await res.json().catch(function () { return {}; });
      if (data && data.url) { window.location.href = data.url; return; }
      toast(data && data.error === 'no_customer' ? tr().noSub : 'Impossible d’ouvrir la gestion d’abonnement. Écris-nous pour résilier.', 'error');
    } catch (e) {
      console.error('[legal] portal', e);
      toast('Erreur réseau. Réessaie.', 'error');
    }
  }
  window.openBillingPortal = openBillingPortal;

  /* ---------------- enregistrement des preuves ---------------- */
  async function record(userId, rows) {
    var c = getClient();
    if (!c || !userId) return false;
    var payload = rows.map(function (r) {
      return { user_id: userId, doc: r.doc, version: VERSION, context: r.context || null, user_agent: (navigator.userAgent || '').slice(0, 250) };
    });
    try {
      var res = await c.from('legal_consents').insert(payload);
      if (res.error) { console.warn('[legal] consent insert', res.error.message); return false; }
      return true;
    } catch (e) { console.warn('[legal] consent insert', e); return false; }
  }

  /* ---------------- 2) case à cocher à l'inscription ---------------- */
  var signupChk = null;
  function injectSignupCheckbox() {
    var marker = document.querySelector('[data-i18n="plans.btn_create_account"]');
    if (!marker) return;
    var btn = marker.closest('button') || marker;
    if (btn.getAttribute('data-legal-guard') === '1' && document.getElementById('aupygoSignupLegal')) return;
    btn.setAttribute('data-legal-guard', '1');
    var wrap = document.createElement('label');
    wrap.className = 'aupygo-legal-ck';
    wrap.id = 'aupygoSignupLegalWrap';
    wrap.innerHTML = '<input type="checkbox" id="aupygoSignupLegal"><span>' + tr().signup + '</span>';
    btn.parentNode.insertBefore(wrap, btn);
    signupChk = wrap.querySelector('input');
    signupChk.addEventListener('change', function () {
      wrap.classList.remove('err');
      if (signupChk.checked) lsSet(PENDING_KEY, JSON.stringify({ v: VERSION, ts: new Date().toISOString() }));
      else lsDel(PENDING_KEY);
    });
  }
  function signupBlocked() {
    var chk = document.getElementById('aupygoSignupLegal');
    if (chk && !chk.checked) {
      var w = document.getElementById('aupygoSignupLegalWrap');
      if (w) w.classList.add('err');
      toast(tr().needCheck, 'error');
      return true;
    }
    return false;
  }
  document.addEventListener('click', function (ev) {
    var btn = document.querySelector('[data-legal-guard="1"]');
    if (btn && ev.target && btn.contains(ev.target) && signupBlocked()) {
      ev.preventDefault(); ev.stopImmediatePropagation();
    }
  }, true);
  document.addEventListener('submit', function (ev) {
    var btn = document.querySelector('[data-legal-guard="1"]');
    if (btn && ev.target && ev.target.contains && ev.target.contains(btn) && signupBlocked()) {
      ev.preventDefault(); ev.stopImmediatePropagation();
    }
  }, true);

  /* ---------------- modale générique ---------------- */
  function openModal(html) {
    closeModal();
    var m = document.createElement('div');
    m.id = 'aupygo-legal-modal';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.innerHTML = '<div class="box">' + html + '</div>';
    document.body.appendChild(m);
    return m;
  }
  function closeModal() {
    var m = document.getElementById('aupygo-legal-modal');
    if (m) m.remove();
  }

  /* ---------------- 3) fenêtre d'acceptation après connexion ---------------- */
  var checkedUsers = {};
  var gateRunning = false;
  var DOCS = ['cgu', 'confidentialite', 'charte-communaute'];

  async function ensureConsent(user) {
    if (!user || !user.id || checkedUsers[user.id] || gateRunning) return;
    var c = getClient();
    if (!c) return;
    gateRunning = true;
    try {
      var q = await c.from('legal_consents').select('id').eq('user_id', user.id).eq('doc', 'cgu').eq('version', VERSION).limit(1);
      if (q.error) { console.warn('[legal] consent check', q.error.message); checkedUsers[user.id] = true; return; }
      if (q.data && q.data.length) { checkedUsers[user.id] = true; return; }

      var pending = null;
      try { pending = JSON.parse(lsGet(PENDING_KEY) || 'null'); } catch (e) {}
      var fresh = pending && pending.ts && (Date.now() - Date.parse(pending.ts)) < 48 * 3600 * 1000;
      if (pending && pending.v === VERSION && fresh) {
        var ok = await record(user.id, DOCS.map(function (d) { return { doc: d, context: 'signup_checkbox ' + (pending.ts || '') }; }));
        if (ok) { lsDel(PENDING_KEY); checkedUsers[user.id] = true; return; }
      }

      var t = tr();
      var m = openModal(
        '<h3>' + t.gateTitle + '</h3><p>' + t.gateText + '</p>' +
        '<label class="aupygo-legal-ck"><input type="checkbox" id="aupygoGateChk"><span>' + t.signup + '</span></label>' +
        '<div class="row"><button class="no" id="aupygoGateNo" type="button">' + t.gateRefuse + '</button>' +
        '<button class="ok" id="aupygoGateOk" type="button" disabled>' + t.gateAccept + '</button></div>');
      var chk = m.querySelector('#aupygoGateChk'), okb = m.querySelector('#aupygoGateOk');
      chk.addEventListener('change', function () { okb.disabled = !chk.checked; });
      m.querySelector('#aupygoGateNo').addEventListener('click', async function () {
        closeModal();
        try { await c.auth.signOut(); } catch (e) {}
        window.location.reload();
      });
      okb.addEventListener('click', async function () {
        okb.disabled = true;
        var ok2 = await record(user.id, DOCS.map(function (d) { return { doc: d, context: 'login_gate' }; }));
        if (!ok2) toast('Enregistrement impossible, réessaie.', 'error');
        else { checkedUsers[user.id] = true; closeModal(); }
        okb.disabled = false;
      });
    } finally { gateRunning = false; }
  }

  function watchAuth() {
    var c = getClient();
    if (!c) { setTimeout(watchAuth, 800); return; }
    try {
      c.auth.onAuthStateChange(function (evt, session) {
        refreshManageLink();
        if (session && session.user) setTimeout(function () { ensureConsent(session.user); }, 600);
      });
      c.auth.getSession().then(function (r) {
        var s = r && r.data && r.data.session;
        if (s && s.user) setTimeout(function () { ensureConsent(s.user); }, 600);
      });
    } catch (e) { console.warn('[legal] watchAuth', e); }
  }

  /* ---------------- 4) confirmation avant paiement ---------------- */
  function confirmCheckout(priceKey) {
    return new Promise(function (resolve) {
      var p = PLANS[priceKey];
      var t = tr();
      if (!p) { resolve(true); return; }
      var m = openModal(
        '<h3>' + t.payTitle + '</h3>' +
        '<div class="sum"><strong>' + p.fr + '</strong><br>' + (p.renew ? t.payRenewYes : t.payRenewNo) + '</div>' +
        '<label class="aupygo-legal-ck"><input type="checkbox" id="aupygoPayA"><span>' + t.chkA + '</span></label>' +
        '<label class="aupygo-legal-ck"><input type="checkbox" id="aupygoPayB"><span>' + t.chkB + '</span></label>' +
        '<div class="row"><button class="no" id="aupygoPayNo" type="button">' + t.cancel + '</button>' +
        '<button class="ok" id="aupygoPayOk" type="button" disabled>' + t.payBtn + '</button></div>');
      var a = m.querySelector('#aupygoPayA'), b = m.querySelector('#aupygoPayB'), ok = m.querySelector('#aupygoPayOk');
      function sync() { ok.disabled = !(a.checked && b.checked); }
      a.addEventListener('change', sync); b.addEventListener('change', sync);
      m.querySelector('#aupygoPayNo').addEventListener('click', function () { closeModal(); resolve(false); });
      ok.addEventListener('click', async function () {
        ok.disabled = true;
        var c = getClient(), uid = null;
        try { var s = await c.auth.getSession(); uid = s.data.session.user.id; } catch (e) {}
        await record(uid, [
          { doc: 'cgv', context: 'checkout ' + priceKey },
          { doc: 'immediate_execution', context: 'checkout ' + priceKey }
        ]);
        closeModal();
        resolve(true);
      });
    });
  }

  function wrapCheckout() {
    if (typeof window.startCheckout !== 'function' || window.startCheckout.__legal) return;
    var orig = window.startCheckout;
    var wrapped = function (priceKey) {
      return confirmCheckout(priceKey).then(function (okay) {
        if (okay) return orig.call(window, priceKey);
      });
    };
    wrapped.__legal = true;
    window.startCheckout = wrapped;
  }

  /* ---------------- init ---------------- */
  function init() {
    renderFooter();
    injectSignupCheckbox();
    wrapCheckout();
    watchAuth();
    var mo = new MutationObserver(function () { injectSignupCheckbox(); wrapCheckout(); });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(wrapCheckout, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
