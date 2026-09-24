/* AUPYGO staff-ui.js — Accueil + menu Staff distincts, Premium auto, pas d'abo */
(function () {
  'use strict';
  if (typeof isStaff !== 'function') return;

  function applyStaffNav() {
    if (!isStaff()) return;

    document.querySelectorAll(
      '#homeBtnFriends, #homeBtnPlans, .more-sheet-item-plan'
    ).forEach(function (el) {
      if (el) el.style.display = 'none';
    });

    var dash = document.getElementById('homeDashboard');
    if (dash && !document.getElementById('staffHomeBanner')) {
      var b = document.createElement('div');
      b.id = 'staffHomeBanner';
      b.style.cssText = 'background:#111;color:#fff;border-radius:14px;padding:14px 16px;margin-bottom:16px;font-weight:700;font-size:14px;';
      b.innerHTML = '🛡️ Espace Staff AUPYGO — Agenda · Messages · Carte · Sorties';
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
      if (page === 'plans' && isStaff()) {
        if (typeof showToast === 'function') {
          showToast('Les comptes Staff n\'ont pas d\'abonnement — accès Premium inclus.', 'success');
        }
        return prevGo('home');
      }
      prevGo(page);
      if (page === 'home' || page === 'profile') {
        setTimeout(applyStaffNav, 200);
        forceStaffPremium();
      }
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
      if (/abonnement|passer en premium|voir les offres/i.test(t) && (oc.indexOf('plans') !== -1 || /subscription/i.test(oc))) {
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

  setTimeout(tick, 800);
  setInterval(tick, 2500);

  console.log('[AUPYGO] staff-ui.js chargé');
})();
