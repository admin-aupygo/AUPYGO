/* AUPYGO staff-events.js — chargé après admin.js / staff-messages.js
 * - Staff ne rejoint pas les sorties créées par les users (vue seule)
 * - Hôte : création limitée (rappel + tag pays)
 * - Événements spéciaux Aupygo : participation optionnelle + notif hôte
 */
(function () {
  'use strict';
  if (typeof isStaff !== 'function') return;

  function isMemberStaffProfile(p) {
    if (!p) return false;
    if (p.is_admin === true) return true;
    var r = (p.role || '').toLowerCase();
    return r === 'admin_general' || r === 'host' || r === 'admin' || r === 'moderator';
  }

  function getEventById(eventId) {
    return (window.cachedEvents || []).find(function (e) { return e && e.id === eventId; });
  }

  /** Sortie créée par un user normal (pas staff) */
  function isUserCreatedEvent(ev) {
    if (!ev) return true;
    if (ev.is_special_aupygo === true) return false;
    if (ev.visibility === 'admin' || ev.visibility === 'admin_only') return false;
    var creator = (window.profiles || []).find(function (p) { return p && p.id === ev.creator_id; });
    if (creator && isMemberStaffProfile(creator)) return false;
    return true;
  }

  var _origJoin = window.joinRealEvent;
  if (typeof _origJoin === 'function') {
    window.joinRealEvent = async function (eventId) {
      if (isStaff()) {
        var ev = getEventById(eventId);
        if (ev && !isUserCreatedEvent(ev)) {
          return _origJoin(eventId);
        }
        showToast('Les comptes Staff ne peuvent pas s\'inscrire aux sorties des membres. Vue et contrôle uniquement.', 'error');
        return;
      }
      return _origJoin(eventId);
    };
  }

  function hideJoinButtonsForStaff() {
    if (!isStaff()) return;
    document.querySelectorAll(
      'button[onclick*="joinRealEvent"], .btn-accept[onclick*="joinRealEvent"]'
    ).forEach(function (btn) {
      var onclick = btn.getAttribute('onclick') || '';
      var m = onclick.match(/joinRealEvent\(['\"]([^'\"]+)['\"]\)/);
      if (m) {
        var ev = getEventById(m[1]);
        if (ev && isUserCreatedEvent(ev)) {
          btn.style.display = 'none';
          if (!btn.parentElement.querySelector('.staff-event-viewonly')) {
            var span = document.createElement('span');
            span.className = 'staff-event-viewonly';
            span.style.cssText = 'font-size:12px;color:#64748b;font-weight:600;padding:8px 0;display:inline-block';
            span.textContent = '👁️ Vue seule (staff)';
            btn.parentElement.appendChild(span);
          }
        }
      }
    });
  }

  var _origLoadEvents = window.loadAndRenderEvents;
  if (typeof _origLoadEvents === 'function') {
    window.loadAndRenderEvents = async function () {
      var r = await _origLoadEvents.apply(this, arguments);
      setTimeout(hideJoinButtonsForStaff, 100);
      setTimeout(hideJoinButtonsForStaff, 500);
      return r;
    };
  }

  setInterval(function () {
    if (isStaff() && typeof getActivePage === 'function' &&
        (getActivePage() === 'events' || getActivePage() === 'agenda')) {
      hideJoinButtonsForStaff();
    }
  }, 2000);

  var _origSubmit = window.submitCreateEvent;
  if (typeof _origSubmit === 'function') {
    window.submitCreateEvent = async function () {
      if (typeof isHost === 'function' && isHost() && !isAdmin()) {
        var hostCountry = null;
        try {
          var res = await supabaseClient
            .from('profiles')
            .select('host_country, country, city')
            .eq('id', currentUser.id)
            .maybeSingle();
          var prof = res.data;
          hostCountry = (prof && (prof.host_country || prof.country)) || null;
        } catch (e) {}
        if (hostCountry) {
          var address = (document.getElementById('createEventAddress') || {}).value || '';
          var okCountry = confirm(
            '📍 Hôte AUPYGO — ton pays / zone : « ' + hostCountry + ' ».\n\n' +
            'Tu ne peux créer des sorties que pour les users de ton pays.\n' +
            'Adresse saisie : ' + (address || '(vide)') + '\n\n' +
            'Confirmer la publication dans ta zone ?'
          );
          if (!okCountry) return;
        }
        var vis = document.getElementById('createEventVisibility');
        if (vis && vis.value === 'admin') {
          showToast('Les événements spéciaux Aupygo sont réservés à l\'administrateur.', 'error');
          return;
        }
      }

      var visibility = (document.getElementById('createEventVisibility') || {}).value || 'public';
      var isSpecial = visibility === 'admin' || (typeof selectedEventType !== 'undefined' && selectedEventType === 'special');
      var staffParticipates = false;

      if (isStaff() && isSpecial) {
        staffParticipates = confirm(
          '🛡️ Événement spécial Aupygo\n\n' +
          'Souhaites-tu y participer en tant qu\'hôte Aupygo ?\n\n' +
          'OK = Oui, je participe → les users verront « Présence d\'un hôte Aupygo »\n' +
          'Annuler = Non, organisation seulement (pas d\'inscription)'
        );
      }

      var beforeIds = new Set((window.cachedEvents || []).map(function (e) { return e.id; }));
      await _origSubmit.apply(this, arguments);

      if (isStaff() && isSpecial) {
        setTimeout(async function () {
          try {
            if (typeof loadAndRenderEvents === 'function') await loadAndRenderEvents();
            var newest = (window.cachedEvents || []).find(function (e) {
              return e && !beforeIds.has(e.id) && e.creator_id === currentUser.id;
            });
            if (!newest) {
              var mine = (window.cachedEvents || []).filter(function (e) { return e.creator_id === currentUser.id; });
              mine.sort(function (a, b) { return new Date(b.event_date) - new Date(a.event_date); });
              newest = mine[0];
            }
            if (!newest) return;

            if (!staffParticipates) {
              await supabaseClient.from('event_participants')
                .delete()
                .eq('event_id', newest.id)
                .eq('user_id', currentUser.id);
              showToast('Événement publié — tu n\'y participes pas (organisation seule).', 'success');
            } else {
              try {
                await supabaseClient.from('events').update({
                  description: ((newest.description || '') +
                    '\n\n✨ Présence d\'un hôte Aupygo confirmée.').trim()
                }).eq('id', newest.id);
              } catch (e) {}
              try {
                await supabaseClient.from('event_participants').insert({
                  event_id: newest.id,
                  user_id: currentUser.id
                });
              } catch (e3) {}
              showToast('Événement publié — présence d\'un hôte Aupygo signalée aux users.', 'success');
            }
            if (typeof loadAndRenderEvents === 'function') await loadAndRenderEvents();
          } catch (err) {
            console.warn('[Staff events]', err);
          }
        }, 800);
      }
    };
  }

  var prevGo = window.go;
  if (typeof prevGo === 'function' && !window._staffEventsGoPatched) {
    window._staffEventsGoPatched = true;
    window.go = function (page) {
      prevGo(page);
      if (page === 'events' || page === 'agenda') {
        setTimeout(hideJoinButtonsForStaff, 400);
      }
    };
  }

  console.log('[AUPYGO] staff-events.js chargé');
})();
