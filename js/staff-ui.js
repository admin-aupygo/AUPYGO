/* AUPYGO staff-ui.js v2.1
 * Navigation Staff, AupygoStaff, avatar bouclier,
 * compteur carte (fix DOM), bouton messages header
 */
(function () {
  'use strict';
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
    injectHeaderMessageBtn();
    replacePremiumLabels();
  }

  function applyStaffAvatar() {
    if (!isStaff()) return;
    var selectors = [
      '#headerPlanBtn', '#headerAvatar', '.header-avatar', '.plan-badge',
      '[data-plan-badge]', '.user-plan-chip', '#headerUserChip'
    ];
    selectors.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        var t = (el.textContent || '').toLowerCase();
        if (/premium|standard|free|plan/i.test(t) || el.id === 'headerPlanBtn') {
          el.innerHTML = '🛡️';
          el.title = 'AupygoStaff';
        }
      });
    });
    document.querySelectorAll('.plan-label, .subscription-label, #currentPlanLabel').forEach(function (el) {
      if (el) el.textContent = 'AupygoStaff';
    });
  }

  function injectHeaderMessageBtn() {
    if (!isStaff()) return;
    var header = document.querySelector('header nav') || document.querySelector('header');
    if (!header || document.getElementById('navStaffMessages')) return;
    var btn = document.createElement('button');
    btn.id = 'navStaffMessages';
    btn.type = 'button';
    btn.title = 'Messages';
    btn.setAttribute('aria-label', 'Messages');
    btn.innerHTML = '<span class="icon">💬</span>';
    btn.onclick = function () { if (typeof go === 'function') go('messages'); };
    header.appendChild(btn);
  }

  function replacePremiumLabels() {
    if (!isStaff()) return;
    document.querySelectorAll('span, div, strong, em, p, button, label').forEach(function (el) {
      if (el.children && el.children.length > 2) return;
      var t = el.textContent || '';
      if (t.trim() === 'PREMIUM' || t.trim() === 'Premium') {
        el.textContent = t.replace(/PREMIUM|Premium/g, 'AupygoStaff');
      }
    });
    document.querySelectorAll('.admin-badge.PREMIUM').forEach(function (el) {
      el.textContent = 'AupygoStaff';
      el.classList.remove('PREMIUM');
      el.classList.add('host');
    });
  }

  function forceStaffPremium() {
    if (!isStaff()) return;
    try { currentPlan = 'PREMIUM'; } catch (e) {}
    try { window.currentPlan = 'PREMIUM'; } catch (e2) {}
  }

  /** Compteur activité carte — insertion DOM sécurisée */
  async function updateMapActivityCounter() {
    if (!isStaff()) return;
    var mapPage = document.getElementById('map');
    if (!mapPage) return;

    var box = document.getElementById('staffMapActivity');
    if (!box) {
      box = document.createElement('div');
      box.id = 'staffMapActivity';
      box.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 14px;';
      // Insertion sûre : prepend via firstChild du mapPage uniquement
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

    // Si le box a été détaché, le réattacher
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
        var res = await supabaseClient
          .from('profiles')
          .select('id, role, is_admin, is_online, last_seen')
          .limit(400);
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
    } catch (e) {
      console.warn('[Staff] map counter', e);
    }

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
        if (typeof showToast === 'function') {
          showToast('Compte AupygoStaff — pas d\'abonnement requis.', 'success');
        }
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
    };
  }

  function hideProfileExtras() {
    if (!isStaff()) return;
    document.querySelectorAll('button, a, .btn').forEach(function (btn) {
      var t = (btn.textContent || '').toLowerCase();
      var oc = (btn.getAttribute('onclick') || '');
      if (/supprimer.*compte|supprimer mon profil|delete.*account|désactiver le compte/i.test(t) || /deleteAccount|delete_account/.test(oc)) {
        btn.style.display = 'none';
      }
      if (/abonnement|passer en premium|voir les offres/i.test(t)) btn.style.display = 'none';
      if (/mon agenda/i.test(t)) btn.style.display = 'none';
    });
    document.querySelectorAll('#profile .agenda-block, #profile [id*="agenda"], .profile-agenda').forEach(function (el) {
      el.style.display = 'none';
    });
  }

  function tick() {
    if (!isStaff()) return;
    forceStaffPremium();
    applyStaffNav();
    if (typeof getActivePage === 'function') {
      if (getActivePage() === 'profile') hideProfileExtras();
      if (getActivePage() === 'map') {
        updateMapActivityCounter().catch(function () {});
      }
      if (getActivePage() === 'admin') replacePremiumLabels();
    }
  }

  if (!document.querySelector('script[src*="staff-restrictions"]')) {
    var s = document.createElement('script');
    s.src = 'js/staff-restrictions.js?v=20260924c';
    document.body.appendChild(s);
  }

  setTimeout(tick, 600);
  setInterval(tick, 4000);

  console.log('[AUPYGO] staff-ui.js v2.1 chargé');
})();
