/* AUPYGO staff-profile.js v2
 * Profil Staff / Amiral :
 * - Âge 22–80
 * - Champs identité éditables (prénom, âge, genre, pays, ville, langues)
 * - Masque bio, hobbies, pays d'accueil, agenda perso, abonnements
 * - N'écrit JAMAIS le rôle (RLS Amiral uniquement)
 */
(function () {
  'use strict';

  var STAFF_AGE_MIN = 22;
  var STAFF_AGE_MAX = 80;

  function staffReady() {
    return typeof isStaff === 'function' && isStaff();
  }

  function hidePersonalAgendaOnly() {
    if (!staffReady()) return;
    ['personalAgendaBox', 'personalAgendaNotice', 'personalCalendar'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.style.display = 'none';
        el.setAttribute('hidden', 'true');
      }
    });
  }

  function showFormCard() {
    var formCard = document.querySelector('#profile .profile-form-card');
    if (formCard) {
      formCard.style.display = '';
      formCard.style.visibility = 'visible';
      formCard.removeAttribute('hidden');
    }
    var layout = document.querySelector('#profile .profile-layout');
    if (layout) {
      layout.style.display = '';
      layout.style.visibility = 'visible';
    }
    var page = document.getElementById('profile');
    if (page) {
      page.style.display = '';
      page.classList.add('active');
    }
  }

  function unlockIdentityFields() {
    if (!staffReady()) return;
    showFormCard();

    ['firstName', 'age', 'country', 'city'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.disabled = false;
      el.readOnly = false;
      el.removeAttribute('readonly');
      el.removeAttribute('disabled');
      el.style.display = '';
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
    });

    var genderGroup = document.getElementById('genderGroup');
    if (genderGroup) {
      genderGroup.style.display = '';
      genderGroup.style.visibility = 'visible';
      var gg = genderGroup.closest('.form-group');
      if (gg) gg.style.display = '';
    }
    document.querySelectorAll('#genderGroup button, .gender-option, .gender-btn, [data-gender]').forEach(function (btn) {
      btn.disabled = false;
      btn.style.pointerEvents = 'auto';
      btn.style.opacity = '1';
      btn.style.display = '';
    });

    // Langues visibles
    document.querySelectorAll('#profile .lang-chip, #profile #languageSelect, #profile .languages-box').forEach(function (el) {
      el.style.display = '';
      var g = el.closest('.form-group');
      if (g) g.style.display = '';
    });

    document.querySelectorAll('#profile button').forEach(function (btn) {
      var t = (btn.textContent || '').toLowerCase();
      var oc = btn.getAttribute('onclick') || '';
      if (/enregistrer|sauvegarder/i.test(t) || oc.indexOf('saveProfile') !== -1) {
        btn.style.display = '';
        btn.disabled = false;
        btn.style.pointerEvents = 'auto';
        btn.style.opacity = '1';
      }
    });
  }

  function enforceStaffAgeRange() {
    if (!staffReady()) return;
    var ageEl = document.getElementById('age');
    if (!ageEl) return;

    var current = ageEl.value;

    if (ageEl.tagName === 'SELECT') {
      // Rebuild complet 22–80
      ageEl.innerHTML = '';
      var ph = document.createElement('option');
      ph.value = '';
      ph.textContent = 'Âge';
      ageEl.appendChild(ph);
      for (var a = STAFF_AGE_MIN; a <= STAFF_AGE_MAX; a++) {
        var o = document.createElement('option');
        o.value = String(a);
        o.textContent = String(a);
        ageEl.appendChild(o);
      }
      var curNum = parseInt(current, 10);
      if (curNum >= STAFF_AGE_MIN && curNum <= STAFF_AGE_MAX) {
        ageEl.value = String(curNum);
      }
      ageEl.disabled = false;
      ageEl.style.opacity = '1';
      ageEl.style.cursor = '';
      ageEl.title = 'Âge Staff : ' + STAFF_AGE_MIN + '–' + STAFF_AGE_MAX + ' ans';
    } else {
      ageEl.setAttribute('min', String(STAFF_AGE_MIN));
      ageEl.setAttribute('max', String(STAFF_AGE_MAX));
      ageEl.disabled = false;
      ageEl.readOnly = false;
    }
  }

  function hideStaffOnlyExtras() {
    if (!staffReady()) return;

    function hideGroupOf(el) {
      if (!el) return;
      var g = el.closest('.form-group');
      if (g && !g.classList.contains('profile-form-card')) {
        g.style.display = 'none';
      } else {
        el.style.display = 'none';
      }
    }

    hideGroupOf(document.getElementById('bio'));
    document.querySelectorAll('.bio-counter').forEach(function (el) { el.style.display = 'none'; });

    ['hostCountry', 'stayEnd', 'otherLanguage'].forEach(function (id) {
      hideGroupOf(document.getElementById(id));
    });

    var hobbyGrid = document.querySelector('#profile .hobby-grid');
    if (hobbyGrid) hideGroupOf(hobbyGrid);
    var otherHobby = document.getElementById('otherHobby');
    if (otherHobby) hideGroupOf(otherHobby);

    document.querySelectorAll('#profileCardHobbies, .profile-card-hobbies').forEach(function (el) {
      el.style.display = 'none';
    });

    document.querySelectorAll('#profile .form-group label, #profile .form-group .form-label').forEach(function (el) {
      var t = (el.textContent || '').toLowerCase();
      if (/hobbies|centres d.intérêt|centres d'intérêt|intérêts|pays d.accueil|à propos de moi|bio/i.test(t)) {
        var g = el.closest('.form-group');
        if (g) g.style.display = 'none';
      }
    });

    document.querySelectorAll('#profile button, #profile a').forEach(function (btn) {
      var t = (btn.textContent || '').toLowerCase();
      var oc = (btn.getAttribute('onclick') || '');
      if (/supprimer mon profil|supprimer.*compte/i.test(t)) btn.style.display = 'none';
      if (/voir les abonnements|abonnement|passer en premium|voir les offres/i.test(t) || oc.indexOf("go('plans')") !== -1) {
        btn.style.display = 'none';
      }
      if (/mon agenda/i.test(t)) btn.style.display = 'none';
    });
  }

  function injectStaffProfileBanner() {
    if (!staffReady()) return;
    var page = document.getElementById('profile');
    if (!page) return;
    var existing = document.getElementById('staffProfileBanner');
    if (existing) {
      existing.style.display = '';
      return;
    }
    var banner = document.createElement('div');
    banner.id = 'staffProfileBanner';
    banner.style.cssText = 'margin:12px 0;padding:12px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;font-size:13px;color:#166534;font-weight:600';
    var label = (typeof isAmiral === 'function' && isAmiral()) ? 'Amiral' : 'Staff';
    banner.innerHTML = '🛡️ Compte ' + label + ' — âge ' + STAFF_AGE_MIN + '–' + STAFF_AGE_MAX +
      ' ans · privilèges Premium · pas d\'abonnement communautaire';
    var form = page.querySelector('.profile-form-card') || page.querySelector('form') || page;
    if (form.firstChild) form.insertBefore(banner, form.firstChild);
    else form.appendChild(banner);
  }

  function applyStaffProfileUI() {
    if (!staffReady()) return;
    showFormCard();
    unlockIdentityFields();
    enforceStaffAgeRange();
    hideStaffOnlyExtras();
    hidePersonalAgendaOnly();
    injectStaffProfileBanner();
    showFormCard();
    try { profileSaved = true; } catch (e) {}
    try { window.profileSaved = true; } catch (e2) {}
  }

  // saveProfile Staff — n'écrit jamais role / is_admin / staff_*
  function installSavePatch() {
    if (typeof window.saveProfile !== 'function' || window._staffSavePatched) return;
    window._staffSavePatched = true;
    var _origSave = window.saveProfile;
    window.saveProfile = async function () {
      if (!staffReady()) return _origSave.apply(this, arguments);

      var userRes = await supabaseClient.auth.getUser();
      var user = userRes.data && userRes.data.user;
      if (!user) { showToast('Connecte-toi', 'error'); return; }

      var name = ((document.getElementById('firstName') || {}).value || '').trim();
      var ageValue = (document.getElementById('age') || {}).value;
      var ageNum = Number(ageValue);
      var country = (document.getElementById('country') || {}).value || '';
      var city = (document.getElementById('city') || {}).value || '';
      var langs = (typeof selectedLanguages !== 'undefined' && selectedLanguages.length)
        ? selectedLanguages.join(',') : '';

      if (!name) { showToast('Prénom requis', 'error'); return; }
      if (!ageValue || isNaN(ageNum) || ageNum < STAFF_AGE_MIN || ageNum > STAFF_AGE_MAX) {
        showToast('Âge Staff / Admin : entre ' + STAFF_AGE_MIN + ' et ' + STAFF_AGE_MAX + ' ans.', 'error');
        return;
      }
      if (typeof selectedGender === 'undefined' || !selectedGender) {
        showToast('Genre requis', 'error');
        return;
      }

          var changes = {
        display_name: name,
        age: ageNum,
        gender: selectedGender,
        country: country,
        city: city || ((typeof userLocation !== 'undefined' && userLocation.city) || ''),
        languages: langs,
        host_country: null,
        bio: null,
        interests: null
      };

      var result = await supabaseClient.from('profiles').update(changes).eq('id', user.id).select('id');
      if (!result.error && (!result.data || result.data.length === 0)) {
        result.error = { message: 'profil introuvable' };
      }

      window.profileSaved = true;
      try { profileSaved = true; } catch (e0) {}
      showToast('Profil Staff enregistré', 'success');
      if (typeof window.syncStaffRoleFromProfile === 'function') {
        await window.syncStaffRoleFromProfile();
      }
      if (typeof refreshAuthUI === 'function') await refreshAuthUI('profile');
      setTimeout(applyStaffProfileUI, 200);
      setTimeout(applyStaffProfileUI, 600);
    };
  }

  function installLockPatch() {
    if (typeof window.lockIdentityFields !== 'function' || window._staffLockPatched) return;
    window._staffLockPatched = true;
    var _origLock = window.lockIdentityFields;
    window.lockIdentityFields = function () {
      if (staffReady()) {
        unlockIdentityFields();
        enforceStaffAgeRange();
        return;
      }
      return _origLock.apply(this, arguments);
    };
  }

  function tick() {
    installSavePatch();
    installLockPatch();
    if (!staffReady()) return;
    applyStaffProfileUI();
  }

  async function ensureRoleThenApply() {
    if (typeof window.syncStaffRoleFromProfile === 'function') {
      try { await window.syncStaffRoleFromProfile(); } catch (e) {}
    }
    tick();
  }

  // Patch go → profil
  if (typeof window.go === 'function' && !window._staffProfileGoPatched) {
    window._staffProfileGoPatched = true;
    var prevGo = window.go;
    window.go = function (page) {
      prevGo(page);
      if (page === 'profile') {
        setTimeout(ensureRoleThenApply, 100);
        setTimeout(ensureRoleThenApply, 400);
        setTimeout(ensureRoleThenApply, 1000);
      }
    };
  }

  // Init
  setTimeout(ensureRoleThenApply, 400);
  setTimeout(ensureRoleThenApply, 1200);
  setTimeout(ensureRoleThenApply, 2500);

  setInterval(function () {
    if (!staffReady()) return;
    try { profileSaved = true; } catch (e) {}
    if (typeof getActivePage === 'function' && getActivePage() === 'profile') {
      applyStaffProfileUI();
    }
  }, 2000);

  console.log('[AUPYGO] staff-profile.js v2');
})();
