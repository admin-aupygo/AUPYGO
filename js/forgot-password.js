/* ==========================================================================
 * AUPYGO — forgot-password.js
 * 1) Lien « Mot de passe oublié ? » sous le formulaire de connexion
 * 2) Envoi d’un lien de réinitialisation à l’e-mail saisi (Supabase Auth)
 * 3) À l’arrivée via le lien e-mail (type=recovery) : formulaire nouveau MDP
 *
 * Prérequis Supabase Dashboard → Authentication → URL Configuration :
 *   Site URL = https://aupygo.com
 *   Redirect URLs = https://aupygo.com/**  (et localhost si besoin)
 * Template e-mail « Reset password » activé (par défaut).
 *
 * IMPORTANT CAPTCHA :
 * Si « Enable CAPTCHA protection » est activé dans Supabase (Bot and Abuse
 * Protection), resetPasswordForEmail EXIGE un captchaToken.
 * → Soit désactiver le CAPTCHA dans le dashboard Supabase,
 * → Soit intégrer Cloudflare Turnstile / hCaptcha et passer le token.
 * ========================================================================== */
(function () {
  'use strict';

  var T = {
    fr: {
      link: 'Mot de passe oublié ?',
      title: 'Réinitialiser le mot de passe',
      emailLabel: 'Adresse e-mail de ton compte',
      send: 'Envoyer le lien',
      cancel: 'Annuler',
      sent: 'Si un compte existe avec cet e-mail, un lien de réinitialisation vient d’être envoyé. Vérifie aussi tes spams.',
      needEmail: 'Indique ton adresse e-mail.',
      invalidEmail: 'Adresse e-mail invalide.',
      newTitle: 'Choisis un nouveau mot de passe',
      newLabel: 'Nouveau mot de passe (8 caractères min.)',
      confirmLabel: 'Confirmer le mot de passe',
      save: 'Enregistrer',
      mismatch: 'Les deux mots de passe ne correspondent pas.',
      tooShort: 'Le mot de passe doit faire au moins 8 caractères.',
      saved: 'Mot de passe mis à jour. Tu es connecté(e).',
      error: 'Une erreur est survenue. Réessaie.',
      rate: 'Trop de demandes. Attends une minute et réessaie.',
      captcha: 'Protection anti-bot active : le CAPTCHA n’est pas configuré côté site. Désactive-le temporairement dans Supabase (Authentication → Bot and Abuse Protection) ou intègre Turnstile.'
    },
    en: {
      link: 'Forgot password?',
      title: 'Reset your password',
      emailLabel: 'Account email address',
      send: 'Send reset link',
      cancel: 'Cancel',
      sent: 'If an account exists for this email, a reset link has been sent. Check your spam folder too.',
      needEmail: 'Please enter your email.',
      invalidEmail: 'Invalid email address.',
      newTitle: 'Choose a new password',
      newLabel: 'New password (min. 8 characters)',
      confirmLabel: 'Confirm password',
      save: 'Save',
      mismatch: 'Passwords do not match.',
      tooShort: 'Password must be at least 8 characters.',
      saved: 'Password updated. You are signed in.',
      error: 'Something went wrong. Please try again.',
      rate: 'Too many requests. Wait a minute and try again.',
      captcha: 'Bot protection is on but CAPTCHA is not set up on the site. Temporarily disable it in Supabase (Authentication → Bot and Abuse Protection) or add Turnstile.'
    },
    es: {
      link: '¿Olvidaste tu contraseña?',
      title: 'Restablecer la contraseña',
      emailLabel: 'Correo de tu cuenta',
      send: 'Enviar enlace',
      cancel: 'Cancelar',
      sent: 'Si existe una cuenta con este correo, se ha enviado un enlace. Revisa también el spam.',
      needEmail: 'Indica tu correo electrónico.',
      invalidEmail: 'Correo no válido.',
      newTitle: 'Elige una nueva contraseña',
      newLabel: 'Nueva contraseña (mín. 8 caracteres)',
      confirmLabel: 'Confirmar contraseña',
      save: 'Guardar',
      mismatch: 'Las contraseñas no coinciden.',
      tooShort: 'La contraseña debe tener al menos 8 caracteres.',
      saved: 'Contraseña actualizada. Has iniciado sesión.',
      error: 'Ha ocurrido un error. Inténtalo de nuevo.',
      rate: 'Demasiadas solicitudes. Espera un minuto e inténtalo de nuevo.',
      captcha: 'Protección anti-bot activa pero CAPTCHA no configurado en el sitio. Desactívalo temporalmente en Supabase o integra Turnstile.'
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
      if (c && c.auth && typeof c.auth.resetPasswordForEmail === 'function') return c;
    }
    return null;
  }

  function toast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type || 'info');
    else alert(msg);
  }

  /* ---------- styles ---------- */
  var css = '' +
    '#aupygo-forgot-link{display:block;margin:10px 0 0;font-size:13px;text-align:right;background:none;border:0;color:var(--primary,#6d4aff);cursor:pointer;text-decoration:underline;padding:0;font:inherit}' +
    '#aupygo-forgot-box{margin-top:12px;padding:14px;border:1px solid rgba(128,128,128,.25);border-radius:12px;background:rgba(109,74,255,.06)}' +
    '#aupygo-forgot-box label{display:block;font-size:13px;font-weight:600;margin:0 0 6px}' +
    '#aupygo-forgot-box input{width:100%;padding:10px 12px;border-radius:8px;border:1px solid rgba(128,128,128,.35);background:inherit;color:inherit;font:inherit;box-sizing:border-box}' +
    '#aupygo-forgot-box .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}' +
    '#aupygo-forgot-box .row button{flex:1 1 auto;border:0;border-radius:10px;padding:10px 14px;font:inherit;font-weight:600;cursor:pointer}' +
    '#aupygo-forgot-box .ok{background:#6d4aff;color:#fff}' +
    '#aupygo-forgot-box .ok[disabled]{opacity:.5;cursor:not-allowed}' +
    '#aupygo-forgot-box .no{background:transparent;color:inherit;border:1px solid rgba(128,128,128,.4)}' +
    '#aupygo-reset-modal{position:fixed;inset:0;z-index:100001;background:rgba(10,10,20,.62);display:flex;align-items:center;justify-content:center;padding:16px}' +
    '#aupygo-reset-modal .box{background:#fff;color:#1f2430;border-radius:16px;max-width:420px;width:100%;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.4)}' +
    'html[data-theme=\"dark\"] #aupygo-reset-modal .box{background:#1c1b25;color:#e9e8f0}' +
    '#aupygo-reset-modal h3{margin:0 0 10px;font-size:18px}' +
    '#aupygo-reset-modal label{display:block;font-size:13px;font-weight:600;margin:12px 0 6px}' +
    '#aupygo-reset-modal input{width:100%;padding:10px 12px;border-radius:8px;border:1px solid rgba(128,128,128,.35);background:inherit;color:inherit;font:inherit;box-sizing:border-box}' +
    '#aupygo-reset-modal .row{display:flex;gap:8px;margin-top:16px}' +
    '#aupygo-reset-modal button{flex:1;border:0;border-radius:10px;padding:11px 14px;font:inherit;font-weight:600;cursor:pointer;background:#6d4aff;color:#fff}' +
    '#aupygo-reset-modal button[disabled]{opacity:.5;cursor:not-allowed}';
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  /* ---------- UI sous le formulaire de connexion ---------- */
  function injectForgotUI() {
    var loginForm = document.getElementById('loginForm');
    if (!loginForm || document.getElementById('aupygo-forgot-link')) return;

    var t = tr();
    var link = document.createElement('button');
    link.type = 'button';
    link.id = 'aupygo-forgot-link';
    link.textContent = t.link;
    link.addEventListener('click', function (ev) {
      ev.preventDefault();
      toggleForgotBox(true);
    });

    // Après le bouton « Se connecter »
    var btn = loginForm.querySelector('button.btn, button[onclick*=\"handleLogin\"]');
    if (btn && btn.parentNode) {
      btn.parentNode.insertBefore(link, btn.nextSibling);
    } else {
      loginForm.appendChild(link);
    }

    var box = document.createElement('div');
    box.id = 'aupygo-forgot-box';
    box.hidden = true;
    box.innerHTML =
      '<label for=\"aupygoForgotEmail\">' + t.emailLabel + '</label>' +
      '<input id=\"aupygoForgotEmail\" type=\"email\" autocomplete=\"email\" placeholder=\"toi@email.com\">' +
      '<div class=\"row\">' +
      '<button type=\"button\" class=\"no\" id=\"aupygoForgotCancel\">' + t.cancel + '</button>' +
      '<button type=\"button\" class=\"ok\" id=\"aupygoForgotSend\">' + t.send + '</button>' +
      '</div>';
    loginForm.appendChild(box);

    box.querySelector('#aupygoForgotCancel').addEventListener('click', function () {
      toggleForgotBox(false);
    });
    box.querySelector('#aupygoForgotSend').addEventListener('click', sendResetEmail);

    // Préremplir avec l’e-mail du formulaire de connexion
    var loginEmail = document.getElementById('loginEmail');
    if (loginEmail) {
      loginEmail.addEventListener('change', function () {
        var fe = document.getElementById('aupygoForgotEmail');
        if (fe && !fe.value) fe.value = loginEmail.value;
      });
    }
  }

  function toggleForgotBox(show) {
    var box = document.getElementById('aupygo-forgot-box');
    if (!box) return;
    box.hidden = !show;
    if (show) {
      var fe = document.getElementById('aupygoForgotEmail');
      var loginEmail = document.getElementById('loginEmail');
      if (fe && loginEmail && loginEmail.value && !fe.value) fe.value = loginEmail.value;
      if (fe) fe.focus();
    }
  }

  async function sendResetEmail() {
    var t = tr();
    var input = document.getElementById('aupygoForgotEmail');
    var btn = document.getElementById('aupygoForgotSend');
    var email = (input && input.value || '').trim().toLowerCase();

    if (!email) { toast(t.needEmail, 'error'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast(t.invalidEmail, 'error'); return; }

    var c = getClient();
    if (!c) { toast(t.error, 'error'); return; }

    btn.disabled = true;
    try {
      // URL propre : site root (le hash type=recovery est géré côté client)
      var redirectTo = window.location.origin + '/';

      // Si un token Turnstile/hCaptcha est disponible globalement, on le passe
      var opts = { redirectTo: redirectTo };
      if (window.__aupygoCaptchaToken) {
        opts.captchaToken = window.__aupygoCaptchaToken;
      }

      var res = await c.auth.resetPasswordForEmail(email, opts);
      if (res.error) {
        var msg = String(res.error.message || '');
        if (/rate|too many|429/i.test(msg)) {
          toast(t.rate, 'error');
        } else if (/captcha|no captcha_token|request disallowed/i.test(msg)) {
          toast(t.captcha, 'error');
          console.warn('[forgot-password] CAPTCHA requis par Supabase mais non fourni.', res.error);
        } else {
          toast(t.error + ' (' + msg + ')', 'error');
        }
      } else {
        // Message neutre (ne révèle pas si l’e-mail existe)
        toast(t.sent, 'success');
        toggleForgotBox(false);
      }
    } catch (e) {
      console.error('[forgot-password]', e);
      toast(t.error, 'error');
    }
    btn.disabled = false;
  }

  /* ---------- Formulaire nouveau MDP (lien e-mail) ---------- */
  function openNewPasswordModal() {
    if (document.getElementById('aupygo-reset-modal')) return;
    var t = tr();
    var m = document.createElement('div');
    m.id = 'aupygo-reset-modal';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.innerHTML =
      '<div class=\"box\">' +
      '<h3>' + t.newTitle + '</h3>' +
      '<label for=\"aupygoNewPwd\">' + t.newLabel + '</label>' +
      '<input id=\"aupygoNewPwd\" type=\"password\" autocomplete=\"new-password\" minlength=\"8\">' +
      '<label for=\"aupygoNewPwd2\">' + t.confirmLabel + '</label>' +
      '<input id=\"aupygoNewPwd2\" type=\"password\" autocomplete=\"new-password\" minlength=\"8\">' +
      '<div class=\"row\"><button type=\"button\" id=\"aupygoNewPwdSave\">' + t.save + '</button></div>' +
      '</div>';
    document.body.appendChild(m);
    document.getElementById('aupygoNewPwdSave').addEventListener('click', saveNewPassword);
    setTimeout(function () {
      var el = document.getElementById('aupygoNewPwd');
      if (el) el.focus();
    }, 100);
  }

  async function saveNewPassword() {
    var t = tr();
    var p1 = (document.getElementById('aupygoNewPwd') || {}).value || '';
    var p2 = (document.getElementById('aupygoNewPwd2') || {}).value || '';
    var btn = document.getElementById('aupygoNewPwdSave');

    if (p1.length < 8) { toast(t.tooShort, 'error'); return; }
    if (p1 !== p2) { toast(t.mismatch, 'error'); return; }

    var c = getClient();
    if (!c) { toast(t.error, 'error'); return; }

    btn.disabled = true;
    try {
      var res = await c.auth.updateUser({ password: p1 });
      if (res.error) {
        toast(t.error + ' (' + (res.error.message || '') + ')', 'error');
        btn.disabled = false;
        return;
      }
      toast(t.saved, 'success');
      var m = document.getElementById('aupygo-reset-modal');
      if (m) m.remove();
      // Nettoyer le hash de l’URL
      try {
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
      } catch (e) {}
      // Rafraîchir l’UI auth si disponible
      if (typeof window.refreshAuthUI === 'function') {
        try { window.refreshAuthUI(); } catch (e) {}
      }
    } catch (e) {
      console.error('[forgot-password] update', e);
      toast(t.error, 'error');
      btn.disabled = false;
    }
  }

  /* ---------- Détection du retour via le lien e-mail ---------- */
  function watchRecovery() {
    var c = getClient();
    if (!c) { setTimeout(watchRecovery, 600); return; }

    // 1) Événement Auth
    try {
      c.auth.onAuthStateChange(function (event, session) {
        if (event === 'PASSWORD_RECOVERY') {
          openNewPasswordModal();
        }
      });
    } catch (e) {
      console.warn('[forgot-password] onAuthStateChange', e);
    }

    // 2) Hash / query type=recovery (au cas où l’événement a déjà été consommé)
    try {
      var hash = String(window.location.hash || '');
      var search = String(window.location.search || '');
      if (/type=recovery/i.test(hash) || /type=recovery/i.test(search)) {
        // Laisser Supabase finaliser la session puis ouvrir le modal
        setTimeout(function () { openNewPasswordModal(); }, 800);
      }
    } catch (e) {}
  }

  /* ---------- init ---------- */
  function init() {
    injectForgotUI();
    watchRecovery();
    // Réinjecter si le DOM login est recréé
    var mo = new MutationObserver(function () { injectForgotUI(); });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // app.js peut charger après : on retente un peu
    setTimeout(init, 400);
    setTimeout(injectForgotUI, 1200);
    setTimeout(injectForgotUI, 3000);
  }
})();
