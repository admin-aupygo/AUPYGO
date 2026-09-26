/* AUPYGO staff-agenda-nav.js — navigation semaine / jour / mois / année
 * Agenda communautaire pour Staff & Admin
 */
(function () {
  'use strict';
  if (typeof isStaff !== 'function') return;

  var DAYS_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  var MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  /** Lundi de la semaine contenant d */
  function startOfWeek(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var day = x.getDay(); // 0=dim
    var diff = day === 0 ? -6 : 1 - day;
    x.setDate(x.getDate() + diff);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function addDays(d, n) {
    var x = new Date(d.getTime());
    x.setDate(x.getDate() + n);
    return x;
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }

  function fmtDay(d) {
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    return dd + '/' + mm;
  }

  function fmtRange(weekStart) {
    var end = addDays(weekStart, 6);
    return fmtDay(weekStart) + ' → ' + fmtDay(end) + ' ' + weekStart.getFullYear();
  }

  // État
  var viewWeekStart = startOfWeek(new Date());
  var selectedDay = new Date();
  selectedDay.setHours(0, 0, 0, 0);

  function injectNav() {
    if (!isStaff()) return;
    var cal = document.getElementById('agendaCalendar');
    if (!cal) return;

    var card = cal.closest('.card') || cal.parentElement;
    if (!card) return;

    var nav = document.getElementById('staffAgendaNav');
    if (!nav) {
      nav = document.createElement('div');
      nav.id = 'staffAgendaNav';
      nav.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:10px 0 14px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px';

      nav.innerHTML =
        '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
          '<button type="button" id="staffAgPrev" class="btn btn-secondary" style="padding:6px 12px;font-size:13px">◀ Semaine</button>' +
          '<button type="button" id="staffAgToday" class="btn btn-secondary" style="padding:6px 12px;font-size:13px">Aujourd\'hui</button>' +
          '<button type="button" id="staffAgNext" class="btn btn-secondary" style="padding:6px 12px;font-size:13px">Semaine ▶</button>' +
        '</div>' +
        '<div id="staffAgRange" style="font-weight:700;font-size:13px;color:#334155;min-width:140px"></div>' +
        '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-left:auto">' +
          '<label style="font-size:12px;font-weight:600;color:#64748b">Jour</label>' +
          '<select id="staffAgDay" style="padding:6px 8px;border-radius:8px;border:1px solid #e2e8f0;font-size:13px"></select>' +
          '<label style="font-size:12px;font-weight:600;color:#64748b">Mois</label>' +
          '<select id="staffAgMonth" style="padding:6px 8px;border-radius:8px;border:1px solid #e2e8f0;font-size:13px"></select>' +
          '<label style="font-size:12px;font-weight:600;color:#64748b">Année</label>' +
          '<select id="staffAgYear" style="padding:6px 8px;border-radius:8px;border:1px solid #e2e8f0;font-size:13px"></select>' +
          '<button type="button" id="staffAgGo" class="btn btn-primary" style="padding:6px 12px;font-size:13px">Aller</button>' +
        '</div>';

      // Insérer avant le calendrier
      try {
        cal.parentNode.insertBefore(nav, cal);
      } catch (e) {
        card.insertBefore(nav, cal);
      }

      // Remplir mois
      var monthSel = document.getElementById('staffAgMonth');
      MONTHS_FR.forEach(function (m, i) {
        var o = document.createElement('option');
        o.value = String(i);
        o.textContent = m;
        monthSel.appendChild(o);
      });

      // Années : année courante -1 à +2
      var yearSel = document.getElementById('staffAgYear');
      var yNow = new Date().getFullYear();
      for (var y = yNow - 1; y <= yNow + 2; y++) {
        var oy = document.createElement('option');
        oy.value = String(y);
        oy.textContent = String(y);
        yearSel.appendChild(oy);
      }

      fillDaySelect();

      document.getElementById('staffAgPrev').onclick = function () {
        viewWeekStart = addDays(viewWeekStart, -7);
        selectedDay = new Date(viewWeekStart);
        syncSelects();
        renderStaffCommunityAgenda();
      };
      document.getElementById('staffAgNext').onclick = function () {
        viewWeekStart = addDays(viewWeekStart, 7);
        selectedDay = new Date(viewWeekStart);
        syncSelects();
        renderStaffCommunityAgenda();
      };
      document.getElementById('staffAgToday').onclick = function () {
        selectedDay = new Date();
        selectedDay.setHours(0, 0, 0, 0);
        viewWeekStart = startOfWeek(selectedDay);
        syncSelects();
        renderStaffCommunityAgenda();
      };
      document.getElementById('staffAgGo').onclick = function () {
        applySelectsToDate();
        renderStaffCommunityAgenda();
      };
      document.getElementById('staffAgMonth').onchange = fillDaySelect;
      document.getElementById('staffAgYear').onchange = fillDaySelect;
    }

    syncSelects();
    var rangeEl = document.getElementById('staffAgRange');
    if (rangeEl) rangeEl.textContent = fmtRange(viewWeekStart);
  }

  function fillDaySelect() {
    var daySel = document.getElementById('staffAgDay');
    var monthSel = document.getElementById('staffAgMonth');
    var yearSel = document.getElementById('staffAgYear');
    if (!daySel || !monthSel || !yearSel) return;
    var y = parseInt(yearSel.value, 10) || new Date().getFullYear();
    var m = parseInt(monthSel.value, 10);
    if (isNaN(m)) m = new Date().getMonth();
    var daysInMonth = new Date(y, m + 1, 0).getDate();
    var prev = parseInt(daySel.value, 10) || selectedDay.getDate();
    daySel.innerHTML = '';
    for (var d = 1; d <= daysInMonth; d++) {
      var o = document.createElement('option');
      o.value = String(d);
      o.textContent = String(d);
      daySel.appendChild(o);
    }
    daySel.value = String(Math.min(prev, daysInMonth));
  }

  function syncSelects() {
    var daySel = document.getElementById('staffAgDay');
    var monthSel = document.getElementById('staffAgMonth');
    var yearSel = document.getElementById('staffAgYear');
    if (!daySel || !monthSel || !yearSel) return;
    yearSel.value = String(selectedDay.getFullYear());
    monthSel.value = String(selectedDay.getMonth());
    fillDaySelect();
    daySel.value = String(selectedDay.getDate());
    var rangeEl = document.getElementById('staffAgRange');
    if (rangeEl) rangeEl.textContent = fmtRange(viewWeekStart);
  }

  function applySelectsToDate() {
    var daySel = document.getElementById('staffAgDay');
    var monthSel = document.getElementById('staffAgMonth');
    var yearSel = document.getElementById('staffAgYear');
    var y = parseInt(yearSel.value, 10);
    var m = parseInt(monthSel.value, 10);
    var d = parseInt(daySel.value, 10);
    selectedDay = new Date(y, m, d);
    selectedDay.setHours(0, 0, 0, 0);
    viewWeekStart = startOfWeek(selectedDay);
    syncSelects();
  }

  function getEventDate(ev) {
    if (!ev) return null;
    var raw = ev.event_date || ev.date || ev.start_at || ev.starts_at;
    if (!raw) return null;
    var dt = new Date(raw);
    if (isNaN(dt.getTime())) return null;
    return dt;
  }

  function eventsForDay(day) {
    var list = window.cachedEvents || [];
    return list.filter(function (ev) {
      var dt = getEventDate(ev);
      if (!dt) return false;
      return sameDay(dt, day);
    }).sort(function (a, b) {
      return getEventDate(a) - getEventDate(b);
    });
  }

  function renderStaffCommunityAgenda() {
    if (!isStaff()) return;
    injectNav();

    var cal = document.getElementById('agendaCalendar');
    if (!cal) return;

    var rangeEl = document.getElementById('staffAgRange');
    if (rangeEl) rangeEl.textContent = fmtRange(viewWeekStart);

    cal.innerHTML = '';
    cal.style.display = 'grid';
    cal.style.gridTemplateColumns = 'repeat(7, minmax(0, 1fr))';
    cal.style.gap = '8px';

    var today = new Date();
    today.setHours(0, 0, 0, 0);

    for (var i = 0; i < 7; i++) {
      var day = addDays(viewWeekStart, i);
      var isSel = sameDay(day, selectedDay);
      var isToday = sameDay(day, today);
      var cell = document.createElement('div');
      cell.style.cssText =
        'min-height:110px;background:#fff;border:1px solid ' + (isSel ? '#7c3aed' : '#e2e8f0') +
        ';border-radius:12px;padding:8px;display:flex;flex-direction:column;gap:4px;' +
        (isToday ? 'box-shadow:0 0 0 2px rgba(124,58,237,.25);' : '');

      var head = document.createElement('div');
      head.style.cssText = 'font-size:11px;font-weight:800;color:' + (isSel ? '#7c3aed' : '#64748b') + ';cursor:pointer';
      head.textContent = DAYS_FR[day.getDay()] + ' ' + fmtDay(day);
      head.onclick = (function (d) {
        return function () {
          selectedDay = new Date(d);
          selectedDay.setHours(0, 0, 0, 0);
          viewWeekStart = startOfWeek(selectedDay);
          syncSelects();
          renderStaffCommunityAgenda();
        };
      })(day);
      cell.appendChild(head);

      var evs = eventsForDay(day);
      if (!evs.length) {
        var empty = document.createElement('div');
        empty.style.cssText = 'font-size:11px;color:#cbd5e1;margin-top:4px';
        empty.textContent = '—';
        cell.appendChild(empty);
      } else {
        evs.slice(0, 4).forEach(function (ev) {
          var chip = document.createElement('div');
          chip.style.cssText = 'font-size:11px;padding:3px 6px;border-radius:6px;background:#ede9fe;color:#5b21b6;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:default';
          var t = getEventDate(ev);
          var hh = t ? String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0') : '';
          chip.textContent = (hh ? hh + ' ' : '') + (ev.title || 'Sortie');
          chip.title = (ev.title || '') + (ev.city ? ' · ' + ev.city : '');
          cell.appendChild(chip);
        });
        if (evs.length > 4) {
          var more = document.createElement('div');
          more.style.cssText = 'font-size:10px;color:#94a3b8;font-weight:600';
          more.textContent = '+' + (evs.length - 4) + ' autres';
          cell.appendChild(more);
        }
      }

      cal.appendChild(cell);
    }
  }

  // Masquer notice STANDARD pour staff
  function hideAgendaUpsell() {
    if (!isStaff()) return;
    var n = document.getElementById('agendaPageNotice');
    if (n) n.style.display = 'none';
  }

  var prevGo = window.go;
  if (typeof prevGo === 'function' && !window._staffAgendaNavGo) {
    window._staffAgendaNavGo = true;
    window.go = function (page) {
      prevGo(page);
      if (page === 'agenda' && isStaff()) {
        setTimeout(function () {
          hideAgendaUpsell();
          injectNav();
          renderStaffCommunityAgenda();
        }, 300);
        setTimeout(renderStaffCommunityAgenda, 900);
      }
    };
  }

  // Après chargement des events
  var _origLoad = window.loadAndRenderEvents;
  if (typeof _origLoad === 'function' && !window._staffAgendaNavLoad) {
    window._staffAgendaNavLoad = true;
    window.loadAndRenderEvents = async function () {
      var r = await _origLoad.apply(this, arguments);
      if (isStaff() && typeof getActivePage === 'function' && getActivePage() === 'agenda') {
        setTimeout(renderStaffCommunityAgenda, 200);
      }
      return r;
    };
  }

  setTimeout(function () {
    if (isStaff() && typeof getActivePage === 'function' && getActivePage() === 'agenda') {
      hideAgendaUpsell();
      injectNav();
      renderStaffCommunityAgenda();
    }
  }, 1500);

  console.log('[AUPYGO] staff-agenda-nav.js');
})();
