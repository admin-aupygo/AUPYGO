/* AUPYGO staff-events.js v4 — sans onglet Agenda Staff */
(function () {
  'use strict';
  if (typeof isStaff !== 'function') return;

  var PENDING_TAG = '[EN_ATTENTE_VALIDATION_ADMIN]';
  var STAFF_PRESENCE_TAG = '[STAFF_PRESENCE]';
  var STAFF_PRESENCE_LABEL = 'Une personne de l\'équipe Aupygo sera présente';
  var COUNTRY_TAG_RE = /\[HOST_COUNTRY:([^\]]+)\]/i;

  function isMemberStaffProfile(p) {
    if (!p) return false;
    if (p.is_admin === true) return true;
    var r = (p.role || '').toLowerCase();
    return r === 'admin_general' || r === 'host' || r === 'admin' || r === 'moderator';
  }

  function getEventById(eventId) {
    return (window.cachedEvents || []).find(function (e) { return e && e.id === eventId; });
  }

  function isUserCreatedEvent(ev) {
    if (!ev) return true;
    if (ev.is_special_aupygo === true) return false;
    if (ev.visibility === 'admin' || ev.visibility === 'admin_only') return false;
    if ((ev.description || '').indexOf(PENDING_TAG) !== -1) return false;
    var creator = (window.profiles || []).find(function (p) { return p && p.id === ev.creator_id; });
    if (creator && isMemberStaffProfile(creator)) return false;
    return true;
  }

  function isPendingApproval(ev) {
    return ev && ((ev.description || '').indexOf(PENDING_TAG) !== -1);
  }

  function hasStaffPresence(ev) {
    return ev && ((ev.description || '').indexOf(STAFF_PRESENCE_TAG) !== -1 ||
      (ev.description || '').indexOf('équipe Aupygo sera présente') !== -1);
  }

  function extractHostCountry(ev) {
    if (!ev) return null;
    var m = (ev.description || '').match(COUNTRY_TAG_RE);
    if (m) return m[1].trim();
    var creator = (window.profiles || []).find(function (p) { return p && p.id === ev.creator_id; });
    if (creator && isMemberStaffProfile(creator)) return creator.host_country || creator.country || null;
    return null;
  }

  function normalizeCountry(c) { return String(c || '').trim().toLowerCase(); }

  function getViewerCountry() {
    try {
      if (window.currentUserProfile) return window.currentUserProfile.host_country || window.currentUserProfile.country || null;
      var me = (window.profiles || []).find(function (p) { return p && window.currentUser && p.id === window.currentUser.id; });
      if (me) return me.host_country || me.country || null;
    } catch (e) {}
    return null;
  }

  function filterEventsByHostCountry(list) {
    if (!Array.isArray(list)) return list;
    if (typeof isStaff === 'function' && isStaff()) return list;
    var viewerCountry = normalizeCountry(getViewerCountry());
    return list.filter(function (ev) {
      if (isPendingApproval(ev)) return false;
      var hostC = extractHostCountry(ev);
      if (!hostC) return true;
      if (!viewerCountry) return true;
      return normalizeCountry(hostC) === viewerCountry;
    });
  }

  function injectStaffParticipationToggle() {
    if (!isStaff()) return;
    if (document.getElementById('staffParticipateToggle')) return;
    var anchors = [
      document.getElementById('createEventVisibility'),
      document.getElementById('createEventPrice'),
      document.getElementById('createEventAddress'),
      document.querySelector('#createEventForm')
    ];
    var anchor = null;
    for (var i = 0; i < anchors.length; i++) {
      if (anchors[i]) { anchor = anchors[i]; break; }
    }
    if (!anchor) return;
    var wrap = document.createElement('div');
    wrap.id = 'staffParticipateToggle';
    wrap.style.cssText = 'margin:14px 0;padding:12px 14px;background:#f1f5f9;border-radius:12px;border:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap';
    wrap.innerHTML =
      '<span style="font-weight:700;font-size:13px;color:#334155">Participation du STAFF</span>' +
      '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px">' +
      '<span id="staffPartLabel">Non</span>' +
      '<input type="checkbox" id="staffParticipateCheck" style="width:42px;height:22px;accent-color:#7c3aed">' +
      '</label>';
    var parent = anchor.closest('.form-group') || anchor.parentElement || anchor;
    try {
      if (parent.nextSibling) parent.parentNode.insertBefore(wrap, parent.nextSibling);
      else parent.parentNode.appendChild(wrap);
    } catch (e) {
      try { parent.appendChild(wrap); } catch (e2) {}
    }
    var chk = document.getElementById('staffParticipateCheck');
    var lab = document.getElementById('staffPartLabel');
    if (chk && lab) chk.addEventListener('change', function () { lab.textContent = chk.checked ? 'Oui' : 'Non'; });
  }

  function isStaffParticipating() {
    var chk = document.getElementById('staffParticipateCheck');
    return !!(chk && chk.checked);
  }

  function injectStaffPresenceBadges() {
    (window.cachedEvents || []).forEach(function (ev) {
      if (!hasStaffPresence(ev)) return;
      document.querySelectorAll('[data-event-id="' + ev.id + '"]').forEach(function (card) {
        if (card.querySelector('.staff-presence-badge')) return;
        var badge = document.createElement('div');
        badge.className = 'staff-presence-badge';
        badge.style.cssText = 'margin-top:8px;padding:6px 10px;background:#ecfdf5;border:1px solid #6ee7b7;border-radius:8px;font-size:12px;font-weight:700;color:#065f46';
        badge.textContent = '🛡️ ' + STAFF_PRESENCE_LABEL;
        card.appendChild(badge);
      });
    });
  }

  var _origJoin = window.joinRealEvent;
  if (typeof _origJoin === 'function') {
    window.joinRealEvent = async function (eventId) {
      if (isStaff()) {
        showToast('Les comptes Staff/Admin ne peuvent pas s\'inscrire aux sorties. Vue seule.', 'error');
        return;
      }
      var ev2 = getEventById(eventId);
      if (ev2 && isPendingApproval(ev2)) {
        showToast('Événement en attente de validation Admin.', 'error');
        return;
      }
      return _origJoin(eventId);
    };
  }

  function hideJoinAndAcceptRefuse() {
    if (!isStaff()) return;
    document.querySelectorAll(
      'button[onclick*="joinRealEvent"], button[onclick*="acceptEvent"], button[onclick*="refuseEvent"]'
    ).forEach(function (btn) {
      var t = (btn.textContent || '').toLowerCase();
      if (/approuver|validation/i.test(t)) return;
      if (/accepter|refuser|rejoindre|participer|s.inscrire/i.test(t) ||
          /joinRealEvent|acceptEvent|refuseEvent/.test(btn.getAttribute('onclick') || '')) {
        btn.style.display = 'none';
      }
    });
    if (typeof getActivePage === 'function' && getActivePage() === 'agenda') {
      document.querySelectorAll('#agenda button, #agendaCalendar button').forEach(function (btn) {
        var t = (btn.textContent || '').toLowerCase();
        if (/accepter|refuser|rejoindre|participer|agenda staff/i.test(t)) btn.style.display = 'none';
      });
    }
    // Supprimer explicitement les onglets Agenda Staff
    var tabs = document.getElementById('staffAgendaTabs');
    if (tabs) tabs.remove();
    var btnT = document.getElementById('staffAgendaTabTeam');
    if (btnT) btnT.remove();
  }

  var _origLoadEvents = window.loadAndRenderEvents;
  if (typeof _origLoadEvents === 'function') {
    window.loadAndRenderEvents = async function () {
      var r = await _origLoadEvents.apply(this, arguments);
      if (Array.isArray(window.cachedEvents)) {
        window.cachedEvents = filterEventsByHostCountry(window.cachedEvents);
      }
      setTimeout(hideJoinAndAcceptRefuse, 100);
      setTimeout(hideJoinAndAcceptRefuse, 500);
      setTimeout(injectPendingApprovalsPanel, 400);
      setTimeout(injectStaffPresenceBadges, 500);
      setTimeout(injectStaffParticipationToggle, 400);
      return r;
    };
  }

  setInterval(function () {
    if (isStaff() && typeof getActivePage === 'function' &&
        (getActivePage() === 'events' || getActivePage() === 'agenda')) {
      hideJoinAndAcceptRefuse();
      injectStaffPresenceBadges();
      injectStaffParticipationToggle();
    }
  }, 2000);

  var _origSubmit = window.submitCreateEvent;
  if (typeof _origSubmit === 'function') {
    window.submitCreateEvent = async function () {
      var hostCountry = null;
      var staffPart = isStaffParticipating();
      if (isStaff() && !(typeof isAdmin === 'function' && isAdmin())) {
        try {
          var res = await supabaseClient.from('profiles').select('host_country, country').eq('id', currentUser.id).maybeSingle();
          hostCountry = (res.data && (res.data.host_country || res.data.country)) || null;
        } catch (e) {}
      }
      var paidRadio = document.querySelector('input[name="eventPaid"]:checked');
      var wantsPaid = !!(paidRadio && paidRadio.value === 'paid');
      var priceEl = document.getElementById('createEventPrice');
      var priceVal = priceEl ? parseFloat(priceEl.value) : 0;
      var staffPaidPending = isStaff() && !(typeof isAdmin === 'function' && isAdmin()) && wantsPaid;

      if (staffPaidPending) {
        if (!priceVal || priceVal <= 0) {
          showToast('Montant valide (€) requis pour un événement payant.', 'error');
          return;
        }
        if (!confirm('💶 Événement payant — validation Admin obligatoire.\nMontant : ' + priceVal + ' €\nContinuer ?')) return;
      }

      var beforeIds = new Set((window.cachedEvents || []).map(function (e) { return e.id; }));
      await _origSubmit.apply(this, arguments);

      setTimeout(async function () {
        try {
          if (typeof loadAndRenderEvents === 'function') await loadAndRenderEvents();
          var newest = (window.cachedEvents || []).find(function (e) {
            return e && !beforeIds.has(e.id) && e.creator_id === currentUser.id;
          });
          if (!newest) {
            var mine = (window.cachedEvents || []).filter(function (e) { return e.creator_id === currentUser.id; });
            mine.sort(function (a, b) {
              return new Date(b.created_at || b.event_date) - new Date(a.created_at || a.event_date);
            });
            newest = mine[0];
          }
          if (!newest) return;
          var desc = newest.description || '';
          if (hostCountry && !COUNTRY_TAG_RE.test(desc)) desc = '[HOST_COUNTRY:' + hostCountry + ']\n' + desc;
          if (staffPart && desc.indexOf(STAFF_PRESENCE_TAG) === -1) {
            desc = STAFF_PRESENCE_TAG + '\n' + desc + '\n\n🛡️ ' + STAFF_PRESENCE_LABEL;
          }
          if (staffPaidPending) {
            if (desc.indexOf(PENDING_TAG) === -1) desc = PENDING_TAG + '\n' + desc;
            await supabaseClient.from('events').update({
              description: desc.trim(), visibility: 'admin', is_paid: true, price: priceVal
            }).eq('id', newest.id);
            showToast('Événement payant soumis — en attente de validation Admin.', 'success');
          } else {
            var payload = { description: desc.trim() };
            if (typeof isAdmin === 'function' && isAdmin() && wantsPaid) {
              payload.is_paid = true;
              payload.price = priceVal;
            }
            await supabaseClient.from('events').update(payload).eq('id', newest.id);
            if (staffPart) {
              try {
                await supabaseClient.from('event_participants').insert({ event_id: newest.id, user_id: currentUser.id });
              } catch (e3) {}
            }
          }
          if (typeof loadAndRenderEvents === 'function') await loadAndRenderEvents();
        } catch (err) {
          console.warn('[Staff events]', err);
        }
      }, 900);
    };
  }

  window.adminApproveEvent = async function (eventId) {
    if (!(typeof isAdmin === 'function' && isAdmin())) return;
    try {
      var ev = getEventById(eventId);
      if (!ev) return;
      var desc = (ev.description || '').replace(PENDING_TAG, '').trim();
      var { error } = await supabaseClient.from('events').update({
        description: desc || null, visibility: 'public'
      }).eq('id', eventId);
      if (error) throw error;
      showToast('Événement approuvé et publié.', 'success');
      if (typeof loadAndRenderEvents === 'function') await loadAndRenderEvents();
      injectPendingApprovalsPanel();
    } catch (e) {
      showToast('Erreur: ' + (e.message || e), 'error');
    }
  };

  window.adminRejectEvent = async function (eventId) {
    if (!(typeof isAdmin === 'function' && isAdmin())) return;
    if (!confirm('Refuser / supprimer cet événement en attente ?')) return;
    try {
      var { error } = await supabaseClient.from('events').delete().eq('id', eventId);
      if (error) throw error;
      showToast('Événement refusé / supprimé.', 'success');
      if (typeof loadAndRenderEvents === 'function') await loadAndRenderEvents();
      injectPendingApprovalsPanel();
    } catch (e) {
      showToast('Erreur: ' + (e.message || e), 'error');
    }
  };

  function injectPendingApprovalsPanel() {
    if (!(typeof isAdmin === 'function' && isAdmin())) return;
    var page = document.getElementById('events') || document.getElementById('agenda');
    if (!page) return;
    var pending = (window.cachedEvents || []).filter(isPendingApproval);
    var box = document.getElementById('staffPendingApprovals');
    if (!pending.length) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement('div');
      box.id = 'staffPendingApprovals';
      box.style.cssText = 'background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:14px;margin:12px 0;';
      page.insertBefore(box, page.firstChild);
    }
    box.innerHTML = '<div style="font-weight:800;margin-bottom:10px">⏳ Événements payants en attente (' + pending.length + ')</div>' +
      pending.map(function (ev) {
        return '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 0;border-top:1px solid #fed7aa">' +
          '<div style="flex:1;min-width:160px"><strong>' + (ev.title || 'Sans titre') + '</strong></div>' +
          '<button type="button" class="btn btn-primary" style="font-size:12px" onclick="window.adminApproveEvent(\'' + ev.id + '\')">✅ Approuver</button>' +
          '<button type="button" class="btn btn-secondary" style="font-size:12px" onclick="window.adminRejectEvent(\'' + ev.id + '\')">✖️ Refuser</button></div>';
      }).join('');
  }

  var prevGo = window.go;
  if (typeof prevGo === 'function' && !window._staffEventsGoPatched) {
    window._staffEventsGoPatched = true;
    window.go = function (page) {
      prevGo(page);
      if (page === 'events' || page === 'agenda') {
        setTimeout(hideJoinAndAcceptRefuse, 400);
        setTimeout(injectPendingApprovalsPanel, 500);
        setTimeout(injectStaffParticipationToggle, 500);
        setTimeout(injectStaffPresenceBadges, 600);
      }
    };
  }

  setTimeout(function () {
    if (isStaff()) {
      hideJoinAndAcceptRefuse();
      injectPendingApprovalsPanel();
      injectStaffParticipationToggle();
    }
  }, 1500);

  console.log('[AUPYGO] staff-events.js v4 (sans Agenda Staff)');
})();
