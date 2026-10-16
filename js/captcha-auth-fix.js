/* ==========================================================================
 * AUPYGO — captcha-auth-fix.js
 * Turnstile + Supabase Auth (signUp / signIn / resetPassword)
 * - Attend le token avant d'envoyer
 * - Re-render le widget s'il reste bloque sur "Verify"
 * - Fallback lecture input hidden cf-turnstile-response
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__aupygoCaptchaAuthFix) return;
  window.__aupygoCaptchaAuthFix = true;

  var SITEKEY = '0x4AAAAAAEl5_H-ALybBhria';
  var widgetId = null;

  function getToken() {
    if (typeof turnstileToken !== 'undefined' && turnstileToken) return turnstileToken;
    if (window.turnstileToken) return window.turnstileToken;
    // Fallback : input hidden injecte par Turnstile
    try {
      var inp = document.querySelector('input[name="cf-turnstile-response"]');
      if (inp && inp.value && inp.value.length > 20) return inp.value;
    } catch (e) {}
    return null;
  }

  function setToken(token) {
    try {
      if (typeof turnstileToken !== 'undefined') turnstileToken = token;
      window.turnstileToken = token;
    } catch (e) {}
  }

  function resetToken() {
    try {
      if (typeof turnstileToken !== 'undefined') turnstileToken = null;
      window.turnstileToken = null;
      if (window.turnstile) {
        if (widgetId != null) window.turnstile.reset(widgetId);
        else window.turnstile.reset();
      }
    } catch (e) {}
  }

  function toast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type || 'info');
    else console.warn('[captcha]', msg);
  }

  function ensureWidgetRendered() {
    if (!window.turnstile || typeof window.turnstile.render !== 'function') return;
    var el = document.getElementById('turnstileContainer');
    if (!el) return;
    // Deja un iframe / response → OK
    if (el.querySelector('iframe') || (el.querySelector('input[name="cf-turnstile-response"]') && getToken())) return;
    try {
      // Vider et re-render explicitement
      el.innerHTML = '';
      widgetId = window.turnstile.render(el, {
        sitekey: SITEKEY,
        callback: function (token) {
          setToken(token);
          if (typeof window.onTurnstileVerified === 'function') {
            try { window.onTurnstileVerified(token); } catch (e) {}
          }
        },
        'expired-callback': function () {
          setToken(null);
          if (typeof window.onTurnstileExpired === 'function') {
            try { window.onTurnstileExpired(); } catch (e) {}
          }
        },
        'error-callback': function () {
          console.warn('[AUPYGO] Turnstile error-callback');
          setToken(null);
        },
        theme: 'auto',
        size: 'normal'
      });
      console.log('[AUPYGO] Turnstile re-render widgetId=', widgetId);
    } catch (e) {
      console.warn('[AUPYGO] Turnstile render failed', e);
    }
  }

  function waitForToken(maxMs) {
    maxMs = maxMs || 12000;
    return new Promise(function (resolve) {
      var start = Date.now();
      function tick() {
        var t = getToken();
        if (t) return resolve(t);
        if (Date.now() - start > maxMs) return resolve(null);
        // Au bout de 3s sans token, tenter un re-render
        if (Date.now() - start > 3000) ensureWidgetRendered();
        setTimeout(tick, 300);
      }
      tick();
    });
  }

  function waitForClient(cb, tries) {
    tries = tries || 0;
    var c = window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    if (c && c.auth) return cb(c);
    if (tries > 40) return;
    setTimeout(function () { waitForClient(cb, tries + 1); }, 250);
  }

  // Callbacks globaux
  var prevVerified = window.onTurnstileVerified;
  window.onTurnstileVerified = function (token) {
    setToken(token);
    if (typeof prevVerified === 'function') prevVerified(token);
  };
  var prevExpired = window.onTurnstileExpired;
  window.onTurnstileExpired = function () {
    setToken(null);
    if (typeof prevExpired === 'function') prevExpired();
  };

  // Rendre le widget des que l'API Turnstile est prete
  function bootWidget() {
    if (window.turnstile && window.turnstile.ready) {
      window.turnstile.ready(function () {
        ensureWidgetRendered();
      });
    } else {
      // Poll jusqu'a dispo
      var n = 0;
      var iv = setInterval(function () {
        n++;
        if (window.turnstile) {
          clearInterval(iv);
          ensureWidgetRendered();
        } else if (n > 40) clearInterval(iv);
      }, 250);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootWidget);
  } else {
    bootWidget();
  }

  waitForClient(function (client) {
    var auth = client.auth;
    if (!auth) return;

    function withCaptcha(run) {
      return waitForToken(12000).then(function (token) {
        if (!token) {
          toast('Valide le captcha (case Cloudflare) puis reessaie.', 'error');
          ensureWidgetRendered();
          return Promise.reject({ message: 'captcha required' });
        }
        return run(token).then(function (res) {
          resetToken();
          return res;
        }).catch(function (err) {
          resetToken();
          throw err;
        });
      });
    }

    // --- Patch signUp ---
    if (typeof auth.signUp === 'function' && !auth.__aupygoCaptchaPatchedSignup) {
      var origSignUp = auth.signUp.bind(auth);
      auth.signUp = function (credentials) {
        credentials = credentials || {};
        credentials.options = credentials.options || {};
        return withCaptcha(function (token) {
          credentials.options.captchaToken = token;
          return origSignUp(credentials);
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
        return withCaptcha(function (token) {
          credentials.options.captchaToken = token;
          return origLogin(credentials);
        });
      };
      auth.__aupygoCaptchaPatchedLogin = true;
    }

    // --- Patch resetPasswordForEmail ---
    if (typeof auth.resetPasswordForEmail === 'function' && !auth.__aupygoCaptchaPatchedReset) {
      var origReset = auth.resetPasswordForEmail.bind(auth);
      auth.resetPasswordForEmail = function (email, options) {
        options = options || {};
        return withCaptcha(function (token) {
          options.captchaToken = token;
          return origReset(email, options);
        });
      };
      auth.__aupygoCaptchaPatchedReset = true;
    }

    console.log('[AUPYGO] captcha-auth-fix.js v2 : wait token + re-render Turnstile');
  });
})();
