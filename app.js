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
      .select('subscription, display_name, age, gender, country, bio, interests, identity_locked, languages, other_language, host_country, stay_end, city')
      .eq('id', user.id)
      .maybeSingle();

    if (profile && profile.subscription) {
      currentPlan = profile.subscription;
      localStorage.setItem('aupygo_plan', currentPlan);
      updatePlanUI();
    }

    // Mode Admin : accès Premium automatique, quel que soit l'abonnement
    // enregistré en base (le trigger SQL force déjà subscription='PREMIUM',
    // ceci est une sécurité supplémentaire côté client).
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
    let data = null;
    let error = null;

    const viewRes = await supabaseClient.from('map_profiles').select(cols);
    if (!viewRes.error && viewRes.data) {
      data = viewRes.data;
    } else {
      if (viewRes.error) {
        console.warn('[AUPYGO] map_profiles indisponible, fallback profiles:', viewRes.error.message || viewRes.error);
      }
      const tableRes = await supabaseClient.from('profiles').select(cols);
      data = tableRes.data;
      error = tableRes.error;
    }

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
  const showMessage = !!currentUser; // messagerie dès FREE (quota à l'envoi)

  // Demande d'ami : accessible dès FREE (plafond 5 en attente)
  const canSendFriendRequest = !!currentUser; // FREE inclus (plafond 5 demandes en attente)

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

  const friendBtn = canSendFriendRequest
    ? '<button type="button" class="member-friend-btn" onclick="sendFriendRequestToMember(\'' + member.id + '\')">🤝 Demande d\u2019ami</button>'
    : '<p style="margin-top:12px;font-size:12px;color:#9ca3af">Connecte-toi pour envoyer une demande d\u2019ami</p>';

  // Visiteur PREMIUM face à un profil non-PREMIUM : pastille rouge explicative
  // sur l'avatar (messagerie privée indisponible pour ce contact).
  const restrictedBadge = ''; // plus de pastille premium-only

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
  if (!currentUser) {
    showToast(t('toast.friend_login_required') || 'Connecte-toi pour écrire', 'error');
    closeMemberProfile();
    go('plans');
    return;
  }
  const raw = profiles.find(m => m.id === memberId);
  if (!raw) return;
  const name = raw.display_name || 'AUPYGO';
  // FREE / STANDARD / PREMIUM : messagerie (quota à l'envoi). Plus d'exigence PREMIUM mutuel.
  closeMemberProfile();
  openConversation('dm', memberId, name);
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

    const profileName
