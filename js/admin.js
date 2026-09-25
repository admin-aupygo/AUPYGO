/* =========================
   AUPYGO — Rôles & Panneau Staff (Admin-Amiral + Staff)
   Chargé APRÈS app.js
========================= */

(function () {
  'use strict';

  var STAFF_EMAIL_PATTERN = /^aupygo-staff[-.].+@.+$/i;
  var STAFF_EMAIL_WHITELIST = ['aupygo-staff-fr1@protonmail.com'];
  var ADMIN_EMAILS = ['aupygo@protonmail.com'];

  function emailLooksStaff(email) {
    if (!email) return null;
    var e = String(email).toLowerCase().trim();
    if (ADMIN_EMAILS.indexOf(e) !== -1) return 'admin_general';
    if (STAFF_EMAIL_WHITELIST.indexOf(e) !== -1) return 'host';
    if (STAFF_EMAIL_PATTERN.test(e)) return 'host';
    return null;
  }

  function isEmailConfirmed(user) {
    if (!user) return false;
    if (user.email_confirmed_at || user.confirmed_at) return true;
    if (user.user_metadata && user.user_metadata.email_verified === true) return true;
    return false;
  }

  window.currentUserRole = window.currentUserRole || 'user';

  window.isAdmin = function isAdmin() {
    if (window.currentUserIsAdmin) return true;
    if (window.currentUserRole === 'admin_general') return true;
    var email = window.currentUser && window.currentUser.email;
    if (email && ADMIN_EMAILS.indexOf(String(email).toLowerCase()) !== -1) return true;
    return false;
  };

  window.isHost = function isHost() {
    return window.currentUserRole === 'host';
  };

  window.isStaff = function isStaff() {
    return isAdmin() || isHost();
  };

  async function ensureStaffRoleFromEmail() {
    if (!window.currentUser || !window.currentUser.email) return;
    var wanted = emailLooksStaff(window.currentUser.email);
    if (!wanted) return;
    if (!isEmailConfirmed(window.currentUser)) {
      window.currentUserRole = 'user';
      window.currentUserIsAdmin = false;
      return;
    }
    try {
      var res = await supabaseClient.from('profiles').select('id, role, is_admin').eq('id', window.currentUser.id).maybeSingle();
      var profile = res.data;
      var needUpdate = !profile ||
        (wanted === 'admin_general' && profile.role !== 'admin_general') ||
        (wanted === 'host' && profile.role !== 'host' && profile.role !== 'admin_general');
      if (needUpdate) {
        var payload = { id: window.currentUser.id, role: wanted, subscription: 'PREMIUM' };
        var up = await supabaseClient.from('profiles').upsert(payload, { onConflict: 'id' });
        if (up.error) {
          await supabaseClient.from('profiles').update({ role: wanted, subscription: 'PREMIUM' }).eq('id', window.currentUser.id);
        }
      }
      window.currentUserRole = (profile && profile.role === 'admin_general') ? 'admin_general' : wanted;
      window.currentUserIsAdmin = window.currentUserRole === 'admin_general';
    } catch (e) {
      console.warn('[Staff] ensureStaffRoleFromEmail', e);
    }
  }

  var originalRefreshAuthUI = window.refreshAuthUI;
  if (typeof originalRefreshAuthUI === 'function') {
    window.refreshAuthUI = async function (redirectPage) {
      if (redirectPage === undefined) redirectPage = 'profile';
      await originalRefreshAuthUI(redirectPage);
      try {
        if (window.currentUser) {
          await ensureStaffRoleFromEmail();
          var pr = await supabaseClient.from('profiles').select('role, is_admin, subscription').eq('id', window.currentUser.id).maybeSingle();
          var profile = pr.data;
          if (profile) {
            if (emailLooksStaff(window.currentUser.email) && !isEmailConfirmed(window.currentUser)) {
              window.currentUserRole = 'user';
              window.currentUserIsAdmin = false;
            } else {
              window.currentUserRole = profile.role || 'user';
              window.currentUserIsAdmin = !!(profile.is_admin === true || profile.role === 'admin_general');
            }
            if (isStaff()) {
              try { currentPlan = 'PREMIUM'; } catch (e1) {}
              window.currentPlan = 'PREMIUM';
            }
          }
        } else {
          window.currentUserRole = 'user';
          window.currentUserIsAdmin = false;
        }
      } catch (e) {
        console.warn('[Staff] role fetch', e);
      }

      // FIX CRITIQUE : Staff/Admin ne doivent pas rester bloqués sur la landing inscription
      // (app.js exige profileSaved=true basé sur identity_locked)
      if (isStaff()) {
        try { profileSaved = true; } catch (e) {}
        try { window.profileSaved = true; } catch (e2) {}
        try {
          if (typeof updateHomeView === 'function') updateHomeView();
        } catch (e3) {}
      }

      applyStaffRestrictions();
      updateAdminButtonVisibility();
      if (typeof renderMarkers === 'function') renderMarkers();
    };
  }

  function applyStaffRestrictions() {
    var staff = isStaff();
    ['navFriends', 'homeBtnFriends'].forEach(function (id) {
      var btn = document.getElementById(id);
      if (!btn) return;
      if (staff) {
        btn.style.opacity = '0.35';
        btn.style.pointerEvents = 'none';
        btn.title = 'Non disponible pour le staff';
      } else {
        btn.style.opacity = '';
        btn.style.pointerEvents = '';
      }
    });
    if (typeof window.go === 'function' && !window._staffGoPatched) {
      window._staffGoPatched = true;
      var originalGo = window.go;
      window.go = function (page) {
        if (page === 'reconnect' && isStaff()) {
          if (typeof showToast === 'function') showToast('La page Amis n\'est pas disponible pour les comptes Staff', 'error');
          return;
        }
        if (page === 'admin' && !isAdmin()) {
          if (typeof showToast === 'function') showToast('Accès réservé à l\'administrateur', 'error');
          return;
        }
        originalGo(page);
        if (page === 'admin' && isAdmin()) loadAdminData();
        if (page === 'map' && typeof renderMarkers === 'function') setTimeout(function () { renderMarkers(); }, 200);
      };
    }
  }

  async function enrichProfilesWithRoles() {
    if (!Array.isArray(window.profiles) || !window.profiles.length) return;
    try {
      var ids = window.profiles.map(function (p) { return p && p.id; }).filter(Boolean);
      if (!ids.length) return;
      var { data } = await supabaseClient.from('profiles').select('id, role, is_admin').in('id', ids.slice(0, 300));
      if (!data) return;
      var map = {};
      data.forEach(function (r) { map[r.id] = r; });
      window.profiles.forEach(function (p) {
        if (map[p.id]) { p.role = map[p.id].role; p.is_admin = map[p.id].is_admin; }
      });
      if (typeof renderMarkers === 'function') renderMarkers();
    } catch (e) {}
  }

  if (typeof window.openMemberProfile === 'function' && !window._staffOpenMemberPatched) {
    window._staffOpenMemberPatched = true;
    var _origOpenMember = window.openMemberProfile;
    window.openMemberProfile = function (memberId) {
      if (!isStaff()) { _origOpenMember(memberId); return; }
      _origOpenMember(memberId);
      setTimeout(function () {
        var box = document.getElementById('memberModal');
        if (!box) return;
        box.querySelectorAll('.member-friend-btn, button[onclick*="Friend"], button[onclick*="friend"]').forEach(function (btn) {
          btn.style.display = 'none';
        });
        var target = (window.profiles || []).find(function (p) { return p && p.id === memberId; });
        var targetStaff = target && (target.is_admin === true || ['admin_general','host','moderator'].indexOf((target.role||'').toLowerCase()) >= 0);
        var allowMsg = (isAdmin() && targetStaff) || (isHost() && target && (target.role === 'admin_general' || target.is_admin === true));
        box.querySelectorAll('.member-msg-btn, button[onclick*="Message"], button[onclick*="messageMember"]').forEach(function (btn) {
          btn.style.display = allowMsg ? '' : 'none';
        });
      }, 80);
    };
  }

  if (typeof window.loadProfiles === 'function' && !window._staffLoadProfilesPatched) {
    window._staffLoadProfilesPatched = true;
    var _origLoadProfiles = window.loadProfiles;
    window.loadProfiles = async function () {
      await _origLoadProfiles.apply(this, arguments);
      await enrichProfilesWithRoles();
    };
  }

  function injectAdminButton() {
    var nav = document.querySelector('header nav');
    if (nav && !document.getElementById('navAdminBtn')) {
      var btn = document.createElement('button');
      btn.id = 'navAdminBtn';
      btn.style.display = 'none';
      btn.title = 'Administration';
      btn.innerHTML = '<span class="icon">🛡️</span>';
      btn.onclick = function () { go('admin'); };
      nav.appendChild(btn);
    }
  }

  function updateAdminButtonVisibility() {
    var btn = document.getElementById('navAdminBtn');
    if (btn) btn.style.display = 'none';
  }

  function injectAdminPage() {
    if (document.getElementById('admin')) return;
    var main = document.querySelector('main');
    if (!main) return;
    var section = document.createElement('section');
    section.id = 'admin';
    section.className = 'page';
    section.innerHTML =
      '<div class="section-title" style="margin-bottom:20px">' +
        '<h2 style="margin:0 0 6px">🛡️ Administration</h2>' +
        '<p style="margin:0;color:#64748b;font-size:14px">Gestion des membres, rôles et équipe Aupygo</p>' +
      '</div>' +
      '<div id="adminStats" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px"></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:16px;padding:14px;background:#fff;border:1px solid #e8e4ef;border-radius:16px">' +
        '<input type="search" id="adminSearchInput" placeholder="🔍 Rechercher un membre…" oninput="window.adminOnSearch(this.value)" style="flex:1;min-width:180px;padding:10px 14px;border:1px solid #e2e8f0;border-radius:12px;font-size:14px">' +
        '<select id="adminFilterSelect" onchange="window.adminOnFilter(this.value)" style="padding:10px 12px;border:1px solid #e2e8f0;border-radius:12px;font-size:13px">' +
          '<option value="all">Tous</option><option value="online">En ligne</option><option value="host">Staff</option><option value="admin">Admin-Amiral</option>' +
        '</select>' +
        '<button class="btn btn-secondary" onclick="window.adminRefresh()" style="border-radius:12px">🔄 Actualiser</button>' +
      '</div>' +
      '<div style="background:#fff;border:1px solid #e8e4ef;border-radius:16px;overflow:auto;box-shadow:0 4px 20px rgba(0,0,0,.04)">' +
        '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
          '<thead><tr style="background:#f8fafc">' +
            '<th style="text-align:left;padding:14px 16px;font-weight:700;color:#475569">Membre</th>' +
            '<th style="text-align:left;padding:14px 16px;font-weight:700;color:#475569">Rôle</th>' +
            '<th style="text-align:left;padding:14px 16px;font-weight:700;color:#475569">Plan</th>' +
            '<th style="text-align:left;padding:14px 16px;font-weight:700;color:#475569">Localisation</th>' +
            '<th style="text-align:left;padding:14px 16px;font-weight:700;color:#475569">Statut</th>' +
            '<th style="text-align:left;padding:14px 16px;font-weight:700;color:#475569">Actions</th>' +
          '</tr></thead>' +
          '<tbody id="adminTableBody"><tr><td colspan="6" style="text-align:center;padding:40px;color:#94a3b8">Chargement…</td></tr></tbody>' +
        '</table>' +
      '</div>';
    main.appendChild(section);
    if (!document.getElementById('adminActionStyles')) {
      var st2 = document.createElement('style');
      st2.id = 'adminActionStyles';
      st2.textContent =
        '.admin-actions-frozen{display:flex;flex-wrap:wrap;gap:4px;opacity:0.55}' +
        '.admin-act-btn{padding:5px 10px;border-radius:8px;border:1px solid #e2e8f0;background:#f1f5f9;font-size:11px;font-weight:600;cursor:not-allowed;color:#94a3b8}' +
        '#admin{padding-bottom:40px}' +
        '.admin-stat-card{background:#fff;border:1px solid #e8e4ef;border-radius:16px;padding:18px 14px;text-align:center}' +
        '.admin-stat-value{font-size:28px;font-weight:800;color:#7c3aed}' +
        '.admin-stat-label{font-size:12px;color:#64748b;margin-top:4px;font-weight:600}' +
        '#adminTableBody td{padding:14px 16px;border-top:1px solid #f1f5f9;vertical-align:middle}' +
        '#adminTableBody tr:hover td{background:#fafafa}' +
        '.admin-badge{display:inline-block;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700}' +
        '.admin-badge.host{background:#334155;color:#fff}' +
        '.admin-badge.admin_general{background:#111;color:#fff}' +
        '.admin-badge.user{background:#e2e8f0;color:#475569}';
      document.head.appendChild(st2);
    }
  }

  var adminUsersCache = [];
  var adminFilter = 'all';
  var adminSearch = '';

  async function loadAdminData() {
    if (!isAdmin()) return;
    var tbody = document.getElementById('adminTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#94a3b8">Chargement…</td></tr>';
    try {
      var { data, error } = await supabaseClient.from('profiles')
        .select('id, display_name, age, gender, city, country, host_country, subscription, last_seen, is_online, is_admin, role')
        .order('last_seen', { ascending: false });
      if (error) throw error;
      adminUsersCache = data || [];
      renderAdminStats();
      renderAdminTable();
    } catch (e) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#c00">Erreur</td></tr>';
    }
  }

  function renderAdminStats() {
    var box = document.getElementById('adminStats');
    if (!box) return;
    var list = adminUsersCache;
    var now = Date.now();
    var ONLINE = 15 * 60 * 1000;
    var isOn = function (u) { return u.is_online === true || (u.last_seen && (now - new Date(u.last_seen).getTime()) < ONLINE); };
    var staffN = list.filter(function (u) { return u.role === 'admin_general' || u.role === 'host' || u.is_admin; }).length;
    box.innerHTML =
      card(list.length, 'Membres') +
      card(list.filter(isOn).length, 'En ligne') +
      card(staffN, 'Staff / Admin');
    function card(v, label) {
      return '<div class="admin-stat-card"><div class="admin-stat-value">' + v + '</div><div class="admin-stat-label">' + label + '</div></div>';
    }
  }

  function renderAdminTable() {
    var tbody = document.getElementById('adminTableBody');
    if (!tbody) return;
    var now = Date.now();
    var ONLINE = 15 * 60 * 1000;
    var list = adminUsersCache.slice();
    if (adminFilter === 'online') list = list.filter(function (u) { return u.is_online || (u.last_seen && (now - new Date(u.last_seen).getTime()) < ONLINE); });
    else if (adminFilter === 'host') list = list.filter(function (u) { return u.role === 'host'; });
    else if (adminFilter === 'admin') list = list.filter(function (u) { return u.role === 'admin_general' || u.is_admin; });
    if (adminSearch.trim()) {
      var q = adminSearch.trim().toLowerCase();
      list = list.filter(function (u) {
        return [u.display_name, u.city, u.country].filter(Boolean).join(' ').toLowerCase().indexOf(q) !== -1;
      });
    }
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#94a3b8">Aucun résultat</td></tr>';
      return;
    }
    function esc(s) {
      return String(s || '').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
    }
    tbody.innerHTML = list.map(function (u) {
      var name = u.display_name || 'Sans nom';
      var rawRole = u.role || (u.is_admin ? 'admin_general' : 'user');
      var roleLabel = 'User';
      var roleClass = 'user';
      var plan = (u.subscription || 'FREE').toUpperCase();
      if (rawRole === 'host' || rawRole === 'moderator') {
        roleLabel = 'Staff · Sergent';
        roleClass = 'host';
        plan = 'STAFF';
      } else if (rawRole === 'admin_general' || u.is_admin) {
        roleLabel = 'Admin-Amiral';
        roleClass = 'admin_general';
        plan = 'ADMIN-AMIRAL';
      }
      var loc = [u.city, u.country || u.host_country].filter(Boolean).join(', ') || '—';
      var online = u.is_online || (u.last_seen && (now - new Date(u.last_seen).getTime()) < ONLINE);
      var lastSeen = u.last_seen
        ? new Date(u.last_seen).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        : '—';
      var actions =
        '<div class="admin-actions-frozen" title="Actions temporairement désactivées">' +
        '<button type="button" disabled class="admin-act-btn" data-action="staff" data-uid="' + u.id + '">→ STAFF</button>' +
        '<button type="button" disabled class="admin-act-btn" data-action="user" data-uid="' + u.id + '">→ User</button>' +
        '<button type="button" disabled class="admin-act-btn" data-action="admin" data-uid="' + u.id + '">→ Admin-Amiral</button>' +
        '</div>';
      return '<tr><td><strong>' + esc(name) + '</strong></td>' +
        '<td><span class="admin-badge ' + roleClass + '">' + roleLabel + '</span></td>' +
        '<td>' + plan + '</td><td>' + esc(loc) + '</td>' +
        '<td>' + (online ? '🟢' : '⚫') + ' ' + lastSeen + '</td><td>' + actions + '</td></tr>';
    }).join('');
  }

  window.adminOnSearch = function (v) { adminSearch = v || ''; renderAdminTable(); };
  window.adminOnFilter = function (v) { adminFilter = v || 'all'; renderAdminTable(); };
  window.adminRefresh = function () { loadAdminData(); if (typeof showToast === 'function') showToast('Actualisé', 'success'); };

  window.adminSetRole = async function (userId, newRole) {
    if (!isAdmin()) return;
    if (!confirm('Changer le rôle en « ' + newRole + ' » ?')) return;
    try {
      var payload = { role: newRole };
      if (newRole === 'host' || newRole === 'admin_general') payload.subscription = 'PREMIUM';
      var { error } = await supabaseClient.from('profiles').update(payload).eq('id', userId);
      if (error) throw error;
      var u = adminUsersCache.find(function (x) { return x.id === userId; });
      if (u) { u.role = newRole; if (payload.subscription) u.subscription = payload.subscription; }
      renderAdminStats();
      renderAdminTable();
      if (typeof showToast === 'function') showToast('Rôle mis à jour', 'success');
    } catch (e) {
      if (typeof showToast === 'function') showToast('Erreur: ' + e.message, 'error');
    }
  };

  function loadStaffScript(src) {
    var name = src.replace('js/', '');
    document.querySelectorAll('script[src*="' + name + '"]').forEach(function (el) {
      try { el.parentNode.removeChild(el); } catch (e) {}
    });
    var s = document.createElement('script');
    s.src = src + '?v=20260925ae';
    s.async = false;
    document.body.appendChild(s);
  }

  function init() {
    injectAdminButton();
    injectAdminPage();
    setTimeout(function () {
      applyStaffRestrictions();
      updateAdminButtonVisibility();
      enrichProfilesWithRoles();
      if (window.currentUser) ensureStaffRoleFromEmail();
      if (isStaff()) {
        try { profileSaved = true; } catch (e) {}
        try { window.profileSaved = true; } catch (e2) {}
        try { if (typeof updateHomeView === 'function') updateHomeView(); } catch (e3) {}
      }
    }, 700);
    loadStaffScript('js/staff-ui.js');
    loadStaffScript('js/staff-messages.js');
    loadStaffScript('js/staff-events.js');
    loadStaffScript('js/staff-profile.js');
    loadStaffScript('js/staff-msg-unlock.js');
    loadStaffScript('js/staff-agenda-nav.js');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  setInterval(updateAdminButtonVisibility, 4000);
  setInterval(applyStaffRestrictions, 5000);

  console.log('[AUPYGO] admin.js v20260925ae');
})();
