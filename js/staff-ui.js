/* AUPYGO — staff-ui.js
 * Interface Staff / Amiral :
 * - Accueil : masquer Amis + Mon abonnement
 * - Header : bouclier 🛡️ + menu raccourcis (Messages, Sorties, Admin)
 * - Badge « Staff » à la place de Premium
 * - Privilèges Premium hérités automatiquement
 */
(function () {
  'use strict';

  function staffReady() {
    return typeof isStaff === 'function' && isStaff();
  }

  function forceStaffPremium() {
    if (!staffReady()) return;
    try { currentPlan = 'PREMIUM'; } catch (e) {}
    try { window.currentPlan = 'PREMIUM'; } catch (e2) {}
    try { localStorage.setItem('aupygo_plan', 'PREMIUM'); } catch (e3) {}
  }

  function hideStaffHomeButtons() {
    if (!staffReady()) return;
    ['homeBtnFriends', 'homeBtnPlans'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.style.display = 'none';
        el.setAttribute('hidden', 'true');
      }
    });
    // Nav amis
    ['navFriends', 'homeBtnFriends'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.style.display = 'none';
        el.style.pointerEvents = 'none';
      }
    });
  }

  function applyStaffBadges() {
    if (!staffReady()) return;
    forceStaffPremium();

    var label = (typeof isAmiral === 'function' && isAmiral()) ? 'Amiral' : 'Staff';

    // Header badge (remplace PREMIUM / diamant)
    var badge = document.getElementById('headerPlanBadge');
    if (badge) {
      badge.textContent = label;
      badge.style.display = '';
    }
    var avatar = document.getElementById('headerPlanAvatar');
    if (avatar) avatar.textContent = '🛡️';

    var bottomBadge = document.getElementById('bottomNavPlanBadge');
    if (bottomBadge) bottomBadge.textContent = label;
    var bottomAvatar = document.getElementById('bottomNavAvatar');
    if (bottomAvatar) bottomAvatar.textContent = '🛡️';

    var sheetPlan = document.getElementById('moreSheetPlan');
    if (sheetPlan) sheetPlan.textContent = label;
    var sheetPill = document.getElementById('moreSheetPlanPill');
    if (sheetPill) sheetPill.textContent = label;
    var sheetAvatar = document.getElementById('moreSheetAvatar');
    if (sheetAvatar) sheetAvatar.textContent = '🛡️';

    // Page plans : mention Staff à la place de Premium actif
    var premiumBadge = document.getElementById('badge-PREMIUM');
    if (premiumBadge) {
      premiumBadge.style.display = 'block';
      premiumBadge.textContent = label;
    }
    var planPremium = document.getElementById('plan-PREMIUM');
    if (planPremium) {
      planPremium.classList.add('active-plan');
      var titles = planPremium.querySelectorAll('h3, .plan-name, .plan-title');
      titles.forEach(function (t) {
        if (/premium/i.test(t.textContent || '')) {
          if (!t.dataset.staffRelabeled) {
            t.dataset.staffRelabeled = '1';
            t.textContent = (t.textContent || '').replace(/PREMIUM|Premium/gi, label);
          }
        }
      });
    }
  }

  function rebuildMoreMenuForStaff() {
    if (!staffReady()) return;
    var list = document.querySelector('.more-sheet-list');
    if (!list) return;

    // Vider et reconstruire
    list.innerHTML = '';

    function addItem(icon, label, page) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'more-sheet-item';
      btn.innerHTML = '<span class="msi-icon">' + icon + '</span><span>' + label + '</span>';
      btn.onclick = function () {
        if (typeof closeMoreMenu === 'function') closeMoreMenu();
        if (typeof go === 'function') go(page);
      };
      list.appendChild(btn);
    }

    addItem('👤', 'Profil', 'profile');
    addItem('💬', 'Messages', 'messages');
    addItem('🎉', 'Sorties', 'events');
    addItem('📅', 'Agenda', 'agenda');
    if (typeof isAmiral === 'function' && isAmiral()) {
      addItem('🛡️', 'Administration', 'admin');
    }
    // PAS d'Abonnement, PAS d'Amis
  }

  function injectStaffHeaderShield() {
    if (!staffReady()) return;
    var actions = document.querySelector('.header-actions');
    if (!actions) return;

    // Masquer le bouton plan classique pour Amiral (menu dédié)
    var planBtn = document.getElementById('headerPlanBtn');
    if (planBtn && typeof isAmiral === 'function' && isAmiral()) {
      // On garde le bouton mais avatar/badge déjà en bouclier
    }

    var wrap = document.getElementById('staffHeaderWrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'staffHeaderWrap';
      wrap.style.cssText = 'position:relative;display:inline-flex;align-items:center;margin-right:8px;';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'staffHeaderBtn';
      btn.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;border:1px solid #1e293b;background:#111;color:#fff;font-weight:700;font-size:12px;cursor:pointer;';
      btn.innerHTML = '🛡️ <span id="staffHeaderLabel">Staff</span> <span style="font-size:10px">▾</span>';
      btn.onclick = function (e) {
        e.stopPropagation();
        var m = document.getElementById('staffQuickMenu');
        if (m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
      };

      var menu = document.createElement('div');
      menu.id = 'staffQuickMenu';
      menu.style.cssText = 'display:none;position:absolute;top:110%;right:0;min-width:180px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.12);padding:8px;z-index:10000;';

      function qItem(label, page) {
        return '<button type="button" class="staff-qitem" data-go="' + page + '">' + label + '</button>';
      }
      var html = qItem('💬 Messages', 'messages') +
        qItem('🎉 Sorties', 'events') +
        qItem('📅 Agenda', 'agenda');
      if (typeof isAmiral === 'function' && isAmiral()) {
        html += qItem('🛡️ Administration', 'admin');
      }
      menu.innerHTML = html;

      if (!document.getElementById('staffQuickMenuStyle')) {
        var st = document.createElement('style');
        st.id = 'staffQuickMenuStyle';
        st.textContent =
          '.staff-qitem{display:block;width:100%;text-align:left;padding:10px 12px;border:0;background:transparent;border-radius:10px;font-weight:600;font-size:13px;cursor:pointer;color:#1e293b}' +
          '.staff-qitem:hover{background:#f1f5f9}';
        document.head.appendChild(st);
      }

      menu.querySelectorAll('.staff-qitem').forEach(function (item) {
        item.onclick = function () {
          menu.style.display = 'none';
          var page = item.getAttribute('data-go');
          if (typeof go === 'function') go(page);
        };
      });

      wrap.appendChild(btn);
      wrap.appendChild(menu);

      var lang = actions.querySelector('.lang-select') || actions.querySelector('#language');
      if (lang) actions.insertBefore(wrap, lang);
      else actions.appendChild(wrap);

      document.addEventListener('click', function () {
        var m = document.getElementById('staffQuickMenu');
        if (m) m.style.display = 'none';
      });
    }

    var lab = document.getElementById('staffHeaderLabel');
    if (lab) lab.textContent = (typeof isAmiral === 'function' && isAmiral()) ? 'Amiral' : 'Staff';
  }

  function blockStaffNav() {
    if (!staffReady()) return;
    if (typeof window.go === 'function' && !window._staffUiGoPatched) {
      window._staffUiGoPatched = true;
      var prev = window.go;
      window.go = function (page) {
        if (page === 'plans') {
          if (typeof showToast === 'function') {
            showToast('Compte Staff — privilèges Premium inclus (pas d\'abonnement).', 'success');
          }
          return prev('home');
        }
        if (page === 'reconnect') {
          if (typeof showToast === 'function') {
            showToast('Page Amis indisponible pour le Staff.', 'error');
          }
          return;
        }
        prev(page);
        setTimeout(tick, 150);
      };
    }
  }

  // Intercepter updatePlanAvatarUI / updatePlanUI
  function patchPlanUI() {
    if (typeof window.updatePlanAvatarUI === 'function' && !window._staffPlanAvatarPatched) {
      window._staffPlanAvatarPatched = true;
      var _orig = window.updatePlanAvatarUI;
      window.updatePlanAvatarUI = function () {
        _orig.apply(this, arguments);
        if (staffReady()) applyStaffBadges();
      };
    }
    if (typeof window.updatePlanUI === 'function' && !window._staffPlanUiPatched) {
      window._staffPlanUiPatched = true;
      var _orig2 = window.updatePlanUI;
      window.updatePlanUI = function () {
        if (staffReady()) forceStaffPremium();
        _orig2.apply(this, arguments);
        if (staffReady()) applyStaffBadges();
      };
    }
  }

  function tick() {
    if (!staffReady()) return;
    forceStaffPremium();
    hideStaffHomeButtons();
    applyStaffBadges();
    rebuildMoreMenuForStaff();
    injectStaffHeaderShield();
    blockStaffNav();
  }

  function init() {
    patchPlanUI();
    blockStaffNav();
    setTimeout(tick, 400);
    setTimeout(tick, 1200);
    setInterval(function () {
      if (staffReady()) tick();
    }, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  console.log('[AUPYGO] staff-ui.js chargé');
})();
