/* =========================
   AUPYGO — Rôles & Panneau Staff (charte organisationnelle)
   Chargé APRÈS app.js et staff-hierarchy.js
========================= */

(function () {
  'use strict';

  var STAFF_EMAIL_PATTERN = /^aupygo-staff[-.].+@.+$/i;
  var STAFF_EMAIL_WHITELIST = ['aupygo-staff-fr1@protonmail.com'];
  var ADMIN_EMAILS = ['aupygo@protonmail.com'];

  function emailLooksStaff(email) {
    if (!email) return null;
    var e = String(email).toLowerCase().trim();
    if (ADMIN_EMAILS.indexOf(e) !== -1) return 'amiral';
    if (STAFF_EMAIL_WHITELIST.indexOf(e) !== -1) return 'sergent_staff';
    if (STAFF_EMAIL_PATTERN.test(e)) return 'sergent_staff';
    return null;
  }

  function isEmailConfirmed(user) {
    if (!user) return false;
    if (user.email_confirmed_at || user.confirmed_at) return true;
    if (user.user_metadata && user.user_metadata.email_verified === true) return true;
    return false;
  }

  window.currentUserRole = window.currentUserRole || 'user';

  if (typeof window.isStaff !== 'function') {
    window.isStaff = function () {
      var r = (window.currentUserRole || '').toLowerCase();
      return ['amiral','major_staff','sergent_staff','major_moderateur','sergent_moderateur','admin_general','host'].indexOf(r) !== -1
        || !!window.currentUserIsAdmin;
    };
  }
  if (typeof window.isAmiral !== 'function') {
    window.isAmiral = function () {
      var r = (window.currentUserRole || '').toLowerCase();
      return r === 'amiral' || r === 'admin_general' || !!window.currentUserIsAdmin;
    };
  }
  if (typeof window.isAdmin !== 'function') {
    window.isAdmin = function () { return window.isAmiral(); };
  }
  if (typeof window.isHost !== 'function') {
    window.isHost = function () {
      var r = (window.currentUserRole || '').toLowerCase();
      return r === 'sergent_staff' || r === 'major_staff' || r === 'host';
    };
  }
  if (typeof window.isMemberStaffProfile !== 'function') {
    window.isMemberStaffProfile = function (p) {
      if (!p) return false;
      if (p.is_admin === true) return true;
      var r = (p.role || '').toLowerCase();
      return ['amiral','major_staff','sergent_staff','major_moderateur','sergent_moderateur','admin_general','host','moderator'].indexOf(r) !== -1;
    };
  }

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
        (wanted === 'amiral' && profile.role !== 'amiral' && profile.role !== 'admin_general') ||
        (wanted === 'sergent_staff' && ['sergent_staff','major_staff','amiral','host','admin_general'].indexOf(profile.role) === -1);
      if (needUpdate) {
        var payload = {
          id: window.currentUser.id,
          role: wanted,
          subscription: 'PREMIUM',
          staff_branch: 'evenementiel',
          is_admin: wanted === 'amiral'
        };
        var up = await supabaseClient.from('profiles').upsert(payload, { onConflict: 'id' });
        if (up.error) {
          await supabaseClient.from('profiles').update({
            role: wanted,
            subscription: 'PREMIUM',
            is_admin: wanted === 'amiral'
          }).eq('id', window.currentUser.id);
        }
      }
      window.currentUserRole = (profile && (profile.role === 'amiral' || profile.role === 'admin_general')) ? 'amiral' : wanted;
      window.currentUserIsAdmin = window.currentUserRole === 'amiral';
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
          var pr = await supabaseClient.from('profiles')
            .select('role, is_admin, subscription, staff_country, staff_city, staff_branch')
            .eq('id', window.currentUser.id).maybeSingle();
          var profile = pr.data;
          if (profile) {
            if (emailLooksStaff(window.currentUser.email) && !isEmailConfirmed(window.currentUser)) {
              window.currentUserRole = 'user';
              window.currentUserIsAdmin = false;
            } else {
              var raw = profile.role || 'user';
              if (raw === 'admin_general') raw = 'amiral';
              if (raw === 'host') raw = 'sergent_staff';
              if (raw === 'moderator') raw = 'sergent_moderateur';
              window.currentUserRole = raw;
              window.currentUserIsAdmin = !!(profile.is_admin === true || raw === 'amiral');
            }
            window.currentUserProfile = window.currentUserProfile || {};
            window.currentUserProfile.staff_country = profile.staff_country;
            window.currentUserProfile.staff_city = profile.staff_city;
            window.currentUserProfile.staff_branch = profile.staff_branch;
            window.currentUserProfile.role = window.currentUserRole;

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
        if (page === 'admin' && !isAmiral()) {
          if (typeof showToast === 'function') showToast('Accès réservé à l\'Amiral', 'error');
          return;
        }
        originalGo(page);
        if (page === 'admin' && isAmiral()) loadAdminData();
        if (page === 'map' && typeof renderMarkers === 'function') setTimeout(function () { renderMarkers(); }, 200);
      };
    }
  }

  async function enrichProfilesWithRoles() {
    if (!Array.isArray(window.profiles) || !window.profiles.length) return;
    try {
      var ids = window.profiles.map(function (p) { return p && p.id; }).filter(Boolean);
      if (!ids.length) return;
      var { data } = await supabaseClient.from('profiles')
        .select('id, role, is_admin, staff_country, staff_city, staff_branch')
        .in('id', ids.slice(0, 300));
      if (!data) return;
      var map = {};
      data.forEach(function (r) { map[r.id] = r; });
      window.profiles.forEach(function (p) {
        if (map[p.id]) {
          p.role = map[p.id].role;
          p.is_admin = map[p.id].is_admin;
          p.staff_country = map[p.id].staff_country;
          p.staff_city = map[p.id].staff_city;
          p.staff_branch = map[p.id].staff_branch;
        }
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
        var targetStaff = target && isMemberStaffProfile(target);
        var allowMsg = isAmiral() && targetStaff;
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
      btn.title = 'Administration (Amiral)';
      btn.innerHTML = '<span class="icon">🛡️</span>';
      btn.onclick = function () { go('admin'); };
      nav.appendChild(btn);
    }
  }

  function updateAdminButtonVisibility() {
    var btn = document.getElementById('navAdminBtn');
    if (btn) btn.style.display = isAmiral() ? '' : 'none';
  }

  function roleLabel(role) {
    if (typeof window.getStaffRoleLabel === 'function') return window.getStaffRoleLabel(role);
    var map = {
      amiral: 'Amiral', major_staff: 'Major Staff', sergent_staff: 'Sergent Staff',
      major_moderateur: 'Major Modérateur', sergent_moderateur: 'Sergent Modérateur',
      admin_general: 'Amiral', host: 'Sergent Staff', moderator: 'Sergent Modérateur', user: 'User'
    };
    return map[role] || role || 'User';
  }

  function roleClass(role) {
    var r = (role || '').toLowerCase();
    if (r === 'amiral' || r === 'admin_general') return 'amiral';
    if (r === 'major_staff' || r === 'major_moderateur') return 'major';
    if (r === 'sergent_staff' || r === 'sergent_moderateur' || r === 'host') return 'sergent';
    return 'user';
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
        '<h2 style="margin:0 0 6px">🛡️ Administration — Amiral</h2>' +
        '<p style="margin:0;color:#64748b;font-size:14px">Gestion des membres et de l\'équipe Aupygo (charte organisationnelle)</p>' +
      '</div>' +
      '<div id="adminStats" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px"></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:16px;padding:14px;background:#fff;border:1px solid #e8e4ef;border-radius:16px">' +
        '<input type="search" id="adminSearchInput" placeholder="🔍 Rechercher un membre…" oninput="window.adminOnSearch(this.value)" style="flex:1;min-width:180px;padding:10px 14px;border:1px solid #e2e8f0;border-radius:12px;font-size:14px">' +
        '<select id="adminFilterSelect" onchange="window.adminOnFilter(this.value)" style="padding:10px 12px;border:1px solid #e2e8f0;border-radius:12px;font-size:13px">' +
          '<option value="all">Tous</option><option value="online">En ligne</option>' +
          '<option value="amiral">Amiral</option><option value="major_staff">Major Staff</option>' +
          '<option value="sergent_staff">Sergent Staff</option><option value="major_moderateur">Major Modérateur</option>' +
          '<option value="sergent_moderateur">Sergent Modérateur</option><option value="staff">Tout le Staff</option>' +
        '</select>' +
        '<button class="btn btn-secondary" onclick="window.adminRefresh()" style="border-radius:12px">🔄 Actualiser</button>' +
      '</div>' +
      '<div style="background:#fff;border:1px solid #e8e4ef;border-radius:16px;overflow:auto;box-shadow:0 4px 20px rgba(0,0,0,.04)">' +
        '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
          '<thead><tr style="background:#f8fafc">' +
            '<th style="text-align:left;padding:14px 16px;font-weight:700;color:#475569">Membre</th>' +
            '<th style="text-align:left;padding:14px 16px;font-weight:700;color:#475569">Rôle</th>' +
            '<th style="text-align:left;padding:14px 16px;font-weight:700;color:#475569">Zone</th>' +
            '<th style="text-align:left;padding:14px 16px;font-weight:700;color:#475569">Plan</th>' +
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
        '.admin-actions{display:flex;flex-wrap:wrap;gap:4px}' +
        '.admin-act-btn{padding:5px 10px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;font-size:11px;font-weight:600;cursor:pointer;color:#334155}' +
        '.admin-act-btn:hover{background:#e2e8f0}' +
        '#admin{padding-bottom:40px}' +
        '.admin-stat-card{background:#fff;border:1px solid #e8e4ef;border-radius:16px;padding:18px 14px;text-align:center}' +
        '.admin-stat-value{font-size:28px;font-weight:800;color:#7c3aed}' +
        '.admin-stat-label{font-size:12px;color:#64748b;margin-top:4px;font-weight:600}' +
        '#adminTableBody td{padding:14px 16px;border-top:1px solid #f1f5f9;vertical-align:middle}' +
        '#adminTableBody tr:hover td{background:#fafafa}' +
        '.admin-badge{display:inline-block;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700}' +
        '.admin-badge.amiral{background:#111;color:#fff}' +
        '.admin-badge.major{background:#1e40af;color:#fff}' +
        '.admin-badge.sergent{background:#334155;color:#fff}' +
        '.admin-badge.user{background:#e2e8f0;color:#475569}';
      document.head.appendChild(st2);
    }
  }

  var adminUsersCache = [];
  var adminFilter = 'all';
  var adminSearch = '';

  async function loadAdminData() {
    if (!isAmiral()) return;
    var tbody = document.getElementById('adminTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#94a3b8">Chargement…</td></tr>';
    try {
      var { data, error } = await supabaseClient.from('profiles')
        .select('id, display_name, age, gender, city, country, host_country, subscription, last_seen, is_online, is_admin, role, staff_country, staff_city, staff_branch')
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
    var staffN = list.filter(function (u) { return isMemberStaffProfile(u); }).length;
    var majors = list.filter(function (u) { return u.role === 'major_staff' || u.role === 'major_moderateur'; }).length;
    box.innerHTML =
      card(list.length, 'Membres') +
      card(list.filter(isOn).length, 'En ligne') +
      card(staffN, 'Staff total') +
      card(majors, 'Majors');
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

    if (adminFilter === 'online') {
      list = list.filter(function (u) { return u.is_online || (u.last_seen && (now - new Date(u.last_seen).getTime()) < ONLINE); });
    } else if (adminFilter === 'staff') {
      list = list.filter(function (u) { return isMemberStaffProfile(u); });
    } else if (adminFilter !== 'all') {
      list = list.filter(function (u) {
        var r = u.role || '';
        if (adminFilter === 'amiral') return r === 'amiral' || r === 'admin_general' || u.is_admin;
        return r === adminFilter;
      });
    }

    if (adminSearch.trim()) {
      var q = adminSearch.trim().toLowerCase();
      list = list.filter(function (u) {
        return [u.display_name, u.city, u.country, u.staff_country, u.staff_city].filter(Boolean).join(' ').toLowerCase().indexOf(q) !== -1;
      });
    }

    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#94a3b8">Aucun résultat</td></tr>';
      return;
    }

    function esc(s) {
      return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    tbody.innerHTML = list.map(function (u) {
      var name = u.display_name || 'Sans nom';
      var rawRole = u.role || (u.is_admin ? 'amiral' : 'user');
      if (rawRole === 'admin_general') rawRole = 'amiral';
      if (rawRole === 'host') rawRole = 'sergent_staff';
      var label = roleLabel(rawRole);
      var cls = roleClass(rawRole);
      var plan = (u.subscription || 'FREE').toUpperCase();
      if (isMemberStaffProfile(u)) plan = 'STAFF';
      if (rawRole === 'amiral') plan = 'AMIRAL';

      var zone = '—';
      if (u.staff_city) zone = u.staff_city + (u.staff_country ? ' (' + u.staff_country + ')' : '');
      else if (u.staff_country) zone = u.staff_country;
      else zone = [u.city, u.country || u.host_country].filter(Boolean).join(', ') || '—';

      var online = u.is_online || (u.last_seen && (now - new Date(u.last_seen).getTime()) < ONLINE);
      var lastSeen = u.last_seen
        ? new Date(u.last_seen).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        : '—';

      // Pas d'actions sur les Users : ils restent Users. Actions uniquement sur le Staff.
      var isStaffRow = isMemberStaffProfile(u) || rawRole === 'amiral';
      var actions = '—';
      if (isStaffRow && rawRole !== 'amiral') {
        actions =
          '<div class="admin-actions">' +
          '<button type="button" class="admin-act-btn" onclick="window.adminSetRole(\'' + u.id + '\',\'user\')">→ User</button>' +
          '<button type="button" class="admin-act-btn" onclick="window.adminSetRole(\'' + u.id + '\',\'sergent_staff\')">→ Sergent Staff</button>' +
          '<button type="button" class="admin-act-btn" onclick="window.adminSetRole(\'' + u.id + '\',\'major_staff\')">→ Major Staff</button>' +
          '<button type="button" class="admin-act-btn" onclick="window.adminSetRole(\'' + u.id + '\',\'sergent_moderateur\')">→ Sergent Modo</button>' +
          '<button type="button" class="admin-act-btn" onclick="window.adminSetRole(\'' + u.id + '\',\'major_moderateur\')">→ Major Modo</button>' +
          '</div>';
      } else if (rawRole === 'amiral') {
        actions = '<span style="color:#94a3b8;font-size:12px">Amiral (toi)</span>';
      }

      return '<tr><td><strong>' + esc(name) + '</strong></td>' +
        '<td><span class="admin-badge ' + cls + '">' + esc(label) + '</span></td>' +
        '<td>' + esc(zone) + '</td><td>' + plan + '</td>' +
        '<td>' + (online ? '🟢' : '⚫') + ' ' + lastSeen + '</td><td>' + actions + '</td></tr>';
    }).join('');
  }

  window.adminOnSearch = function (v) { adminSearch = v || ''; renderAdminTable(); };
  window.adminOnFilter = function (v) { adminFilter = v || 'all'; renderAdminTable(); };
  window.adminRefresh = function () { loadAdminData(); if (typeof showToast === 'function') showToast('Actualisé', 'success'); };

  window.adminSetRole = async function (userId, newRole) {
    if (!isAmiral()) return;
    var label = roleLabel(newRole);
    if (!confirm('Changer le rôle en « ' + label + ' » ?')) return;

    try {
      var payload = {
        role: newRole,
        is_admin: newRole === 'amiral',
        subscription: (newRole === 'user') ? undefined : 'PREMIUM'
      };
      if (newRole === 'amiral' || newRole === 'major_staff' || newRole === 'sergent_staff') {
        payload.staff_branch = 'evenementiel';
      } else if (newRole === 'major_moderateur' || newRole === 'sergent_moderateur') {
        payload.staff_branch = 'moderation';
      } else {
        payload.staff_branch = null;
        payload.staff_country = null;
        payload.staff_city = null;
      }
      Object.keys(payload).forEach(function (k) { if (payload[k] === undefined) delete payload[k]; });

      var { error } = await supabaseClient.from('profiles').update(payload).eq('id', userId);
      if (error) throw error;

      var u = adminUsersCache.find(function (x) { return x.id === userId; });
      if (u) {
        u.role = newRole;
        u.is_admin = newRole === 'amiral';
        if (payload.subscription) u.subscription = payload.subscription;
        u.staff_branch = payload.staff_branch;
      }
      renderAdminStats();
      renderAdminTable();
      if (typeof showToast === 'function') showToast('Rôle mis à jour → ' + label, 'success');
    } catch (e) {
      if (typeof showToast === 'function') showToast('Erreur: ' + (e.message || e), 'error');
    }
  };

  function loadStaffScript(src) {
    var name = src.replace('js/', '');
    document.querySelectorAll('script[src*="' + name + '"]').forEach(function (el) {
      try { el.parentNode.removeChild(el); } catch (e) {}
    });
    var s = document.createElement('script');
    s.src = src + '?v=20260925i';
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
      loadStaffScript('js/staff-hierarchy.js');
      setTimeout(function () {
        loadStaffScript('js/staff-visibility.js');
        loadStaffScript('js/staff-messages.js');
        loadStaffScript('js/staff-events.js');
        loadStaffScript('js/staff-profile.js');
        loadStaffScript('js/staff-restrictions.js');
        loadStaffScript('js/staff-msg-unlock.js');
      }, 150);
    }, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  console.log('[AUPYGO] admin.js (charte) chargé');
})();
