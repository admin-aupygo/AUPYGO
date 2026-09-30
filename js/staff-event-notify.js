/* ==========================================================================
 * AUPYGO — staff-event-notify.js (sécurisé)
 *
 * Sécurité :
 *   - Seul l'AMIRAL peut créer un événement PAYANT (UI + contrôle submit).
 *   - Le SQL (SUPABASE_STAFF_EVENTS_SECURE.sql) refuse is_paid côté DB
 *     si le créateur n'est pas Amiral (trigger + RLS).
 *
 * Métier :
 *   - Staff / Amiral crée un event → visibility=public + is_special_aupygo
 *   - Users informés (bandeau + pop-up invitation)
 *   - PAYANT → tous (FREE inclus) peuvent accepter
 *   - GRATUIT staff → grisé pour FREE (cadenas STANDARD)
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
    return !!(ev && ev.is_paid && Number(ev.price) > 0);
  }
  function priceOf(ev) {
    if (!isPaid(ev)) return '';
    return Number(ev.price).toFixed(2).replace(/\.00$/, '') + ' €';
  }
  function isStaffEvent(ev) {
    if (!ev) return false;
    if (ev.is_special_aupygo === true) return true;
    if (ev.visibility === 'admin' || ev.visibility === 'admin_only') return true;
    if (ev.type === 'special') return true;
    var d = String(ev.description || '');
    return d.indexOf(TAG) !== -1 || d.indexOf('[STAFF_PRESENCE]') !== -1;
  }
  function isGreyedForFree(ev) {
    return plan() === 'FREE' && isStaffEvent(ev) && !isPaid(ev);
  }

  function enforcePaidUiSecurity() {
    var paidRadio = document.getElementById('eventPaidPaid');
    var freeRadio = document.getElementById('eventPaidFree');
    var priceWrap = document.getElementById('createEventPriceWrap');
    var priceInput = document.getElementById('createEventPrice');
    var paidLabel = paidRadio ? (paidRadio.closest('label') || paidRadio.parentElement) : null;

    if (isAmiralUser()) {
      if (paidLabel) paidLabel.style.display = '';
      if (paidRadio) paidRadio.disabled = false;
      return;
    }

    if (paidRadio) {
      paidRadio.checked = false;
      paidRadio.disabled = true;
    }
    if (freeRadio) {
      freeRadio.checked = true;
      freeRadio.disabled = false;
    }
    if (priceWrap) priceWrap.style.display = 'none';
    if (priceInput) {
      priceInput.value = '';
      priceInput.disabled = true;
    }
    if (paidLabel) paidLabel.style.display = 'none';
  }

  function patchSubmit() {
    if (typeof window.submitCreateEvent !== 'function') return false;
    if (window._staffSecureSubmitPatched) return true;
    window._staffSecureSubmitPatched = true;

    var orig = window.submitCreateEvent;
    window.submitCreateEvent = async function () {
      var staff = isStaffUser();
      var amiral = isAmiralUser();
      var paidRadio = document.querySelector('input[name="eventPaid"]:checked');
      var wantsPaid = !!(paidRadio && paidRadio.value === 'paid');
      var priceEl = document.getElementById('createEventPrice');
      var priceVal = priceEl ? parseFloat(priceEl.value) : 0;

      if (wantsPaid && !amiral) {
        if (typeof showToast === 'function') {
          showToast('🔒 Seul l\'Amiral peut créer un événement payant.', 'error');
        }
        enforcePaidUiSecurity();
        return;
      }
      if (wantsPaid && amiral && (!priceVal || priceVal <= 0)) {
        if (typeof showToast === 'function') {
          showToast('Indique un montant valide (€) pour un événement payant.', 'error');
        }
        return;
      }

      await orig.apply(this, arguments);

      if (!staff || !window.currentUser) return;

      setTimeout(async function () {
        try {
          var client = window.supabaseClient || window.supabase;
          if (!client) return;

          var res = await client
            .from('events')
            .select('id, description, visibility, is_special_aupygo, is_paid, price')
            .eq('creator_id', window.currentUser.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          var ev = res.data;
          if (!ev || !ev.id) return;

          var desc = String(ev.description || '')
            .replace(/\[EN_ATTENTE_VALIDATION_ADMIN\]\s*/g, '')
            .trim();
          if (desc.indexOf(TAG) === -1) desc = TAG + '\n' + desc;

          var payload = {
            visibility: 'public',
            is_special_aupygo: true,
            description: desc || null
          };

          if (amiral && wantsPaid && priceVal > 0) {
            payload.is_paid = true;
            payload.price = priceVal;
          } else {
            payload.is_paid = false;
            payload.price = 0;
          }

          var up = await client.from('events').update(payload).eq('id', ev.id);
          if (up.error) {
            console.warn('[staff-event-notify] publish', up.error);
            if (typeof showToast === 'function') {
              showToast('Publication : ' + (up.error.message || up.error), 'error');
            }
            return;
          }

          if (typeof showToast === 'function') {
            showToast(
              payload.is_paid
                ? '✅ Événement payant publié — tous les utilisateurs sont informés'
                : '✅ Événement publié — les utilisateurs sont informés',
              'success'
            );
          }
          if (typeof loadAndRenderEvents === 'function') await loadAndRenderEvents();
        } catch (err) {
          console.warn('[staff-event-notify]', err);
        }
      }, 1100);
    };
    return true;
  }

  function patchSpecialHero() {
    if (typeof window.renderSpecialEventsHero !== 'function') return false;
    if (window._staffNotifyHeroPatched) return true;
    window._staffNotifyHeroPatched = true;

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
        var grey = isGreyedForFree(ev);
        var badge = paid ? ('💶 ' + priceOf(ev)) : (grey ? '🔒 STANDARD' : '✅ Gratuit');
        var opacity = grey ? 'opacity:.65;' : '';
        return (
          '<div class="special-event-banner" data-event-id="' + ev.id + '" style="cursor:pointer;' + opacity + '" ' +
          'onclick="openSpecialInviteModal(\'' + ev.id + '\')">' +
          '<div style="position:relative;z-index:1;font-size:13px;font-weight:700;letter-spacing:.04em;opacity:.9">' +
          '⭐ ÉVÉNEMENT AUPYGO · ' + badge + '</div>' +
          '<h3>' + (ev.emoji || '🎉') + ' ' + (ev.title || '') + '</h3>' +
          '<p style="position:relative;z-index:1;opacity:.9">Touche pour ouvrir l\'invitation</p></div>'
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

  function patchInviteModal() {
    if (typeof window.openSpecialInviteModal !== 'function') return false;
    if (window._staffNotifyModalPatched) return true;
    window._staffNotifyModalPatched = true;

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
      var grey = isGreyedForFree(ev);
      var emoji = ev.emoji || '🎉';
      var pl = priceOf(ev);

      var actions = '';
      if (isStaffUser()) {
        actions = '<p style="font-size:13px;color:#64748b">Vue staff — pas d\'inscription</p>';
      } else if (grey) {
        actions =
          '<button type="button" class="btn btn-accept" style="opacity:.85" onclick="closeSpecialInviteModal();go(\'plans\')">' +
          '🔒 STANDARD pour participer (événement staff gratuit)</button>' +
          '<button type="button" class="btn btn-refuse" onclick="refuseEvent(\'' + ev.id + '\');closeSpecialInviteModal()">✖️ Refuser</button>';
      } else if (paid) {
        actions =
          '<div style="margin:0 0 10px;padding:10px;border-radius:10px;background:#faf5ff;border:1px solid #e9d5ff;font-weight:800;color:#7c3aed">💶 Payant — ' + pl + '</div>' +
          '<label style="display:flex;gap:8px;align-items:flex-start;font-size:12px;margin:0 0 12px;text-align:left;cursor:pointer">' +
          '<input type="checkbox" id="staffInviteNonRefund" style="margin-top:3px">' +
          '<span>J\'accepte la clause de non-remboursement (paiement non remboursable sauf obligation légale).</span></label>' +
          '<button type="button" class="btn btn-accept" id="staffInviteAcceptPaid">💶 Accepter · ' + pl + '</button>' +
          '<button type="button" class="btn btn-refuse" onclick="refuseEvent(\'' + ev.id + '\');closeSpecialInviteModal()">✖️ Refuser</button>';
      } else {
        actions =
          '<div style="margin:0 0 10px;padding:10px;border-radius:10px;background:#f0fdf4;border:1px solid #bbf7d0;font-weight:800;color:#15803d">✅ Gratuit</div>' +
          '<button type="button" class="btn btn-accept" onclick="joinRealEvent(\'' + ev.id + '\');closeSpecialInviteModal()">✨ Participer</button>' +
          '<button type="button" class="btn btn-refuse" onclick="refuseEvent(\'' + ev.id + '\');closeSpecialInviteModal()">✖️ Refuser</button>';
      }

      var desc = String(ev.description || '')
        .replace(/\[STAFF_EVENT\]/g, '')
        .replace(/\[STAFF_PRESENCE\]/g, '')
        .replace(/\[HOST_COUNTRY:[^\]]*\]/g, '')
        .replace(/\[EN_ATTENTE_VALIDATION_ADMIN\]/g, '')
        .trim();

      var title = (typeof escapeHtml === 'function' ? escapeHtml(ev.title || '') : (ev.title || ''));
      var addr = (typeof escapeHtml === 'function' ? escapeHtml(ev.address || '') : (ev.address || ''));
      var descHtml = desc ? (typeof escapeHtml === 'function' ? escapeHtml(desc) : desc) : '';

      card.innerHTML =
        '<button type="button" class="special-invite-close" onclick="closeSpecialInviteModal()" aria-label="Fermer">×</button>' +
        '<div class="special-invite-sparks" aria-hidden="true"><span></span><span></span><span></span><span></span></div>' +
        '<div class="special-invite-avatar">' + emoji + '</div>' +
        '<div class="si-badge">⭐ Invitation AUPYGO' + (paid ? ' · Payant' : ' · Gratuit') + '</div>' +
        '<h3>' + title + '</h3>' +
        '<p class="si-meta">📍 ' + addr + '</p>' +
        '<p class="si-meta">🕐 ' + dateStr + '</p>' +
        (descHtml ? '<p class="si-desc">' + descHtml + '</p>' : '') +
        '<div class="special-invite-actions">' + actions + '</div>';

      ov.classList.remove('open');
      void ov.offsetWidth;
      ov.classList.add('open');
      document.body.style.overflow = 'hidden';

      if (paid && !isStaffUser()) {
        var btn = document.getElementById('staffInviteAcceptPaid');
        if (btn) {
          btn.onclick = function () {
            var chk = document.getElementById('staffInviteNonRefund');
            if (!chk || !chk.checked) {
              if (typeof showToast === 'function') {
                showToast('Merci d\'accepter la clause de non-remboursement.', 'error');
              }
              return;
            }
            if (typeof closeSpecialInviteModal === 'function') closeSpecialInviteModal();
            staffJoinPaid(ev.id);
          };
        }
      }
    };
    return true;
  }

  async function staffJoinPaid(eventId) {
    if (!window.currentUser) {
      if (typeof go === 'function') go('plans');
      return;
    }
    if (isStaffUser()) {
      if (typeof showToast === 'function') showToast('Les comptes Staff ne s\'inscrivent pas.', 'error');
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
      if (typeof showToast === 'function') showToast('🎉 Place réservée (paiement simulé) !', 'success');
      if (typeof loadAndRenderEvents === 'function') await loadAndRenderEvents();
    } finally {
      try { currentPlan = prev; } catch (e2) {}
      window.currentPlan = prev;
    }
  }

  function applyCardRules() {
    (window.cachedEvents || []).forEach(function (ev) {
      if (!isStaffEvent(ev)) return;
      document.querySelectorAll('[data-event-id="' + ev.id + '"]').forEach(function (card) {
        var paid = isPaid(ev);
        var grey = isGreyedForFree(ev);

        if (!card.querySelector('.staff-ev-badge')) {
          var b = document.createElement('p');
          b.className = 'event-details staff-ev-badge';
          b.style.cssText = 'font-weight:800;' + (paid ? 'color:#7c3aed' : 'color:#15803d');
          b.textContent = paid ? ('💶 Payant · ' + priceOf(ev)) : '✅ Gratuit · Staff AUPYGO';
          card.appendChild(b);
        }

        if (grey) {
          card.style.opacity = '0.55';
          card.style.filter = 'grayscale(0.35)';
          card.querySelectorAll('.event-join, .btn-primary').forEach(function (btn) {
            if (/refuser|delete|🗑️|participants/i.test(btn.textContent || '')) return;
            btn.className = 'btn btn-locked event-upgrade';
            btn.textContent = '🔒 STANDARD';
            btn.onclick = function (e) {
              e.preventDefault();
              if (typeof go === 'function') go('plans');
            };
          });
        } else if (paid) {
          card.style.opacity = '1';
          card.style.filter = 'none';
          card.querySelectorAll('.btn-locked, .event-upgrade').forEach(function (btn) {
            btn.className = 'btn btn-primary event-join';
            btn.textContent = '💶 ' + priceOf(ev);
            btn.onclick = function (e) {
              e.preventDefault();
              if (typeof openSpecialInviteModal === 'function') openSpecialInviteModal(ev.id);
            };
          });
        }
      });
    });
  }

  function patchJoin() {
    if (typeof window.joinRealEvent !== 'function') return false;
    if (window._staffNotifyJoin === window.joinRealEvent) return true;

    var orig = window.joinRealEvent;
    window.joinRealEvent = async function (eventId) {
      if (isStaffUser()) return orig.apply(this, arguments);
      var ev = getEv(eventId);
      if (ev && isStaffEvent(ev)) {
        if (isGreyedForFree(ev)) {
          if (typeof showToast === 'function') {
            showToast('🔒 Passe à STANDARD pour rejoindre les événements gratuits staff.', 'error');
          }
          if (typeof go === 'function') go('plans');
          return;
        }
        if (isPaid(ev)) {
          if (typeof openSpecialInviteModal === 'function') {
            openSpecialInviteModal(eventId);
            return;
          }
        }
      }
      return orig.apply(this, arguments);
    };
    window._staffNotifyJoin = window.joinRealEvent;
    return true;
  }

  function patchLoad() {
    if (typeof window.loadAndRenderEvents !== 'function') return false;
    if (window._staffNotifyLoadPatched) return true;
    window._staffNotifyLoadPatched = true;
    var orig = window.loadAndRenderEvents;
    window.loadAndRenderEvents = async function () {
      var r = await orig.apply(this, arguments);
      try {
        if (typeof renderSpecialEventsHero === 'function') {
          renderSpecialEventsHero(window.cachedEvents || []);
        }
      } catch (e) {}
      setTimeout(applyCardRules, 80);
      setTimeout(applyCardRules, 400);
      return r;
    };
    return true;
  }

  async function republishMyStaffEvents() {
    if (!isStaffUser() || !window.currentUser) return;
    var client = window.supabaseClient || window.supabase;
    if (!client) return;
    try {
      var res = await client
        .from('events')
        .select('id, visibility, description, is_paid, price, is_special_aupygo')
        .eq('creator_id', window.currentUser.id)
        .limit(40);
      var rows = res.data || [];
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var desc = String(row.description || '')
          .replace(/\[EN_ATTENTE_VALIDATION_ADMIN\]\s*/g, '')
          .trim();
        if (desc.indexOf(TAG) === -1) desc = TAG + '\n' + desc;

        var payload = {
          visibility: 'public',
          is_special_aupygo: true,
          description: desc || null
        };
        if (!isAmiralUser() && row.is_paid) {
          payload.is_paid = false;
          payload.price = 0;
        }
        await client.from('events').update(payload).eq('id', row.id);
      }
      if (rows.length && typeof loadAndRenderEvents === 'function') {
        await loadAndRenderEvents();
      }
    } catch (e) {
      console.warn('[staff-event-notify] republish', e);
    }
  }

  function boot() {
    enforcePaidUiSecurity();
    patchSubmit();
    patchSpecialHero();
    patchInviteModal();
    patchJoin();
    patchLoad();
    applyCardRules();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  setTimeout(boot, 600);
  setTimeout(boot, 1800);
  setTimeout(republishMyStaffEvents, 2500);
  setInterval(function () {
    enforcePaidUiSecurity();
    patchJoin();
    patchInviteModal();
    applyCardRules();
  }, 3000);

  console.log('[AUPYGO] staff-event-notify.js — Amiral seul payant · users informés');
})();
