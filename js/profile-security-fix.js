/* ==========================================================================
 * AUPYGO — profile-security-fix.js
 * 1) Masque téléphone / email dans la bio (mêmes règles que la messagerie)
 * 2) Cache Amiral / Staff aux users sur carte + listes
 * 3) UPSERT profil à la 1ère sauvegarde
 * ========================================================================== */
(function () {
  'use strict';

  var STAFF_ROLES = [
    'amiral', 'admin_general', 'admin', 'host', 'moderator',
    'major_staff', 'sergent_staff', 'major_moderateur', 'sergent_moderateur'
  ];

  function isStaffRole(p) {
    if (!p) return false;
    if (p.is_admin === true) return true;
    var r = String(p.role || '').toLowerCase().trim();
    return STAFF_ROLES.indexOf(r) !== -1;
  }

  function viewerIsStaff() {
    try {
      if (typeof isAdmin === 'function' && isAdmin()) return true;
      if (typeof isStaff === 'function' && isStaff()) return true;
    } catch (e) {}
    return false;
  }

  function maskBioText(text) {
    var b = String(text == null ? '' : text);
    if (!b) return b;
    if (window.AupyModeration && typeof window.AupyModeration.maskSensitive === 'function') {
      var m = window.AupyModeration.maskSensitive(b);
      if (m && typeof m === 'object' && m.text != null) return m.text;
      if (typeof m === 'string') return m;
    }
    // Fallback minimal si message-mask pas encore chargé
    b = b.replace(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)+/g, '[Donnee masquee pour votre securite]');
    b = b.replace(/(?:\+|00)?\d[\d\s.\-]{7,}\d/g, function (m) {
      var d = m.replace(/\D/g, '');
      return d.length >= 9 ? '[Donnee masquee pour votre securite]' : m;
    });
    return b;
  }

  /* ---- 1. Filtre Amiral/Staff après chaque loadProfiles ---- */
  function filterHiddenStaff() {
    if (viewerIsStaff()) return;
    if (!Array.isArray(window.profiles)) return;
    var me = window.currentUser && window.currentUser.id;
    var before = window.profiles.length;
    window.profiles = window.profiles.filter(function (p) {
      if (!p) return false;
      if (me && p.id === me) return true;
      return !isStaffRole(p);
    });
    if (window.profiles.length !== before) {
      console.log('[AUPYGO] Staff/Amiral masqués:', before - window.profiles.length);
      try { if (typeof renderMarkers === 'function') renderMarkers(); } catch (e) {}
      try { if (typeof updateOnlineCount === 'function') updateOnlineCount(); } catch (e) {}
    }
  }

  async function enrichRolesThenFilter() {
    try {
      if (!Array.isArray(window.profiles) || !window.profiles.length) return;
      if (viewerIsStaff()) return;
      var sb = window.supabaseClient || window.supabase;
      if (!sb) return;
      var ids = window.profiles.map(function (p) { return p && p.id; }).filter(Boolean).slice(0, 400);
      if (!ids.length) return;
      var res = await sb.from('profiles').select('id, role, is_admin').in('id', ids);
      if (res.data && res.data.length) {
        var map = {};
        res.data.forEach(function (r) { map[r.id] = r; });
        window.profiles.forEach(function (p) {
          if (p && map[p.id]) {
            p.role = map[p.id].role;
            p.is_admin = map[p.id].is_admin;
          }
        });
      }
    } catch (e) {
      console.warn('[AUPYGO] enrich roles', e);
    }
    filterHiddenStaff();
  }

  function patchLoadProfiles() {
    if (typeof window.loadProfiles !== 'function') return false;
    if (window._aupygoLoadProfilesSecured) return true;
    var orig = window.loadProfiles;
    window.loadProfiles = async function () {
      var r = await orig.apply(this, arguments);
      await enrichRolesThenFilter();
      return r;
    };
    window._aupygoLoadProfilesSecured = true;
    return true;
  }

  /* ---- 2. Bio masquée à l'affichage fiche membre ---- */
  function patchOpenMemberProfile() {
    if (typeof window.openMemberProfile !== 'function') return false;
    if (window._aupygoOpenMemberSecured) return true;
    var orig = window.openMemberProfile;
    window.openMemberProfile = function (memberId) {
      // Bloque ouverture d'un profil staff pour un user
      if (!viewerIsStaff() && Array.isArray(window.profiles)) {
        var p = window.profiles.find(function (x) { return x && x.id === memberId; });
        if (p && isStaffRole(p) && !(window.currentUser && window.currentUser.id === memberId)) {
          if (typeof showToast === 'function') showToast('Profil indisponible.', 'error');
          return;
        }
      }
      var result = orig.apply(this, arguments);
      // Post-masque la bio dans le DOM (sécurité)
      try {
        var box = document.getElementById('memberModal');
        if (box) {
          box.querySelectorAll('.member-info').forEach(function (el) {
            if (el && el.textContent && /@|\d{2,}/.test(el.textContent)) {
              var masked = maskBioText(el.textContent);
              if (masked !== el.textContent) el.textContent = masked;
            }
          });
        }
      } catch (e) {}
      return result;
    };
    window._aupygoOpenMemberSecured = true;
    return true;
  }

  /* ---- 3. saveProfile : UPSERT + masque bio ---- */
  async function saveProfileSecure() {
    var sb = window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    if (!sb) {
      if (typeof showToast === 'function') showToast('Connexion indisponible', 'error');
      return;
    }
    var auth = await sb.auth.getUser();
    var user = auth && auth.data && auth.data.user;
    if (!user) {
      if (typeof showToast === 'function') showToast(typeof t === 'function' ? t('profile.login_required') : 'Connecte-toi', 'error');
      if (typeof go === 'function') go('plans');
      return;
    }

    var name = ((document.getElementById('firstName') || {}).value || '').trim();
    var ageValue = (document.getElementById('age') || {}).value || '';
    var country = (document.getElementById('country') || {}).value || '';
    var bio = (document.getElementById('bio') || {}).value || '';
    var isFirst = !(typeof profileSaved !== 'undefined' && profileSaved);

    var selectedGenderVal = (typeof selectedGender !== 'undefined') ? selectedGender : null;
    var hobbies = (typeof selectedHobbies !== 'undefined' && Array.isArray(selectedHobbies)) ? selectedHobbies : [];
    var langs = (typeof selectedLanguages !== 'undefined' && Array.isArray(selectedLanguages)) ? selectedLanguages : [];
    var loc = (typeof userLocation !== 'undefined') ? userLocation : { lat: null, lng: null, city: '' };

    // Masque téléphone / email dans la bio
    var bioBefore = bio;
    bio = maskBioText(bio);
    if (bio !== bioBefore) {
      var bioEl = document.getElementById('bio');
      if (bioEl) bioEl.value = bio;
      if (typeof showToast === 'function') {
        showToast('Coordonnées masquées dans la description (même règle que la messagerie).', 'info');
      }
    }

    if (isFirst) {
      if (!name) {
        if (typeof showToast === 'function') showToast(typeof t === 'function' ? t('profile.first_name_error') : 'Prénom requis', 'error');
        return;
      }
      if (!ageValue || Number(ageValue) < 18) {
        if (typeof showToast === 'function') showToast(typeof t === 'function' ? t('profile.age_error') : 'Âge invalide', 'error');
        return;
      }
      if (!selectedGenderVal) {
        if (typeof showToast === 'function') showToast(typeof t === 'function' ? t('profile.gender_error') : 'Genre requis', 'error');
        return;
      }
    }

    var profile = { bio: bio, interests: hobbies.join(',') };
    if (isFirst) {
      profile.id = user.id;
      profile.display_name = name;
      profile.age = Number(ageValue);
      profile.gender = selectedGenderVal;
      profile.country = country;
      profile.city = (document.getElementById('city') || {}).value || loc.city || null;
      profile.approx_lat = loc.lat;
      profile.approx_lng = loc.lng;
      profile.avatar = selectedGenderVal === 'Homme' ? '👨' : '👩';
      profile.identity_locked = true;
      profile.languages = langs.join(',');
      profile.other_language = (document.getElementById('otherLanguage') || {}).value || '';
      profile.host_country = (document.getElementById('hostCountry') || {}).value || '';
      profile.stay_end = (document.getElementById('stayEnd') || {}).value || null;
      profile.subscription = 'FREE';
    }

    var savedRows = null, saveErr = null;
    if (isFirst) {
      var res = await sb.from('profiles').upsert(profile, { onConflict: 'id' }).select('id');
      savedRows = res.data; saveErr = res.error;
    } else {
      var res2 = await sb.from('profiles').update(profile).eq('id', user.id).select('id');
      savedRows = res2.data; saveErr = res2.error;
    }
    var error = saveErr || ((!savedRows || !savedRows.length) ? { message: 'profil introuvable' } : null);
    if (error) {
      console.error('[profile-security]', error);
      if (typeof showToast === 'function') showToast((typeof t === 'function' ? t('toast.error_prefix') : '') + error.message, 'error');
      return;
    }

    var hostCountry = (document.getElementById('hostCountry') || {}).value || '';
    var stayEnd = (document.getElementById('stayEnd') || {}).value || '';
    var otherLangVal = (document.getElementById('otherLanguage') || {}).value || '';
    var cityVal = (document.getElementById('city') || {}).value || '';
    try {
      var extra = {
        languages: langs.join(','),
        other_language: otherLangVal,
        host_country: hostCountry,
        stay_end: stayEnd || null,
        city: cityVal || null,
        interests: hobbies.join(','),
        bio: bio
      };
      if (isFirst) await sb.from('profiles').upsert({ id: user.id, ...extra }, { onConflict: 'id' });
      else await sb.from('profiles').update(extra).eq('id', user.id);
    } catch (e) { console.error(e); }

    if (typeof updateProfileCard === 'function') {
      updateProfileCard({
        name: name || ((document.getElementById('firstName') || {}).value || '').trim(),
        age: ageValue || (document.getElementById('age') || {}).value || '',
        hostCountry: hostCountry,
        stayEnd: stayEnd,
        languages: langs.slice(),
        otherLang: otherLangVal,
        hobbies: hobbies.slice()
      });
    }

    if (isFirst) {
      try { profileSaved = true; } catch (e) {}
      window.profileSaved = true;
      if (typeof lockIdentityFields === 'function') lockIdentityFields();
      if (typeof updateNavVisibility === 'function') updateNavVisibility();
      if (typeof showToast === 'function') showToast(typeof t === 'function' ? t('profile.saved_first') : 'Profil enregistré !', 'success');
      if (typeof go === 'function') go('home');
      if (typeof updateHomeView === 'function') updateHomeView();
    } else {
      if (typeof showToast === 'function') showToast(typeof t === 'function' ? t('profile.saved_update') : 'Profil mis à jour', 'success');
    }
  }

  function reapplySaveProfile() {
    window.saveProfile = saveProfileSecure;
    try { if (typeof saveProfile !== 'undefined') saveProfile = saveProfileSecure; } catch (e) {}
  }

  function boot() {
    patchLoadProfiles();
    patchOpenMemberProfile();
    reapplySaveProfile();
    enrichRolesThenFilter();
    filterHiddenStaff();
  }

  boot();
  setTimeout(boot, 400);
  setTimeout(boot, 1200);
  setTimeout(boot, 2500);
  setTimeout(function () { enrichRolesThenFilter(); }, 3000);

  console.log('[AUPYGO] profile-security-fix.js — ready');
})();
