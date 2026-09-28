/* AUPYGO admin-setrole-fix.js
 * Corrige uniquement le changement de grade Staff (Amiral).
 * Ne modifie rien d'autre.
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

    // Cible depuis le cache admin si dispo, sinon lecture DB
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

    var branch = (newRole === 'major_staff' || newRole === 'sergent_staff')
      ? 'evenementiel' : 'moderation';

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
        .select('id, role, is_admin, staff_branch, subscription, display_name');

      if (upd.error) {
        console.error('[Admin setRole]', upd.error);
        var msg = upd.error.message || String(upd.error);
        if (/FORBIDDEN|42501|policy|permission|row-level/i.test(msg)) {
          msg = 'Refusé par RLS. En SQL : select public.is_amiral(); doit être true.';
        }
        if (/22P02|invalid input value for enum/i.test(msg)) {
          msg = 'Enum role incomplet — exécute SUPABASE_STAFF_RLS.sql';
        }
        if (typeof showToast === 'function') showToast('Erreur: ' + msg, 'error');
        return;
      }

      var rows = upd.data || [];
      // Cas fréquent : RLS bloque l'UPDATE sans renvoyer d'error → data vide
      if (!rows.length) {
        if (typeof showToast === 'function') {
          showToast('Échec : 0 ligne mise à jour (RLS). select public.is_amiral(); en SQL.', 'error');
        }
        return;
      }

      // Vérification indépendante en base
      var ver = await supabaseClient
        .from('profiles')
        .select('id, role, is_admin, staff_branch, subscription')
        .eq('id', userId)
        .maybeSingle();

      var finalRole = (ver.data && ver.data.role) || rows[0].role;
      var nFinal = norm(finalRole);

      if (nFinal !== newRole && String(finalRole).toLowerCase() !== newRole) {
        if (typeof showToast === 'function') {
          showToast('Non enregistré (DB: ' + (finalRole || '?') + '). Vérifie RLS/trigger.', 'error');
        }
        if (typeof window.adminRefresh === 'function') window.adminRefresh();
        return;
      }

      // Sync cache
      target.role = finalRole;
      target.is_admin = false;
      target.staff_branch = (ver.data && ver.data.staff_branch) || branch;
      target.subscription = (ver.data && ver.data.subscription) || 'PREMIUM';

      try {
        if (typeof adminUsersCache !== 'undefined' && Array.isArray(adminUsersCache)) {
          adminUsersCache.forEach(function (u) {
            if (u && u.id === userId) {
              u.role = target.role;
              u.is_admin = false;
              u.staff_branch = target.staff_branch;
              u.subscription = target.subscription;
            }
          });
        }
      } catch (e1) {}

      if (Array.isArray(window.profiles)) {
        window.profiles.forEach(function (p) {
          if (p && p.id === userId) {
            p.role = target.role;
            p.is_admin = false;
            p.staff_branch = target.staff_branch;
            p.subscription = target.subscription;
          }
        });
      }

      if (typeof window.adminRefresh === 'function') {
        window.adminRefresh();
      } else if (typeof window.adminOnFilter === 'function') {
        // force re-render via filtre courant
        try { window.adminOnFilter(document.getElementById('adminFilterSelect') && document.getElementById('adminFilterSelect').value || 'all'); } catch (e2) {}
      }

      if (typeof showToast === 'function') {
        showToast('✓ Grade « ' + labelOf(finalRole) + ' » enregistré', 'success');
      }
    } catch (e) {
      console.error('[Admin setRole]', e);
      if (typeof showToast === 'function') showToast('Erreur: ' + (e.message || e), 'error');
    }
  };

  console.log('[AUPYGO] admin-setrole-fix.js chargé');
})();
