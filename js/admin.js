/* =========================
   AUPYGO — Panneau Administration (Amiral)
   Chargé APRÈS app.js et staff-hierarchy.js

   Règles strictes des rôles :
   - Amiral unique (toi) : non transférable
   - Users restent users : pas de promotion Staff
   - Staff reste Staff : grades Major/Sergent uniquement (pas Amiral, pas User)
   - Aucune auto-promotion par email côté client
========================= */

(function () {
  'use strict';

  window.currentUserRole = window.currentUserRole || 'user';

  if (typeof window.isStaff !== 'function') {
    window.isStaff = function () {
      var r = (window.currentUserRole || '').toLowerCase();
      return ['amiral', 'major_staff', 'sergent_staff', 'major_moderateur', 'sergent_moderateur'].indexOf(r) !== -1
        || !!window.currentUserIsAdmin;
    };
  }
  if (typeof window.isAmiral !== 'function') {
    window.isAmiral = function () {
      return (window.currentUserRole || '').toLowerCase() === 'amiral' || !!window.currentUserIsAdmin;
    };
  }
  if (typeof window.isAdmin !== 'function') {
    window.isAdmin = function () { return window.isAmiral(); };
  }
  if (typeof window.isMemberStaffProfile !== 'function') {
    window.isMemberStaffProfile = function (p) {
      if (!p) return false;
      if (p.is_admin === true) return true;
      var r = (typeof window.normalizeStaffRole === 'function')
        ? window.normalizeStaffRole(p.role)
        : (p.role || '').toLowerCase();
      return ['amiral', 'major_staff', 'sergent_staff', 'major_moderateur', 'sergent_moderateur'].indexOf(r) !== -1;
    };
  }

  function normalizeFromDb(raw) {
    if (typeof window.normalizeStaffRole === 'function') return window.normalizeStaffRole(raw);
    var r = (raw || 'user').toLowerCase();
    if (r === 'admin_general' || r === 'admin') return 'amiral';
    if (r === 'host') return 'sergent_staff';
    if (r === 'moderator') return 'sergent_moderateur';
    return r;
  }

  var originalRefreshAuthUI = window.refreshAuthUI;
  if (typeof originalRefreshAuthUI === 'function') {
    window.refreshAuthUI = async function (redirectPage) {
      if (redirectPage === undefined) redirectPage = 'profile';
      await originalRefreshAuthUI(redirectPage);
      try {
        if (window.currentUser) {
          var pr = await supabaseClient.from('profiles')
            .select('role, is_admin, subscription, staff_country, staff_city, staff_branch')
            .eq('id', window.currentUser.id).maybeSingle();
          var profile = pr.data;
          if (profile) {
            var raw = normalizeFromDb(profile.role || 'user');
            window.currentUserRole = raw;
            window.currentUserIsAdmin = !!(profile.is_admin === true || raw === 'amiral');
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
      major_moderateur: 'Major Modérateur', sergent_moderateur: 'Sergent Modérateur', user: 'User'
    };
    return map[normalizeFromDb(role)] || role || 'User';
  }

  function roleClass(role) {
    var r = normalizeFromDb(role);
    if (r === 'amiral') return 'amiral';
    if (r === 'major_staff' || r === 'major_moderateur') return 'major';
    if (r === 'sergent_staff' || r === 'sergent_moderateur') return 'sergent';
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
        '<p style="margin:0;color:#64748b;font-size:14px">Consultation des membres · gestion des grades Staff uniquement (Amiral unique, users fixes)</p>' +
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
    var majors = list.filter(function (u) {
      var r = normalizeFromDb(u.role);
      return r === 'major_staff' || r === 'major_moderateur';
    }).length;
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
        var r = normalizeFromDb(u.role || '');
        if (adminFilter === 'amiral') return r === 'amiral' || u.is_admin;
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
      var rawRole = normalizeFromDb(u.role || (u.is_admin ? 'amiral' : 'user'));
      var label = roleLabel(rawRole);
      var cls = roleClass(rawRole);
      var zone = [u.staff_city, u.staff_country].filter(Boolean).join(', ') || [u.city, u.country].filter(Boolean).join(', ') || '—';
      var plan = (u.subscription || 'FREE').toUpperCase();
      var online = u.is_online === true || (u.last_seen && (now - new Date(u.last_seen).getTime()) < ONLINE);
      var status = online ? '<span style="color:#16a34a;font-weight:700">● En ligne</span>' : '<span style="color:#94a3b8">Hors ligne</span>';

      var actions = '';
      var meId = window.currentUser && window.currentUser.id;
      if (u.id === meId || rawRole === 'amiral') {
        actions = '<span style="font-size:11px;color:#94a3b8">Amiral unique</span>';
      } else if (rawRole === 'user' || !isMemberStaffProfile(u)) {
        actions = '<span style="font-size:11px;color:#94a3b8">User (fixe)</span>';
      } else {
        var ranks = [
          { role: 'major_staff', label: 'Major Staff' },
          { role: 'sergent_staff', label: 'Sergent Staff' },
          { role: 'major_moderateur', label: 'Major Mod.' },
          { role: 'sergent_moderateur', label: 'Sergent Mod.' }
        ];
        actions = '<div class="admin-actions">' + ranks.map(function (rk) {
          if (rk.role === rawRole) {
            return '<span class="admin-act-btn" style="opacity:.45;cursor:default">' + rk.label + ' ✓</span>';
          }
          return '<button type="button" class="admin-act-btn" onclick="window.adminSetRole(\'' + u.id + '\',\'' + rk.role + '\')">' + rk.label + '</button>';
        }).join('') + '</div>';
      }

      return '<tr>' +
        '<td><strong>' + esc(name) + '</strong></td>' +
        '<td><span class="admin-badge ' + cls + '">' + esc(label) + '</span></td>' +
        '<td>' + esc(zone) + '</td>' +
        '<td>' + esc(plan) + '</td>' +
        '<td>' + status + '</td>' +
        '<td>' + actions + '</td>' +
        '</tr>';
    }).join('');
  }

  window.adminOnSearch = function (v) { adminSearch = v || ''; renderAdminTable(); };
  window.adminOnFilter = function (v) { adminFilter = v || 'all'; renderAdminTable(); };
  window.adminRefresh = function () { loadAdminData(); };

  var STAFF_RANKS_ONLY = ['major_staff', 'sergent_staff', 'major_moderateur', 'sergent_moderateur'];

  window.adminSetRole = async function (userId, newRole) {
    if (!isAmiral()) {
      if (typeof showToast === 'function') showToast('Réservé à l\'Amiral', 'error');
      return;
    }
    if (STAFF_RANKS_ONLY.indexOf(newRole) === -1) {
      if (typeof showToast === 'function') showToast('Interdit : grades Staff uniquement', 'error');
      return;
    }
    if (userId === (window.currentUser && window.currentUser.id)) {
      if (typeof showToast === 'function') showToast('Tu ne peux pas modifier ton propre rôle Amiral', 'error');
      return;
    }
    var target = adminUsersCache.find(function (x) { return x.id === userId; });
    if (!target) {
      if (typeof showToast === 'function') showToast('Membre introuvable', 'error');
      return;
    }
    var current = normalizeFromDb(target.role || (target.is_admin ? 'amiral' : 'user'));
    if (current === 'amiral') {
      if (typeof showToast === 'function') showToast('Le rôle Amiral est unique et non modifiable', 'error');
      return;
    }
    if (current === 'user' || !isMemberStaffProfile(target)) {
      if (typeof showToast === 'function') showToast('Un user ne peut pas devenir Staff', 'error');
      return;
    }
    if (current === newRole) {
      if (typeof showToast === 'function') showToast('Déjà au grade « ' + roleLabel(newRole) + ' »', 'success');
      return;
    }
    var label = roleLabel(newRole);
    if (!confirm('Changer le grade Staff de « ' + (target.display_name || '') + ' » → « ' + label + ' » ?')) return;

    var branch = (newRole === 'major_staff' || newRole === 'sergent_staff') ? 'evenementiel' : 'moderation';

    try {
      var upd = await supabaseClient
        .from('profiles')
        .update({
          role: newRole,
          is_admin: false,
          subscription: 'PREMIUM',
          staff_branch: branch
        })
        .eq('id', userId)
        .select('id, role, is_admin, staff_branch, staff_country, staff_city, subscription, display_name')
        .maybeSingle();

      if (upd.error) {
        console.error('[Admin] setRole error', upd.error);
        var msg = upd.error.message || String(upd.error);
        if (/FORBIDDEN|42501|policy|permission/i.test(msg)) {
          msg = 'Refusé par la sécurité (RLS). Vérifie que ton compte est bien Amiral (role=amiral, is_admin=true).';
        }
        if (/22P02|invalid input value for enum/i.test(msg)) {
          msg = 'Valeur de rôle invalide pour l\'enum. Exécute SUPABASE_STAFF_RLS.sql pour ajouter les grades.';
        }
        if (typeof showToast === 'function') showToast('Erreur: ' + msg, 'error');
        return;
      }

      var saved = upd.data;
      if (!saved) {
        var check = await supabaseClient
          .from('profiles')
          .select('id, role, is_admin, staff_branch, staff_country, staff_city, subscription, display_name')
          .eq('id', userId)
          .maybeSingle();
        saved = check.data;
        if (check.error) {
          if (typeof showToast === 'function') showToast('Erreur relecture: ' + check.error.message, 'error');
          return;
        }
      }

      if (!saved) {
        if (typeof showToast === 'function') showToast('Mise à jour non confirmée. Vérifie RLS / trigger.', 'error');
        return;
      }

      target.role = saved.role || newRole;
      target.is_admin = saved.is_admin === true;
      target.subscription = saved.subscription || 'PREMIUM';
      target.staff_branch = saved.staff_branch || branch;

      if (Array.isArray(window.profiles)) {
        window.profiles.forEach(function (p) {
          if (p && p.id === userId) {
            p.role = target.role;
            p.is_admin = target.is_admin;
            p.staff_branch = target.staff_branch;
            p.subscription = target.subscription;
          }
        });
      }

      renderAdminStats();
      renderAdminTable();

      if (typeof showToast === 'function') {
        showToast('✓ Grade « ' + roleLabel(target.role) + ' » enregistré pour ' + (target.display_name || 'le membre'), 'success');
      }
    } catch (e) {
      console.error('[Admin] setRole exception', e);
      if (typeof showToast === 'function') showToast('Erreur: ' + (e.message || e), 'error');
    }
  };

  function loadStaffScript(src) {
    return;
  }

  function init() {
    injectAdminButton();
    injectAdminPage();
    setTimeout(function () {
      applyStaffRestrictions();
      updateAdminButtonVisibility();
      enrichProfilesWithRoles();
    }, 400);
    if (typeof window.go === 'function' && !window._adminGoLoad) {
      window._adminGoLoad = true;
      var _go = window.go;
      window.go = function (page) {
        _go(page);
        if (page === 'admin' && isAmiral()) {
          setTimeout(loadAdminData, 200);
          setTimeout(loadAdminData, 800);
        }
      };
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  console.log('[AUPYGO] admin.js v2 (setRole robuste + cache profiles)');
})();
