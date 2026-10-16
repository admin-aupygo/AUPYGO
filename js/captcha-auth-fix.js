/* ==========================================================================
 * AUPYGO — captcha-auth-fix.js
 * Force le passage du token Cloudflare Turnstile pour TOUTES les demandes
 * Auth sensibles : signUp, signInWithPassword, resetPasswordForEmail.
 *
 * S’appuie sur le widget déjà présent dans le HTML :
 *   <div class="cf-turnstile" data-sitekey="0x4AAAAAAEl5_H-ALybBhria"
 *        data-callback="onTurnstileVerified" ...>
 * et sur les callbacks onTurnstileVerified / onTurnstileExpired de app.js.
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__aupygoCaptchaAuthFix) return;
  window.__aupygoCaptchaAuthFix = true;

  function getToken() {
    if (typeof turnstileToken !== 'undefined' && turnstileToken) return turnstileToken;
    if (window.turnstileToken) return window.turnstileToken;
    return null;
  }

  function resetToken() {
    try {
      if (typeof turnstileToken !== 'undefined') turnstileToken = null;
      window.turnstileToken = null;
      if (window.turnstile) window.turnstile.reset();
    } catch (e) {}
  }

  function toast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type || 'info');
    else console.warn('[captcha]', msg);
  }

  function waitForClient(cb, tries) {
    tries = tries || 0;
    var c = window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    if (c && c.auth) return cb(c);
    if (tries > 40) return;
    setTimeout(function () { waitForClient(cb, tries + 1); }, 250);
  }

  waitForClient(function (client) {
    var auth = client.auth;
    if (!auth) return;

    // --- Patch signUp ---
    if (typeof auth.signUp === 'function' && !auth.__aupygoCaptchaPatchedSignup) {
      var origSignUp = auth.signUp.bind(auth);
      auth.signUp = function (credentials) {
        credentials = credentials || {};
        credentials.options = credentials.options || {};
        var token = getToken();
        if (token) credentials.options.captchaToken = token;
        return origSignUp(credentials).then(function (res) {
          resetToken();
          return res;
        }).catch(function (err) {
          resetToken();
          throw err;
        });
      };
      auth.__aupygoCaptchaPatchedSignup = true;
    }

    // --- Patch signInWithPassword ---
    if (typeof auth.signInWithPassword === 'function' && !auth.__aupygoCaptchaPatchedLogin) {
      var origLogin = auth.signInWithPassword.bind(auth);
      auth.signInWithPassword = function (credentials) {
        credentials = credentials || {};
        credentials.options = credentials.options || {};
        var token = getToken();
        if (token) credentials.options.captchaToken = token;
        return origLogin(credentials).then(function (res) {
          resetToken();
          return res;
        }).catch(function (err) {
          resetToken();
          throw err;
        });
      };
      auth.__aupygoCaptchaPatchedLogin = true;
    }

    // --- Patch resetPasswordForEmail ---
    if (typeof auth.resetPasswordForEmail === 'function' && !auth.__aupygoCaptchaPatchedReset) {
      var origReset = auth.resetPasswordForEmail.bind(auth);
      auth.resetPasswordForEmail = function (email, options) {
        options = options || {};
        var token = getToken();
        if (token) options.captchaToken = token;
        return origReset(email, options).then(function (res) {
          resetToken();
          return res;
        }).catch(function (err) {
          resetToken();
          throw err;
        });
      };
      auth.__aupygoCaptchaPatchedReset = true;
    }

    console.log('[AUPYGO] captcha-auth-fix.js : signUp / signIn / resetPassword patchés pour Turnstile');
  });

  // S’assurer que le callback global alimente aussi window.turnstileToken
  var prevVerified = window.onTurnstileVerified;
  window.onTurnstileVerified = function (token) {
    try {
      if (typeof turnstileToken !== 'undefined') turnstileToken = token;
      window.turnstileToken = token;
    } catch (e) {}
    if (typeof prevVerified === 'function') prevVerified(token);
  };
  var prevExpired = window.onTurnstileExpired;
  window.onTurnstileExpired = function () {
    try {
      if (typeof turnstileToken !== 'undefined') turnstileToken = null;
      window.turnstileToken = null;
    } catch (e) {}
    if (typeof prevExpired === 'function') prevExpired();
  };
})();
