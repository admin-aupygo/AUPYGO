/* AUPYGO — agenda-week-nav.js
 * Navigation hebdomadaire + sélecteur de date
 * Pour TOUS les utilisateurs (User + Staff)
 * Pages : Sorties (#events) et Agenda (#agenda)
 */
(function () {
  'use strict';

  var DAYS_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  var MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

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

  // État global partagé avec getCurrentWeekDays (surcharge)
  window.__agendaWeekStart = window.__agendaWeekStart || startOfWeek(new Date());

  // Surcharge getCurrentWeekDays pour respecter la semaine navigable
  window.getCurrentWeekDays = function getCurrentWeekDays() {
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
        key: d.getFullYear() + '-' +
          String(d.getMonth() + 1).padStart(2, '0') + '-' +
          String(d.getDate()).padStart(2, '0')
      });
    }
    return out;
  };

  function refreshCalendars() {
    try {
      if (typeof renderEventsAgenda === 'function' && window.cachedEvents) {
        renderEventsAgenda(window.cachedEvents);
      }
      if (typeof renderCommunityAgenda === 'function' && window.cachedEvents) {
        renderCommunityAgenda(window.cachedEvents);
      }
      if (typeof renderPersonalAgenda === 'function' && window.cachedEvents) {
        renderPersonalAgenda(window.cachedEvents);
      }
      if (typeof renderEventGridFiltered === 'function') renderEventGridFiltered();
      if (typeof updateMyAgendaList === 'function') updateMyAgendaList();
      if (typeof loadAndRenderEvents === 'function') {
        // re-render listes si besoin (léger)
      }
    } catch (e) {
      console.warn('[agenda-nav] refresh', e);
    }
    syncNavLabels();
  }

  function shiftWeek(delta) {
    window.__agendaWeekStart = addDays(window.__agendaWeekStart || startOfWeek(new Date()), delta * 7);
    try { window.selectedAgendaDay = null; } catch (e) {}
    refreshCalendars();
  }

  function goToDate(dateObj) {
    if (!dateObj || isNaN(dateObj.getTime())) return;
    window.__agendaWeekStart = startOfWeek(dateObj);
    var key = dateObj.getFullYear() + '-' +
      String(dateObj.getMonth() + 1).padStart(2, '0') + '-' +
      String(dateObj.getDate()).padStart(2, '0');
    try { window.selectedAgendaDay = key; } catch (e) {}
    refreshCalendars();
  }

  function goToday() {
    var t = new Date();
    t.setHours(0, 0, 0, 0);
    goToDate(t);
  }

  function injectNav(anchorId, navId) {
    var anchor = document.getElementById(anchorId);
    if (!anchor) return;
    var host = anchor.parentElement || anchor;
    var existing = document.getElementById(navId);
    if (existing) return existing;

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

    nav.querySelector('.aupygo-week-prev').onclick = function () { shiftWeek(-1); };
    nav.querySelector('.aupygo-week-next').onclick = function () { shiftWeek(1); };
    nav.querySelector('.aupygo-week-today').onclick = function () { goToday(); };
    nav.querySelector('.aupygo-week-go').onclick = function () {
      var inp = nav.querySelector('.aupygo-week-picker');
      if (!inp || !inp.value) return;
      var parts = inp.value.split('-');
      if (parts.length !== 3) return;
      goToDate(new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
    };
    return nav;
  }

  function syncNavLabels() {
    var monday = window.__agendaWeekStart || startOfWeek(new Date());
    var label = fmtRange(monday);
    document.querySelectorAll('.aupygo-week-range').forEach(function (el) {
      el.textContent = label;
    });
    var iso = monday.getFullYear() + '-' +
      String(monday.getMonth() + 1).padStart(2, '0') + '-' +
      String(monday.getDate()).padStart(2, '0');
    document.querySelectorAll('.aupygo-week-picker').forEach(function (inp) {
      if (!inp.value) {
        var sel = window.selectedAgendaDay;
        if (sel) inp.value = sel;
        else {
          var t = new Date();
          inp.value = t.getFullYear() + '-' +
            String(t.getMonth() + 1).padStart(2, '0') + '-' +
            String(t.getDate()).padStart(2, '0');
        }
      }
    });
  }

  function ensureNavs() {
    // Agenda page calendar
    injectNav('agendaCalendar', 'agendaWeekNav');
    // Events page — chercher calendrier communauté ou grille
    var eventCal = document.getElementById('eventsCalendar') ||
      document.getElementById('communityCalendar') ||
      document.querySelector('#events .agenda-week') ||
      document.getElementById('eventGrid');
    if (eventCal && eventCal.id) {
      injectNav(eventCal.id, 'eventsWeekNav');
    } else if (eventCal) {
      // pas d'id : injecter avant la grille
      if (!document.getElementById('eventsWeekNav')) {
        var nav = document.createElement('div');
        nav.id = 'eventsWeekNavPlaceholder';
        eventCal.parentNode.insertBefore(nav, eventCal);
        nav.id = 'eventsWeekNavAnchor';
        injectNav('eventsWeekNavAnchor', 'eventsWeekNav');
      }
    }
    // Personal calendar on profile
    if (document.getElementById('personalCalendar')) {
      injectNav('personalCalendar', 'personalWeekNav');
    }
    syncNavLabels();
  }

  var prevGo = window.go;
  if (typeof prevGo === 'function' && !window._agendaWeekNavGo) {
    window._agendaWeekNavGo = true;
    window.go = function (page) {
      prevGo(page);
      if (page === 'agenda' || page === 'events' || page === 'profile') {
        setTimeout(ensureNavs, 200);
        setTimeout(ensureNavs, 600);
        setTimeout(refreshCalendars, 700);
      }
    };
  }

  // Après chargement des events
  var _origLoad = window.loadAndRenderEvents;
  if (typeof _origLoad === 'function' && !window._agendaWeekNavLoad) {
    window._agendaWeekNavLoad = true;
    window.loadAndRenderEvents = async function () {
      var r = await _origLoad.apply(this, arguments);
      setTimeout(ensureNavs, 100);
      setTimeout(syncNavLabels, 150);
      return r;
    };
  }

  setTimeout(ensureNavs, 800);
  setTimeout(ensureNavs, 2000);

  console.log('[AUPYGO] agenda-week-nav.js (tous utilisateurs)');
})();
