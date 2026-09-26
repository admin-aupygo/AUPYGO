/* AUPYGO staff-profile.js v3.1 — identity_locked true (debloque l app) */
(function () {
  'use strict';
  if (typeof isStaff !== 'function') return;

  var STAFF_AGE_MIN = 22;
  var STAFF_AGE_MAX = 80;

  function hidePersonalAgendaOnly() {
    if (!isStaff()) return;
    var box = document.getElementById('personalAgendaBox');
    if (box) {
      box.style.display = 'none';
      box.setAttribute('hidden', 'true');
    }
    var notice = document.getElementById('personalAgendaNotice');
    if (notice) notice.style.display = 'none';
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
    if (!isStaff()) return;
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
    if (!isStaff()) return;
    var ageEl = document.getElementById('age');
    if (!ageEl) return;

    if (ageEl.tagName === 'SELECT') {
      var current = ageEl.value;
      var opts = ageEl.querySelectorAll('option');
      var hasRange = false;
      opts.forEach(function (opt) {
        var v = parseInt(opt.value, 10);
        if (!opt.value || isNaN(v)) return;
        if (v < STAFF_AGE_MIN || v > STAFF_AGE_MAX) {
          opt.disabled = true;
          opt.hidden = true;
          opt.style.display = 'none';
        } else {
          opt.disabled = false;
          opt.hidden = false;
          opt.style.display = '';
          hasRange = true;
        }
      });
      if (!hasRange) {
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
      }
      var curNum = parseInt(current, 10);
      if (curNum >= STAFF_AGE_MIN && curNum <= STAFF_AGE_MAX) ageEl.value = String(curNum);
    } else {
      ageEl.setAttribute('min', String(STAFF_AGE_MIN));
      ageEl.setAttribute('max', String(STAFF_AGE_MAX));
    }
  }

  function hideStaffOnlyExtras() {
    if (!isStaff()) return;

    function hideGroupOf(el) {
      if (!el) return;
      var g = el.closest('.form-group');
      if (g && !g.classList.contains('profile-form-card')) {
        g.style.display = 'none';
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
      if (/hobbies|centres d.intérêt|centres d'intérêt|intérêts|pays d.accueil|à propos de moi/i.test(t)) {
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

  function applyStaffProfileUI() {
    if (!isStaff()) return;
    showFormCard();
    unlockIdentityFields();
    enforceStaffAgeRange();
    hideStaffOnlyExtras();
    hidePersonalAgendaOnly();
    showFormCard();
    // Débloque navigation / dashboard
    try { profileSaved = true; } catch (e) {}
    try { window.profileSaved = true; } catch (e2) {}
  }

  var _origSave = window.saveProfile;
  if (typeof _origSave === 'function') {
    window.saveProfile = async function () {
      if (!isStaff()) return _origSave.apply(this, arguments);

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

      var profile = {
        id: user.id,
        display_name: name,
        age: ageNum,
        gender: selectedGender,
        country: country,
        city: city || ((typeof userLocation !== 'undefined' && userLocation.city) || ''),
        languages: langs,
        host_country: null,
        identity_locked: true,
        subscription: 'PREMIUM',
        bio: null,
        interests: null
      };
      if (typeof isHost === 'function' && isHost()) profile.role = 'host';
      if (typeof isAdmin === 'function' && isAdmin()) profile.role = 'admin_general';

      var result = await supabaseClient.from('profiles').upsert([profile], { onConflict: 'id' });
      if (result.error) {
        showToast('Erreur : ' + result.error.message, 'error');
        return;
      }

      window.profileSaved = true;
      try { profileSaved = true; } catch (e0) {}
      showToast('Profil enregistré', 'success');
      if (typeof refreshAuthUI === 'function') await refreshAuthUI('home');
      setTimeout(applyStaffProfileUI, 200);
    };
  }

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
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  var prevGo = window.go;
  if (typeof prevGo === 'function' && !window._staffProfileGoPatched) {
    window._staffProfileGoPatched = true;
    window.go = function (page) {
      prevGo(page);
      if (page === 'profile') {
        setTimeout(applyStaffProfileUI, 100);
        setTimeout(applyStaffProfileUI, 400);
        setTimeout(applyStaffProfileUI, 1000);
      }
    };
  }

  setInterval(function () {
    if (!isStaff()) return;
    try { profileSaved = true; } catch (e) {}
    if (typeof getActivePage === 'function' && getActivePage() === 'profile') {
      showFormCard();
      unlockIdentityFields();
      hideStaffOnlyExtras();
      hidePersonalAgendaOnly();
      showFormCard();
    }
  }, 2500);

  console.log('[AUPYGO] staff-profile.js v3.1');
})();
