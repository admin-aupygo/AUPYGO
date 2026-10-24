/* AUPYGO profile-edit-unlock.js
 * Après forçage d'accès / comptes créés à la main :
 * - les champs identité (prénom, âge, genre) restent verrouillés si identity_locked
 * - bio, ville, pays d'accueil, langues, hobbies, fin de séjour restent TOUJOURS éditables
 * - le bouton Enregistrer est toujours accessible
 */
(function () {
  'use strict';

  var EDITABLE_IDS = [
    'bio', 'city', 'country', 'hostCountry', 'stayEnd',
    'otherLanguage', 'otherHobby'
  ];

  function isStaffNow() {
    try {
      if (typeof isStaff === 'function' && isStaff()) return true;
      if (typeof isAdmin === 'function' && isAdmin()) return true;
    } catch (e) {}
    return false;
  }

  function unlockEditableFields() {
    if (isStaffNow()) return;

    EDITABLE_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.disabled = false;
      el.readOnly = false;
      el.removeAttribute('disabled');
      el.removeAttribute('readonly');
      el.style.pointerEvents = 'auto';
      el.style.opacity = '1';
      el.style.cursor = '';
      var g = el.closest('.form-group');
      if (g) {
        g.style.display = '';
        g.style.visibility = 'visible';
        g.removeAttribute('hidden');
      }
    });

    // Langues / hobbies chips (une seule ligne pour éviter SyntaxError)
    document.querySelectorAll(
      '#profile .lang-chip, #profile .hobby-chip, #profile .hobby-grid button, #profile [data-lang], #profile [data-hobby], #profile .languages-box button'
    ).forEach(function (btn) {
      btn.disabled = false;
      btn.style.pointerEvents = 'auto';
      btn.style.opacity = '1';
    });

    document.querySelectorAll('#profile button, #profile .btn').forEach(function (btn) {
      var t = (btn.textContent || '').toLowerCase();
      var oc = btn.getAttribute('onclick') || '';
      if (/enregistrer|sauvegarder|save/i.test(t) || oc.indexOf('saveProfile') !== -1) {
        btn.disabled = false;
        btn.style.display = '';
        btn.style.pointerEvents = 'auto';
        btn.style.opacity = '1';
        btn.removeAttribute('disabled');
      }
    });

    var formCard = document.querySelector('#profile .profile-form-card');
    if (formCard) {
      formCard.style.display = '';
      formCard.style.visibility = 'visible';
      formCard.removeAttribute('hidden');
    }
  }

  function patchLock() {
    if (typeof window.lockIdentityFields !== 'function') return false;
    if (window._profileEditUnlockPatched) return true;
    window._profileEditUnlockPatched = true;
    var orig = window.lockIdentityFields;
    window.lockIdentityFields = function () {
      var r = orig.apply(this, arguments);
      setTimeout(unlockEditableFields, 30);
      setTimeout(unlockEditableFields, 200);
      return r;
    };
    return true;
  }

  function boot() {
    patchLock();
    unlockEditableFields();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(boot, 400);
      setTimeout(boot, 1500);
    });
  } else {
    setTimeout(boot, 400);
    setTimeout(boot, 1500);
  }

  var origGo = window.go;
  if (typeof origGo === 'function' && !window._profileEditGoPatched) {
    window._profileEditGoPatched = true;
    window.go = function (page) {
      var r = origGo.apply(this, arguments);
      if (page === 'profile') {
        setTimeout(boot, 100);
        setTimeout(boot, 500);
        setTimeout(boot, 1200);
      }
      return r;
    };
  }

  setInterval(function () {
    try {
      if (typeof getActivePage === 'function' && getActivePage() === 'profile') {
        unlockEditableFields();
      }
    } catch (e) {}
  }, 2500);

  console.log('[AUPYGO] profile-edit-unlock.js — bio/ville/langues/hobbies toujours éditables');
})();
