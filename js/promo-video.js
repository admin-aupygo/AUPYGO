/* AUPYGO — vidéo promo / welcome sur l'accueil + modal 1ère visite */
(function () {
  'use strict';

  var WELCOME_SRC = 'media/aupygo_welcome_web.mp4';
  var PROMO_SRC = 'media/aupygo_promo_web.mp4';
  var STORAGE_KEY = 'aupygo_welcome_seen_v1';

  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'className') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    if (html) n.innerHTML = html;
    return n;
  }

  function injectHomeSection() {
    var landing = document.getElementById('homeLanding');
    if (!landing || document.getElementById('aupygoPromoSection')) return;

    var section = el('div', { id: 'aupygoPromoSection', className: 'aupygo-promo-section' });
    section.innerHTML =
      '<div class="aupygo-promo-inner">' +
        '<h3 class="aupygo-promo-title">Découvrir AUPYGO</h3>' +
        '<p class="aupygo-promo-sub">Meet. Go out. Make friends. — la communauté des au pairs</p>' +
        '<div class="aupygo-promo-player-wrap">' +
          '<video id="aupygoPromoPlayer" class="aupygo-promo-video" controls playsinline preload="metadata" poster="">' +
            '<source src="' + PROMO_SRC + '" type="video/mp4">' +
            '<source src="' + WELCOME_SRC + '" type="video/mp4">' +
          '</video>' +
        '</div>' +
        '<div class="aupygo-promo-actions">' +
          '<button type="button" class="btn btn-primary" id="aupygoPlayWelcomeBtn">▶ Welcome (12 s)</button>' +
          '<button type="button" class="btn btn-secondary" id="aupygoPlayPromoBtn">▶ Vidéo complète (1 min 30)</button>' +
        '</div>' +
      '</div>';

    var hero = landing.querySelector('.hero');
    if (hero && hero.parentNode) {
      hero.parentNode.insertBefore(section, hero.nextSibling);
    } else {
      landing.appendChild(section);
    }

    var player = document.getElementById('aupygoPromoPlayer');
    var bw = document.getElementById('aupygoPlayWelcomeBtn');
    var bp = document.getElementById('aupygoPlayPromoBtn');
    if (bw) bw.addEventListener('click', function () {
      player.src = WELCOME_SRC;
      player.load();
      player.play().catch(function () {});
      player.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    if (bp) bp.addEventListener('click', function () {
      player.src = PROMO_SRC;
      player.load();
      player.play().catch(function () {});
      player.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function closeWelcomeModal() {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}
    var overlay = document.getElementById('aupygoWelcomeModal');
    if (!overlay) return;
    var v = document.getElementById('aupygoWelcomeVideo');
    if (v) {
      try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e2) {}
    }
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  function showWelcomeModal() {
    if (document.getElementById('aupygoWelcomeModal')) return;
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch (e) {}

    if (typeof currentUser !== 'undefined' && currentUser && typeof profileSaved !== 'undefined' && profileSaved) {
      return;
    }

    var overlay = el('div', {
      id: 'aupygoWelcomeModal',
      className: 'aupygo-welcome-overlay',
      role: 'dialog',
      'aria-modal': 'true'
    });
    overlay.innerHTML =
      '<div class="aupygo-welcome-sheet" id="aupygoWelcomeSheet">' +
        '<button type="button" class="aupygo-welcome-close" data-aupygo-welcome="close" aria-label="Fermer">×</button>' +
        '<h3>Welcome to AupyGo</h3>' +
        '<p class="aupygo-welcome-tag">The friendly community for au pairs</p>' +
        '<video id="aupygoWelcomeVideo" class="aupygo-welcome-video" controls playsinline autoplay muted preload="auto">' +
          '<source src="' + WELCOME_SRC + '" type="video/mp4">' +
        '</video>' +
        '<div class="aupygo-welcome-actions">' +
          '<button type="button" class="btn btn-primary" data-aupygo-welcome="join">Rejoindre</button>' +
          '<button type="button" class="btn btn-secondary" data-aupygo-welcome="skip">Plus tard</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    function handleAction(action) {
      if (action === 'join') {
        closeWelcomeModal();
        setTimeout(function () {
          try {
            if (typeof go === 'function') go('plans');
            else if (typeof goToLogin === 'function') goToLogin();
            else window.location.hash = 'plans';
          } catch (err) {
            console.warn('[AUPYGO] welcome join', err);
          }
        }, 50);
        return;
      }
      if (action === 'close' || action === 'skip') {
        closeWelcomeModal();
      }
    }

    // Capture phase = prioritaire même si un autre script stoppe la propagation
    function onPointer(e) {
      var t = e.target;
      if (!t) return;
      var btn = t.closest ? t.closest('[data-aupygo-welcome]') : null;
      if (!btn && t.getAttribute && t.getAttribute('data-aupygo-welcome')) btn = t;
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        handleAction(btn.getAttribute('data-aupygo-welcome'));
        return;
      }
      // clic sur le fond sombre
      if (t === overlay) {
        e.preventDefault();
        e.stopPropagation();
        closeWelcomeModal();
      }
    }

    overlay.addEventListener('click', onPointer, true);
    overlay.addEventListener('touchend', onPointer, true);

    // Fallback direct sur chaque bouton (au cas où closest échoue)
    var nodes = overlay.querySelectorAll('[data-aupygo-welcome]');
    for (var i = 0; i < nodes.length; i++) {
      (function (node) {
        node.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          handleAction(node.getAttribute('data-aupygo-welcome'));
        }, true);
      })(nodes[i]);
    }

    var vid = document.getElementById('aupygoWelcomeVideo');
    if (vid) {
      vid.play().catch(function () {});
    }

    // Escape
    function onKey(e) {
      if (e.key === 'Escape') {
        closeWelcomeModal();
        document.removeEventListener('keydown', onKey, true);
      }
    }
    document.addEventListener('keydown', onKey, true);
  }

  // API debug : aupygoResetWelcome() pour retester le modal
  window.aupygoResetWelcome = function () {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    closeWelcomeModal();
    showWelcomeModal();
  };
  window.aupygoCloseWelcome = closeWelcomeModal;

  function boot() {
    injectHomeSection();
    setTimeout(showWelcomeModal, 600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  window.addEventListener('load', function () {
    injectHomeSection();
  });
})();
