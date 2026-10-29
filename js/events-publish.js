/* AUPYGO events-publish-fix.js
 *
 * Problème : un événement créé par l'Amiral (spécial / payant) était
 * enregistré avec visibility = 'admin'. La RLS Supabase ne renvoie
 * alors ces lignes qu'au staff → les users ne voient RIEN et ne
 * reçoivent aucune invitation.
 *
 * Correctif :
 * 1. À la création par Amiral → visibility 'public' + is_special si besoin
 * 2. Événements payants Amiral → publiés tout de suite (pas de file d'attente)
 * 3. File d'attente [EN_ATTENTE...] réservée au staff non-Amiral
 * 4. Republie côté client les events admin déjà créés par l'Amiral (best-effort)
 */
(function () {
  'use strict';

  function isAmiralNow() {
    try {
      if (typeof isAmiral === 'function' && isAmiral()) return true;
      if (typeof isAdmin === 'function' && isAdmin()) return true;
    } catch (e) {}
    return false;
  }

  function patchSubmitCreateEvent() {
    if (typeof window.submitCreateEvent !== 'function') return false;
    if (window._eventsPublishSubmitPatched) return true;
    window._eventsPublishSubmitPatched = true;

    var orig = window.submitCreateEvent;
    window.submitCreateEvent = async function () {
      // Laisser le flux d'origine s'exécuter, puis forcer public si Amiral
      var beforeIds = new Set(
        (window.cachedEvents || []).map(function (e) { return e && e.id; }).filter(Boolean)
      );

      await orig.apply(this, arguments);

      if (!isAmiralNow() || !window.currentUser) return;

      try {
        var client = window.supabaseClient || window.supabase;
        if (!client) return;

        // Trouver le dernier event créé par l'Amiral
        if (typeof loadAndRenderEvents === 'function') {
          try { await loadAndRenderEvents(); } catch (e0) {}
        }

        var newest = (window.cachedEvents || []).find(function (e) {
          return e && !beforeIds.has(e.id) && e.creator_id === window.currentUser.id;
        });

        if (!newest) {
          // Fallback : requêter directement
          var res = await client
            .from('events')
            .select('id, visibility, is_special_aupygo, is_paid, price, description, creator_id')
            .eq('creator_id', window.currentUser.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          newest = res.data;
        }

        if (!newest || !newest.id) return;

        var payload = {};
        // Toujours publier en public pour que la RLS laisse passer les users
        if (newest.visibility === 'admin' || newest.visibility === 'admin_only') {
          payload.visibility = 'public';
        }
        // Retirer le tag d'attente si présent (Amiral = déjà validé)
        var desc = newest.description || '';
        if (desc.indexOf('[EN_ATTENTE_VALIDATION_ADMIN]') !== -1) {
          payload.description = desc.replace(/\[EN_ATTENTE_VALIDATION_ADMIN\]\s*/g, '').trim() || null;
        }

        if (Object.keys(payload).length) {
          var { error } = await client.from('events').update(payload).eq('id', newest.id);
          if (error) {
            console.warn('[events-publish-fix] update', error);
          } else {
            console.log('[events-publish-fix] event publié public:', newest.id);
            if (typeof showToast === 'function') {
              showToast('✅ Événement publié — visible par tous les utilisateurs', 'success');
            }
            if (typeof loadAndRenderEvents === 'function') {
              try { await loadAndRenderEvents(); } catch (e1) {}
            }
          }
        }
      } catch (err) {
        console.warn('[events-publish-fix]', err);
      }
    };

    return true;
  }

  /** Republie les events admin créés par l'Amiral courant (session active). */
  async function republishMyAdminEvents() {
    if (!isAmiralNow() || !window.currentUser) return;
    var client = window.supabaseClient || window.supabase;
    if (!client) return;
    try {
      var res = await client
        .from('events')
        .select('id, visibility, description')
        .eq('creator_id', window.currentUser.id)
        .in('visibility', ['admin', 'admin_only'])
        .limit(50);
      var rows = res.data || [];
      for (var i = 0; i < rows.length; i++) {
        var ev = rows[i];
        var desc = (ev.description || '').replace(/\[EN_ATTENTE_VALIDATION_ADMIN\]\s*/g, '').trim();
        await client.from('events').update({
          visibility: 'public',
          description: desc || null
        }).eq('id', ev.id);
      }
      if (rows.length && typeof loadAndRenderEvents === 'function') {
        await loadAndRenderEvents();
      }
      if (rows.length) {
        console.log('[events-publish-fix] republished', rows.length, 'admin events as public');
      }
    } catch (e) {
      console.warn('[events-publish-fix] republish', e);
    }
  }

  function boot() {
    if (!patchSubmitCreateEvent()) {
      setTimeout(boot, 500);
      setTimeout(boot, 1500);
      return;
    }
    // Republier une fois après login
    setTimeout(republishMyAdminEvents, 2000);
    setTimeout(republishMyAdminEvents, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  setTimeout(boot, 800);

  console.log('[AUPYGO] events-publish-fix.js chargé');
})();
