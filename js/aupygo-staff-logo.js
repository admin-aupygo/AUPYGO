/* AUPYGO — logo staff + bouton Descriptif + exclus staff des participants */
(function () {
  'use strict';

  var STAFF_ROLES = [
    'amiral', 'admin_general', 'admin', 'host', 'moderator',
    'major_staff', 'sergent_staff', 'major_moderateur', 'sergent_moderateur'
  ];

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

  function isStaffProfile(p) {
    if (!p) return false;
    if (p.is_admin === true || p.is_admin === 'true') return true;
    var r = String(p.role || '').toLowerCase();
    return STAFF_ROLES.indexOf(r) !== -1;
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
      return isStaffProfile(c);
    } catch (e) { return false; }
  }

  function getEv(id) {
    return (window.cachedEvents || []).find(function (e) { return e && e.id === id; }) || null;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function isPaidEv(ev) {
    return !!(ev && (ev.is_paid === true || ev.is_paid === 'true') && Number(ev.price) > 0);
  }

  function priceTxt(ev) {
    if (!isPaidEv(ev)) return '';
    return Number(ev.price).toFixed(2).replace(/\.00$/, '') + ' €';
  }

  function tariffLabel(ev) {
    if (isPaidEv(ev)) {
      if (isStaffEv(ev)) return '💶 Événement AUPYGO payant — ' + priceTxt(ev);
      return '💶 Entrée payante (voir descriptif)';
    }
    return '🆓 Gratuit — entrée libre';
  }

  function ensureDescModal() {
    if (document.getElementById('aupygoDescOverlay')) return;
    var ov = document.createElement('div');
    ov.id = 'aupygoDescOverlay';
    ov.style.cssText =
      'display:none;position:fixed;inset:0;z-index:10070;background:rgba(15,23,42,.55);' +
      'align-items:center;justify-content:center;padding:16px';
    ov.innerHTML =
      '<div id="aupygoDescCard" style="background:#fff;border-radius:16px;max-width:440px;width:100%;' +
      'padding:20px;max-height:90vh;overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,.25)"></div>';
    ov.addEventListener('click', function (e) {
      if (e.target === ov) closeDescModal();
    });
    document.body.appendChild(ov);
  }

  function closeDescModal() {
    var ov = document.getElementById('aupygoDescOverlay');
    if (ov) ov.style.display = 'none';
  }
  window.aupygoCloseDescModal = closeDescModal;

  function openEventDescModal(ev) {
    if (!ev) return;
    ensureDescModal();
    var card = document.getElementById('aupygoDescCard');
    if (!card) return;

    var dateStr = typeof formatEventDate === 'function'
      ? formatEventDate(ev.event_date)
      : String(ev.event_date || '');
    var desc = String(ev.description || '')
      .replace(/\[STAFF_EVENT\]/g, '')
      .replace(/\[STAFF_PRESENCE\]/g, '')
      .replace(/\[HOST_COUNTRY:[^\]]*\]/g, '')
      .replace(/\[EN_ATTENTE_VALIDATION_ADMIN\]/g, '')
      .trim();
    var paid = isPaidEv(ev);

    card.innerHTML =
      '<button type="button" onclick="aupygoCloseDescModal()" style="float:right;border:0;background:0;font-size:22px;cursor:pointer">×</button>' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">' +
      (isStaffEv(ev) ? logoHtml(48) : '<span style="font-size:32px">' + esc(ev.emoji || '🎉') + '</span>') +
      '<div><div style="font-size:11px;font-weight:800;color:#6d4aff">' +
      (isStaffEv(ev) ? 'ÉVÉNEMENT AUPYGO' : 'SORTIE') +
      '</div><h3 style="margin:2px 0 0;font-size:18px">' + esc(ev.title || '') + '</h3></div></div>' +
      '<p style="margin:6px 0;color:#64748b;font-size:13px">📍 ' + esc(ev.address || '—') + '</p>' +
      '<p style="margin:6px 0;color:#64748b;font-size:13px">🕐 ' + esc(dateStr) + '</p>' +
      '<p style="font-weight:700;margin:12px 0 8px;color:' + (paid ? '#7c3aed' : '#15803d') + '">' +
      esc(tariffLabel(ev)) + '</p>' +
      '<div style="margin:12px 0;padding:14px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;' +
      'font-size:14px;line-height:1.55;white-space:pre-wrap;color:#0f172a">' +
      (desc ? esc(desc) : '<em style="color:#94a3b8">Pas de descriptif pour cette sortie.</em>') +
      '</div>' +
      '<button type="button" class="btn btn-secondary" style="width:100%;margin-top:8px" onclick="aupygoCloseDescModal()">Fermer</button>';

    document.getElementById('aupygoDescOverlay').style.display = 'flex';
  }
  window.openEventDescModal = openEventDescModal;

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
            openEventDescModal(ev);
          });
          var actions = card.querySelector('.event-actions-row, .special-invite-actions');
          if (actions && actions.parentNode) actions.parentNode.insertBefore(btn, actions);
          else card.appendChild(btn);
        }

        fixParticipantCountOnCard(card, ev);
      });
    });

    document.querySelectorAll('.special-event-banner').forEach(function (banner) {
      var id = banner.getAttribute('data-event-id');
      var ev = id ? getEv(id) : null;
      if (!ev || !isStaffEv(ev)) return;

      var h = banner.querySelector('h3');
      if (h && !h.querySelector('.aupygo-ev-logo')) {
        var txt = (h.textContent || '').replace(/^🎉\s*/, '').replace(/^⭐\s*/, '').trim();
        h.innerHTML = logoHtml(26) + ' <span style="vertical-align:middle">' + esc(txt) + '</span>';
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
          openEventDescModal(ev);
        });
        banner.appendChild(b);
      }
    });
  }

  function memberCountWithoutStaff(ev) {
    var parts = (ev && ev.event_participants) || [];
    if (!parts.length) return 0;
    var n = 0;
    for (var i = 0; i < parts.length; i++) {
      var uid = parts[i].user_id || parts[i];
      var p = (window.profiles || []).find(function (x) { return x && x.id === uid; });
      if (!isStaffProfile(p)) n++;
    }
    return n;
  }

  function fixParticipantCountOnCard(card, ev) {
    var count = memberCountWithoutStaff(ev);
    card.querySelectorAll('button, .btn').forEach(function (btn) {
      var t = btn.textContent || '';
      if (/Participants/i.test(t)) {
        btn.textContent = t.replace(/Participants\s*\(\d+\)/i, 'Participants (' + count + ')');
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
        if (!card.querySelector('.aupygo-btn-descriptif')) {
          var ev = getEv(eventId);
          if (!ev) return;
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn btn-secondary aupygo-btn-descriptif';
          btn.textContent = '📄 Voir le descriptif';
          btn.style.cssText = 'width:100%;margin:8px 0;font-weight:700';
          btn.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            openEventDescModal(ev);
          };
          var actions = card.querySelector('.special-invite-actions');
          if (actions) card.insertBefore(btn, actions);
          else card.appendChild(btn);
        }
      }, 40);
    };
  }

  function patchGuestList() {
    if (typeof window.openEventGuestList !== 'function') return false;
    if (window._aupygoGuestListPatched === window.openEventGuestList) return true;

    window.openEventGuestList = async function (eventId) {
      if (!window.currentUser) {
        if (typeof showToast === 'function') showToast('Connecte-toi.', 'error');
        return;
      }
      var ev = getEv(eventId);
      if (!ev) {
        if (typeof showToast === 'function') showToast('Événement introuvable.', 'error');
        return;
      }
      var isCreator = ev.creator_id === window.currentUser.id;
      var adminOk = typeof isAdmin === 'function' && isAdmin();
      if (!isCreator && !adminOk) {
        if (typeof showToast === 'function') showToast('Réservé à l’organisateur.', 'error');
        return;
      }

      var client = window.supabaseClient || window.supabase;
      if (!client) return;

      var parts = [];
      try {
        var res = await client
          .from('event_participants')
          .select('user_id, joined_at')
          .eq('event_id', eventId)
          .order('joined_at', { ascending: true });
        if (res.error) throw res.error;
        parts = res.data || [];
      } catch (e) {
        console.error('[guest list]', e);
        if (typeof showToast === 'function') showToast('Impossible de charger les participants.', 'error');
        return;
      }

      var ids = parts.map(function (p) { return p.user_id; }).filter(Boolean);
      var profilesMap = {};

      (window.profiles || []).forEach(function (p) {
        if (p && p.id && ids.indexOf(p.id) !== -1) profilesMap[p.id] = p;
      });

      var missing = ids.filter(function (id) { return !profilesMap[id]; });
      if (missing.length) {
        try {
          var pr = await client
            .from('profiles')
            .select('id, display_name, gender, city, country, age, role, is_admin')
            .in('id', missing);
          if (pr.error) {
            var pr2 = await client
              .from('map_profiles')
              .select('id, display_name, gender, city, country, age, role, is_admin')
              .in('id', missing);
            (pr2.data || []).forEach(function (r) { profilesMap[r.id] = r; });
          } else {
            (pr.data || []).forEach(function (r) { profilesMap[r.id] = r; });
          }
        } catch (e2) {
          console.warn('[guest list profiles]', e2);
        }
      }

      var memberIds = ids.filter(function (uid) {
        return !isStaffProfile(profilesMap[uid]);
      });

      var lines = memberIds.map(function (uid, i) {
        var p = profilesMap[uid] || {};
        var name = p.display_name || ('Participant ' + (i + 1));
        var gender = p.gender === 'Homme' ? '👨' : (p.gender === 'Femme' ? '👩' : '👤');
        var city = p.city || p.country || '';
        var age = p.age ? (p.age + ' ans') : '';
        var meta = [age, city].filter(Boolean).join(' · ');
        return (
          '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #e2e8f0">' +
          '<span style="font-size:22px">' + gender + '</span>' +
          '<div style="flex:1"><div style="font-weight:700">' + esc(name) + '</div>' +
          (meta ? '<div style="font-size:12px;color:#64748b">' + esc(meta) + '</div>' : '') +
          '</div></div>'
        );
      });

      var html =
        '<div style="padding:4px 0 12px">' +
        '<h3 style="margin:0 0 4px">📋 Participants</h3>' +
        '<p style="margin:0;font-size:13px;color:#64748b">' +
        memberIds.length + ' membre' + (memberIds.length > 1 ? 's' : '') +
        ' (staff exclu)</p></div>' +
        (lines.length
          ? lines.join('')
          : '<p style="color:#94a3b8;font-size:14px">Aucun participant pour le moment.</p>');

      ensureDescModal();
      var card = document.getElementById('aupygoDescCard');
      if (card) {
        card.innerHTML =
          '<button type="button" onclick="aupygoCloseDescModal()" style="float:right;border:0;background:0;font-size:22px;cursor:pointer">×</button>' +
          html +
          '<button type="button" class="btn btn-secondary" style="width:100%;margin-top:12px" onclick="aupygoCloseDescModal()">Fermer</button>';
        document.getElementById('aupygoDescOverlay').style.display = 'flex';
      }
    };
    window._aupygoGuestListPatched = window.openEventGuestList;
    if (typeof window.openSpecialGuestList === 'function') {
      window.openSpecialGuestList = function (id) { return window.openEventGuestList(id); };
    }
    return true;
  }

  function boot() {
    enhanceStaffCards();
    patchInviteModal();
    patchGuestList();
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

  console.log('[AUPYGO] logo + descriptif + participants sans staff — ready');
})();
