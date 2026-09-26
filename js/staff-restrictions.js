/* AUPYGO staff-restrictions.js v2
 * - Masque création sorties utilisateur pour le Staff
 * - Autorise Major / Sergent / Amiral à créer des événements Aupygo GRATUITS
 */
(function () {
  'use strict';

  function staffReady() {
    return typeof isStaff === 'function' && isStaff();
  }

  function canCreateAupygoEvents() {
    // Amiral + Major + Sergent (les deux branches)
    if (typeof isAmiral === 'function' && isAmiral()) return true;
    if (typeof isMajor === 'function' && isMajor()) return true;
    if (typeof isSergent === 'function' && isSergent()) return true;
    return staffReady();
  }

  function hideStaffCreateButtons() {
    if (!staffReady()) return;

    document.querySelectorAll('button, a, .btn, [role="button"]').forEach(function (btn) {
      var t = (btn.textContent || '').trim().toLowerCase();
      var oc = (btn.getAttribute('onclick') || '') + (btn.getAttribute('href') || '');

      // Garder les boutons « spécial Aupygo »
      if (/spécial aupygo|special aupygo|événement spécial|evenement special/i.test(t)) {
        if (canCreateAupygoEvents()) {
          btn.style.display = '';
          btn.disabled = false;
          btn.style.pointerEvents = 'auto';
          btn.style.opacity = '1';
        }
        return;
      }

      // Masquer création sorties communautaires / entre amis
      if (/organiser une sortie|sortie entre amis|créer une sortie|nouvelle sortie|créer un événement|creer un evenement/i.test(t)) {
        btn.style.display = 'none';
      }
    });

    // IDs connus de création utilisateur
    ['#btnCreateEvent', '#btnCreateFriendsEvent', '#btnOrgUser', '#btnOrgFriends',
      '#createEventBtn', '#btnOpenCreateEvent', '#agendaCreateBtn'].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (!el) return;
      var t = (el.textContent || '').toLowerCase();
      if (/spécial|special|aupygo/i.test(t)) {
        if (canCreateAupygoEvents()) {
          el.style.display = '';
          el.disabled = false;
        }
        return;
      }
      el.style.display = 'none';
    });

    // Sur Agenda : pas de création utilisateur ; le Staff crée depuis Sorties
    if (typeof getActivePage === 'function' && getActivePage() === 'agenda') {
      document.querySelectorAll('#agenda button, #agenda .btn').forEach(function (btn) {
        var t = (btn.textContent || '').toLowerCase();
        if (/créer|organiser|nouvelle sortie|nouvel événement/i.test(t) &&
            !/spécial aupygo|special aupygo/i.test(t)) {
          btn.style.display = 'none';
        }
      });
    }
  }

  function hideParticipationRequests() {
    if (!staffReady()) return;
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
  }

  function tick() {
    if (!staffReady()) return;
    hideStaffCreateButtons();
    hideParticipationRequests();
  }

  if (typeof window.go === 'function' && !window._staffRestrictGo) {
    window._staffRestrictGo = true;
    var prevGo = window.go;
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

  console.log('[AUPYGO] staff-restrictions.js v2 (Major/Sergent = events Aupygo gratuits)');
})();
