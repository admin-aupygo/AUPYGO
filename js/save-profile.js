/* ==========================================================================
 * AUPYGO — save-profile-fix.js
 * Corrige l'enregistrement d'un NOUVEAU profil (UPSERT au lieu de UPDATE).
 * ========================================================================== */
(function () {
  'use strict';

  async function saveProfileFixed() {
    const sb = window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    if (!sb) {
      if (typeof showToast === 'function') showToast((typeof t === 'function' ? t('toast.error_prefix') : '') + 'Connexion indisponible', 'error');
      return;
    }

    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      if (typeof showToast === 'function') showToast(typeof t === 'function' ? t('profile.login_required') : 'Connecte-toi', 'error');
      if (typeof go === 'function') go('plans');
      return;
    }

    const name = (document.getElementById('firstName') || {}).value?.trim() || '';
    const ageValue = (document.getElementById('age') || {}).value || '';
    const country = (document.getElementById('country') || {}).value || '';
    const bio = (document.getElementById('bio') || {}).value || '';
    const isFirst = !(typeof profileSaved !== 'undefined' && profileSaved);

    const selectedGenderVal = (typeof selectedGender !== 'undefined') ? selectedGender : null;
    const hobbies = (typeof selectedHobbies !== 'undefined' && Array.isArray(selectedHobbies)) ? selectedHobbies : [];
    const langs = (typeof selectedLanguages !== 'undefined' && Array.isArray(selectedLanguages)) ? selectedLanguages : [];
    const loc = (typeof userLocation !== 'undefined') ? userLocation : { lat: null, lng: null, city: '' };

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

    const profile = {
      bio: bio,
      interests: hobbies.join(',')
    };

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

    let savedRows = null;
    let saveErr = null;
    if (isFirst) {
      const res = await sb.from('profiles').upsert(profile, { onConflict: 'id' }).select('id');
      savedRows = res.data;
      saveErr = res.error;
    } else {
      const res = await sb.from('profiles').update(profile).eq('id', user.id).select('id');
      savedRows = res.data;
      saveErr = res.error;
    }

    const error = saveErr || ((!savedRows || savedRows.length === 0) ? { message: 'profil introuvable' } : null);
    if (error) {
      console.error('[save-profile-fix]', error);
      if (typeof showToast === 'function') showToast((typeof t === 'function' ? t('toast.error_prefix') : '') + error.message, 'error');
      return;
    }

    const hostCountry = (document.getElementById('hostCountry') || {}).value || '';
    const stayEnd = (document.getElementById('stayEnd') || {}).value || '';
    const otherLangVal = (document.getElementById('otherLanguage') || {}).value || '';
    const cityVal = (document.getElementById('city') || {}).value || '';

    try {
      const extra = {
        languages: langs.join(','),
        other_language: otherLangVal,
        host_country: hostCountry,
        stay_end: stayEnd || null,
        city: cityVal || null,
        interests: hobbies.join(','),
        bio: bio
      };
      if (isFirst) {
        await sb.from('profiles').upsert({ id: user.id, ...extra }, { onConflict: 'id' });
      } else {
        await sb.from('profiles').update(extra).eq('id', user.id);
      }
    } catch (e) {
      console.error(e);
    }

    if (typeof updateProfileCard === 'function') {
      updateProfileCard({
        name: name || (document.getElementById('firstName') || {}).value?.trim() || '',
        age: ageValue || (document.getElementById('age') || {}).value || '',
        hostCountry: hostCountry,
        stayEnd: stayEnd,
        languages: langs.slice(),
        otherLang: otherLangVal,
        hobbies: hobbies.slice()
      });
    }

    if (isFirst) {
      if (typeof profileSaved !== 'undefined') profileSaved = true;
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

  function reapply() {
    window.saveProfile = saveProfileFixed;
    try { if (typeof saveProfile !== 'undefined') saveProfile = saveProfileFixed; } catch (e) {}
    window.__aupygoSaveProfileFixed = true;
  }

  window.__aupygoReapplySaveProfile = reapply;
  reapply();
  // Au cas où app.js se charge plus tard
  setTimeout(reapply, 500);
  setTimeout(reapply, 1500);
  setTimeout(reapply, 3000);

  console.log('[AUPYGO] save-profile-fix.js — ready (upsert new profiles)');
})();
