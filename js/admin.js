/* =========================
   AUPYGO — Rôles & Panneau Staff (Admin + Hôte)
   Chargé APRÈS app.js
========================= */

(function () {
  'use strict';

  /* E-mails Staff auto : pattern aupygo-staff-*@... ou whitelist */
  var STAFF_EMAIL_PATTERN = /^aupygo-staff[-.].+@.+$/i;
  var STAFF_EMAIL_WHITELIST = [];
  var ADMIN_EMAILS = ['aupygo@protonmail.com'];

  function emailLooksStaff(email) {
    if (!email) return null;
    var e = String(email).toLowerCase().trim();
    if (ADMIN_EMAILS.indexOf(e) !== -1) return 'admin_general';
    if (STAFF_EMAIL_WHITELIST.indexOf(e) !== -1) return 'host';
    if (STAFF_EMAIL_PATTERN.test(e)) return 'host';
    return null;
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
    try {
      var res = await supabaseClient.from('profiles').select('id, role, is_admin').eq('id', window.currentUser.id).maybeSingle();
      var profile = res.data;
      var needUpdate = false;
      if (!profile) needUpdate = true;
      else if (wanted === 'admin_general' && profile.role !== 'admin_general') needUpdate = true;
      else if (wanted === 'host' && profile.role !== 'host' && profile.role !== 'admin_general') needUpdate = true;
      if (needUpdate) {
        var payload = { id: window.currentUser.id, role: wanted, is_admin: wanted === 'admin_general', subscription: 'PREMIUM' };
        var up = await supabaseClient.from('profiles').upsert(payload, { onConflict: 'id' });
        if (up.error) console.warn('[Staff] auto-role', up.error);
        else console.log('[Staff] rôle auto:', wanted, window.currentUser.email);
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
            window.currentUserRole = profile.role || 'user';
            window.currentUserIsAdmin = !!(profile.is_admin === true || profile.role === 'admin_general');
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
      applyStaffRestrictions();
      updateAdminButtonVisibility();
      if (typeof renderMarkers === 'function') renderMarkers();
    };
  }

  function applyStaffRestrictions() {
    var staff = isStaff();
    var friendsBtn = document.getElementById('navFriends');
    var homeFriendsBtn = document.getElementById('homeBtnFriends');
    var moreFriends = document.querySelector('.more-sheet-item[onclick*="reconnect"]');
    [friendsBtn, homeFriendsBtn].forEach(function (btn) {
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
    if (moreFriends) moreFriends.style.display = staff ? 'none' : '';
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
    } catch (e) { console.warn('[Staff] enrich', e); }
  }

  if (typeof window.openMemberProfile === 'function' && !window._staffOpenMemberPatched) {
    window._staffOpenMemberPatched = true;
    var _origOpenMember = window.openMemberProfile;
    window.openMemberProfile = function (memberId, opts) {
      var readOnly = (opts && opts.readOnly) || isStaff();
      _origOpenMember(memberId);
      if (!readOnly) return;
      setTimeout(function () {
        var box = document.getElementById('memberModal');
        if (!box) return;
        box.querySelectorAll('.member-msg-btn, .member-friend-btn, button[onclick*="Friend"], button[onclick*="friend"], button[onclick*="Message"], button[onclick*="message"]').forEach(function (btn) { btn.style.display = 'none'; });
        if (!box.querySelector('.staff-readonly-badge')) {
          var badge = document.createElement('div');
          badge.className = 'staff-readonly-badge';
          badge.style.cssText = 'margin-top:12px;font-size:12px;font-weight:700;color:#64748b;background:#f1f5f9;padding:8px 12px;border-radius:10px;';
          badge.textContent = '👁️ Vue lecture seule (staff)';
          box.appendChild(badge);
        }
      }, 60);
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
    var moreList = document.querySelector('.more-sheet-list');
    if (moreList && !document.getElementById('moreAdminItem')) {
      var item = document.createElement('button');
      item.type = 'button';
      item.id = 'moreAdminItem';
      item.className = 'more-sheet-item';
      item.style.display = 'none';
      item.innerHTML = '<span class="msi-icon">🛡️</span><span>Administration</span>';
      item.onclick = function () { if (typeof closeMoreMenu === 'function') closeMoreMenu(); go('admin'); };
      moreList.appendChild(item);
    }
  }

  function updateAdminButtonVisibility() {
    var visible = isAdmin();
    var btn = document.getElementById('navAdminBtn');
    var more = document.getElementById('moreAdminItem');
    if (btn) btn.style.display = visible ? 'flex' : 'none';
    if (more) more.style.display = visible ? 'flex' : 'none';
  }

  function injectAdminPage() {
    if (document.getElementById('admin')) return;
    var main = document.querySelector('main');
    if (!main) return;
    var section = document.createElement('section');
    section.id = 'admin';
    section.className = 'page';
    section.innerHTML = '<div class="section-title"><h2>🛡️ Administration AUPYGO</h2><p>Panneau réservé à l\'administrateur</p></div><div class="admin-stats" id="adminStats"><div class="admin-stat-card"><div class="admin-stat-value" id="statTotal">—</div><div class="admin-stat-label">Membres</div></div><div class="admin-stat-card"><div class="admin-stat-value" id="statOnline">—</div><div class="admin-stat-label">En ligne</div></div><div class="admin-stat-card"><div class="admin-stat-value" id="statPremium">—</div><div class="admin-stat-label">Premium</div></div><div class="admin-stat-card"><div class="admin-stat-value" id="statStandard">—</div><div class="admin-stat-label">Standard</div></div><div class="admin-stat-card"><div class="admin-stat-value" id="statFree">—</div><div class="admin-stat-label">Free</div></div><div class="admin-stat-card"><div class="admin-stat-value" id="statAdmins">—</div><div class="admin-stat-label">Admins / Hôtes</div></div></div><div class="admin-toolbar"><input type="search" id="adminSearchInput" placeholder="🔍 Rechercher…" oninput="window.adminOnSearch(this.value)"><select id="adminFilterSelect" onchange="window.adminOnFilter(this.value)"><option value="all">Tous</option><option value="online">En ligne</option><option value="premium">Premium</option><option value="host">Hôtes</option><option value="admin">Admins</option></select><button class="btn btn-secondary" onclick="window.adminRefresh()">🔄 Actualiser</button></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Membre</th><th>Rôle</th><th>Plan</th><th>Localisation</th><th>Statut</th><th>Actions</th></tr></thead><tbody id="adminTableBody"><tr><td colspan="6" style="text-align:center;padding:30px;color:#888">Chargement…</td></tr></tbody></table></div>';
    main.appendChild(section);
    if (!document.getElementById('adminStyles')) {
      var style = document.createElement('style');
      style.id = 'adminStyles';
      style.textContent = '.admin-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:22px}.admin-stat-card{background:#fff;border:1px solid var(--border,#e8e4ef);border-radius:16px;padding:16px 12px;text-align:center}.admin-stat-value{font-size:26px;font-weight:800;color:var(--primary,#7c3aed)}.admin-stat-label{font-size:12px;color:#777;margin-top:4px;font-weight:600}.admin-toolbar{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px}.admin-table-wrap{background:#fff;border:1px solid #e8e4ef;border-radius:16px;overflow:auto}.admin-table{width:100%;border-collapse:collapse;font-size:13px}.admin-table th{background:#f7f5fb;text-align:left;padding:12px 14px}.admin-table td{padding:11px 14px;border-top:1px solid #f0ecf6}.admin-badge{display:inline-block;padding:3px 8px;border-radius:20px;font-size:11px;font-weight:700}.admin-badge.admin_general{background:#111;color:#fff}.admin-badge.host{background:#334155;color:#fff}.admin-online{color:#16a34a;font-weight:700}.admin-offline{color:#9ca3af}';
      document.head.appendChild(style);
    }
  }

  var adminUsersCache = [];
  var adminFilter = 'all';
  var adminSearch = '';

  async function loadAdminData() {
    if (!isAdmin()) return;
    var tbody = document.getElementById('adminTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:#888">Chargement…</td></tr>';
    try {
      var { data, error } = await supabaseClient.from('profiles').select('id, display_name, age, gender, city, country, host_country, subscription, last_seen, is_online, is_admin, role').order('last_seen', { ascending: false });
      if (error) throw error;
      adminUsersCache = data || [];
      renderAdminStats();
      renderAdminTable();
    } catch (e) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#c00">Erreur</td></tr>';
    }
  }

  function renderAdminStats() {
    var list = adminUsersCache;
    var now = Date.now();
    var ONLINE = 15 * 60 * 1000;
    var isOn = function (u) { return u.is_online === true || (u.last_seen && (now - new Date(u.last_seen).getTime()) < ONLINE); };
    var set = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    set('statTotal', list.length);
    set('statOnline', list.filter(isOn).length);
    set('statPremium', list.filter(function (u) { return (u.subscription || '').toUpperCase() === 'PREMIUM'; }).length);
    set('statStandard', list.filter(function (u) { return (u.subscription || '').toUpperCase() === 'STANDARD'; }).length);
    set('statFree', list.filter(function (u) { return !u.subscription || (u.subscription || '').toUpperCase() === 'FREE'; }).length);
    set('statAdmins', list.filter(function (u) { return u.role === 'admin_general' || u.role === 'host' || u.is_admin; }).length);
  }

  function renderAdminTable() {
    var tbody = document.getElementById('adminTableBody');
    if (!tbody) return;
    var now = Date.now();
    var ONLINE = 15 * 60 * 1000;
    var list = adminUsersCache.slice();
    if (adminFilter === 'online') list = list.filter(function (u) { return u.is_online || (u.last_seen && (now - new Date(u.last_seen).getTime()) < ONLINE); });
    else if (adminFilter === 'premium') list = list.filter(function (u) { return (u.subscription || '').toUpperCase() === 'PREMIUM'; });
    else if (adminFilter === 'host') list = list.filter(function (u) { return u.role === 'host'; });
    else if (adminFilter === 'admin') list = list.filter(function (u) { return u.role === 'admin_general' || u.is_admin; });
    if (adminSearch.trim()) {
      var q = adminSearch.trim().toLowerCase();
      list = list.filter(function (u) { return [u.display_name, u.city, u.country, u.host_country].filter(Boolean).join(' ').toLowerCase().indexOf(q) !== -1; });
    }
    if (!list.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:#888">Aucun résultat</td></tr>'; return; }
    function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    tbody.innerHTML = list.map(function (u) {
      var name = u.display_name || 'Sans nom';
      var plan = (u.subscription || 'FREE').toUpperCase();
      var role = u.role || (u.is_admin ? 'admin_general' : 'user');
      var loc = [u.city, u.country || u.host_country].filter(Boolean).join(', ') || '—';
      var online = u.is_online || (u.last_seen && (now - new Date(u.last_seen).getTime()) < ONLINE);
      var lastSeen = u.last_seen ? new Date(u.last_seen).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
      var icon = u.gender === 'Femme' || u.gender === 'female' ? '👩' : (u.gender === 'Homme' || u.gender === 'male' ? '👨' : '👤');
      var actions = isAdmin() ? '<button onclick="window.adminSetRole(\'' + u.id + '\',\'host\')" style="font-size:11px;margin:2px">→ Hôte</button><button onclick="window.adminSetRole(\'' + u.id + '\',\'user\')" style="font-size:11px;margin:2px">→ User</button><button onclick="window.adminSetRole(\'' + u.id + '\',\'admin_general\')" style="font-size:11px;margin:2px">→ Admin</button>' : '';
      return '<tr><td><strong>' + esc(name) + '</strong></td><td><span class="admin-badge ' + role + '">' + role + '</span></td><td>' + plan + '</td><td>' + esc(loc) + '</td><td>' + (online ? '🟢' : '⚫') + ' ' + lastSeen + '</td><td>' + actions + '</td></tr>';
    }).join('');
  }

  window.adminOnSearch = function (v) { adminSearch = v || ''; renderAdminTable(); };
  window.adminOnFilter = function (v) { adminFilter = v || 'all'; renderAdminTable(); };
  window.adminRefresh = function () { loadAdminData(); if (typeof showToast === 'function') showToast('Actualisé', 'success'); };

  window.adminSetRole = async function (userId, newRole) {
    if (!isAdmin()) return;
    if (!confirm('Changer le rôle en « ' + newRole + ' » ?')) return;
    try {
      var payload = { role: newRole, is_admin: newRole === 'admin_general' };
      if (newRole === 'host' || newRole === 'admin_general') payload.subscription = 'PREMIUM';
      var { error } = await supabaseClient.from('profiles').update(payload).eq('id', userId);
      if (error) throw error;
      var u = adminUsersCache.find(function (x) { return x.id === userId; });
      if (u) { u.role = newRole; u.is_admin = newRole === 'admin_general'; if (payload.subscription) u.subscription = payload.subscription; }
      renderAdminStats();
      renderAdminTable();
      if (typeof showToast === 'function') showToast('Rôle mis à jour', 'success');
    } catch (e) {
      if (typeof showToast === 'function') showToast('Erreur: ' + e.message, 'error');
    }
  };

  function loadStaffScript(src) {
    if (document.querySelector('script[src*="' + src.replace('js/', '') + '"]')) return;
    var s = document.createElement('script');
    s.src = src + '?v=20260924a';
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
    }, 700);
    loadStaffScript('js/staff-messages.js');
    loadStaffScript('js/staff-events.js');
    loadStaffScript('js/staff-profile.js');
    loadStaffScript('js/staff-ui.js');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  setInterval(updateAdminButtonVisibility, 4000);
  setInterval(applyStaffRestrictions, 5000);
})();
