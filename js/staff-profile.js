/* AUPYGO staff-profile.js v2 — profil Admin/Staff débloqué */
(function () {
  'use strict';
  if (typeof isStaff !== 'function') return;

  var STAFF_AGE_MIN = 22;
  var STAFF_AGE_MAX = 80;

  function hidePersonalAgendaOnly() {
    if (!isStaff()) return;
    ['personalAgendaBox', 'personalAgendaNotice', 'myAgendaList'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { el.style.display = 'none'; el.setAttribute('hidden', 'true'); }
    });
    // Bloc "Mon agenda" en bas profil
    document.querySelectorAll('#profile .card, #profile section').forEach(function (card) {
      var t = (card.textContent || '').toLowerCase();
      if (/mon agenda aupygo|agenda privé aupygo/i.test(t) && card.querySelector('#personalCalendar, #myAgendaList, #personalAgendaBox')) {
        card.style.display = 'none';
      }
    });
  }

  function unlockIdentityFields() {
    if (!isStaff()) return;

    // Afficher le formulaire principal
    document.querySelectorAll('#profile .profile-form-card, #profile form, #profile .card').forEach(function (el) {
      if (el.id === 'personalAgendaBox') return;
      el.style.display = '';
      el.removeAttribute('hidden');
    });

    // Champs autorisés
    ['firstName', 'age', 'country', 'city', 'gender'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.disabled = false;
      el.readOnly = false;
      el.removeAttribute('readonly');
      el.removeAttribute('disabled');
      el.style.display = '';
      el.style.pointerEvents = '';
      el.style.opacity = '1';
      var g = el.closest('.form-group');
      if (g) {
        g.style.display = '';
        g.style.visibility = 'visible';
        g.removeAttribute('hidden');
      }
    });

    // Genre (boutons)
    var genderGroup = document.getElementById('genderGroup');
    if (genderGroup) {
      genderGroup.style.display = '';
      genderGroup.style.visibility = 'visible';
    }
    document.querySelectorAll('#genderGroup button, .gender-btn, [data-gender]').forEach(function (btn) {
      btn.disabled = false;
      btn.style.pointerEvents = 'auto';
      btn.style.opacity = '1';
      btn.style.display = '';
    });

    // Langues si présentes
    var langBox = document.getElementById('languageSelect') || document.querySelector('#profile .lang-chips, #profile #langs');
    if (langBox) {
      var lg = langBox.closest('.form-group');
      if (lg) lg.style.display = '';
    }

    // Bouton enregistrer
    document.querySelectorAll('#profile button[onclick*="saveProfile"], #saveProfileBtn, #profile .btn-primary').forEach(function (btn) {
      var t = (btn.textContent || '').toLowerCase();
      if (/enregistrer|sauvegarder|save|valider/i.test(t) || (btn.getAttribute('onclick') || '').indexOf('saveProfile') !== -1) {
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
      ageEl.setAttribute('type', 'number');
    }
  }

  function hideStaffOnlyExtras() {
    if (!isStaff()) return;

    // Bio
    var bio = document.getElementById('bio');
    if (bio) {
      var g = bio.closest('.form-group');
      if (g) g.style.display = 'none';
    }
    document.querySelectorAll('.bio-counter').forEach(function (el) { el.style.display = 'none'; });

    // Pays d'accueil, séjour, autre langue
    ['hostCountry', 'stayEnd', 'otherLanguage'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var g = el.closest('.form-group');
      if (g) g.style.display = 'none';
      else el.style.display = 'none';
    });

    // Centres d'intérêt
    var hobbyGrid = document.querySelector('.hobby-grid');
    if (hobbyGrid) {
      var section = hobbyGrid.closest('.form-group') || hobbyGrid.parentElement;
      if (section) section.style.display = 'none';
      else hobbyGrid.style.display = 'none';
    }
    document.querySelectorAll('#profileCardHobbies, .profile-card-hobbies').forEach(function (el) {
      el.style.display = 'none';
    });
    document.querySelectorAll('#profile h3, #profile .form-label, #profile label, #profile .section-title').forEach(function (el) {
      if (/centres d.intérêt|centres d'intérêt|intérêts|pays d.accueil/i.test(el.textContent || '')) {
        var block = el.closest('.form-group, section, .card') || el.parentElement;
        if (block && block.id !== 'profile') block.style.display = 'none';
      }
    });

    // Boutons supprimer / abonnements / mon agenda
    document.querySelectorAll('#profile button, #profile a, #profile .btn').forEach(function (btn) {
      var t = (btn.textContent || '').toLowerCase();
      if (/supprimer mon profil|supprimer.*compte|delete.*account/i.test(t)) btn.style.display = 'none';
      if (/voir les abonnements|abonnement|passer en premium|voir les offres/i.test(t)) btn.style.display = 'none';
      if (/mon agenda/i.test(t)) btn.style.display = 'none';
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
        identity_locked: false,
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
      showToast('Profil enregistré', 'success');
      if (typeof refreshAuthUI === 'function') await refreshAuthUI('profile');
      applyStaffProfileUI();
    };
  }

  var _origLock = window.lockIdentityFields;
  if (typeof _origLock === 'function') {
    window.lockIdentityFields = function () {
      if (isStaff()) { unlockIdentityFields(); return; }
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
        setTimeout(applyStaffProfileUI, 500);
        setTimeout(applyStaffProfileUI, 1200);
      }
    };
  }

  setInterval(function () {
    if (isStaff() && typeof getActivePage === 'function' && getActivePage() === 'profile') {
      hidePersonalAgendaOnly();
      unlockIdentityFields();
      enforceStaffAgeRange();
      hideStaffOnlyExtras();
    }
  }, 2000);

  console.log('[AUPYGO] staff-profile.js v2');
})();
