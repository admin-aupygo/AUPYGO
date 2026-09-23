/* AUPYGO staff-profile.js
 * Profil staff limité : Prénom, Âge, Genre, Pays, Ville, Langues
 * Masque bio, hobbies, pays d'accueil, fin de séjour, etc.
 */
(function () {
  'use strict';
  if (typeof isStaff !== 'function') return;

  function closestFormGroup(el) {
    if (!el) return null;
    var g = el.closest('.form-group');
    if (g) return g;
    return el.parentElement;
  }

  function applyStaffProfileUI() {
    if (!isStaff()) return;

    var bio = document.getElementById('bio');
    if (bio) {
      var g = closestFormGroup(bio);
      if (g) g.style.display = 'none';
      else bio.style.display = 'none';
    }
    document.querySelectorAll('.bio-counter').forEach(function (el) {
      el.style.display = 'none';
    });

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
      var prev = (section || hobbyGrid).previousElementSibling;
      if (prev && /hobby|centre|intérêt|interest|passion/i.test(prev.textContent || '')) {
        prev.style.display = 'none';
      }
    }
    document.querySelectorAll('#profileCardHobbies, .profile-card-hobbies').forEach(function (el) {
      el.style.display = 'none';
    });

    if (!document.getElementById('staffProfileBanner')) {
      var form = document.querySelector('.profile-form-card') || document.getElementById('profile');
      if (form) {
        var banner = document.createElement('div');
        banner.id = 'staffProfileBanner';
        banner.style.cssText = 'background:#f1f5f9;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;margin-bottom:16px;font-size:13px;color:#475569;font-weight:600;';
        banner.textContent = '🛡️ Profil Staff — champs limités : Prénom, Âge, Genre, Pays, Ville, Langues';
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
        showToast(typeof t === 'function' ? t('profile.login_required') : 'Connecte-toi', 'error');
        if (typeof go === 'function') go('plans');
        return;
      }

      var name = ((document.getElementById('firstName') || {}).value || '').trim();
      var ageValue = (document.getElementById('age') || {}).value;
      var country = (document.getElementById('country') || {}).value || '';
      var city = (document.getElementById('city') || {}).value || '';
      var langs = (typeof selectedLanguages !== 'undefined' && selectedLanguages.length)
        ? selectedLanguages.join(',')
        : '';

      var alreadySaved = window.profileSaved === true;

      if (!alreadySaved) {
        if (!name) {
          showToast(typeof t === 'function' ? t('profile.first_name_error') : 'Prénom requis', 'error');
          return;
        }
        if (!ageValue || Number(ageValue) < 18) {
          showToast(typeof t === 'function' ? t('profile.age_error') : 'Âge requis (18+)', 'error');
          return;
        }
        if (typeof selectedGender === 'undefined' || !selectedGender) {
          showToast(typeof t === 'function' ? t('profile.gender_error') : 'Genre requis', 'error');
          return;
        }
      }

      var profile = {
        id: user.id,
        bio: null,
        interests: null,
        subscription: (typeof currentPlan !== 'undefined' ? currentPlan : 'PREMIUM')
      };

      if (!alreadySaved) {
        profile.display_name = name;
        profile.age = Number(ageValue);
        profile.gender = selectedGender;
        profile.country = country;
        profile.city = city || ((typeof userLocation !== 'undefined' && userLocation.city) || '');
        if (typeof userLocation !== 'undefined') {
          profile.approx_lat = userLocation.lat;
          profile.approx_lng = userLocation.lng;
        }
        profile.avatar = selectedGender === 'Homme' ? '👨' : '👩';
        profile.identity_locked = true;
        profile.languages = langs;
        profile.other_language = '';
        profile.host_country = country;
        profile.stay_end = null;
      } else {
        profile.city = city;
        profile.languages = langs;
      }

      if (typeof isAdmin === 'function' && isAdmin()) {
        profile.subscription = 'PREMIUM';
        profile.is_admin = true;
        profile.role = 'admin_general';
      } else if (typeof isHost === 'function' && isHost()) {
        profile.role = 'host';
      }

      var result = await supabaseClient.from('profiles').upsert([profile], { onConflict: 'id' });
      if (result.error) {
        console.error(result.error);
        showToast('Erreur : ' + result.error.message, 'error');
        return;
      }

      window.profileSaved = true;
      if (typeof lockIdentityFields === 'function') lockIdentityFields();
      if (typeof showToast === 'function') showToast('Profil staff enregistré', 'success');
      if (typeof refreshAuthUI === 'function') await refreshAuthUI('profile');
      applyStaffProfileUI();
    };
  }

  function init() {
    applyStaffProfileUI();
  }

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

  console.log('[AUPYGO] staff-profile.js chargé');
})();
