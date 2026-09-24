/* AUPYGO staff-restrictions.js — boutons sorties / agenda / demandes */
(function () {
  'use strict';
  if (typeof isStaff !== 'function') return;

  function hideStaffCreateButtons() {
    if (!isStaff()) return;

    document.querySelectorAll('button, a, .btn, [role="button"]').forEach(function (btn) {
      var t = (btn.textContent || '').trim().toLowerCase();
      var oc = (btn.getAttribute('onclick') || '') + (btn.getAttribute('href') || '');

      if (/organiser une sortie|sortie entre amis|créer une sortie/i.test(t)) {
        if (/spécial|special|aupygo/i.test(t)) return;
        btn.style.display = 'none';
      }

      if (typeof getActivePage === 'function' && getActivePage() === 'agenda') {
        if (/créer|organiser|nouvelle sortie|nouvel événement|spécial aupygo|special aupygo/i.test(t)) {
          btn.style.display = 'none';
        }
      }
    });

    ['#btnCreateEvent', '#btnCreateFriendsEvent', '#btnOrgUser', '#btnOrgFriends',
      '#createEventBtn', '#btnOpenCreateEvent', '#agendaCreateBtn'].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el) el.style.display = 'none';
    });

    document.querySelectorAll('button, .btn').forEach(function (btn) {
      var t = (btn.textContent || '').toLowerCase();
      if (/événement spécial aupygo|evenement special aupygo|spécial aupygo/i.test(t)) {
        if (typeof getActivePage === 'function' && getActivePage() === 'agenda') {
          btn.style.display = 'none';
        } else {
          btn.style.display = '';
        }
      }
    });
  }

  function hideParticipationRequests() {
    if (!isStaff()) return;
    var uid = window.currentUser && window.currentUser.id;

    document.querySelectorAll(
      '.event-join-request, .participation-request, [data-join-request], .event-requests'
    ).forEach(function (el) {
      var card = el.closest('[data-event-id], .event-card, .event-item') || el;
      var eid = card.getAttribute('data-event-id');
      var ev = null;
      if (eid && window.cachedEvents) {
        ev = window.cachedEvents.find(function (e) { return e && e.id === eid; });
      }
      if (ev && uid && ev.creator_id === uid) {
        el.style.display = '';
      } else {
        el.style.display = 'none';
      }
    });

    document.querySelectorAll('#eventRequestsList, #joinRequestsPanel').forEach(function (panel) {
      panel.querySelectorAll('[data-event-id]').forEach(function (row) {
        var eid = row.getAttribute('data-event-id');
        var ev = (window.cachedEvents || []).find(function (e) { return e && e.id === eid; });
        if (!ev || !uid || ev.creator_id !== uid) row.style.display = 'none';
      });
    });
  }

  function tick() {
    if (!isStaff()) return;
    hideStaffCreateButtons();
    hideParticipationRequests();
  }

  var prevGo = window.go;
  if (typeof prevGo === 'function' && !window._staffRestrictGo) {
    window._staffRestrictGo = true;
    window.go = function (page) {
      prevGo(page);
      if (page === 'events' || page === 'agenda' || page === 'home') {
        setTimeout(tick, 200);
        setTimeout(tick, 800);
      }
    };
  }

  setTimeout(tick, 800);
  setInterval(tick, 2500);

  console.log('[AUPYGO] staff-restrictions.js chargé');
})();
