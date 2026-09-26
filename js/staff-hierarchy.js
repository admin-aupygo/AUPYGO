/* AUPYGO — staff-hierarchy.js
 * Source unique de vérité pour les rôles Staff.
 * Charge aussi profiles.role → window.currentUserRole (critique).
 */
(function () {
  'use strict';

  window.STAFF_ROLES = {
    amiral:             { level: 1, branch: 'evenementiel', label: 'Amiral' },
    major_staff:        { level: 2, branch: 'evenementiel', label: 'Major Staff' },
    sergent_staff:      { level: 3, branch: 'evenementiel', label: 'Sergent Staff' },
    major_moderateur:   { level: 2, branch: 'moderation',   label: 'Major Modérateur' },
    sergent_moderateur: { level: 3, branch: 'moderation',   label: 'Sergent Modérateur' }
  };

  var STAFF_ROLE_LIST = Object.keys(window.STAFF_ROLES);

  var LEGACY_MAP = {
    admin_general: 'amiral',
    host: 'sergent_staff',
    moderator: 'sergent_moderateur',
    admin: 'amiral'
  };

  function normalizeRole(role) {
    if (!role) return 'user';
    var r = String(role).toLowerCase().trim();
    if (LEGACY_MAP[r]) return LEGACY_MAP[r];
    if (STAFF_ROLE_LIST.indexOf(r) !== -1) return r;
    return 'user';
  }

  window.normalizeStaffRole = normalizeRole;

  window.getNormalizedRole = function () {
    // 1) rôle explicite
    var fromRole = normalizeRole(window.currentUserRole || 'user');
    if (fromRole !== 'user') return fromRole;
    // 2) fallback is_admin (Amiral bootstrap)
    try {
      if (window.currentUserIsAdmin === true) return 'amiral';
      if (window.currentUserProfile && window.currentUserProfile.is_admin === true) return 'amiral';
    } catch (e) {}
    return 'user';
  };

  window.isStaff = function isStaff() {
    return STAFF_ROLE_LIST.indexOf(window.getNormalizedRole()) !== -1;
  };

  window.isAmiral = function isAmiral() {
    return window.getNormalizedRole() === 'amiral';
  };

  window.isMajor = function isMajor() {
    var r = window.getNormalizedRole();
    return r === 'major_staff' || r === 'major_moderateur';
  };

  window.isSergent = function isSergent() {
    var r = window.getNormalizedRole();
    return r === 'sergent_staff' || r === 'sergent_moderateur';
  };

  window.isEvenementiel = function isEvenementiel() {
    var r = window.getNormalizedRole();
    return r === 'amiral' || r === 'major_staff' || r === 'sergent_staff';
  };

  window.isModeration = function isModeration() {
    var r = window.getNormalizedRole();
    return r === 'major_moderateur' || r === 'sergent_moderateur';
  };

  window.isAdmin = function isAdmin() {
    return window.isAmiral();
  };

  window.isHost = function isHost() {
    var r = window.getNormalizedRole();
    return r === 'sergent_staff' || r === 'major_staff';
  };

  window.canStaffPrivateDm = function canStaffPrivateDm() {
    return window.isAmiral();
  };

  window.canCreateStaffGroup = function canCreateStaffGroup() {
    return window.isAmiral() || window.isMajor();
  };

  window.canApproveAsMajor = function canApproveAsMajor(eventCountry) {
    if (window.isAmiral()) return true;
    if (!window.isMajor()) return false;
    var myCountry = (window.currentUserProfile &&
      (window.currentUserProfile.staff_country || window.currentUserProfile.country)) || null;
    if (!myCountry || !eventCountry) return false;
    return String(myCountry).toLowerCase() === String(eventCountry).toLowerCase();
  };

  window.canApproveAsAmiral = function canApproveAsAmiral() {
    return window.isAmiral();
  };

  window.getStaffRoleLabel = function getStaffRoleLabel(role, country, city) {
    var r = normalizeRole(role);
    var meta = window.STAFF_ROLES[r];
    if (!meta) return 'User';
    var label = meta.label;
    if (r === 'major_staff' || r === 'major_moderateur') {
      if (country) label += ' · ' + country;
    } else if (r === 'sergent_staff' || r === 'sergent_moderateur') {
      if (city) label += ' · ' + city;
      else if (country) label += ' · ' + country;
    }
    return label;
  };

  window.isMemberStaffProfile = function isMemberStaffProfile(p) {
    if (!p) return false;
    if (p.is_admin === true) return true;
    return STAFF_ROLE_LIST.indexOf(normalizeRole(p.role)) !== -1;
  };

  window.getStaffLevel = function getStaffLevel(role) {
    var r = normalizeRole(role);
    return (window.STAFF_ROLES[r] && window.STAFF_ROLES[r].level) || 99;
  };

  /** Charge role + profil staff depuis Supabase et met à jour les globals */
  window.syncStaffRoleFromProfile = async function syncStaffRoleFromProfile() {
    try {
      if (typeof supabaseClient === 'undefined' || !supabaseClient) return null;
      var userRes = await supabaseClient.auth.getUser();
      var user = userRes.data && userRes.data.user;
      if (!user) {
        window.currentUserRole = 'user';
        window.currentUserProfile = null;
        return null;
      }
      var res = await supabaseClient
        .from('profiles')
        .select('id, role, is_admin, staff_branch, staff_country, staff_city, subscription, display_name, age, gender, country, city, identity_locked')
        .eq('id', user.id)
        .maybeSingle();
      var p = res.data || null;
      window.currentUserProfile = p;
      if (p) {
        var role = normalizeRole(p.role);
        if (p.is_admin === true && role === 'user') role = 'amiral';
        window.currentUserRole = role;
        try {
          if (typeof currentUserIsAdmin !== 'undefined') {
            currentUserIsAdmin = (p.is_admin === true) || (role === 'amiral');
          }
          window.currentUserIsAdmin = (p.is_admin === true) || (role === 'amiral');
        } catch (e) {}
      } else {
        window.currentUserRole = 'user';
      }
      return p;
    } catch (e) {
      console.warn('[AUPYGO] syncStaffRoleFromProfile', e);
      return null;
    }
  };

  // Patch refreshAuthUI pour synchroniser le rôle après chaque auth
  function patchRefreshAuth() {
    if (typeof window.refreshAuthUI !== 'function' || window._staffRoleRefreshPatched) return;
    window._staffRoleRefreshPatched = true;
    var orig = window.refreshAuthUI;
    window.refreshAuthUI = async function () {
      var args = arguments;
      var result = await orig.apply(this, args);
      try {
        await window.syncStaffRoleFromProfile();
      } catch (e) {}
      return result;
    };
  }

  function boot() {
    patchRefreshAuth();
    if (typeof window.syncStaffRoleFromProfile === 'function') {
      window.syncStaffRoleFromProfile();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  setTimeout(boot, 500);
  setTimeout(boot, 1500);
  setTimeout(function () {
    if (typeof window.syncStaffRoleFromProfile === 'function') {
      window.syncStaffRoleFromProfile();
    }
  }, 3000);

  console.log('[AUPYGO] staff-hierarchy.js chargé (+ sync role)');
})();
