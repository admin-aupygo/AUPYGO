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

    // Place after hero if possible
    var hero = landing.querySelector('.hero');
    if (hero && hero.parentNode) {
      hero.parentNode.insertBefore(section, hero.nextSibling);
    } else {
      landing.appendChild(section);
    }

    var player = document.getElementById('aupygoPromoPlayer');
    document.getElementById('aupygoPlayWelcomeBtn').addEventListener('click', function () {
      player.src = WELCOME_SRC;
      player.play().catch(function () {});
      player.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    document.getElementById('aupygoPlayPromoBtn').addEventListener('click', function () {
      player.src = PROMO_SRC;
      player.play().catch(function () {});
      player.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function showWelcomeModal() {
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch (e) {}

    // Ne pas spammer si déjà connecté avec profil (retour fréquent)
    if (typeof currentUser !== 'undefined' && currentUser && typeof profileSaved !== 'undefined' && profileSaved) {
      return;
    }

    var overlay = el('div', { id: 'aupygoWelcomeModal', className: 'aupygo-welcome-overlay', role: 'dialog', 'aria-modal': 'true' });
    overlay.innerHTML =
      '<div class="aupygo-welcome-sheet">' +
        '<button type="button" class="aupygo-welcome-close" id="aupygoWelcomeClose" aria-label="Fermer">×</button>' +
        '<h3>Welcome to AupyGo</h3>' +
        '<p class="aupygo-welcome-tag">The friendly community for au pairs</p>' +
        '<video id="aupygoWelcomeVideo" class="aupygo-welcome-video" controls playsinline autoplay muted preload="auto">' +
          '<source src="' + WELCOME_SRC + '" type="video/mp4">' +
        '</video>' +
        '<div class="aupygo-welcome-actions">' +
          '<button type="button" class="btn btn-primary" id="aupygoWelcomeCta">Rejoindre</button>' +
          '<button type="button" class="btn btn-secondary" id="aupygoWelcomeSkip">Plus tard</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    function close() {
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}
      var v = document.getElementById('aupygoWelcomeVideo');
      if (v) { try { v.pause(); } catch (e2) {} }
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    document.getElementById('aupygoWelcomeClose').onclick = close;
    document.getElementById('aupygoWelcomeSkip').onclick = close;
    document.getElementById('aupygoWelcomeCta').onclick = function () {
      close();
      if (typeof go === 'function') go('plans');
      else if (typeof goToLogin === 'function') goToLogin();
    };
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });

    // Auto-unmute on first user gesture inside modal
    var vid = document.getElementById('aupygoWelcomeVideo');
    if (vid) {
      vid.play().catch(function () {});
    }
  }

  function boot() {
    injectHomeSection();
    // léger délai pour laisser la page se stabiliser
    setTimeout(showWelcomeModal, 800);
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
