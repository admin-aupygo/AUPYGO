/* AUPYGO staff-profile.js — formulaire OK, âge 20-80, sans Mon agenda */
(function () {
  'use strict';
  if (typeof isStaff !== 'function') return;

  var STAFF_AGE_MIN = 20;
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
    var list = document.getElementById('myAgendaList');
    if (list) list.style.display = 'none';
  }

  function unlockIdentityFields() {
    if (!isStaff()) return;
    ['firstName', 'age', 'country', 'city'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.disabled = false;
      el.readOnly = false;
      el.removeAttribute('readonly');
      el.removeAttribute('disabled');
      el.style.display = '';
      var g = el.closest('.form-group');
      if (g) g.style.display = '';
    });
    var formCard = document.querySelector('#profile .profile-form-card');
    if (formCard) formCard.style.display = '';
    document.querySelectorAll('#genderGroup button, .gender-btn, [data-gender]').forEach(function (btn) {
      btn.disabled = false;
      btn.style.pointerEvents = '';
      btn.style.opacity = '';
    });
  }

  /** Âge 20–80 uniquement pour Staff / Admin */
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
      // Si aucune option valide, reconstruire
      if (!hasRange) {
        var keepFirst = ageEl.querySelector('option[value=""]');
        ageEl.innerHTML = '';
        if (keepFirst) ageEl.appendChild(keepFirst);
        else {
          var ph = document.createElement('option');
          ph.value = '';
          ph.textContent = 'Âge';
          ageEl.appendChild(ph);
        }
        for (var a = STAFF_AGE_MIN; a <= STAFF_AGE_MAX; a++) {
          var o = document.createElement('option');
          o.value = String(a);
          o.textContent = String(a);
          ageEl.appendChild(o);
        }
      }
      var curNum = parseInt(current, 10);
      if (curNum >= STAFF_AGE_MIN && curNum <= STAFF_AGE_MAX) {
        ageEl.value = String(curNum);
      }
    } else {
      // input number / text
      ageEl.setAttribute('min', String(STAFF_AGE_MIN));
      ageEl.setAttribute('max', String(STAFF_AGE_MAX));
      ageEl.setAttribute('type', 'number');
      var n = parseInt(ageEl.value, 10);
      if (!isNaN(n) && (n < STAFF_AGE_MIN || n > STAFF_AGE_MAX)) {
        ageEl.value = '';
      }
    }
  }

  function hideStaffOnlyExtras() {
    if (!isStaff()) return;
    var bio = document.getElementById('bio');
    if (bio) {
      var g = bio.closest('.form-group');
      if (g) g.style.display = 'none';
    }
    document.querySelectorAll('.bio-counter').forEach(function (el) { el.style.display = 'none'; });
    ['stayEnd', 'otherLanguage'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var g = el.closest('.form-group');
      if (g) g.style.display = 'none';
    });
    document.querySelectorAll('button, a').forEach(function (btn) {
      var t = (btn.textContent || '').toLowerCase();
      if (/supprimer mon profil|supprimer.*compte|delete.*account/i.test(t)) {
        btn.style.display = 'none';
      }
    });
  }

  function applyStaffProfileUI() {
    if (!isStaff()) return;
    hidePersonalAgendaOnly();
    unlockIdentityFields();
    enforceStaffAgeRange();
    hideStaffOnlyExtras();
  }

  var _origSave = window.saveProfile;
  if (typeof _origSave === 'function') {
    window.saveProfile = async function () {
      if (!isStaff()) return _origSave.apply(this, arguments);

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
        host_country: country,
        identity_locked: false,
        subscription: 'PREMIUM'
      };
      if (typeof isHost === 'function' && isHost()) profile.role = 'host';
      if (typeof isAdmin === 'function' && isAdmin()) profile.role = 'admin_general';

      var result = await supabaseClient.from('profiles').upsert([profile], { onConflict: 'id' });
      if (result.error) {
        showToast('Erreur : ' + result.error.message, 'error');
        return;
      }

      window.profileSaved = true;
      showToast('Profil enregistré', 'success');
      if (typeof refreshAuthUI === 'function') await refreshAuthUI('profile');
      applyStaffProfileUI();
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
        setTimeout(applyStaffProfileUI, 150);
        setTimeout(applyStaffProfileUI, 600);
      }
    };
  }

  setInterval(function () {
    if (isStaff() && typeof getActivePage === 'function' && getActivePage() === 'profile') {
      hidePersonalAgendaOnly();
      unlockIdentityFields();
      enforceStaffAgeRange();
    }
  }, 2500);

  console.log('[AUPYGO] staff-profile.js (âge 20-80)');
})();
