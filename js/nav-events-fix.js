/* AUPYGO — fix navigation : Sorties / Agenda accessibles même si profil incomplet */
(function () {
  'use strict';

  var ALLOW_WITHOUT_PROFILE = {
    home: 1, map: 1, plans: 1, events: 1, agenda: 1
  };

  function applyFix() {
    if (typeof window.go !== 'function') return false;
    if (window.go.__aupygoEventsFix) return true;

    var originalGo = window.go;

    window.go = function (page) {
      if (
        typeof currentUser !== 'undefined' && currentUser &&
        typeof profileSaved !== 'undefined' && !profileSaved &&
        page && ALLOW_WITHOUT_PROFILE[page]
      ) {
        try {
          document.querySelectorAll('.page').forEach(function (p) {
            p.classList.remove('active');
          });
          var el = document.getElementById(page);
          if (el) el.classList.add('active');

          document.querySelectorAll('nav button, .bottom-nav-btn').forEach(function (b) {
            b.classList.remove('active');
            if (b.dataset && b.dataset.nav === page) b.classList.add('active');
          });

          if (['profile', 'reconnect', 'agenda', 'plans'].indexOf(page) !== -1) {
            var moreBtn = document.getElementById('bottomNavMore');
            if (moreBtn) moreBtn.classList.add('active');
          }
          if (typeof closeMoreMenu === 'function') closeMoreMenu();

          if (page === 'events') {
            if (typeof markEventsSeen === 'function') markEventsSeen();
            if (typeof loadAndRenderEvents === 'function') loadAndRenderEvents();
          }
          if (page === 'agenda' || page === 'events') {
            if (typeof highlightAgendaDays === 'function') highlightAgendaDays();
            if (typeof loadAndRenderEvents === 'function') loadAndRenderEvents();
          }
          if (typeof updateEventsBadge === 'function') updateEventsBadge();
          if (typeof updateOnlineCount === 'function') updateOnlineCount();
          if (typeof updateFriendsBadge === 'function') updateFriendsBadge();
          if (typeof updateMessagesBadge === 'function') updateMessagesBadge();

          window.scrollTo({ top: 0, behavior: 'smooth' });

          if (page === 'home' && typeof updateHomeView === 'function') updateHomeView();
          if (page === 'map' && typeof map !== 'undefined' && map) {
            setTimeout(function () {
              try {
                map.invalidateSize();
                if (typeof applyMapRestrictions === 'function') applyMapRestrictions();
                if (typeof renderMarkers === 'function') renderMarkers();
              } catch (e2) {}
            }, 200);
          }
          return;
        } catch (err) {
          console.warn('[AUPYGO] nav-events-fix fallback', err);
        }
      }

      return originalGo(page);
    };

    window.go.__aupygoEventsFix = true;
    console.info('[AUPYGO] nav-events-fix actif');
    return true;
  }

  if (!applyFix()) {
    var tries = 0;
    var timer = setInterval(function () {
      if (applyFix() || ++tries > 60) clearInterval(timer);
    }, 100);
  }

  document.addEventListener('DOMContentLoaded', applyFix);
  window.addEventListener('load', applyFix);
})();

/* Promo video */
(function loadPromoVideo() {
  if (document.querySelector('link[data-aupygo-promo]')) return;
  var l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'css/promo-video.css?v=20261102b';
  l.setAttribute('data-aupygo-promo', '1');
  document.head.appendChild(l);
  var s = document.createElement('script');
  s.src = 'js/promo-video.js?v=20261102b';
  s.defer = true;
  document.head.appendChild(s);
})();

/* 401 profiles fix — charger tôt */
(function load401Fix() {
  if (document.querySelector('script[data-aupygo-401]')) return;
  var s = document.createElement('script');
  s.src = 'js/profiles-401-fix.js?v=20261102c';
  s.setAttribute('data-aupygo-401', '1');
  document.head.appendChild(s);
})();
