/* AUPYGO staff-ui.js v2.3 */
(function () {
  'use strict';

  if (!document.querySelector('script[src*="staff-realtime-fix"]')) {
    var sRt = document.createElement('script');
    sRt.src = 'js/staff-realtime-fix.js?v=20260924d';
    document.body.appendChild(sRt);
  }

  if (typeof isStaff !== 'function') return;

  var STAFF_ALLOWED_NAV = {
    home: true, map: true, events: true, agenda: true,
    messages: true, profile: true, more: true, admin: true,
    reconnect: false, plans: false
  };

  function applyStaffNav() {
    if (!isStaff()) return;

    document.querySelectorAll('[data-nav]').forEach(function (el) {
      var key = el.getAttribute('data-nav');
      if (!key) return;
      if (STAFF_ALLOWED_NAV[key] === false) {
        el.style.display = 'none';
        el.style.pointerEvents = 'none';
      }
    });

    ['#navFriends', '#homeBtnFriends', '#homeBtnPlans', '.more-sheet-item-plan'].forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) { el.style.display = 'none'; });
    });

    document.querySelectorAll('.more-sheet-item').forEach(function (item) {
      if (item.id === 'moreAdminItem') return;
      var oc = (item.getAttribute('onclick') || '') + (item.textContent || '');
      if (/reconnect|plans|abonnement|amis/i.test(oc)) item.style.display = 'none';
    });

    var keepHome = {
      homeBtnAgenda: true, homeBtnMessages: true, homeBtnMap: true,
      homeBtnEvents: true, homeBtnProfile: true
    };
    document.querySelectorAll('#homeDashboard .home-btn').forEach(function (btn) {
      btn.style.display = keepHome[btn.id] ? '' : 'none';
    });

    var dash = document.getElementById('homeDashboard');
    if (dash && !document.getElementById('staffHomeBanner')) {
      var b = document.createElement('div');
      b.id = 'staffHomeBanner';
      b.style.cssText = 'background:#111;color:#fff;border-radius:14px;padding:14px 16px;margin-bottom:16px;font-weight:700;font-size:14px;line-height:1.4';
      b.innerHTML = '🛡️ Espace Staff AUPYGO<br><span style="font-weight:500;font-size:12px;opacity:0.9">Agenda · Messages · Carte · Sorties</span>';
      try {
        if (dash.firstChild) dash.insertBefore(b, dash.firstChild);
        else dash.appendChild(b);
      } catch (e) {
        dash.appendChild(b);
      }
    }

    applyStaffAvatar();
    // Retirer la bulle messages injectée en header (doublon)
    var extra = document.getElementById('navStaffMessages');
    if (extra && extra.parentNode) extra.parentNode.removeChild(extra);

    fixAdminPlanLabels();
  }

  function applyStaffAvatar() {
    if (!isStaff()) return;
    var avatar = document.getElementById('headerPlanAvatar');
    if (avatar) {
      avatar.textContent = '🛡️';
      avatar.title = 'AupygoStaff';
    }
    var badge = document.getElementById('headerPlanBadge');
    if (badge) {
      badge.textContent = 'STAFF';
      badge.title = 'AupygoStaff';
    }
    var bottomBadge = document.getElementById('bottomNavPlanBadge');
    if (bottomBadge) bottomBadge.textContent = 'STAFF';
    var bottomAv = document.getElementById('bottomNavAvatar');
    if (bottomAv) bottomAv.textContent = '🛡️';
  }

  /** Panneau admin : PREMIUM → STAFF pour host / admin_general */
  function fixAdminPlanLabels() {
    if (!(typeof isAdmin === 'function' && isAdmin())) return;
    document.querySelectorAll('#adminTableBody tr').forEach(function (tr) {
      var cells = tr.cells;
      if (!cells || cells.length < 3) return;
      var roleTxt = (cells[1].textContent || '').toLowerCase();
      if (roleTxt.indexOf('host') !== -1 || roleTxt.indexOf('admin_general') !== -1 || roleTxt.indexOf('admin') !== -1) {
        cells[2].textContent = 'STAFF';
      }
    });
    // Stats card label optionnel
    var premLabel = document.querySelector('#statPremium') && document.getElementById('statPremium').nextElementSibling;
  }

  function forceStaffPremium() {
    if (!isStaff()) return;
    try { currentPlan = 'PREMIUM'; } catch (e) {}
    try { window.currentPlan = 'PREMIUM'; } catch (e2) {}
  }

  async function updateMapActivityCounter() {
    if (!isStaff()) return;
    var mapPage = document.getElementById('map');
    if (!mapPage) return;

    var box = document.getElementById('staffMapActivity');
    if (!box) {
      box = document.createElement('div');
      box.id = 'staffMapActivity';
      box.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 14px;';
      try {
        if (mapPage.firstChild && mapPage.firstChild.parentNode === mapPage) {
          mapPage.insertBefore(box, mapPage.firstChild);
        } else {
          mapPage.appendChild(box);
        }
      } catch (err) {
        try { mapPage.appendChild(box); } catch (e2) { return; }
      }
    }
    if (!box.isConnected || box.parentNode !== mapPage) {
      try {
        if (box.parentNode) box.parentNode.removeChild(box);
        mapPage.appendChild(box);
      } catch (e3) { return; }
    }

    var usersOnline = 0;
    var staffOnline = 0;
    try {
      var now = Date.now();
      var ONLINE_MS = 15 * 60 * 1000;
      var list = window.profiles || [];
      if (!list.length && typeof supabaseClient !== 'undefined') {
        var res = await supabaseClient.from('profiles').select('id, role, is_admin, is_online, last_seen').limit(400);
        list = res.data || [];
      }
      list.forEach(function (p) {
        if (!p) return;
        var on = p.is_online === true || (p.last_seen && (now - new Date(p.last_seen).getTime()) < ONLINE_MS);
        if (!on) return;
        var r = (p.role || '').toLowerCase();
        var isS = p.is_admin === true || r === 'admin_general' || r === 'host' || r === 'moderator';
        if (isS) staffOnline++;
        else usersOnline++;
      });
    } catch (e) {}

    try {
      box.innerHTML =
        '<div style="background:#111;color:#fff;border-radius:12px;padding:10px 14px;font-weight:700;font-size:13px">👥 Users en ligne : ' + usersOnline + '</div>' +
        '<div style="background:#334155;color:#fff;border-radius:12px;padding:10px 14px;font-weight:700;font-size:13px">🛡️ Staff Host en ligne : ' + staffOnline + '</div>';
    } catch (e4) {}
  }

  var prevGo = window.go;
  if (typeof prevGo === 'function' && !window._staffUiGoPatched) {
    window._staffUiGoPatched = true;
    window.go = function (page) {
      if (!isStaff()) {
        prevGo(page);
        return;
      }
      if (page === 'plans') {
        if (typeof showToast === 'function') showToast('Compte AupygoStaff — pas d\'abonnement requis.', 'success');
        return prevGo('home');
      }
      if (page === 'reconnect') {
        if (typeof showToast === 'function') showToast('Page Amis indisponible pour le Staff.', 'error');
        return;
      }
      prevGo(page);
      setTimeout(applyStaffNav, 150);
      forceStaffPremium();
      if (page === 'map') setTimeout(function () { updateMapActivityCounter(); }, 300);
      if (page === 'admin') setTimeout(fixAdminPlanLabels, 400);
    };
  }

  // Après refresh admin
  var _ar = window.adminRefresh;
  if (typeof _ar === 'function') {
    window.adminRefresh = function () {
      _ar();
      setTimeout(fixAdminPlanLabels, 500);
    };
  }

  function tick() {
    if (!isStaff()) return;
    forceStaffPremium();
    applyStaffNav();
    if (typeof getActivePage === 'function') {
      if (getActivePage() === 'map') updateMapActivityCounter().catch(function () {});
      if (getActivePage() === 'admin') fixAdminPlanLabels();
    }
  }

  if (!document.querySelector('script[src*="staff-restrictions"]')) {
    var s = document.createElement('script');
    s.src = 'js/staff-restrictions.js?v=20260924c';
    document.body.appendChild(s);
  }

  setTimeout(tick, 600);
  setInterval(tick, 4000);

  console.log('[AUPYGO] staff-ui.js v2.3');
})();
