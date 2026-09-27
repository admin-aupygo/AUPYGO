/* AUPYGO staff-restrictions.js v3
 * - Masque création sorties utilisateur pour le Staff
 * - Injecte bouton « Créer événement Aupygo » (gratuit) pour Amiral / Major / Sergent
 * - Payants uniquement Amiral (géré dans staff-events.js)
 */
(function () {
  'use strict';

  function staffReady() {
    return typeof isStaff === 'function' && isStaff();
  }

  function canCreateAupygoEvents() {
    if (typeof isAmiral === 'function' && isAmiral()) return true;
    if (typeof isMajor === 'function' && isMajor()) return true;
    if (typeof isSergent === 'function' && isSergent()) return true;
    return staffReady();
  }

  function hideStaffCreateButtons() {
    if (!staffReady()) return;

    document.querySelectorAll('button, a, .btn, [role="button"]').forEach(function (btn) {
      var t = (btn.textContent || '').trim().toLowerCase();

      if (/spécial aupygo|special aupygo|événement spécial|evenement special|événement aupygo|evenement aupygo|créer événement aupygo/i.test(t)) {
        if (canCreateAupygoEvents()) {
          btn.style.display = '';
          btn.disabled = false;
          btn.style.pointerEvents = 'auto';
          btn.style.opacity = '1';
        }
        return;
      }

      if (/organiser une sortie|sortie entre amis|créer une sortie|nouvelle sortie|créer un événement|creer un evenement/i.test(t)) {
        if (!/aupygo|spécial|special/i.test(t)) {
          btn.style.display = 'none';
        }
      }
    });

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

    if (typeof getActivePage === 'function' && getActivePage() === 'agenda') {
      document.querySelectorAll('#agenda button, #agenda .btn').forEach(function (btn) {
        var t = (btn.textContent || '').toLowerCase();
        if (/créer|organiser|nouvelle sortie|nouvel événement/i.test(t) &&
            !/spécial aupygo|special aupygo|aupygo/i.test(t)) {
          btn.style.display = 'none';
        }
      });
    }
  }

  function injectStaffCreateEventBtn() {
    if (!staffReady() || !canCreateAupygoEvents()) return;

    var page = document.getElementById('events');
    if (!page) return;
    if (document.getElementById('staffCreateAupygoBtn')) {
      var existing = document.getElementById('staffCreateAupygoBtn');
      existing.style.display = '';
      existing.disabled = false;
      return;
    }

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'staffCreateAupygoBtn';
    btn.className = 'btn btn-primary';
    btn.style.cssText = 'margin:12px 0;width:100%;max-width:420px;font-weight:700;';
    btn.textContent = '🛡️ Créer un événement Aupygo (gratuit)';
    btn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      var openers = [
        document.getElementById('btnOpenCreateEvent'),
        document.getElementById('createEventBtn'),
        document.querySelector('[onclick*="openCreateEvent"]'),
        document.querySelector('[onclick*="showCreateEvent"]')
      ];
      var opened = false;
      for (var i = 0; i < openers.length; i++) {
        if (openers[i]) {
          try {
            openers[i].style.display = '';
            openers[i].click();
            opened = true;
            break;
          } catch (err) {}
        }
      }
      if (!opened && typeof window.openCreateEvent === 'function') {
        window.openCreateEvent();
        opened = true;
      }
      if (!opened) {
        var form = document.getElementById('createEventForm') || document.querySelector('#createEventModal, .create-event-modal');
        if (form) {
          form.style.display = '';
          form.classList.add('active', 'show');
          opened = true;
        }
      }
      if (!opened && typeof showToast === 'function') {
        showToast('Ouvre Sorties puis utilise le formulaire de création d\'événement.', 'success');
      }
      setTimeout(function () {
        var paidFree = document.querySelector('input[name="eventPaid"][value="free"]');
        if (paidFree) paidFree.checked = true;
        var vis = document.getElementById('createEventVisibility');
        if (vis) {
          try { vis.value = 'public'; } catch (e2) {}
        }
      }, 300);
    };

    var anchor = page.querySelector('.section-title') || page.firstChild;
    if (anchor && anchor.parentNode) {
      if (anchor.nextSibling) anchor.parentNode.insertBefore(btn, anchor.nextSibling);
      else anchor.parentNode.appendChild(btn);
    } else {
      page.insertBefore(btn, page.firstChild);
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
    injectStaffCreateEventBtn();
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

  console.log('[AUPYGO] staff-restrictions.js v3 (bouton Créer événement Aupygo)');
})();
