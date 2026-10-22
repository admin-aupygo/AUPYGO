/* AUPYGO — cdc-fixes.js (restored minimal + delete-user)
 * Logo staff: js/aupygo-staff-logo.js
 */
(function () {
  'use strict';

  window.handleDeleteProfile = async function handleDeleteProfile() {
    if (!window.currentUser) {
      if (typeof showToast === 'function') showToast('Connecte-toi', 'error');
      return;
    }
    var confirmed = confirm(
      'Vous êtes sur le point de supprimer définitivement votre compte.\n\nCette action est irréversible.\n\nContinuer ?'
    );
    if (!confirmed) return;
    var client = window.supabaseClient || window.supabase;
    if (!client) return;
    try {
      if (typeof showToast === 'function') showToast('Suppression du compte...', 'success');
      var sessionRes = await client.auth.getSession();
      var token = sessionRes && sessionRes.data && sessionRes.data.session && sessionRes.data.session.access_token;
      if (!token) throw new Error('Session expirée');
      var base = (window.SUPABASE_URL || window.supabaseUrl || client.supabaseUrl || '').replace(/\/$/, '');
      if (!base) throw new Error('SUPABASE_URL manquant');
      var anon = window.SUPABASE_ANON_KEY || window.supabaseAnonKey || '';
      var res = await fetch(base + '/functions/v1/delete-user', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, apikey: anon, 'Content-Type': 'application/json' }
      });
      var body = {};
      try { body = await res.json(); } catch (e) {}
      if (!res.ok) throw new Error(body.error || body.message || ('HTTP ' + res.status));
      if (typeof showToast === 'function') showToast('Compte supprimé définitivement.', 'success');
      try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
      try { await client.auth.signOut({ scope: 'global' }); } catch (e) { try { await client.auth.signOut(); } catch (e2) {} }
      window.currentUser = null;
      try { currentUser = null; } catch (e) {}
      if (typeof go === 'function') go('plans');
    } catch (e) {
      console.error('[handleDeleteProfile]', e);
      if (typeof showToast === 'function') showToast((e && e.message) || 'Erreur suppression', 'error');
    }
  };

  console.log('[AUPYGO] cdc-fixes.js restored (minimal safe)');
})();
