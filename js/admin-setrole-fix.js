/* AUPYGO admin-setrole-fix.js
 * Changement de grade Staff via RPC admin_set_staff_role (fiable).
 * Fallback UPDATE classique si la RPC n'existe pas encore.
 */
(function () {
  'use strict';

  var STAFF_RANKS = ['major_staff', 'sergent_staff', 'major_moderateur', 'sergent_moderateur'];

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

  window.adminSetRole = async function (userId, newRole) {
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

    var target = null;
    try {
      if (typeof adminUsersCache !== 'undefined' && Array.isArray(adminUsersCache)) {
        target = adminUsersCache.find(function (x) { return x && x.id === userId; }) || null;
      }
    } catch (e0) {}

    if (!target) {
      var tr = await supabaseClient
        .from('profiles')
        .select('id, display_name, role, is_admin, staff_branch, subscription')
        .eq('id', userId)
        .maybeSingle();
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
      // 1) RPC dédiée (contourne RLS/trigger proprement)
      var rpc = await supabaseClient.rpc('admin_set_staff_role', {
        target_id: userId,
        new_role: newRole
      });

      if (!rpc.error && rpc.data) {
        var saved = typeof rpc.data === 'string' ? JSON.parse(rpc.data) : rpc.data;
        if (saved && saved.role) {
          syncCaches(userId, saved);
          if (typeof window.adminRefresh === 'function') window.adminRefresh();
          if (typeof showToast === 'function') {
            showToast('✓ Grade « ' + labelOf(saved.role) + ' » enregistré', 'success');
          }
          return;
        }
      }

      // RPC absente ou erreur → message clair
      if (rpc.error) {
        console.warn('[Admin setRole] RPC', rpc.error);
        var em = rpc.error.message || String(rpc.error);
        if (/function .* does not exist|PGRST202|42883/i.test(em)) {
          // Fallback UPDATE classique
        } else if (/FORBIDDEN|42501|NOT_AUTHENTICATED/i.test(em)) {
          if (typeof showToast === 'function') showToast('Refusé : ' + em, 'error');
          return;
        } else if (/22P02|invalid input value for enum/i.test(em)) {
          if (typeof showToast === 'function') showToast('Enum role incomplet — exécute SUPABASE_ADMIN_SET_ROLE.sql', 'error');
          return;
        } else {
          if (typeof showToast === 'function') showToast('Erreur RPC: ' + em, 'error');
          return;
        }
      }

      // 2) Fallback UPDATE direct
      var branch = (newRole === 'major_staff' || newRole === 'sergent_staff')
        ? 'evenementiel' : 'moderation';

      var upd = await supabaseClient
        .from('profiles')
        .update({
          role: newRole,
          is_admin: false,
          subscription: 'PREMIUM',
          staff_branch: branch
        })
        .eq('id', userId)
        .select('id, role, is_admin, staff_branch, subscription, display_name');

      if (upd.error) {
        console.error('[Admin setRole] update', upd.error);
        if (typeof showToast === 'function') showToast('Erreur: ' + (upd.error.message || upd.error), 'error');
        return;
      }

      var rows = upd.data || [];
      if (!rows.length) {
        if (typeof showToast === 'function') {
          showToast('Échec : exécute SUPABASE_ADMIN_SET_ROLE.sql dans Supabase, puis réessaie.', 'error');
        }
        return;
      }

      syncCaches(userId, rows[0]);
      if (typeof window.adminRefresh === 'function') window.adminRefresh();
      if (typeof showToast === 'function') {
        showToast('✓ Grade « ' + labelOf(rows[0].role) + ' » enregistré', 'success');
      }
    } catch (e) {
      console.error('[Admin setRole]', e);
      if (typeof showToast === 'function') showToast('Erreur: ' + (e.message || e), 'error');
    }
  };

  console.log('[AUPYGO] admin-setrole-fix.js v2 (RPC)');
})();
