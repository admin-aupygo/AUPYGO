/* =========================
   AUTHENTIFICATION & ADMIN
========================= */
const ADMIN_EMAIL = 'aupygo@protonmail.com';
let currentUserIsAdmin = false;

/** Vérification stricte des privilèges Administrateur */
function isAdmin() {
  if (currentUserIsAdmin) return true;
  return !!(
    currentUser && 
    currentUser.email && 
    currentUser.email.toLowerCase() === ADMIN_EMAIL
  );
}

/** 
 * Mise à jour du statut en ligne.
 * L'administrateur reste en mode incognito/fantôme sur la carte.
 */
async function setOnlineStatus(online) {
  if (!currentUser) return;
  if (isAdmin()) return; // Incognito Admin : ne met pas à jour last_seen pour rester invisible

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
    console.error('Erreur setOnlineStatus:', e);
  }
}

/** 
 * Rafraîchissement de l'interface utilisateur lors de la connexion
 */
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

    // Récupération des données du profil avec le flag is_admin
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('subscription, display_name, age, gender, country, bio, interests, identity_locked, languages, other_language, host_country, stay_end, city, is_admin')
      .eq('id', user.id)
      .maybeSingle();

    // Détection Admin via BDD ou email de secours
    currentUserIsAdmin = !!(profile && profile.is_admin === true) || 
      !!(user.email && user.email.toLowerCase() === ADMIN_EMAIL);

    if (profile && profile.subscription) {
      currentPlan = profile.subscription;
      localStorage.setItem('aupygo_plan', currentPlan);
      updatePlanUI();
    }

    // Un administrateur obtient automatiquement l'accès PREMIUM complet
    if (isAdmin()) {
      currentPlan = 'PREMIUM';
      localStorage.setItem('aupygo_plan', 'PREMIUM');
      updatePlanUI();
    }

    updateNavVisibility();

    if (justLoggedIn) {
      const finalRedirect = profileSaved ? redirectPage : 'profile';
      go(finalRedirect);
      setOnlineStatus(true);
    }
  } else {
    if (loggedOut) loggedOut.style.display = 'block';
    if (loggedIn) loggedIn.style.display = 'none';
    profileSaved = false;
    unlockIdentityFields();
    updateNavVisibility();
  }
}
