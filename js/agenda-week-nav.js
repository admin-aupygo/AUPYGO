/* AUPYGO — agenda-week-nav.js v4
 * Navigation hebdomadaire pour Agenda communautaire + Sorties + Profil
 * v4 : styles via classes CSS (compatible mode sombre, plus de background:#fff inline)
 */
(function () {
  'use strict';

  function startOfWeek(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var day = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - day);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function addDays(d, n) {
    var x = new Date(d.getTime());
    x.setDate(x.getDate() + n);
    return x;
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function padKey(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function fmtRange(monday) {
    var end = addDays(monday, 6);
    return pad2(monday.getDate()) + '/' + pad2(monday.getMonth() + 1) +
      ' → ' + pad2(end.getDate()) + '/' + pad2(end.getMonth() + 1) +
      ' ' + monday.getFullYear();
  }

  window.__agendaWeekStart = window.__agendaWeekStart || startOfWeek(new Date());

  function weekDays() {
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

  window.getCurrentWeekDays = weekDays;
  try { getCurrentWeekDays = weekDays; } catch (e) {}

  function dayKeyFromIso(iso) {
    if (typeof eventDayKey === 'function') {
      try { return eventDayKey(iso); } catch (e) {}
    }
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return padKey(d);
  }

  function buildWeekHtml(events) {
    var week = weekDays();
    var byDay = {};
    week.forEach(function (w) { byDay[w.key] = []; });
    (events || []).forEach(function (ev) {
      var k = dayKeyFromIso(ev.event_date);
      if (byDay[k]) byDay[k].push(ev);
    });
    var today = new Date();
    var sel = (typeof selectedAgendaDay !== 'undefined') ? selectedAgendaDay : window.selectedAgendaDay;

    return week.map(function (w) {
      var items = byDay[w.key] || [];
      var count = items.length;
      var isToday = w.date.toDateString() === today.toDateString();
      var isSel = sel === w.key;
      var hasPending = false;
      try {
        if (typeof pendingEventInviteIds !== 'undefined' && pendingEventInviteIds) {
          hasPending = items.some(function (ev) { return pendingEventInviteIds.has(ev.id); });
        }
      } catch (e) {}

      var dots = count > 0
        ? '<span class="day-count' + (hasPending ? ' day-pending-blink' : '') + '">' +
            count + ' sortie' + (count > 1 ? 's' : '') + '</span>'
        : '<span class="day-empty">—</span>';

      return '<div class="day day-clickable' +
        (isToday ? ' day-today' : '') +
        (isSel ? ' day-selected' : '') +
        (hasPending ? ' day-pending-blink' : '') +
        '" data-day-key="' + w.key + '" onclick="selectAgendaDay(\'' + w.key + '\')">' +
        '<strong>' + w.name + ' <span class="day-date">' +
        pad2(w.dayNum) + '/' + pad2(w.monthNum) +
        '</span></strong>' + dots + '</div>';
    }).join('');
  }

  function patchBuilders() {
    window.getCurrentWeekDays = weekDays;
    try { getCurrentWeekDays = weekDays; } catch (e) {}

    if (typeof window.buildWeekCalendarHtml === 'function' || typeof buildWeekCalendarHtml === 'function') {
      window.buildWeekCalendarHtml = buildWeekHtml;
      try { buildWeekCalendarHtml = buildWeekHtml; } catch (e2) {}
    } else {
      window.buildWeekCalendarHtml = buildWeekHtml;
    }
  }

  function renderAll() {
    patchBuilders();
    var events = [];
    try { events = window.cachedEvents || cachedEvents || []; } catch (e) { events = window.cachedEvents || []; }

    var cal = document.getElementById('agendaCalendar');
    if (cal) {
      try {
        if (typeof renderCommunityAgenda === 'function') {
          renderCommunityAgenda(events);
        } else {
          var publicOnes = (events || []).filter(function (e) {
            var v = e.visibility;
            return (v === 'public' || v === 'admin' || v === 'admin_only') && v !== 'friends';
          });
          cal.innerHTML = publicOnes.length ? buildWeekHtml(publicOnes)
            : '<p class="footer-muted" style="grid-column:1/-1;padding:12px">Aucune sortie communautaire pour le moment.</p>';
        }
      } catch (err) {
        console.warn('[agenda-nav] community', err);
        try { cal.innerHTML = buildWeekHtml(events); } catch (e3) {}
      }
    }

    try { if (typeof renderEventsAgenda === 'function') renderEventsAgenda(events); } catch (e4) {}
    try { if (typeof renderPersonalAgenda === 'function') renderPersonalAgenda(events); } catch (e5) {}
    try { if (typeof renderEventGridFiltered === 'function') renderEventGridFiltered(); } catch (e6) {}
    try { if (typeof updateMyAgendaList === 'function') updateMyAgendaList(); } catch (e7) {}

    syncNavLabels();
  }

  function shiftWeek(delta) {
    window.__agendaWeekStart = addDays(window.__agendaWeekStart || startOfWeek(new Date()), delta * 7);
    try { selectedAgendaDay = null; } catch (e) {}
    try { window.selectedAgendaDay = null; } catch (e2) {}
    renderAll();
  }

  function goToDate(dateObj) {
    if (!dateObj || isNaN(dateObj.getTime())) return;
    window.__agendaWeekStart = startOfWeek(dateObj);
    var key = padKey(dateObj);
    try { selectedAgendaDay = key; } catch (e) {}
    try { window.selectedAgendaDay = key; } catch (e2) {}
    renderAll();
  }

  function goToday() {
    var t = new Date();
    t.setHours(0, 0, 0, 0);
    goToDate(t);
  }

  if (!window._agendaWeekNavDelegated) {
    window._agendaWeekNavDelegated = true;
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;

      if (t.closest('.aupygo-week-prev')) {
        e.preventDefault(); e.stopPropagation();
        shiftWeek(-1);
        return;
      }
      if (t.closest('.aupygo-week-next')) {
        e.preventDefault(); e.stopPropagation();
        shiftWeek(1);
        return;
      }
      if (t.closest('.aupygo-week-today')) {
        e.preventDefault(); e.stopPropagation();
        goToday();
        return;
      }
      if (t.closest('.aupygo-week-go')) {
        e.preventDefault(); e.stopPropagation();
        var nav = t.closest('.aupygo-week-nav');
        var inp = nav && nav.querySelector('.aupygo-week-picker');
        if (!inp || !inp.value) return;
        var p = String(inp.value).split('-');
        if (p.length !== 3) return;
        goToDate(new Date(+p[0], +p[1] - 1, +p[2]));
      }
    }, true);
  }

  function injectNav(anchorId, navId) {
    var anchor = document.getElementById(anchorId);
    if (!anchor) return null;
    var host = anchor.parentElement || anchor;
    var existing = document.getElementById(navId);
    if (existing) {
      // Nettoyer d'anciens inline blancs (v3)
      existing.style.background = '';
      existing.style.borderColor = '';
      existing.classList.add('aupygo-week-nav');
      syncNavLabels();
      return existing;
    }

    var nav = document.createElement('div');
    nav.id = navId;
    nav.className = 'aupygo-week-nav';
    // Pas de background/border en inline — gérés par CSS clair + dark-theme-admin
    nav.innerHTML =
      '<div class="aupygo-week-nav-left">' +
        '<button type="button" class="btn btn-secondary aupygo-week-prev">◀ Semaine</button>' +
        '<button type="button" class="btn btn-secondary aupygo-week-today">Aujourd\'hui</button>' +
        '<button type="button" class="btn btn-secondary aupygo-week-next">Semaine ▶</button>' +
      '</div>' +
      '<div class="aupygo-week-range"></div>' +
      '<div class="aupygo-week-nav-right">' +
        '<label class="aupygo-week-label">Aller au</label>' +
        '<input type="date" class="aupygo-week-picker">' +
        '<button type="button" class="btn btn-primary aupygo-week-go">Aller</button>' +
      '</div>';

    try { host.insertBefore(nav, anchor); }
    catch (e) { host.appendChild(nav); }
    syncNavLabels();
    return nav;
  }

  function syncNavLabels() {
    var monday = window.__agendaWeekStart || startOfWeek(new Date());
    var label = fmtRange(monday);
    document.querySelectorAll('.aupygo-week-range').forEach(function (el) {
      el.textContent = label;
    });
    var sel = window.selectedAgendaDay;
    try { if (typeof selectedAgendaDay !== 'undefined' && selectedAgendaDay) sel = selectedAgendaDay; } catch (e) {}
    if (!sel) sel = padKey(new Date());
    document.querySelectorAll('.aupygo-week-picker').forEach(function (inp) {
      inp.value = sel;
    });
  }

  function ensureNavs() {
    patchBuilders();
    injectNav('agendaCalendar', 'agendaWeekNav');
    var eventCal = document.getElementById('eventsCalendar') ||
      document.getElementById('communityCalendar') ||
      document.getElementById('eventGrid');
    if (eventCal && eventCal.id) injectNav(eventCal.id, 'eventsWeekNav');
    if (document.getElementById('personalCalendar')) {
      injectNav('personalCalendar', 'personalWeekNav');
    }
    // Nettoyage global des navs déjà présentes avec fond blanc inline
    document.querySelectorAll('.aupygo-week-nav').forEach(function (el) {
      el.style.background = '';
      el.style.borderColor = '';
      el.style.color = '';
    });
    syncNavLabels();
  }

  if (typeof window.go === 'function' && !window._agendaWeekNavGo) {
    window._agendaWeekNavGo = true;
    var prevGo = window.go;
    window.go = function (page) {
      prevGo(page);
      if (page === 'agenda' || page === 'events' || page === 'profile') {
        setTimeout(ensureNavs, 100);
        setTimeout(function () { ensureNavs(); renderAll(); }, 400);
        setTimeout(renderAll, 900);
      }
    };
  }

  if (typeof window.loadAndRenderEvents === 'function' && !window._agendaWeekNavLoad) {
    window._agendaWeekNavLoad = true;
    var _origLoad = window.loadAndRenderEvents;
    window.loadAndRenderEvents = async function () {
      var r = await _origLoad.apply(this, arguments);
      setTimeout(function () { ensureNavs(); renderAll(); }, 100);
      return r;
    };
  }

  if (typeof window.selectAgendaDay === 'function' && !window._agendaSelectPatched) {
    window._agendaSelectPatched = true;
    var _origSel = window.selectAgendaDay;
    window.selectAgendaDay = function (dayKey) {
      _origSel(dayKey);
      syncNavLabels();
    };
  }

  setInterval(patchBuilders, 2500);
  setTimeout(function () { ensureNavs(); renderAll(); }, 500);
  setTimeout(function () { ensureNavs(); renderAll(); }, 1500);
  setTimeout(function () { ensureNavs(); renderAll(); }, 3000);

  window.__agendaShiftWeek = shiftWeek;
  window.__agendaGoToday = goToday;
  window.__agendaGoToDate = goToDate;
  window.__agendaRenderAll = renderAll;

  console.log('[AUPYGO] agenda-week-nav.js v4');
})();
