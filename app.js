/* =========================
   SUPABASE
========================= */

// SUPABASE_URL / SUPABASE_ANON_KEY viennent de config.js (chargé AVANT ce fichier)
// Init défensive : ne plante plus si config absent / double chargement
var supabaseClient = null;
(function initSupabase() {
  try {
    var url = (typeof SUPABASE_URL !== 'undefined') ? SUPABASE_URL : null;
    var key = (typeof SUPABASE_ANON_KEY !== 'undefined') ? SUPABASE_ANON_KEY : null;
    if (!url || !key) {
      console.error('[AUPYGO] config.js manquant : SUPABASE_URL / SUPABASE_ANON_KEY non définis');
      return;
    }
    if (typeof supabase === 'undefined' || !supabase.createClient) {
      console.error('[AUPYGO] librairie supabase-js non chargée');
      return;
    }
    supabaseClient = supabase.createClient(url, key);
  } catch (e) {
    console.error('[AUPYGO] init Supabase:', e);
  }
})();

/* =========================
   ÉTAT GLOBAL (déclaré tôt pour éviter TDZ sur onclick HTML)
========================= */
var currentUser = (typeof currentUser !== 'undefined') ? currentUser : null;
var turnstileToken = (typeof turnstileToken !== 'undefined') ? turnstileToken : null;
var currentPlan = (typeof currentPlan !== 'undefined') ? currentPlan : (localStorage.getItem('aupygo_plan') || 'FREE');
var profileLocked = (typeof profileLocked !== 'undefined') ? profileLocked : false;
var profileSaved = (typeof profileSaved !== 'undefined') ? profileSaved : false;
var authIntent = (typeof authIntent !== 'undefined') ? authIntent : null;
var map = (typeof map !== 'undefined') ? map : null;
var markersLayer = (typeof markersLayer !== 'undefined') ? markersLayer : null;
var profiles = (typeof profiles !== 'undefined') ? profiles : [];
var friendshipsCache = (typeof friendshipsCache !== 'undefined') ? friendshipsCache : [];
var selectedGender = (typeof selectedGender !== 'undefined') ? selectedGender : null;
if (typeof currentLang === 'undefined') {
  var currentLang = localStorage.getItem('aupygo_lang') || 'fr';
}

/* =========================
   DONNÉES & GÉOLOCALISATION
========================= */

// Position approximative uniquement (jamais exacte)
let userLocation = {
  lat: 46.20,    // arrondi
  lng: 6.14,
  city: 'Genève',
  isApproximate: true,
  hasRealGeo: false
};

const RADIUS = {
  FREE: 30,        // km
  STANDARD: 300,   // km (région)
  PREMIUM: null    // illimité
};

// Arrondit les coordonnées (~1 km) — jamais de position exacte
function approximateCoords(lat, lng) {
  return {
    lat: Math.round(lat * 100) / 100,
    lng: Math.round(lng * 100) / 100
  };
}

// Distance en km (Haversine)
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Demande la géolocalisation (avec consentement navigateur)
function requestUserLocation(callback) {
  if (!navigator.geolocation) {
    showToast(t('toast.geoloc_unavailable'), 'error');
    if (callback) callback(false);
    return;
  }

  showToast(t('toast.geoloc_requesting'), 'success');

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const approx = approximateCoords(pos.coords.latitude, pos.coords.longitude);
      userLocation.lat = approx.lat;
      userLocation.lng = approx.lng;
      userLocation.isApproximate = true;
      userLocation.hasRealGeo = true;
      userLocation.city = 'Ta zone';

      try {
        localStorage.setItem('aupygo_approx_lat', String(approx.lat));
        localStorage.setItem('aupygo_approx_lng', String(approx.lng));
      } catch (e) {}

      // Sauvegarde approximative dans Supabase (si connecté)
      if (currentUser) {
        try {
          await supabaseClient
            .from('profiles')
            .upsert({
              id: currentUser.id,
              approx_lat: approx.lat,
              approx_lng: approx.lng
            }, { onConflict: 'id' });
        } catch (e) {
          console.error('Erreur sauvegarde position:', e);
        }
      }

      showToast(t('toast.geoloc_saved'), 'success');
      if (map) {
        renderMarkers();
        applyMapRestrictions();
      }
      if (callback) callback(true);
    },
    (err) => {
      let msg = t('toast.geoloc_denied');
      if (err.code === 1) msg = t('toast.geoloc_denied');
      if (err.code === 2) msg = t('toast.geoloc_unavailable_now');
      if (err.code === 3) msg = t('toast.geoloc_timeout');
      showToast(msg, 'error');
      if (callback) callback(false);
    },
    {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 600000
    }
  );
}

function loadSavedApproxLocation() {
  try {
    const lat = localStorage.getItem('aupygo_approx_lat');
    const lng = localStorage.getItem('aupygo_approx_lng');
    if (lat && lng) {
      userLocation.lat = parseFloat(lat);
      userLocation.lng = parseFloat(lng);
      userLocation.hasRealGeo = true;
      userLocation.city = 'Ta zone';
    }
  } catch (e) {}
}

/* =========================
   CONSENT GÉOLOCALISATION (~1 km)
========================= */

let geoConsentPendingCallback = null;

function showGeoConsent(callback) {
  if (userLocation.hasRealGeo) {
    if (callback) callback(true);
    return;
  }
  geoConsentPendingCallback = callback || null;
  const overlay = document.getElementById('geoConsentOverlay');
  if (overlay) {
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

function closeGeoConsent() {
  const overlay = document.getElementById('geoConsentOverlay');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function acceptGeoConsent() {
  closeGeoConsent();
  const cb = geoConsentPendingCallback;
  geoConsentPendingCallback = null;
  requestUserLocation((ok) => {
    if (cb) cb(ok);
    if (ok && map) {
      map.setView([userLocation.lat, userLocation.lng], getDefaultZoomForPlan());
      renderMarkers();
      applyMapRestrictions();
    }
  });
}

function declineGeoConsent() {
  closeGeoConsent();
  const cb = geoConsentPendingCallback;
  geoConsentPendingCallback = null;
  try {
    localStorage.setItem('aupygo_geo_declined', '1');
  } catch (e) {}
  showToast('Position non activée. Tu peux réessayer via « Autour de moi ».', 'error');
  if (cb) cb(false);
}

function onMapClickForGeo() {
  if (!currentUser) return;
  if (!userLocation.hasRealGeo) {
    showGeoConsent();
  }
}

function onTurnstileVerified(token) {
  turnstileToken = token;
}

function onTurnstileExpired() {
  turnstileToken = null;
}

/* =========================
   AUTHENTIFICATION
========================= */
function goToLogin() {
  go('plans');
  switchAuthTab('login');
}

function switchAuthTab(tab) {
  const signupForm = document.getElementById('signupForm');
  const loginForm = document.getElementById('loginForm');
  const tabSignup = document.getElementById('tabSignup');
  const tabLogin = document.getElementById('tabLogin');

  if (tab === 'signup') {
    if (signupForm) signupForm.style.display = 'block';
    if (loginForm) loginForm.style.display = 'none';
    if (tabSignup) { tabSignup.classList.add('btn-primary'); tabSignup.classList.remove('btn-secondary'); }
    if (tabLogin) { tabLogin.classList.add('btn-secondary'); tabLogin.classList.remove('btn-primary'); }
  } else {
    if (signupForm) signupForm.style.display = 'none';
    if (loginForm) loginForm.style.display = 'block';
    if (tabLogin) { tabLogin.classList.add('btn-primary'); tabLogin.classList.remove('btn-secondary'); }
    if (tabSignup) { tabSignup.classList.add('btn-secondary'); tabSignup.classList.remove('btn-primary'); }
  }

  turnstileToken = null;
  if (window.turnstile) {
    try { window.turnstile.reset(); } catch (e) {}
  }
}

async function handleSignup() {
  const emailInput = document.getElementById('signupEmail');
  const passInput = document.getElementById('signupPassword');
  const email = emailInput ? emailInput.value.trim() : '';
  const password = passInput ? passInput.value : '';

  if (!email || !password) {
    showToast(t('toast.email_password_required'), 'error');
    return;
  }

  if (password.length < 6) {
    showToast(t('toast.password_too_short'), 'error');
    return;
  }

  try {
    const { data: emailCheck, error: emailCheckErr } = await supabaseClient.rpc(
      'aupygo_check_email_allowed',
      { p_email: email }
    );
    if (!emailCheckErr && emailCheck && emailCheck.allowed === false) {
      alert(emailCheck.message || 'Adresse mail invalide ou bloquée');
      showToast(emailCheck.message || 'Adresse mail invalide ou bloquée', 'error');
      return;
    }
  } catch (e) {
    console.warn('[AUPYGO] check email allowed:', e);
  }

  authIntent = 'signup';

  let data, error;
  const signupOpts = {
    emailRedirectTo: window.location.origin + window.location.pathname
  };
  if (turnstileToken) signupOpts.captchaToken = turnstileToken;
  ({ data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: signupOpts
  }));

  if (error && turnstileToken && /captcha|400|request/i.test(String(error.message || ''))) {
    delete signupOpts.captchaToken;
    ({ data, error } = await supabaseClient.auth.signUp({ email, password, options: signupOpts }));
  }

  if (window.turnstile) try { window.turnstile.reset(); } catch (e) {}
  turnstileToken = null;

  if (error) {
    authIntent = null;
    const errTxt = String(error.message || '') + ' ' + String(error.details || '');
    if (/EMAIL_BLOCKED|MAX_SIGNUPS|Adresse mail invalide ou bloquée|email.*block/i.test(errTxt)) {
      alert('Adresse mail invalide ou bloquée');
      showToast('Adresse mail invalide ou bloquée', 'error');
    } else {
      showToast('Erreur : ' + error.message, 'error');
    }
    return;
  }

  const pendingNotice = document.getElementById('signupPendingNotice');

  if (data.session) {
    if (pendingNotice) pendingNotice.style.display = 'none';
    showToast(t('toast.account_created'), 'success');
  } else {
    if (pendingNotice) pendingNotice.style.display = 'block';
    showToast(t('toast.account_created_pending'), 'success');
  }

  if (emailInput) emailInput.value = '';
  if (passInput) passInput.value = '';
}

function lockIdentityFields() {
  const firstName = document.getElementById('firstName');
  const country = document.getElementById('country');
  if (firstName) firstName.readOnly = true;
  if (country) country.readOnly = true;

  const ageEl = document.getElementById('age');
  if (ageEl) {
    ageEl.disabled = true;
    ageEl.style.opacity = '0.65';
    ageEl.style.cursor = 'not-allowed';
    ageEl.title = 'Âge verrouillé après enregistrement';
  }

  document.querySelectorAll('.gender-option').forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.6';
    btn.style.cursor = 'not-allowed';
  });

  profileLocked = true;
}

function unlockIdentityFields() {
  const firstName = document.getElementById('firstName');
  const country = document.getElementById('country');
  if (firstName) firstName.readOnly = false;
  if (country) country.readOnly = false;

  const ageEl = document.getElementById('age');
  if (ageEl) {
    ageEl.disabled = false;
    ageEl.style.opacity = '1';
    ageEl.style.cursor = '';
    ageEl.title = '';
  }

  document.querySelectorAll('.gender-option').forEach(btn => {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
  });

  profileLocked = false;
}

async function handleLogin() {
  const emailInput = document.getElementById('loginEmail');
  const passInput = document.getElementById('loginPassword');
  const email = emailInput ? emailInput.value.trim() : '';
  const password = passInput ? passInput.value : '';

  if (!email || !password) {
    showToast(t('toast.login_email_password_required'), 'error');
    return;
  }

  authIntent = 'login';

  let data, error;
  if (turnstileToken) {
    ({ data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken: turnstileToken }
    }));
    if (error) {
      const m = String(error.message || '');
      if (/captcha|400|request|invalid/i.test(m)) {
        ({ data, error } = await supabaseClient.auth.signInWithPassword({ email, password }));
      }
    }
  } else {
    ({ data, error } = await supabaseClient.auth.signInWithPassword({ email, password }));
  }

  if (window.turnstile) try { window.turnstile.reset(); } catch (e) {}
  turnstileToken = null;

  if (error) {
    authIntent = null;
    const msg = String(error.message || error.error_description || '');
    if (/invalid.*credential|invalid login/i.test(msg)) {
      showToast(t('toast.login_invalid') || 'Email ou mot de passe incorrect.', 'error');
    } else if (/email.*not.*confirm|not confirmed/i.test(msg)) {
      showToast(t('toast.email_not_confirmed') || 'Confirme d’abord ton email (lien reçu à l’inscription).', 'error');
    } else if (/captcha/i.test(msg)) {
      showToast(t('toast.captcha_required') || 'Valide le captcha puis réessaie.', 'error');
    } else {
      showToast('Erreur : ' + msg, 'error');
    }
    return;
  }

  if (emailInput) emailInput.value = '';
  if (passInput) passInput.value = '';

  const pendingNotice = document.getElementById('signupPendingNotice');
  if (pendingNotice) pendingNotice.style.display = 'none';
}

function isRecentlyOnline(member) {
  if (!member || !member.last_seen) return false;
  return (Date.now() - new Date(member.last_seen).getTime()) < 5 * 60 * 1000;
}

function isAdmin() {
  return typeof currentUserIsAdmin !== 'undefined' && currentUserIsAdmin;
}

async function setOnlineStatus(online) {
  if (!currentUser) return;
  if (isAdmin()) return; 
  try {
    const payload = { is_online: !!online };
    if (online) payload.last_seen = new Date().toISOString();

    const { error } = await supabaseClient
      .from('profiles')
      .update(payload)
      .eq('id', currentUser.id);
    if (error) {
      await supabaseClient
        .from('profiles')
        .upsert({ id: currentUser.id, ...payload }, { onConflict: 'id' });
    }
    const me = profiles.find(p => p.id === currentUser.id);
    if (me) {
      me.is_online = !!online;
      if (online) me.last_seen = payload.last_seen;
    } else if (online) {
      profiles.push({ id: currentUser.id, is_online: true, last_seen: payload.last_seen });
    }
    if (map) renderMarkers();
    updateOnlineCount();
  } catch (e) {
    console.error('setOnlineStatus:', e);
  }
}

function updateOnlineCount() {
  const el = document.getElementById('onlineCount');
  const n = (profiles || []).filter(isRecentlyOnline).length;
  if (el) el.textContent = String(n);

  const homeMap = document.getElementById('homeBtnMap');
  if (homeMap) {
    const badge = homeMap.querySelector('.home-btn-badge');
    if (badge) {
      badge.textContent = n > 99 ? '99+' : String(n);
      if (n > 0) badge.classList.add('show');
      else badge.classList.remove('show');
    }
    const onlineEl = homeMap.querySelector('.home-btn-online');
    if (onlineEl) {
      onlineEl.textContent = n > 0 ? (n + ' connecté' + (n > 1 ? 's' : '')) : '';
      onlineEl.style.display = n > 0 ? 'block' : 'none';
    }
  }
}

let isLocalLogout = false;

async function handleLogout(reason) {
  if (typeof stopIdleWatch === 'function') stopIdleWatch();
  if (typeof teardownMessagesRealtime === 'function') teardownMessagesRealtime();
  await setOnlineStatus(false);

  isLocalLogout = true;
  currentUser = null;
  if (typeof currentUserIsAdmin !== 'undefined') currentUserIsAdmin = false;
  currentPlan = 'FREE';
  localStorage.removeItem('aupygo_plan');
  profileSaved = false;

  try {
    await supabaseClient.auth.signOut({ scope: 'global' });
  } catch (e) {
    try { await supabaseClient.auth.signOut(); } catch (e2) {}
  }
  isLocalLogout = false;

  unlockIdentityFields();

  const fn = document.getElementById('firstName');
  const age = document.getElementById('age');
  const bio = document.getElementById('bio');
  const country = document.getElementById('country');
  const pName = document.getElementById('profileName');
  const pMeta = document.getElementById('profileMeta');
  const pAvatar = document.getElementById('profileAvatar');

  if (fn) fn.value = '';
  if (age) age.value = '';
  if (bio) bio.value = '';
  if (country) country.value = '';
  if (pName) pName.textContent = t('profile.name_placeholder');
  if (pMeta) pMeta.textContent = t('profile.meta_placeholder');
  if (pAvatar) pAvatar.textContent = '👤';

  if (document.getElementById('hostCountry')) document.getElementById('hostCountry').value = '';
  if (document.getElementById('stayEnd')) document.getElementById('stayEnd').value = '';
  if (document.getElementById('city')) document.getElementById('city').value = '';

  selectedGender = null;
  document.querySelectorAll('.gender-option').forEach(b => b.classList.remove('selected'));
  if (typeof selectedHobbies !== 'undefined') selectedHobbies.length = 0;
  document.querySelectorAll('.hobby').forEach(b => b.classList.remove('selected'));
  const otherHobby = document.getElementById('otherHobby');
  if (otherHobby) { otherHobby.style.display = 'none'; otherHobby.value = ''; }

  if (typeof clearLanguageSelection === 'function') clearLanguageSelection();
  if (typeof updateProfileCard === 'function') updateProfileCard(null);

  updatePlanUI();
  await refreshAuthUI();

  if (reason === 'idle') {
    showToast(t('toast.idle_logged_out'), 'error');
  } else {
    showToast(t('toast.logged_out'));
  }
  go('home');
  if (map) {
    applyMapRestrictions();
    renderMarkers();
  }
}

async function refreshAuthUI(redirectPage = 'profile') {
  const { data: { user } } = await supabaseClient.auth.getUser();

  const justLoggedIn = !currentUser && !!user;
  currentUser = user;

  const loggedOut = document.getElementById('authLoggedOut');
  const loggedIn = document.getElementById('authLoggedIn');

  if (user) {
    if (loggedOut) loggedOut.style.display = 'none';
    if (loggedIn) loggedIn.style.display = 'block';
    const authEmail = document.getElementById('authUserEmail');
    if (authEmail) authEmail.textContent = user.email;

    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('subscription, display_name, age, gender, country, bio, interests, identity_locked, languages, other_language, host_country, stay_end, city, is_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (typeof ADMIN_EMAIL !== 'undefined') {
      currentUserIsAdmin = !!(profile && profile.is_admin === true) ||
        !!(user.email && user.email.toLowerCase() === ADMIN_EMAIL);
    }

    if (profile && profile.subscription) {
      currentPlan = profile.subscription;
      localStorage.setItem('aupygo_plan', currentPlan);
      updatePlanUI();
    }

    if (isAdmin()) {
      currentPlan = 'PREMIUM';
      localStorage.setItem('aupygo_plan', 'PREMIUM');
      updatePlanUI();
    }

    if (profile && profile.identity_locked === true) {
      const fn = document.getElementById('firstName');
      const ag = document.getElementById('age');
      const ct = document.getElementById('country');
      const bi = document.getElementById('bio');
      if (fn) fn.value = profile.display_name || '';
      if (ag) ag.value = profile.age || '';
      if (ct) ct.value = profile.country || '';
      if (bi) bi.value = profile.bio || '';

      if (document.getElementById('city')) document.getElementById('city').value = profile.city || '';
      if (document.getElementById('hostCountry')) document.getElementById('hostCountry').value = profile.host_country || '';
      if (document.getElementById('stayEnd')) document.getElementById('stayEnd').value = profile.stay_end || '';
      if (document.getElementById('otherLanguage')) document.getElementById('otherLanguage').value = profile.other_language || '';

      if (profile.gender) {
        selectedGender = profile.gender;
        const pAv = document.getElementById('profileAvatar');
        if (pAv) pAv.textContent = profile.gender === 'Homme' ? '👨' : '👩';
        document.querySelectorAll('.gender-option').forEach(btn => {
          btn.classList.toggle('selected', btn.textContent.trim().includes(profile.gender));
        });
      }

      if (typeof selectedHobbies !== 'undefined') {
        selectedHobbies.length = 0;
        document.querySelectorAll('.hobby').forEach(b => b.classList.remove('selected'));
        if (profile.interests) {
          profile.interests.split(',').map(s => s.trim()).filter(Boolean).forEach(hobby => {
            if (selectedHobbies.length >= 3) return;
            selectedHobbies.push(hobby);
            const btn = document.querySelector('.hobby[data-hobby="' + hobby + '"]');
            if (btn) btn.classList.add('selected');
          });
        }
        const oH = document.getElementById('otherHobby');
        if (oH) oH.style.display = selectedHobbies.includes('Autre') ? 'block' : 'none';
      }

      if (typeof selectedLanguages !== 'undefined') {
        if (typeof clearLanguageSelection === 'function') clearLanguageSelection();
        if (profile.languages) {
          profile.languages.split(',').map(s => s.trim()).filter(Boolean).forEach(code => {
            if (selectedLanguages.length >= 3) return;
            selectedLanguages.push(code);
            const btn = document.querySelector('.lang-chip[data-lang="' + code + '"]');
            if (btn) btn.classList.add('selected');
          });
          if (selectedLanguages.includes('OTHER')) {
            const ol = document.getElementById('otherLanguage');
            if (ol) ol.style.display = 'block';
          }
        }
      }

      if (typeof updateProfileCard === 'function') {
        updateProfileCard({
          name: profile.display_name,
          age: profile.age,
          hostCountry: profile.host_country,
          stayEnd: profile.stay_end,
          languages: typeof selectedLanguages !== 'undefined' ? selectedLanguages.slice() : [],
          otherLang: profile.other_language,
          hobbies: typeof selectedHobbies !== 'undefined' ? selectedHobbies.slice() : []
        });
      }

      profileSaved = true;
      lockIdentityFields();

    } else {
      if (profile) {
        const fn = document.getElementById('firstName');
        const ag = document.getElementById('age');
        const ct = document.getElementById('country');
        const bi = document.getElementById('bio');
        if (fn) fn.value = profile.display_name || '';
        if (ag) ag.value = profile.age || '';
        if (ct) ct.value = profile.country || '';
        if (bi) bi.value = profile.bio || '';
        if (profile.gender) {
          selectedGender = profile.gender;
          const pAv = document.getElementById('profileAvatar');
          if (pAv) pAv.textContent = profile.gender === 'Homme' ? '👨' : '👩';
        }
      }

      profileSaved = false;
      unlockIdentityFields();

      if (typeof selectedHobbies !== 'undefined') {
        selectedHobbies.length = 0;
        document.querySelectorAll('.hobby').forEach(b => b.classList.remove('selected'));
        const oH = document.getElementById('otherHobby');
        if (oH) oH.style.display = 'none';
      }
    }

    updateNavVisibility();

    if (justLoggedIn) {
      const pendingNotice = document.getElementById('signupPendingNotice');
      if (pendingNotice) pendingNotice.style.display = 'none';

      const finalRedirect = profileSaved ? redirectPage : 'profile';
      go(finalRedirect);

      if (finalRedirect === 'home') {
        showToast(t('toast.login_success'), 'success');
      } else if (!profileSaved) {
        showToast(t('toast.complete_profile'), 'success');
      } else {
        showToast(t('toast.welcome_back'), 'success');
      }

      setTimeout(() => {
        if (!userLocation.hasRealGeo) {
          showGeoConsent((ok) => {
            if (ok && map) {
              renderMarkers();
              applyMapRestrictions();
            }
          });
        }
      }, 800);

      setOnlineStatus(true);
      if (typeof startIdleWatch === 'function') startIdleWatch();
      if (typeof loadFriendshipsFromDB === 'function') loadFriendshipsFromDB().then(updateFriendsBadge);
      if (typeof loadUnreadCounts === 'function') loadUnreadCounts();
      if (typeof loadGroupInvitations === 'function') loadGroupInvitations();
    }
  } else {
    if (loggedOut) loggedOut.style.display = 'block';
    if (loggedIn) loggedIn.style.display = 'none';
    profileSaved = false;
    unlockIdentityFields();
    updateNavVisibility();
  }

  updateGuestBanner();
  updateProfileLogoutButton();
}

/* =========================
   VISIBILITÉ DE LA NAVIGATION
========================= */

function getActivePage() {
  const activePage = document.querySelector('.page.active');
  return activePage ? activePage.id : 'home';
}

function updateGuestBanner() {
  const banner = document.getElementById('guestBanner');
  if (!banner) return;
  banner.style.display = currentUser ? 'none' : 'flex';
}

function updateProfileLogoutButton() {
  const btn = document.getElementById('profileLogoutBtn');
  if (!btn) return;
  btn.style.display = currentUser ? 'block' : 'none';
}

function updateHomeView() {
  const landing = document.getElementById('homeLanding');
  const dash = document.getElementById('homeDashboard');
  if (!landing || !dash) return;

  const showDash = !!(currentUser && profileSaved);
  landing.style.display = showDash ? 'none' : 'block';
  dash.style.display = showDash ? 'block' : 'none';

  if (showDash) {
    const nameEl = document.getElementById('dashName');
    const first = document.getElementById('firstName');
    if (nameEl) {
      nameEl.textContent = (first && first.value.trim())
        ? first.value.trim()
        : (currentUser?.user_metadata?.display_name || 'Aupy');
    }
  }
}

function updateNavVisibility() {
  document.querySelectorAll('nav button').forEach(b => {
    b.style.display = 'flex';
  });
}

/* =========================
   FORFAITS
========================= */

function updatePlanUI() {
  if (typeof updatePlanAvatarUI === 'function') updatePlanAvatarUI();

  const headerPlan = document.getElementById('headerPlan');
  if (headerPlan) {
    headerPlan.textContent = currentPlan;
  }

  ['FREE','STANDARD','PREMIUM'].forEach(p => {
    const card = document.getElementById('plan-' + p);
    const badge = document.getElementById('badge-' + p);

    if (card) {
      card.classList.toggle('active-plan', p === currentPlan);
    }

    if (badge) {
      badge.style.display = p === currentPlan ? 'block' : 'none';
    }
  });

  // Agenda communauté (onglet Sortir)
  const agendaBox = document.getElementById('agendaBox');
  const agendaNotice = document.getElementById('agendaNotice');

  if (currentPlan === 'FREE') {
    if (agendaBox) agendaBox.classList.add('locked');
    if (agendaNotice) agendaNotice.innerHTML = t('events.agenda_locked');
  } else {
    if (agendaBox) agendaBox.classList.remove('locked');
    if (agendaNotice) agendaNotice.innerHTML = t('events.agenda_unlocked') + ' (' + currentPlan + ')';
  }

  // Agenda personnel (page Profil)
  const personalAgendaBox = document.getElementById('personalAgendaBox');
  const personalAgendaNotice = document.getElementById('personalAgendaNotice');

  if (personalAgendaBox && personalAgendaNotice) {
    if (currentPlan === 'FREE') {
      personalAgendaBox.classList.add('locked');
      personalAgendaNotice.innerHTML = t('profile.agenda_locked');
      personalAgendaNotice.style.display = 'block';
    } else {
      personalAgendaBox.classList.remove('locked');
      personalAgendaNotice.innerHTML = t('profile.agenda_unlocked');
      personalAgendaNotice.style.display = 'block';
    }
  }

  // Messagerie
  const messagesBox = document.getElementById('messagesBox');
  const messagesNotice = document.getElementById('messagesNotice');

  if (messagesBox && messagesNotice) {
    if (!currentUser) {
      messagesBox.style.opacity = '0.5';
      messagesBox.style.pointerEvents = 'none';
      messagesNotice.innerHTML = t('messages.notice_locked');
    } else {
      messagesBox.style.opacity = '1';
      messagesBox.style.pointerEvents = 'auto';
      messagesNotice.innerHTML = '';
    }
  }
}

// Fonction de navigation entre onglets
function go(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));

  const page = document.getElementById(pageId);
  if (page) page.classList.add('active');

  const btn = document.querySelector(`nav button[onclick="go('${pageId}')"]`);
  if (btn) btn.classList.add('active');

  if (pageId === 'home') updateHomeView();
  if (pageId === 'map' && map) {
    setTimeout(() => { map.invalidateSize(); }, 200);
  }
}

// Fonction pour l'envoi/affichage de toasts
function showToast(message, type = 'info') {
  let toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toastContainer';
    toastContainer.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.style.cssText = `padding:12px 20px;border-radius:8px;color:#fff;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,0.15);background:${type==='error'?'#ef4444':type==='success'?'#22c55e':'#3b82f6'}`;
  toast.textContent = message;

  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4000);
}

// Helper i18n générique de secours
function t(key) {
  if (typeof translations !== 'undefined' && translations[currentLang] && translations[currentLang][key]) {
    return translations[currentLang][key];
  }
  return key;
}
/* =========================
   CRÉATION D'ÉVÉNEMENTS ADMIN & COMMUNAUTÉ
========================= */

function openCreateEventModal(visibility) {
  if (!currentUser) {
    showToast(t('plans.need_login') || 'Connecte-toi pour organiser une sortie.', 'error');
    go('plans');
    return;
  }

  // Contrôle d'accès à la partition Admin
  if (visibility === 'admin' && !isAdmin()) {
    showToast('Accès refusé : Réservé à l’administrateur AUPYGO.', 'error');
    return;
  }

  if (currentPlan === 'FREE' && visibility !== 'admin') {
    showToast(t('events.join_locked') || 'Passe à STANDARD pour organiser des sorties.', 'error');
    go('plans');
    return;
  }

  document.getElementById('createEventVisibility').value = visibility;
  
  const titles = {
    public: '🎉 Organiser une sortie (communauté)',
    friends: '🤝 Sortie entre amis',
    admin: '⭐ Événement spécial AUPYGO (Admin)'
  };
  
  document.getElementById('createEventTitle').textContent = titles[visibility] || titles.public;

  // Réinitialisation des champs du formulaire
  document.getElementById('createEventTitleInput').value = '';
  document.getElementById('createEventAddress').value = '';
  document.getElementById('createEventDesc').value = '';
  document.getElementById('createEventMax').value = visibility === 'admin' ? '50' : '8';

  // Affichage des options de prix réservées à l'Admin
  const priceWrap = document.getElementById('createEventPriceWrap');
  if (priceWrap) {
    priceWrap.style.display = isAdmin() ? 'block' : 'none';
  }

  eventWizardStep = 0;
  eventWizardRender();

  const ov = document.getElementById('createEventOverlay');
  if (ov) { 
    ov.style.display = 'flex'; 
    document.body.style.overflow = 'hidden'; 
  }
}

async function submitCreateEvent() {
  if (!currentUser) return;

  const title = (document.getElementById('createEventTitleInput').value || '').trim();
  const address = (document.getElementById('createEventAddress').value || '').trim();
  const desc = (document.getElementById('createEventDesc').value || '').trim();
  const maxP = parseInt(document.getElementById('createEventMax').value, 10) || 8;
  const dateVal = document.getElementById('createEventDate').value;
  const visibility = document.getElementById('createEventVisibility').value || 'public';

  if (!title || !address || !dateVal) {
    showToast('Veuillez remplir le nom, la date et l’adresse.', 'error');
    return;
  }

  // Sécurité : Seul l'admin peut valider une visibilité "admin"
  if (visibility === 'admin' && !isAdmin()) {
    showToast('Création interdite dans la partition Admin.', 'error');
    return;
  }

  const paidRadio = document.querySelector('input[name="eventPaid"]:checked');
  const isPaid = !!(paidRadio && paidRadio.value === 'paid') && isAdmin();
  const price = isPaid ? (parseFloat((document.getElementById('createEventPrice') || {}).value) || 0) : 0;

  const isSpecial = visibility === 'admin' || selectedEventType === 'special';

  const row = {
    creator_id: currentUser.id,
    title: title,
    type: selectedEventType,
    emoji: selectedEventEmoji,
    description: desc || null,
    address: address,
    event_date: new Date(dateVal).toISOString(),
    max_participants: maxP,
    visibility: isSpecial ? 'admin' : visibility,
    is_paid: isPaid,
    price: price,
    is_special_aupygo: isSpecial
  };

  try {
    const { data, error } = await supabaseClient
      .from('events')
      .insert(row)
      .select()
      .single();

    if (error) throw error;

    // Inscription automatique du créateur
    await supabaseClient.from('event_participants').insert({
      event_id: data.id,
      user_id: currentUser.id
    });

    closeCreateEventModal();
    showToast('✅ Sortie créée avec succès !', 'success');
    if (typeof loadAndRenderEvents === 'function') {
      await loadAndRenderEvents();
    }
  } catch (e) {
    console.error('Erreur lors de la création de l\'événement:', e);
    showToast('Erreur : ' + (e.message || 'Impossible de créer la sortie'), 'error');
  }
}
