/* ==========================================================================
 * AUPYGO — toast-center-fix.js
 * Toasts / messages au CENTRE de l'écran (lisibles, pas coin bas).
 * Patch showToast + CSS injecté (sûr même si styles.css en cache).
 * - Support durée optionnelle (3e argument, ms)
 * - Toasts "pending" (inscription) : plus grands, ≥10 s, spam en plus petit
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__aupygoToastCenter) return;
  window.__aupygoToastCenter = true;

  var STYLE_ID = 'aupygo-toast-center-css';
  if (!document.getElementById(STYLE_ID)) {
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = [
      '.toast-container{',
      '  position:fixed !important;',
      '  left:50% !important;',
      '  right:auto !important;',
      '  top:50% !important;',
      '  bottom:auto !important;',
      '  transform:translate(-50%,-50%) !important;',
      '  z-index:100000 !important;',
      '  display:flex !important;',
      '  flex-direction:column !important;',
      '  align-items:center !important;',
      '  gap:12px !important;',
      '  width:min(440px, calc(100vw - 32px)) !important;',
      '  max-width:calc(100vw - 32px) !important;',
      '  pointer-events:none !important;',
      '}',
      '.toast-container .toast{',
      '  pointer-events:auto !important;',
      '  max-width:100% !important;',
      '  width:100% !important;',
      '  text-align:center !important;',
      '  padding:16px 18px !important;',
      '  font-size:15px !important;',
      '  line-height:1.45 !important;',
      '  border-radius:14px !important;',
      '  box-shadow:0 18px 50px rgba(15,23,42,.35) !important;',
      '  animation:aupygoToastIn .28s ease !important;',
      '  white-space:pre-line !important;',
      '}',
      /* Toast inscription / pending : gros texte principal + spam plus petit */
      '.toast-container .toast.toast-pending{',
      '  padding:22px 22px 18px !important;',
      '  font-size:18px !important;',
      '  font-weight:600 !important;',
      '  line-height:1.4 !important;',
      '  border-radius:16px !important;',
      '  box-shadow:0 22px 60px rgba(15,23,42,.42) !important;',
      '}',
      '.toast-container .toast.toast-pending .toast-spam{',
      '  display:block !important;',
      '  margin-top:12px !important;',
      '  font-size:13px !important;',
      '  font-weight:400 !important;',
      '  opacity:0.88 !important;',
      '  line-height:1.35 !important;',
      '}',
      '@keyframes aupygoToastIn{',
      '  from{opacity:0;transform:scale(.94) translateY(8px);}',
      '  to{opacity:1;transform:scale(1) translateY(0);}',
      '}',
      '/* Modales déjà centrées : s\'assurer display:flex */',
      '.member-modal-overlay.open,',
      '.geo-consent-overlay.open{',
      '  display:flex !important;',
      '  align-items:center !important;',
      '  justify-content:center !important;',
      '}',
      '#pfPaidAcceptOverlay[style*="display: flex"],',
      '#pfPaidAcceptOverlay[style*="display:flex"],',
      '#freeAupygoPaidOverlay{',
      '  align-items:center !important;',
      '  justify-content:center !important;',
      '}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(st);
  }

  function ensureContainer() {
    var c = document.getElementById('toastContainer');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toastContainer';
      c.className = 'toast-container';
      document.body.appendChild(c);
    }
    c.classList.add('toast-container');
    return c;
  }

  var prev = typeof window.showToast === 'function' ? window.showToast : null;

  /**
   * showToast(msg, type, durationMs)
   * - type: 'success' | 'error' | 'info' | 'pending' (pending = gros + 12s)
   * - durationMs: optionnel, sinon 3200 / 4500 / 12000 selon type
   */
  window.showToast = function (msg, type, durationMs) {
    try {
      var c = ensureContainer();
      var t = document.createElement('div');
      var isPending = (type === 'pending') ||
        (typeof msg === 'string' && /vérifie ta boîte|check your inbox|revisa tu email|confirmer ton inscription|confirm your registration|confirmar el registro/i.test(msg));

      var classes = 'toast';
      if (type && type !== 'pending') classes += ' ' + type;
      if (isPending) classes += ' toast-pending success';
      t.className = classes;
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');

      var text = String(msg == null ? '' : msg);

      if (isPending) {
        // Structure : titre en gros + ligne spam en plus petit
        var main = text;
        var spam = '';
        // Si le message contient déjà un séparateur, on le découpe
        var parts = text.split(/\n+|—|–|-/);
        if (parts.length >= 2 && /spam|courrier indésirable|junk|indésirables/i.test(text)) {
          main = parts[0].trim();
          spam = parts.slice(1).join(' ').replace(/^\s*[—–-]\s*/, '').trim();
        } else if (!/spam|courrier indésirable|junk/i.test(text)) {
          // Ajoute la mention spam si absente
          var lang = (window.currentLang || localStorage.getItem('aupygo_lang') || 'fr').toLowerCase();
          if (lang.indexOf('en') === 0) spam = 'Also check your spam / junk folder.';
          else if (lang.indexOf('es') === 0) spam = 'Mira también la carpeta de spam / correo no deseado.';
          else spam = 'Regarde aussi tes spams / courriers indésirables.';
        }

        t.innerHTML = '';
        var mainEl = document.createElement('div');
        mainEl.textContent = main || text;
        t.appendChild(mainEl);
        if (spam) {
          var spamEl = document.createElement('span');
          spamEl.className = 'toast-spam';
          spamEl.textContent = spam;
          t.appendChild(spamEl);
        }
      } else {
        t.textContent = text;
      }

      c.appendChild(t);

      var ms = 3200;
      if (typeof durationMs === 'number' && durationMs > 0) {
        ms = durationMs;
      } else if (isPending) {
        ms = 12000; // au moins 10 secondes
      } else if (type === 'error') {
        ms = 4500;
      }

      setTimeout(function () {
        t.style.opacity = '0';
        t.style.transition = 'opacity .3s';
        setTimeout(function () {
          try { t.remove(); } catch (e) {}
        }, 320);
      }, ms);
    } catch (e) {
      if (prev) {
        try { prev(msg, type); } catch (e2) {}
      } else {
        console.log('[toast]', type, msg);
      }
    }
  };

  // Si showToast était défini plus tard par app.js, on re-patche
  var tries = 0;
  var iv = setInterval(function () {
    tries++;
    var cur = window.showToast;
    if (cur && !cur.__aupygoCentered) {
      window.showToast.__aupygoCentered = true;
    }
    if (tries > 30) clearInterval(iv);
  }, 300);

  // Mark
  window.showToast.__aupygoCentered = true;

  console.log('[AUPYGO] toast-center-fix — toasts centrés + pending 12s');
})();
