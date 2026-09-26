/* AUPYGO — agenda-week-nav.js
 * Navigation hebdomadaire + sélecteur de date
 * Pour TOUS les utilisateurs (User + Staff)
 * Pages : Sorties (#events) et Agenda (#agenda)
 *
 * Fix : délégation d'événements (handlers jamais perdus) +
 * surcharge fiable de getCurrentWeekDays.
 */
(function () {
  'use strict';

  function startOfWeek(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var day = (x.getDay() + 6) % 7; // lundi = 0
    x.setDate(x.getDate() - day);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function addDays(d, n) {
    var x = new Date(d.getTime());
    x.setDate(x.getDate() + n);
    return x;
  }

  function fmtRange(monday) {
    var end = addDays(monday, 6);
    function dd(d) {
      return String(d.getDate()).padStart(2, '0') + '/' +
        String(d.getMonth() + 1).padStart(2, '0');
    }
    return dd(monday) + ' → ' + dd(end) + ' ' + monday.getFullYear();
  }

  function padKey(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  window.__agendaWeekStart = window.__agendaWeekStart || startOfWeek(new Date());

  function overriddenGetCurrentWeekDays() {
    var names = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    var monday = window.__agendaWeekStart || startOfWeek(new Date());
    var out = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      out.push({
        name: names[i],
        date: d,
        dayNum: d.getDate(),
        monthNum: d.getMonth() + 1,
        key: padKey(d)
      });
    }
    return out;
  }

  // Surcharge durable (y compris si app.js redéfinit la fonction)
  function installGetCurrentWeekDays() {
    try {
      window.getCurrentWeekDays = overriddenGetCurrentWeekDays;
      // Aussi sur le scope global non-window si besoin
      if (typeof getCurrentWeekDays !== 'undefined') {
        try { getCurrentWeekDays = overriddenGetCurrentWeekDays; } catch (e) {}
      }
    } catch (e) {
      window.getCurrentWeekDays = overriddenGetCurrentWeekDays;
    }
  }
  installGetCurrentWeekDays();

  function refreshCalendars() {
    installGetCurrentWeekDays();
    try {
      var events = window.cachedEvents || [];
      if (typeof renderEventsAgenda === 'function') renderEventsAgenda(events);
      if (typeof renderCommunityAgenda === 'function') renderCommunityAgenda(events);
      if (typeof renderPersonalAgenda === 'function') renderPersonalAgenda(events);
      if (typeof renderEventGridFiltered === 'function') renderEventGridFiltered();
      if (typeof updateMyAgendaList === 'function') updateMyAgendaList();
      // Re-render grille événements si présente
      if (typeof renderEventCards === 'function') {
        try { renderEventCards(events); } catch (e0) {}
      }
    } catch (e) {
      console.warn('[agenda-nav] refresh', e);
    }
    syncNavLabels();
  }

  function shiftWeek(delta) {
    window.__agendaWeekStart = addDays(window.__agendaWeekStart || startOfWeek(new Date()), delta * 7);
    try { window.selectedAgendaDay = null; } catch (e) {}
    try { selectedAgendaDay = null; } catch (e2) {}
    refreshCalendars();
  }

  function goToDate(dateObj) {
    if (!dateObj || isNaN(dateObj.getTime())) return;
    window.__agendaWeekStart = startOfWeek(dateObj);
    var key = padKey(dateObj);
    try { window.selectedAgendaDay = key; } catch (e) {}
    try { selectedAgendaDay = key; } catch (e2) {}
    refreshCalendars();
  }

  function goToday() {
    var t = new Date();
    t.setHours(0, 0, 0, 0);
    goToDate(t);
  }

  // Délégation globale — les boutons marchent même si le DOM est régénéré
  if (!window._agendaWeekNavDelegated) {
    window._agendaWeekNavDelegated = true;
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var prev = t.closest('.aupygo-week-prev');
      var next = t.closest('.aupygo-week-next');
      var today = t.closest('.aupygo-week-today');
      var goBtn = t.closest('.aupygo-week-go');
      if (prev) {
        e.preventDefault();
        e.stopPropagation();
        shiftWeek(-1);
        return;
      }
      if (next) {
        e.preventDefault();
        e.stopPropagation();
        shiftWeek(1);
        return;
      }
      if (today) {
        e.preventDefault();
        e.stopPropagation();
        goToday();
        return;
      }
      if (goBtn) {
        e.preventDefault();
        e.stopPropagation();
        var nav = goBtn.closest('.aupygo-week-nav');
        var inp = nav ? nav.querySelector('.aupygo-week-picker') : null;
        if (!inp || !inp.value) return;
        var parts = String(inp.value).split('-');
        if (parts.length !== 3) return;
        goToDate(new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
      }
    }, true);
  }

  function injectNav(anchorId, navId) {
    var anchor = document.getElementById(anchorId);
    if (!anchor) return null;
    var host = anchor.parentElement || anchor;
    var existing = document.getElementById(navId);
    if (existing) {
      syncNavLabels();
      return existing;
    }

    var nav = document.createElement('div');
    nav.id = navId;
    nav.className = 'aupygo-week-nav';
    nav.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:10px 0 14px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px';
    nav.innerHTML =
      '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
        '<button type="button" class="btn btn-secondary aupygo-week-prev" style="padding:6px 12px;font-size:13px">◀ Semaine</button>' +
        '<button type="button" class="btn btn-secondary aupygo-week-today" style="padding:6px 12px;font-size:13px">Aujourd\'hui</button>' +
        '<button type="button" class="btn btn-secondary aupygo-week-next" style="padding:6px 12px;font-size:13px">Semaine ▶</button>' +
      '</div>' +
      '<div class="aupygo-week-range" style="font-weight:700;font-size:13px;color:#334155;min-width:140px"></div>' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-left:auto">' +
        '<label style="font-size:12px;font-weight:600;color:#64748b">Aller au</label>' +
        '<input type="date" class="aupygo-week-picker" style="padding:6px 10px;border-radius:8px;border:1px solid #e2e8f0;font-size:13px">' +
        '<button type="button" class="btn btn-primary aupygo-week-go" style="padding:6px 12px;font-size:13px">Aller</button>' +
      '</div>';

    try {
      host.insertBefore(nav, anchor);
    } catch (e) {
      host.appendChild(nav);
    }
    syncNavLabels();
    return nav;
  }

  function syncNavLabels() {
    var monday = window.__agendaWeekStart || startOfWeek(new Date());
    var label = fmtRange(monday);
    document.querySelectorAll('.aupygo-week-range').forEach(function (el) {
      el.textContent = label;
    });
    var today = new Date();
    var todayIso = padKey(today);
    var sel = window.selectedAgendaDay || todayIso;
    document.querySelectorAll('.aupygo-week-picker').forEach(function (inp) {
      // Toujours refléter la sélection courante si vide ou après navigation
      if (!inp.dataset.userPicked) {
        inp.value = sel;
      }
    });
  }

  function ensureNavs() {
    installGetCurrentWeekDays();
    injectNav('agendaCalendar', 'agendaWeekNav');

    var eventCal = document.getElementById('eventsCalendar') ||
      document.getElementById('communityCalendar') ||
      document.querySelector('#events .agenda-week') ||
      document.getElementById('eventGrid');
    if (eventCal && eventCal.id) {
      injectNav(eventCal.id, 'eventsWeekNav');
    } else if (eventCal && eventCal.parentNode) {
      if (!document.getElementById('eventsWeekNav')) {
        var ph = document.createElement('div');
        ph.id = 'eventsWeekNavAnchor';
        eventCal.parentNode.insertBefore(ph, eventCal);
        injectNav('eventsWeekNavAnchor', 'eventsWeekNav');
      }
    }

    if (document.getElementById('personalCalendar')) {
      injectNav('personalCalendar', 'personalWeekNav');
    }
    syncNavLabels();
  }

  // Patch go()
  var prevGo = window.go;
  if (typeof prevGo === 'function' && !window._agendaWeekNavGo) {
    window._agendaWeekNavGo = true;
    window.go = function (page) {
      prevGo(page);
      if (page === 'agenda' || page === 'events' || page === 'profile') {
        setTimeout(ensureNavs, 150);
        setTimeout(ensureNavs, 500);
        setTimeout(refreshCalendars, 600);
      }
    };
  }

  // Après chargement des events
  var _origLoad = window.loadAndRenderEvents;
  if (typeof _origLoad === 'function' && !window._agendaWeekNavLoad) {
    window._agendaWeekNavLoad = true;
    window.loadAndRenderEvents = async function () {
      var r = await _origLoad.apply(this, arguments);
      setTimeout(ensureNavs, 80);
      setTimeout(function () {
        installGetCurrentWeekDays();
        syncNavLabels();
      }, 120);
      return r;
    };
  }

  // Réinstaller périodiquement au cas où app.js redéfinit getCurrentWeekDays
  setInterval(function () {
    installGetCurrentWeekDays();
  }, 2000);

  setTimeout(ensureNavs, 600);
  setTimeout(ensureNavs, 1500);
  setTimeout(ensureNavs, 3000);

  // API debug
  window.__agendaShiftWeek = shiftWeek;
  window.__agendaGoToday = goToday;
  window.__agendaGoToDate = goToDate;

  console.log('[AUPYGO] agenda-week-nav.js v2 (délégation + surcharge fiable)');
})();
