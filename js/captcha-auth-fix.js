/* ==========================================================================
 * AUPYGO — captcha-auth-fix.js
 * Turnstile + Supabase Auth (signUp / signIn / resetPassword)
 * - Explicit render (pas de turnstile.ready — incompatible avec async/defer)
 * - Un seul widgetId, remove() avant tout re-render
 * - Attend le token avant d'envoyer
 * - Re-render uniquement si expiré / erreur / container vide
 * - Fallback lecture input hidden cf-turnstile-response
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__aupygoCaptchaAuthFix) return;
  window.__aupygoCaptchaAuthFix = true;

  var SITEKEY = '0x4AAAAAAEl5_H-ALybBhria';
  var widgetId = null;
  var renderInFlight = false;
  var lastRenderAt = 0;

  function getToken() {
    if (typeof turnstileToken !== 'undefined' && turnstileToken) return turnstileToken;
    if (window.turnstileToken) return window.turnstileToken;
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

  function safeRemoveWidget() {
    if (!window.turnstile) return;
    try {
      if (widgetId != null) {
        window.turnstile.remove(widgetId);
      }
    } catch (e) {}
    widgetId = null;
    try {
      var el = document.getElementById('turnstileContainer');
      if (el) el.innerHTML = '';
    } catch (e) {}
  }

  function resetToken() {
    try {
      if (typeof turnstileToken !== 'undefined') turnstileToken = null;
      window.turnstileToken = null;
      if (window.turnstile) {
        if (widgetId != null) {
          try { window.turnstile.reset(widgetId); } catch (e) {}
        } else {
          try { window.turnstile.reset(); } catch (e) {}
        }
      }
    } catch (e) {}
  }

  function toast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type || 'info');
    else console.warn('[captcha]', msg);
  }

  function ensureWidgetRendered(force) {
    if (!window.turnstile || typeof window.turnstile.render !== 'function') return;
    var el = document.getElementById('turnstileContainer');
    if (!el) return;

    // Déjà un iframe + token → OK
    if (!force && el.querySelector('iframe') && getToken()) return;
    // Widget déjà rendu récemment et iframe présent → ne pas re-créer
    if (!force && widgetId != null && el.querySelector('iframe')) return;
    // Throttle : pas plus d'un render toutes les 2 s
    var now = Date.now();
    if (!force && renderInFlight) return;
    if (!force && now - lastRenderAt < 2000) return;

    renderInFlight = true;
    lastRenderAt = now;

    try {
      // Toujours remove() l'ancien widget pour éviter "Cannot find Widget"
      safeRemoveWidget();

      el.classList.remove('cf-turnstile');
      el.removeAttribute('data-sitekey');
      el.removeAttribute('data-callback');
      el.removeAttribute('data-expired-callback');
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
          // Un seul retry après erreur, avec délai
          setTimeout(function () {
            if (!getToken()) ensureWidgetRendered(true);
          }, 1500);
        },
        theme: 'auto',
        size: 'normal'
      });
      console.log('[AUPYGO] Turnstile explicit render widgetId=', widgetId);
    } catch (e) {
      console.warn('[AUPYGO] Turnstile render failed', e);
      widgetId = null;
    } finally {
      renderInFlight = false;
    }
  }

  function waitForToken(maxMs) {
    maxMs = maxMs || 12000;
    return new Promise(function (resolve) {
      var start = Date.now();
      var nudged = false;
      function tick() {
        var t = getToken();
        if (t) return resolve(t);
        if (Date.now() - start > maxMs) return resolve(null);
        // Un seul nudge de render après 4 s si toujours vide
        if (!nudged && Date.now() - start > 4000) {
          nudged = true;
          ensureWidgetRendered(false);
        }
        setTimeout(tick, 400);
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

  // Boot sans turnstile.ready() (incompatible avec script async/defer)
  function bootWidget() {
    var n = 0;
    var iv = setInterval(function () {
      n++;
      if (window.turnstile && typeof window.turnstile.render === 'function') {
        clearInterval(iv);
        // Laisser le markup implicite un court instant, sinon explicit render
        setTimeout(function () {
          var el = document.getElementById('turnstileContainer');
          if (el && !el.querySelector('iframe')) {
            ensureWidgetRendered(true);
          } else if (el && el.querySelector('iframe')) {
            // Widget implicite déjà là — on ne force pas un 2e render
            console.log('[AUPYGO] Turnstile widget déjà présent (implicit ou autre)');
          } else {
            ensureWidgetRendered(true);
          }
        }, 600);
      } else if (n > 60) {
        clearInterval(iv);
        console.warn('[AUPYGO] Turnstile API non chargee apres 15s');
      }
    }, 250);
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
          ensureWidgetRendered(true);
          // Rejeter avec Error (pas un Object nu) pour éviter Uncaught (in promise) Object
          return Promise.reject(new Error('captcha required'));
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

    console.log('[AUPYGO] captcha-auth-fix.js v4 : single widget + remove() + throttle');
  });
})();
