/* ==========================================================================
 * ARCHIVED — 18/10/2026
 * Ancienne version du script « Mot de passe oublié ».
 * Remplacée par js/forgot-password.js (version active, avec Turnstile).
 * Conservée ici uniquement pour historique. Peut être supprimée plus tard.
 * ========================================================================== */

/* AUPYGO — « Mot de passe oublié » (v1.0)
 *
 * 1) Ajoute le lien « Mot de passe oublié ? » sous le champ mot de passe de l'écran Inscription / Connexion.
 * 2) Ouvre une fenêtre : l'utilisateur saisit son e-mail -> Supabase lui envoie un lien de réinitialisation.
 * 3) Au retour via le lien (type=recovery), affiche la fenêtre « Nouveau mot de passe ».
 *
 * Aucun secret ici : uniquement le client Supabase public déjà présent dans la page.
 * Prérequis côté Supabase : voir LISEZ-MOI (Redirect URLs + modèle d'e-mail « Reset Password »).
 */
(function () {
  'use strict';
  if (window.__aupygoForgotPwd) return;
  window.__aupygoForgotPwd = true; // neutralise l'ancienne fenêtre de admin-create-staff.js

  var MIN_LEN = 8; // identique à l'inscription (toast.password_too_short)
  var COOLDOWN_S = 60;

  var T = {
    fr: {
      link: 'Mot de passe oublié ?',
      title: 'Mot de passe oublié',
      intro: 'Entre l’adresse e-mail de ton compte. Nous t’envoyons un lien pour créer un nouveau mot de passe.',
      email: 'Adresse email',
      send: 'Envoyer le lien',
      resend: 'Renvoyer dans ',
      cancel: 'Fermer',
      sent: '📧 Si un compte existe avec cette adresse, un e-mail vient d’être envoyé. Clique sur le lien reçu (valable environ 1 h). Pense à vérifier tes spams.',
      invalid: 'Entre une adresse e-mail valide.',
      rate: 'Trop de demandes. Réessaie dans quelques minutes.',
      neterr: 'Envoi impossible pour le moment. Réessaie plus tard.',
      newTitle: 'Nouveau mot de passe',
      newIntro: 'Choisis ton nouveau mot de passe AUPYGO.',
      pw1: 'Nouveau mot de passe',
      pw2: 'Confirmation',
      ph1: MIN_LEN + ' caractères minimum',
      ph2: 'Répète le mot de passe',
      save: 'Enregistrer',
      tooShort: 'Mot de passe : ' + MIN_LEN + ' caractères minimum.',
      mismatch: 'Les deux mots de passe sont différents.',
      saved: 'Mot de passe modifié. Tu es connecté(e).',
      expired: 'Ce lien a expiré ou a déjà été utilisé. Demande-en un nouveau via « Mot de passe oublié ? ».',
      noSession: 'Session de réinitialisation introuvable. Demande un nouveau lien.'
    },
    en: {
      link: 'Forgot your password?',
      title: 'Forgot password',
      intro: 'Enter your account email. We will send you a link to create a new password.',
      email: 'Email address',
      send: 'Send the link',
      resend: 'Resend in ',
      cancel: 'Close',
      sent: '📧 If an account exists for this address, an email has just been sent. Click the link (valid for about 1 hour). Check your spam folder too.',
      invalid: 'Enter a valid email address.',
      rate: 'Too many requests. Please try again in a few minutes.',
      neterr: 'Could not send right now. Please try again later.',
      newTitle: 'New password',
      newIntro: 'Choose your new AUPYGO password.',
      pw1: 'New password',
      pw2: 'Confirmation',
      ph1: MIN_LEN + ' characters minimum',
      ph2: 'Repeat the password',
      save: 'Save',
      tooShort: 'Password: ' + MIN_LEN + ' characters minimum.',
      mismatch: 'The two passwords do not match.',
      saved: 'Password updated. You are logged in.',
      expired: 'This link has expired or was already used. Request a new one with “Forgot your password?”.',
      noSession: 'Reset session not found. Please request a new link.'
    },
    es: {
      link: '¿Olvidaste tu contraseña?',
      title: 'Contraseña olvidada',
      intro: 'Introduce el correo de tu cuenta. Te enviamos un enlace para crear una nueva contraseña.',
      email: 'Correo electrónico',
      send: 'Enviar el enlace',
      resend: 'Reenviar en ',
      cancel: 'Cerrar',
      sent: '📧 Si existe una cuenta con este correo, acabamos de enviar un mensaje. Haz clic en el enlace (válido aprox. 1 h). Revisa también el spam.',
      invalid: 'Introduce un correo válido.',
      rate: 'Demasiadas solicitudes. Inténtalo de nuevo en unos minutos.',
      neterr: 'No se puede enviar ahora. Inténtalo más tarde.',
      newTitle: 'Nueva contraseña',
      newIntro: 'Elige tu nueva contraseña de AUPYGO.',
      pw1: 'Nueva contraseña',
      pw2: 'Confirmación',
      ph1: 'Mínimo ' + MIN_LEN + ' caracteres',
      ph2: 'Repite la contraseña',
      save: 'Guardar',
      tooShort: 'Contraseña: mínimo ' + MIN_LEN + ' caracteres.',
      mismatch: 'Las dos contraseñas no coinciden.',
      saved: 'Contraseña modificada. Has iniciado sesión.',
      expired: 'Este enlace ha caducado o ya se usó. Solicita uno nuevo con «¿Olvidaste tu contraseña?».',
      noSession: 'Sesión de restablecimiento no encontrada. Solicita un nuevo enlace.'
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
    else window.alert(msg);
  }
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  /* ---------- styles (clair + sombre) ---------- */
  function injectStyle() {
    if (document.getElementById('aupygoFpStyle')) return;
    var s = document.createElement('style');
    s.id = 'aupygoFpStyle';
    s.textContent =
      '.aupygo-fp-link{display:block;margin:6px 0 12px;padding:0;background:none;border:0;font:inherit;font-size:13px;' +
      'font-weight:600;color:var(--primary,#7c3aed);text-align:right;cursor:pointer;text-decoration:underline;width:100%}' +
      '.aupygo-fp-link:hover{color:var(--primary-dark,#5b21b6)}' +
      '.aupygo-fp-ov{position:fixed;inset:0;z-index:100001;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px}' +
      '.aupygo-fp-card{background:var(--card,#fff);color:var(--text,#292638);border:1px solid var(--border,#e8e4ef);border-radius:16px;' +
      'padding:22px;width:100%;max-width:400px;max-height:90vh;overflow:auto;font-family:inherit;box-shadow:0 20px 50px rgba(0,0,0,.25)}' +
      '.aupygo-fp-card h3{margin:0 0 6px;font-size:19px}' +
      '.aupygo-fp-card p{margin:0 0 14px;font-size:14px;line-height:1.45;color:var(--muted,#777386)}' +
      '.aupygo-fp-card label{display:block;font-size:13px;font-weight:600;margin-bottom:4px}' +
      '.aupygo-fp-card input{width:100%;box-sizing:border-box;padding:11px 12px;margin:0 0 12px;border:1px solid var(--border,#d6d0e3);' +
      'border-radius:10px;font-size:16px;background:var(--bg,#fff);color:var(--text,#292638)}' +
      '.aupygo-fp-card input:focus{outline:2px solid var(--primary,#7c3aed);outline-offset:1px}' +
      '.aupygo-fp-msg{font-size:13px;line-height:1.45;min-height:18px;margin:0 0 10px;color:#b91c1c}' +
      '.aupygo-fp-msg.ok{color:#15803d}' +
      '.aupygo-fp-row{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}' +
      '.aupygo-fp-btn{padding:10px 16px;border:0;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer}' +
      '.aupygo-fp-btn.main{background:var(--primary,#7c3aed);color:#fff}' +
      '.aupygo-fp-btn.main:disabled{opacity:.55;cursor:not-allowed}' +
      '.aupygo-fp-btn.ghost{background:transparent;color:var(--muted,#777386);border:1px solid var(--border,#d6d0e3)}' +
      '[data-theme="dark"] .aupygo-fp-card{background:var(--card,#1e1b2a);color:var(--text,#ece9f5);border-color:var(--border,#34304a)}' +
      '[data-theme="dark"] .aupygo-fp-card p{color:var(--muted,#a9a3bd)}' +
      '[data-theme="dark"] .aupygo-fp-card input{background:var(--bg,#14121b);color:var(--text,#ece9f5);border-color:var(--border,#34304a)}' +
      '[data-theme="dark"] .aupygo-fp-msg{color:#fca5a5}' +
      '[data-theme="dark"] .aupygo-fp-msg.ok{color:#86efac}' +
      '[data-theme="dark"] .aupygo-fp-link{color:var(--primary,#a78bfa)}';
    document.head.appendChild(s);
  }

  function closeModal(id) {
    var m = document.getElementById(id);
    if (m) m.remove();
  }

  function validEmail(v) { return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(v); }

  /* ---------- 1) fenêtre « e-mail » ---------- */
  var cooldownUntil = 0;
  var cooldownTimer = null;

  function openRequestModal(prefill) {
    injectStyle();
    closeModal('aupygoFpModal');
    var t = tr();
    var email = el('input', { type: 'email', id: 'aupygoFpEmail', autocomplete: 'email', inputmode: 'email', placeholder: 'nom@exemple.com' });
    email.value = prefill || '';
    var msg = el('div', { class: 'aupygo-fp-msg', role: 'status', 'aria-live': 'polite' });
    var send = el('button', { type: 'button', class: 'aupygo-fp-btn main', text: t.send });
    var close = el('button', { type: 'button', class: 'aupygo-fp-btn ghost', text: t.cancel });
    var ov = el('div', { id: 'aupygoFpModal', class: 'aupygo-fp-ov' }, [
      el('div', { class: 'aupygo-fp-card', role: 'dialog', 'aria-modal': 'true' }, [
        el('h3', { text: t.title }),
        el('p', { text: t.intro }),
        el('label', { for: 'aupygoFpEmail', text: t.email }),
        email,
        msg,
        el('div', { class: 'aupygo-fp-row' }, [close, send])
      ])
    ]);

    function tick() {
      var left = Math.ceil((cooldownUntil - Date.now()) / 1000);
      if (left > 0) {
        send.disabled = true;
        send.textContent = t.resend + left + ' s';
      } else {
        send.disabled = false;
        send.textContent = t.send;
        if (cooldownTimer) { clearInterval(cooldownTimer); cooldownTimer = null; }
      }
    }
    function startCooldown() {
      cooldownUntil = Date.now() + COOLDOWN_S * 1000;
      tick();
      if (cooldownTimer) clearInterval(cooldownTimer);
      cooldownTimer = setInterval(function () {
        if (!document.getElementById('aupygoFpModal')) { clearInterval(cooldownTimer); cooldownTimer = null; return; }
        tick();
      }, 1000);
    }

    async function submit() {
      msg.className = 'aupygo-fp-msg';
      msg.textContent = '';
      var v = email.value.trim().toLowerCase();
      if (!validEmail(v)) { msg.textContent = t.invalid; email.focus(); return; }
      var c = getClient();
      if (!c) { msg.textContent = t.neterr; return; }
      send.disabled = true;
      try {
        // Redirige vers l'accueil du site : le lien contient #...type=recovery
        var redirectTo = location.origin + location.pathname.replace(/index[^/]*\\.html$/i, '');
        var res = await c.auth.resetPasswordForEmail(v, { redirectTo: redirectTo });
        if (res && res.error) {
          var m = String(res.error.message || '').toLowerCase();
          if (res.error.status === 429 || m.indexOf('rate') !== -1 || m.indexOf('seconds') !== -1) {
            msg.textContent = t.rate;
            send.disabled = false;
          } else {
            console.warn('[forgot-password]', res.error.message);
            // message neutre : on ne révèle pas si l'adresse existe
            msg.className = 'aupygo-fp-msg ok';
            msg.textContent = t.sent;
            startCooldown();
          }
          return;
        }
        msg.className = 'aupygo-fp-msg ok';
        msg.textContent = t.sent;
        startCooldown();
      } catch (e) {
        console.warn('[forgot-password]', e);
        msg.textContent = t.neterr;
        send.disabled = false;
      }
    }

    send.addEventListener('click', submit);
    close.addEventListener('click', function () { closeModal('aupygoFpModal'); });
    ov.addEventListener('click', function (ev) { if (ev.target === ov) closeModal('aupygoFpModal'); });
    email.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); if (!send.disabled) submit(); } });
    document.body.appendChild(ov);
    if (cooldownUntil > Date.now()) { tick(); cooldownTimer = setInterval(tick, 1000); }
    email.focus();
  }

  /* ---------- 2) lien dans l'écran Inscription / Connexion ---------- */
  function injectLink() {
    var marker = document.querySelector('[data-i18n="plans.btn_login"]');
    if (!marker) return;
    var btn = marker.closest('button') || marker;
    // le lien se place après le champ mot de passe du même formulaire
    var scope = btn.parentNode, pw = null;
    for (var i = 0; i < 6 && scope && !pw; i++) {
      pw = scope.querySelector('input[type="password"]');
      if (!pw) scope = scope.parentNode;
    }
    var existing = scope && scope.querySelector('.aupygo-fp-link');
    if (existing) return;
    injectStyle();
    var a = el('button', { type: 'button', class: 'aupygo-fp-link', 'data-fp': '1', text: tr().link });
    a.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var emailInput = scope ? scope.querySelector('input[type="email"]') : null;
      openRequestModal(emailInput ? emailInput.value.trim() : '');
    });
    if (pw) pw.parentNode.insertBefore(a, pw.nextSibling);
    else btn.parentNode.insertBefore(a, btn);
  }
  function refreshLinkLabel() {
    var t = tr().link;
    var all = document.querySelectorAll('.aupygo-fp-link');
    for (var i = 0; i < all.length; i++) if (all[i].textContent !== t) all[i].textContent = t;
  }

  /* ---------- 3) fenêtre « nouveau mot de passe » (retour du lien e-mail) ---------- */
  var recoveryShown = false;
  var hashRaw = (location.hash || '') + '&' + (location.search || '');
  var isRecoveryLink = /type=recovery/.test(hashRaw);
  var hasLinkError = /error(_code)?=/.test(hashRaw) && /(otp_expired|access_denied)/.test(hashRaw);

  function cleanUrl() {
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
  }

  function openNewPasswordModal() {
    if (recoveryShown) return;
    recoveryShown = true;
    injectStyle();
    var t = tr();
    var p1 = el('input', { type: 'password', id: 'aupygoFpP1', autocomplete: 'new-password', placeholder: t.ph1 });
    var p2 = el('input', { type: 'password', id: 'aupygoFpP2', autocomplete: 'new-password', placeholder: t.ph2 });
    var msg = el('div', { class: 'aupygo-fp-msg', role: 'status', 'aria-live': 'polite' });
    var save = el('button', { type: 'button', class: 'aupygo-fp-btn main', text: t.save });
    var ov = el('div', { id: 'aupygoFpNewModal', class: 'aupygo-fp-ov' }, [
      el('div', { class: 'aupygo-fp-card', role: 'dialog', 'aria-modal': 'true' }, [
        el('h3', { text: t.newTitle }),
        el('p', { text: t.newIntro }),
        el('label', { for: 'aupygoFpP1', text: t.pw1 }), p1,
        el('label', { for: 'aupygoFpP2', text: t.pw2 }), p2,
        msg,
        el('div', { class: 'aupygo-fp-row' }, [save])
      ])
    ]);
    async function submit() {
      msg.className = 'aupygo-fp-msg';
      msg.textContent = '';
      if (p1.value.length < MIN_LEN) { msg.textContent = t.tooShort; return; }
      if (p1.value !== p2.value) { msg.textContent = t.mismatch; return; }
      var c = getClient();
      if (!c) { msg.textContent = t.neterr; return; }
      save.disabled = true;
      try {
        var s = await c.auth.getSession();
        if (!s || !s.data || !s.data.session) { msg.textContent = t.noSession; save.disabled = false; return; }
        var res = await c.auth.updateUser({ password: p1.value });
        if (res && res.error) { msg.textContent = res.error.message; save.disabled = false; return; }
        ov.remove();
        cleanUrl();
        toast(t.saved, 'success');
        // atterrissage sur l'accueil après connexion
        if (typeof window.showPage === 'function') { try { window.showPage('home'); } catch (e) {} }
      } catch (e) {
        msg.textContent = (e && e.message) || t.neterr;
        save.disabled = false;
      }
    }
    save.addEventListener('click', submit);
    p2.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); submit(); } });
    p1.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); p2.focus(); } });
    document.body.appendChild(ov);
    p1.focus();
  }

  /* ---------- démarrage ---------- */
  var subscribed = false;
  var tries = 0;
  function boot() {
    tries++;
    var c = getClient();
    if (c && !subscribed) {
      subscribed = true;
      c.auth.onAuthStateChange(function (event) {
        if (event === 'PASSWORD_RECOVERY') openNewPasswordModal();
      });
    }
    if (isRecoveryLink && c && !recoveryShown) {
      c.auth.getSession().then(function (r) {
        if (r && r.data && r.data.session) openNewPasswordModal();
      });
    }
    if (hasLinkError && !recoveryShown) {
      hasLinkError = false;
      cleanUrl();
      toast(tr().expired, 'error');
    }
    if (tries > 60 && (recoveryShown || !isRecoveryLink)) clearInterval(timer);
  }
  var timer = setInterval(boot, 500);
  boot();

  // lien « Mot de passe oublié ? » : l'écran est (re)construit dynamiquement
  injectLink();
  setInterval(function () { injectLink(); refreshLinkLabel(); }, 1000);
  try {
    new MutationObserver(function () { injectLink(); }).observe(document.body, { childList: true, subtree: true });
  } catch (e) {}

  console.log('[AUPYGO] forgot-password.js v1.0 (ARCHIVED)');
})();
