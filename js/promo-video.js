/* AUPYGO — pub de présentation (image) + modal 1ère visite */
(function () {
  'use strict';

  var PUB_IMG = 'pub-aupygo.jpg';
  var WELCOME_SRC = 'media/aupygo_welcome_web.mp4';
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
        '<div class="aupygo-promo-player-wrap aupygo-promo-img-wrap">' +
          '<img id="aupygoPromoImg" class="aupygo-promo-img" src="' + PUB_IMG + '" alt="AupyGo — Meet. Go out. Make friends. Code WELCOM12 pour 15 jours STANDARD gratuit" loading="lazy">' +
        '</div>' +
        '<div class="aupygo-promo-actions">' +
          '<a class="btn btn-primary" href="https://aupygo.com" target="_blank" rel="noopener">Découvrir AupyGo →</a>' +
          '<button type="button" class="btn btn-secondary" id="aupygoPlayWelcomeBtn">▶ Welcome (vidéo 12 s)</button>' +
        '</div>' +
      '</div>';

    var hero = landing.querySelector('.hero');
    if (hero && hero.parentNode) {
      hero.parentNode.insertBefore(section, hero.nextSibling);
    } else {
      landing.appendChild(section);
    }

    var bw = document.getElementById('aupygoPlayWelcomeBtn');
    if (bw) bw.addEventListener('click', function () {
      // Optional: still allow playing the short welcome video in a simple overlay or new tab
      var v = document.createElement('video');
      v.src = WELCOME_SRC;
      v.controls = true;
      v.autoplay = true;
      v.style.cssText = 'position:fixed;inset:0;z-index:99999;width:100%;height:100%;object-fit:contain;background:#000';
      v.addEventListener('ended', function () { if (v.parentNode) v.parentNode.removeChild(v); });
      v.addEventListener('click', function (e) { if (e.target === v) { try { v.pause(); } catch(e2){} if (v.parentNode) v.parentNode.removeChild(v); } });
      document.body.appendChild(v);
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
        '<img class="aupygo-welcome-img" src="' + PUB_IMG + '" alt="AupyGo promo" style="width:100%;border-radius:12px;max-height:45vh;object-fit:contain;background:#0f172a">' +
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
      if (t === overlay) {
        e.preventDefault();
        e.stopPropagation();
        closeWelcomeModal();
      }
    }

    overlay.addEventListener('click', onPointer, true);
    overlay.addEventListener('touchend', onPointer, true);

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
  }

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
