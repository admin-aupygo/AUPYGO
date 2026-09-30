/* ==========================================================================
 * AUPYGO — staff-event-notify.js
 *
 * Règles FREE :
 *   ✅ Voir toutes les sorties communautaires + événements AUPYGO (staff)
 *   ✅ Participer UNIQUEMENT aux événements AUPYGO PAYANTS (staff)
 *   ❌ Pas de participation aux sorties gratuites (communauté ou staff)
 *
 * STANDARD / PREMIUM : participation libre (gratuit + payant AUPYGO)
 * Amiral seul : création d'événements payants
 * ========================================================================== */
(function () {
  'use strict';

  var TAG = '[STAFF_EVENT]';

  function isAmiralUser() {
    try {
      if (typeof isAmiral === 'function' && isAmiral()) return true;
      if (typeof isAdmin === 'function' && isAdmin()) return true;
      var p = window.currentUserProfile;
      if (p && (p.is_admin === true || String(p.role || '').toLowerCase() === 'amiral')) return true;
    } catch (e) {}
    return false;
  }
  function isStaffUser() {
    try { return typeof isStaff === 'function' && isStaff(); } catch (e) { return false; }
  }
  function plan() {
    try {
      return String(window.currentPlan || (typeof currentPlan !== 'undefined' ? currentPlan : 'FREE') || 'FREE').toUpperCase();
    } catch (e) { return 'FREE'; }
  }
  function getEv(id) {
    return (window.cachedEvents || []).find(function (e) { return e && e.id === id; }) || null;
  }
  function isPaid(ev) {
    return !!(ev && (ev.is_paid === true || ev.is_paid === 'true') && Number(ev.price) > 0);
  }
  function priceOf(ev) {
    if (!isPaid(ev)) return '';
    return Number(ev.price).toFixed(2).replace(/\.00$/, '') + ' €';
  }
  function isStaffEvent(ev) {
    if (!ev) return false;
    if (ev.is_special_aupygo === true || ev.is_special_aupygo === 'true') return true;
    if (ev.visibility === 'admin' || ev.visibility === 'admin_only') return true;
    if (String(ev.type || '') === 'special') return true;
    var d = String(ev.description || '');
    if (d.indexOf(TAG) !== -1 || d.indexOf('[STAFF_PRESENCE]') !== -1) return true;
    try {
      var c = (window.profiles || []).find(function (p) { return p && p.id === ev.creator_id; });
      if (c && (c.is_admin === true ||
          ['amiral','admin_general','admin','major_staff','sergent_staff',
           'major_moderateur','sergent_moderateur','host','moderator']
            .indexOf(String(c.role || '').toLowerCase()) !== -1)) {
        return true;
      }
    } catch (e2) {}
    return false;
  }
  /** FREE peut rejoindre seulement si AUPYGO staff + payant */
  function freeCanJoin(ev) {
    return isStaffEvent(ev) && isPaid(ev);
  }
  /** Carte verrouillée pour FREE ? (tout sauf AUPYGO payant) */
  function freeIsLocked(ev) {
    if (plan() !== 'FREE') return false;
    return !freeCanJoin(ev);
  }

  function enforcePaidUiSecurity() {
    var paidRadio = document.getElementById('eventPaidPaid');
    var freeRadio = document.getElementById('eventPaidFree');
    var priceWrap = document.getElementById('createEventPriceWrap');
    var priceInput = document.getElementById('createEventPrice');
    var paidLabel = paidRadio ? (paidRadio.closest('label') || paidRadio.parentElement) : null;
    var priceStep = document.getElementById('wizardStep_price');
    if (isAmiralUser()) {
      if (paidLabel) paidLabel.style.display = '';
      if (paidRadio) paidRadio.disabled = false;
      if (priceStep) priceStep.style.display = '';
      return;
    }
    if (paidRadio) { paidRadio.checked = false; paidRadio.disabled = true; }
    if (freeRadio) { freeRadio.checked = true; }
    if (priceWrap) priceWrap.style.display = 'none';
    if (priceInput) { priceInput.value = ''; priceInput.disabled = true; }
    if (paidLabel) paidLabel.style.display = 'none';
    if (priceStep) priceStep.style.display = 'none';
  }

  function patchBuildCard() {
    if (typeof window.buildEventCardHtml !== 'function') return false;
    if (window._aupygoCardPatched) return true;
    window._aupygoCardPatched = true;
    var orig = window.buildEventCardHtml;
    window.buildEventCardHtml = function (ev, locked) {
      // FREE : unlock uniquement AUPYGO payant
      if (freeCanJoin(ev)) locked = false;
      else if (plan() === 'FREE') locked = true;
      return orig.call(this, ev, locked);
    };
    return true;
  }

  function patchLoad() {
    if (typeof window.loadAndRenderEvents !== 'function') return false;
    if (window._aupygoLoadPatched) return true;
    window._aupygoLoadPatched = true;
    var orig = window.loadAndRenderEvents;
    window.loadAndRenderEvents = async function () {
      var r = await orig.apply(this, arguments);
      try {
        var grid = document.getElementById('eventGrid');
        if (grid && typeof buildEventCardHtml === 'function' && Array.isArray(window.cachedEvents)) {
          var list = typeof getEventsForSelectedDay === 'function'
            ? getEventsForSelectedDay(window.cachedEvents)
            : window.cachedEvents;
          if (list && list.length) {
            grid.innerHTML = list.map(function (ev) {
              return buildEventCardHtml(ev, freeIsLocked(ev));
            }).join('');
          }
        }
      } catch (e) {}
      try {
        if (typeof renderSpecialEventsHero === 'function') {
          renderSpecialEventsHero(window.cachedEvents || []);
        }
      } catch (e2) {}
      setTimeout(applyDomRules, 50);
      setTimeout(applyDomRules, 400);
      return r;
    };
    return true;
  }

  function applyDomRules() {
    (window.cachedEvents || []).forEach(function (ev) {
      document.querySelectorAll('[data-event-id="' + ev.id + '"]').forEach(function (card) {
        // Badge AUPYGO sur staff
        if (isStaffEvent(ev)) {
          var badge = card.querySelector('.badge');
          if (badge) {
            var txt = badge.textContent || '';
            if (txt.indexOf('Événement AUPYGO') === -1) {
              if (txt.indexOf('AUPYGO') !== -1) {
                badge.textContent = txt.replace(/⭐\s*AUPYGO|AUPYGO/, 'Événement AUPYGO');
              } else {
                badge.textContent = 'Événement AUPYGO' +
                  (isPaid(ev) ? (' · 💶 ' + priceOf(ev)) : ' · Gratuit');
              }
            }
          }
        }

        if (isPaid(ev) && !card.querySelector('.aupygo-price-line')) {
          var pl = document.createElement('p');
          pl.className = 'event-details aupygo-price-line';
          pl.style.cssText = 'font-weight:800;color:#7c3aed';
          pl.textContent = '💶 ' + priceOf(ev);
          var seats = card.querySelector('.event-seats');
          if (seats && seats.parentNode) seats.parentNode.insertBefore(pl, seats);
        }

        // Boutons selon règle FREE
        if (freeCanJoin(ev)) {
          // AUPYGO payant → déverrouiller
          card.style.opacity = '1';
          card.style.filter = 'none';
          card.querySelectorAll('.btn-locked, .event-upgrade').forEach(function (btn) {
            if (/refuser/i.test(btn.textContent || '')) return;
            btn.className = 'btn btn-primary event-join';
            btn.textContent = '💶 ' + priceOf(ev);
            btn.onclick = function (e) {
              e.preventDefault();
              e.stopPropagation();
              if (typeof openSpecialInviteModal === 'function') openSpecialInviteModal(ev.id);
              else if (typeof joinRealEvent === 'function') joinRealEvent(ev.id);
            };
          });
        } else if (plan() === 'FREE') {
          // FREE + non payant AUPYGO → cadenas
          card.querySelectorAll('.event-join, .btn-primary').forEach(function (btn) {
            if (/refuser|delete|🗑️|participants|inscrit/i.test(btn.textContent || '')) return;
            if (btn.disabled) return;
            btn.className = 'btn btn-locked event-upgrade';
            btn.textContent = '🔒 STANDARD';
            btn.onclick = function (e) {
              e.preventDefault();
              if (typeof go === 'function') go('plans');
            };
          });
        }
      });
    });
  }

  function patchJoin() {
    if (typeof window.joinRealEvent !== 'function') return false;
    // Toujours re-wrapper pour gagner sur join-events-fix
    if (window._aupygoJoinFinal === window.joinRealEvent) return true;

    var prev = window.joinRealEvent;
    window.joinRealEvent = async function (eventId) {
      if (isStaffUser()) {
        if (typeof showToast === 'function') {
          showToast('Les comptes Staff ne s\'inscrivent pas aux sorties.', 'error');
        }
        return;
      }
      var ev = getEv(eventId);
      if (!ev) return prev.apply(this, arguments);

      var p = plan();

      // FREE + AUPYGO payant → OK
      if (p === 'FREE' && freeCanJoin(ev)) {
        if (typeof openSpecialInviteModal === 'function') {
          openSpecialInviteModal(eventId);
          return;
        }
        return doJoin(eventId, true);
      }

      // FREE + le reste → refusé
      if (p === 'FREE') {
        if (typeof showToast === 'function') {
          showToast(
            '🔒 FREE : tu peux voir toutes les sorties. ' +
            'Participation réservée aux événements AUPYGO payants, ou passe en STANDARD.',
            'error'
          );
        }
        return;
      }

      // STANDARD / PREMIUM
      if (isStaffEvent(ev) && isPaid(ev) && typeof openSpecialInviteModal === 'function') {
        openSpecialInviteModal(eventId);
        return;
      }
      return prev.apply(this, arguments);
    };
    window._aupygoJoinFinal = window.joinRealEvent;
    return true;
  }

  async function doJoin(eventId, paid) {
    if (!window.currentUser) {
      if (typeof go === 'function') go('plans');
      return;
    }
    var client = window.supabaseClient || window.supabase;
    if (!client) return;
    var prev = plan();
    try {
      try { currentPlan = 'STANDARD'; } catch (e) {}
      window.currentPlan = 'STANDARD';
      var ins = await client.from('event_participants').insert({
        event_id: eventId,
        user_id: window.currentUser.id
      });
      if (ins.error && !/duplicate|unique|23505/i.test(String(ins.error.message || '') + String(ins.error.code || ''))) {
        if (typeof showToast === 'function') showToast('Erreur : ' + (ins.error.message || ins.error), 'error');
        return;
      }
      if (typeof showToast === 'function') {
        showToast(paid ? '🎉 Place réservée (paiement simulé) !' : '🎉 Tu es inscrit !', 'success');
      }
      if (typeof loadAndRenderEvents === 'function') await loadAndRenderEvents();
    } finally {
      try { currentPlan = prev; } catch (e2) {}
      window.currentPlan = prev;
    }
  }

  function patchInviteModal() {
    if (typeof window.openSpecialInviteModal !== 'function') return false;
    if (window._aupygoModalPatched) return true;
    window._aupygoModalPatched = true;

    window.openSpecialInviteModal = function (eventId) {
      var ev = getEv(eventId);
      if (!ev) return;
      var ov = typeof ensureSpecialInviteOverlay === 'function'
        ? ensureSpecialInviteOverlay()
        : document.getElementById('specialInviteOverlay');
      if (!ov) return;
      var card = document.getElementById('specialInviteCard');
      if (!card) return;

      var dateStr = typeof formatEventDate === 'function' ? formatEventDate(ev.event_date) : String(ev.event_date || '');
      var paid = isPaid(ev);
      var emoji = ev.emoji || '🎉';
      var pl = priceOf(ev);
      var esc = typeof escapeHtml === 'function' ? escapeHtml : function (s) { return String(s || ''); };
      var p = plan();

      var actions = '';
      if (isStaffUser()) {
        actions = '<p style="font-size:13px;color:#64748b">Vue staff — pas d\'inscription</p>';
      } else if (p === 'FREE' && !paid) {
        // FREE + AUPYGO gratuit → voir mais pas rejoindre
        actions =
          '<div style="margin:0 0 10px;padding:10px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#475569">' +
          '✅ Visible en FREE · Participation réservée au forfait STANDARD (événement gratuit)</div>' +
          '<button type="button" class="btn btn-accept" onclick="closeSpecialInviteModal();go(\'plans\')">🔒 Passer à STANDARD</button>' +
          '<button type="button" class="btn btn-refuse" onclick="refuseEvent(\'' + ev.id + '\');closeSpecialInviteModal()">✖️ Refuser</button>';
      } else if (paid) {
        // Payant AUPYGO : FREE + STANDARD + PREMIUM OK
        actions =
          '<div style="margin:0 0 10px;padding:10px;border-radius:10px;background:#faf5ff;border:1px solid #e9d5ff;font-weight:800;color:#7c3aed">💶 Événement AUPYGO payant — ' + pl + '</div>' +
          '<label style="display:flex;gap:8px;align-items:flex-start;font-size:12px;margin:0 0 12px;text-align:left;cursor:pointer">' +
          '<input type="checkbox" id="staffInviteNonRefund" style="margin-top:3px">' +
          '<span>J\'accepte la clause de non-remboursement (paiement non remboursable sauf obligation légale).</span></label>' +
          '<button type="button" class="btn btn-accept" id="staffInviteAcceptPaid">💶 Accepter · ' + pl + '</button>' +
          '<button type="button" class="btn btn-refuse" onclick="refuseEvent(\'' + ev.id + '\');closeSpecialInviteModal()">✖️ Refuser</button>';
      } else {
        actions =
          '<div style="margin:0 0 10px;padding:10px;border-radius:10px;background:#f0fdf4;border:1px solid #bbf7d0;font-weight:800;color:#15803d">✅ Gratuit</div>' +
          '<button type="button" class="btn btn-accept" id="staffInviteAcceptFree">✨ Participer</button>' +
          '<button type="button" class="btn btn-refuse" onclick="refuseEvent(\'' + ev.id + '\');closeSpecialInviteModal()">✖️ Refuser</button>';
      }

      var desc = String(ev.description || '')
        .replace(/\[STAFF_EVENT\]/g, '').replace(/\[STAFF_PRESENCE\]/g, '')
        .replace(/\[HOST_COUNTRY:[^\]]*\]/g, '').replace(/\[EN_ATTENTE_VALIDATION_ADMIN\]/g, '').trim();

      card.innerHTML =
        '<button type="button" class="special-invite-close" onclick="closeSpecialInviteModal()" aria-label="Fermer">×</button>' +
        '<div class="special-invite-sparks" aria-hidden="true"><span></span><span></span><span></span><span></span></div>' +
        '<div class="special-invite-avatar">' + emoji + '</div>' +
        '<div class="si-badge">⭐ Événement AUPYGO' + (paid ? ' · Payant' : ' · Gratuit') + '</div>' +
        '<h3>' + esc(ev.title || '') + '</h3>' +
        '<p class="si-meta">📍 ' + esc(ev.address || '') + '</p>' +
        '<p class="si-meta">🕐 ' + dateStr + '</p>' +
        (desc ? '<p class="si-desc">' + esc(desc) + '</p>' : '') +
        '<div class="special-invite-actions">' + actions + '</div>';

      ov.classList.remove('open');
      void ov.offsetWidth;
      ov.classList.add('open');
      document.body.style.overflow = 'hidden';

      var paidBtn = document.getElementById('staffInviteAcceptPaid');
      if (paidBtn) {
        paidBtn.onclick = function () {
          var chk = document.getElementById('staffInviteNonRefund');
          if (!chk || !chk.checked) {
            if (typeof showToast === 'function') showToast('Merci d\'accepter la clause de non-remboursement.', 'error');
            return;
          }
          if (typeof closeSpecialInviteModal === 'function') closeSpecialInviteModal();
          doJoin(ev.id, true);
        };
      }
      var freeBtn = document.getElementById('staffInviteAcceptFree');
      if (freeBtn) {
        freeBtn.onclick = function () {
          if (typeof closeSpecialInviteModal === 'function') closeSpecialInviteModal();
          doJoin(ev.id, false);
        };
      }
    };
    return true;
  }

  function patchHero() {
    if (typeof window.renderSpecialEventsHero !== 'function') return false;
    if (window._aupygoHeroPatched) return true;
    window._aupygoHeroPatched = true;
    window.renderSpecialEventsHero = function (list) {
      var host = document.getElementById('specialEventsHero');
      if (!host) return;
      var declined = typeof getDeclinedEventIds === 'function' ? getDeclinedEventIds() : new Set();
      var myIds = window.myEventIds || new Set();
      var specials = (list || window.cachedEvents || []).filter(function (ev) {
        if (!ev) return false;
        if (declined.has && declined.has(ev.id)) return false;
        if (myIds.has && myIds.has(ev.id)) return false;
        return isStaffEvent(ev);
      });
      if (!specials.length) {
        host.style.display = 'none';
        host.innerHTML = '';
        return;
      }
      host.style.display = 'block';
      host.innerHTML = specials.map(function (ev) {
        var paid = isPaid(ev);
        var badge = paid ? ('💶 ' + priceOf(ev)) : (plan() === 'FREE' ? '🔒 Voir · STANDARD pour rejoindre' : '✅ Gratuit');
        return (
          '<div class="special-event-banner" data-event-id="' + ev.id + '" style="cursor:pointer" ' +
          'onclick="openSpecialInviteModal(\'' + ev.id + '\')">' +
          '<div style="font-size:13px;font-weight:700;opacity:.9">⭐ ÉVÉNEMENT AUPYGO · ' + badge + '</div>' +
          '<h3>' + (ev.emoji || '🎉') + ' ' + (ev.title || '') + '</h3>' +
          '<p style="opacity:.9">Touche pour ouvrir l\'invitation</p></div>'
        );
      }).join('');
      if (isStaffUser()) return;
      try {
        var first = specials[0];
        var key = 'aupygo_staff_invite_shown_' + first.id;
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, '1');
          setTimeout(function () {
            if (typeof openSpecialInviteModal === 'function') openSpecialInviteModal(first.id);
          }, 500);
        }
      } catch (e) {}
    };
    return true;
  }

  function patchSubmit() {
    if (typeof window.submitCreateEvent !== 'function') return false;
    if (window._aupygoSubmitPatched) return true;
    window._aupygoSubmitPatched = true;
    var orig = window.submitCreateEvent;
    window.submitCreateEvent = async function () {
      var staff = isStaffUser();
      var amiral = isAmiralUser();
      var paidRadio = document.querySelector('input[name="eventPaid"]:checked');
      var wantsPaid = !!(paidRadio && paidRadio.value === 'paid');
      var priceEl = document.getElementById('createEventPrice');
      var priceVal = priceEl ? parseFloat(priceEl.value) : 0;

      if (wantsPaid && !amiral) {
        if (typeof showToast === 'function') showToast('🔒 Seul l\'Amiral peut créer un événement payant.', 'error');
        enforcePaidUiSecurity();
        return;
      }
      if (wantsPaid && amiral && (!priceVal || priceVal <= 0)) {
        if (typeof showToast === 'function') showToast('Indique un montant valide (€).', 'error');
        return;
      }

      await orig.apply(this, arguments);
      if (!staff || !window.currentUser) return;

      setTimeout(async function () {
        try {
          var client = window.supabaseClient || window.supabase;
          if (!client) return;
          var res = await client.from('events').select('id, description')
            .eq('creator_id', window.currentUser.id)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
          var ev = res.data;
          if (!ev || !ev.id) return;
          var desc = String(ev.description || '').replace(/\[EN_ATTENTE_VALIDATION_ADMIN\]\s*/g, '').trim();
          if (desc.indexOf(TAG) === -1) desc = TAG + '\n' + desc;
          var payload = {
            visibility: 'public',
            is_special_aupygo: true,
            description: desc || null
          };
          if (amiral && wantsPaid && priceVal > 0) {
            payload.is_paid = true;
            payload.price = priceVal;
          } else if (!amiral) {
            payload.is_paid = false;
            payload.price = 0;
          }
          await client.from('events').update(payload).eq('id', ev.id);
          if (typeof showToast === 'function') {
            showToast('✅ Événement AUPYGO publié', 'success');
          }
          if (typeof loadAndRenderEvents === 'function') await loadAndRenderEvents();
        } catch (err) {
          console.warn('[staff-event-notify]', err);
        }
      }, 1100);
    };
    return true;
  }

  function boot() {
    enforcePaidUiSecurity();
    patchBuildCard();
    patchLoad();
    patchJoin();
    patchInviteModal();
    patchHero();
    patchSubmit();
    applyDomRules();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 500);
  setTimeout(boot, 1500);
  setInterval(function () {
    enforcePaidUiSecurity();
    patchJoin();
    applyDomRules();
  }, 2500);

  console.log('[AUPYGO] staff-event-notify — FREE voit tout, rejoint seulement AUPYGO payant');
})();
