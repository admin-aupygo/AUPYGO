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

  // --- Limite 3 inscriptions / e-mail (RPC serveur, avant Auth) ---
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
    // Si la RPC n'existe pas encore, on laisse le trigger Auth trancher
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
  const firstName = document.getElementById('firstName');
  const country = document.getElementById('country');
  if (firstName) firstName.readOnly = true;
  if (country) country.readOnly = true;

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
 *  profiles.last_seen (timestamptz).
 *  Mode fantôme : le compte Admin n'écrit jamais son statut en ligne, afin de
 *  rester totalement invisible des autres membres (voir isAdmin()). */
async function setOnlineStatus(online) {
  if (!currentUser) return;
  if (isAdmin()) return; // Mode incognito admin : jamais visible comme "en ligne"
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
  const n = (profiles || []).filter(isRecentlyOnline).length;
  if (el) el.textContent = String(n);

  // Gros bouton Découvrir / Carte (accueil)
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

  stopIdleWatch();
  teardownMessagesRealtime();
  await setOnlineStatus(false);

  // Marque une déconnexion locale pour éviter le double toast via onAuthStateChange
  isLocalLogout = true;
  currentUser = null;
  currentUserIsAdmin = false;
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

    if (loggedOut) loggedOut.style.display = 'none';
    if (loggedIn) loggedIn.style.display = 'block';
    const authEmail = document.getElementById('authUserEmail');
    if (authEmail) authEmail.textContent = user.email;

    // Charge le profil déjà sauvegardé pour ce compte, s'il existe
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('subscription, display_name, age, gender, country, bio, interests, identity_locked, languages, other_language, host_country, stay_end, city, is_admin')
      .eq('id', user.id)
      .maybeSingle();

    // Mode Fantôme / admin : flag DB prioritaire, email en secours
    currentUserIsAdmin = !!(profile && profile.is_admin === true) ||
      !!(user.email && user.email.toLowerCase() === ADMIN_EMAIL);

    if (profile && profile.subscription) {
      currentPlan = profile.subscription;
      localStorage.setItem('aupygo_plan', currentPlan);
      updatePlanUI();
    }

    // Mode Admin : accès Premium automatique
    if (isAdmin()) {
      currentPlan = 'PREMIUM';
      localStorage.setItem('aupygo_plan', 'PREMIUM');
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
      loadGroupInvitations();
    }
  } else {
    // Pas connecté
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
  if (typeof updatePlanAvatarUI === 'function') updatePlanAvatarUI();

  const headerPlan = document.getElementById('headerPlan');

if (headerPlan) {
  headerPlan.textContent = currentPlan;
}
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

  if (messagesBox && messagesNotice) {
    if (!currentUser) {
      messagesBox.style.opacity = '0.5';
      messagesBox.style.pointerEvents = 'none';
      messagesNotice.innerHTML = t('messages.notice_locked');
      const qEl = document.getElementById('messagesQuota');
      if (qEl) { qEl.style.display = 'none'; }
    } else {
      messagesBox.style.opacity = '1';
      messagesBox.style.pointerEvents = 'auto';
      const plan = String(currentPlan || 'FREE').toUpperCase();
      if (plan === 'PREMIUM') {
        messagesNotice.innerHTML = t('messages.notice_paid') || (t('messages.notice_unlocked') + ' (PREMIUM)');
      } else if (plan === 'STANDARD') {
        messagesNotice.innerHTML = t('messages.notice_standard') || t('messages.notice_paid') || '✅ STANDARD : 10 messages/jour avec tes amis + groupes';
      } else {
        messagesNotice.innerHTML = t('messages.notice_free') || '💬 FREE : 10 messages max avec tes amis validés (pas de renouvellement)';
      }
      refreshMessagesQuotaUI();
      if (typeof setupMessagesRealtime === 'function') setupMessagesRealtime();
    }
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


  // ===== Cadenas sur le bouton Messagerie de la page d'accueil =====
  const homeMsgBtn = document.getElementById('homeBtnMessages');
  const homeMsgLock = document.getElementById('homeMessagesLock');

  if (homeMsgBtn && homeMsgLock) {
    // Messagerie accessible dès FREE (quota 10/j) — plus de cadenas Premium Only
    homeMsgLock.style.display = 'none';
    homeMsgBtn.classList.remove('locked');
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

async function selectPlan(plan, billing) {
  // billing: 'monthly' | 'pass6' | undefined (FREE)
  if (!currentUser) {
    showToast(t('plans.need_login'), 'error');
    document.getElementById('authCard').scrollIntoView({ behavior:'smooth', block:'center' });
    return;
  }

  currentPlan = plan;
  localStorage.setItem('aupygo_plan', plan);
  const bill = billing || (plan === 'FREE' ? null : 'monthly');
  if (bill) localStorage.setItem('aupygo_billing', bill);
  else localStorage.removeItem('aupygo_billing');
  updatePlanUI();

  const { error } = await supabaseClient
    .from('profiles')
    .upsert({ id: currentUser.id, subscription: plan }, { onConflict:'id' });

  if (error) {
    console.error(error);
    showToast('Erreur lors de la sauvegarde du forfait : ' + error.message, 'error');
    return;
  }

  // Paiement Stripe à brancher plus tard — pour l’instant activation + message tarif
  if (plan === 'FREE') {
    showToast(t('plans.free_active'), 'success');
  } else if (plan === 'STANDARD' && bill === 'pass6') {
    showToast(t('plans.standard_pass_active') || 'STANDARD Pass 6 mois — 24,90 € (paiement bientôt)', 'success');
  } else if (plan === 'STANDARD') {
    showToast(t('plans.standard_active') || 'STANDARD — 4,90 €/mois (paiement bientôt)', 'success');
  } else if (plan === 'PREMIUM' && bill === 'pass6') {
    showToast(t('plans.premium_pass_active') || 'PREMIUM Pass 6 mois — 51,60 € (paiement bientôt)', 'success');
  } else {
    showToast(t('plans.premium_active') || 'PREMIUM — 9,90 €/mois (paiement bientôt)', 'success');
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

  // Top nav + bottom nav
  document.querySelectorAll('nav button, .bottom-nav-btn').forEach(b => {
    b.classList.remove('active');
    if (b.dataset.nav === page) {
      b.classList.add('active');
    }
  });
  // Pages secondaires (profil, amis, agenda, plans) → highlight "Compte"
  if (['profile', 'reconnect', 'agenda', 'plans'].includes(page)) {
    const moreBtn = document.getElementById('bottomNavMore');
    if (moreBtn) moreBtn.classList.add('active');
  }
  if (typeof closeMoreMenu === 'function') closeMoreMenu();

  // Badges & alertes des gros boutons d'accueil
  if (page === 'events') {
    if (typeof markEventsSeen === 'function') markEventsSeen();
    if (typeof loadAndRenderEvents === 'function') loadAndRenderEvents();
  }
  if (page === 'agenda' || page === 'events') {
    if (typeof highlightAgendaDays === 'function') highlightAgendaDays();
    if (typeof loadAndRenderEvents === 'function') loadAndRenderEvents();
  }
  if (typeof updateEventsBadge === 'function') updateEventsBadge();
  if (typeof updateOnlineCount === 'function') updateOnlineCount();
  if (typeof updateFriendsBadge === 'function') updateFriendsBadge();
  if (typeof updateMessagesBadge === 'function') updateMessagesBadge();

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
    // Préfère la vue map_profiles (colonnes exposées + RLS adaptée carte,
    // qui masque désormais le compte Admin à tout le monde sauf lui-même).
    // Fallback sur profiles avec colonnes nécessaires à la fiche membre.
    const cols = 'id, display_name, age, gender, city, country, host_country, stay_end, languages, interests, bio, subscription, last_seen, approx_lat, approx_lng';
    const colsFallback = cols + ', is_admin';
    let data = null;
    let error = null;

    const viewRes = await supabaseClient.from('map_profiles').select(cols);
    if (!viewRes.error && viewRes.data) {
      data = viewRes.data;
    } else {
      if (viewRes.error) {
        console.warn('[AUPYGO] map_profiles indisponible, fallback profiles:', viewRes.error.message || viewRes.error);
      }
      const tableRes = await supabaseClient.from('profiles').select(colsFallback);
      data = tableRes.data;
      error = tableRes.error;
    }

    if (error) {
      console.error('Erreur chargement profils:', error);
      profiles = [];
      updateOnlineCount();
      return;
    }

    // Mode Fantôme : filet de sécurité si la vue map_profiles n'est pas déployée
    profiles = (data || []).filter(p => {
      if (!p) return false;
      if (p.is_admin === true && !(currentUser && p.id === currentUser.id)) return false;
      return true;
    });
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
    name: escapeHtml(raw.display_name || 'AUPYGO'),
    age: raw.age,
    gender: raw.gender,
    plan: (raw.subscription || 'FREE').toString().trim().toUpperCase(),
    city: escapeHtml(raw.city || ''),
    origin: escapeHtml(raw.country || ''),
    host: escapeHtml(raw.host_country || ''),
    stayEnd: escapeHtml(raw.stay_end || ''),
    bio: escapeHtml(raw.bio || ''),
    languages: (raw.languages || '').split(',').map(s => s.trim()).filter(Boolean).map(escapeHtml),
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
  const friendStatus = currentUser ? getFriendshipStatusWith(member.id) : null;
  const showMessage = !!currentUser && friendStatus === 'accepted';
  const isRefusedContact = friendStatus === 'refused' || friendStatus === 'rejected' || friendStatus === 'declined';
  const canSendFriendRequest = !!currentUser && !friendStatus; // pas encore de relation

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
    return '<span class="hobby-emoji" title="' + escapeAttr(h) + '">' + e + '</span>';
  }).join('');

  let msgBtn = '';
  if (showMessage) {
    msgBtn = '<button type="button" class="member-msg-btn" onclick="messageMember(\'' + member.id + '\')">💬 Message</button>';
  }

  let friendBtn = '';
  if (!currentUser) {
    friendBtn = '<p style="margin-top:12px;font-size:12px;color:#9ca3af">Connecte-toi pour envoyer une demande d\u2019ami</p>';
  } else if (friendStatus === 'accepted') {
    friendBtn = '<p style="margin-top:12px;font-size:12px;color:#15803d">✅ Vous êtes amis</p>';
  } else if (friendStatus === 'pending') {
    friendBtn = '<p style="margin-top:12px;font-size:12px;color:#a16207">⏳ Demande d\u2019ami en attente</p>';
  } else if (isRefusedContact) {
    friendBtn = '<p style="margin-top:12px;font-size:12px;color:#9ca3af">🚫 Demande refusée</p>';
  } else {
    friendBtn = '<button type="button" class="member-friend-btn" onclick="sendFriendRequestToMember(\'' + member.id + '\')">🤝 Demande d\u2019ami</button>';
  }

  // Visiteur PREMIUM face à un profil non-PREMIUM : pastille rouge explicative
  // sur l'avatar (messagerie privée indisponible pour ce contact).
  const restrictedBadge = ''; // plus de pastille premium-only

  box.classList.toggle('member-refused-gray', !!isRefusedContact);
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


async function getFriendshipStatusWith(memberId) {
  if (!currentUser || !memberId) return null;
  const list = typeof friendshipsCache !== 'undefined' ? friendshipsCache : [];
  const row = (list || []).find(f =>
    (f.from_id === currentUser.id && f.to_id === memberId) ||
    (f.to_id === currentUser.id && f.from_id === memberId)
  );
  return row ? (row.status || null) : null;
}

function isAcceptedFriend(memberId) {
  return getFriendshipStatusWith(memberId) === 'accepted';
}

function isRefusedFriend(memberId) {
  const s = getFriendshipStatusWith(memberId);
  return s === 'refused' || s === 'rejected' || s === 'declined';
}

function messageMember(memberId) {
  if (!currentUser) {
    showToast(t('toast.friend_login_required') || 'Connecte-toi pour écrire', 'error');
    closeMemberProfile();
    go('plans');
    return;
  }
  const raw = profiles.find(m => m.id === memberId);
  if (!raw) return;
  const name = raw.display_name || 'AUPYGO';

  // Obligation : amis acceptés avant de discuter
  const st = getFriendshipStatusWith(memberId);
  if (st === 'accepted') {
    closeMemberProfile();
    openConversation('dm', memberId, name);
    return;
  }
  if (st === 'pending') {
    showToast('⏳ Demande d’ami en attente — impossible de discuter pour l’instant.', 'error');
    return;
  }
  if (st === 'refused' || st === 'rejected' || st === 'declined') {
    showToast('Cette personne a refusé ta demande d’ami. Messagerie indisponible.', 'error');
    return;
  }
  showToast('🤝 Envoie d’abord une demande d’ami. La messagerie s’ouvre seulement après acceptation.', 'error');
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

    showToast(
      t('profile.delete_done') || 'Compte supprimé définitivement. À bientôt.',
      'success'
    );

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


/* =========================
   SORTIES & ÉVÉNEMENTS (RÉELS)
========================= */

const ADMIN_EMAIL = 'aupygo@protonmail.com';
let selectedEventEmoji = '☕';
let selectedEventType = 'cafe';
let cachedEvents = [];
let myEventIds = new Set();
let selectedAgendaDay = null; // YYYY-MM-DD | null = tous
let pendingEventInviteIds = new Set();
/** true si le profil courant a is_admin en base (Mode Fantôme / droits admin) */
let currentUserIsAdmin = false;

function isAdmin() {
  if (currentUserIsAdmin) return true;
  return !!(currentUser && currentUser.email &&
    currentUser.email.toLowerCase() === ADMIN_EMAIL);
}

/* =========================
   WIZARD DE CRÉATION DE SORTIE (mobile-first, étape par étape)
   — Chaque étape est validée avant de passer à la suivante.
   — Le choix du type (étape 1) avance automatiquement.
   — "Retour" reste possible jusqu'à la publication finale.
========================= */

let eventWizardStep = 0;
const EVENT_WIZARD_STEPS = ['type', 'title', 'date', 'address', 'max', 'price', 'desc'];

function selectEventEmoji(btn, skipAdvance) {
  document.querySelectorAll('#eventEmojiPicker .emoji-pick').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedEventEmoji = btn.getAttribute('data-emoji') || '🎉';
  selectedEventType = btn.getAttribute('data-type') || 'other';
  // Restaurant : limite stricte 10 AupyGo + case réservation
  applyRestaurantLimitsUI();
  if (!skipAdvance) {
    setTimeout(() => eventWizardNext(), 180);
  }
}

function applyRestaurantLimitsUI() {
  const maxEl = document.getElementById('createEventMax');
  const resWrap = document.getElementById('restaurantReservationWrap');
  const isRest = selectedEventType === 'restaurant';
  if (maxEl) {
    if (isRest) {
      maxEl.value = '10';
      maxEl.max = '10';
      maxEl.min = '2';
    } else {
      maxEl.max = '200';
      if (parseInt(maxEl.value, 10) > 200) maxEl.value = '8';
    }
  }
  if (resWrap) resWrap.style.display = isRest ? 'block' : 'none';
  if (!isRest) {
    const cb = document.getElementById('restaurantReservationDone');
    if (cb) cb.checked = false;
  }
}

function eventWizardRender() {
  const total = EVENT_WIZARD_STEPS.length;
  EVENT_WIZARD_STEPS.forEach((name, i) => {
    const panel = document.getElementById('wizardStep_' + name);
    if (panel) panel.classList.toggle('active', i === eventWizardStep);
  });

  const dotsWrap = document.getElementById('eventWizardDots');
  if (dotsWrap) {
    dotsWrap.innerHTML = EVENT_WIZARD_STEPS.map((_, i) =>
      '<span class="wizard-dot' +
        (i === eventWizardStep ? ' active' : '') +
        (i < eventWizardStep ? ' done' : '') +
      '"></span>'
    ).join('');
  }

  const backBtn = document.getElementById('wizardBackBtn');
  const nextBtn = document.getElementById('wizardNextBtn');
  if (backBtn) backBtn.style.visibility = eventWizardStep === 0 ? 'hidden' : 'visible';
  if (nextBtn) {
    nextBtn.textContent = (eventWizardStep === total - 1) ? '✅ Publier la sortie' : 'Suivant →';
  }

  const stepLabel = document.getElementById('wizardStepLabel');
  if (stepLabel) stepLabel.textContent = 'Étape ' + (eventWizardStep + 1) + ' / ' + total;

  // Focus automatique sur le champ texte de l'étape (confort mobile)
  const focusMap = {
    title: 'createEventTitleInput',
    address: 'createEventAddress'
  };
  const stepName = EVENT_WIZARD_STEPS[eventWizardStep];
  if (focusMap[stepName]) {
    const el = document.getElementById(focusMap[stepName]);
    if (el) setTimeout(() => el.focus(), 200);
  }
}

function eventWizardValidate(stepName) {
  if (stepName === 'title') {
    const v = (document.getElementById('createEventTitleInput').value || '').trim();
    if (!v) { showToast('Donne un nom à ta sortie.', 'error'); return false; }
    return true;
  }
  if (stepName === 'date') {
    const dateVal = document.getElementById('createEventDate').value;
    if (!dateVal) { showToast('Choisis une date et une heure.', 'error'); return false; }
    const eventDate = new Date(dateVal);
    if (isNaN(eventDate.getTime()) || eventDate.getTime() < Date.now() - 3600000) {
      showToast('Choisis une date/heure valide dans le futur.', 'error');
      return false;
    }
    return true;
  }
  if (stepName === 'address') {
    const v = (document.getElementById('createEventAddress').value || '').trim();
    if (!v) { showToast('Indique une adresse.', 'error'); return false; }
    return true;
  }
  if (stepName === 'max') {
    const vis = (document.getElementById('createEventVisibility') || {}).value || 'public';
    if (vis === 'friends') {
      const ids = getSelectedFriendIdsForEvent();
      if (!ids.length) {
        showToast('Sélectionne au moins un ami à inviter.', 'error');
        return false;
      }
      return true;
    }
    const maxP = parseInt(document.getElementById('createEventMax').value, 10) || 0;
    const isRest = selectedEventType === 'restaurant';
    const hardMax = isRest ? 10 : 200;
    if (maxP < 2 || maxP > hardMax) {
      showToast(isRest
        ? 'Restaurant : maximum 10 AupyGo.'
        : 'Nombre de personnes entre 2 et 200.', 'error');
      return false;
    }
    if (isRest) {
      const cb = document.getElementById('restaurantReservationDone');
      if (!cb || !cb.checked) {
        const ok = confirm(
          '🍝 Sortie restaurant limitée à 10 AupyGo.\n\n' +
          'As-tu bien fait la réservation au restaurant ?\n\n' +
          'OK = oui, réservation faite — continuer\n' +
          'Annuler = non, je confirme d’abord la réservation'
        );
        if (!ok) {
          showToast('Merci de confirmer la réservation avant de continuer.', 'error');
          return false;
        }
        if (cb) cb.checked = true;
      }
    }
    return true;
  }
  if (stepName === 'price') {
    const paid = document.querySelector('input[name="eventPaid"]:checked');
    const isPaid = paid && paid.value === 'paid';
    if (isPaid) {
      const priceEl = document.getElementById('createEventPrice');
      const price = parseFloat(priceEl && priceEl.value);
      if (!price || price <= 0 || price > 9999) {
        showToast('Indique un montant valide (€) pour une sortie payante.', 'error');
        return false;
      }
    }
    return true;
  }
  return true;
}

function eventWizardNext() {
  const stepName = EVENT_WIZARD_STEPS[eventWizardStep];
  if (!eventWizardValidate(stepName)) return;

  if (eventWizardStep === EVENT_WIZARD_STEPS.length - 1) {
    submitCreateEvent();
    return;
  }

  eventWizardStep = Math.min(eventWizardStep + 1, EVENT_WIZARD_STEPS.length - 1);
  eventWizardRender();
}

function eventWizardPrev() {
  eventWizardStep = Math.max(eventWizardStep - 1, 0);
  eventWizardRender();
}

function openCreateEventModal(visibility) {
  if (!currentUser) {
    showToast(t('plans.need_login') || 'Connecte-toi pour organiser une sortie.', 'error');
    go('plans');
    return;
  }
  if (currentPlan === 'FREE' && visibility !== 'admin') {
    showToast(t('events.join_locked') || 'Passe à STANDARD pour organiser des sorties.', 'error');
    go('plans');
    return;
  }
  if (visibility === 'admin' && !isAdmin()) {
    showToast('Réservé à l’administrateur AUPYGO.', 'error');
    return;
  }
  document.getElementById('createEventVisibility').value = visibility;
  const titles = {
    public: '🎉 Organiser une sortie (communauté)',
    friends: '🤝 Sortie entre amis',
    admin: '⭐ Événement spécial AUPYGO'
  };
  document.getElementById('createEventTitle').textContent = titles[visibility] || titles.public;
  // Reset form
  document.getElementById('createEventTitleInput').value = '';
  document.getElementById('createEventAddress').value = '';
  document.getElementById('createEventDesc').value = '';
  document.getElementById('createEventMax').value = visibility === 'admin' ? '50' : '8';
  const freeRadio = document.getElementById('eventPaidFree');
  const paidRadio = document.getElementById('eventPaidPaid');
  if (freeRadio) freeRadio.checked = true;
  if (paidRadio) paidRadio.checked = false;
  const priceInput = document.getElementById('createEventPrice');
  if (priceInput) { priceInput.value = ''; priceInput.disabled = true; }
  const priceWrap = document.getElementById('createEventPriceWrap');
  if (priceWrap) priceWrap.style.display = 'none';
  const dt = document.getElementById('createEventDate');
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 2);
  try { dt.value = now.toISOString().slice(0, 16); } catch (e) {}
  // Default emoji
  const picks = document.querySelectorAll('#eventEmojiPicker .emoji-pick');
  picks.forEach(b => b.classList.remove('selected'));
  if (visibility === 'admin') {
    const special = document.querySelector('#eventEmojiPicker [data-type="special"]');
    if (special) { special.classList.add('selected'); selectEventEmoji(special, true); }
  } else {
    if (picks[0]) { picks[0].classList.add('selected'); selectEventEmoji(picks[0], true); }
  }

  // Réinitialise le wizard à la première étape
  eventWizardStep = 0;
  if (typeof applyRestaurantLimitsUI === 'function') applyRestaurantLimitsUI();
  if (typeof applyCreateEventModeUI === 'function') applyCreateEventModeUI();
  eventWizardRender();

  const ov = document.getElementById('createEventOverlay');
  if (ov) { ov.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
}

function closeCreateEventModal() {
  const ov = document.getElementById('createEventOverlay');
  if (ov) ov.style.display = 'none';
  document.body.style.overflow = '';
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
    showToast('Remplis le nom, la date et l’adresse.', 'error');
    return;
  }
  const isRest = selectedEventType === 'restaurant';
  const hardMax = isRest ? 10 : 200;
  if (maxP < 2 || maxP > hardMax) {
    showToast(isRest ? 'Restaurant : maximum 10 AupyGo.' : 'Nombre de personnes entre 2 et 200.', 'error');
    return;
  }
  if (isRest) {
    const cb = document.getElementById('restaurantReservationDone');
    if (!cb || !cb.checked) {
      const ok = confirm(
        '🍝 Merci de confirmer la réservation au restaurant avant de continuer.\n\n' +
        'OK = réservation faite — publier\nAnnuler = revenir en arrière'
      );
      if (!ok) {
        showToast('Merci de confirmer la réservation avant de continuer.', 'error');
        return;
      }
      if (cb) cb.checked = true;
    }
  }
  const eventDate = new Date(dateVal);
  if (isNaN(eventDate.getTime()) || eventDate.getTime() < Date.now() - 3600000) {
    showToast('Choisis une date/heure valide dans le futur.', 'error');
    return;
  }
  if (visibility === 'admin' && !isAdmin()) {
    showToast('Réservé à l’admin.', 'error');
    return;
  }

  try {
    // Seul l'admin peut monétiser
    const paidRadio = document.querySelector('input[name="eventPaid"]:checked');
    let isPaid = !!(paidRadio && paidRadio.value === 'paid') && isAdmin();
    let price = 0;
    if (isPaid) {
      price = parseFloat((document.getElementById('createEventPrice') || {}).value) || 0;
    }
    const isSpecial = visibility === 'admin' || selectedEventType === 'special';
    const isFriends = visibility === 'friends';
    const friendIds = isFriends ? getSelectedFriendIdsForEvent() : [];
    if (isFriends && !friendIds.length) {
      showToast('Sélectionne au moins un ami à inviter.', 'error');
      return;
    }
    const isRest = selectedEventType === 'restaurant';
    const resCb = document.getElementById('restaurantReservationDone');
    const reservationConfirmed = !!(isRest && resCb && resCb.checked);
    let finalMax = maxP;
    if (isFriends) finalMax = Math.max(2, friendIds.length + 1);
    if (isRest) finalMax = Math.min(finalMax, 10);

    const row = {
      creator_id: currentUser.id,
      title,
      type: selectedEventType,
      emoji: selectedEventEmoji,
      description: desc || null,
      address,
      event_date: eventDate.toISOString(),
      max_participants: finalMax,
      visibility: isSpecial ? 'admin' : visibility,
      is_paid: isPaid,
      price: isPaid ? price : 0,
      is_special_aupygo: isSpecial,
      reservation_confirmed: reservationConfirmed
    };
    const { data, error } = await supabaseClient.from('events').insert(row).select().single();
    if (error) {
      console.error(error);
      // Table manquante ?
      if (/relation.*does not exist|schema cache/i.test(error.message || '')) {
        showToast('Table « events » absente. Exécute le SQL fourni dans Supabase (voir instructions).', 'error');
      } else {
        showToast('Erreur : ' + (error.message || 'impossible de créer'), 'error');
      }
      return;
    }
    // Auto-join creator
    try {
      await supabaseClient.from('event_participants').insert({
        event_id: data.id,
        user_id: currentUser.id
      });
    } catch (e) {}

    // Invitations sortie entre amis
    if (visibility === 'friends') {
      const ids = getSelectedFriendIdsForEvent();
      if (ids.length) {
        const invites = ids.map(toId => ({
          event_id: data.id,
          from_id: currentUser.id,
          to_id: toId,
          status: 'pending'
        }));
        try {
          const { error: invErr } = await supabaseClient.from('event_invitations').insert(invites);
          if (invErr) console.warn('invitations:', invErr);
          else showToast('📨 Invitations envoyées à ' + ids.length + ' ami(s)', 'success');
        } catch (e) {
          console.warn(e);
        }
      }
    }

    closeCreateEventModal();
    showToast('✅ Sortie créée !', 'success');
    await loadAndRenderEvents();
  } catch (e) {
    console.error(e);
    showToast('Erreur réseau.', 'error');
  }
}


function getEventsForSelectedDay(list) {
  const src = list || cachedEvents || [];
  if (!selectedAgendaDay) return src;
  return src.filter(ev => eventDayKey(ev.event_date) === selectedAgendaDay);
}

function renderEventGridFiltered() {
  const grid = document.getElementById('eventGrid');
  if (!grid || !cachedEvents) return;
  // Re-trigger full render is heavy; filter DOM: rebuild from cachedEvents
  // Appelle la logique d'affichage via loadAndRenderEvents trop coûteux → rebuild simple
  const all = cachedEvents;
  const locked = currentPlan === 'FREE';
  const toShow = getEventsForSelectedDay(all);
  const bar = document.getElementById('eventDayFilterBar');
  if (bar) {
    if (selectedAgendaDay) {
      const parts = selectedAgendaDay.split('-');
      bar.innerHTML = '<span>📅 ' + parts[2] + '/' + parts[1] + '</span> ' +
        '<button type="button" class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="selectAgendaDay(null)">Voir toutes les sorties</button>';
      bar.style.display = 'flex';
    } else {
      bar.innerHTML = '<span class="footer-muted">Clique un jour dans l’agenda pour filtrer</span>';
      bar.style.display = 'flex';
    }
  }
  if (!toShow.length) {
    grid.innerHTML = '<p class="footer-muted" style="grid-column:1/-1;padding:12px">Aucune sortie pour ce jour.</p>';
    return;
  }
  // Délègue au re-render complet en forçant selected day via loadAndRenderEvents fragment
  // Reconstruction des cartes (copie simplifiée de loadAndRenderEvents)
  grid.innerHTML = toShow.map(ev => buildEventCardHtml(ev, locked)).join('');
}

function buildEventCardHtml(ev, locked) {
  const parts = ev.event_participants || [];
  const count = parts.length;
  const remaining = Math.max(0, (ev.max_participants || 0) - count);
  const isJoined = myEventIds.has(ev.id);
  const isCreator = !!(currentUser && ev.creator_id === currentUser.id);
  const full = remaining <= 0;
  const dateStr = formatEventDate(ev.event_date);
  const typeLabel = typeToLabel(ev.type);
  const isSpecial = !!(ev.is_special_aupygo || ev.visibility === 'admin' || ev.visibility === 'admin_only' || ev.type === 'special');
  const isPaidEv = !!(ev.is_paid && Number(ev.price) > 0);
  const priceLabel = isPaidEv ? (Number(ev.price).toFixed(2).replace(/\.00$/, '') + ' €') : 'Gratuit';
  const visBadge = ev.visibility === 'friends' ? '🤝 Amis' : isSpecial ? '⭐ AUPYGO' : '';
  const priceBadge = isPaidEv ? (' · 💶 ' + priceLabel) : ' · Gratuit';
  const seatsText = full ? 'Complet' : (remaining + ' place' + (remaining > 1 ? 's' : ''));
  const urgCard = getEventUrgency(ev);
  const roleCard = eventRoleClass(ev);
  let actionHtml;
  if (isCreator) {
    const canEdit = typeof canEditOwnEvent === 'function' && canEditOwnEvent(ev);
    actionHtml = '<div class="event-actions-row">' +
      '<button class="btn btn-secondary" disabled>👑 Toi</button>' +
      (canEdit ? '<button type="button" class="btn btn-secondary" onclick="editRealEvent(\'' + ev.id + '\')">✏️</button>' : '') +
      '<button type="button" class="btn-icon-delete" onclick="deleteRealEvent(\'' + ev.id + '\')">🗑️</button></div>';
  } else if (isJoined) {
    actionHtml = '<div class="event-actions-row">' +
      '<button class="btn btn-secondary" disabled>✅ Inscrit</button>' +
      '<button type="button" class="btn-icon-delete" onclick="leaveRealEvent(\'' + ev.id + '\')">✖️</button></div>';
  } else if (full) {
    actionHtml = '<button class="btn btn-secondary" disabled>Complet</button>';
  } else if (isPaidEv) {
    actionHtml = '<button class="btn btn-primary event-join" onclick="joinRealEvent(\'' + ev.id + '\')">💶 ' + priceLabel + '</button>';
  } else {
    actionHtml = '<button class="btn btn-primary event-join" onclick="joinRealEvent(\'' + ev.id + '\')">✨ Participer</button>';
  }
  if (locked && !isCreator) {
    return '<div class="event ' + roleCard + ' urgency-' + urgCard + '" data-event-id="' + ev.id + '">' +
      '<div class="event-cover">' + (ev.emoji || '🎉') + '</div><div class="event-body">' +
      '<span class="badge">' + typeLabel + (visBadge ? ' · ' + visBadge : '') + priceBadge + '</span>' +
      '<h3>' + escapeHtml(ev.title) + '</h3>' +
      '<p class="event-details locked-text">🔒 STANDARD requis</p>' +
      '<button class="btn btn-locked event-upgrade" onclick="go(\'' + 'plans' + '\')">Passer à STANDARD</button>' +
      '</div></div>';
  }
  return '<div class="event ' + roleCard + ' urgency-' + urgCard + '" data-event-id="' + ev.id + '">' +
    '<div class="event-cover">' + (ev.emoji || '🎉') + '</div><div class="event-body">' +
    '<span class="badge">' + typeLabel + (visBadge ? ' · ' + visBadge : '') + priceBadge + '</span>' +
    '<h3>' + escapeHtml(ev.title) + '</h3>' +
    '<p class="event-details">📍 ' + escapeHtml(ev.address || '') + '</p>' +
    '<p class="event-details">🕐 ' + dateStr + ' · 👥 ' + (ev.max_participants || '?') + '</p>' +
    '<p class="event-seats">' + seatsText + '</p>' + actionHtml +
    '</div></div>';
}

async function loadAndRenderEvents() {
  const grid = document.getElementById('eventGrid');
  const empty = document.getElementById('eventGridEmpty');
  if (!grid) return;

  // Show admin button
  const adminBtn = document.getElementById('btnOrgAdmin');
  if (adminBtn) adminBtn.style.display = isAdmin() ? '' : 'none';

  if (!currentUser) {
    grid.innerHTML = '<p class="footer-muted" style="grid-column:1/-1;padding:16px">Connecte-toi pour voir et organiser des sorties réelles.</p>';
    renderEventsAgenda([]);
    return;
  }

  try {
    // Load future events
    const nowIso = new Date().toISOString();
    const fromIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    let { data: events, error } = await supabaseClient
      .from('events')
      .select('*, event_participants(user_id)')
      .gte('event_date', fromIso)
      .order('event_date', { ascending: true })
      .limit(80);

    if (error) {
      console.warn('events load:', error);
      grid.innerHTML = '<p class="footer-muted" style="grid-column:1/-1;padding:16px">Impossible de charger les sorties. Vérifie que la table « events » existe (SQL fourni).</p>';
      renderEventsAgenda([]);
      return;
    }

    events = events || [];

    // Filter by visibility
    const friendIds = new Set((typeof myFriends !== 'undefined' ? myFriends : []).map(f => f.id || f.user_id || f));
    // Admin / spécial AupyGo : visibles par TOUS (comme public), pas seulement l'admin
    const visible = events.filter(ev => {
      if (ev.visibility === 'public') return true;
      if (ev.visibility === 'admin_only' || ev.visibility === 'admin' || ev.is_special_aupygo) {
        return true;
      }
      if (ev.visibility === 'friends') {
        const parts = ev.event_participants || [];
        const isPart = parts.some(p => p.user_id === currentUser.id);
        return ev.creator_id === currentUser.id || friendIds.has(ev.creator_id) || isPart;
      }
      return true;
    });

    cachedEvents = visible;
    myEventIds = new Set();
    visible.forEach(ev => {
      const parts = ev.event_participants || [];
      if (parts.some(p => p.user_id === currentUser.id)) myEventIds.add(ev.id);
    });

    const toShow = getEventsForSelectedDay(visible);
    if (!toShow.length) {
      grid.innerHTML = '<p class="footer-muted" id="eventGridEmpty" style="grid-column:1/-1;padding:16px">Aucune sortie pour le moment. Organise-en une !</p>';
    } else {
      const locked = currentPlan === 'FREE';
      grid.innerHTML = toShow.map(ev => {
        const parts = ev.event_participants || [];
        const count = parts.length;
        const remaining = Math.max(0, (ev.max_participants || 0) - count);
        const isJoined = myEventIds.has(ev.id);
        const isCreator = !!(currentUser && ev.creator_id === currentUser.id);
        const full = remaining <= 0;
        const dateStr = formatEventDate(ev.event_date);
        const typeLabel = typeToLabel(ev.type);
        const isSpecial = !!(ev.is_special_aupygo || ev.visibility === 'admin' || ev.visibility === 'admin_only' || ev.type === 'special');
        const isPaidEv = !!(ev.is_paid && Number(ev.price) > 0);
        const priceLabel = isPaidEv ? (Number(ev.price).toFixed(2).replace(/\.00$/, '') + ' €') : 'Gratuit';
        const visBadge = ev.visibility === 'friends' ? '🤝 Amis' :
          isSpecial ? '⭐ AUPYGO' : '';
        const priceBadge = isPaidEv ? (' · 💶 ' + priceLabel) : ' · Gratuit';
        const seatsText = full ? 'Complet' : (remaining + ' place' + (remaining > 1 ? 's' : '') + ' restante' + (remaining > 1 ? 's' : ''));

        // Droits : seul le créateur peut supprimer ; un participant peut
        // annuler sa propre participation à tout moment.
        let actionHtml;
        if (isCreator) {
          const canEdit = canEditOwnEvent(ev);
          actionHtml =
            '<div class="event-actions-row">' +
              '<button class="btn btn-secondary" style="margin-top:0" disabled>👑 Ton événement</button>' +
              (canEdit
                ? '<button type="button" class="btn btn-secondary" style="margin-top:0" onclick="editRealEvent(\'' + ev.id + '\')" title="Modifier">✏️</button>'
                : '') +
              '<button type="button" class="btn-icon-delete" onclick="deleteRealEvent(\'' + ev.id + '\')" title="Supprimer la sortie" aria-label="Supprimer la sortie">🗑️</button>' +
            '</div>';
        } else if (isJoined) {
          actionHtml =
            '<div class="event-actions-row">' +
              '<button class="btn btn-secondary" style="margin-top:0" disabled>✅ Tu participes</button>' +
              '<button type="button" class="btn-icon-delete" onclick="leaveRealEvent(\'' + ev.id + '\')" title="Annuler ma participation" aria-label="Annuler ma participation">✖️</button>' +
            '</div>';
        } else if (full) {
          actionHtml = '<button class="btn btn-secondary" style="margin-top:10px" disabled>Complet</button>';
        } else if (isPaidEv) {
          actionHtml = '<button class="btn btn-primary event-join" style="margin-top:10px" onclick="joinRealEvent(\'' + ev.id + '\')">💶 Participer — ' + priceLabel + '</button>';
        } else {
          actionHtml = '<button class="btn btn-primary event-join" style="margin-top:10px" onclick="joinRealEvent(\'' + ev.id + '\')">✨ Participer</button>';
        }

        const urgCard = getEventUrgency(ev);
        const roleCard = eventRoleClass(ev);
        return `
        <div class="event ${roleCard} urgency-${urgCard}" data-event-id="${ev.id}">
          <div class="event-cover">${ev.emoji || '🎉'}</div>
          <div class="event-body">
            <span class="badge">${typeLabel}${visBadge ? ' · ' + visBadge : ''}${priceBadge}</span>
            <h3 style="margin:8px 0">${escapeHtml(ev.title)}</h3>
            ${locked && !isCreator ? `
              <p class="event-details locked-text" data-i18n="events.locked_text">🔒 Lieu et participants réservés au forfait STANDARD</p>
              <button class="btn btn-locked event-upgrade" onclick="go('plans')">🔒 Passer à STANDARD</button>
            ` : `
              <p class="event-details">📍 ${escapeHtml(ev.address || '')}</p>
              <p class="event-details">🕐 ${dateStr} · 👥 Max ${ev.max_participants || '?'}</p>
              <p class="event-details">${isPaidEv ? '💶 Tarif : <strong>' + priceLabel + '</strong>' : '🆓 Entrée libre'}</p>
              <p class="event-seats ${full ? 'full' : ''}">${seatsText}</p>
              ${actionHtml}
            `}
          </div>
        </div>`;
      }).join('');
    }

    renderEventsAgenda(visible);
    renderCommunityAgenda(visible);
    renderPersonalAgenda(visible);
    updateMyAgendaList();
    if (typeof updateEventsBadge === 'function') updateEventsBadge();
    if (typeof startEventUrgencyWatch === 'function') startEventUrgencyWatch();
    if (typeof applyEventUrgencyUI === 'function') applyEventUrgencyUI();
  } catch (e) {
    console.error(e);
    grid.innerHTML = '<p class="footer-muted" style="grid-column:1/-1">Erreur de chargement.</p>';
  }
}

function typeToLabel(type) {
  const map = {
    cafe: 'Café', hike: 'Extérieur', restaurant: 'Restaurant', cinema: 'Cinéma',
    culture: 'Culture', shopping: 'Shopping', party: 'Fête', sport: 'Sport',
    special: 'Événement AUPYGO', other: 'Autre'
  };
  return map[type] || type || 'Sortie';
}

function formatEventDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return days[d.getDay()] + ' ' + dd + '/' + mm + ' · ' + hh + ':' + mi;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function renderEventsAgenda(events) {
  const cal = document.getElementById('eventsAgendaCalendar');
  if (!cal) return;
  const list = (events || []).filter(ev => getEventUrgency(ev) !== 'expired');
  if (!list.length) {
    cal.innerHTML = '<p class="footer-muted" id="eventsAgendaEmpty" style="grid-column:1/-1;padding:12px">Aucune sortie pour le moment. Sois le premier à en organiser une !</p>';
    return;
  }
  cal.innerHTML = buildWeekCalendarHtml(list);
}

function renderCommunityAgenda(events) {
  const cal = document.getElementById('agendaCalendar');
  if (!cal) return;
  const publicOnes = (events || []).filter(e =>
    (e.visibility === 'public' || e.visibility === 'admin' || e.visibility === 'admin_only') &&
    e.visibility !== 'friends' &&
    getEventUrgency(e) !== 'expired'
  );
  if (!publicOnes.length) {
    cal.innerHTML = '<p class="footer-muted" id="agendaCommunityEmpty" style="grid-column:1/-1;padding:12px">Aucune sortie communautaire pour le moment.</p>';
    return;
  }
  cal.innerHTML = buildWeekCalendarHtml(publicOnes);
}


/** Modification autorisée jusqu'à 1 h avant, sauf réservation restaurant confirmée */
function canEditOwnEvent(ev) {
  if (!ev || !currentUser || ev.creator_id !== currentUser.id) return false;
  if (ev.reservation_confirmed) return false;
  const t = new Date(ev.event_date).getTime();
  if (isNaN(t)) return false;
  return (t - Date.now()) > 60 * 60 * 1000;
}

async function editRealEvent(eventId) {
  const ev = (cachedEvents || []).find(e => e.id === eventId);
  if (!ev) return;
  if (!canEditOwnEvent(ev)) {
    showToast(ev.reservation_confirmed
      ? 'Modification impossible : réservation restaurant confirmée.'
      : 'Tu ne peux plus modifier (moins d’1 h avant le début).', 'error');
    return;
  }
  const newTitle = prompt('Nouveau titre :', ev.title || '');
  if (newTitle === null) return;
  const newAddress = prompt('Nouvelle adresse :', ev.address || '');
  if (newAddress === null) return;
  const newDesc = prompt('Description (optionnel) :', ev.description || '');
  if (newDesc === null) return;
  try {
    const { error } = await supabaseClient.from('events').update({
      title: (newTitle || ev.title).trim(),
      address: (newAddress || ev.address).trim(),
      description: (newDesc || '').trim() || null
    }).eq('id', eventId).eq('creator_id', currentUser.id);
    if (error) throw error;
    showToast('✅ Sortie mise à jour', 'success');
    await loadAndRenderEvents();
  } catch (e) {
    showToast('Erreur : ' + (e.message || e), 'error');
  }
}

async function loadEventInvitations() {
  const card = document.getElementById('eventInvitesCard');
  const list = document.getElementById('eventInvitesList');
  pendingEventInviteIds = new Set();
  if (!currentUser || !list) {
    if (card) card.style.display = 'none';
    return;
  }
  try {
    const { data, error } = await supabaseClient
      .from('event_invitations')
      .select('id, event_id, from_id, status, events(id, title, emoji, event_date, address, visibility)')
      .eq('to_id', currentUser.id)
      .eq('status', 'pending');
    if (error) {
      if (card) card.style.display = 'none';
      return;
    }
    const rows = data || [];
    rows.forEach(inv => { if (inv.event_id) pendingEventInviteIds.add(inv.event_id); });
    if (!rows.length) {
      if (card) card.style.display = 'none';
      list.innerHTML = '';
      if (typeof renderPersonalAgenda === 'function') renderPersonalAgenda(cachedEvents);
      if (typeof renderEventsAgenda === 'function') renderEventsAgenda(cachedEvents);
      return;
    }
    if (card) card.style.display = 'block';
    list.innerHTML = rows.map(inv => {
      const ev = inv.events || {};
      return `<div class="agenda-item invite-pending" style="padding:12px;margin-bottom:8px;border-radius:10px;border:1px solid #eab308">
        <strong>${ev.emoji || '🤝'} ${escapeHtml(ev.title || 'Sortie entre amis')}</strong><br>
        <span style="font-size:13px;color:var(--muted)">${formatEventDate(ev.event_date)} · ${escapeHtml(ev.address || '')}</span>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button type="button" class="btn btn-primary" onclick="respondEventInvitation('${inv.id}','${inv.event_id}','accepted')">✅ Accepter</button>
          <button type="button" class="btn btn-secondary" onclick="respondEventInvitation('${inv.id}','${inv.event_id}','refused')">✖️ Refuser</button>
        </div>
      </div>`;
    }).join('');
    if (typeof renderPersonalAgenda === 'function') renderPersonalAgenda(cachedEvents);
    if (typeof renderEventsAgenda === 'function') renderEventsAgenda(cachedEvents);
  } catch (e) {
    if (card) card.style.display = 'none';
  }
}

async function respondEventInvitation(inviteId, eventId, status) {
  if (!currentUser) return;
  try {
    const { error } = await supabaseClient
      .from('event_invitations')
      .update({ status })
      .eq('id', inviteId)
      .eq('to_id', currentUser.id);
    if (error) throw error;
    if (status === 'accepted') {
      await supabaseClient.from('event_participants').insert({
        event_id: eventId,
        user_id: currentUser.id
      });
      showToast('🎉 Invitation acceptée — ajoutée à ton agenda !', 'success');
    } else {
      showToast('Invitation refusée.', 'success');
    }
    await loadEventInvitations();
    await loadAndRenderEvents();
  } catch (e) {
    showToast('Erreur : ' + (e.message || e), 'error');
  }
}

async function joinRealEvent(eventId) {
  if (!currentUser) {
    showToast(t('plans.need_login') || 'Connecte-toi.', 'error');
    go('plans');
    return;
  }
  if (currentPlan === 'FREE') {
    showToast(t('events.join_locked') || 'Passe à STANDARD pour participer.', 'error');
    return;
  }

  const ev = (cachedEvents || []).find(e => e.id === eventId);
  const isPaidEv = !!(ev && ev.is_paid && Number(ev.price) > 0);
  if (isPaidEv) {
    const priceLabel = Number(ev.price).toFixed(2).replace(/\.00$/, '') + ' €';
    // Placeholder paiement (PayPal / CB à brancher plus tard)
    const goPay = confirm(
      '💶 Cette sortie est payante : ' + priceLabel + '\n\n' +
      'Le paiement en ligne (PayPal / carte bancaire) sera bientôt disponible.\n\n' +
      'Continuer pour réserver ta place ? (simulation — aucun débit)'
    );
    if (!goPay) return;
    // Emplacement réservé pour future intégration :
    // await startCheckout(eventId, ev.price);
  }

  try {
    const { error } = await supabaseClient.from('event_participants').insert({
      event_id: eventId,
      user_id: currentUser.id
    });
    if (error) {
      if (/duplicate|unique/i.test(error.message || '')) {
        showToast('Tu participes déjà.', 'success');
      } else {
        showToast('Erreur : ' + error.message, 'error');
        return;
      }
    } else {
      showToast(isPaidEv ? '🎉 Place réservée (paiement simulé) !' : '🎉 Tu es inscrit !', 'success');
    }
    await loadAndRenderEvents();
  } catch (e) {
    showToast('Erreur réseau.', 'error');
  }
}

/** Bascule Free / Payant dans le wizard de création */
function onEventPaidChange() {
  const paid = document.querySelector('input[name="eventPaid"]:checked');
  const isPaid = paid && paid.value === 'paid';
  const wrap = document.getElementById('createEventPriceWrap');
  const input = document.getElementById('createEventPrice');
  if (wrap) wrap.style.display = isPaid ? 'block' : 'none';
  if (input) {
    input.disabled = !isPaid;
    if (!isPaid) input.value = '';
    else setTimeout(() => input.focus(), 150);
  }
}

/** Annulation de participation : disponible à tout moment pour tout
 *  participant (sauf le créateur, qui doit supprimer l'événement entier). */
async function leaveRealEvent(eventId) {
  if (!currentUser) return;
  const ev = (cachedEvents || []).find(e => e.id === eventId);
  const ok = confirm('Annuler ta participation à « ' + (ev ? ev.title : 'cette sortie') + ' » ?');
  if (!ok) return;
  try {
    const { error } = await supabaseClient
      .from('event_participants')
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', currentUser.id);
    if (error) throw error;
    showToast('Participation annulée.', 'success');
    await loadAndRenderEvents();
  } catch (e) {
    console.error('leaveRealEvent:', e);
    showToast('Erreur : ' + (e.message || e), 'error');
  }
}

/** Suppression d'une sortie : réservée au créateur. La policy RLS
 *  "Events: creator can delete" (creator_id = auth.uid()) protège aussi
 *  cette action côté serveur, même si ce bouton n'est affiché qu'au créateur. */
async function deleteRealEvent(eventId) {
  if (!currentUser) return;
  const ev = (cachedEvents || []).find(e => e.id === eventId);
  if (!ev) return;
  if (ev.creator_id !== currentUser.id) {
    showToast('Seul le créateur peut supprimer cette sortie.', 'error');
    return;
  }
  const ok = confirm('Supprimer définitivement « ' + ev.title + ' » ?\n\nCette action est irréversible et retirera tous les participants.');
  if (!ok) return;
  try {
    const { error } = await supabaseClient
      .from('events')
      .delete()
      .eq('id', eventId)
      .eq('creator_id', currentUser.id);
    if (error) throw error;
    showToast('Sortie supprimée.', 'success');
    await loadAndRenderEvents();
  } catch (e) {
    console.error('deleteRealEvent:', e);
    showToast('Erreur suppression : ' + (e.message || e), 'error');
  }
}

function getEventUrgency(ev) {
  if (!ev || !ev.event_date) return 'none';
  const t = new Date(ev.event_date).getTime();
  if (isNaN(t)) return 'none';
  const now = Date.now();
  const msLeft = t - now;
  if (msLeft <= -24 * 3600 * 1000) return 'expired'; // +24h passé → à retirer
  if (msLeft <= 0) return 'past'; // commencé / passé (<24h)
  if (msLeft <= 5 * 60 * 1000) return 'red'; // ≤ 5 min
  if (msLeft <= 45 * 60 * 1000) return 'orange'; // ≤ 45 min
  return 'upcoming';
}

function eventRoleClass(ev) {
  if (!currentUser || !ev) return '';
  if (ev.creator_id === currentUser.id) return 'agenda-role-organizer';
  if (ev.visibility === 'friends') return 'agenda-role-friends';
  if (myEventIds.has(ev.id)) return 'agenda-role-participant';
  return '';
}

function getCurrentWeekDays() {
  const names = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    out.push({
      name: names[i],
      date: d,
      dayNum: d.getDate(),
      monthNum: d.getMonth() + 1,
      key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    });
  }
  return out;
}

function eventDayKey(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function buildWeekCalendarHtml(events) {
  const week = getCurrentWeekDays();
  const byDay = {};
  week.forEach(w => { byDay[w.key] = []; });
  (events || []).forEach(ev => {
    const k = eventDayKey(ev.event_date);
    if (byDay[k]) byDay[k].push(ev);
  });
  const today = new Date();
  return week.map(w => {
    const items = byDay[w.key] || [];
    const count = items.length;
    const isToday = w.date.toDateString() === today.toDateString();
    const isSel = selectedAgendaDay === w.key;
    // Pastille compacte : nombre d'événements + clignotement jaune si invitation pending ce jour
    const hasPending = items.some(ev => pendingEventInviteIds.has(ev.id));
    let dots = '';
    if (count > 0) {
      dots = '<span class="day-count' + (hasPending ? ' day-pending-blink' : '') + '">' + count + ' sortie' + (count > 1 ? 's' : '') + '</span>';
    } else {
      dots = '<span class="day-empty">—</span>';
    }
    return '<div class="day day-clickable' + (isToday ? ' day-today' : '') + (isSel ? ' day-selected' : '') +
      (hasPending ? ' day-pending-blink' : '') +
      '" data-day-key="' + w.key + '" onclick="selectAgendaDay(\'' + w.key + '\')">' +
      '<strong>' + w.name + ' <span class="day-date">' + String(w.dayNum).padStart(2, '0') + '/' + String(w.monthNum).padStart(2, '0') + '</span></strong>' +
      dots +
      '</div>';
  }).join('');
}

function selectAgendaDay(dayKey) {
  if (selectedAgendaDay === dayKey) selectedAgendaDay = null; // re-clic = tous
  else selectedAgendaDay = dayKey;
  // Re-render listes filtrées
  if (typeof renderEventGridFiltered === 'function') renderEventGridFiltered();
  if (typeof updateMyAgendaList === 'function') updateMyAgendaList();
  // Refresh calendriers pour état selected
  if (typeof renderEventsAgenda === 'function') renderEventsAgenda(cachedEvents);
  if (typeof renderCommunityAgenda === 'function') renderCommunityAgenda(cachedEvents);
  if (typeof renderPersonalAgenda === 'function') renderPersonalAgenda(cachedEvents);
}

function renderPersonalAgenda(events) {
  const cal = document.getElementById('personalCalendar');
  if (!cal) return;
  const mine = (events || []).filter(ev => {
    if (getEventUrgency(ev) === 'expired') return false;
    return myEventIds.has(ev.id) || (currentUser && ev.creator_id === currentUser.id);
  });
  cal.innerHTML = buildWeekCalendarHtml(mine);
}


function applyCreateEventModeUI() {
  const vis = (document.getElementById('createEventVisibility') || {}).value || 'public';
  const numWrap = document.getElementById('eventMaxNumberWrap');
  const friendsWrap = document.getElementById('eventFriendsPickWrap');
  const isFriends = vis === 'friends';
  if (numWrap) numWrap.style.display = isFriends ? 'none' : 'block';
  if (friendsWrap) friendsWrap.style.display = isFriends ? 'block' : 'none';
  if (isFriends) renderEventFriendsPick();
  const paidInput = document.getElementById('eventPaidPaid');
  if (paidInput) {
    const lab = paidInput.closest('label');
    if (lab) lab.style.display = isAdmin() ? '' : 'none';
  }
  if (!isAdmin()) {
    const free = document.getElementById('eventPaidFree');
    if (free) free.checked = true;
    onEventPaidChange();
  }
}

function renderEventFriendsPick() {
  const list = document.getElementById('eventFriendsPickList');
  const empty = document.getElementById('eventFriendsPickEmpty');
  if (!list) return;
  const friends = Array.isArray(myFriends) ? myFriends : [];
  if (!friends.length) {
    list.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';
  list.innerHTML = friends.map(f => {
    const id = f.id;
    const name = escapeHtml(f.display_name || f.name || 'Ami');
    return '<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border,#e5e7eb);border-radius:10px;cursor:pointer">' +
      '<input type="checkbox" class="event-friend-pick" value="' + id + '">' +
      '<span>🤝 ' + name + '</span></label>';
  }).join('');
}

function getSelectedFriendIdsForEvent() {
  return Array.from(document.querySelectorAll('.event-friend-pick:checked')).map(el => el.value).filter(Boolean);
}

function updateMyAgendaList() {
  const list = document.getElementById('myAgendaList');
  if (!list) return;
  // Mes sorties : participations + celles que j'organise, visibles jusqu'à +24h après l'heure
  const mine = (cachedEvents || []).filter(ev => {
    if (!myEventIds.has(ev.id) && !(currentUser && ev.creator_id === currentUser.id)) return false;
    if (getEventUrgency(ev) === 'expired') return false;
    if (selectedAgendaDay && eventDayKey(ev.event_date) !== selectedAgendaDay) return false;
    return true;
  });
  if (!mine.length) {
    list.innerHTML = '<p class="footer-muted" data-i18n="agenda.empty">Tu n’as encore rejoint aucune sortie.</p>';
    return;
  }
  list.innerHTML = mine.map(ev => {
    const parts = ev.event_participants || [];
    const remaining = Math.max(0, (ev.max_participants || 0) - parts.length);
    const urg = getEventUrgency(ev);
    const role = eventRoleClass(ev);
    const roleLabel = role === 'agenda-role-organizer' ? '👑 Organisateur' : (role === 'agenda-role-friends' ? '🤝 Entre amis' : '🌍 Communauté');
    return `<div class="agenda-item ${role} urgency-${urg}" data-event-id="${ev.id}" style="padding:10px 12px;border-radius:10px;margin-bottom:8px;border-bottom:1px solid var(--border,#eee)">
      <strong>${ev.emoji || '🎉'} ${escapeHtml(ev.title)}</strong>
      <span class="agenda-role-pill">${roleLabel}</span><br>
      <span style="font-size:13px;color:var(--muted)">${formatEventDate(ev.event_date)} · ${escapeHtml(ev.address || '')}</span><br>
      <span class="event-seats">${remaining} place${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}</span>
    </div>`;
  }).join('');
}

/** Applique classes d'urgence (clignotement) sur cartes sorties + agenda */
function applyEventUrgencyUI() {
  const all = cachedEvents || [];
  all.forEach(ev => {
    const urg = getEventUrgency(ev);
    document.querySelectorAll('[data-event-id="' + ev.id + '"]').forEach(el => {
      el.classList.remove('urgency-upcoming', 'urgency-orange', 'urgency-red', 'urgency-past', 'urgency-expired');
      el.classList.add('urgency-' + urg);
    });
  });
  // Boutons navigation / home : clignotent selon la plus urgente de MES sorties
  const mine = all.filter(ev => myEventIds.has(ev.id) || (currentUser && ev.creator_id === currentUser.id));
  let worst = 'none';
  mine.forEach(ev => {
    const u = getEventUrgency(ev);
    if (u === 'red') worst = 'red';
    else if (u === 'orange' && worst !== 'red') worst = 'orange';
  });
  const btnSelectors = [
    '[data-nav="events"]',
    '[data-nav="agenda"]',
    '#homeBtnEvents',
    '#homeBtnAgenda',
    '#navMessages' // no - only events/agenda
  ];
  document.querySelectorAll('[data-nav="events"], [data-nav="agenda"], #homeBtnEvents, #homeBtnAgenda').forEach(btn => {
    btn.classList.remove('event-blink-orange', 'event-blink-red', 'event-btn-past');
    if (worst === 'red') btn.classList.add('event-blink-red');
    else if (worst === 'orange') btn.classList.add('event-blink-orange');
  });
}

/** Rappels 2h avant (Notification API + toast), une seule fois par événement */
function checkEventReminders() {
  if (!currentUser) return;
  const mine = (cachedEvents || []).filter(ev =>
    myEventIds.has(ev.id) || (currentUser && ev.creator_id === currentUser.id)
  );
  let sent = {};
  try { sent = JSON.parse(localStorage.getItem('aupygo_event_reminders') || '{}'); } catch (e) {}
  const now = Date.now();
  mine.forEach(ev => {
    const t = new Date(ev.event_date).getTime();
    if (isNaN(t)) return;
    const msLeft = t - now;
    // Fenêtre 2h → 1h55 pour éviter de rater le tick
    if (msLeft > 0 && msLeft <= 2 * 3600 * 1000 && msLeft > 1.9 * 3600 * 1000) {
      if (sent[ev.id]) return;
      sent[ev.id] = now;
      const title = (ev.emoji || '🎉') + ' Rappel AUPYGO';
      const body = 'Dans 2 h : « ' + (ev.title || 'ta sortie') + ' » — ' + formatEventDate(ev.event_date);
      showToast(title + ' — ' + body, 'success');
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(title, { body: body, tag: 'aupygo-ev-' + ev.id });
        }
      } catch (e) {}
    }
  });
  try { localStorage.setItem('aupygo_event_reminders', JSON.stringify(sent)); } catch (e) {}
}

function requestEventNotificationPermission() {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  } catch (e) {}
}

let eventUrgencyTimer = null;
function startEventUrgencyWatch() {
  if (eventUrgencyTimer) return;
  requestEventNotificationPermission();
  const tick = () => {
    applyEventUrgencyUI();
    checkEventReminders();
    // Rafraîchir listes si un événement vient de dépasser +24h
    if (typeof updateMyAgendaList === 'function') updateMyAgendaList();
  };
  tick();
  eventUrgencyTimer = setInterval(tick, 30000); // 30 s
}

// Compatibility stubs (anciens boutons)
function joinEvent(name) {
  showToast('Utilise les sorties réelles ci-dessus.', 'success');
}
function joinRestaurantEvent() {
  showToast('Utilise les sorties réelles ci-dessus.', 'success');
}
function paidEvent() {
  if (isAdmin()) openCreateEventModal('admin');
  else showToast(t('events.special_soon') || 'Événements spéciaux à venir.', 'success');
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
  // Message système (ex. "X a quitté le groupe")
  if (typeof text === 'string' && /a quitté le groupe/i.test(text)) {
    const box = document.getElementById('chatMessages');
    if (!box) return;
    const placeholder = box.querySelector('.chat-placeholder');
    if (placeholder) box.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'chat-system-msg';
    div.textContent = text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    return;
  }

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
      const { data: typeRows } = await supabaseClient
        .from('conversations')
        .select('id, type')
        .in('id', sharedIds);
      // Un groupe (même à 2 membres) n'est jamais un DM
      const groupSet = new Set((typeRows || []).filter(c => c.type === 'group').map(c => c.id));

      if (!e3 && allMembers) {
        const tally = {};
        allMembers.forEach(r => { tally[r.conversation_id] = (tally[r.conversation_id] || 0) + 1; });
        const dmId = Object.keys(tally).find(id => tally[id] === 2 && !groupSet.has(id));
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

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function escapeAttr(str) {
  return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* =========================
   QUOTA MESSAGES
   FREE     : 10 messages max pour toute la vie du compte (pas de renouvellement)
   STANDARD : 10 messages / jour
   PREMIUM  : illimité
========================= */
const MSG_QUOTA_FREE = 10;       // total compte (lifetime)
const MSG_QUOTA_STANDARD = 10;   // par jour

function getMessageQuotaMax() {
  const p = String(currentPlan || 'FREE').trim().toUpperCase();
  if (p === 'PREMIUM') return Infinity;
  if (p === 'STANDARD') return MSG_QUOTA_STANDARD;
  return MSG_QUOTA_FREE;
}

function isFreeLifetimeQuota() {
  return String(currentPlan || 'FREE').trim().toUpperCase() === 'FREE';
}

function localQuotaKey() {
  const uid = (currentUser && currentUser.id) ? currentUser.id : 'anon';
  if (isFreeLifetimeQuota()) {
    return 'aupygo_msg_quota_lifetime_' + uid;
  }
  const d = new Date();
  const day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return 'aupygo_msg_quota_' + uid + '_' + day;
}

function getLocalQuotaCount() {
  try { return parseInt(localStorage.getItem(localQuotaKey()) || '0', 10) || 0; }
  catch (e) { return 0; }
}

function bumpLocalQuota() {
  try {
    const n = getLocalQuotaCount() + 1;
    localStorage.setItem(localQuotaKey(), String(n));
    return n;
  } catch (e) { return getLocalQuotaCount(); }
}

/** Nombre de messages déjà envoyés (lifetime si FREE, aujourd'hui si STANDARD). */
async function countMessagesUsed() {
  if (!currentUser || !supabaseClient) return getLocalQuotaCount();
  try {
    let q = supabaseClient
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('sender_id', currentUser.id);
    if (!isFreeLifetimeQuota()) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      q = q.gte('created_at', start.toISOString());
    }
    const { count, error } = await q;
    if (error) {
      console.warn('[AUPYGO] quota count fallback local:', error.message || error);
      return getLocalQuotaCount();
    }
    const n = count || 0;
    try { localStorage.setItem(localQuotaKey(), String(n)); } catch (e) {}
    return n;
  } catch (e) {
    return getLocalQuotaCount();
  }
}

async function refreshMessagesQuotaUI() {
  const el = document.getElementById('messagesQuota');
  const max = getMessageQuotaMax();
  if (max === Infinity) {
    if (el) { el.style.display = 'none'; el.textContent = ''; }
    return { sent: 0, max: Infinity, left: Infinity, allowed: true };
  }
  const sent = await countMessagesUsed();
  const left = Math.max(0, max - sent);
  if (el) {
    el.style.display = 'block';
    const key = isFreeLifetimeQuota() ? 'messages.quota_left_lifetime' : 'messages.quota_left';
    const fallback = isFreeLifetimeQuota()
      ? '{n}/{max} messages restants (compte FREE)'
      : '{n}/{max} messages restants aujourd\'hui';
    const tpl = t(key) || fallback;
    el.textContent = tpl.replace('{n}', String(left)).replace('{max}', String(max));
    el.className = 'notice' + (left <= 0 ? ' warning' : '');
  }
  return { sent: sent, max: max, left: left, allowed: left > 0 };
}

/* =========================
   MENU COMPTE + AVATAR FORFAIT
========================= */
function toggleMoreMenu() {
  const overlay = document.getElementById('moreSheetOverlay');
  if (!overlay) return;
  if (overlay.classList.contains('open')) closeMoreMenu();
  else openMoreMenu();
}
function openMoreMenu() {
  const overlay = document.getElementById('moreSheetOverlay');
  if (!overlay) return;
  updatePlanAvatarUI();
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeMoreMenu() {
  const overlay = document.getElementById('moreSheetOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function planBadgeClass(plan) {
  const p = String(plan || 'FREE').toUpperCase();
  if (p === 'PREMIUM') return 'plan-premium';
  if (p === 'STANDARD') return 'plan-standard';
  return 'plan-free';
}

function planAvatarEmoji(plan) {
  const p = String(plan || 'FREE').toUpperCase();
  if (p === 'PREMIUM') return '💎';
  if (p === 'STANDARD') return '⭐';
  return '👤';
}

function updatePlanAvatarUI() {
  const plan = String(currentPlan || 'FREE').toUpperCase();
  const short = plan === 'PREMIUM' ? 'PREM' : (plan === 'STANDARD' ? 'STD' : 'FREE');
  const emoji = planAvatarEmoji(plan);
  const cls = planBadgeClass(plan);

  const setBadge = (el, text) => {
    if (!el) return;
    el.textContent = text;
    el.classList.remove('plan-free', 'plan-standard', 'plan-premium');
    el.classList.add(cls);
  };

  const avatar = document.getElementById('headerPlanAvatar');
  if (avatar) avatar.textContent = emoji;
  setBadge(document.getElementById('headerPlanBadge'), short);

  const bnAvatar = document.getElementById('bottomNavAvatar');
  if (bnAvatar) bnAvatar.textContent = emoji;
  setBadge(document.getElementById('bottomNavPlanBadge'), short);

  const sheetAv = document.getElementById('moreSheetAvatar');
  if (sheetAv) sheetAv.textContent = emoji;
  const sheetPlan = document.getElementById('moreSheetPlan');
  if (sheetPlan) sheetPlan.textContent = plan;
  setBadge(document.getElementById('moreSheetPlanPill'), plan);

  const nameEl = document.getElementById('moreSheetName');
  if (nameEl) {
    let name = 'AUPYGO';
    try {
      if (currentUser && typeof getProfileById === 'function') {
        const p = getProfileById(currentUser.id);
        if (p && p.display_name) name = p.display_name;
      }
    } catch (e) {}
    if (name === 'AUPYGO' && currentUser && currentUser.email) {
      name = currentUser.email.split('@')[0];
    }
    if (!currentUser) name = (typeof t === 'function' ? (t('guest.banner_cta') || 'Invité') : 'Invité');
    nameEl.textContent = name;
  }
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
  const badgeBottom = document.getElementById('messagesBadgeBottom');
  const navBtn = document.getElementById('navMessages');
  const homeMsgBtn = document.getElementById('homeBtnMessages');
  const total = getTotalUnreadCount();
  const label = total > 99 ? '99+' : String(total);
  const show = total > 0;
  if (badge) {
    badge.textContent = label;
    if (show) badge.classList.add('show');
    else badge.classList.remove('show');
  }
  if (badgeBottom) {
    badgeBottom.textContent = label;
    if (show) badgeBottom.classList.add('show');
    else badgeBottom.classList.remove('show');
  }
  if (navBtn) {
    if (show) navBtn.classList.add('has-unread-messages', 'nav-blink');
    else navBtn.classList.remove('has-unread-messages', 'nav-blink');
  }
  const bottomMsg = document.getElementById('bottomNavMessages');
  if (bottomMsg) {
    if (show) bottomMsg.classList.add('has-unread-messages');
    else bottomMsg.classList.remove('has-unread-messages');
  }
  // Gros bouton Messages : badge numérique + clignotement
  if (homeMsgBtn) {
    if (show) homeMsgBtn.classList.add('nav-blink', 'has-unread-messages');
    else homeMsgBtn.classList.remove('nav-blink', 'has-unread-messages');
    const hb = homeMsgBtn.querySelector('.home-btn-badge');
    if (hb) {
      hb.textContent = label;
      if (show) hb.classList.add('show');
      else hb.classList.remove('show');
    }
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

  if (unreadCountsUnavailable) return;

  try {
    const { data: memberRows, error: mErr } = await supabaseClient
      .from('conversation_members')
      .select('conversation_id, last_read_at')
      .eq('user_id', currentUser.id);

    if (mErr) {
      console.error('loadUnreadCounts (members):', mErr);
      if (mErr.code === '42703') unreadCountsUnavailable = true; // colonne last_read_at absente
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

    // Distingue groupes et DM via conversations.type
    const { data: convRows, error: convErr } = await supabaseClient
      .from('conversations')
      .select('id, type')
      .in('id', convIds);
    if (convErr) console.error('loadUnreadCounts (conversations):', convErr);
    const groupIds = new Set((convRows || []).filter(c => c.type === 'group').map(c => c.id));

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
      if (groupIds.has(convId)) return; // un groupe n'est jamais un DM
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
        const fid = groupIds.has(convId) ? null : friendIdByConversation[convId];
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
  if (!currentUser) {
    // reset home badge if logged out
    const homeFriends = document.getElementById('homeBtnFriends');
    if (homeFriends) {
      homeFriends.classList.remove('nav-blink', 'has-requests');
      const b = homeFriends.querySelector('.home-btn-badge');
      if (b) { b.textContent = '0'; b.classList.remove('show'); }
      const o = homeFriends.querySelector('.home-btn-online');
      if (o) o.textContent = '';
    }
    return;
  }
  const store = friendshipsCache || [];
  const pending = store.filter(r => r.to_id === currentUser.id && r.status === 'pending');
  const n = pending.length;

  const badge = document.getElementById('friendsBadge');
  const badgeMore = document.getElementById('friendsBadgeMore');
  const navBtn = document.getElementById('navFriends');
  const label = document.getElementById('requestsCountLabel');

  if (badge) {
    badge.textContent = String(n);
    if (n > 0) badge.classList.add('show');
    else badge.classList.remove('show');
  }
  if (badgeMore) {
    badgeMore.textContent = String(n);
    if (n > 0) badgeMore.classList.add('show');
    else badgeMore.classList.remove('show');
  }
  if (navBtn) {
    if (n > 0) navBtn.classList.add('has-requests', 'nav-blink');
    else navBtn.classList.remove('has-requests', 'nav-blink');
  }
  if (label) label.textContent = String(n);

  // Gros bouton Amis (accueil) : badge demandes + clignotement + amis en ligne
  const homeFriends = document.getElementById('homeBtnFriends');
  if (homeFriends) {
    const hb = homeFriends.querySelector('.home-btn-badge');
    if (hb) {
      hb.textContent = n > 99 ? '99+' : String(n);
      if (n > 0) hb.classList.add('show');
      else hb.classList.remove('show');
    }
    if (n > 0) homeFriends.classList.add('nav-blink', 'has-requests');
    else homeFriends.classList.remove('nav-blink', 'has-requests');

    // Nombre d'amis en ligne
    const onlineFriends = (myFriends || []).filter(f => f.is_online === true || f.online === true).length;
    const onlineEl = homeFriends.querySelector('.home-btn-online');
    if (onlineEl) {
      onlineEl.textContent = onlineFriends > 0 ? (onlineFriends + ' en ligne') : '';
      onlineEl.style.display = onlineFriends > 0 ? 'block' : 'none';
    }
  }
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
            '<h3 style="margin:0">' + escapeHtml(p.display_name || 'AUPYGO') + '</h3>' +
            (meta ? '<p style="color:var(--muted);font-size:13px;margin:4px 0 0">' + escapeHtml(meta) + '</p>' : '') +
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
                // FREE / STANDARD / PREMIUM : message entre amis (quota à l'envoi)
        msgBtn = '<button class="btn btn-primary" style="width:100%" onclick="openConversation(\'dm\',\'' + f.id + '\',\'' + nameSafe + '\')">💬 Message</button>';

        const unread = unreadByFriend[f.id] || 0;
        const isUnread = unread > 0;
        const restrictedDot = ''; // plus de pastille premium-only
        card.innerHTML =
          '<div style="text-align:center;margin-bottom:12px;position:relative">' +
            '<button type="button" class="friend-remove-btn" title="Supprimer cet ami" onclick="event.stopPropagation();removeFriend(\'' + f.id + '\')" aria-label="Supprimer ami">×</button>' +
            '<div class="avatar' + (isUnread ? ' conv-blink' : '') + '" style="width:80px;height:80px;font-size:40px;margin:0 auto 8px;position:relative;display:inline-flex;align-items:center;justify-content:center">' + emoji + '</div>' +
            restrictedDot +
            '<h3 style="margin:0" class="' + (isUnread ? 'conv-name-unread' : '') + '">' + escapeHtml(f.name) + (isUnread ? ' <span class="conv-unread-count">' + unread + '</span>' : '') + '</h3>' +
            (meta ? '<p style="color:var(--muted);font-size:13px;margin:4px 0 0">' + escapeHtml(meta) + '</p>' : '') +
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


async function removeFriend(friendId) {
  if (!currentUser || !friendId) return;
  const p = getProfileById(friendId);
  const name = (p && p.display_name) || 'cet AUPYGO';
  const ok = confirm('Supprimer ' + name + ' de tes amis ?\n\nTous les messages privés avec cette personne seront définitivement supprimés.');
  if (!ok) return;

  try {
    const { data, error } = await supabaseClient.rpc('remove_friend_and_dm', {
      p_friend_id: friendId
    });
    if (error) throw error;

    // Nettoyage local
    myFriends = myFriends.filter(f => f.id !== friendId);
    delete dmConversationCache[friendId];
    delete unreadByFriend[friendId];
    // Nettoie aussi le cache conversation <-> ami
    Object.keys(friendIdByConversation || {}).forEach(cid => {
      if (friendIdByConversation[cid] === friendId) {
        delete friendIdByConversation[cid];
        myConversationIds.delete(cid);
        delete unreadByConversation[cid];
      }
    });

    showToast('Ami et messages privés supprimés', 'success');
    await renderFriendsUI();
    if (typeof renderConversationSidebar === 'function') renderConversationSidebar();
    updateMessagesBadge();
    updateFriendsBadge();

    if (activeConversation && activeConversation.type === 'dm' && activeConversation.id === friendId) {
      closeMobileChat();
      activeConversation = null;
      const header = document.getElementById('chatHeader');
      if (header) header.innerHTML = 'Sélectionne une conversation à gauche';
      const box = document.getElementById('chatMessages');
      if (box) box.innerHTML = '<div class="chat-placeholder"><p>Sélectionne une conversation</p></div>';
    }
  } catch (e) {
    console.error('removeFriend:', e);
    showToast('Erreur suppression ami : ' + (e.message || e), 'error');
  }
}



async function sendFriendRequestToMember(memberId) {
  if (!currentUser) {
    showToast(t('toast.friend_login_required'), 'error');
    closeMemberProfile();
    go('plans');
    return;
  }
  // FREE : max 5 demandes en attente envoyées. STANDARD / PREMIUM : illimité.
  if (String(currentPlan || 'FREE').toUpperCase() === 'FREE') {
    try {
      const { count, error: cntErr } = await supabaseClient
        .from('friendships')
        .select('id', { count: 'exact', head: true })
        .eq('from_id', currentUser.id)
        .eq('status', 'pending');
      if (cntErr) console.warn('[AUPYGO] friend free cap:', cntErr);
      if ((count || 0) >= 5) {
        showToast(t('friends.free_cap') || 'Maximum 5 demandes en attente en FREE. Passe en STANDARD pour en envoyer plus.', 'error');
        closeMemberProfile();
        go('plans');
        return;
      }
    } catch (e) { console.warn(e); }
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


function closeMobileChat() {
  const msgBox = document.getElementById('messagesBox');
  if (msgBox) msgBox.classList.remove('chat-open');
  activeConversation = null;
  const header = document.getElementById('chatHeader');
  if (header) {
    header.textContent = t('messages.select_conversation') || 'Sélectionne une conversation';
  }
  const input = document.getElementById('messageInput');
  const btn = document.getElementById('sendMsgBtn');
  if (input) { input.disabled = true; input.value = ''; }
  if (btn) btn.disabled = true;
  const box = document.getElementById('chatMessages');
  if (box) {
    box.innerHTML = '<div class="chat-placeholder"><div style="font-size:40px;margin-bottom:8px">💬</div><p>' +
      (t('messages.pick_to_start') || 'Choisis un ami pour commencer à discuter.') + '</p></div>';
  }
  if (typeof renderConversationSidebar === 'function') renderConversationSidebar();
}

async function openConversation(type, id, name) {

  if (!currentUser) {
    showToast(t('toast.friend_login_required') || 'Connecte-toi pour écrire', 'error');
    go('plans');
    return;
  }

  // Groupes : STANDARD et PREMIUM uniquement
  if (type === 'group') {
    const planG = String(currentPlan || 'FREE').toUpperCase();
    if (planG === 'FREE') {
      showToast(t('messages.groups_locked') || 'Groupes réservés à STANDARD et PREMIUM', 'error');
      go('plans');
      return;
    }
  }

  // DM : uniquement entre amis acceptés (tous forfaits)
  if (type === 'dm') {
    const st = getFriendshipStatusWith(id);
    if (st !== 'accepted') {
      if (st === 'pending') {
        showToast('⏳ Demande d’ami en attente.', 'error');
      } else if (st === 'refused' || st === 'rejected' || st === 'declined') {
        showToast('Demande d’ami refusée — messagerie indisponible.', 'error');
      } else {
        showToast('🤝 Vous devez être amis pour discuter. Envoie une demande d’ami d’abord.', 'error');
      }
      return;
    }
  }

  // Bascule sur l'onglet Messagerie
  if (getActivePage() !== 'messages') go('messages');

  // Mobile : passer de la liste des amis → au chat
  const msgBox = document.getElementById('messagesBox');
  if (msgBox) msgBox.classList.add('chat-open');

  const header = document.getElementById('chatHeader');
  if (header) {
    let actions = '';
    if (type === 'group') {
      const g = myGroups.find(x => x.id === id);
      const isCreator = g && g.created_by === currentUser.id;
      actions =
        '<div class="chat-header-actions">' +
          '<button type="button" class="btn-icon" onclick="leaveGroup(\'' + id + '\')" title="Quitter le groupe">🚪 Quitter</button>' +
          (isCreator ? '<button type="button" class="btn-icon danger" onclick="showDeleteGroupConfirm(\'' + id + '\')" title="Supprimer le groupe">🗑️ Supprimer</button>' : '') +
        '</div>';
    } else if (type === 'dm') {
      actions =
        '<div class="chat-header-actions">' +
          '<button type="button" class="btn-icon danger" onclick="removeFriend(\'' + id + '\')" title="Supprimer cet ami">× Ami</button>' +
        '</div>';
    }
    header.innerHTML =
      '<button type="button" class="chat-back-btn" onclick="closeMobileChat()" aria-label="Retour">←</button>' +
      '<span class="chat-header-title">' + escapeHtml((type === 'group' ? '👥 ' : '💬 ') + name) + '</span>' +
      actions;
  }

  const input = document.getElementById('messageInput');
  const btn = document.getElementById('sendMsgBtn');
  if (input) { input.disabled = false; input.focus(); }
  if (btn) btn.disabled = false;

  if (type === 'group') {
    activeConversation = { type: 'group', id, name, conversationId: id };
    renderConversationSidebar();

    const box = document.getElementById('chatMessages');
    if (box) box.innerHTML = '<div class="chat-placeholder"><p>Chargement…</p></div>';

    await loadConversationHistory(id);
    markConversationRead(id, null);
    return;
  }

  if (type !== 'dm') {
    activeConversation = { type, id, name, conversationId: null };
    const box = document.getElementById('chatMessages');
    if (box) box.innerHTML = '<div class="chat-placeholder"><p>Type de conversation inconnu.</p></div>';
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
  if (!currentUser) {
    showToast(t('toast.friend_login_required') || 'Connecte-toi pour écrire', 'error');
    return;
  }
  if (!activeConversation) {
    showToast(t('messages.select_first') || 'Sélectionne une conversation d’abord', 'error');
    return;
  }
  if (!activeConversation.conversationId) {
    showToast('Conversation en cours de préparation, réessaie dans un instant.', 'error');
    return;
  }

  // Quota FREE / STANDARD : 10 messages / jour (PREMIUM illimité)
  const quota = await refreshMessagesQuotaUI();
  if (!quota.allowed) {
    const plan = String(currentPlan || 'FREE').toUpperCase();
    if (plan === 'FREE') {
      showToast(t('messages.quota_reached') || 'Tu as utilisé tes 10 messages FREE.', 'error');
      const up = t('messages.quota_upgrade') || 'Passe en STANDARD pour continuer (10 messages/jour).';
      setTimeout(function(){ showToast(up, 'error'); }, 500);
      setTimeout(function(){ if (typeof go === 'function') go('plans'); }, 1200);
    } else {
      showToast(t('messages.quota_reached_daily') || 'Limite de messages atteinte pour aujourd’hui.', 'error');
    }
    return;
  }

  const input = document.getElementById('messageInput');
  if (!input || !input.value.trim()) return;
  const body = input.value.trim();

  const { error } = await supabaseClient
    .from('messages')
    .insert({
      conversation_id: activeConversation.conversationId,
      sender_id: currentUser.id,
      content: body
    });

  if (error) {
    console.error('sendMessage:', error);
    const errTxt = String(error.message || '') + ' ' + String(error.details || '') + ' ' + String(error.hint || '');
    if (/QUOTA_FREE_EXCEEDED|quota.*FREE|10 messages/i.test(errTxt)) {
      showToast(t('messages.quota_reached') || 'Tu as utilisé tes 10 messages gratuits.', 'error');
      setTimeout(function(){ showToast(t('messages.quota_upgrade') || 'Passe en STANDARD pour continuer.', 'error'); }, 500);
      setTimeout(function(){ if (typeof go === 'function') go('plans'); }, 1200);
    } else if (/QUOTA_DAILY_EXCEEDED|quota.*STANDARD|journalier/i.test(errTxt)) {
      showToast(t('messages.quota_reached_daily') || 'Limite de messages atteinte pour aujourd’hui.', 'error');
    } else {
      showToast('Erreur : ' + error.message, 'error');
    }
    return;
  }

  bumpLocalQuota();
  appendBubble(body, true, new Date());
  showToast(t('messages.sent'), 'success');
  input.value = '';
  refreshMessagesQuotaUI();
}

function setupMessagesRealtime() {
  if (!currentUser || messagesChannel) return;
  refreshMyConversationIds().then(() => {
    messagesChannel = supabaseClient
      .channel('messages-' + currentUser.id)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = payload.new;
          if (msg.sender_id === currentUser.id) return;

          // Conversation inconnue (ex. X vient de créer un DM avec moi) : on rafraîchit
          if (!myConversationIds.has(msg.conversation_id)) {
            refreshMyConversationIds().then(() => {
              if (myConversationIds.has(msg.conversation_id)) {
                loadUnreadCounts();
                loadMyGroups().then(renderConversationSidebar);
              }
            });
            return;
          }

          const isConversationOpen = activeConversation
            && (activeConversation.type === 'dm' || activeConversation.type === 'group')
            && activeConversation.conversationId === msg.conversation_id
            && getActivePage() === 'messages';

          if (isConversationOpen) {
            appendBubble(msg.content, false, msg.created_at);
            markConversationRead(msg.conversation_id, activeConversation.type === 'dm' ? activeConversation.id : null);
            return;
          }

          const isGroup = myGroups.some(g => g.id === msg.conversation_id);
          const friendId = isGroup ? null : friendIdByConversation[msg.conversation_id];

          unreadByConversation[msg.conversation_id] = (unreadByConversation[msg.conversation_id] || 0) + 1;
          if (friendId) unreadByFriend[friendId] = (unreadByFriend[friendId] || 0) + 1;
          else if (!isGroup) loadUnreadCounts(); // DM dont on ne connaît pas encore l'ami

          updateMessagesBadge();
          renderConversationSidebar();
          showToast('💬 ' + t('messages.new_message_toast'), 'success');
        }
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_invitations', filter: 'invited_user_id=eq.' + currentUser.id },
        () => loadGroupInvitations()
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
  groupInvitesQueue = [];
  groupInviteCurrent = null;
  if (typeof closeGroupInviteModal === 'function') closeGroupInviteModal();
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
      return (
        '<div class="conversation' + active + (isUnread ? ' has-unread' : '') + '" onclick="openConversation(\'dm\',\'' + f.id + '\',\'' + nameSafe + '\')">' +
          '<div class="conv-avatar' + (isUnread ? ' conv-blink' : '') + '">' + emoji +
            '<span class="conv-status-dot ' + (online ? 'online' : 'offline') + '"></span>' +
          '</div>' +
          '<div class="conv-meta"><div class="conv-name' + (isUnread ? ' conv-name-unread' : '') + '">' + escapeHtml(f.display_name || 'Ami') +
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
      const unread = unreadByConversation[g.id] || 0;
      const isUnread = unread > 0;
      const count = g.memberCount != null ? g.memberCount : 0;
      const titleSafe = (g.title || 'Groupe').replace(/'/g, "\\'");
      return (
        '<div class="conversation' + active + (isUnread ? ' has-unread' : '') + '" onclick="openConversation(\'group\',\'' + g.id + '\',\'' + titleSafe + '\')">' +
          '<div class="conv-avatar group' + (isUnread ? ' conv-blink' : '') + '">👥</div>' +
          '<div class="conv-meta"><div class="conv-name' + (isUnread ? ' conv-name-unread' : '') + '">' + escapeHtml(g.title || 'Groupe') +
            (isUnread ? ' <span class="conv-unread-count">' + unread + '</span>' : '') + '</div>' +
          '<div class="conv-preview">' + count + ' membres</div></div>' +
        '</div>'
      );
    }).join('');
  }
}

function openCreateGroupModal() {
  const planG = String(currentPlan || 'FREE').toUpperCase();
  if (planG === 'FREE') {
    showToast(t('messages.groups_locked') || 'Groupes réservés à STANDARD et PREMIUM', 'error');
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

async function createGroupChat() {
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

  const planG = String(currentPlan || 'FREE').toUpperCase();
  if (planG === 'FREE') {
    showToast(t('messages.groups_locked') || 'Groupes réservés à STANDARD et PREMIUM', 'error');
    go('plans');
    return;
  }

  if (!currentUser) {
    showToast(t('toast.friend_login_required') || 'Connecte-toi pour créer un groupe', 'error');
    go('plans');
    return;
  }

  try {
    const { data: convId, error } = await supabaseClient.rpc('create_group_conversation', {
      p_title: title,
      p_member_ids: groupPickIds
    });

    if (error) throw error;

    await refreshMyConversationIds();
    await loadMyGroups();
    closeCreateGroupModal();
    renderConversationSidebar();
    openConversation('group', convId, title.slice(0, 40));
    showToast('Groupe « ' + title.slice(0, 40) + ' » créé — invitations envoyées', 'success');
  } catch (e) {
    console.error('createGroupChat:', e);
    showToast('Erreur création groupe : ' + (e.message || e), 'error');
  }
}
async function loadMyGroups() {
  myGroups = [];
  if (!currentUser) return;

  try {
    const { data: memberRows, error } = await supabaseClient
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', currentUser.id);
    if (error) throw error;

    const convIds = (memberRows || []).map(r => r.conversation_id);
    if (!convIds.length) return;

    const { data: groups, error: gErr } = await supabaseClient
      .from('conversations')
      .select('id, title, created_by, created_at')
      .eq('type', 'group')
      .in('id', convIds)
      .order('created_at', { ascending: false });
    if (gErr) throw gErr;

    for (const g of (groups || [])) {
      const { count } = await supabaseClient
        .from('conversation_members')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', g.id);

      myGroups.push({
        id: g.id,
        title: g.title || 'Groupe',
        memberCount: count || 0,
        created_by: g.created_by
      });
    }
  } catch (e) {
    console.error('loadMyGroups:', e);
  }
}

async function loadFriendsForMessaging() {
  myFriends = [];
  try {
    if (currentUser) {
      await renderFriendsUI(); // met aussi à jour myFriends
      await loadMyGroups();
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
   SUPPRESSION D'UN GROUPE (créateur uniquement)
========================= */

/* =========================
   QUITTER / SUPPRIMER UN GROUPE
========================= */

function showDeleteGroupConfirm(convId) {
  const g = myGroups.find(x => x.id === convId);
  const title = (g && g.title) || 'ce groupe';
  // Crée le modal s\'il n\'existe pas
  let overlay = document.getElementById('deleteGroupOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'deleteGroupOverlay';
    overlay.className = 'aupygo-cleanup-overlay';
    overlay.innerHTML =
      '<div class="aupygo-cleanup-box">' +
        '<h3>⚠️ Attention</h3>' +
        '<p id="deleteGroupBody"></p>' +
        '<div class="aupygo-cleanup-actions">' +
          '<button type="button" class="btn btn-secondary" id="deleteGroupNoBtn">Non</button>' +
          '<button type="button" class="btn btn-primary" style="background:#dc2626;border-color:#dc2626" id="deleteGroupYesBtn">Oui, supprimer</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
  }
  const body = document.getElementById('deleteGroupBody');
  if (body) {
    body.innerHTML = 'Vous êtes sur le point de <strong>supprimer le groupe « ' + escapeHtml(title) + ' »</strong>.<br><br>' +
      'Tous les messages seront définitivement supprimés pour tous les membres. Cette action est irréversible.';
  }
  const yesBtn = document.getElementById('deleteGroupYesBtn');
  const noBtn = document.getElementById('deleteGroupNoBtn');
  if (yesBtn) {
    yesBtn.onclick = async function() {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
      await doDeleteGroup(convId);
    };
  }
  if (noBtn) {
    noBtn.onclick = function() {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
    };
  }
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

async function doDeleteGroup(convId) {
  const { error } = await supabaseClient.rpc('delete_group_conversation', { p_conv_id: convId });
  if (error) {
    console.error('deleteGroup:', error);
    showToast('Erreur suppression groupe : ' + (error.message || error), 'error');
    return;
  }

  myConversationIds.delete(convId);
  delete unreadByConversation[convId];
  myGroups = myGroups.filter(x => x.id !== convId);
  updateMessagesBadge();
  if (activeConversation && activeConversation.type === 'group' && activeConversation.id === convId) {
    closeMobileChat();
    activeConversation = null;
    const header = document.getElementById('chatHeader');
    if (header) header.innerHTML = 'Sélectionne une conversation à gauche';
    const box = document.getElementById('chatMessages');
    if (box) box.innerHTML = '<div class="chat-placeholder"><p>Sélectionne une conversation</p></div>';
  }
  renderConversationSidebar();
  showToast('Groupe supprimé', 'success');
}

// Alias pour compatibilité
async function deleteGroup(convId) {
  showDeleteGroupConfirm(convId);
}

async function leaveGroup(convId) {
  if (!currentUser || !convId) return;
  const g = myGroups.find(x => x.id === convId);
  const title = (g && g.title) || 'ce groupe';
  const ok = confirm('Quitter le groupe « ' + title + ' » ?\n\nSi tu es le dernier membre, tous les messages seront définitivement supprimés.');
  if (!ok) return;

  try {
    const { data, error } = await supabaseClient.rpc('leave_group_conversation', {
      p_conv_id: convId
    });
    if (error) throw error;

    myConversationIds.delete(convId);
    delete unreadByConversation[convId];
    myGroups = myGroups.filter(x => x.id !== convId);
    updateMessagesBadge();

    if (activeConversation && activeConversation.type === 'group' && activeConversation.id === convId) {
      closeMobileChat();
      activeConversation = null;
      const header = document.getElementById('chatHeader');
      if (header) header.innerHTML = 'Sélectionne une conversation à gauche';
      const box = document.getElementById('chatMessages');
      if (box) box.innerHTML = '<div class="chat-placeholder"><p>Sélectionne une conversation</p></div>';
    }
    renderConversationSidebar();

    if (data && data.group_deleted) {
      showToast('Groupe et messages supprimés (plus de membres)', 'success');
    } else {
      showToast('Tu as quitté le groupe', 'success');
    }
  } catch (e) {
    console.error('leaveGroup:', e);
    showToast('Erreur en quittant le groupe : ' + (e.message || e), 'error');
  }
}



/* =========================
   INVITATIONS DE GROUPE (popup Accepter / Refuser)
========================= */
let groupInvitesQueue = [];
let groupInviteCurrent = null;

function injectGroupInviteModal() {
  if (document.getElementById('groupInviteOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'groupInviteOverlay';
  overlay.className = 'aupygo-cleanup-overlay';
  overlay.innerHTML =
    '<div class="aupygo-cleanup-box">' +
      '<h3>👥 Invitation à un groupe</h3>' +
      '<p id="groupInviteBody"></p>' +
      '<div class="aupygo-cleanup-actions">' +
        '<button type="button" class="btn btn-secondary" onclick="respondGroupInvite(false)">Refuser</button>' +
        '<button type="button" class="btn btn-primary" onclick="respondGroupInvite(true)">Accepter</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
}

function closeGroupInviteModal() {
  const overlay = document.getElementById('groupInviteOverlay');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}

async function loadGroupInvitations() {
  if (!currentUser) return;
  const { data, error } = await supabaseClient.rpc('get_my_group_invitations');
  if (error) { console.error('loadGroupInvitations:', error); return; }
  groupInvitesQueue = data || [];
  showNextGroupInvite();
}

function showNextGroupInvite() {
  if (groupInviteCurrent) return; // un popup est déjà affiché
  const inv = groupInvitesQueue[0];
  if (!inv) return;
  groupInviteCurrent = inv;
  injectGroupInviteModal();
  const body = document.getElementById('groupInviteBody');
  if (body) {
    body.innerHTML =
      '<strong>' + escapeHtml(inv.inviter_name || 'Un ami') + '</strong> t’invite à rejoindre le groupe ' +
      '<strong>« ' + escapeHtml(inv.title || 'Groupe') + ' »</strong>.';
  }
  document.getElementById('groupInviteOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

async function respondGroupInvite(accept) {
  const inv = groupInviteCurrent;
  if (!inv) return;

  const { error } = await supabaseClient.rpc('respond_group_invitation', {
    p_invitation_id: inv.invitation_id,
    p_accept: accept
  });

  groupInviteCurrent = null;
  closeGroupInviteModal();

  const removeInv = () => {
    groupInvitesQueue = groupInvitesQueue.filter(i => i.invitation_id !== inv.invitation_id);
  };

  if (error) {
    console.error('respondGroupInvite:', error);
    const txt = String(error.message || '');
    if (/GROUP_FULL/.test(txt)) {
      showToast('Ce groupe est complet (5 personnes max).', 'error');
      removeInv();
    } else if (/INVITATION_NOT_FOUND/.test(txt)) {
      removeInv();
    } else {
      showToast('Erreur : ' + txt, 'error');
      removeInv();
    }
  } else {
    removeInv();
    if (accept) {
      showToast('Tu as rejoint « ' + (inv.title || 'le groupe') + ' »', 'success');
      await refreshMyConversationIds();
      await loadMyGroups();
      renderConversationSidebar();
    } else {
      showToast('Invitation refusée', 'success');
    }
  }
  showNextGroupInvite(); // enchaîne sur l'invitation suivante
}

/* =========================
   LANGUES
========================= */

// Langue courante (persistée). Déclarée ici pour éviter ReferenceError au chargement.
let currentLang = localStorage.getItem('aupygo_lang') || 'fr';

// Applique les traductions via i18n.js (applyI18n) + zones dynamiques
function applyTranslations() {
  if (typeof applyI18n === 'function') {
    applyI18n(currentLang);
  } else {
    console.warn('applyI18n non disponible (i18n.js manquant ?)');
  }
  // Met à jour les zones dynamiques non marquées data-i18n
  if (typeof updateOnlineCount === 'function') updateOnlineCount();
  if (typeof renderConversationSidebar === 'function') renderConversationSidebar();
}

function changeLanguage(lang) {
  if (!I18N || !I18N[lang]) return;
  currentLang = lang;
  localStorage.setItem('aupygo_lang', lang);
  const sel = document.getElementById('language');
  if (sel) sel.value = lang;
  applyTranslations();
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

/* =========================
   BADGES ACCUEIL — SORTIES / AGENDA
========================= */

function getEventsFingerprint() {
  // Empreinte basée sur les sorties réelles chargées
  if (cachedEvents && cachedEvents.length) {
    return cachedEvents.map(e => e.id + ':' + (e.event_participants || []).length).join('|');
  }
  const nodes = document.querySelectorAll('#events .agenda-event, #eventGrid .event');
  const texts = Array.from(nodes).map(n => (n.textContent || '').trim()).filter(Boolean);
  return texts.join('|') + '::' + texts.length;
}

function updateEventsBadge() {
  const homeEvents = document.getElementById('homeBtnEvents');
  const navEvents = document.querySelector('button[data-nav="events"], #bottomNav [data-nav="events"]');
  const fp = getEventsFingerprint();
  let lastSeen = '';
  try { lastSeen = localStorage.getItem('aupygo_events_seen') || ''; } catch (e) {}

  const isNew = fp && fp !== lastSeen && fp.length > 2;
  // Si on est déjà sur la page events, on marque comme vu
  if (typeof getActivePage === 'function' && getActivePage() === 'events') {
    try { localStorage.setItem('aupygo_events_seen', fp); } catch (e) {}
    if (homeEvents) homeEvents.classList.remove('nav-blink', 'has-new-events');
    if (navEvents) navEvents.classList.remove('nav-blink', 'has-new-events');
    return;
  }

  if (homeEvents) {
    if (isNew) homeEvents.classList.add('nav-blink', 'has-new-events');
    else homeEvents.classList.remove('nav-blink', 'has-new-events');
    const badge = homeEvents.querySelector('.home-btn-badge');
    if (badge) {
      if (isNew) { badge.textContent = '!'; badge.classList.add('show'); }
      else { badge.classList.remove('show'); }
    }
  }
  if (navEvents) {
    if (isNew) navEvents.classList.add('nav-blink', 'has-new-events');
    else navEvents.classList.remove('nav-blink', 'has-new-events');
  }
}

function markEventsSeen() {
  try { localStorage.setItem('aupygo_events_seen', getEventsFingerprint()); } catch (e) {}
  updateEventsBadge();
}

/** Surligne les jours de l'agenda qui ont une activité (couleur violette/rose sympa) */
function highlightAgendaDays() {
  document.querySelectorAll('.calendar .day').forEach(day => {
    const hasEvent = day.querySelector('.agenda-event');
    if (hasEvent) day.classList.add('day-has-activity');
    else day.classList.remove('day-has-activity');
  });
}


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
    .avatar.conv-blink,
    
    .home-btn-badge {
      display: none;
      position: absolute;
      top: 8px;
      right: 8px;
      min-width: 20px;
      height: 20px;
      padding: 0 6px;
      border-radius: 10px;
      background: linear-gradient(135deg, #3b82f6, #7c3aed);
      color: #fff;
      font-size: 11px;
      font-weight: 800;
      line-height: 20px;
      text-align: center;
      box-shadow: 0 2px 8px rgba(124, 58, 237, 0.4);
    }
    .home-btn-badge.show { display: block; }
    .home-btn-online {
      display: none;
      font-size: 11px;
      font-weight: 600;
      color: #16a34a;
      margin-top: 2px;
    }
    #homeBtnMap.nav-blink,
    #homeBtnFriends.nav-blink,
    #homeBtnEvents.nav-blink,
    #homeBtnMessages.nav-blink,
    #navFriends.nav-blink,
    button[data-nav="events"].nav-blink {
      animation: aupygoBlinkBlue 1.1s ease-in-out infinite;
    }
    #navFriends.has-requests.nav-blink {
      animation: aupygoBlinkPink 1.1s ease-in-out infinite;
    }
    @keyframes aupygoBlinkPink {
      0%, 100% { box-shadow: 0 0 0 0 rgba(236, 72, 153, 0.65); }
      50% { box-shadow: 0 0 0 6px rgba(236, 72, 153, 0); }
    }
    /* Agenda : jour avec activité */
    .calendar .day.day-has-activity {
      background: linear-gradient(145deg, #f5f3ff 0%, #fce7f3 100%);
      border: 2px solid #c4b5fd;
      box-shadow: 0 0 0 1px rgba(124, 58, 237, 0.15), 0 4px 12px rgba(236, 72, 153, 0.12);
    }
    .calendar .day.day-has-activity strong {
      color: #7c3aed;
      font-weight: 800;
    }
    .calendar .day.day-has-activity .agenda-event {
      background: linear-gradient(135deg, #7c3aed, #ec4899);
      color: #fff;
      font-weight: 600;
    }

    #homeBtnMessages.nav-blink {
      animation: aupygoBlinkBlue 1.1s ease-in-out infinite;
    }
    #navMessages.nav-blink,
    .conv-avatar.conv-blink,
    .avatar.conv-blink {
      border-radius: 50%;
    }
    #homeBtnMessages.nav-blink {
      box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.65);
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
    .friend-remove-btn {
      position: absolute;
      top: 0;
      right: 0;
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 50%;
      background: #fee2e2;
      color: #dc2626;
      font-size: 18px;
      line-height: 28px;
      cursor: pointer;
      z-index: 2;
      padding: 0;
    }
    .friend-remove-btn:hover {
      background: #fecaca;
    }
    .chat-system-msg {
      text-align: center;
      color: var(--muted, #64748b);
      font-size: 13px;
      font-style: italic;
      margin: 10px 0;
      padding: 6px 12px;
    }
    .chat-header-actions {
      display: flex;
      gap: 6px;
      margin-left: auto;
      align-items: center;
    }
    .chat-header-actions .btn-icon {
      background: transparent;
      border: 1px solid var(--border, #e2e8f0);
      border-radius: 8px;
      padding: 4px 10px;
      font-size: 13px;
      cursor: pointer;
      color: var(--text, #0f172a);
    }
    .chat-header-actions .btn-icon.danger {
      color: #dc2626;
      border-color: #fecaca;
    }
    .chat-header-actions .btn-icon:hover {
      background: #f1f5f9;
    }

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
  
    /* === Agenda rôles + urgence sorties === */
    .agenda-role-organizer,
    .event.agenda-role-organizer {
      background: linear-gradient(135deg, rgba(34,197,94,0.12), rgba(34,197,94,0.04));
      border-left: 4px solid #22c55e;
    }
    .agenda-role-participant,
    .event.agenda-role-participant {
      background: linear-gradient(135deg, rgba(59,130,246,0.12), rgba(59,130,246,0.04));
      border-left: 4px solid #3b82f6;
    }
    .agenda-role-pill {
      display: inline-block;
      font-size: 11px;
      margin-left: 6px;
      padding: 2px 8px;
      border-radius: 999px;
      background: rgba(0,0,0,0.06);
      font-weight: 600;
    }
    .agenda-role-organizer .agenda-role-pill { background: rgba(34,197,94,0.2); color: #15803d; }
    .agenda-role-participant .agenda-role-pill { background: rgba(59,130,246,0.2); color: #1d4ed8; }
    .agenda-role-friends,
    .event.agenda-role-friends {
      background: linear-gradient(135deg, rgba(168,85,247,0.14), rgba(168,85,247,0.04));
      border-left: 4px solid #a855f7;
    }
    .agenda-role-friends .agenda-role-pill { background: rgba(168,85,247,0.22); color: #7e22ce; }
    .agenda-week .day {
      min-height: 72px;
    }
    .agenda-week .day-date {
      font-weight: 500;
      opacity: 0.75;
      font-size: 12px;
    }
    .agenda-week .day-today {
      outline: 2px solid var(--primary, #7c3aed);
      border-radius: 10px;
    }
    .agenda-week .day-empty {
      font-size: 12px;
      opacity: 0.4;
    }


    @keyframes aupygoBlinkOrange {
      0%, 100% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.7); }
      50% { box-shadow: 0 0 0 8px rgba(249, 115, 22, 0); }
    }
    @keyframes aupygoBlinkRed {
      0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.75); }
      50% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
    }
    .urgency-orange,
    .event-blink-orange {
      animation: aupygoBlinkOrange 1.1s ease-in-out infinite;
      outline: 2px solid #f97316;
    }
    .urgency-red,
    .event-blink-red {
      animation: aupygoBlinkRed 0.7s ease-in-out infinite;
      outline: 2px solid #ef4444;
    }
    .urgency-past,
    .urgency-expired {
      opacity: 0.45;
      filter: grayscale(0.85);
      animation: none !important;
      outline: none !important;
    }
    .day.urgency-orange .agenda-event { color: #c2410c; font-weight: 700; }
    .day.urgency-red .agenda-event { color: #b91c1c; font-weight: 700; }

    .agenda-week .day-clickable { cursor: pointer; transition: background .15s; }
    .agenda-week .day-clickable:hover { background: rgba(124,58,237,0.08); }
    .agenda-week .day-selected {
      background: rgba(124,58,237,0.12);
      outline: 2px solid #7c3aed;
      border-radius: 10px;
    }
    .day-count {
      display: inline-block;
      margin-top: 4px;
      font-size: 11px;
      font-weight: 600;
      color: var(--primary, #7c3aed);
    }
    @keyframes aupygoBlinkYellow {
      0%, 100% { box-shadow: 0 0 0 0 rgba(234, 179, 8, 0.75); background-color: rgba(250, 204, 21, 0.25); }
      50% { box-shadow: 0 0 0 8px rgba(234, 179, 8, 0); background-color: rgba(250, 204, 21, 0.55); }
    }
    .day-pending-blink,
    .agenda-item.invite-pending,
    .event-invite-pending {
      animation: aupygoBlinkYellow 1s ease-in-out infinite;
    }
    /* Cartes sorties compactes */
    .event-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 10px;
    }
    .event {
      padding: 0;
      margin: 0;
      border-radius: 12px;
      overflow: hidden;
      font-size: 13px;
    }
    .event .event-cover {
      font-size: 28px;
      padding: 10px 8px 4px;
      text-align: center;
      line-height: 1.2;
    }
    .event .event-body {
      padding: 6px 10px 10px;
    }
    .event .event-body h3 {
      font-size: 14px !important;
      margin: 4px 0 6px !important;
      line-height: 1.25;
    }
    .event .event-details {
      font-size: 11px;
      margin: 2px 0;
    }
    .event .badge {
      font-size: 10px;
      padding: 2px 6px;
    }
    .event .btn, .event .event-join {
      font-size: 12px !important;
      padding: 6px 10px !important;
      margin-top: 6px !important;
      width: 100%;
    }
    .event-actions-row {
      display: flex;
      gap: 6px;
      align-items: center;
      margin-top: 6px;
    }
    .event-actions-row .btn { width: auto; flex: 1; }
    .member-refused-gray {
      filter: grayscale(1);
      opacity: 0.72;
    }
    #eventDayFilterBar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin-bottom: 12px;
      font-size: 13px;
    }
`;
  document.head.appendChild(style);
}

document.addEventListener('DOMContentLoaded', async () => {
  injectMessagingNotificationStyles();
  if (typeof highlightAgendaDays === 'function') highlightAgendaDays();
  if (typeof updateEventsBadge === 'function') updateEventsBadge();

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMemberProfile();
      closeGeoConsent();
      if (typeof closeCreateGroupModal === 'function') closeCreateGroupModal();
      if (typeof closeCreateEventModal === 'function') closeCreateEventModal();
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
  if (currentUser) loadGroupInvitations();
  if (typeof updateFriendsBadge === 'function') updateFriendsBadge();

  // Si déjà connecté au chargement → statut en ligne (sauf admin, incognito) + watch inactivité
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
      loadGroupInvitations();
      loadMyGroups().then(renderConversationSidebar); // retire un groupe supprimé par son créateur
    }
  }, 60000);
  // Un retour sur l'onglet / la fenêtre revérifie tout de suite les non-lus,
  // sans attendre le prochain tick des 60 s (utile en multi-onglets).
  window.addEventListener('focus', () => {
    if (currentUser) {
      loadUnreadCounts();
      loadGroupInvitations();
    }
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
      currentUserIsAdmin = false;
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
