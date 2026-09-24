/* AUPYGO staff-ui.js — Accueil + menu Staff distincts, Premium auto */
(function () {
  'use strict';
  if (typeof isStaff !== 'function') return;

  /** Onglets essentiels Staff : Agenda, Messages, Découvrir (map), Sorties */
  var STAFF_ALLOWED_NAV = {
    home: true,
    map: true,
    events: true,
    agenda: true,
    messages: true,
    profile: true,
    more: true,
    admin: true,
    reconnect: false,
    plans: false
  };

  function applyStaffNav() {
    if (!isStaff()) return;

    // Header + bottom nav
    document.querySelectorAll('[data-nav]').forEach(function (el) {
      var key = el.getAttribute('data-nav');
      if (!key) return;
      if (STAFF_ALLOWED_NAV[key] === false) {
        el.style.display = 'none';
        el.style.pointerEvents = 'none';
      }
    });

    // IDs explicites
    ['#navFriends', '#homeBtnFriends', '#homeBtnPlans', '.more-sheet-item-plan'].forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        el.style.display = 'none';
      });
    });

    // More sheet : masquer amis / plans
    document.querySelectorAll('.more-sheet-item').forEach(function (item) {
      var oc = (item.getAttribute('onclick') || '') + (item.textContent || '');
      if (/reconnect|plans|amis|abonnement/i.test(oc) && item.id !== 'moreAdminItem') {
        if (/admin/i.test(oc)) return;
        if (/reconnect|plans|abonnement|amis/i.test(oc)) item.style.display = 'none';
      }
    });

    // Accueil : ne garder que les raccourcis utiles
    var keepHome = {
      homeBtnAgenda: true,
      homeBtnMessages: true,
      homeBtnMap: true,
      homeBtnEvents: true,
      homeBtnProfile: true
    };
    document.querySelectorAll('#homeDashboard .home-btn').forEach(function (btn) {
      if (keepHome[btn.id]) {
        btn.style.display = '';
      } else {
        btn.style.display = 'none';
      }
    });

    // Bannière staff
    var dash = document.getElementById('homeDashboard');
    if (dash && !document.getElementById('staffHomeBanner')) {
      var b = document.createElement('div');
      b.id = 'staffHomeBanner';
      b.style.cssText = 'background:#111;color:#fff;border-radius:14px;padding:14px 16px;margin-bottom:16px;font-weight:700;font-size:14px;line-height:1.4';
      b.innerHTML = '🛡️ Espace Staff AUPYGO<br><span style="font-weight:500;font-size:12px;opacity:0.9">Agenda · Messages · Carte · Sorties — pas d\'amis ni d\'abonnement</span>';
      dash.insertBefore(b, dash.firstChild);
    }
  }

  function forceStaffPremium() {
    if (!isStaff()) return;
    try { currentPlan = 'PREMIUM'; } catch (e) {}
    try { window.currentPlan = 'PREMIUM'; } catch (e2) {}
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
          showToast('Les comptes Staff n\'ont pas d\'abonnement — accès Premium inclus.', 'success');
        }
        return prevGo('home');
      }
      if (page === 'reconnect') {
        if (typeof showToast === 'function') {
          showToast('La page Amis n\'est pas disponible pour le Staff.', 'error');
        }
        return;
      }
      prevGo(page);
      setTimeout(applyStaffNav, 150);
      forceStaffPremium();
    };
  }

  function hideProfileExtras() {
    if (!isStaff()) return;
    document.querySelectorAll('button, a, .btn').forEach(function (btn) {
      var t = (btn.textContent || '').toLowerCase();
      var oc = (btn.getAttribute('onclick') || '');
      if (/supprimer.*compte|delete.*account|désactiver le compte/i.test(t) || /deleteAccount|delete_account/.test(oc)) {
        btn.style.display = 'none';
      }
      if (/abonnement|passer en premium|voir les offres/i.test(t)) {
        btn.style.display = 'none';
      }
      if (/mon agenda aupygo/i.test(t)) {
        btn.style.display = 'none';
      }
    });
  }

  function tick() {
    if (!isStaff()) return;
    forceStaffPremium();
    applyStaffNav();
    if (typeof getActivePage === 'function' && getActivePage() === 'profile') hideProfileExtras();
  }

  setTimeout(tick, 600);
  setInterval(tick, 2500);

  console.log('[AUPYGO] staff-ui.js chargé');
})();
