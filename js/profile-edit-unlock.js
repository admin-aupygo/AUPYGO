/* AUPYGO profile-edit-unlock.js
 * - Profil incomplet : tous champs éditables + save complet
 * - Profil complet : bio/ville/langues/hobbies éditables
 * - Bouton Enregistrer re-bindé (ne dépend plus d'un onclick cassé)
 * - Ne touche JAMAIS à subscription / promo
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

  function client() {
    return window.supabaseClient || window.supabase || null;
  }

  function toast(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type || 'success');
    else console.log('[profile]', msg);
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

  function isProfileIncomplete() {
    var p = getMyProfile();
    if (!p) return true;
    if (p.identity_locked === false) return true;
    var name = String(p.display_name || '').trim();
    var age = Number(p.age);
    var gender = String(p.gender || '').trim();
    if (!name || name.length < 2) return true;
    if (!age || age < 18) return true;
    if (!gender) return true;
    if (/^user[_-]?\d+$/i.test(name) || name === 'Utilisateur') return true;
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

  function findSaveButtons() {
    var list = [];
    document.querySelectorAll('#profile button, #profile .btn, #profile input[type="submit"]').forEach(function (btn) {
      var t = (btn.textContent || btn.value || '').toLowerCase();
      var oc = btn.getAttribute('onclick') || '';
      var id = btn.id || '';
      if (
        /enregistrer|sauvegarder|save|enregistrer mon profil/i.test(t) ||
        oc.indexOf('saveProfile') !== -1 ||
        id === 'saveProfileBtn' ||
        id === 'btnSaveProfile'
      ) {
        list.push(btn);
      }
    });
    return list;
  }

  function unlockSaveButton() {
    findSaveButtons().forEach(function (btn) {
      btn.disabled = false;
      btn.style.display = '';
      btn.style.pointerEvents = 'auto';
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
      btn.removeAttribute('disabled');
      // Re-bind click (contourne onclick mort / preventDefault cassé)
      if (!btn._aupygoSaveBound) {
        btn._aupygoSaveBound = true;
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          window.saveProfileRobust();
        }, true);
      }
    });
    var formCard = document.querySelector('#profile .profile-form-card');
    if (formCard) {
      formCard.style.display = '';
      formCard.style.visibility = 'visible';
      formCard.removeAttribute('hidden');
    }
  }

  function readGender() {
    if (typeof selectedGender !== 'undefined' && selectedGender) return selectedGender;
    var active = document.querySelector(
      '#genderGroup button.active, .gender-option.active, .gender-btn.active, [data-gender].active'
    );
    if (active) {
      return active.getAttribute('data-gender') || (active.textContent || '').trim();
    }
    var p = getMyProfile();
    return (p && p.gender) || null;
  }

  /** Sauvegarde robuste : identité si incomplet, sinon champs libres. Jamais subscription. */
  window.saveProfileRobust = async function () {
    if (isStaffNow() && typeof window.saveProfile === 'function' && window.saveProfile !== window.saveProfileRobust) {
      // laisser staff-profile si staff
      try { return await window.__aupygoOrigSaveProfile.apply(this, arguments); } catch (e) {}
    }

    var sb = client();
    if (!sb) {
      toast('Connexion indisponible', 'error');
      return;
    }

    var auth = await sb.auth.getUser();
    var user = auth && auth.data && auth.data.user;
    if (!user) {
      toast('Connecte-toi', 'error');
      if (typeof go === 'function') go('plans');
      return;
    }

    var name = ((document.getElementById('firstName') || {}).value || '').trim();
    var ageValue = (document.getElementById('age') || {}).value || '';
    var country = (document.getElementById('country') || {}).value || '';
    var city = (document.getElementById('city') || {}).value || '';
    var bio = (document.getElementById('bio') || {}).value || '';
    var hostCountry = (document.getElementById('hostCountry') || {}).value || '';
    var stayEnd = (document.getElementById('stayEnd') || {}).value || '';
    var otherLang = (document.getElementById('otherLanguage') || {}).value || '';
    var gender = readGender();
    var hobbies = (typeof selectedHobbies !== 'undefined' && Array.isArray(selectedHobbies)) ? selectedHobbies : [];
    var langs = (typeof selectedLanguages !== 'undefined' && Array.isArray(selectedLanguages)) ? selectedLanguages : [];
    var loc = (typeof userLocation !== 'undefined') ? userLocation : { lat: null, lng: null, city: '' };
    var incomplete = isProfileIncomplete();

    if (incomplete) {
      if (!name || name.length < 2) {
        toast('Prénom requis', 'error');
        return;
      }
      if (!ageValue || Number(ageValue) < 18) {
        toast('Âge invalide (18+)', 'error');
        return;
      }
      if (!gender) {
        toast('Genre requis — clique sur Homme ou Femme', 'error');
        return;
      }
    }

    // Masque email/tel dans bio si dispo
    if (window.AupyModeration && typeof window.AupyModeration.maskSensitive === 'function') {
      try {
        var m = window.AupyModeration.maskSensitive(bio);
        if (m && m.text) bio = m.text;
        else if (typeof m === 'string') bio = m;
      } catch (e) {}
    }

    var payload = {
      bio: bio,
      interests: hobbies.join(','),
      languages: langs.join(','),
      other_language: otherLang,
      host_country: hostCountry || null,
      stay_end: stayEnd || null,
      city: city || loc.city || null,
      country: country || null
    };

    if (incomplete) {
      payload.display_name = name;
      payload.age = Number(ageValue);
      payload.gender = gender;
      payload.avatar = gender === 'Homme' ? '👨' : '👩';
      payload.identity_locked = true;
      if (loc.lat != null) payload.approx_lat = loc.lat;
      if (loc.lng != null) payload.approx_lng = loc.lng;
      // NE PAS toucher subscription / promo_*
    }

    try {
      var res = await sb.from('profiles').upsert(
        Object.assign({ id: user.id }, payload),
        { onConflict: 'id' }
      ).select('id, display_name, age, gender, identity_locked');

      if (res.error) {
        console.error('[saveProfileRobust]', res.error);
        toast(res.error.message || 'Erreur enregistrement', 'error');
        return;
      }
      if (!res.data || !res.data.length) {
        toast('Profil introuvable — réessaie', 'error');
        return;
      }

      // Mettre à jour le cache local
      var row = res.data[0];
      var p = getMyProfile();
      if (p) {
        Object.keys(payload).forEach(function (k) { p[k] = payload[k]; });
        p.identity_locked = true;
      }
      if (window.currentUserProfile) {
        Object.keys(payload).forEach(function (k) {
          window.currentUserProfile[k] = payload[k];
        });
        window.currentUserProfile.identity_locked = true;
      }

      try { profileSaved = true; } catch (e2) {}
      window.profileSaved = true;

      if (typeof updateProfileCard === 'function') {
        try {
          updateProfileCard({
            name: name || payload.display_name,
            age: ageValue || payload.age,
            hostCountry: hostCountry,
            stayEnd: stayEnd,
            languages: langs.slice(),
            otherLang: otherLang,
            hobbies: hobbies.slice()
          });
        } catch (e3) {}
      }

      toast(incomplete ? 'Profil enregistré !' : 'Profil mis à jour', 'success');

      if (incomplete && typeof go === 'function') {
        setTimeout(function () {
          if (typeof lockIdentityFields === 'function') lockIdentityFields();
          go('home');
          if (typeof updateHomeView === 'function') updateHomeView();
        }, 400);
      }
    } catch (err) {
      console.error('[saveProfileRobust]', err);
      toast(err.message || String(err), 'error');
    }
  };

  function installSaveAsDefault() {
    if (!window.__aupygoOrigSaveProfile && typeof window.saveProfile === 'function') {
      window.__aupygoOrigSaveProfile = window.saveProfile;
    }
    window.saveProfile = window.saveProfileRobust;
    try { if (typeof saveProfile !== 'undefined') saveProfile = window.saveProfileRobust; } catch (e) {}
  }

  function unlockAll() {
    if (isStaffNow()) return;
    unlockAlwaysEditable();
    unlockSaveButton();
    if (isProfileIncomplete()) {
      try { profileSaved = false; } catch (e) {}
      window.profileSaved = false;
      unlockIdentity();
    }
  }

  function patchLock() {
    if (typeof window.lockIdentityFields !== 'function') return;
    if (window._profileEditUnlockPatched) return;
    window._profileEditUnlockPatched = true;
    var orig = window.lockIdentityFields;
    window.lockIdentityFields = function () {
      if (isProfileIncomplete()) {
        setTimeout(unlockAll, 30);
        return;
      }
      var r = orig.apply(this, arguments);
      setTimeout(function () {
        unlockAlwaysEditable();
        unlockSaveButton();
      }, 30);
      return r;
    };
  }

  function boot() {
    installSaveAsDefault();
    patchLock();
    unlockAll();
  }

  setTimeout(boot, 300);
  setTimeout(boot, 1000);
  setTimeout(boot, 2500);
  setTimeout(boot, 5000);

  // Reprendre la main si un autre script réécrit saveProfile
  setInterval(function () {
    if (window.saveProfile !== window.saveProfileRobust) {
      installSaveAsDefault();
    }
    try {
      if (typeof getActivePage === 'function' && getActivePage() === 'profile') {
        unlockAll();
      }
    } catch (e) {}
  }, 2000);

  var origGo = window.go;
  if (typeof origGo === 'function' && !window._profileEditGoPatched) {
    window._profileEditGoPatched = true;
    window.go = function (page) {
      var r = origGo.apply(this, arguments);
      if (page === 'profile') {
        setTimeout(boot, 100);
        setTimeout(boot, 600);
      }
      return r;
    };
  }

  console.log('[AUPYGO] profile-edit-unlock.js — save robuste + bouton re-bindé');
})();
