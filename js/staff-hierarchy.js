/* AUPYGO — staff-hierarchy.js
 * Source unique de vérité pour les rôles Staff selon la charte organisationnelle.
 * Chargé AVANT les autres modules staff.
 */
(function () {
  'use strict';

  // ─── Rôles officiels ───────────────────────────────────────────────
  window.STAFF_ROLES = {
    amiral:            { level: 1, branch: 'evenementiel', label: 'Amiral' },
    major_staff:       { level: 2, branch: 'evenementiel', label: 'Major Staff' },
    sergent_staff:     { level: 3, branch: 'evenementiel', label: 'Sergent Staff' },
    major_moderateur:  { level: 2, branch: 'moderation',   label: 'Major Modérateur' },
    sergent_moderateur:{ level: 3, branch: 'moderation',   label: 'Sergent Modérateur' }
  };

  var STAFF_ROLE_LIST = Object.keys(window.STAFF_ROLES);

  // Rétrocompatibilité anciens noms
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

  // ─── Helpers de base ───────────────────────────────────────────────
  window.getNormalizedRole = function () {
    return normalizeRole(window.currentUserRole || 'user');
  };

  window.isStaff = function isStaff() {
    var r = window.getNormalizedRole();
    return STAFF_ROLE_LIST.indexOf(r) !== -1;
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

  // Anciens helpers (compatibilité)
  window.isAdmin = function isAdmin() {
    return window.isAmiral();
  };

  window.isHost = function isHost() {
    var r = window.getNormalizedRole();
    return r === 'sergent_staff' || r === 'major_staff';
  };

  // ─── Permissions métier ────────────────────────────────────────────

  /** Uniquement l'Amiral peut initier un DM privé vers un Staff */
  window.canStaffPrivateDm = function canStaffPrivateDm() {
    return window.isAmiral();
  };

  /** Amiral + Majors peuvent créer des groupes Staff */
  window.canCreateStaffGroup = function canCreateStaffGroup() {
    return window.isAmiral() || window.isMajor();
  };

  /** Qui peut approuver un événement payant à l'étape Major */
  window.canApproveAsMajor = function canApproveAsMajor(eventCountry) {
    if (window.isAmiral()) return true;
    if (!window.isMajor()) return false;
    // Le Major ne valide que son pays
    var myCountry = (window.currentUserProfile && (window.currentUserProfile.staff_country || window.currentUserProfile.country)) || null;
    if (!myCountry || !eventCountry) return false;
    return String(myCountry).toLowerCase() === String(eventCountry).toLowerCase();
  };

  /** Seul l'Amiral valide définitivement un événement payant */
  window.canApproveAsAmiral = function canApproveAsAmiral() {
    return window.isAmiral();
  };

  /** Label affiché (ex. "Major Staff · France") */
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

  /** True si le profil est un membre Staff (tous rôles) */
  window.isMemberStaffProfile = function isMemberStaffProfile(p) {
    if (!p) return false;
    if (p.is_admin === true) return true;
    var r = normalizeRole(p.role);
    return STAFF_ROLE_LIST.indexOf(r) !== -1;
  };

  /** Niveau numérique (1 = Amiral, 3 = Sergent) */
  window.getStaffLevel = function getStaffLevel(role) {
    var r = normalizeRole(role);
    return (window.STAFF_ROLES[r] && window.STAFF_ROLES[r].level) || 99;
  };

  console.log('[AUPYGO] staff-hierarchy.js chargé');
})();
