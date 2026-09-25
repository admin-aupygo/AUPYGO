/* AUPYGO staff-ui.js v3 — menu, pop-up centrée, nav Messages */
(function () {
  'use strict';

  function loadScriptOnce(name) {
    if (document.querySelector('script[src*="' + name + '"]')) return;
    var s = document.createElement('script');
    s.src = 'js/' + name + '?v=20260925a';
    document.body.appendChild(s);
  }

  loadScriptOnce('staff-realtime-fix.js');
  loadScriptOnce('staff-blink-fix.js');
  loadScriptOnce('staff-visibility.js');

  if (typeof isStaff !== 'function') return;

  var STAFF_ALLOWED_NAV = {
    home: true, map: true, events: true, agenda: true,
    messages: true, profile: true, more: true, admin: true,
    reconnect: false, plans: false
  };

  function forceMessagesBetweenAgendaAndProfile() {
    var nav = document.querySelector('header nav');
    var msg = document.getElementById('navMessages');
    if (!nav || !msg) return;

    msg.style.display = '';
    msg.style.visibility = 'visible';
    msg.style.opacity = '1';
    msg.style.pointerEvents = 'auto';
    msg.style.position = '';
    msg.style.right = '';
    msg.style.top = '';

    // Ordre souhaité : … agenda → messages → profile …
    var agenda = nav.querySelector('[data-nav="agenda"]');
    var profile = nav.querySelector('[data-nav="profile"]');
    try {
      if (agenda && agenda.nextSibling !== msg) {
        if (agenda.nextSibling) nav.insertBefore(msg, agenda.nextSibling);
        else nav.appendChild(msg);
      } else if (profile && msg.nextSibling !== profile) {
        nav.insertBefore(msg, profile);
      }
    } catch (e) {}

    var extra = document.getElementById('navStaffMessages');
    if (extra && extra.parentNode) extra.parentNode.removeChild(extra);

    var btm = document.getElementById('bottomNavMessages');
    if (btm) { btm.style.display = ''; btm.style.visibility = 'visible'; }
  }

  function filterMoreMenu() {
    if (!isStaff()) return;
    var allowStaff = /agenda|messag|sortie|événement|evenement|carte|map|découvrir|decouvrir/i;
    var allowAdmin = /admin|administration/i;

    document.querySelectorAll('.more-sheet-item, .more-menu-item, #moreSheet button, .more-sheet button').forEach(function (item) {
      if (item.id === 'moreAdminItem') {
        item.style.display = (typeof isAdmin === 'function' && isAdmin()) ? '' : 'none';
        return;
      }
      var t = ((item.textContent || '') + ' ' + (item.getAttribute('onclick') || '')).toLowerCase();
      if (/reconnect|amis|plan|abonnement|premium|friend/i.test(t)) {
        item.style.display = 'none';
        return;
      }
      if (allowAdmin.test(t)) {
        item.style.display = (typeof isAdmin === 'function' && isAdmin()) ? '' : 'none';
        return;
      }
      if (allowStaff.test(t) || /profil|profile|home|accueil/i.test(t)) {
        item.style.display = '';
        return;
      }
      // Par défaut pour staff : masquer le reste non listé
      if (!/param|régl|deconnect|déconnect|langue|language/i.test(t)) {
        // garder déconnexion / langue
      }
    });
  }

  function centerMorePopup() {
    if (!isStaff()) return;
    var sheet = document.getElementById('moreSheet') ||
      document.querySelector('.more-sheet') ||
      document.querySelector('.more-menu') ||
      document.querySelector('[class*="more-sheet"]');
    if (!sheet) return;
    sheet.style.position = 'fixed';
    sheet.style.left = '50%';
    sheet.style.top = '50%';
    sheet.style.transform = 'translate(-50%, -50%)';
    sheet.style.right = 'auto';
    sheet.style.bottom = 'auto';
    sheet.style.maxHeight = '80vh';
    sheet.style.overflowY = 'auto';
    sheet.style.zIndex = '9999';
  }

  function applyStaffNav() {
    if (!isStaff()) return;

    document.querySelectorAll('[data-nav]').forEach(function (el) {
      var key = el.getAttribute('data-nav');
      if (!key) return;
      if (STAFF_ALLOWED_NAV[key] === false) {
        el.style.display = 'none';
        el.style.pointerEvents = 'none';
      } else if (key === 'messages') {
        el.style.display = '';
        el.style.pointerEvents = 'auto';
        el.style.opacity = '1';
      }
    });

    ['#navFriends', '#homeBtnFriends', '#homeBtnPlans', '.more-sheet-item-plan'].forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) { el.style.display = 'none'; });
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
      } catch (e) { dash.appendChild(b); }
    }

    applyStaffAvatar();
    forceMessagesBetweenAgendaAndProfile();
    filterMoreMenu();
    centerMorePopup();
    fixAdminPlanLabels();
  }

  function applyStaffAvatar() {
    if (!isStaff()) return;
    var avatar = document.getElementById('headerPlanAvatar');
    if (avatar) { avatar.textContent = '🛡️'; avatar.title = 'AupygoStaff'; }
    var badge = document.getElementById('headerPlanBadge');
    if (badge) { badge.textContent = 'STAFF'; badge.title = 'AupygoStaff'; }
    var bottomBadge = document.getElementById('bottomNavPlanBadge');
    if (bottomBadge) bottomBadge.textContent = 'STAFF';
    var bottomAv = document.getElementById('bottomNavAvatar');
    if (bottomAv) bottomAv.textContent = '🛡️';
  }

  function fixAdminPlanLabels() {
    if (!(typeof isAdmin === 'function' && isAdmin())) return;
    document.querySelectorAll('#adminTableBody tr').forEach(function (tr) {
      var cells = tr.cells;
      if (!cells || cells.length < 3) return;
      var roleTxt = (cells[1].textContent || '').toLowerCase();
      if (roleTxt.indexOf('host') !== -1 || roleTxt.indexOf('admin_general') !== -1) {
        cells[2].textContent = 'STAFF';
      }
    });
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
        if (mapPage.firstChild && mapPage.firstChild.parentNode === mapPage) mapPage.insertBefore(box, mapPage.firstChild);
        else mapPage.appendChild(box);
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
    var usersOnline = 0, staffOnline = 0;
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
        if (isS) staffOnline++; else usersOnline++;
      });
    } catch (e) {}
    try {
      box.innerHTML =
        '<div style="background:#111;color:#fff;border-radius:12px;padding:10px 14px;font-weight:700;font-size:13px">👥 Users en ligne : ' + usersOnline + '</div>' +
        '<div style="background:#334155;color:#fff;border-radius:12px;padding:10px 14px;font-weight:700;font-size:13px">🛡️ Staff Host en ligne : ' + staffOnline + '</div>';
    } catch (e4) {}
  }

  // Patch toggleMoreMenu pour centrer
  var _origToggle = window.toggleMoreMenu;
  if (typeof _origToggle === 'function' && !window._staffMoreCentered) {
    window._staffMoreCentered = true;
    window.toggleMoreMenu = function () {
      _origToggle.apply(this, arguments);
      setTimeout(function () {
        filterMoreMenu();
        centerMorePopup();
      }, 50);
    };
  }

  var prevGo = window.go;
  if (typeof prevGo === 'function' && !window._staffUiGoPatched) {
    window._staffUiGoPatched = true;
    window.go = function (page) {
      if (!isStaff()) { prevGo(page); return; }
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

  loadScriptOnce('staff-restrictions.js');

  setTimeout(tick, 600);
  setInterval(tick, 3000);

  console.log('[AUPYGO] staff-ui.js v3');
})();
