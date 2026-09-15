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


/** Un membre est considéré "en ligne" si son dernier heartbeat (last_seen)
 *  date de moins de 5 minutes. Comme le heartbeat s'arrête dès que l'onglet
 *  se ferme (crash, perte réseau, fermeture sans clic sur "Se déconnecter"),
 *  le statut redevient "hors ligne" tout seul après ce délai — sans dépendre
 *  d'un simple booléen qui ne repasserait jamais à false. */
function isRecentlyOnline(member) {
  if (!member || !member.last_seen) return false;
  return (Date.now() - new Date(member.last_seen).getTime()) < 5 * 60 * 1000;
}

/** Met à jour is_online + last_seen dans Supabase pour que la carte affiche
 *  vert (connecté récemment) / rouge (hors ligne). Toi = toujours bleu côté
 *  client. Nécessite les colonnes profiles.is_online (boolean) et
 *  profiles.last_seen (timestamptz). */
async function setOnlineStatus(online) {
  if (!currentUser) return;
  try {
    const payload = { is_online: !!online };
    if (online) payload.last_seen = new Date().toISOString();

    // update d'abord (profil existant) ; sinon upsert
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
      // garantit que le compteur inclut l'utilisateur courant même sans GPS encore
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
  if (!el) return;
  const n = (profiles || []).filter(isRecentlyOnline).length;
  el.textContent = String(n);
}

let isLocalLogout = false;

async function handleLogout(reason) {

  stopIdleWatch();
  teardownMessagesRealtime();
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
    showToast(t('to