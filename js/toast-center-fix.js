/* ==========================================================================
 * AUPYGO — toast-center-fix.js
 * Toasts / messages au CENTRE de l'écran (lisibles, pas coin bas).
 * Patch showToast + CSS injecté (sûr même si styles.css en cache).
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
      '  width:min(420px, calc(100vw - 32px)) !important;',
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

  window.showToast = function (msg, type) {
    try {
      var c = ensureContainer();
      var t = document.createElement('div');
      t.className = 'toast' + (type ? ' ' + type : '');
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
      t.textContent = String(msg == null ? '' : msg);
      c.appendChild(t);
      var ms = type === 'error' ? 4500 : 3200;
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
    if (window.showToast !== arguments.callee && tries < 40) {
      // rebind if overwritten
      var cur = window.showToast;
      if (cur && !cur.__aupygoCentered) {
        var our = window.showToast;
        // already our function from above assignment — mark it
      }
    }
    if (tries > 30) clearInterval(iv);
  }, 300);

  // Mark
  window.showToast.__aupygoCentered = true;

  console.log('[AUPYGO] toast-center-fix — toasts centrés');
})();
