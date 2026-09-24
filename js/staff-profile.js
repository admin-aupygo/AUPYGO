/* AUPYGO staff-profile.js
 * Profil staff : Prénom, Âge (20-80), Genre, Pays, Ville, Langues
 * Identité TOUJOURS éditable (pas de lock)
 * Pas de bouton supprimer compte (réservé Admin)
 */
(function () {
  'use strict';
  if (typeof isStaff !== 'function') return;

  var STAFF_AGE_MIN = 20;
  var STAFF_AGE_MAX = 80;

  function closestFormGroup(el) {
    if (!el) return null;
    var g = el.closest('.form-group');
    if (g) return g;
    return el.parentElement;
  }

  function restrictAgeOptions() {
    var ageEl = document.getElementById('age');
    if (!ageEl || ageEl.tagName !== 'SELECT') return;
    ageEl.querySelectorAll('option').forEach(function (opt) {
      var v = parseInt(opt.value, 10);
      if (!opt.value || isNaN(v)) return;
      if (v < STAFF_AGE_MIN || v > STAFF_AGE_MAX) {
        opt.disabled = true;
        opt.hidden = true;
      } else {
        opt.disabled = false;
        opt.hidden = false;
      }
    });
  }

  /** Débloque les champs d'identité pour le staff */
  function unlockIdentityFields() {
    if (!isStaff()) return;
    ['firstName', 'age', 'country', 'city'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.disabled = false;
        el.readOnly = false;
        el.removeAttribute('readonly');
        el.removeAttribute('disabled');
      }
    });
    // Boutons genre
    document.querySelectorAll('[data-gender], .gender-btn, #genderGroup button').forEach(function (btn) {
      btn.disabled = false;
      btn.style.pointerEvents = '';
      btn.style.opacity = '';
    });
    // Langues
    document.querySelectorAll('.lang-chip, .language-btn, #languageGrid button').forEach(function (btn) {
      btn.disabled = false;
      btn.style.pointerEvents = '';
    });
  }

  function applyStaffProfileUI() {
    if (!isStaff()) return;

    restrictAgeOptions();
    unlockIdentityFields();

    var bio = document.getElementById('bio');
    if (bio) {
      var g = closestFormGroup(bio);
      if (g) g.style.display = 'none';
      else bio.style.display = 'none';
    }
    document.querySelectorAll('.bio-counter').forEach(function (el) { el.style.display = 'none'; });

    ['hostCountry', 'stayEnd', 'otherLanguage'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var g = closestFormGroup(el);
      if (g) g.style.display = 'none';
      else el.style.display = 'none';
    });

    var hobbyGrid = document.querySelector('.hobby-grid');
    if (hobbyGrid) {
      var section = hobbyGrid.closest('.form-group') || hobbyGrid.parentElement;
      if (section) section.style.display = 'none';
      else hobbyGrid.style.display = 'none';
    }
    document.querySelectorAll('#profileCardHobbies, .profile-card-hobbies').forEach(function (el) {
      el.style.display = 'none';
    });

    // Supprimer mon profil / Mon agenda
    document.querySelectorAll('button, a, .btn').forEach(function (btn) {
      var t = (btn.textContent || '').toLowerCase();
      if (/supprimer mon profil|supprimer.*compte|delete.*account/i.test(t)) {
        btn.style.display = 'none';
      }
      if (/mon agenda/i.test(t)) btn.style.display = 'none';
    });
    document.querySelectorAll('#profile .agenda-block, .profile-agenda, #myAgendaBlock').forEach(function (el) {
      el.style.display = 'none';
    });

    if (!document.getElementById('staffProfileBanner')) {
      var form = document.querySelector('.profile-form-card') || document.getElementById('profile');
      if (form) {
        var banner = document.createElement('div');
        banner.id = 'staffProfileBanner';
        banner.style.cssText = 'background:#f1f5f9;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;margin-bottom:16px;font-size:13px;color:#475569;font-weight:600;';
        banner.textContent = '🛡️ Profil Staff — modifiable à tout moment · Prénom, Âge (20–80), Genre, Pays, Ville, Langues';
        form.insertBefore(banner, form.firstChild);
      }
    }
  }

  var _origSave = window.saveProfile;
  if (typeof _origSave === 'function') {
    window.saveProfile = async function () {
      if (!isStaff()) {
        return _origSave.apply(this, arguments);
      }

      var userRes = await supabaseClient.auth.getUser();
      var user = userRes.data && userRes.data.user;
      if (!user) {
        showToast('Connecte-toi', 'error');
        return;
      }

      var name = ((document.getElementById('firstName') || {}).value || '').trim();
      var ageValue = (document.getElementById('age') || {}).value;
      var ageNum = Number(ageValue);
      var country = (document.getElementById('country') || {}).value || '';
      var city = (document.getElementById('city') || {}).value || '';
      var langs = (typeof selectedLanguages !== 'undefined' && selectedLanguages.length)
        ? selectedLanguages.join(',')
        : '';

      if (!name) {
        showToast('Prénom requis', 'error');
        return;
      }
      if (!ageValue || isNaN(ageNum) || ageNum < STAFF_AGE_MIN || ageNum > STAFF_AGE_MAX) {
        showToast('Âge staff : entre ' + STAFF_AGE_MIN + ' et ' + STAFF_AGE_MAX + ' ans.', 'error');
        return;
      }
      if (typeof selectedGender === 'undefined' || !selectedGender) {
        showToast('Genre requis', 'error');
        return;
      }

      var profile = {
        id: user.id,
        display_name: name,
        age: ageNum,
        gender: selectedGender,
        country: country,
        city: city || ((typeof userLocation !== 'undefined' && userLocation.city) || ''),
        languages: langs,
        other_language: '',
        host_country: country,
        stay_end: null,
        bio: null,
        interests: null,
        identity_locked: false,
        subscription: 'PREMIUM',
        avatar: selectedGender === 'Homme' ? '👨' : '👩'
      };

      if (typeof userLocation !== 'undefined') {
        profile.approx_lat = userLocation.lat;
        profile.approx_lng = userLocation.lng;
      }
      if (typeof isHost === 'function' && isHost()) profile.role = 'host';
      if (typeof isAdmin === 'function' && isAdmin()) profile.role = 'admin_general';

      var result = await supabaseClient.from('profiles').upsert([profile], { onConflict: 'id' });
      if (result.error) {
        console.error(result.error);
        showToast('Erreur : ' + result.error.message, 'error');
        return;
      }

      // Ne PAS verrouiller l'identité
      window.profileSaved = true;
      if (typeof showToast === 'function') showToast('Profil staff enregistré (modifiable à tout moment)', 'success');
      if (typeof refreshAuthUI === 'function') await refreshAuthUI('profile');
      applyStaffProfileUI();
      unlockIdentityFields();
    };
  }

  // Empêcher lockIdentityFields pour le staff
  var _origLock = window.lockIdentityFields;
  if (typeof _origLock === 'function') {
    window.lockIdentityFields = function () {
      if (isStaff()) {
        unlockIdentityFields();
        return;
      }
      return _origLock.apply(this, arguments);
    };
  }

  function init() { applyStaffProfileUI(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  var prevGo = window.go;
  if (typeof prevGo === 'function' && !window._staffProfileGoPatched) {
    window._staffProfileGoPatched = true;
    window.go = function (page) {
      prevGo(page);
      if (page === 'profile') {
        setTimeout(applyStaffProfileUI, 200);
        setTimeout(applyStaffProfileUI, 800);
      }
    };
  }

  setInterval(function () {
    if (isStaff() && typeof getActivePage === 'function' && getActivePage() === 'profile') {
      applyStaffProfileUI();
    }
  }, 3000);

  console.log('[AUPYGO] staff-profile.js chargé (identité débloquée)');
})();
