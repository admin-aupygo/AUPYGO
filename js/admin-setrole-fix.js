/* AUPYGO admin-setrole-fix.js v3
 * Verrouille adminSetRole (RPC) pour qu'il ne soit plus écrasé par l'ancien admin.js
 */
(function () {
  'use strict';

  var STAFF_RANKS = ['major_staff', 'sergent_staff', 'major_moderateur', 'sergent_moderateur'];
  var INSTALL_TAG = 'admin-setrole-v3';

  function norm(role) {
    if (typeof window.normalizeStaffRole === 'function') return window.normalizeStaffRole(role);
    var r = String(role || 'user').toLowerCase();
    if (r === 'admin_general' || r === 'admin') return 'amiral';
    if (r === 'host') return 'sergent_staff';
    if (r === 'moderator') return 'sergent_moderateur';
    return r;
  }

  function labelOf(role) {
    if (typeof window.getStaffRoleLabel === 'function') return window.getStaffRoleLabel(role);
    var map = {
      amiral: 'Amiral', major_staff: 'Major Staff', sergent_staff: 'Sergent Staff',
      major_moderateur: 'Major Modérateur', sergent_moderateur: 'Sergent Modérateur', user: 'User'
    };
    return map[norm(role)] || role || 'User';
  }

  function isStaffProfile(p) {
    if (!p) return false;
    if (p.is_admin === true) return true;
    var r = String(p.role || '').toLowerCase();
    if (['host', 'moderator', 'admin_general', 'admin'].indexOf(r) !== -1) return true;
    var n = norm(r);
    return STAFF_RANKS.indexOf(n) !== -1 || n === 'amiral';
  }

  function syncCaches(userId, saved) {
    try {
      if (typeof adminUsersCache !== 'undefined' && Array.isArray(adminUsersCache)) {
        adminUsersCache.forEach(function (u) {
          if (u && u.id === userId) {
            u.role = saved.role;
            u.is_admin = !!saved.is_admin;
            u.staff_branch = saved.staff_branch;
            u.subscription = saved.subscription || 'PREMIUM';
          }
        });
      }
    } catch (e1) {}
    if (Array.isArray(window.profiles)) {
      window.profiles.forEach(function (p) {
        if (p && p.id === userId) {
          p.role = saved.role;
          p.is_admin = !!saved.is_admin;
          p.staff_branch = saved.staff_branch;
          p.subscription = saved.subscription || 'PREMIUM';
        }
      });
    }
  }

  async function adminSetRoleLocked(userId, newRole) {
    if (typeof isAmiral === 'function' && !isAmiral()) {
      if (typeof showToast === 'function') showToast('Réservé à l\'Amiral', 'error');
      return;
    }
    if (STAFF_RANKS.indexOf(newRole) === -1) {
      if (typeof showToast === 'function') showToast('Grade Staff invalide', 'error');
      return;
    }
    if (!userId || userId === (window.currentUser && window.currentUser.id)) {
      if (typeof showToast === 'function') showToast('Action interdite sur ton compte Amiral', 'error');
      return;
    }

    var client = window.supabaseClient || window.supabase;
    if (!client) {
      if (typeof showToast === 'function') showToast('Supabase non initialisé', 'error');
      return;
    }

    var target = null;
    try {
      if (typeof adminUsersCache !== 'undefined' && Array.isArray(adminUsersCache)) {
        target = adminUsersCache.find(function (x) { return x && x.id === userId; }) || null;
      }
    } catch (e0) {}

    if (!target) {
      var tr = await client.from('profiles')
        .select('id, display_name, role, is_admin, staff_branch, subscription')
        .eq('id', userId).maybeSingle();
      if (tr.error || !tr.data) {
        if (typeof showToast === 'function') showToast('Membre introuvable', 'error');
        return;
      }
      target = tr.data;
    }

    var current = norm(target.role || (target.is_admin ? 'amiral' : 'user'));
    if (current === 'amiral') {
      if (typeof showToast === 'function') showToast('Amiral non modifiable', 'error');
      return;
    }
    if (!isStaffProfile(target)) {
      if (typeof showToast === 'function') showToast('Un user ne peut pas devenir Staff', 'error');
      return;
    }
    if (current === newRole) {
      if (typeof showToast === 'function') showToast('Déjà « ' + labelOf(newRole) + ' »', 'success');
      return;
    }

    var label = labelOf(newRole);
    if (!confirm('Changer le grade de « ' + (target.display_name || '') + ' » → « ' + label + ' » ?')) return;

    try {
      console.log('[Admin setRole] RPC', userId, newRole);

      var rpc = await client.rpc('admin_set_staff_role', {
        target_id: userId,
        new_role: newRole
      });

      if (rpc.error) {
        console.error('[Admin setRole] RPC error', rpc.error);
        if (typeof showToast === 'function') {
          showToast('Erreur: ' + (rpc.error.message || rpc.error), 'error');
        }
        return;
      }

      var saved = rpc.data;
      if (typeof saved === 'string') {
        try { saved = JSON.parse(saved); } catch (e) {}
      }

      if (!saved || !saved.role) {
        if (typeof showToast === 'function') showToast('Réponse RPC invalide', 'error');
        return;
      }

      // Vérification DB obligatoire avant toast succès
      var ver = await client.from('profiles')
        .select('id, role, is_admin, staff_branch, subscription, display_name')
        .eq('id', userId).maybeSingle();

      if (ver.error || !ver.data) {
        if (typeof showToast === 'function') showToast('Impossible de vérifier en base', 'error');
        return;
      }

      var dbRole = norm(ver.data.role);
      if (dbRole !== newRole && String(ver.data.role).toLowerCase() !== newRole) {
        console.warn('[Admin setRole] DB role mismatch', ver.data.role, newRole);
        if (typeof showToast === 'function') {
          showToast('Non enregistré en base (toujours « ' + labelOf(ver.data.role) + ' »). Vérifie la RPC SQL.', 'error');
        }
        if (typeof window.adminRefresh === 'function') window.adminRefresh();
        return;
      }

      syncCaches(userId, ver.data);
      if (typeof window.adminRefresh === 'function') window.adminRefresh();

      if (typeof showToast === 'function') {
        showToast('✓ Grade « ' + labelOf(ver.data.role) + ' » enregistré en base', 'success');
      }
      console.log('[Admin setRole] OK', ver.data);
    } catch (e) {
      console.error('[Admin setRole]', e);
      if (typeof showToast === 'function') showToast('Erreur: ' + (e.message || e), 'error');
    }
  }

  // Tag pour détecter si on a encore notre fonction
  adminSetRoleLocked._aupygo = INSTALL_TAG;

  function install() {
    window.adminSetRole = adminSetRoleLocked;
    // Empêche une réécriture simple sans tag
    try {
      Object.defineProperty(window, 'adminSetRole', {
        configurable: true,
        enumerable: true,
        get: function () { return adminSetRoleLocked; },
        set: function (fn) {
          // Autoriser uniquement si c'est encore notre fix (ou un plus récent)
          if (fn && fn._aupygo === INSTALL_TAG) {
            adminSetRoleLocked = fn;
          } else {
            console.warn('[AUPYGO] tentative d\'écrasement de adminSetRole ignorée');
          }
        }
      });
    } catch (e) {
      window.adminSetRole = adminSetRoleLocked;
    }
  }

  install();
  // Réinstalle après les chargements tardifs de admin.js (CDN)
  setTimeout(install, 300);
  setTimeout(install, 1000);
  setTimeout(install, 2500);
  setTimeout(install, 5000);

  console.log('[AUPYGO] admin-setrole-fix.js v3 verrouillé');
})();
