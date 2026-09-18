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

      // Le profil incomplet prime toujours sur la destination demandée :
      // signup ET login redirigent vers "profile" tant qu'il n'est pas
      // complété (ex. un utilisateur inscrit mais parti avant de finir son
      // profil, qui revient se connecter plus tard). Une fois le profil
      // complété, on suit la destination normale (accueil après connexion).
      const finalRedirect = profileSaved ? redirectPage : 'profile';
      go(finalRedirect);

      if (finalRedirect === 'home') {
        showToast(t('toast.login_success'), 'success');
      } else if (!profileSaved) {
        showToast(t('toast.complete_profile'), 'success');
      } else {
        showToast(t('toast.welcome_back'), 'success');
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
      loadFriendshipsFromDB().then(updateFriendsBadge);
      loadUnreadCounts();
    }

     } else {
    // Pas connecté
    loggedOut.style.display = 'block';
    loggedIn.style.display = 'none';
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

// Invité : Accueil + Carte (aperçu mondial) + Abonnement uniquement
const GUEST_ALLOWED_PAGES = ['home','map','plans'];
const RESTRICTED_NAV_PAGES = ['events','reconnect','messages','profile','agenda'];

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
  // Visible uniquement si on est connecté (inutile pour un visiteur)
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
    // Tous les onglets sont désormais visibles, connecté ou non :
    // les visiteurs peuvent découvrir tout le site en mode aperçu.
    b.style.display = 'flex';
  });
  // On ne renvoie plus automatiquement les visiteurs vers l'accueil.
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
   // ===== Cadenas sur le bouton Messagerie de la page d'accueil =====
  const homeMsgBtn = document.getElementById('homeBtnMessages');
  const homeMsgLock = document.getElementById('homeMessagesLock');

  if (homeMsgBtn && homeMsgLock) {
    if (currentPlan === 'PREMIUM') {
      homeMsgLock.style.display = 'none';
      homeMsgBtn.classList.remove('locked');
    } else {
      // Free ou Standard → on affiche le cadenas
      homeMsgLock.style.display = 'inline-block';
      homeMsgBtn.classList.add('locked');
    }
  }


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

  // Profil pas encore complété : on garde l'utilisateur guidé sur l'étape de profil,
  // sauf pour Accueil / Carte / Abonnement (toujours accessibles).
  if (currentUser && !profileSaved && page !== 'profile' && !GUEST_ALLOWED_PAGES.includes(page)) {
    page = 'profile';
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  const el = document.getElementById(page);
  if (el) el.classList.add('active');

  document.querySelectorAll('nav button').forEach(b => {
    b.classList.remove('active');
    if (b.dataset.nav === page) {
      b.classList.add('active');
    }
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Bascule landing / dashboard sur la page d'accueil
  if (page === 'home') {
    updateHomeView();
  }

  // La carte n’existe que dans l’onglet Carte
  if (page === 'map' && map) {
    setTimeout(() => {
      map.invalidateSize();
      applyMapRestrictions();
      renderMarkers();
      if (!currentUser) {
        map.setView([20, 0], 2);
      } else {
        map.setView([userLocation.lat, userLocation.lng], getDefaultZoomForPlan());
      }
    }, 200);
  }

  if (page === 'reconnect') {
    renderFriendsUI();
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
  }

}


/* =========================
   LOCALISATIONS (chargement Supabase)
========================= */

async function loadProfiles() {
  try {
    // select('*') = compatible même si certaines colonnes (is_online, birth_year…)
    // n'existent pas encore dans Supabase. Évite l'erreur 400.
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('*');

    if (error) {
      console.error('Erreur chargement profils:', error);
      profiles = [];
      updateOnlineCount();
      return;
    }

    profiles = data || [];
    const onlineN = profiles.filter(isRecentlyOnline).length;
    const gpsN = profiles.filter(p => p.approx_lat != null && p.approx_lng != null).length;
    console.log('[AUPYGO] Profils chargés:', profiles.length, '| en ligne:', onlineN, '| avec GPS:', gpsN);
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

/** Statut en ligne : basé sur la fraîcheur de last_seen (voir isRecentlyOnline).
 *  Toi-même = toujours « me » (bleu), indépendamment du statut. */
function getMarkerKind(member) {
  if (currentUser && member.id === currentUser.id) return 'me';
  return isRecentlyOnline(member) ? 'online' : 'offline';
}

// NOTE : le rendu des marqueurs (renderMarkers) est défini dans map-markers.js,
// qui applique en plus la grille de confidentialité (~1 km) et le décalage
// visuel pour les marqueurs superposés. Ne pas redéfinir renderMarkers ici :
// une redéfinition dans ce fichier serait de toute façon écrasée par
// map-markers.js (chargé après), mais mieux vaut éviter la confusion et
// avoir une seule source de vérité pour le rendu de la carte.


function openMemberProfile(memberId) {
  const raw = profiles.find(m => m.id === memberId);
  if (!raw) return;

  // Normalise les champs DB → structure attendue par la modale
  const member = {
    id: raw.id,
    name: raw.display_name || 'AUPYGO',
    age: raw.age,
    gender: raw.gender,
    plan: (raw.subscription || 'FREE').toString().trim().toUpperCase(),
    city: raw.city || '',
    origin: raw.country || '',
    host: raw.host_country || '',
    stayEnd: raw.stay_end || '',
    bio: raw.bio || '',
    languages: (raw.languages || '').split(',').map(s => s.trim()).filter(Boolean),
    hobbies: (raw.interests || '').split(',').map(s => s.trim()).filter(Boolean),
    online: isRecentlyOnline(raw)
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

  // Visiteur PREMIUM face à un profil non-PREMIUM : pastille rouge explicative
  // sur l'avatar (messagerie privée indisponible pour ce contact).
  const restrictedBadge = (currentPlan === 'PREMIUM' && plan !== 'PREMIUM')
    ? '<span class="member-restricted-badge" title="' + escapeAttr(t('messages.contact_not_premium_short')) + '" onclick="showToast(t(\'messages.contact_not_premium_full\'), \'error\')">🔒</span>'
    : '';

  box.innerHTML =
    '<button type="button" class="member-modal-close" onclick="closeMemberProfile()" aria-label="Fermer">×</button>' +
    onlineHtml +
    '<div class="member-avatar">' + emoji + restrictedBadge + '</div>' +
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


async function messageMember(memberId) {
  const raw = profiles.find(m => m.id === memberId);
  if (!raw) return;

  const name = raw.display_name || 'AUPYGO';

  if (currentPlan !== 'PREMIUM') {
    showToast(t('messages.send_locked'), 'error');
    closeMemberProfile();
    go('plans');
    return;
  }

  // PREMIUM → STANDARD (ou FREE) : la messagerie privée exige que les DEUX
  // comptes soient PREMIUM. Avertissement immédiat, rien n'est envoyé.
  // Vérifié en direct sur Supabase (le cache local peut être périmé jusqu'à 60 s).
  if (!(await isContactPremium(memberId))) {
    showToast(t('messages.contact_not_premium_full'), 'error');
    closeMemberProfile();
    return;
  }

  closeMemberProfile();
  go('messages');

  // Ouvre directement la conversation avec cette personne
  // (petit délai pour laisser le temps à l’onglet de s’afficher)
  setTimeout(() => {
    openConversation('dm', memberId, name);
  }, 150);
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
  if (!currentUser) {
    showToast(t('plans.need_login'), 'error');
    go('plans');
    return;
  }
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
    updateNavVisibility(); // révèle immédiatement Sorties / Amis / Messages / etc.
    showToast(t('profile.saved_first'), 'success');
    go('home');
     updateHomeView();
  } else {
    showToast(t('profile.saved_update'), 'success');
  }

}


async function handleDeleteProfile() {

  if (!currentUser) {
    showToast(
      t('profile.delete_login_required'),
      'error'
    );
    return;
  }

  const confirmed = confirm(
`Vous êtes sur le point de supprimer définitivement votre compte.

Cette action est irréversible.

Toutes vos données personnelles, vos informations de profil, vos amis, vos messages et vos contenus associés seront supprimés définitivement.

Votre abonnement ne sera pas remboursé pour la période en cours.
Son renouvellement automatique sera annulé.

Continuer ?`
  );

  if (!confirmed) return;

  try {

    showToast(
      'Suppression du compte...',
      'success'
    );

    const { error } = await supabaseClient.rpc(
      'delete_account_complete'
    );

    if (error) {
      throw error;
    }

    stopIdleWatch();

    try {
      teardownMessagesRealtime();
    } catch (e) {
      console.warn(e);
    }

    try {
      await setOnlineStatus(false);
    } catch (e) {
      console.warn(e);
    }

    localStorage.clear();
    sessionStorage.clear();

    try {
      await supabaseClient.auth.signOut({
        scope: 'global'
      });
    } catch (e) {
      try {
        await supabaseClient.auth.signOut();
      } catch (e2) {}
    }

    currentUser = null;
    currentPlan = 'FREE';
    profileSaved = false;

    unlockIdentityFields();

    const firstName = document.getElementById('firstName');
    const age = document.getElementById('age');
    const bio = document.getElementById('bio');
    const country = document.getElementById('country');
    const city = document.getElementById('city');
    const hostCountry = document.getElementById('hostCountry');
    const stayEnd = document.getElementById('stayEnd');

    if (firstName) firstName.value = '';
    if (age) age.value = '';
    if (bio) bio.value = '';
    if (country) country.value = '';
    if (city) city.value = '';
    if (hostCountry) hostCountry.value = '';
    if (stayEnd) stayEnd.value = '';

    const profileName = document.getElementById('profileName');
    const profileMeta = document.getElementById('profileMeta');
    const profileAvatar = document.getElementById('profileAvatar');

    if (profileName) {
      profileName.textContent = t('profile.name_placeholder');
    }
    if (profileMeta) {
      profileMeta.textContent = t('profile.meta_placeholder');
    }
    if (profileAvatar) {
      profileAvatar.textContent = '👤';
    }

    selectedGender = null;
    document.querySelectorAll('.gender-option').forEach(btn =>
      btn.classList.remove('selected')
    );

    selectedHobbies.length = 0;
    document.querySelectorAll('.hobby').forEach(btn =>
      btn.classList.remove('selected')
    );

    const otherHobby = document.getElementById('otherHobby');
    if (otherHobby) {
      otherHobby.style.display = 'none';
      otherHobby.value = '';
    }

    if (typeof clearLanguageSelection === 'function') {
      clearLanguageSelection();
    }
    if (typeof updateProfileCard === 'function') {
      updateProfileCard(null);
    }

    updatePlanUI();

    if (typeof refreshAuthUI === 'function') {
      await refreshAuthUI();
    }
    if (typeof updateNavVisibility === 'function') {
      updateNavVisibility();
    }
    if (typeof updateHomeView === 'function') {
      updateHomeView();
    }

    showToast(
      'Compte supprimé définitivement',
      'success'
    );

    if (typeof go === 'function') {
      go('home');
    }

    if (typeof map !== 'undefined' && map) {
      applyMapRestrictions();
      renderMarkers();
    }

  } catch (err) {
    console.error(err);
    showToast(
      'Erreur : ' + err.message,
      'error'
    );
  }
}

/* =========================
   EVENEMENTS
========================= */

function joinEvent(name) {

  if (!currentUser) {
    showToast(t('plans.need_login'), 'error');
    go('plans');
    return;
  }

  if(currentPlan === 'FREE') {
    showToast(t('events.join_locked'), 'error');
    return;
  }

  showToast('🎉 ' + name + ' ' + t('events.joined'), 'success');

}


function joinRestaurantEvent() {

  if (!currentUser) {
    showToast(t('plans.need_login'), 'error');
    go('plans');
    return;
  }

  if(currentPlan === 'FREE') {
    showToast(t('events.join_locked'), 'error');
    return;
  }

  showToast(t('events.restaurant_confirm'));

}


function paidEvent() {

  if (!currentUser) {
    showToast(t('plans.need_login'), 'error');
    go('plans');
    return;
  }

  if(currentPlan === 'FREE') {
    showToast(t('events.special_locked'), 'error');
    return;
  }

  showToast(t('events.special_soon'));

}

/* =========================
   MESSAGES
========================= */

/* =========================
   MESSAGERIE (amis + groupes max 5)
========================= */

let activeConversation = null; // { type: 'dm'|'group', id, name, conversationId }
let myFriends = [];            // profils amis acceptés (réels)
let myGroups = [];             // groupes locaux / Supabase
let groupPickIds = [];         // sélection dans le modal (max 4 + toi = 5)

let messagesChannel = null;
let myConversationIds = new Set();
let dmConversationCache = {}; // friendId -> conversationId (évite de rechercher à chaque fois)

let lastBubbleDateKey = null; // pour les séparateurs de date style WhatsApp

function formatMessageDate(d) {
  if (!d) return '';
  const date = (d instanceof Date) ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return dd + '.' + mm + '.' + yyyy;
}

function getDateKey(d) {
  if (!d) return null;
  const date = (d instanceof Date) ? d : new Date(d);
  if (isNaN(date.getTime())) return null;
  return date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0');
}

function appendBubble(text, isMe, createdAt) {
  const box = document.getElementById('chatMessages');
  if (!box) return;
  const placeholder = box.querySelector('.chat-placeholder');
  if (placeholder) box.innerHTML = '';

  // Séparateur de date (style WhatsApp) — uniquement quand le jour change
  const dateKey = getDateKey(createdAt || new Date());
  if (dateKey && dateKey !== lastBubbleDateKey) {
    const sep = document.createElement('div');
    sep.className = 'chat-date-separator';
    sep.innerHTML = '<span>' + formatMessageDate(createdAt || new Date()) + '</span>';
    box.appendChild(sep);
    lastBubbleDateKey = dateKey;
  }

  const bubble = document.createElement('div');
  bubble.className = 'bubble' + (isMe ? ' me' : '');
  bubble.textContent = text;
  box.appendChild(bubble);
  box.scrollTop = box.scrollHeight;
}

async function refreshMyConversationIds() {
  if (!currentUser) { myConversationIds = new Set(); return; }
  const { data, error } = await supabaseClient
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', currentUser.id);
  if (error) { console.error('refreshMyConversationIds:', error); return; }
  myConversationIds = new Set((data || []).map(r => r.conversation_id));
}

// Trouve la conversation privée (à 2 membres) entre moi et "friendId",
// ou en crée une nouvelle si elle n'existe pas encore.
async function getOrCreateDmConversation(friendId) {
  if (dmConversationCache[friendId]) return dmConversationCache[friendId];

  const { data: mine, error: e1 } = await supabaseClient
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', currentUser.id);
  if (e1) { console.error(e1); return null; }

  const myConvIds = (mine || []).map(r => r.conversation_id);

  if (myConvIds.length) {
    const { data: shared, error: e2 } = await supabaseClient
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', friendId)
      .in('conversation_id', myConvIds);
    if (e2) { console.error(e2); return null; }

    const sharedIds = (shared || []).map(r => r.conversation_id);

    if (sharedIds.length) {
      const { data: allMembers, error: e3 } = await supabaseClient
        .from('conversation_members')
        .select('conversation_id')
        .in('conversation_id', sharedIds);
      if (!e3 && allMembers) {
        const tally = {};
        allMembers.forEach(r => { tally[r.conversation_id] = (tally[r.conversation_id] || 0) + 1; });
        const dmId = Object.keys(tally).find(id => tally[id] === 2);
        if (dmId) {
          dmConversationCache[friendId] = dmId;
          friendIdByConversation[dmId] = friendId;
          return dmId;
        }
      }
    }
  }

  // Aucune conversation existante avec cet ami → on en crée une
  const { data: conv, error: e4 } = await supabaseClient
    .from('conversations')
    .insert({ created_by: currentUser.id })
    .select()
    .single();
  if (e4) { console.error(e4); showToast('Erreur création conversation : ' + e4.message, 'error'); return null; }

  const { error: e5 } = await supabaseClient
    .from('conversation_members')
    .insert([
      { conversation_id: conv.id, user_id: currentUser.id },
      { conversation_id: conv.id, user_id: friendId }
    ]);
  if (e5) { console.error(e5); showToast('Erreur création conversation : ' + e5.message, 'error'); return null; }

  dmConversationCache[friendId] = conv.id;
  friendIdByConversation[conv.id] = friendId;
  myConversationIds.add(conv.id);
  return conv.id;
}

async function loadConversationHistory(conversationId) {
  const box = document.getElementById('chatMessages');
  if (!box) return;
  box.innerHTML = '<div class="chat-placeholder"><p>Chargement…</p></div>';

  const { data, error } = await supabaseClient
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('loadConversationHistory:', error);
    box.innerHTML = '';
    showToast('Erreur chargement messages : ' + error.message, 'error');
    return;
  }

  box.innerHTML = '';
  if (!data || !data.length) {
    box.innerHTML = '<div class="chat-placeholder"><p>Aucun message pour l’instant. Dis bonjour 👋</p></div>';
    return;
  }
  lastBubbleDateKey = null;
  data.forEach(m => appendBubble(m.content, m.sender_id === currentUser.id, m.created_at));
  box.scrollTop = box.scrollHeight;
}

/* =========================
   AupyGo Friend’s (demandes + amis)
   Stocké dans Supabase (table "friendships") — partagé entre tous les appareils
========================= */

let friendshipsCache = []; // lignes { id, from_id, to_id, status, created_at } depuis Supabase

// Recharge les demandes/amitiés de l'utilisateur connecté depuis Supabase
async function loadFriendshipsFromDB() {
  if (!currentUser) {
    friendshipsCache = [];
    return friendshipsCache;
  }
  try {
    const { data, error } = await supabaseClient
      .from('friendships')
      .select('*')
      .or('from_id.eq.' + currentUser.id + ',to_id.eq.' + currentUser.id);

    if (error) {
      console.error('Erreur chargement amitiés:', error);
      friendshipsCache = [];
      return friendshipsCache;
    }

    friendshipsCache = data || [];
    return friendshipsCache;
  } catch (e) {
    console.error('loadFriendshipsFromDB:', e);
    friendshipsCache = [];
    return friendshipsCache;
  }
}

// Retrouve un profil déjà chargé (tableau global "profiles") par id,
// avec un repli minimal si le profil n'est pas encore en cache local.
function getProfileById(id) {
  const found = (profiles || []).find(p => p.id === id);
  return found || { id, display_name: 'AUPYGO', age: null, gender: null, city: '', host_country: '', subscription: 'FREE', is_online: false };
}

/* =========================
   MESSAGES NON LUS
   — comptage par conversation (DM), persistance via
     conversation_members.last_read_at (Supabase) pour une
     synchro correcte multi-onglets / multi-appareils.
   NOTE MIGRATION REQUISE : ajouter la colonne
     conversation_members.last_read_at (timestamptz, nullable)
   côté Supabase. Sans cette colonne, les compteurs fonctionnent
   uniquement pour la session en cours (fallback en mémoire).
========================= */

let unreadByConversation = {};   // conversationId -> nombre de messages non lus
let friendIdByConversation = {}; // conversationId -> friendId (DM uniquement)
let unreadByFriend = {};         // friendId -> nombre de messages non lus (raccourci pour l'UI)
let unreadCountsUnavailable = false; // true si conversation_members.last_read_at n'existe pas en base

function escapeAttr(str) {
  return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Normalise une valeur d'abonnement (espaces, casse) avant comparaison —
// évite les faux négatifs si la valeur en base est "Premium" ou " PREMIUM ".
function isPremiumValue(sub) {
  return String(sub || '').trim().toUpperCase() === 'PREMIUM';
}

// Interroge Supabase EN DIRECT pour l'abonnement d'un profil, plutôt que de
// se fier au tableau local "profiles" (rafraîchi seulement toutes les 60 s,
// donc potentiellement périmé juste après un changement d'abonnement).
// Utilisé uniquement pour les décisions de blocage (jamais pour le simple
// affichage, où le cache local suffit).
async function fetchSubscriptionFresh(userId) {
  try {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('subscription')
      .eq('id', userId)
      .maybeSingle();
    if (error) { console.error('fetchSubscriptionFresh:', error); return null; }
    return data ? data.subscription : null;
  } catch (e) {
    console.error('fetchSubscriptionFresh:', e);
    return null;
  }
}

// true si le contact "id" est actuellement PREMIUM, vérifié en direct.
// En cas d'échec réseau, on se rabat sur le cache local plutôt que de
// bloquer injustement l'utilisateur.
async function isContactPremium(userId) {
  const fresh = await fetchSubscriptionFresh(userId);
  if (fresh !== null) return isPremiumValue(fresh);
  return isPremiumValue(getProfileById(userId).subscription);
}

function getTotalUnreadCount() {
  return Object.values(unreadByConversation).reduce((a, b) => a + b, 0);
}

function updateMessagesBadge() {
  const badge = document.getElementById('messagesBadge');
  const navBtn = document.getElementById('navMessages');
  if (!badge || !navBtn) return;
  const total = getTotalUnreadCount();
  if (total > 0) {
    badge.textContent = total > 99 ? '99+' : String(total);
    badge.classList.add('show');
    navBtn.classList.add('has-unread-messages', 'nav-blink');
  } else {
    badge.classList.remove('show');
    navBtn.classList.remove('has-unread-messages', 'nav-blink');
  }
}

// Recharge depuis Supabase l'état "non lu" de toutes mes conversations DM.
// Résout au passage la correspondance conversation <-> ami (friendIdByConversation)
// et alimente le cache dmConversationCache pour éviter des recherches redondantes.
async function loadUnreadCounts() {
  if (!currentUser) {
    unreadByConversation = {};
    friendIdByConversation = {};
    unreadByFriend = {};
    updateMessagesBadge();
    if (typeof renderConversationSidebar === 'function') renderConversationSidebar();
    return;
  }

  // La colonne last_read_at n'a pas encore été ajoutée côté Supabase
  // (migration requise, cf. conversation_members.last_read_at) :
  // on arrête d'interroger pour ne pas spammer la console à chaque poll.
  if (unreadCountsUnavailable) return;

  try {
    const { data: memberRows, error: mErr } = await supabaseClient
      .from('conversation_members')
      .select('conversation_id, last_read_at')
      .eq('user_id', currentUser.id);

    if (mErr) {
      // Colonne last_read_at absente (code Postgres 42703) ou autre erreur :
      // on n'écrase pas l'état en mémoire déjà construit par le temps réel,
      // et on coupe les futurs appels si la colonne manque vraiment.
      console.error('loadUnreadCounts (members) — as-tu ajouté la colonne conversation_members.last_read_at (timestamptz) dans Supabase ?', mErr);
      if (mErr.code === '42703') unreadCountsUnavailable = true;
      return;
    }

    const myRows = memberRows || [];
    const convIds = myRows.map(r => r.conversation_id);

    if (!convIds.length) {
      unreadByConversation = {};
      friendIdByConversation = {};
      unreadByFriend = {};
      updateMessagesBadge();
      if (typeof renderConversationSidebar === 'function') renderConversationSidebar();
      return;
    }

    // Résout l'autre membre de chaque conversation privée (DM à 2 membres)
    const { data: allMembers, error: allErr } = await supabaseClient
      .from('conversation_members')
      .select('conversation_id, user_id')
      .in('conversation_id', convIds);
    if (allErr) console.error('loadUnreadCounts (allMembers):', allErr);

    const membersByConv = {};
    (allMembers || []).forEach(r => {
      if (!membersByConv[r.conversation_id]) membersByConv[r.conversation_id] = [];
      membersByConv[r.conversation_id].push(r.user_id);
    });

    const newFriendIdByConv = {};
    Object.keys(membersByConv).forEach(convId => {
      const members = membersByConv[convId];
      if (members.length === 2) {
        const other = members.find(id => id !== currentUser.id);
        if (other) {
          newFriendIdByConv[convId] = other;
          dmConversationCache[other] = convId;
        }
      }
    });
    friendIdByConversation = newFriendIdByConv;

    const newUnreadByConv = {};
    const newUnreadByFriend = {};

    for (const row of myRows) {
      const convId = row.conversation_id;
      const since = row.last_read_at || '1970-01-01T00:00:00.000Z';
      const { count, error: cErr } = await supabaseClient
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', convId)
        .neq('sender_id', currentUser.id)
        .gt('created_at', since);
      if (cErr) { console.error('loadUnreadCounts (count):', cErr); continue; }
      if (count && count > 0) {
        newUnreadByConv[convId] = count;
        const fid = friendIdByConversation[convId];
        if (fid) newUnreadByFriend[fid] = count;
      }
    }

    unreadByConversation = newUnreadByConv;
    unreadByFriend = newUnreadByFriend;
    updateMessagesBadge();
    if (typeof renderConversationSidebar === 'function') renderConversationSidebar();
    if (typeof renderFriendsUI === 'function' && getActivePage() === 'reconnect') renderFriendsUI();
  } catch (e) {
    console.error('loadUnreadCounts:', e);
  }
}

// Marque une conversation comme lue : nettoie l'état local (badge + clignotement)
// et persiste last_read_at côté Supabase pour la synchro multi-appareils.
// Filet de sécurité local : garantit que l'état "lu" survient même si
// l'écriture Supabase échoue silencieusement (ex. policy RLS UPDATE
// manquante sur conversation_members → 0 ligne modifiée, sans erreur).
// Ne remplace pas la synchro multi-appareils, qui reste basée sur la DB.
function getLocalLastRead(conversationId) {
  try { return localStorage.getItem('aupygo_last_read_' + conversationId); } catch (e) { return null; }
}
function setLocalLastRead(conversationId, iso) {
  try { localStorage.setItem('aupygo_last_read_' + conversationId, iso); } catch (e) {}
}

async function markConversationRead(conversationId, friendId) {
  if (!conversationId) return;
  if (unreadByConversation[conversationId]) delete unreadByConversation[conversationId];
  if (friendId && unreadByFriend[friendId]) delete unreadByFriend[friendId];
  updateMessagesBadge();
  if (typeof renderConversationSidebar === 'function') renderConversationSidebar();

  const nowIso = new Date().toISOString();
  // Toujours écrit en local, même sans compte connecté ou si la DB échoue.
  setLocalLastRead(conversationId, nowIso);

  if (!currentUser || unreadCountsUnavailable) return;
  try {
    const { data, error } = await supabaseClient
      .from('conversation_members')
      .update({ last_read_at: nowIso })
      .eq('conversation_id', conversationId)
      .eq('user_id', currentUser.id)
      .select('conversation_id');

    if (error) {
      console.error('markConversationRead — écriture last_read_at refusée par Supabase :', error);
      if (error.code === '42703') unreadCountsUnavailable = true;
      return;
    }
    if (!data || data.length === 0) {
      // 0 ligne modifiée sans erreur = quasi certainement une policy RLS UPDATE
      // manquante sur conversation_members. Le filet localStorage prend le relais
      // pour cet appareil, mais la synchro multi-appareils restera cassée tant
      // que la policy n'est pas ajoutée côté Supabase.
      console.warn(
        'markConversationRead : aucune ligne mise à jour dans conversation_members. ' +
        "Vérifie qu'une policy RLS UPDATE existe pour que chaque utilisateur puisse " +
        "modifier sa propre ligne (ex. USING (auth.uid() = user_id))."
      );
    }
  } catch (e) {
    console.error('markConversationRead:', e);
  }
}

// Conservée pour compatibilité : ne remet plus tout à zéro (voir cahier des
// charges — le badge global ne doit disparaître qu'une fois CHAQUE
// conversation lue individuellement, pas seulement en visitant l'onglet).
function clearUnreadMessages() {
  // Volontairement no-op : voir markConversationRead(conversationId, friendId).
}

// Met à jour le badge des demandes d'ami en attente (icône navigation "Amis")
function updateFriendsBadge() {
  if (!currentUser) return;
  const store = friendshipsCache;
  // Demandes reçues en attente
  const pending = store.filter(r => r.to_id === currentUser.id && r.status === 'pending');
  const n = pending.length;
  const badge = document.getElementById('friendsBadge');
  const navBtn = document.getElementById('navFriends');
  const label = document.getElementById('requestsCountLabel');
  if (badge) {
    badge.textContent = String(n);
    if (n > 0) badge.classList.add('show');
    else badge.classList.remove('show');
  }
  if (navBtn) {
    if (n > 0) navBtn.classList.add('has-requests');
    else navBtn.classList.remove('has-requests');
  }
  if (label) label.textContent = n ? '(' + n + ')' : '';
}

async function renderFriendsUI() {
  if (!currentUser) {
    updateFriendsBadge();
    return;
  }
  await loadFriendshipsFromDB();
  const store = friendshipsCache;
  const pending = store.filter(r => r.to_id === currentUser.id && r.status === 'pending');

  const requestsGrid = document.getElementById('requestsGrid');
  const requestsEmpty = document.getElementById('requestsEmpty');
  if (requestsGrid) {
    requestsGrid.innerHTML = '';
    if (pending.length === 0) {
      if (requestsEmpty) requestsEmpty.style.display = 'block';
    } else {
      if (requestsEmpty) requestsEmpty.style.display = 'none';
      pending.forEach(req => {
        const p = getProfileById(req.from_id);
        const emoji = p.gender === 'Homme' ? '👨' : '👩';
        const age = p.age ? (p.age + ' ans') : '';
        const city = p.city || p.host_country || '';
        const meta = [age, city].filter(Boolean).join(' · ');
        const isPremium = p.subscription === 'PREMIUM';
        const card = document.createElement('div');
        card.className = 'card friend-request-card';
        card.dataset.id = req.id;
        card.innerHTML =
          '<div style="text-align:center;margin-bottom:12px">' +
            '<div class="avatar" style="width:80px;height:80px;font-size:40px;margin:0 auto 8px">' + emoji + '</div>' +
            '<h3 style="margin:0">' + (p.display_name || 'AUPYGO') + '</h3>' +
            (meta ? '<p style="color:var(--muted);font-size:13px;margin:4px 0 0">' + meta + '</p>' : '') +
            (isPremium ? '<span class="badge-premium" style="margin-top:6px">PREMIUM</span>' : '') +
          '</div>' +
          '<div class="request-actions" style="display:flex;gap:8px">' +
            '<button class="btn-accept" style="flex:1" onclick="acceptFriendRequest(\'' + req.id + '\')">✅ Accepter</button>' +
            '<button class="btn-refuse" style="flex:1" onclick="refuseFriendRequest(\'' + req.id + '\')">❌ Refuser</button>' +
          '</div>' +
          '<div class="status-confirmed">💚 Ami confirmé</div>';
        requestsGrid.appendChild(card);
      });
    }
  }

  // Amis confirmés (des deux côtés)
  const friendIds = new Set();
  const friends = [];
  store.filter(r => r.status === 'accepted').forEach(r => {
    let otherId;
    if (r.from_id === currentUser.id) otherId = r.to_id;
    else if (r.to_id === currentUser.id) otherId = r.from_id;
    else return;
    if (friendIds.has(otherId)) return;
    friendIds.add(otherId);
    const p = getProfileById(otherId);
    friends.push({
      id: otherId,
      name: p.display_name || 'AUPYGO',
      age: p.age,
      city: p.city || p.host_country || '',
      gender: p.gender,
      premium: isPremiumValue(p.subscription),
      online: isRecentlyOnline(p)
    });
  });

  const friendsGrid = document.getElementById('friendsGrid');
  const friendsEmpty = document.getElementById('friendsEmpty');
  if (friendsGrid) {
    // garder friendsEmpty en référence
    Array.from(friendsGrid.querySelectorAll('.friend-card, .card:not(#friendsEmpty)')).forEach(el => {
      if (el.id !== 'friendsEmpty') el.remove();
    });
    if (friends.length === 0) {
      if (friendsEmpty) friendsEmpty.style.display = 'block';
    } else {
      if (friendsEmpty) friendsEmpty.style.display = 'none';
      friends.forEach(f => {
        const emoji = f.gender === 'Homme' ? '👨' : '👩';
        const meta = [f.age ? (f.age + ' ans') : '', f.city || ''].filter(Boolean).join(' · ');
        const card = document.createElement('div');
        card.className = 'card friend-card';
        const nameSafe = String(f.name).replace(/'/g, "\\'");
        let msgBtn;
        if (currentPlan !== 'PREMIUM') {
          msgBtn = '<button class="btn btn-locked" style="width:100%" onclick="go(\'plans\')">🔒 Messages PREMIUM</button>';
        } else if (!f.premium) {
          // Moi PREMIUM, mais ce contact n'est pas PREMIUM : messagerie indisponible.
          msgBtn = '<button class="btn btn-locked" style="width:100%" title="' + escapeAttr(t('messages.contact_not_premium_short')) + '" onclick="showToast(t(\'messages.contact_not_premium_full\'), \'error\')">🔒 ' + t('messages.contact_not_premium_short') + '</button>';
        } else {
          msgBtn = '<button class="btn btn-primary" style="width:100%" onclick="openConversation(\'dm\',\'' + f.id + '\',\'' + nameSafe + '\')">💬 Message</button>';
        }
        const unread = unreadByFriend[f.id] || 0;
        const isUnread = unread > 0;
        const restrictedDot = (currentPlan === 'PREMIUM' && !f.premium)
          ? '<span class="member-restricted-badge" style="position:absolute;top:0;right:calc(50% - 46px)" title="' + escapeAttr(t('messages.contact_not_premium_short')) + '" onclick="event.stopPropagation(); showToast(t(\'messages.contact_not_premium_full\'), \'error\')">🔒</span>'
          : '';
        card.innerHTML =
          '<div style="text-align:center;margin-bottom:12px;position:relative">' +
            '<div class="avatar' + (isUnread ? ' conv-blink' : '') + '" style="width:80px;height:80px;font-size:40px;margin:0 auto 8px;position:relative;display:inline-flex;align-items:center;justify-content:center">' + emoji + '</div>' +
            restrictedDot +
            '<h3 style="margin:0" class="' + (isUnread ? 'conv-name-unread' : '') + '">' + f.name + (isUnread ? ' <span class="conv-unread-count">' + unread + '</span>' : '') + '</h3>' +
            (meta ? '<p style="color:var(--muted);font-size:13px;margin:4px 0 0">' + meta + '</p>' : '') +
            (f.premium ? '<span class="badge-premium" style="margin-top:6px">PREMIUM</span>' : '') +
          '</div>' +
          '<p style="font-size:13px;color:var(--muted);text-align:center;margin-bottom:12px">💚 Ami confirmé</p>' +
          '<div style="display:flex;flex-direction:column;gap:8px">' +
            '<button class="btn btn-secondary" style="width:100%" onclick="showSharedEvents(\'' + String(f.name).replace(/'/g, "\\'") + '\')">Sorties en commun</button>' +
            msgBtn +
          '</div>';
        friendsGrid.appendChild(card);
      });
    }
  }

  // Alimente myFriends pour la messagerie
  myFriends = friends.map(f => ({
    id: f.id,
    display_name: f.name,
    gender: f.gender,
    is_online: f.online,
    subscription: f.premium ? 'PREMIUM' : 'FREE',
    premium: f.premium === true
  }));

  updateFriendsBadge();
  const freeNotice = document.getElementById('reconnectFreeNotice');
  if (freeNotice) freeNotice.style.display = currentPlan === 'FREE' ? 'block' : 'none';
}

async function acceptFriendRequest(reqId) {
  const req = friendshipsCache.find(r => r.id === reqId);
  if (!req || req.status !== 'pending') return;

  const { error } = await supabaseClient
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', reqId);

  if (error) {
    console.error('acceptFriendRequest:', error);
    showToast('Erreur : ' + error.message, 'error');
    return;
  }

  const p = getProfileById(req.from_id);
  showToast('💚 Tu es maintenant ami(e) avec ' + (p.display_name || 'cet AUPYGO'), 'success');
  await renderFriendsUI();
  if (typeof renderConversationSidebar === 'function') renderConversationSidebar();
}

async function refuseFriendRequest(reqId) {
  const req = friendshipsCache.find(r => r.id === reqId);
  if (!req || req.status !== 'pending') return;

  const { error } = await supabaseClient
    .from('friendships')
    .update({ status: 'refused' })
    .eq('id', reqId);

  if (error) {
    console.error('refuseFriendRequest:', error);
    showToast('Erreur : ' + error.message, 'error');
    return;
  }

  showToast('Demande refusée', 'success');
  await renderFriendsUI();
}

async function sendFriendRequestToMember(memberId) {
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
  if (memberId === currentUser.id) {
    showToast('Tu ne peux pas t’ajouter toi-même', 'error');
    return;
  }

  const raw = profiles.find(m => m.id === memberId);
  const name = raw ? (raw.display_name || 'AUPYGO') : 'AUPYGO';

  // Vérifie l'état actuel (Supabase = source de vérité, pas le cache local)
  const { data: existingRows, error: checkError } = await supabaseClient
    .from('friendships')
    .select('*')
    .or('and(from_id.eq.' + currentUser.id + ',to_id.eq.' + memberId + '),and(from_id.eq.' + memberId + ',to_id.eq.' + currentUser.id + ')');

  if (checkError) {
    console.error('sendFriendRequestToMember (check):', checkError);
    showToast('Erreur : ' + checkError.message, 'error');
    return;
  }

  const existing = (existingRows || [])[0];
  if (existing) {
    if (existing.status === 'refused') {
      showToast('🚫 Demande impossible (déjà refusée)', 'error');
      closeMemberProfile();
      return;
    }
    if (existing.status === 'accepted') {
      showToast('💚 Vous êtes déjà amis', 'success');
      closeMemberProfile();
      return;
    }
    if (existing.status === 'pending') {
      showToast('Demande déjà envoyée', 'success');
      closeMemberProfile();
      return;
    }
  }

  const { error } = await supabaseClient
    .from('friendships')
    .insert({
      from_id: currentUser.id,
      to_id: memberId,
      status: 'pending'
    });

  if (error) {
    console.error('sendFriendRequestToMember (insert):', error);
    showToast('Erreur : ' + error.message, 'error');
    return;
  }

  showToast(t('toast.friend_request_sent') + ' ' + name + ' 🤝', 'success');
  await loadFriendshipsFromDB();
  updateFriendsBadge();
  closeMemberProfile();
}


async function openConversation(type, id, name) {
  if (currentPlan !== 'PREMIUM') {
    showToast(t('messages.send_locked'), 'error');
    go('plans');
    return;
  }

  // PREMIUM → STANDARD/FREE : messagerie indisponible, avertissement immédiat.
  // Vérifié en direct sur Supabase (le cache local "profiles" peut être
  // périmé jusqu'à 60 s après un changement d'abonnement du contact).
  if (type === 'dm') {
    if (!(await isContactPremium(id))) {
      showToast(t('messages.contact_not_premium_full'), 'error');
      return;
    }
  }

  // Bascule sur l'onglet Messagerie : sans ça, un clic depuis "Se retrouver"
  // (ou toute autre page) chargeait bien la conversation, mais dans des
  // éléments DOM restés cachés — d'où l'impression que "rien ne se passe".
  if (getActivePage() !== 'messages') go('messages');

  const header = document.getElementById('chatHeader');
  if (header) header.textContent = (type === 'group' ? '👥 ' : '💬 ') + name;

  const input = document.getElementById('messageInput');
  const btn = document.getElementById('sendMsgBtn');
  if (input) { input.disabled = false; input.focus(); }
  if (btn) btn.disabled = false;

  if (type !== 'dm') {
    activeConversation = { type, id, name, conversationId: null };
    const box = document.getElementById('chatMessages');
    if (box) box.innerHTML = '<div class="chat-placeholder"><p>Les groupes ne sont pas encore synchronisés en ligne (à venir).</p></div>';
    renderConversationSidebar();
    return;
  }

  activeConversation = { type, id, name, conversationId: null };
  renderConversationSidebar();

  const convId = await getOrCreateDmConversation(id);
  if (!convId) {
    const box = document.getElementById('chatMessages');
    if (box) box.innerHTML = '<div class="chat-placeholder"><p>Impossible de charger la conversation.</p></div>';
    return;
  }
  activeConversation.conversationId = convId;
  friendIdByConversation[convId] = id;
  await loadConversationHistory(convId);

  // La conversation est maintenant affichée à l'écran : elle est considérée lue.
  await markConversationRead(convId, id);
}

async function sendMessage() {
  if (currentPlan !== 'PREMIUM') {
    showToast(t('messages.send_locked'), 'error');
    return;
  }
  if (!activeConversation) {
    showToast(t('messages.select_first') || 'Sélectionne une conversation d’abord', 'error');
    return;
  }
  if (activeConversation.type !== 'dm') {
    showToast('Les messages de groupe arrivent bientôt', 'error');
    return;
  }
  if (!activeConversation.conversationId) {
    showToast('Conversation en cours de préparation, réessaie dans un instant.', 'error');
    return;
  }

  // Double vérification défensive (l'accès à la conversation est déjà filtré
  // par openConversation, mais on ne prend aucun risque avant l'écriture en base) :
  // aucun message ne doit être enregistré si le contact n'est plus PREMIUM.
  // Vérifié en direct sur Supabase (jamais depuis le cache local périmé).
  if (!(await isContactPremium(activeConversation.id))) {
    showToast(t('messages.contact_not_premium_full'), 'error');
    return;
  }

  const input = document.getElementById('messageInput');
  if (!input || !input.value.trim()) return;
  const text = input.value.trim();

  const { error } = await supabaseClient
    .from('messages')
    .insert({
      conversation_id: activeConversation.conversationId,
      sender_id: currentUser.id,
      content: text
    });

  if (error) {
    console.error('sendMessage:', error);
    showToast('Erreur : ' + error.message, 'error');
    return;
  }

  appendBubble(text, true, new Date());
  showToast(t('messages.sent'), 'success');
  input.value = '';
}

function setupMessagesRealtime() {
  if (!currentUser || currentPlan !== 'PREMIUM' || messagesChannel) return;
  refreshMyConversationIds().then(() => {
    messagesChannel = supabaseClient
      .channel('messages-' + currentUser.id)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = payload.new;
          if (msg.sender_id === currentUser.id) return; // déjà affiché localement
          if (!myConversationIds.has(msg.conversation_id)) return; // pas une conversation à moi

          const isConversationOpen = activeConversation
            && activeConversation.type === 'dm'
            && activeConversation.conversationId === msg.conversation_id
            && getActivePage() === 'messages';

          if (isConversationOpen) {
            appendBubble(msg.content, false, msg.created_at);
            // Conversation déjà à l'écran → jamais comptée comme non lue.
            markConversationRead(msg.conversation_id, activeConversation.id);
          } else {
            const friendId = friendIdByConversation[msg.conversation_id];
            unreadByConversation[msg.conversation_id] = (unreadByConversation[msg.conversation_id] || 0) + 1;
            if (friendId) unreadByFriend[friendId] = (unreadByFriend[friendId] || 0) + 1;
            updateMessagesBadge();
            if (typeof renderConversationSidebar === 'function') renderConversationSidebar();
            showToast('💬 ' + t('messages.new_message_toast'), 'success');
          }
        }
      )
      .subscribe();
  });
}

function teardownMessagesRealtime() {
  if (messagesChannel) {
    supabaseClient.removeChannel(messagesChannel);
    messagesChannel = null;
  }
  myConversationIds = new Set();
  dmConversationCache = {};
  unreadByConversation = {};
  friendIdByConversation = {};
  unreadByFriend = {};
  updateMessagesBadge();
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
      const unread = unreadByFriend[f.id] || 0;
      const isUnread = unread > 0;
      const nameSafe = (f.display_name || 'Ami').replace(/'/g, "\\'");
      // Destinataire non-PREMIUM : messagerie privée indisponible pour lui.
      // Accepte soit f.premium (booléen), soit f.subscription (string) —
      // selon la structure fournie par l'appelant.
      const isRestricted = f.premium === true
        ? false
        : (f.subscription !== undefined ? !isPremiumValue(f.subscription) : true);
      const restrictedDot = isRestricted
        ? '<span class="conv-restricted-dot" title="' + escapeAttr(t('messages.contact_not_premium_short')) + '" onclick="event.stopPropagation(); showToast(t(\'messages.contact_not_premium_full\'), \'error\');">!</span>'
        : '';
      return (
        '<div class="conversation' + active + (isUnread ? ' has-unread' : '') + '" onclick="openConversation(\'dm\',\'' + f.id + '\',\'' + nameSafe + '\')">' +
          '<div class="conv-avatar' + (isUnread ? ' conv-blink' : '') + '">' + emoji +
            '<span class="conv-status-dot ' + (online ? 'online' : 'offline') + '"></span>' +
            restrictedDot +
          '</div>' +
          '<div class="conv-meta"><div class="conv-name' + (isUnread ? ' conv-name-unread' : '') + '">' + (f.display_name || 'Ami') +
            (isUnread ? ' <span class="conv-unread-count">' + unread + '</span>' : '') + '</div>' +
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

async function loadFriendsForMessaging() {
  myFriends = [];
  try {
    if (currentUser) {
      await renderFriendsUI(); // met aussi à jour myFriends
    }
  } catch (e) {
    console.error('loadFriendsForMessaging:', e);
  }
  renderConversationSidebar();
  if (typeof renderGroupFriendsPick === 'function') renderGroupFriendsPick();
  setupMessagesRealtime();
  loadUnreadCounts();
  checkOldMessagesCleanup();
}


/* =========================
   ANTI-SURCHARGE : NETTOYAGE DES ANCIENS MESSAGES LUS
   — Au-delà de 7 jours, propose (popup Accepter/Refuser) de supprimer les
     messages déjà lus par TOUS les membres de la conversation, pour éviter
     que la table "messages" n'enfle indéfiniment.
   — On ne supprime JAMAIS un message qu'un des deux membres n'a pas encore
     lu (on prend le plus ancien "last_read_at" parmi les membres = le
     point de coupure sûr), et jamais sans confirmation explicite.
   NOTE MIGRATION : nécessite que conversation_members.last_read_at existe
   (voir bug reset) ET qu'une policy RLS DELETE existe sur "messages" pour
   que l'utilisateur connecté puisse supprimer les messages de ses propres
   conversations, ex. :
     create policy "Delete own conversation messages"
     on messages for delete
     using (conversation_id in (
       select conversation_id from conversation_members where user_id = auth.uid()
     ));
========================= */

const CLEANUP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours
const CLEANUP_PROMPT_KEY = 'aupygo_cleanup_last_prompt';
const CLEANUP_REFUSED_KEY = 'aupygo_cleanup_refused_until';
const CLEANUP_RECHECK_MS = 24 * 60 * 60 * 1000;      // au plus 1 vérification / jour
const CLEANUP_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;   // si refusé, on ne redemande pas avant 7 jours

let cleanupPending = null; // { totalEligible, conversations: [{ convId, friendId, cutoff }] }

// Vérifie s'il existe des messages "lus par tout le monde" et vieux de plus
// d'une semaine, dans les conversations de l'utilisateur. N'affiche le popup
// que si c'est le cas, et au maximum 1×/jour (ou 7 jours après un refus).
async function checkOldMessagesCleanup() {
  if (!currentUser || unreadCountsUnavailable) return;

  try {
    const lastPrompt = Number(localStorage.getItem(CLEANUP_PROMPT_KEY) || 0);
    if (Date.now() - lastPrompt < CLEANUP_RECHECK_MS) return;

    const refusedUntil = Number(localStorage.getItem(CLEANUP_REFUSED_KEY) || 0);
    if (Date.now() < refusedUntil) return;

    const { data: memberRows, error } = await supabaseClient
      .from('conversation_members')
      .select('conversation_id, user_id, last_read_at')
      .eq('user_id', currentUser.id);
    if (error) { console.error('checkOldMessagesCleanup (members):', error); return; }

    const myConvIds = (memberRows || []).map(r => r.conversation_id);
    if (!myConvIds.length) { localStorage.setItem(CLEANUP_PROMPT_KEY, String(Date.now())); return; }

    const { data: allMembers, error: allErr } = await supabaseClient
      .from('conversation_members')
      .select('conversation_id, user_id, last_read_at')
      .in('conversation_id', myConvIds);
    if (allErr) { console.error('checkOldMessagesCleanup (allMembers):', allErr); return; }

    const byConv = {};
    (allMembers || []).forEach(r => {
      if (!byConv[r.conversation_id]) byConv[r.conversation_id] = [];
      byConv[r.conversation_id].push(r);
    });

    const sevenDaysAgoIso = new Date(Date.now() - CLEANUP_MAX_AGE_MS).toISOString();
    const eligible = [];
    let totalEligible = 0;

    for (const convId of Object.keys(byConv)) {
      const rows = byConv[convId];
      // Si un membre (moi inclus) n'a encore jamais rien lu dans cette
      // conversation, on ne touche à rien (impossible de garantir la lecture).
      if (rows.some(r => !r.last_read_at)) continue;

      // Coupure sûre = le PLUS ANCIEN last_read_at parmi les membres,
      // et jamais plus récent que "il y a 7 jours".
      let cutoff = rows[0].last_read_at;
      rows.forEach(r => { if (r.last_read_at < cutoff) cutoff = r.last_read_at; });
      if (cutoff > sevenDaysAgoIso) cutoff = sevenDaysAgoIso;

      const { count, error: cErr } = await supabaseClient
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', convId)
        .lt('created_at', cutoff);
      if (cErr) { console.error('checkOldMessagesCleanup (count):', cErr); continue; }

      if (count && count > 0) {
        const friendId = friendIdByConversation[convId] || (rows.find(r => r.user_id !== currentUser.id) || {}).user_id;
        eligible.push({ convId, friendId, cutoff });
        totalEligible += count;
      }
    }

    localStorage.setItem(CLEANUP_PROMPT_KEY, String(Date.now()));

    if (totalEligible > 0) {
      cleanupPending = { totalEligible, conversations: eligible };
      showCleanupConfirmDialog(totalEligible);
    }
  } catch (e) {
    console.error('checkOldMessagesCleanup:', e);
  }
}

// Construit (une seule fois) le popup de confirmation, entièrement en JS
// pour ne pas dépendre d'un ajout manuel dans le HTML existant.
function injectCleanupModal() {
  if (document.getElementById('cleanupOverlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'cleanupOverlay';
  overlay.className = 'aupygo-cleanup-overlay';
  overlay.innerHTML =
    '<div class="aupygo-cleanup-box">' +
      '<h3 id="cleanupTitle">🧹 ' + (t('cleanup.title') || 'Nettoyage des anciens messages') + '</h3>' +
      '<p id="cleanupBody"></p>' +
      '<div class="aupygo-cleanup-actions">' +
        '<button type="button" id="cleanupRefuseBtn" class="btn btn-secondary">' + (t('cleanup.refuse') || 'Garder') + '</button>' +
        '<button type="button" id="cleanupAcceptBtn" class="btn btn-primary">' + (t('cleanup.accept') || 'Supprimer') + '</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  document.getElementById('cleanupAcceptBtn').addEventListener('click', onCleanupAccept);
  document.getElementById('cleanupRefuseBtn').addEventListener('click', onCleanupRefuse);
}

function showCleanupConfirmDialog(count) {
  injectCleanupModal();
  const overlay = document.getElementById('cleanupOverlay');
  const body = document.getElementById('cleanupBody');
  if (body) {
    const template = t('cleanup.body') || 'Tu as {n} ancien(s) message(s) déjà lu(s) depuis plus d\'une semaine. Veux-tu les supprimer pour libérer de l\'espace ? Cette action est définitive.';
    body.textContent = template.replace('{n}', String(count));
  }
  if (overlay) {
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

function closeCleanupModal() {
  const overlay = document.getElementById('cleanupOverlay');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}

async function onCleanupAccept() {
  const pending = cleanupPending;
  cleanupPending = null;
  closeCleanupModal();
  if (!pending || !pending.conversations.length) return;

  let deletedTotal = 0;
  for (const { convId, cutoff } of pending.conversations) {
    try {
      const { error, count } = await supabaseClient
        .from('messages')
        .delete({ count: 'exact' })
        .eq('conversation_id', convId)
        .lt('created_at', cutoff);
      if (error) {
        console.error('onCleanupAccept (delete):', error);
        continue;
      }
      deletedTotal += count || 0;
    } catch (e) {
      console.error('onCleanupAccept:', e);
    }
  }

  const doneTemplate = t('cleanup.done') || '{n} ancien(s) message(s) supprimé(s).';
  showToast('🧹 ' + doneTemplate.replace('{n}', String(deletedTotal)), 'success');

  // Si la conversation actuellement ouverte a été nettoyée, on rafraîchit
  // l'affichage pour ne pas laisser de bulles fantômes à l'écran.
  if (activeConversation && activeConversation.type === 'dm' && activeConversation.conversationId
      && pending.conversations.some(c => c.convId === activeConversation.conversationId)) {
    loadConversationHistory(activeConversation.conversationId);
  }
}

function onCleanupRefuse() {
  cleanupPending = null;
  closeCleanupModal();
  try { localStorage.setItem(CLEANUP_REFUSED_KEY, String(Date.now() + CLEANUP_SNOOZE_MS)); } catch (e) {}
  showToast(t('cleanup.refused') || 'Messages conservés.', 'success');
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
  // Met à jour les zones dynamiques non marquées data-i18n
  if (typeof updateOnlineCount === 'function') updateOnlineCount();
  if (typeof renderConversationSidebar === 'function') renderConversationSidebar();
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

/* =========================
   STYLES — notifications de messagerie
   (injectés en JS pour ne pas dépendre d'une modification du CSS externe ;
   à terme, ces règles peuvent être déplacées dans la feuille de style du projet)
========================= */
function injectMessagingNotificationStyles() {
  if (document.getElementById('aupygo-messaging-styles')) return;
  const style = document.createElement('style');
  style.id = 'aupygo-messaging-styles';
  style.textContent = `
    @keyframes aupygoBlinkBlue {
      0%, 100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.65); }
      50% { box-shadow: 0 0 0 6px rgba(37, 99, 235, 0); }
    }
    #navMessages.nav-blink,
    .conv-avatar.conv-blink,
    .avatar.conv-blink {
      animation: aupygoBlinkBlue 1.1s ease-in-out infinite;
      border-radius: 50%;
    }
    #navMessages { position: relative; }
    #messagesBadge {
      display: none;
      position: absolute;
      top: -4px;
      right: -4px;
      min-width: 18px;
      height: 18px;
      padding: 0 4px;
      border-radius: 9px;
      background: #2563eb;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      line-height: 18px;
      text-align: center;
    }
    #messagesBadge.show { display: block; }
    .conv-name-unread {
      color: #2563eb;
      font-weight: 700;
    }
    .conv-unread-count {
      display: inline-block;
      min-width: 16px;
      padding: 0 5px;
      border-radius: 8px;
      background: #2563eb;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      line-height: 16px;
      text-align: center;
      margin-left: 4px;
    }
    .conv-restricted-dot,
    .member-restricted-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      position: absolute;
      bottom: -2px;
      right: -2px;
      min-width: 16px;
      height: 16px;
      padding: 0 2px;
      border-radius: 50%;
      background: #dc2626;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      line-height: 16px;
      cursor: pointer;
      box-shadow: 0 0 0 2px #fff;
    }
    .conv-avatar { position: relative; }
    .member-avatar { position: relative; display: inline-flex; }

    .aupygo-cleanup-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(17, 24, 39, 0.55);
      z-index: 9999;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .aupygo-cleanup-overlay.open { display: flex; }
    .aupygo-cleanup-box {
      background: #fff;
      border-radius: 14px;
      max-width: 420px;
      width: 100%;
      padding: 24px;
      box-shadow: 0 20px 45px rgba(0,0,0,0.25);
    }
    .aupygo-cleanup-box h3 {
      margin: 0 0 12px;
      font-size: 18px;
    }
    .aupygo-cleanup-box p {
      margin: 0 0 20px;
      color: #4b5563;
      font-size: 14px;
      line-height: 1.5;
    }
    .aupygo-cleanup-actions {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
    }
    .aupygo-cleanup-actions .btn {
      padding: 10px 16px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      font-weight: 600;
      font-size: 14px;
    }
  `;
  document.head.appendChild(style);
}

document.addEventListener('DOMContentLoaded', async () => {
  injectMessagingNotificationStyles();

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
   const langEl = document.getElementById('language');
  if (langEl) langEl.value = currentLang;
  applyTranslations();

  loadSavedApproxLocation(); // charge la position approximative déjà autorisée
  initMap();
  await loadProfiles(); // charge les profils avec coordonnées pour la carte
  updatePlanUI();
  updateNavVisibility();
  await refreshAuthUI();
  if (currentUser) {
    await loadFriendshipsFromDB();
  }
  if (typeof loadFriendsForMessaging === 'function') await loadFriendsForMessaging();
  if (typeof updateFriendsBadge === 'function') updateFriendsBadge();

  // Si déjà connecté au chargement → statut en ligne + heartbeat + watch inactivité
  if (currentUser) {
    setOnlineStatus(true);
    startIdleWatch();
  }

  // Rafraîchit les profils (couleurs vert/rouge), les amitiés et les messages
  // non lus toutes les 60 s (synchro multi-appareils via last_read_at)
  setInterval(() => {
    loadProfiles();
    if (currentUser) {
      setOnlineStatus(true);
      loadFriendshipsFromDB().then(updateFriendsBadge);
      loadUnreadCounts();
    }
  }, 60000);

  // Un retour sur l'onglet / la fenêtre revérifie tout de suite les non-lus,
  // sans attendre le prochain tick des 60 s (utile en multi-onglets).
  window.addEventListener('focus', () => {
    if (currentUser) loadUnreadCounts();
  });

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
      teardownMessagesRealtime();
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
