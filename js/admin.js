/* =========================
   AUPYGO — Rôles & Panneau Staff (Admin + Hôte)
   Chargé APRÈS app.js
========================= */

(function () {
  'use strict';

  window.currentUserRole = window.currentUserRole || 'user';

  window.isAdmin = function isAdmin() {
    if (window.currentUserIsAdmin) return true;
    if (window.currentUserRole === 'admin_general') return true;
    return !!(window.currentUser && window.currentUser.email &&
      window.currentUser.email.toLowerCase() === 'aupygo@protonmail.com');
  };

  window.isHost = function isHost() {
    return window.currentUserRole === 'host';
  };

  window.isStaff = function isStaff() {
    return isAdmin() || isHost();
  };

  const originalRefreshAuthUI = window.refreshAuthUI;
  if (typeof originalRefreshAuthUI === 'function') {
    window.refreshAuthUI = async function (redirectPage = 'profile') {
      await originalRefreshAuthUI(redirectPage);
      try {
        if (window.currentUser) {
          const { data: profile } = await supabaseClient
            .from('profiles')
            .select('role, is_admin')
            .eq('id', window.currentUser.id)
            .maybeSingle();
          if (profile) {
            window.currentUserRole = profile.role || 'user';
            window.currentUserIsAdmin = !!(profile.is_admin === true || profile.role === 'admin_general');
          }
        } else {
          window.currentUserRole = 'user';
          window.currentUserIsAdmin = false;
        }
      } catch (e) {
        console.warn('[Staff] role fetch error', e);
      }
      applyStaffRestrictions();
      updateAdminButtonVisibility();
      if (typeof renderMarkers === 'function') renderMarkers();
    };
  }

  function applyStaffRestrictions() {
    const staff = isStaff();
    const friendsBtn = document.getElementById('navFriends');
    const homeFriendsBtn = document.getElementById('homeBtnFriends');
    const moreFriends = document.querySelector('.more-sheet-item[onclick*="reconnect"]');

    [friendsBtn, homeFriendsBtn].forEach(btn => {
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

    const originalGo = window.go;
    if (typeof originalGo === 'function' && !window._staffGoPatched) {
      window._staffGoPatched = true;
      window.go = function (page) {
        if (page === 'reconnect' && isStaff()) {
          if (typeof showToast === 'function') {
            showToast('La page Amis n\'est pas disponible pour les comptes Staff', 'error');
          }
          return;
        }
        if (page === 'admin' && !isAdmin()) {
          if (typeof showToast === 'function') showToast('Accès réservé à l\'administrateur', 'error');
          return;
        }
        originalGo(page);
        if (page === 'admin' && isAdmin()) loadAdminData();
        if (page === 'map' && typeof renderMarkers === 'function') {
          setTimeout(function () { renderMarkers(); }, 200);
        }
      };
    }
  }

  async function enrichProfilesWithRoles() {
    if (!Array.isArray(window.profiles) || !window.profiles.length) return;
    try {
      const ids = window.profiles.map(function (p) { return p && p.id; }).filter(Boolean);
      if (!ids.length) return;
      const { data } = await supabaseClient
        .from('profiles')
        .select('id, role, is_admin')
        .in('id', ids.slice(0, 300));
      if (!data) return;
      const map = {};
      data.forEach(function (r) { map[r.id] = r; });
      window.profiles.forEach(function (p) {
        if (map[p.id]) {
          p.role = map[p.id].role;
          p.is_admin = map[p.id].is_admin;
        }
      });
      if (typeof renderMarkers === 'function') renderMarkers();
    } catch (e) {
      console.warn('[Staff] enrich roles', e);
    }
  }

  const _origOpenMember = window.openMemberProfile;
  if (typeof _origOpenMember === 'function' && !window._staffOpenMemberPatched) {
    window._staffOpenMemberPatched = true;
    window.openMemberProfile = function (memberId, opts) {
      const readOnly = (opts && opts.readOnly) || isStaff();
      _origOpenMember(memberId);
      if (!readOnly) return;
      setTimeout(function () {
        const box = document.getElementById('memberModal');
        if (!box) return;
        box.querySelectorAll(
          '.member-msg-btn, .member-friend-btn, button[onclick*="Friend"], button[onclick*="friend"], button[onclick*="Message"], button[onclick*="message"], button[onclick*="sendFriend"], button[onclick*="acceptFriend"]'
        ).forEach(function (btn) {
          btn.style.display = 'none';
        });
        if (!box.querySelector('.staff-readonly-badge')) {
          const badge = document.createElement('div');
          badge.className = 'staff-readonly-badge';
          badge.style.cssText = 'margin-top:12px;font-size:12px;font-weight:700;color:#64748b;background:#f1f5f9;padding:8px 12px;border-radius:10px;';
          badge.textContent = '👁️ Vue lecture seule (staff) — aucune interaction possible';
          box.appendChild(badge);
        }
      }, 60);
    };
  }

  const _origLoadProfiles = window.loadProfiles;
  if (typeof _origLoadProfiles === 'function' && !window._staffLoadProfilesPatched) {
    window._staffLoadProfilesPatched = true;
    window.loadProfiles = async function () {
      await _origLoadProfiles.apply(this, arguments);
      await enrichProfilesWithRoles();
    };
  }

  function injectAdminButton() {
    const nav = document.querySelector('header nav');
    if (nav && !document.getElementById('navAdminBtn')) {
      const btn = document.createElement('button');
      btn.id = 'navAdminBtn';
      btn.style.display = 'none';
      btn.title = 'Administration';
      btn.innerHTML = '<span class="icon">🛡️</span>';
      btn.onclick = function () { go('admin'); };
      nav.appendChild(btn);
    }
    const moreList = document.querySelector('.more-sheet-list');
    if (moreList && !document.getElementById('moreAdminItem')) {
      const item = document.createElement('button');
      item.type = 'button';
      item.id = 'moreAdminItem';
      item.className = 'more-sheet-item';
      item.style.display = 'none';
      item.innerHTML = '<span class="msi-icon">🛡️</span><span>Administration</span>';
      item.onclick = function () {
        if (typeof closeMoreMenu === 'function') closeMoreMenu();
        go('admin');
      };
      moreList.appendChild(item);
    }
  }

  function updateAdminButtonVisibility() {
    const visible = isAdmin();
    const btn = document.getElementById('navAdminBtn');
    const more = document.getElementById('moreAdminItem');
    if (btn) btn.style.display = visible ? 'flex' : 'none';
    if (more) more.style.display = visible ? 'flex' : 'none';
  }

  function injectAdminPage() {
    if (document.getElementById('admin')) return;
    const main = document.querySelector('main');
    if (!main) return;
    const section = document.createElement('section');
    section.id = 'admin';
    section.className = 'page';
    section.innerHTML = '<div class="section-title"><h2>🛡️ Administration AUPYGO</h2><p>Panneau réservé à l\'administrateur</p></div><div class="admin-stats" id="adminStats"><div class="admin-stat-card"><div class="admin-stat-value" id="statTotal">—</div><div class="admin-stat-label">Membres</div></div><div class="admin-stat-card"><div class="admin-stat-value" id="statOnline">—</div><div class="admin-stat-label">En ligne</div></div><div class="admin-stat-card"><div class="admin-stat-value" id="statPremium">—</div><div class="admin-stat-label">Premium</div></div><div class="admin-stat-card"><div class="admin-stat-value" id="statStandard">—</div><div class="admin-stat-label">Standard</div></div><div class="admin-stat-card"><div class="admin-stat-value" id="statFree">—</div><div class="admin-stat-label">Free</div></div><div class="admin-stat-card"><div class="admin-stat-value" id="statAdmins">—</div><div class="admin-stat-label">Admins / Hôtes</div></div></div><div class="admin-toolbar"><input type="search" id="adminSearchInput" placeholder="🔍 Rechercher…" oninput="window.adminOnSearch(this.value)"><select id="adminFilterSelect" onchange="window.adminOnFilter(this.value)"><option value="all">Tous</option><option value="online">En ligne</option><option value="premium">Premium</option><option value="host">Hôtes</option><option value="admin">Admins</option></select><button class="btn btn-secondary" onclick="window.adminRefresh()">🔄 Actualiser</button></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Membre</th><th>Rôle</th><th>Plan</th><th>Localisation</th><th>Statut</th><th>Actions</th></tr></thead><tbody id="adminTableBody"><tr><td colspan="6" style="text-align:center;padding:30px;color:#888">Chargement…</td></tr></tbody></table></div>';
    main.appendChild(section);
    if (!document.getElementById('adminStyles')) {
      const style = document.createElement('style');
      style.id = 'adminStyles';
      style.textContent = '.admin-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:22px}.admin-stat-card{background:#fff;border:1px solid var(--border,#e8e4ef);border-radius:16px;padding:16px 12px;text-align:center;box-shadow:0 4px 14px rgba(42,24,70,.06)}.admin-stat-value{font-size:26px;font-weight:800;color:var(--primary,#7c3aed)}.admin-stat-label{font-size:12px;color:var(--muted,#777);margin-top:4px;font-weight:600}.admin-toolbar{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;align-items:center}.admin-toolbar input[type=search]{flex:1;min-width:200px;padding:11px 14px;border:1px solid var(--border,#e8e4ef);border-radius:12px;font-size:14px}.admin-toolbar select{padding:11px 12px;border:1px solid var(--border,#e8e4ef);border-radius:12px;font-size:14px;background:#fff}.admin-table-wrap{background:#fff;border:1px solid var(--border,#e8e4ef);border-radius:16px;overflow:auto;box-shadow:0 4px 14px rgba(42,24,70,.06)}.admin-table{width:100%;border-collapse:collapse;font-size:13px}.admin-table th{background:#f7f5fb;text-align:left;padding:12px 14px;font-weight:700}.admin-table td{padding:11px 14px;border-top:1px solid #f0ecf6;vertical-align:middle}.admin-table tr:hover td{background:#faf8ff}.admin-avatar{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#ffd54f,#fbbf24);display:inline-flex;align-items:center;justify-content:center;font-size:18px;margin-right:10px}.admin-badge{display:inline-block;padding:3px 8px;border-radius:20px;font-size:11px;font-weight:700}.admin-badge.FREE{background:#f3f4f6;color:#6b7280}.admin-badge.STANDARD{background:#f1eafd;color:#7c3aed}.admin-badge.PREMIUM{background:linear-gradient(135deg,#7c3aed,#ec4899);color:#fff}.admin-badge.admin_general{background:#111;color:#fff}.admin-badge.host{background:#334155;color:#fff}.admin-online{color:#16a34a;font-weight:700}.admin-offline{color:#9ca3af}';
      document.head.appendChild(style);
    }
  }

  let adminUsersCache = [];
  let adminFilter = 'all';
  let adminSearch = '';

  async function loadAdminData() {
    if (!isAdmin()) return;
    const tbody = document.getElementById('adminTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:#888">Chargement…</td></tr>';
    try {
      const { data, error } = await supabaseClient.from('profiles').select('id, display_name, age, gender, city, country, host_country, subscription, last_seen, is_online, is_admin, role, bio, interests').order('last_seen', { ascending: false });
      if (error) throw error;
      adminUsersCache = data || [];
      renderAdminStats();
      renderAdminTable();
    } catch (e) {
      console.error(e);
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#c00">Erreur</td></tr>';
    }
  }

  function renderAdminStats() {
    const list = adminUsersCache;
    const now = Date.now();
    const ONLINE = 15 * 60 * 1000;
    const isOn = function (u) { return u.is_online === true || (u.last_seen && (now - new Date(u.last_seen).getTime()) < ONLINE); };
    const set = function (id, v) { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('statTotal', list.length);
    set('statOnline', list.filter(isOn).length);
    set('statPremium', list.filter(function (u) { return (u.subscription || '').toUpperCase() === 'PREMIUM'; }).length);
    set('statStandard', list.filter(function (u) { return (u.subscription || '').toUpperCase() === 'STANDARD'; }).length);
    set('statFree', list.filter(function (u) { return !u.subscription || (u.subscription || '').toUpperCase() === 'FREE'; }).length);
    set('statAdmins', list.filter(function (u) { return u.role === 'admin_general' || u.role === 'host' || u.is_admin; }).length);
  }

  function renderAdminTable() {
    const tbody = document.getElementById('adminTableBody');
    if (!tbody) return;
    const now = Date.now();
    const ONLINE = 15 * 60 * 1000;
    let list = adminUsersCache.slice();
    if (adminFilter === 'online') list = list.filter(function (u) { return u.is_online || (u.last_seen && (now - new Date(u.last_seen).getTime()) < ONLINE); });
    else if (adminFilter === 'premium') list = list.filter(function (u) { return (u.subscription || '').toUpperCase() === 'PREMIUM'; });
    else if (adminFilter === 'host') list = list.filter(function (u) { return u.role === 'host'; });
    else if (adminFilter === 'admin') list = list.filter(function (u) { return u.role === 'admin_general' || u.is_admin; });
    if (adminSearch.trim()) {
      const q = adminSearch.trim().toLowerCase();
      list = list.filter(function (u) { return [u.display_name, u.city, u.country, u.host_country].filter(Boolean).join(' ').toLowerCase().indexOf(q) !== -1; });
    }
    if (!list.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:#888">Aucun résultat</td></tr>'; return; }
    function esc(s) { return String(s || '').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>'); }
    tbody.innerHTML = list.map(function (u) {
      const name = u.display_name || 'Sans nom';
      const plan = (u.subscription || 'FREE').toUpperCase();
      const role = u.role || (u.is_admin ? 'admin_general' : 'user');
      const loc = [u.city, u.country || u.host_country].filter(Boolean).join(', ') || '—';
      const online = u.is_online || (u.last_seen && (now - new Date(u.last_seen).getTime()) < ONLINE);
      const lastSeen = u.last_seen ? new Date(u.last_seen).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
      const icon = u.gender === 'female' || u.gender === 'Femme' ? '👩' : (u.gender === 'male' || u.gender === 'Homme' ? '👨' : '👤');
      const actions = isAdmin() ? '<button onclick="window.adminSetRole(\'' + u.id + '\',\'host\')" style="font-size:11px;margin:2px">→ Hôte</button><button onclick="window.adminSetRole(\'' + u.id + '\',\'user\')" style="font-size:11px;margin:2px">→ User</button><button onclick="window.adminSetRole(\'' + u.id + '\',\'admin_general\')" style="font-size:11px;margin:2px">→ Admin</button>' : '';
      return '<tr><td><span class="admin-avatar">' + icon + '</span><strong>' + esc(name) + '</strong></td><td><span class="admin-badge ' + role + '">' + role + '</span></td><td><span class="admin-badge ' + plan + '">' + plan + '</span></td><td>' + esc(loc) + '</td><td><span class="' + (online ? 'admin-online' : 'admin-offline') + '">' + (online ? '🟢 En ligne' : '⚫ Hors ligne') + '</span><div style="font-size:11px;color:#888">' + lastSeen + '</div></td><td>' + actions + '</td></tr>';
    }).join('');
  }

  window.adminOnSearch = function (v) { adminSearch = v || ''; renderAdminTable(); };
  window.adminOnFilter = function (v) { adminFilter = v || 'all'; renderAdminTable(); };
  window.adminRefresh = function () { loadAdminData(); if (typeof showToast === 'function') showToast('Actualisé', 'success'); };

  window.adminSetRole = async function (userId, newRole) {
    if (!isAdmin()) return;
    if (!confirm('Changer le rôle en « ' + newRole + ' » ?')) return;
    try {
      const payload = { role: newRole, is_admin: newRole === 'admin_general' };
      const { error } = await supabaseClient.from('profiles').update(payload).eq('id', userId);
      if (error) throw error;
      const u = adminUsersCache.find(function (x) { return x.id === userId; });
      if (u) { u.role = newRole; u.is_admin = newRole === 'admin_general'; }
      renderAdminStats();
      renderAdminTable();
      if (typeof showToast === 'function') showToast('Rôle mis à jour', 'success');
    } catch (e) {
      console.error(e);
      if (typeof showToast === 'function') showToast('Erreur: ' + e.message, 'error');
    }
  };

  function loadStaffScript(src) {
    if (document.querySelector('script[src*="' + src.replace('js/', '') + '"]')) return;
    var s = document.createElement('script');
    s.src = src + '?v=20260923d';
    document.body.appendChild(s);
  }

  function init() {
    injectAdminButton();
    injectAdminPage();
    setTimeout(function () {
      applyStaffRestrictions();
      updateAdminButtonVisibility();
      enrichProfilesWithRoles();
    }, 700);
    loadStaffScript('js/staff-messages.js');
    loadStaffScript('js/staff-events.js');
    loadStaffScript('js/staff-profile.js');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  setInterval(updateAdminButtonVisibility, 4000);
  setInterval(applyStaffRestrictions, 5000);
})();
