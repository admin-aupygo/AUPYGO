/* AUPYGO — staff-ui.js v4
 * - Accueil : masquer Amis + Abonnement
 * - Header : Messages + bouclier Staff (hors page Admin)
 * - Badge Staff PRÉCIS (Major Staff / Sergent Staff / Major Mod / Sergent Mod)
 * - Premium forcé + stop clignotement messages
 */
(function () {
  'use strict';

  function staffReady() {
    return typeof isStaff === 'function' && isStaff();
  }

  function isAdminPage() {
    try {
      if (typeof getActivePage === 'function' && getActivePage() === 'admin') return true;
    } catch (e) {}
    var adminEl = document.getElementById('admin');
    if (adminEl && adminEl.classList && adminEl.classList.contains('active')) return true;
    return false;
  }

  /** Label précis du grade selon la spec */
  function getPreciseStaffLabel() {
    var role = (typeof getNormalizedRole === 'function') ? getNormalizedRole() : 'user';
    var shortMap = {
      amiral: 'Amiral',
      major_staff: 'Major Staff',
      sergent_staff: 'Sergent Staff',
      major_moderateur: 'Major Mod',
      sergent_moderateur: 'Sergent Mod'
    };
    if (shortMap[role]) return shortMap[role];
    try {
      var p = window.currentUserProfile || {};
      if (typeof getStaffRoleLabel === 'function') {
        return getStaffRoleLabel(role, p.staff_country || p.country, p.staff_city || p.city);
      }
    } catch (e) {}
    return 'Staff';
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
    ['navFriends', 'homeBtnFriends'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.style.display = 'none';
        el.style.pointerEvents = 'none';
      }
    });

    ['homeBtnMessages', 'homeBtnEvents', 'homeBtnAgenda', 'homeBtnMap', 'homeBtnProfile'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.style.display = '';
      el.style.pointerEvents = 'auto';
      el.removeAttribute('hidden');
    });
  }

  function stopMessageBlinkIfRead() {
    var total = 0;
    try {
      if (typeof getTotalUnreadCount === 'function') total = getTotalUnreadCount() || 0;
    } catch (e) {}
    if (total > 0) return;

    document.querySelectorAll(
      '#navMessages, #bottomNavMessages, [data-nav="messages"], #homeBtnMessages, #headerMessagesBtn'
    ).forEach(function (el) {
      if (!el) return;
      el.classList.remove('has-unread-messages', 'nav-blink', 'blink', 'pulse', 'unread');
      el.querySelectorAll('.messages-badge, .badge, .bn-badge').forEach(function (b) {
        b.textContent = '0';
        b.style.display = 'none';
        b.classList.remove('show');
      });
    });
    var badge = document.getElementById('messagesBadge');
    if (badge) {
      badge.textContent = '0';
      badge.classList.remove('show');
      badge.style.display = 'none';
    }
    var badgeB = document.getElementById('messagesBadgeBottom') || document.getElementById('bottomMessagesBadge');
    if (badgeB) {
      badgeB.textContent = '0';
      badgeB.classList.remove('show');
      badgeB.style.display = 'none';
    }
  }

  function applyStaffBadges() {
    if (!staffReady()) return;
    forceStaffPremium();

    var label = getPreciseStaffLabel();

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

    var premiumBadge = document.getElementById('badge-PREMIUM');
    if (premiumBadge) {
      premiumBadge.style.display = 'block';
      premiumBadge.textContent = label;
    }
  }

  function rebuildMoreMenuForStaff() {
    if (!staffReady()) return;
    var list = document.querySelector('.more-sheet-list');
    if (!list) return;

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
  }

  function injectHeaderMessagesBtn() {
    if (!staffReady()) return;
    var actions = document.querySelector('.header-actions');
    if (!actions) return;

    var existing = document.getElementById('headerMessagesBtn');
    if (existing) {
      existing.style.display = '';
      return;
    }

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'headerMessagesBtn';
    btn.title = 'Messages';
    btn.setAttribute('aria-label', 'Messages');
    btn.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;border:1px solid #e2e8f0;background:#fff;cursor:pointer;font-size:18px;margin-right:8px;position:relative;';
    btn.innerHTML = '💬<span id="headerMessagesBadge" style="display:none;position:absolute;top:-2px;right:-2px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;font-weight:800;line-height:16px">0</span>';
    btn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof go === 'function') go('messages');
    };

    var lang = actions.querySelector('.lang-select') || actions.querySelector('#language');
    var shield = document.getElementById('staffHeaderWrap');
    if (shield && shield.parentNode === actions) {
      actions.insertBefore(btn, shield);
    } else if (lang) {
      actions.insertBefore(btn, lang);
    } else {
      actions.appendChild(btn);
    }
  }

  function syncHeaderMessagesBadge() {
    var hb = document.getElementById('headerMessagesBadge');
    if (!hb) return;
    var total = 0;
    try {
      if (typeof getTotalUnreadCount === 'function') total = getTotalUnreadCount() || 0;
    } catch (e) {}
    if (total > 0) {
      hb.style.display = 'block';
      hb.textContent = total > 99 ? '99+' : String(total);
    } else {
      hb.style.display = 'none';
      hb.textContent = '0';
    }
  }

  function injectStaffHeaderShield() {
    if (!staffReady()) return;
    var actions = document.querySelector('.header-actions');
    if (!actions) return;

    var wrap = document.getElementById('staffHeaderWrap');

    if (isAdminPage()) {
      if (wrap) {
        wrap.style.display = 'none';
        wrap.setAttribute('hidden', 'true');
      }
      return;
    }

    if (wrap) {
      wrap.style.display = '';
      wrap.removeAttribute('hidden');
    }

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
    if (lab) lab.textContent = getPreciseStaffLabel();
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
        if (page === 'messages') {
          setTimeout(stopMessageBlinkIfRead, 300);
          setTimeout(stopMessageBlinkIfRead, 1000);
        }
        setTimeout(tick, 150);
      };
    }
  }

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

    if (typeof window.updateMessagesBadge === 'function' && !window._staffMsgBadgePatched) {
      window._staffMsgBadgePatched = true;
      var _origBadge = window.updateMessagesBadge;
      window.updateMessagesBadge = function () {
        _origBadge.apply(this, arguments);
        syncHeaderMessagesBadge();
        stopMessageBlinkIfRead();
      };
    }

    if (typeof window.markConversationRead === 'function' && !window._staffMarkReadPatched) {
      window._staffMarkReadPatched = true;
      var _origMark = window.markConversationRead;
      window.markConversationRead = function () {
        var r = _origMark.apply(this, arguments);
        setTimeout(stopMessageBlinkIfRead, 50);
        setTimeout(stopMessageBlinkIfRead, 400);
        return r;
      };
    }
  }

  function tick() {
    if (!staffReady()) return;
    forceStaffPremium();
    hideStaffHomeButtons();
    applyStaffBadges();
    rebuildMoreMenuForStaff();
    injectHeaderMessagesBtn();
    injectStaffHeaderShield();
    syncHeaderMessagesBadge();
    stopMessageBlinkIfRead();
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

  console.log('[AUPYGO] staff-ui.js v4 (badges précis)');
})();
