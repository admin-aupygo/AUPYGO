/* AUPYGO create-event-rpc-fix.js
 * Contourne l'échec INSERT direct RLS 42501 en passant par
 * la RPC SECURITY DEFINER public.create_event(...).
 * Les règles métier (staff / payant / special) restent côté serveur.
 */
(function () {
  'use strict';

  function client() {
    return window.supabaseClient || window.supabase || null;
  }

  function isAdminNow() {
    try {
      if (typeof isAmiral === 'function' && isAmiral()) return true;
      if (typeof isAdmin === 'function' && isAdmin()) return true;
    } catch (e) {}
    return false;
  }

  async function createViaRpc(row) {
    var c = client();
    if (!c) throw new Error('Supabase client manquant');
    var { data, error } = await c.rpc('create_event', {
      p_title: row.title,
      p_address: row.address,
      p_event_date: row.event_date,
      p_type: row.type || 'other',
      p_emoji: row.emoji || '🎉',
      p_description: row.description || null,
      p_max_participants: row.max_participants || 8,
      p_visibility: row.visibility || 'public',
      p_is_paid: !!row.is_paid,
      p_price: Number(row.price) || 0,
      p_is_special_aupygo: !!row.is_special_aupygo,
      p_reservation_confirmed: !!row.reservation_confirmed
    });
    if (error) throw error;
    return data;
  }

  function patchSubmitCreateEvent() {
    if (typeof window.submitCreateEvent !== 'function') return false;
    if (window._createEventRpcPatched) return true;
    window._createEventRpcPatched = true;

    var orig = window.submitCreateEvent;
    window.submitCreateEvent = async function () {
      if (!window.currentUser) return;

      var titleEl = document.getElementById('createEventTitleInput');
      var addressEl = document.getElementById('createEventAddress');
      var descEl = document.getElementById('createEventDesc');
      var maxEl = document.getElementById('createEventMax');
      var dateEl = document.getElementById('createEventDate');
      var visEl = document.getElementById('createEventVisibility');

      var title = (titleEl && titleEl.value || '').trim();
      var address = (addressEl && addressEl.value || '').trim();
      var desc = (descEl && descEl.value || '').trim();
      var maxP = parseInt(maxEl && maxEl.value, 10) || 8;
      var dateVal = dateEl && dateEl.value;
      var visibility = (visEl && visEl.value) || 'public';

      if (!title || !address || !dateVal) {
        if (typeof showToast === 'function') {
          showToast(typeof t === 'function' ? t('toast.event_fill_required') : 'Remplis les champs obligatoires.', 'error');
        }
        return;
      }

      var selectedEventType = window.selectedEventType || 'other';
      var selectedEventEmoji = window.selectedEventEmoji || '🎉';
      var isRest = selectedEventType === 'restaurant';
      var hardMax = isRest ? 10 : 200;
      if (maxP < 2 || maxP > hardMax) {
        if (typeof showToast === 'function') {
          showToast(isRest ? 'Restaurant : maximum 10 AupyGo.' : 'Nombre de personnes entre 2 et 200.', 'error');
        }
        return;
      }

      if (isRest) {
        var cb = document.getElementById('restaurantReservationDone');
        if (!cb || !cb.checked) {
          var ok = confirm(
            (typeof t === 'function' ? t('confirm.restaurant_reservation') : '') +
            'OK = réservation faite — publier\nAnnuler = revenir en arrière'
          );
          if (!ok) {
            if (typeof showToast === 'function') {
              showToast(typeof t === 'function' ? t('toast.event_reservation_confirm') : 'Confirme la réservation.', 'error');
            }
            return;
          }
          if (cb) cb.checked = true;
        }
      }

      var eventDate = new Date(dateVal);
      if (isNaN(eventDate.getTime()) || eventDate.getTime() < Date.now() - 3600000) {
        if (typeof showToast === 'function') {
          showToast(typeof t === 'function' ? t('toast.event_date_future') : 'Date invalide.', 'error');
        }
        return;
      }

      if (visibility === 'admin' && !isAdminNow()) {
        if (typeof showToast === 'function') {
          showToast(typeof t === 'function' ? t('toast.admin_only_short') : 'Réservé admin.', 'error');
        }
        return;
      }

      try {
        var paidRadio = document.querySelector('input[name="eventPaid"]:checked');
        var isPaid = !!(paidRadio && paidRadio.value === 'paid') && isAdminNow();
        var price = 0;
        if (isPaid) {
          var priceEl = document.getElementById('createEventPrice');
          price = parseFloat(priceEl && priceEl.value) || 0;
        }
        var isSpecial = visibility === 'admin' || selectedEventType === 'special';
        var isFriends = visibility === 'friends';
        var friendIds = isFriends && typeof getSelectedFriendIdsForEvent === 'function'
          ? getSelectedFriendIdsForEvent()
          : [];
        if (isFriends && !friendIds.length) {
          if (typeof showToast === 'function') {
            showToast(typeof t === 'function' ? t('toast.event_invite_friend') : 'Invite au moins un ami.', 'error');
          }
          return;
        }

        var resCb = document.getElementById('restaurantReservationDone');
        var reservationConfirmed = !!(isRest && resCb && resCb.checked);
        var finalMax = maxP;
        if (isFriends) finalMax = Math.max(2, friendIds.length + 1);
        if (isRest) finalMax = Math.min(finalMax, 10);

        var row = {
          title: title,
          type: selectedEventType,
          emoji: selectedEventEmoji,
          description: desc || null,
          address: address,
          event_date: eventDate.toISOString(),
          max_participants: finalMax,
          visibility: isSpecial ? 'admin' : visibility,
          is_paid: isPaid,
          price: isPaid ? price : 0,
          is_special_aupygo: isSpecial,
          reservation_confirmed: reservationConfirmed
        };

        var data = await createViaRpc(row);

        // Invitations amis (si applicable)
        if (visibility === 'friends' && friendIds.length && data && data.id) {
          var c = client();
          for (var i = 0; i < friendIds.length; i++) {
            try {
              await c.from('event_invitations').insert({
                event_id: data.id,
                from_id: window.currentUser.id,
                to_id: friendIds[i],
                status: 'pending'
              });
            } catch (eInv) {}
          }
        }

        if (typeof showToast === 'function') {
          showToast(typeof t === 'function' ? t('toast.event_created') : 'Sortie créée !', 'success');
        }

        // Fermer le formulaire si possible
        try {
          var form = document.getElementById('createEventForm');
          if (form) form.reset();
          var modal = document.getElementById('createEventModal') ||
            document.querySelector('.create-event-modal, #createEventOverlay');
          if (modal) modal.style.display = 'none';
        } catch (eClose) {}

        if (typeof loadAndRenderEvents === 'function') {
          try { await loadAndRenderEvents(); } catch (eLoad) {}
        }

        // Laisser staff-events / events-publish-fix post-traiter (visibilité public Amiral, etc.)
        // en simulant qu'un event vient d'être créé dans le cache
        if (data && data.id && Array.isArray(window.cachedEvents)) {
          var exists = window.cachedEvents.some(function (e) { return e && e.id === data.id; });
          if (!exists) window.cachedEvents.unshift(data);
        }

      } catch (err) {
        console.error('[create-event-rpc]', err);
        var msg = (err && err.message) || String(err);
        if (typeof showToast === 'function') {
          showToast((typeof t === 'function' ? t('toast.error_prefix') : 'Erreur : ') + msg, 'error');
        }
      }
    };

    return true;
  }

  function boot() {
    if (!patchSubmitCreateEvent()) {
      setTimeout(boot, 400);
      setTimeout(boot, 1200);
      setTimeout(boot, 3000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  setTimeout(boot, 600);

  console.log('[AUPYGO] create-event-rpc-fix.js chargé');
})();
