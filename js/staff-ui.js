/* AUPYGO staff-ui.js v4 — Header Admin + menu accès rapide */
(function () {
  'use strict';

  function loadScriptOnce(name) {
    if (document.querySelector('script[src*="' + name + '"]')) return;
    var s = document.createElement('script');
    s.src = 'js/' + name + '?v=20260925z';
    document.body.appendChild(s);
  }

  loadScriptOnce('staff-realtime-fix.js');
  loadScriptOnce('staff-blink-fix.js');
  loadScriptOnce('staff-visibility.js');
  loadScriptOnce('staff-msg-unlock.js');

  if (typeof isStaff !== 'function') return;

  var STAFF_ALLOWED_NAV = {
    home: true, map: true, events: true, agenda: true,
    messages: true, profile: true, more: true, admin: true,
    reconnect: false, plans: false
  };

  function forceMessagesBetweenAgendaAndProfile() {
    var nav = document.querySelector('header nav');
    if (!nav) return;
    var msg = document.getElementById('navMessages');
    if (!msg) {
      msg = document.createElement('button');
      msg.type = 'button';
      msg.id = 'navMessages';
      msg.setAttribute('data-nav', 'messages');
      msg.setAttribute('onclick', "go('messages')");
      msg.title = 'Messages';
      msg.innerHTML = '<span class="icon">💬</span><span class="messages-badge" id="messagesBadge">0</span>';
      nav.appendChild(msg);
    }
    msg.style.cssText = 'display:inline-flex !important;visibility:visible !important;opacity:1 !important;pointer-events:auto !important;position:relative !important;align-items:center;justify-content:center;';
    var profile = nav.querySelector('[data-nav="profile"]');
    try {
      if (profile) nav.insertBefore(msg, profile);
    } catch (e) {}
    var friends = document.getElementById('navFriends');
    if (friends) { friends.style.display = 'none'; }
  }

  /** Badge Admin à côté de la langue + menu déroulant accès rapide */
  function injectAdminHeaderMenu() {
    if (!(typeof isAdmin === 'function' && isAdmin())) {
      var old = document.getElementById('adminHeaderWrap');
      if (old) old.remove();
      return;
    }

    var actions = document.querySelector('.header-actions');
    if (!actions) return;

    // Badge plan = Admin
    var badge = document.getElementById('headerPlanBadge');
    if (badge) {
      badge.textContent = 'Admin';
      badge.title = 'Administrateur';
    }
    var avatar = document.getElementById('headerPlanAvatar');
    if (avatar) avatar.textContent = '🛡️';

    var wrap = document.getElementById('adminHeaderWrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'adminHeaderWrap';
      wrap.style.cssText = 'position:relative;display:inline-flex;align-items:center;margin-right:8px;';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'adminHeaderBtn';
      btn.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;border:1px solid #e2e8f0;background:#111;color:#fff;font-weight:700;font-size:12px;cursor:pointer;';
      btn.innerHTML = '🛡️ Admin <span style="font-size:10px">▾</span>';
      btn.onclick = function (e) {
        e.stopPropagation();
        var m = document.getElementById('adminQuickMenu');
        if (m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
      };

      var menu = document.createElement('div');
      menu.id = 'adminQuickMenu';
      menu.style.cssText = 'display:none;position:absolute;top:110%;right:0;min-width:180px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.12);padding:8px;z-index:10000;';
      menu.innerHTML =
        '<button type="button" class="admin-qitem" data-go="agenda">📅 Agenda</button>' +
        '<button type="button" class="admin-qitem" data-go="admin">🛡️ Administration</button>' +
        '<button type="button" class="admin-qitem" data-go="events">🎉 Sorties</button>' +
        '<button type="button" class="admin-qitem" data-go="messages">💬 Messages</button>';

      if (!document.getElementById('adminQuickMenuStyle')) {
        var st = document.createElement('style');
        st.id = 'adminQuickMenuStyle';
        st.textContent =
          '.admin-qitem{display:block;width:100%;text-align:left;padding:10px 12px;border:0;background:transparent;border-radius:10px;font-weight:600;font-size:13px;cursor:pointer;color:#1e293b}' +
          '.admin-qitem:hover{background:#f1f5f9}';
        document.head.appendChild(st);
      }

      menu.querySelectorAll('.admin-qitem').forEach(function (item) {
        item.onclick = function () {
          menu.style.display = 'none';
          var page = item.getAttribute('data-go');
          if (typeof go === 'function') go(page);
        };
      });

      wrap.appendChild(btn);
      wrap.appendChild(menu);

      // Insérer avant le sélecteur de langue
      var lang = actions.querySelector('.lang-select') || actions.querySelector('#language');
      if (lang) actions.insertBefore(wrap, lang);
      else actions.appendChild(wrap);

      document.addEventListener('click', function () {
        var m = document.getElementById('adminQuickMenu');
        if (m) m.style.display = 'none';
      });
    } else {
      wrap.style.display = '';
    }
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
        el.style.display = 'inline-flex';
        el.style.visibility = 'visible';
        el.style.opacity = '1';
      }
    });

    ['#navFriends', '#homeBtnFriends', '#homeBtnPlans'].forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) { el.style.display = 'none'; });
    });

    forceMessagesBetweenAgendaAndProfile();
    injectAdminHeaderMenu();

    // Host badge
    if (!(typeof isAdmin === 'function' && isAdmin())) {
      var badge = document.getElementById('headerPlanBadge');
      if (badge) badge.textContent = 'Staff';
      var avatar = document.getElementById('headerPlanAvatar');
      if (avatar) avatar.textContent = '🛡️';
    }
  }

  function forceStaffPremium() {
    if (!isStaff()) return;
    try { currentPlan = 'PREMIUM'; } catch (e) {}
    try { window.currentPlan = 'PREMIUM'; } catch (e2) {}
    try { localStorage.setItem('aupygo_plan', 'PREMIUM'); } catch (e3) {}
  }

  var prevGo = window.go;
  if (typeof prevGo === 'function' && !window._staffUiGoPatched) {
    window._staffUiGoPatched = true;
    window.go = function (page) {
      if (!isStaff()) { prevGo(page); return; }
      if (page === 'plans') {
        if (typeof showToast === 'function') showToast('Compte Admin/Staff — pas d\'abonnement requis.', 'success');
        return prevGo('home');
      }
      if (page === 'reconnect') {
        if (typeof showToast === 'function') showToast('Page Amis indisponible pour le Staff.', 'error');
        return;
      }
      prevGo(page);
      setTimeout(applyStaffNav, 150);
      forceStaffPremium();
    };
  }

  function tick() {
    if (!isStaff()) return;
    forceStaffPremium();
    applyStaffNav();
  }

  loadScriptOnce('staff-restrictions.js');

  setTimeout(tick, 600);
  setInterval(tick, 3000);

  console.log('[AUPYGO] staff-ui.js v4');
})();
