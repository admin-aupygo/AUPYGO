/* =========================
   SUPABASE
========================= */

// SUPABASE_URL / SUPABASE_ANON_KEY viennent de js/config.js
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* =========================
   DONNÉES & GÉOLOCALISATION
========================= */

// Position approximative uniquement (jamais exacte)
let userLocation = {
  lat: 46.20,   // arrondi
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
  // Déjà autorisé → pas de popup
  if (userLocation.hasRealGeo) {
    if (callback) callback(true);
    return;
  }
  // Refus mémorisé pour cette session ? on laisse quand même re-proposer au clic carte
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
  // Demande réelle au navigateur (position approximative)
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
  // Invité : pas de géoloc, juste l’aperçu mondial
  if (!currentUser) return;
  // Au clic sur la carte : proposer le consentement si pas encore de géoloc
  if (!userLocation.hasRealGeo) {
    showGeoConsent();
  }
}


let currentPlan = localStorage.getItem('aupygo_plan') || 'FREE';
let currentUser = null;
let profileLocked = false;
let profileSaved = false; // true uniquement si un profil existe déjà en base pour ce compte

// Indique l'action en cours (login/signup) pour que le listener
// onAuthStateChange sache où rediriger, sans entrer en conflit avec
// un appel direct à refreshAuthUI().
let authIntent = null; // 'login' | 'signup' | null

// Jeton anti-robot Cloudflare Turnstile, généré côté client au moment
// où l'utilisateur valide le contrôle (souvent automatique et invisible).
let turnstileToken = null;

function onTurnstileVerified(token) {
  turnstileToken = token;
}

function onTurnstileExpired() {
  turnstileToken = null;
}

let map, markersLayer;
let profiles = []; // profils avec approx_lat / approx_lng (global)


/* =========================
   AUTHENTIFICATION
========================= */

function switchAuthTab(tab) {

  const signupForm = document.getElementById('signupForm');
  const loginForm = document.getElementById('loginForm');
  const tabSignup = document.getElementById('tabSignup');
  const tabLogin = document.getElementById('tabLogin');

  if (tab === 'signup') {
    signupForm.style.display = 'block';
    loginForm.style.display = 'none';
    tabSignup.classList.add('btn-primary');
    tabSignup.classList.remove('btn-secondary');
    tabLogin.classList.add('btn-secondary');
    tabLogin.classList.remove('btn-primary');
  } else {
    signupForm.style.display = 'none';
    loginForm.style.display = 'block';
    tabLogin.classList.add('btn-primary');
    tabLogin.classList.remove('btn-secondary');
    tabSignup.classList.add('btn-secondary');
    tabSignup.classList.remove('btn-primary');
  }

  // Réinitialise le captcha à chaque changement d'onglet
  turnstileToken = null;
  if (window.turnstile) {
    try { window.turnstile.reset(); } catch (e) {}
  }
}


async function handleSignup() {

  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;

  if (!email || !password) {
    showToast(t('toast.email_password_required'), 'error');
    return;
  }

  if (password.length < 6) {
    showToast(t('toast.password_too_short'), 'error');
    return;
  }

  // Captcha si disponible (ne bloque plus si Turnstile n'a pas chargé)
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

  // Un jeton Turnstile est à usage unique : on réinitialise le widget
  // après chaque tentative, réussie ou non.
  if (window.turnstile) try { window.turnstile.reset(); } catch (e) {}
  turnstileToken = null;

  if (error) {
    authIntent = null;
    showToast('Erreur : ' + error.message, 'error');
    return;
  }

  const pendingNotice = document.getElementById('signupPendingNotice');

  if (data.session) {

    pendingNotice.style.display = 'none';
    showToast(t('toast.account_created'), 'success');

  } else {

    // Confirmation par email requise : message persistant (ne disparaît pas
    // comme un toast) tant que l'utilisateur n'a pas confirmé son adresse.
    pendingNotice.style.display = 'block';
    showToast(t('toast.account_created_pending'), 'success');

  }

  document.getElementById('signupEmail').value = '';
  document.getElementById('signupPassword').value = '';

  // Pas d'appel direct à refreshAuthUI ici : si une session est créée
  // immédiatement, le listener onAuthStateChange s'en charge en lisant
  // authIntent. S'il faut confirmer l'email, rien à faire pour l'instant.
}


function lockIdentityFields() {

  document.getElementById('firstName').readOnly = true;
  document.getElementById('country').readOnly = true;

  // age = <select> : readOnly ne fonctionne pas → disabled
  const ageEl = document.getElementById('age');
  if (ageEl) {
    ageEl.disabled = true;
    ageEl.style.opacity = '0.65';
    ageEl.style.cursor = 'not-allowed';
    ageEl.title = 'Age verrouille apres enregistrement';
  }

  document.querySelectorAll('.gender-option').forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.6';
    btn.style.cursor = 'not-allowed';
  });

  profileLocked = true;
}


function unlockIdentityFields() {

  document.getElementById('firstName').readOnly = false;
  document.getElementById('country').readOnly = false;

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

  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) {
    showToast(t('toast.login_email_password_required'), 'error');
    return;
  }

  // Captcha recommandé mais on tente quand même la connexion
  // (évite le blocage si Turnstile n'a pas encore chargé / a expiré)
  authIntent = 'login';

  let data, error;
  if (turnstileToken) {
    ({ data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken: turnstileToken }
    }));
    // Si le captcha est refusé / expiré / 400, on réessaie sans captcha
    if (error) {
      const m = String(error.message || '');
      if (/captcha|400|request|invalid/i.test(m)) {
        ({ data, error } = await supabaseClient.auth.signInWithPassword({ email, password }));
      }
    }
  } else {
    ({ data, error } = await supabaseClient.auth.signInWithPassword({ email, password }));
  }

  // Un jeton Turnstile est à usage unique
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

  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';

  const pendingNotice = document.getElementById('signupPendingNotice');
  if (pendingNotice) pendingNotice.style.display = 'none';

  // Pas d'appel direct à refreshAuthUI ici : c'est le listener
  // onAuthStateChange qui va se déclencher et lire authIntent = 'login'
  // pour rediriger vers l'accueil, sans conflit de course.
}


/** Met à jour is_online dans Supabase pour que la carte affiche vert (connecté) / rouge (hors ligne).
 *  Toi = toujours bleu côté client. Nécessite la colonne profiles.is_online (boolean). */
async function setOnlineStatus(online) {
  if (!currentUser) return;
  try {
    // update d'abord (profil existant) ; sinon upsert
    const { error } = await supabaseClient
      .from('profiles')
      .update({ is_online: !!online })
      .eq('id', currentUser.id);
    if (error) {
      await supabaseClient
        .from('profiles')
        .upsert({ id: currentUser.id, is_online: !!online }, { onConflict: 'id' });
    }
    const me = profiles.find(p => p.id === currentUser.id);
    if (me) me.is_online = !!online;
    else if (online) {
      // garantit que le compteur inclut l'utilisateur courant même sans GPS encore
      profiles.push({ id: currentUser.id, is_online: true });
    }
    if (map) renderMarkers();
    updateOnlineCount();
  } catch (e) {
    console.error('setOnlineStatus:', e);
  }
}

function updateOnlineCount() {
  const el = document.getElementById('onlineCount');
  if (!el) return;
  const n = (profiles || []).filter(p => p.is_online === true || p.online === true).length;
  el.textContent = String(n);
}

let isLocalLogout = false;

async function handleLogout(reason) {

  stopIdleWatch();
  await setOnlineStatus(false);

  // Marque une déconnexion locale pour éviter le double toast via onAuthStateChange
  isLocalLogout = true;
  currentUser = null;
  currentPlan = 'FREE';
  localStorage.removeItem('aupygo_plan');
  profileSaved = false;

  // scope: 'global' → déconnecte la session sur TOUS les appareils / onglets
  try {
    await supabaseClient.auth.signOut({ scope: 'global' });
  } catch (e) {
    try { await supabaseClient.auth.signOut(); } catch (e2) {}
  }
  isLocalLogout = false;

  unlockIdentityFields();

  // Nettoyage de l'UI profil
  document.getElementById('firstName').value = '';
  document.getElementById('age').value = '';
  document.getElementById('bio').value = '';
  document.getElementById('country').value = '';
  document.getElementById('profileName').textContent = t('profile.name_placeholder');
  document.getElementById('profileMeta').textContent = t('profile.meta_placeholder');
  document.getElementById('profileAvatar').textContent = '👤';
  if (typeof clearLanguageSelection === 'function') clearLanguageSelection();
  if (typeof updateProfileCard === 'function') updateProfileCard(null);
  if (document.getElementById('hostCountry')) document.getElementById('hostCountry').value = '';
  if (document.getElementById('stayEnd')) document.getElementById('stayEnd').value = '';
  if (document.getElementById('city')) document.getElementById('city').value = '';
  selectedGender = null;
  document.querySelectorAll('.gender-option').forEach(b => b.classList.remove('selected'));
  selectedHobbies.length = 0;
  document.querySelectorAll('.hobby').forEach(b => b.classList.remove('selected'));
  document.getElementById('otherHobby').style.display = 'none';
  document.getElementById('otherHobby').value = '';
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

  // On détecte la transition "pas connecté -> connecté" : compte tout juste
  // créé, connexion, ou retour sur la page après confirmation de l'email.
  const justLoggedIn = !currentUser && !!user;

  currentUser = user;

  const loggedOut = document.getElementById('authLoggedOut');
  const loggedIn = document.getElementById('authLoggedIn');

  if (user) {

    loggedOut.style.display = 'none';
    loggedIn.style.display = 'block';
    document.getElementById('authUserEmail').textContent = user.email;

    // Charge le profil déjà sauvegardé pour ce compte, s'il existe
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('subscription, display_name, age, gender, country, bio, interests, identity_locked, languages, other_language, host_country, stay_end, city')
      .eq('id', user.id)
      .maybeSingle();

    if (profile && profile.subscription) {
      currentPlan = profile.subscription;
      localStorage.setItem('aupygo_plan', currentPlan);
      updatePlanUI();
    }

    // === Chargement du profil ===
    if (profile && profile.identity_locked === true) {
      // Profil déjà créé et verrouillé
      document.getElementById('firstName').value = profile.display_name || '';
      document.getElementById('age').value = profile.age || '';
      document.getElementById('country').value = profile.country || '';
      document.getElementById('bio').value = profile.bio || '';
      if (document.getElementById('city')) document.getElementById('city').value = profile.city || '';
      if (document.getElementById('hostCountry')) document.getElementById('hostCountry').value = profile.host_country || '';
      if (document.getElementById('stayEnd')) document.getElementById('stayEnd').value = profile.stay_end || '';
      if (document.getElementById('otherLanguage')) document.getElementById('otherLanguage').value = profile.other_language || '';

      if (profile.gender) {
        selectedGender = profile.gender;
        document.getElementById('profileAvatar').textContent = profile.gender === 'Homme' ? '👨' : '👩';
        document.querySelectorAll('.gender-option').forEach(btn => {
          btn.classList.toggle('selected', btn.textContent.trim().includes(profile.gender));
        });
      }

      // Restaure les hobbies
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
      document.getElementById('otherHobby').style.display =
        selectedHobbies.includes('Autre') ? 'block' : 'none';

      // Restaure les langues
      clearLanguageSelection();
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

      updateProfileCard({
        name: profile.display_name,
        age: profile.age,
        hostCountry: profile.host_country,
        stayEnd: profile.stay_end,
        languages: selectedLanguages.slice(),
        otherLang: profile.other_language,
        hobbies: selectedHobbies.slice()
      });

      profileSaved = true;
      lockIdentityFields();

    } else {
      // Pas encore de profil verrouillé
      if (profile) {
        document.getElementById('firstName').value = profile.display_name || '';
        document.getElementById('age').value = profile.age || '';
        document.getElementById('country').value = profile.country || '';
        document.getElementById('bio').value = profile.bio || '';
        if (profile.gender) {
          selectedGender = profile.gender;
          document.getElementById('profileAvatar').textContent = profile.gender === 'Homme' ? '👨' : '👩';
        }
      }

      profileSaved = false;
      unlockIdentityFields();

      // Réinitialise les hobbies
      selectedHobbies.length = 0;
      document.querySelectorAll('.hobby').forEach(b => b.classList.remove('selected'));
      document.getElementById('otherHobby').style.display = 'none';
    }

    // Mise à jour de la navigation AVANT de naviguer
    updateNavVisibility();

    if (justLoggedIn) {
      const pendingNotice = document.getElementById('signupPendingNotice');
      if (pendingNotice) pendingNotice.style.display = 'none';

      go(redirectPage);

      if (redirectPage === 'home') {
        showToast(t('toast.login_success'), 'success');
      } else {
        showToast(
          profile && profile.display_name
            ? t('toast.welcome_back')
            : t('toast.complete_profile'),
          'success'
        );
      }

      // Après validation email / première connexion : proposer la géoloc (~1 km)
      // dès l’arrivée sur le profil (ou peu après sur l’accueil)
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

      // Marque le profil comme en ligne (vert sur la carte)
      setOnlineStatus(true);
      startIdleWatch();
    }

  } else {
    // Pas connecté
    loggedOut.style.display = 'block';
    loggedIn.style.display = 'none';
    profileSaved = false;
    unlockIdentityFields();
    updateNavVisibility();
  }
}


/* =========================
   VISIBILITÉ DE LA NAVIGATION
========================= */

// Tant qu'on n'est pas inscrit/connecté, seuls Accueil et Abonnement sont visibles.
// Invité : Accueil + Carte (aperçu mondial) + Abonnement uniquement
const RESTRICTED_NAV_PAGES = ['events','reconnect','messages','profile'];
const GUEST_ALLOWED_PAGES = ['home','map','plans'];

function getActivePage() {
  const activePage = document.querySelector('.page.active');
  return activePage ? activePage.id : 'home';
}

function updateNavVisibility() {

  document.querySelectorAll('nav button').forEach(b => {

    const page = b.dataset.nav;

    if (RESTRICTED_NAV_PAGES.includes(page)) {
      b.style.display = currentUser ? 'flex' : 'none';
    } else {
      // home, map, plans : toujours visibles (même non connecté)
      b.style.display = 'flex';
    }

  });

  // Si on est sur une page réservée et qu'on n'est plus connecté → accueil
  if (!currentUser && RESTRICTED_NAV_PAGES.includes(getActivePage())) {
    go('home');
  }

}


/* =========================
   FORFAITS
========================= */

function updatePlanUI() {

  document.getElementById('headerPlan').textContent = currentPlan;

  ['FREE','STANDARD','PREMIUM'].forEach(p => {

    const card = document.getElementById('plan-' + p);
    const badge = document.getElementById('badge-' + p);

    if(card) {
      card.classList.toggle('active-plan', p === currentPlan);
    }

    if(badge) {
      badge.style.display = p === currentPlan ? 'block' : 'none';
    }

  });


  // Agenda communauté (onglet Sortir)
  const agendaBox = document.getElementById('agendaBox');
  const agendaNotice = document.getElementById('agendaNotice');

  if(currentPlan === 'FREE') {
    if (agendaBox) agendaBox.classList.add('locked');
    if (agendaNotice) agendaNotice.innerHTML = t('events.agenda_locked');
  } else {
    if (agendaBox) agendaBox.classList.remove('locked');
    if (agendaNotice) agendaNotice.innerHTML = t('events.agenda_unlocked') + ' (' + currentPlan + ')';
  }

  // Agenda personnel (page Profil) — aussi réservé STANDARD+
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


  const messagesBox = document.getElementById('messagesBox');
  const messagesNotice = document.getElementById('messagesNotice');

  if(currentPlan !== 'PREMIUM') {
    messagesBox.style.opacity = '0.5';
    messagesBox.style.pointerEvents = 'none';
    messagesNotice.innerHTML = t('messages.notice_locked');
  } else {
    messagesBox.style.opacity = '1';
    messagesBox.style.pointerEvents = 'auto';
    messagesNotice.innerHTML = t('messages.notice_unlocked') + ' (PREMIUM)';
  }


  const isFree = currentPlan === 'FREE';

  const freeNotice = document.getElementById('eventsFreeNotice');

  if(freeNotice) {
    freeNotice.style.display = isFree ? 'block' : 'none';
  }


  document.querySelectorAll('#eventGrid .event').forEach(event => {

    const detail = event.querySelector('[data-detail]');
    const locked = event.querySelector('[data-locked]');
    const joinBtn = event.querySelector('.event-join');
    const upgradeBtn = event.querySelector('.event-upgrade');

    if(isFree) {

      if(detail) detail.style.display = 'none';
      if(locked) locked.style.display = 'block';
      if(joinBtn) joinBtn.style.display = 'none';
      if(upgradeBtn) upgradeBtn.style.display = 'block';

    } else {

      if(detail) detail.style.display = 'block';
      if(locked) locked.style.display = 'none';
      if(joinBtn) joinBtn.style.display = 'inline-block';
      if(upgradeBtn) upgradeBtn.style.display = 'none';

    }

  });


  // === SE RETROUVER (amis) ===
  const reconnectFreeNotice = document.getElementById('reconnectFreeNotice');
  if (reconnectFreeNotice) {
    reconnectFreeNotice.style.display = isFree ? 'block' : 'none';
  }

  document.querySelectorAll('.friend-card').forEach(card => {
    const sortie = card.querySelector('.friend-sortie');
    const msgBtn = card.querySelector('.friend-msg-btn');
    const msgLocked = card.querySelector('.friend-msg-locked');

    // Sorties en commun : STANDARD et PREMIUM (jamais l’agenda personnel)
    if (sortie) {
      sortie.style.display = (currentPlan === 'FREE') ? 'none' : 'block';
    }

    // Messages : uniquement PREMIUM
    if (msgBtn && msgLocked) {
      if (currentPlan === 'PREMIUM') {
        msgBtn.style.display = 'block';
        msgLocked.style.display = 'none';
      } else {
        msgBtn.style.display = 'none';
        msgLocked.style.display = 'block';
      }
    }
  });


  applyMapRestrictions();
  if (map) renderMarkers(); // met à jour les marqueurs selon le forfait

}


/* =========================
   CARTE
========================= */

function kmToDegrees(km) {
  return km / 111;
}


function getMaxBoundsForPlan() {

  const radiusKm = RADIUS[currentPlan];

  if(!radiusKm) return null;

  const d = kmToDegrees(radiusKm);

  const { lat, lng } = userLocation;

  return L.latLngBounds(
    [lat - d, lng - d],
    [lat + d, lng + d]
  );
}


function getDefaultZoomForPlan() {

  if(currentPlan === 'FREE') return 11;
  if(currentPlan === 'STANDARD') return 5;

  return 2;
}


function applyMapRestrictions() {

  if(!map) return;

  const btnAround = document.getElementById('btnAround');
  const btnRegion = document.getElementById('btnRegion');
  const btnWorld = document.getElementById('btnWorld');
  const mapNotice = document.getElementById('mapPlanNotice');

  // Toujours nettoyer les classes active avant de réappliquer
  [btnAround, btnRegion, btnWorld].forEach(b => {
    if (b) b.classList.remove('active');
  });

  // ——— Visiteur non connecté : aperçu carte mondiale (lecture seule) ———
  if (!currentUser) {
    if (mapNotice) {
      mapNotice.innerHTML = t('map.notice_guest');
    }
    if (btnAround) {
      btnAround.disabled = true;
      btnAround.title = t('map.login_required');
    }
    if (btnRegion) {
      btnRegion.disabled = true;
      btnRegion.title = t('map.login_required');
    }
    if (btnWorld) {
      btnWorld.disabled = false;
      btnWorld.classList.add('active');
      btnWorld.title = '';
    }
    map.setMaxBounds(null);
    map.setMinZoom(2);
    map.setMaxZoom(12);
    map.setView([20, 0], 2);
    return;
  }

  if(currentPlan === 'FREE') {

    if (mapNotice) mapNotice.innerHTML = t('map.notice_free');

    btnAround.disabled = false;
    btnAround.classList.add('active');
    btnAround.title = '';

    btnRegion.disabled = true;
    btnRegion.title = t('map.region_locked');

    btnWorld.disabled = true;
    btnWorld.title = t('map.world_locked');

  }
  else if(currentPlan === 'STANDARD') {

    if (mapNotice) mapNotice.innerHTML = t('map.notice_standard');

    btnAround.disabled = false;
    btnAround.title = '';

    btnRegion.disabled = false;
    btnRegion.classList.add('active');
    btnRegion.title = '';

    btnWorld.disabled = true;
    btnWorld.title = t('map.world_locked');

  }
  else {

    if (mapNotice) mapNotice.innerHTML = t('map.notice_premium');

    btnAround.disabled = false;
    btnAround.title = '';
    btnRegion.disabled = false;
    btnRegion.title = '';

    btnWorld.disabled = false;
    btnWorld.classList.add('active');
    btnWorld.title = '';

  }


  const bounds = getMaxBoundsForPlan();

  if(bounds) {

    map.setMaxBounds(bounds);
    map.setMinZoom(getDefaultZoomForPlan() - 1);
    map.setMaxZoom(14);

    if(!bounds.contains(map.getCenter())) {
      map.setView([userLocation.lat, userLocation.lng], getDefaultZoomForPlan());
    }

  } else {

    map.setMaxBounds(null);
    map.setMinZoom(2);
    map.setMaxZoom(18);

  }

}


/* =========================
   PLANS
========================= */

async function selectPlan(plan) {

  if (!currentUser) {
    showToast(t('plans.need_login'), 'error');
    document.getElementById('authCard').scrollIntoView({ behavior:'smooth', block:'center' });
    return;
  }

  currentPlan = plan;
  localStorage.setItem('aupygo_plan', plan);
  updatePlanUI();

  const { error } = await supabaseClient
    .from('profiles')
    .upsert({ id: currentUser.id, subscription: plan }, { onConflict:'id' });

  if (error) {
    console.error(error);
    showToast('Erreur lors de la sauvegarde du forfait : ' + error.message, 'error');
    return;
  }

  if(plan === 'FREE') {
    showToast(t('plans.free_active'), 'success');
  }
  else if(plan === 'STANDARD') {
    showToast(t('plans.standard_active'), 'success');
  }
  else {
    showToast(t('plans.premium_active'), 'success');
  }

}


/* =========================
   TOAST
========================= */

function showToast(msg,type) {

  const c = document.getElementById('toastContainer');

  const t = document.createElement('div');

  t.className = 'toast' + (type ? ' ' + type : '');

  t.textContent = msg;

  c.appendChild(t);

  setTimeout(() => {
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 300);
  },3000);

}


/* =========================
   NAVIGATION
========================= */

function go(page) {

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  const el = document.getElementById(page);

  if(el) el.classList.add('active');


  document.querySelectorAll('nav button').forEach(b => {

    b.classList.remove('active');

    if(b.dataset.nav === page) {
      b.classList.add('active');
    }

  });


  window.scrollTo({ top:0, behavior:'smooth' });


  // La carte n’existe que dans l’onglet Carte
  if (page === 'map' && map) {
    setTimeout(() => {
      map.invalidateSize();
      applyMapRestrictions(); // invité → vue monde ; connecté → selon forfait
      renderMarkers();
      if (!currentUser) {
        map.setView([20, 0], 2);
      } else {
        map.setView([userLocation.lat, userLocation.lng], getDefaultZoomForPlan());
      }
    }, 200);
  }

  if (page === 'profile') {
    if (profileSaved) {
      lockIdentityFields();
    } else {
      unlockIdentityFields();
    }
  }

  if (page === 'messages') {
    loadFriendsForMessaging();
    if (typeof applyTranslations === 'function') applyTranslations();
    if (typeof refreshMessagesStaticTexts === 'function') refreshMessagesStaticTexts();
  }

}


/* =========================
   LOCALISATIONS (chargement Supabase)
========================= */

async function loadProfiles() {
  try {
    // Charge tous les profils visibles (RLS). Les marqueurs carte n'utilisent
    // que ceux avec approx_lat/lng ; le compteur "connectés" utilise is_online.
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('id, display_name, gender, country, city, approx_lat, approx_lng, is_online, plan, bio, birth_year');

    if (error) {
      console.error('Erreur chargement profils:', error);
      profiles = [];
      updateOnlineCount();
      return;
    }

    profiles = data || [];
    console.log('[AUPYGO] Profils chargés:', profiles.length,
      '| en ligne:', profiles.filter(p => p.is_online === true).length,
      '| avec GPS:', profiles.filter(p => p.approx_lat != null && p.approx_lng != null).length);
    updateOnlineCount();

    if (map && markersLayer) {
      renderMarkers();
    }
  } catch (e) {
    console.error('loadProfiles:', e);
    profiles = [];
    updateOnlineCount();
  }
}


/* =========================
   INITIALISATION CARTE
========================= */

function initMap() {

  map = L.map('mapCanvas', {
    zoomControl:false,
    minZoom:2,
    maxBoundsViscosity:1.0
  }).setView([userLocation.lat, userLocation.lng], getDefaultZoomForPlan());


  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:'&copy; OpenStreetMap'
  }).addTo(map);


  markersLayer = L.layerGroup().addTo(map);

  // Clic sur la carte → popup de consentement géoloc (~1 km) si pas encore activée
  map.on('click', function () {
    onMapClickForGeo();
  });

  renderMarkers();
  applyMapRestrictions();

}


function createIcon(gender, kind) {
  // kind: 'me' | 'online' | 'offline'
  const emoji = gender === 'Homme' ? '👨' : (gender === 'Femme' ? '👩' : '👤');
  const cls = 'aupy-marker ' + (kind || 'offline');
  return L.divIcon({
    className: '',
    html: '<div class="' + cls + '">' + emoji + '<span class="status-dot"></span></div>',
    iconSize: [44, 44],
    iconAnchor: [22, 44]
  });
}

/** Statut en ligne : champ optionnel is_online / online, sinon hors ligne.
 *  Toi-même = toujours « me » (bleu), indépendamment du statut. */
function getMarkerKind(member) {
  if (currentUser && member.id === currentUser.id) return 'me';
  const online = member.is_online === true || member.online === true;
  return online ? 'online' : 'offline';
}


function renderMarkers() {
  if (!markersLayer) return;
  markersLayer.clearLayers();

  // Invité / PREMIUM : pas de limite de distance → vue mondiale
  // Connecté FREE/STANDARD : filtre selon RADIUS
  const maxKm = (!currentUser) ? null : RADIUS[currentPlan];
  // Uniquement les profils avec position approximative pour la carte
  const list = (Array.isArray(profiles) ? profiles : []).filter(p =>
    p && p.approx_lat != null && p.approx_lng != null &&
    !Number.isNaN(Number(p.approx_lat)) && !Number.isNaN(Number(p.approx_lng))
  );

  // Si connecté + position connue, s'assurer que mon profil apparaît (même si pas encore en base)
  if (currentUser && userLocation.hasRealGeo) {
    const already = list.some(p => p.id === currentUser.id);
    if (!already) {
      list.push({
        id: currentUser.id,
        approx_lat: userLocation.lat,
        approx_lng: userLocation.lng,
        gender: selectedGender || null,
        display_name: (document.getElementById('firstName') || {}).value || 'Moi',
        is_online: true
      });
    }
  }

  list.forEach(member => {
    if (member.approx_lat == null || member.approx_lng == null) return;

    const isMe = currentUser && member.id === currentUser.id;

    // Filtre distance : toujours afficher mon avatar ; les autres selon forfait
    // Invité : aucun filtre (aperçu mondial)
    if (!isMe && maxKm != null) {
      const d = distanceKm(
        userLocation.lat, userLocation.lng,
        member.approx_lat, member.approx_lng
      );
      if (d > maxKm) return;
    }

    // Si c'est moi et que j'ai une position locale plus fraîche, l'utiliser
    let lat = member.approx_lat;
    let lng = member.approx_lng;
    if (isMe && userLocation.hasRealGeo) {
      lat = userLocation.lat;
      lng = userLocation.lng;
    }

    const kind = getMarkerKind(member);
    const m = L.marker(
      [lat, lng],
      { icon: createIcon(member.gender, kind), zIndexOffset: isMe ? 1000 : 0 }
    );

    m.on('click', () => {
      if (!currentUser) {
        showToast(t('map.login_required'), 'error');
        go('plans');
        return;
      }
      if (isMe) {
        showToast('📍 C’est toi (position approx. ~1 km)', 'success');
        return;
      }
      openMemberProfile(member.id);
    });
    markersLayer.addLayer(m);
  });
}


function openMemberProfile(memberId) {
  const raw = profiles.find(m => m.id === memberId);
  if (!raw) return;

  // Normalise les champs DB → structure attendue par la modale
  const member = {
    id: raw.id,
    name: raw.display_name || 'AUPYGO',
    age: raw.age,
    gender: raw.gender,
    plan: (raw.subscription || 'FREE').toUpperCase(),
    city: raw.city || '',
    origin: raw.country || '',
    host: raw.host_country || '',
    stayEnd: raw.stay_end || '',
    bio: raw.bio || '',
    languages: (raw.languages || '').split(',').map(s => s.trim()).filter(Boolean),
    hobbies: (raw.interests || '').split(',').map(s => s.trim()).filter(Boolean),
    online: raw.is_online === true || raw.online === true
  };

  const overlay = document.getElementById('memberModalOverlay');
  const box = document.getElementById('memberModal');
  if (!overlay || !box) return;

  const emoji = member.gender === 'Homme' ? '👨' : '👩';
  const plan = member.plan;

  // Affichage selon le forfait DU PROFIL consulté :
  // FREE     → fiche seule (pas de voyant)
  // STANDARD → fiche + voyant en ligne
  // PREMIUM  → fiche + voyant + bouton Message
  const showOnline = (plan === 'STANDARD' || plan === 'PREMIUM');
  const showMessage = (plan === 'PREMIUM');

  // Demande d'ami : réservée aux visiteurs STANDARD / PREMIUM (pas FREE)
  const canSendFriendRequest = (currentPlan === 'STANDARD' || currentPlan === 'PREMIUM');

  let onlineHtml = '';
  if (showOnline) {
    if (member.online) {
      onlineHtml = '<div class="member-online"><span class="dot"></span> En ligne</div>';
    } else {
      onlineHtml = '<div class="member-online" style="color:#6b7280;background:#f3f4f6;border-color:#e5e7eb"><span class="dot" style="background:#9ca3af;box-shadow:none"></span> Hors ligne</div>';
    }
  }

  const langs = (member.languages || []).map(c => {
    return (typeof LANG_LABEL !== 'undefined' && LANG_LABEL[c]) ? LANG_LABEL[c] : c;
  }).join(' · ');

  let stayTxt = '';
  if (member.stayEnd) {
    const parts = String(member.stayEnd).split('-');
    if (parts.length >= 2) {
      const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
      const mi = parseInt(parts[1], 10) - 1;
      stayTxt = (months[mi] || parts[1]) + ' ' + parts[0];
    } else {
      stayTxt = member.stayEnd;
    }
  }

  const hobbyEmojis = (member.hobbies || []).map(h => {
    const e = (typeof HOBBY_EMOJI !== 'undefined' && HOBBY_EMOJI[h]) ? HOBBY_EMOJI[h] : '✨';
    return '<span class="hobby-emoji" title="' + h + '">' + e + '</span>';
  }).join('');

  let msgBtn = '';
  if (showMessage) {
    if (currentPlan === 'PREMIUM') {
      msgBtn = '<button type="button" class="member-msg-btn" onclick="messageMember(\'' + member.id + '\')">💬 Message</button>';
    } else {
      msgBtn = '<button type="button" class="member-msg-btn member-msg-btn-disabled" onclick="showToast(t(\'messages.send_locked\'), \'error\'); closeMemberProfile(); go(\'plans\');">💬 Message</button>';
    }
  }

  const friendBtn = canSendFriendRequest
    ? '<button type="button" class="member-friend-btn" onclick="sendFriendRequestToMember(\'' + member.id + '\')">🤝 Demande d\u2019ami</button>'
    : '<p style="margin-top:12px;font-size:12px;color:#9ca3af">Consultation uniquement · passe en STANDARD pour envoyer une demande d\u2019ami</p>';

  box.innerHTML =
    '<button type="button" class="member-modal-close" onclick="closeMemberProfile()" aria-label="Fermer">×</button>' +
    onlineHtml +
    '<div class="member-avatar">' + emoji + '</div>' +
    '<h3>' + member.name + '</h3>' +
    '<p class="member-badge">🛡️ AUPYGO certifié · ' + (member.age || '?') + ' ans</p>' +
    (member.host ? '<div class="member-info">🏡 Pays d\'accueil : <strong>' + member.host + '</strong></div>' : '') +
    (member.origin ? '<div class="member-info">🌍 Origine : <strong>' + member.origin + '</strong></div>' : '') +
    (stayTxt ? '<div class="member-info">📅 Fin du séjour : <strong>' + stayTxt + '</strong></div>' : '') +
    (langs ? '<div class="member-info">🗣️ ' + langs + '</div>' : '') +
    (member.city ? '<div class="member-info">📍 ' + member.city + ' <span style="color:#999;font-size:12px">(~1 km)</span></div>' : '') +
    (member.bio ? '<div class="member-info" style="margin-top:8px;color:#555">' + member.bio + '</div>' : '') +
    '<div class="member-hobbies-row">' + hobbyEmojis + msgBtn + '</div>' +
    friendBtn;

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeMemberProfile() {
  const overlay = document.getElementById('memberModalOverlay');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}


function messageMember(memberId) {
  const raw = profiles.find(m => m.id === memberId);
  if (!raw) return;
  const name = raw.display_name || 'AUPYGO';
  // Destinataire PREMIUM (sinon pas de bouton). Expéditeur doit être PREMIUM aussi.
  if (currentPlan !== 'PREMIUM') {
    showToast(t('messages.send_locked'), 'error');
    closeMemberProfile();
    go('plans');
    return;
  }
  closeMemberProfile();
  go('messages');
  showToast(t('messages.chat_with') + ' ' + name, 'success');
}


function sendFriendRequestToMember(memberId) {
  if (!currentUser) {
    showToast(t('toast.friend_login_required'), 'error');
    closeMemberProfile();
    go('plans');
    return;
  }
  if (currentPlan === 'FREE') {
    showToast("🔒 Les demandes d’ami sont disponibles à partir de STANDARD", "error");
    closeMemberProfile();
    go('plans');
    return;
  }
  const raw = profiles.find(m => m.id === memberId);
  const name = raw ? (raw.display_name || '') : '';
  showToast(t('toast.friend_request_sent') + ' ' + name + ' 🤝', 'success');
  closeMemberProfile();
}


function zoomIn() {
  if(map) map.zoomIn();
}


function zoomOut() {
  if(map) map.zoomOut();
}


function resetMap() {
  if (!map) return;

  // Si pas encore de géoloc, popup de consentement
  if (!userLocation.hasRealGeo) {
    showGeoConsent((ok) => {
      if (ok && map) {
        map.setView([userLocation.lat, userLocation.lng], getDefaultZoomForPlan());
        renderMarkers();
      }
    });
    return;
  }

  map.setView([userLocation.lat, userLocation.lng], getDefaultZoomForPlan());
  renderMarkers();
}


function mapMode(mode, btn) {

  // Invité : uniquement vue Monde (aperçu)
  if (!currentUser) {
    if (mode !== 'world') {
      showToast(t('map.login_required'), 'error');
      go('plans');
      return;
    }
    document.querySelectorAll('.map-filter button').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    if (map) {
      map.setView([20, 0], 2);
      renderMarkers();
    }
    return;
  }

  if (currentPlan === 'FREE' && mode !== 'around') {
    showToast(t('toast.map_region_locked'), 'error');
    return;
  }

  if (currentPlan === 'STANDARD' && mode === 'world') {
    showToast(t('toast.map_world_locked'), 'error');
    return;
  }

  document.querySelectorAll('.map-filter button').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  // "Autour de moi" → popup de consentement puis géoloc approximative
  if (mode === 'around') {
    if (!userLocation.hasRealGeo) {
      showGeoConsent((ok) => {
        if (ok && map) {
          map.setView([userLocation.lat, userLocation.lng], 11);
          applyMapRestrictions();
          renderMarkers();
        }
      });
    } else if (map) {
      map.setView([userLocation.lat, userLocation.lng], 11);
      renderMarkers();
    }
    return;
  }

  if (mode === 'region' && map) {
    map.setView([userLocation.lat, userLocation.lng], 6);
    renderMarkers();
  } else if (mode === 'world' && map) {
    map.setView([20, 0], 2);
    renderMarkers();
  }
}


function openCity(city) {
  const first = profiles.find(m => m.city === city);
  if (first) openMemberProfile(first.id);
  else showToast(t('toast.city_profiles') + ' ' + city, 'success');
}

function sendFriendRequest(city) {
  if (!currentUser) {
    showToast(t('toast.friend_login_required'), 'error');
    go('plans');
    return;
  }
  if (currentPlan === 'FREE') {
    showToast("🔒 Les demandes d’ami sont disponibles à partir de STANDARD", "error");
    go('plans');
    return;
  }
  showToast(t('toast.friend_request_sent') + ' ' + city + ' 🤝', 'success');
}

// Affiche uniquement les sorties en commun avec un ami.
// L’agenda personnel AUPYGO reste toujours privé.
function showSharedEvents(friendName) {
  if (currentPlan === 'FREE') {
    showToast(t('reconnect.shared_locked'), 'error');
    go('plans');
    return;
  }
  // Plus de données fictives : les sorties en commun viendront de la table events/participations
  showToast(t('reconnect.shared_with') + ' ' + friendName + ' : ' + t('reconnect.shared_none'), 'success');
}


/* =========================
   PROFIL
========================= */

let selectedGender = null;


function selectGender(btn,gender) {

  if (profileLocked) return;

  document.querySelectorAll('.gender-option').forEach(b => b.classList.remove('selected'));

  btn.classList.add('selected');
  selectedGender = gender;

  document.getElementById('profileAvatar').textContent = gender === 'Homme' ? '👨' : '👩';

}


const selectedHobbies = [];



const selectedLanguages = [];

const HOBBY_EMOJI = {
  'Plage': '🏖️', 'Lire': '📚', 'Films': '🎬', 'Voyager': '✈️', 'Cuisine': '🍳',
  'Sport': '🏋️', 'Danse': '💃', 'Musique': '🎵', 'Photo': '📸', 'Nature': '🌿',
  'Café': '☕', 'Randonnée': '🥾', 'Animaux': '🐶', 'Art': '🎨', 'Yoga': '🧘', 'Autre': '✨'
};

const LANG_LABEL = {
  'FR': '🇫🇷 FR', 'EN': '🇬🇧 EN', 'ES': '🇪🇸 ES', 'PT': '🇧🇷 PT',
  'DE': '🇩🇪 DE', 'IT': '🇮🇹 IT', 'RU': '🇷🇺 RU', 'ZH': '🇨🇳 ZH',
  'JA': '🇯🇵 JA', 'OTHER': '✨'
};

function toggleLanguage(btn, code) {
  const i = selectedLanguages.indexOf(code);
  if (i >= 0) {
    selectedLanguages.splice(i, 1);
    btn.classList.remove('selected');
  } else {
    if (selectedLanguages.length >= 3) {
      showToast('Maximum 3 langues', 'error');
      return;
    }
    selectedLanguages.push(code);
    btn.classList.add('selected');
  }
  const otherInput = document.getElementById('otherLanguage');
  if (otherInput) {
    const hasOther = selectedLanguages.includes('OTHER');
    otherInput.style.display = hasOther ? 'block' : 'none';
    if (!hasOther) otherInput.value = '';
  }
}

function clearLanguageSelection() {
  selectedLanguages.length = 0;
  document.querySelectorAll('.lang-chip').forEach(b => b.classList.remove('selected'));
  const ol = document.getElementById('otherLanguage');
  if (ol) { ol.style.display = 'none'; ol.value = ''; }
}

function updateProfileCard(data) {
  // data: { name, age, hostCountry, stayEnd, languages, otherLang, hobbies }
  const nameEl = document.getElementById('profileName');
  const metaEl = document.getElementById('profileMeta');
  const extras = document.getElementById('profileCardExtras');
  const hostEl = document.getElementById('profileCardHost');
  const stayEl = document.getElementById('profileCardStay');
  const langsEl = document.getElementById('profileCardLangs');
  const hobbiesEl = document.getElementById('profileCardHobbies');

  if (!data || !data.name) {
    if (nameEl) nameEl.textContent = t('profile.name_placeholder');
    if (metaEl) metaEl.textContent = t('profile.meta_placeholder');
    if (extras) extras.style.display = 'none';
    return;
  }

  if (nameEl) nameEl.textContent = data.name;
  if (metaEl) {
    const agePart = data.age ? (data.age + ' ' + t('common.years')) : '';
    metaEl.innerHTML = '🛡️ <strong>AUPYGO certifié</strong>' + (agePart ? ' · ' + agePart : '');
  }

  if (extras) extras.style.display = 'block';

  if (hostEl) {
    hostEl.innerHTML = data.hostCountry
      ? '🏡 <span>Pays d\'accueil : <strong>' + data.hostCountry + '</strong></span>'
      : '';
  }
  if (stayEl) {
    let stayTxt = '';
    if (data.stayEnd) {
      // data.stayEnd = "YYYY-MM"
      const parts = String(data.stayEnd).split('-');
      if (parts.length >= 2) {
        const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
        const mi = parseInt(parts[1], 10) - 1;
        stayTxt = (months[mi] || parts[1]) + ' ' + parts[0];
      } else {
        stayTxt = data.stayEnd;
      }
      stayEl.innerHTML = '📅 <span>Fin du séjour : <strong>' + stayTxt + '</strong></span>';
    } else {
      stayEl.innerHTML = '';
    }
  }
  if (langsEl) {
    const codes = data.languages || [];
    if (codes.length) {
      const labels = codes.map(c => {
        if (c === 'OTHER') {
          return data.otherLang ? ('✨ ' + data.otherLang) : '✨ Autre';
        }
        return LANG_LABEL[c] || c;
      });
      langsEl.innerHTML = '🗣️ <span>' + labels.join(' · ') + '</span>';
    } else {
      langsEl.innerHTML = '';
    }
  }
  if (hobbiesEl) {
    const list = data.hobbies || [];
    if (list.length) {
      hobbiesEl.innerHTML = list.map(h => {
        const emoji = HOBBY_EMOJI[h] || '✨';
        return '<span class="hobby-emoji" title="' + h + '">' + emoji + '</span>';
      }).join('');
    } else {
      hobbiesEl.innerHTML = '';
    }
  }
}

function toggleHobby(btn,hobby) {

  const i = selectedHobbies.indexOf(hobby);

  if(i >= 0) {

    selectedHobbies.splice(i,1);
    btn.classList.remove('selected');

  } else {

    if(selectedHobbies.length >= 3) {
      showToast(t('profile.max_hobbies'), 'error');
      return;
    }

    selectedHobbies.push(hobby);
    btn.classList.add('selected');

  }

  document.getElementById('otherHobby').style.display =
    selectedHobbies.includes('Autre') ? 'block' : 'none';

}


async function saveProfile() {

  // Récupère l'utilisateur connecté
  const { data: { user } } = await supabaseClient.auth.getUser();

  if (!user) {
    showToast(t('profile.login_required'), 'error');
    go('plans');
    return;
  }

  const name = document.getElementById('firstName').value.trim();
  const ageValue = document.getElementById('age').value;
  const country = document.getElementById('country').value;
  const bio = document.getElementById('bio').value;

  // Première création : tous les champs identité sont obligatoires
  if (!profileSaved) {
    if (!name) {
      showToast(t('profile.first_name_error'), 'error');
      return;
    }
    if (!ageValue || Number(ageValue) < 18) {
      showToast(t('profile.age_error'), 'error');
      return;
    }
    if (!selectedGender) {
      showToast(t('profile.gender_error'), 'error');
      return;
    }
  }

  // Construction de l'objet à upsert
  // Si le profil est déjà figé, on n'envoie que les champs modifiables (bio + interests)
  // + on conserve les valeurs identité déjà présentes.
  const profile = {
    id: user.id,
    bio: bio,
    interests: selectedHobbies.join(','),
    subscription: currentPlan
  };

  if (!profileSaved) {
    // Première sauvegarde : on enregistre aussi l'identité
    profile.display_name = name;
    profile.age = Number(ageValue);
    profile.gender = selectedGender;
    profile.country = country;
    profile.city = (document.getElementById('city') || {}).value || userLocation.city;
    profile.approx_lat = userLocation.lat;
    profile.approx_lng = userLocation.lng;
    profile.avatar = selectedGender === 'Homme' ? '👨' : '👩';
    profile.identity_locked = true;
    profile.languages = selectedLanguages.join(',');
    profile.other_language = (document.getElementById('otherLanguage') || {}).value || '';
    profile.host_country = (document.getElementById('hostCountry') || {}).value || '';
    profile.stay_end = (document.getElementById('stayEnd') || {}).value || null;
  }

  const { error } = await supabaseClient
    .from('profiles')
    .upsert([profile], { onConflict:'id' });

  if (error) {
    console.error(error);
    showToast('Erreur : ' + error.message, 'error');
    return;
  }

  // Collect extra fields for card + DB
  const hostCountry = (document.getElementById('hostCountry') || {}).value || '';
  const stayEnd = (document.getElementById('stayEnd') || {}).value || '';
  const otherLangVal = (document.getElementById('otherLanguage') || {}).value || '';
  const cityVal = (document.getElementById('city') || {}).value || '';

  // Re-upsert with extra fields (second write keeps things simple for prototype)
  try {
    await supabaseClient.from('profiles').upsert({
      id: user.id,
      languages: selectedLanguages.join(','),
      other_language: otherLangVal,
      host_country: hostCountry,
      stay_end: stayEnd || null,
      city: cityVal || null,
      interests: selectedHobbies.join(','),
      bio: bio
    }, { onConflict: 'id' });
  } catch (e) { console.error(e); }

  updateProfileCard({
    name: name || document.getElementById('firstName').value.trim(),
    age: ageValue || document.getElementById('age').value,
    hostCountry: hostCountry,
    stayEnd: stayEnd,
    languages: selectedLanguages.slice(),
    otherLang: otherLangVal,
    hobbies: selectedHobbies.slice()
  });

  if (!profileSaved) {
    profileSaved = true;
    lockIdentityFields();
    showToast(t('profile.saved_first'), 'success');
  } else {
    showToast(t('profile.saved_update'), 'success');
  }

}


async function handleDeleteProfile() {

  if (!currentUser) {
    showToast(t('profile.delete_login_required'), 'error');
    return;
  }

  const confirmed = confirm(t('profile.delete_confirm'));

  if (!confirmed) return;

  const { error } = await supabaseClient
    .from('profiles')
    .delete()
    .eq('id', currentUser.id);

  if (error) {
    console.error(error);
    showToast('Erreur : ' + error.message, 'error');
    return;
  }

  // Supprime aussi le compte d'authentification (nécessite la fonction SQL
  // "delete_user" créée côté Supabase, cf. documentation du projet).
  const { error: authError } = await supabaseClient.rpc('delete_user');

  if (authError) {
    console.error(authError);
    showToast('Profil supprimé, mais erreur lors de la suppression du compte : ' + authError.message, 'error');
  }

  await supabaseClient.auth.signOut();

  currentUser = null;
  currentPlan = 'FREE';
  localStorage.removeItem('aupygo_plan');

  profileSaved = false;
  unlockIdentityFields();

  // Réinitialise le formulaire affiché à l'écran
  document.getElementById('firstName').value = '';
  document.getElementById('age').value = '';
  document.getElementById('bio').value = '';
  document.getElementById('country').value = '';
  document.getElementById('profileName').textContent = t('profile.name_placeholder');
  document.getElementById('profileMeta').textContent = t('profile.meta_placeholder');
  document.getElementById('profileAvatar').textContent = '👤';
  if (typeof clearLanguageSelection === 'function') clearLanguageSelection();
  if (typeof updateProfileCard === 'function') updateProfileCard(null);
  if (document.getElementById('hostCountry')) document.getElementById('hostCountry').value = '';
  if (document.getElementById('stayEnd')) document.getElementById('stayEnd').value = '';
  if (document.getElementById('city')) document.getElementById('city').value = '';
  selectedGender = null;
  document.querySelectorAll('.gender-option').forEach(b => b.classList.remove('selected'));
  selectedHobbies.length = 0;
  document.querySelectorAll('.hobby.selected').forEach(b => b.classList.remove('selected'));
  document.getElementById('otherHobby').style.display = 'none';
  document.getElementById('otherHobby').value = '';
  if (typeof clearLanguageSelection === 'function') clearLanguageSelection();
  if (typeof updateProfileCard === 'function') updateProfileCard(null);

  updatePlanUI();
  await refreshAuthUI();

  showToast(t('profile.deleted'), 'success');

  go('home');

}


/* =========================
   EVENEMENTS
========================= */

function joinEvent(name) {

  if(currentPlan === 'FREE') {
    showToast(t('events.join_locked'), 'error');
    return;
  }

  showToast('🎉 ' + name + ' ' + t('events.joined'), 'success');

}


function joinRestaurantEvent() {

  if(currentPlan === 'FREE') {
    showToast(t('events.join_locked'), 'error');
    return;
  }

  showToast(t('events.restaurant_confirm'));

}


function paidEvent() {

  if(currentPlan === 'FREE') {
    showToast(t('events.special_locked'), 'error');
    return;
  }

  showToast(t('events.special_soon'));

}


/* =========================
   MESSAGES
========================= */


/** Ré-applique les textes fixes de la messagerie (au cas où le DOM a été régénéré). */
function refreshMessagesStaticTexts() {
  const map = [
    ['#conversationList .conv-sidebar-header span', 'messages.conversations'],
    ['#conversationList .btn-create-group', 'messages.create_group'],
    ['#convFriendsSection .conv-section-label', 'messages.friends_label'],
    ['#convGroupsSection .conv-section-label', 'messages.groups_label'],
    ['#sendMsgBtn', 'messages.send'],
  ];
  map.forEach(([sel, key]) => {
    const el = document.querySelector(sel);
    if (el) el.textContent = t(key);
  });
  const input = document.getElementById('messageInput');
  if (input) input.placeholder = t('messages.write_placeholder') || t('messages.input_placeholder') || input.placeholder;

  // Placeholder chat si aucune conversation active
  if (!activeConversation) {
    const header = document.getElementById('chatHeader');
    if (header) header.textContent = t('messages.select_conversation');
    const box = document.getElementById('chatMessages');
    if (box && box.querySelector('.chat-placeholder')) {
      box.innerHTML = '<div class="chat-placeholder"><div style="font-size:40px;margin-bottom:8px">💬</div><p>' +
        (t('messages.pick_to_start') || '') + '</p></div>';
    }
  }
  // Empty states amis / groupes
  const fl = document.getElementById('convFriendsList');
  if (fl && (!myFriends || !myFriends.length)) {
    fl.innerHTML = '<p class="conv-empty">' + (t('messages.no_friends') || '') + '</p>';
  }
  const gl = document.getElementById('convGroupsList');
  if (gl && (!myGroups || !myGroups.length)) {
    gl.innerHTML = '<p class="conv-empty">' + (t('messages.no_groups') || '') + '</p>';
  }
  // Modal groupe
  const modalTitle = document.querySelector('#createGroupOverlay h3');
  if (modalTitle) modalTitle.textContent = t('messages.create_group_title');
  const modalHint = document.querySelector('#createGroupOverlay p');
  if (modalHint) modalHint.textContent = t('messages.create_group_hint');
  const createBtn = document.querySelector('#createGroupOverlay .btn-primary');
  if (createBtn) createBtn.textContent = t('messages.create_group_btn');
}

/* =========================
   MESSAGERIE (amis + groupes max 5)
========================= */

let activeConversation = null; // { type: 'dm'|'group', id, name }
let myFriends = [];            // profils amis acceptés (réels)
let myGroups = [];             // groupes locaux / Supabase
let groupPickIds = [];         // sélection dans le modal (max 4 + toi = 5)

async function loadFriendsForMessaging() {
  // Tant que la table friendships n'existe pas, liste vide (plus de profils fictifs)
  myFriends = [];
  try {
    // Quand la table sera prête :
    // const { data } = await supabaseClient.from('friendships').select('friend:friend_id(*)').eq('user_id', currentUser.id).eq('status','accepted');
    // myFriends = (data || []).map(r => r.friend).filter(Boolean);
  } catch (e) {
    console.error('loadFriendsForMessaging:', e);
  }
  renderConversationSidebar();
  renderGroupFriendsPick();
}

function renderConversationSidebar() {
  const friendsList = document.getElementById('convFriendsList');
  const groupsList = document.getElementById('convGroupsList');
  if (!friendsList || !groupsList) return;

  if (!myFriends.length) {
    friendsList.innerHTML = '<p class="conv-empty">' + (t('messages.no_friends') || 'Aucun ami pour discuter. Ajoute des amis depuis la carte.') + '</p>';
  } else {
    friendsList.innerHTML = myFriends.map(f => {
      const emoji = f.gender === 'Homme' ? '👨' : '👩';
      const online = f.is_online === true || f.online === true;
      const active = activeConversation && activeConversation.type === 'dm' && activeConversation.id === f.id ? ' active' : '';
      return (
        '<div class="conversation' + active + '" onclick="openConversation(\'dm\',\'' + f.id + '\',\'' + (f.display_name || 'Ami').replace(/'/g, "\\'") + '\')">' +
          '<div class="conv-avatar">' + emoji + '<span class="conv-status-dot ' + (online ? 'online' : 'offline') + '"></span></div>' +
          '<div class="conv-meta"><div class="conv-name">' + (f.display_name || 'Ami') + '</div>' +
          '<div class="conv-preview">' + (online ? (t('messages.online') || 'En ligne') : (t('messages.offline') || 'Hors ligne')) + '</div></div>' +
        '</div>'
      );
    }).join('');
  }

  if (!myGroups.length) {
    groupsList.innerHTML = '<p class="conv-empty">' + (t('messages.no_groups') || 'Aucun groupe. Crée-en un (max 5 personnes).') + '</p>';
  } else {
    groupsList.innerHTML = myGroups.map(g => {
      const active = activeConversation && activeConversation.type === 'group' && activeConversation.id === g.id ? ' active' : '';
      return (
        '<div class="conversation' + active + '" onclick="openConversation(\'group\',\'' + g.id + '\',\'' + (g.title || 'Groupe').replace(/'/g, "\\'") + '\')">' +
          '<div class="conv-avatar group">👥</div>' +
          '<div class="conv-meta"><div class="conv-name">' + (g.title || 'Groupe') + '</div>' +
          '<div class="conv-preview">' + (g.memberIds ? g.memberIds.length : 0) + ' membres</div></div>' +
        '</div>'
      );
    }).join('');
  }
}

function openConversation(type, id, name) {
  if (currentPlan !== 'PREMIUM') {
    showToast(t('messages.send_locked'), 'error');
    go('plans');
    return;
  }
  activeConversation = { type, id, name };
  const header = document.getElementById('chatHeader');
  if (header) header.textContent = (type === 'group' ? '👥 ' : '💬 ') + name;
  const box = document.getElementById('chatMessages');
  if (box) {
    box.innerHTML = '<div class="chat-placeholder"><p>' + (t('messages.chat_with') || 'Conversation avec') + ' <strong>' + name + '</strong>.</p><p style="font-size:13px;margin-top:6px">' + (t('messages.sync_hint') || 'Les messages seront synchronisés avec Supabase.') + '</p></div>';
  }
  const input = document.getElementById('messageInput');
  const btn = document.getElementById('sendMsgBtn');
  if (input) { input.disabled = false; input.focus(); }
  if (btn) btn.disabled = false;
  renderConversationSidebar();
}

function sendMessage() {
  if (currentPlan !== 'PREMIUM') {
    showToast(t('messages.send_locked'), 'error');
    return;
  }
  if (!activeConversation) {
    showToast(t('messages.select_first') || 'Sélectionne une conversation d’abord', 'error');
    return;
  }
  const input = document.getElementById('messageInput');
  if (!input || !input.value.trim()) return;

  const text = input.value.trim();
  const box = document.getElementById('chatMessages');
  if (box) {
    const placeholder = box.querySelector('.chat-placeholder');
    if (placeholder) box.innerHTML = '';
    const bubble = document.createElement('div');
    bubble.className = 'bubble me';
    bubble.textContent = text;
    box.appendChild(bubble);
    box.scrollTop = box.scrollHeight;
  }
  // TODO Supabase : insert into messages (conversation_id, sender_id, body)
  showToast(t('messages.sent'), 'success');
  input.value = '';
}

function openCreateGroupModal() {
  if (currentPlan !== 'PREMIUM') {
    showToast(t('messages.send_locked'), 'error');
    go('plans');
    return;
  }
  groupPickIds = [];
  const title = document.getElementById('groupTitleInput');
  if (title) title.value = '';
  renderGroupFriendsPick();
  const overlay = document.getElementById('createGroupOverlay');
  if (overlay) {
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

function closeCreateGroupModal() {
  const overlay = document.getElementById('createGroupOverlay');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function renderGroupFriendsPick() {
  const box = document.getElementById('groupFriendsPick');
  const countEl = document.getElementById('groupPickCount');
  if (!box) return;
  if (!myFriends.length) {
    box.innerHTML = '<p class="conv-empty" style="padding:12px">Aucun ami disponible. Ajoute des amis d’abord.</p>';
    if (countEl) countEl.textContent = '(0/4)';
    return;
  }
  box.innerHTML = myFriends.map(f => {
    const emoji = f.gender === 'Homme' ? '👨' : '👩';
    const checked = groupPickIds.includes(f.id);
    return (
      '<label class="group-pick-item' + (checked ? ' selected' : '') + '">' +
        '<input type="checkbox" ' + (checked ? 'checked' : '') + ' onchange="toggleGroupPick(\'' + f.id + '\', this.checked)">' +
        '<span style="font-size:20px">' + emoji + '</span>' +
        '<span>' + (f.display_name || 'Ami') + '</span>' +
      '</label>'
    );
  }).join('');
  if (countEl) countEl.textContent = '(' + groupPickIds.length + '/4)';
}

function toggleGroupPick(id, checked) {
  if (checked) {
    if (groupPickIds.length >= 4) {
      showToast('Maximum 4 amis (+ toi = 5 personnes max)', 'error');
      renderGroupFriendsPick();
      return;
    }
    if (!groupPickIds.includes(id)) groupPickIds.push(id);
  } else {
    groupPickIds = groupPickIds.filter(x => x !== id);
  }
  renderGroupFriendsPick();
}

function createGroupChat() {
  const titleEl = document.getElementById('groupTitleInput');
  const title = (titleEl && titleEl.value.trim()) || '';
  if (!title) {
    showToast('Donne un titre au groupe (ex. Café team)', 'error');
    return;
  }
  if (groupPickIds.length < 1) {
    showToast('Choisis au moins 1 ami', 'error');
    return;
  }
  if (groupPickIds.length > 4) {
    showToast('Maximum 5 personnes (toi inclus)', 'error');
    return;
  }
  const memberIds = currentUser ? [currentUser.id, ...groupPickIds] : groupPickIds.slice();
  const group = {
    id: 'g_' + Date.now(),
    title: title.slice(0, 40),
    memberIds: memberIds
  };
  myGroups.push(group);
  // TODO Supabase : table groups + group_members
  closeCreateGroupModal();
  renderConversationSidebar();
  openConversation('group', group.id, group.title);
  showToast('Groupe « ' + group.title + ' » créé (' + memberIds.length + ' personnes)', 'success');
}


/* =========================
   LANGUES
========================= */

// Changement de langue à la volée : met à jour le dictionnaire actif,
// retraduit le DOM et persiste le choix, sans recharger la page
// (donc sans perdre la session Supabase ni l'état de l'UI).
function changeLanguage(lang) {
  if (!I18N[lang]) return;
  currentLang = lang;
  localStorage.setItem('aupygo_lang', lang);
  const sel = document.getElementById('language');
  if (sel) sel.value = lang;
  applyTranslations();
  // Zones dynamiques
  if (typeof updateOnlineCount === 'function') updateOnlineCount();
  if (typeof renderConversationSidebar === 'function') renderConversationSidebar();
  if (typeof refreshMessagesStaticTexts === 'function') refreshMessagesStaticTexts();
  if (typeof updatePlanUI === 'function') updatePlanUI();
}


/* =========================
   INACTIVITÉ (45 min → déconnexion auto)
   Avertissement à 40 min
========================= */

const IDLE_WARN_MS = 40 * 60 * 1000;   // 40 minutes
const IDLE_LOGOUT_MS = 45 * 60 * 1000; // 45 minutes
let lastActivityAt = Date.now();
let idleWarnTimer = null;
let idleLogoutTimer = null;
let idleCheckInterval = null;
let idleWarningShown = false;

function markActivity() {
  if (!currentUser) return;
  lastActivityAt = Date.now();
  if (idleWarningShown) {
    closeIdleWarning();
  }
  scheduleIdleTimers();
}

function scheduleIdleTimers() {
  clearTimeout(idleWarnTimer);
  clearTimeout(idleLogoutTimer);
  if (!currentUser) return;

  const elapsed = Date.now() - lastActivityAt;
  const warnIn = Math.max(0, IDLE_WARN_MS - elapsed);
  const logoutIn = Math.max(0, IDLE_LOGOUT_MS - elapsed);

  idleWarnTimer = setTimeout(() => {
    if (!currentUser) return;
    showIdleWarning();
  }, warnIn);

  idleLogoutTimer = setTimeout(() => {
    if (!currentUser) return;
    closeIdleWarning();
    handleLogout('idle');
  }, logoutIn);
}

function showIdleWarning() {
  if (!currentUser || idleWarningShown) return;
  idleWarningShown = true;
  const overlay = document.getElementById('idleWarningOverlay');
  if (overlay) {
    // Applique la langue courante sur le modal
    const title = overlay.querySelector('#idleWarningTitle');
    const msg = overlay.querySelector('p');
    const stayBtn = overlay.querySelector('.btn-primary');
    const logoutBtn = overlay.querySelector('.btn-secondary');
    if (title) title.textContent = t('idle.title');
    if (msg) msg.textContent = t('idle.message');
    if (stayBtn) stayBtn.textContent = t('idle.stay');
    if (logoutBtn) logoutBtn.textContent = t('idle.logout');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

function closeIdleWarning() {
  idleWarningShown = false;
  const overlay = document.getElementById('idleWarningOverlay');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function stayActive() {
  closeIdleWarning();
  markActivity();
  showToast(t('idle.stayed'), 'success');
}

function startIdleWatch() {
  stopIdleWatch();
  if (!currentUser) return;
  lastActivityAt = Date.now();
  idleWarningShown = false;
  const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
  events.forEach(ev => window.addEventListener(ev, markActivity, { passive: true }));
  scheduleIdleTimers();
  // Contrôle de secours toutes les 30 s
  idleCheckInterval = setInterval(() => {
    if (!currentUser) return;
    const elapsed = Date.now() - lastActivityAt;
    if (elapsed >= IDLE_LOGOUT_MS) {
      closeIdleWarning();
      handleLogout('idle');
    } else if (elapsed >= IDLE_WARN_MS && !idleWarningShown) {
      showIdleWarning();
    }
  }, 30000);
}

function stopIdleWatch() {
  clearTimeout(idleWarnTimer);
  clearTimeout(idleLogoutTimer);
  clearInterval(idleCheckInterval);
  idleWarnTimer = idleLogoutTimer = idleCheckInterval = null;
  closeIdleWarning();
  const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
  events.forEach(ev => window.removeEventListener(ev, markActivity));
}


/* =========================
   DÉMARRAGE
========================= */

/* =========================
   TOUCHE ENTRÉE = VALIDATION
========================= */

function bindEnterKey(id, handler) {

  const el = document.getElementById(id);

  if (!el) return;

  el.addEventListener('keydown', (e) => {

    if (e.key === 'Enter') {
      e.preventDefault();
      handler();
    }

  });

}

function toggleFooter(id) {
  const boxes = ['faqBox', 'contactBox', 'cguBox', 'privacyBox', 'legalBox', 'howItWorksBox'];
  const target = document.getElementById(id);
  if (!target) return;

  // Ferme tous les autres, bascule celui cliqué
  boxes.forEach(boxId => {
    const el = document.getElementById(boxId);
    if (!el) return;
    if (boxId === id) {
      el.style.display = (el.style.display === 'block') ? 'none' : 'block';
    } else {
      el.style.display = 'none';
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMemberProfile();
      closeGeoConsent();
      if (typeof closeCreateGroupModal === 'function') closeCreateGroupModal();
    }
  });

  const bioEl = document.getElementById('bio');
  const bioCounter = document.getElementById('bioCounter');
  if (bioEl && bioCounter) {
    bioEl.addEventListener('input', () => {
      bioCounter.textContent = bioEl.value.length;
    });
  }


  // Applique la langue sauvegardée (ou FR par défaut) avant tout le reste
  document.getElementById('language').value = currentLang;
  applyTranslations();

  loadSavedApproxLocation(); // charge la position approximative déjà autorisée
  initMap();
  await loadProfiles(); // charge les profils avec coordonnées pour la carte
  updatePlanUI();
  updateNavVisibility();
  await refreshAuthUI();

  // Si déjà connecté au chargement → statut en ligne + heartbeat + watch inactivité
  if (currentUser) {
    setOnlineStatus(true);
    startIdleWatch();
  }

  // Rafraîchit les profils (couleurs vert/rouge) toutes les 60 s
  setInterval(() => {
    loadProfiles();
    if (currentUser) setOnlineStatus(true);
  }, 60000);

  // Synchronisation multi-onglets / multi-appareils
  // SIGNED_OUT (ex. déconnexion sur un autre appareil avec scope global) → UI locale nettoyée partout
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      // Déjà géré par handleLogout local → ne pas double-nettoyer / double-toast
      if (isLocalLogout) return;

      const wasLoggedIn = !!currentUser;
      authIntent = null;
      currentUser = null;
      currentPlan = 'FREE';
      localStorage.removeItem('aupygo_plan');
      profileSaved = false;
      stopIdleWatch();
      unlockIdentityFields();
      updatePlanUI();
      updateNavVisibility();
      if (typeof applyMapRestrictions === 'function') applyMapRestrictions();
      if (typeof renderMarkers === 'function') renderMarkers();
      refreshAuthUI('home');
      // Déconnexion depuis un autre appareil / onglet
      if (wasLoggedIn) {
        showToast(t('toast.logged_out'));
        if (getActivePage() !== 'home' && getActivePage() !== 'plans' && getActivePage() !== 'map') {
          go('home');
        }
      }
      return;
    }

    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
      const redirectPage = authIntent === 'login' ? 'home' : (authIntent === 'signup' ? 'profile' : getActivePage());
      authIntent = null;
      refreshAuthUI(redirectPage).then(() => {
        if (currentUser) startIdleWatch();
      });
      return;
    }

    // Autres événements : rafraîchir sans redirection forcée
    authIntent = null;
    refreshAuthUI(getActivePage());
  });

  // Entrée = clique sur le bouton correspondant
  bindEnterKey('signupEmail', handleSignup);
  bindEnterKey('signupPassword', handleSignup);
  bindEnterKey('loginEmail', handleLogin);
  bindEnterKey('loginPassword', handleLogin);
  bindEnterKey('firstName', saveProfile);
  bindEnterKey('age', saveProfile);
  bindEnterKey('country', saveProfile);

});
