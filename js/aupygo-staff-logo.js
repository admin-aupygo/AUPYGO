/* AUPYGO — logo staff events + bouton Descriptif sur vignette */
(function () {
  'use strict';

  // Préfère aupygo-logo.png (à la racine du site) ; sinon SVG intégré
  function logoHtml(size) {
    size = size || 36;
    var s = size;
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="' + s + '" height="' + s + '">' +
      '<rect width="128" height="128" rx="24" fill="#1a1035"/>' +
      '<circle cx="64" cy="64" r="36" fill="#7c5cfc"/>' +
      '<path d="M64 28c-20 0-36 16-36 36 0 12 8 26 20 36l16 14 16-14c12-10 20-24 20-36 0-20-16-36-36-36z" fill="#9b7dff"/>' +
      '<circle cx="64" cy="58" r="14" fill="#fff"/>' +
      '<circle cx="64" cy="58" r="6" fill="#6d4aff"/>' +
      '<path d="M20 88c20-8 40-4 56 8 12 8 24 10 36 6" fill="none" stroke="#ff5cad" stroke-width="8" stroke-linecap="round"/>' +
      '<path d="M100 96l12-4-2 14z" fill="#ff5cad"/>' +
      '</svg>';
    return (
      '<span class="aupygo-ev-logo" aria-label="AUPYGO" style="display:inline-flex;width:' + s +
      'px;height:' + s + 'px;border-radius:10px;overflow:hidden;vertical-align:middle;' +
      'box-shadow:0 2px 8px rgba(109,74,255,.3);background:#1a1035">' +
      '<img src="aupygo-logo.png" alt="AUPYGO" width="' + s + '" height="' + s + '" ' +
      'style="width:100%;height:100%;object-fit:cover;display:block" ' +
      'onerror="this.style.display=\'none\';this.nextSibling.style.display=\'block\'" />' +
      '<span style="display:none;width:100%;height:100%">' + svg + '</span>' +
      '</span>'
    );
  }

  function isStaffEv(ev) {
    if (!ev) return false;
    if (ev.is_special_aupygo === true || ev.is_special_aupygo === 'true') return true;
    if (ev.visibility === 'admin' || ev.visibility === 'admin_only') return true;
    if (String(ev.type || '') === 'special') return true;
    try {
      var d = String(ev.description || '');
      if (d.indexOf('[STAFF_EVENT]') !== -1 || d.indexOf('[STAFF_PRESENCE]') !== -1) return true;
      var c = (window.profiles || []).find(function (p) { return p && p.id === ev.creator_id; });
      if (!c) return false;
      if (c.is_admin === true) return true;
      var r = String(c.role || '').toLowerCase();
      return ['amiral','admin_general','admin','host','moderator','major_staff','sergent_staff','major_moderateur','sergent_moderateur'].indexOf(r) !== -1;
    } catch (e) { return false; }
  }

  function getEv(id) {
    return (window.cachedEvents || []).find(function (e) { return e && e.id === id; }) || null;
  }

  function enhanceStaffCards() {
    (window.cachedEvents || []).forEach(function (ev) {
      if (!ev || !ev.id || !isStaffEv(ev)) return;

      document.querySelectorAll('[data-event-id="' + ev.id + '"]').forEach(function (card) {
        if (!card.querySelector('.aupygo-ev-logo-wrap')) {
          var wrap = document.createElement('div');
          wrap.className = 'aupygo-ev-logo-wrap';
          wrap.style.cssText = 'display:flex;align-items:center;gap:10px;margin:0 0 8px';
          wrap.innerHTML = logoHtml(40) +
            '<span style="font-size:12px;font-weight:800;color:#6d4aff;letter-spacing:.02em">ÉVÉNEMENT AUPYGO</span>';
          if (card.firstChild) card.insertBefore(wrap, card.firstChild);
          else card.appendChild(wrap);
        }

        var h3 = card.querySelector('h3');
        if (h3 && !h3.querySelector('.aupygo-ev-logo')) {
          var t = (h3.textContent || '').replace(/^🎉\s*/, '').replace(/^⭐\s*/, '').trim();
          if (t) h3.textContent = t;
        }

        if (!card.querySelector('.aupygo-btn-descriptif')) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn btn-secondary aupygo-btn-descriptif';
          btn.textContent = '📄 Descriptif';
          btn.style.cssText =
            'width:100%;margin:8px 0 4px;font-weight:700;border:1px solid #c4b5fd;' +
            'background:#f5f3ff;color:#5b21b6;cursor:pointer';
          btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.openEventDescModal === 'function') window.openEventDescModal(ev);
            else if (typeof window.openSpecialInviteModal === 'function') window.openSpecialInviteModal(ev.id);
          });
          var actions = card.querySelector('.event-actions-row, .special-invite-actions');
          if (actions && actions.parentNode) actions.parentNode.insertBefore(btn, actions);
          else card.appendChild(btn);
        }
      });
    });

    document.querySelectorAll('.special-event-banner').forEach(function (banner) {
      var id = banner.getAttribute('data-event-id');
      var ev = id ? getEv(id) : null;
      if (!ev || !isStaffEv(ev)) return;

      var h = banner.querySelector('h3');
      if (h && !h.querySelector('.aupygo-ev-logo')) {
        var txt = (h.textContent || '').replace(/^🎉\s*/, '').replace(/^⭐\s*/, '').trim();
        h.innerHTML = logoHtml(26) + ' <span style="vertical-align:middle">' + txt + '</span>';
      }

      if (!banner.querySelector('.aupygo-btn-descriptif')) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'aupygo-btn-descriptif';
        b.textContent = '📄 Descriptif';
        b.style.cssText =
          'margin-top:8px;padding:8px 12px;border-radius:10px;border:0;font-weight:700;' +
          'background:rgba(255,255,255,.95);color:#5b21b6;cursor:pointer;width:100%';
        b.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (typeof window.openEventDescModal === 'function') window.openEventDescModal(ev);
          else if (typeof window.openSpecialInviteModal === 'function') window.openSpecialInviteModal(ev.id);
        });
        banner.appendChild(b);
      }
    });
  }

  function patchInviteModal() {
    if (typeof window.openSpecialInviteModal !== 'function') return;
    if (window._aupygoLogoInvitePatched) return;
    window._aupygoLogoInvitePatched = true;
    var orig = window.openSpecialInviteModal;
    window.openSpecialInviteModal = function (eventId) {
      orig.apply(this, arguments);
      setTimeout(function () {
        var card = document.getElementById('specialInviteCard');
        if (!card) return;
        var av = card.querySelector('.special-invite-avatar');
        if (av && !av.querySelector('.aupygo-ev-logo')) {
          av.innerHTML = logoHtml(56);
          av.style.background = 'transparent';
          av.style.fontSize = '0';
        }
      }, 40);
    };
  }

  function boot() {
    enhanceStaffCards();
    patchInviteModal();
  }

  boot();
  setInterval(boot, 1600);
  setTimeout(boot, 500);
  setTimeout(boot, 1500);

  if (typeof window.loadAndRenderEvents === 'function' && !window._aupygoLogoLoadPatched) {
    window._aupygoLogoLoadPatched = true;
    var origLoad = window.loadAndRenderEvents;
    window.loadAndRenderEvents = async function () {
      var r = await origLoad.apply(this, arguments);
      setTimeout(boot, 60);
      setTimeout(boot, 350);
      return r;
    };
  }

  console.log('[AUPYGO] logo staff + bouton Descriptif — ready');
})();
