/* AUPYGO profile-edit-unlock.js
 * - Profil INCOMPLET (forcé / bug inscription) : TOUT éditable (prénom, âge, genre, bio…)
 * - Profil COMPLET : identité figée, bio/ville/langues/hobbies toujours éditables
 * - Critère incomplet : pas de display_name, ou âge < 18, ou pas de genre,
 *   ou identity_locked = false / null
 */
(function () {
  'use strict';

  var ALWAYS_EDITABLE = [
    'bio', 'city', 'country', 'hostCountry', 'stayEnd',
    'otherLanguage', 'otherHobby'
  ];
  var IDENTITY_IDS = ['firstName', 'age', 'country', 'city'];

  function isStaffNow() {
    try {
      if (typeof isStaff === 'function' && isStaff()) return true;
      if (typeof isAdmin === 'function' && isAdmin()) return true;
    } catch (e) {}
    return false;
  }

  function getMyProfile() {
    try {
      var uid = window.currentUser && window.currentUser.id;
      if (!uid) return null;
      if (window.currentUserProfile && window.currentUserProfile.id === uid) {
        return window.currentUserProfile;
      }
      var list = window.profiles || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].id === uid) return list[i];
      }
    } catch (e) {}
    return null;
  }

  /** Profil incomplet = n'a pas pu être rempli correctement */
  function isProfileIncomplete() {
    var p = getMyProfile();
    if (!p) {
      // Pas de ligne profil → forcément incomplet
      return true;
    }
    // Flag explicite côté BDD
    if (p.identity_locked === false || p.identity_locked === null || p.identity_locked === undefined) {
      // Si name/âge/genre manquent → incomplet
      var name = String(p.display_name || '').trim();
      var age = Number(p.age);
      var gender = String(p.gender || '').trim();
      if (!name || name.length < 2 || !age || age < 18 || !gender) return true;
      // identity_locked false mais données OK → on laisse éditer quand même si flag false
      if (p.identity_locked === false) return true;
    }
    var name2 = String(p.display_name || '').trim();
    var age2 = Number(p.age);
    var gender2 = String(p.gender || '').trim();
    if (!name2 || name2.length < 2) return true;
    if (!age2 || age2 < 18) return true;
    if (!gender2) return true;
    // Nom technique type email local-part forcé
    if (/^user[_-]?\d+$/i.test(name2) || name2 === 'Utilisateur') return true;
    return false;
  }

  function enableEl(el) {
    if (!el) return;
    el.disabled = false;
    el.readOnly = false;
    el.removeAttribute('disabled');
    el.removeAttribute('readonly');
    el.style.pointerEvents = 'auto';
    el.style.opacity = '1';
    el.style.cursor = '';
    el.title = '';
    var g = el.closest('.form-group');
    if (g) {
      g.style.display = '';
      g.style.visibility = 'visible';
      g.removeAttribute('hidden');
    }
  }

  function unlockAlwaysEditable() {
    ALWAYS_EDITABLE.forEach(function (id) {
      enableEl(document.getElementById(id));
    });
    document.querySelectorAll(
      '#profile .lang-chip, #profile .hobby-chip, #profile .hobby-grid button, #profile [data-lang], #profile [data-hobby], #profile .languages-box button'
    ).forEach(function (btn) {
      btn.disabled = false;
      btn.style.pointerEvents = 'auto';
      btn.style.opacity = '1';
    });
  }

  function unlockIdentity() {
    IDENTITY_IDS.forEach(function (id) {
      enableEl(document.getElementById(id));
    });
    var genderGroup = document.getElementById('genderGroup');
    if (genderGroup) {
      genderGroup.style.display = '';
      genderGroup.style.visibility = 'visible';
      var gg = genderGroup.closest('.form-group');
      if (gg) {
        gg.style.display = '';
        gg.style.visibility = 'visible';
      }
    }
    document.querySelectorAll('#genderGroup button, .gender-option, .gender-btn, [data-gender]').forEach(function (btn) {
      btn.disabled = false;
      btn.style.pointerEvents = 'auto';
      btn.style.opacity = '1';
      btn.style.display = '';
    });
  }

  function unlockSaveButton() {
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

  function unlockAll() {
    if (isStaffNow()) return; // staff-profile.js gère le staff

    unlockAlwaysEditable();
    unlockSaveButton();

    if (isProfileIncomplete()) {
      // Forcer mode "1ère sauvegarde" pour que saveProfile accepte identité
      try { profileSaved = false; } catch (e) {}
      window.profileSaved = false;
      unlockIdentity();
      console.log('[AUPYGO] profil incomplet → tous les champs éditables');
    }
  }

  // saveProfile : si incomplet, traiter comme 1ère sauvegarde (upsert identité)
  function patchSave() {
    if (typeof window.saveProfile !== 'function') return false;
    if (window._profileIncompleteSavePatched) return true;
    window._profileIncompleteSavePatched = true;
    var orig = window.saveProfile;
    window.saveProfile = async function () {
      if (!isStaffNow() && isProfileIncomplete()) {
        try { profileSaved = false; } catch (e) {}
        window.profileSaved = false;
      }
      return orig.apply(this, arguments);
    };
    return true;
  }

  function patchLock() {
    if (typeof window.lockIdentityFields !== 'function') return false;
    if (window._profileEditUnlockPatched) return true;
    window._profileEditUnlockPatched = true;
    var orig = window.lockIdentityFields;
    window.lockIdentityFields = function () {
      if (isProfileIncomplete()) {
        // Ne pas verrouiller un profil incomplet
        setTimeout(unlockAll, 30);
        return;
      }
      var r = orig.apply(this, arguments);
      setTimeout(function () {
        unlockAlwaysEditable();
        unlockSaveButton();
      }, 30);
      setTimeout(function () {
        unlockAlwaysEditable();
        unlockSaveButton();
      }, 200);
      return r;
    };
    return true;
  }

  function boot() {
    patchLock();
    patchSave();
    unlockAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(boot, 400);
      setTimeout(boot, 1500);
      setTimeout(boot, 3000);
    });
  } else {
    setTimeout(boot, 400);
    setTimeout(boot, 1500);
    setTimeout(boot, 3000);
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
        unlockAll();
      }
    } catch (e) {}
  }, 2500);

  console.log('[AUPYGO] profile-edit-unlock.js — incomplet = tout éditable');
})();
