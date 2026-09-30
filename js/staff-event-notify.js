/* ==========================================================================
 * AUPYGO — staff-event-notify.js
 *
 * Règles permanentes :
 * 1. Seul l'AMIRAL peut créer un événement PAYANT (UI + JS + SQL).
 * 2. Tout événement STAFF / AUPYGO → visibility public + is_special_aupygo.
 * 3. TOUS les comptes user (FREE, STANDARD, PREMIUM) peuvent PARTICIPER
 *    aux événements AUPYGO staff (gratuits ET payants).
 * 4. Badge permanent « Événement AUPYGO » sur ces cartes.
 * 5. Users informés (bandeau + pop-up invitation).
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
    if (d.indexOf(TAG) !== -1 || d.indexOf('[STAFF_PRESENCE]') !== -1) return true;
    // Créateur staff connu dans profiles
    try {
      var c = (window.profiles || []).find(function (p) { return p && p.id === ev.creator_id; });
      if (c && (c.is_admin === true || ['amiral','admin_general','admin','major_staff','sergent_staff','major_moderateur','sergent_moderateur','host','moderator'].indexOf(String(c.role || '').toLowerCase()) !== -1)) {
        return true;
      }
    } catch (e2) {}
    return false;
  }

  /* ---------- UI payant : Amiral uniquement ---------- */
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
    if (freeRadio) { freeRadio.checked = true; freeRadio.disabled = false; }
    if (priceWrap) priceWrap.style.display = 'none';
    if (priceInput) { priceInput.value = ''; priceInput.disabled = true; }
    if (paidLabel) paidLabel.style.display = 'none';
    if (priceStep) priceStep.style.display = 'none';
  }

  /* ---------- buildEventCardHtml : JAMAIS de cadenas sur event AUPYGO ---------- */
  function patchBuildCard() {
    if (typeof window.buildEventCardHtml !== 'function') return false;
    if (window._aupygoCardPatched) return true;
    window._aupygoCardPatched = true;

    var orig = window.buildEventCardHtml;
    window.buildEventCardHtml = function (ev, locked) {
      // AUPYGO staff → jamais locked pour les users
      if (isStaffEvent(ev)) locked = false;

      var html = orig.call(this, ev, locked);

      // Forcer badge « Événement AUPYGO »
      if (isStaffEvent(ev) && typeof html === 'string') {
        // Si le badge type n'a pas déjà AUPYGO, on l'ajoute via data attribute post-process
        // (le HTML est déjà construit ; applyCardBadges s'en charge sur le DOM)
      }
      return html;
    };
    return true;
  }

  /* ---------- loadAndRenderEvents : locked=false pour staff events ---------- */
  function patchLoad() {
    if (typeof window.loadAndRenderEvents !== 'function') return false;
    if (window._aupygoLoadPatched) return true;
    window._aupygoLoadPatched = true;

    var orig = window.loadAndRenderEvents;
    window.loadAndRenderEvents = async function () {
      var r = await orig.apply(this, arguments);

      // Re-render grille : staff events sans lock
      try {
        var grid = document.getElementById('eventGrid');
        if (grid && typeof buildEventCardHtml === 'function' && Array.isArray(window.cachedEvents)) {
          var locked = plan() === 'FREE';
          var list = typeof getEventsForSelectedDay === 'function'
            ? getEventsForSelectedDay(window.cachedEvents)
            : window.cachedEvents;
          if (list && list.length) {
            grid.innerHTML = list.map(function (ev) {
              return buildEventCardHtml(ev, isStaffEvent(ev) ? false : locked);
            }).join('');
          }
        }
      } catch (e) {
        console.warn('[staff-event-notify] re-render', e);
      }

      try {
        if (typeof renderSpecialEventsHero === 'function') {
          renderSpecialEventsHero(window.cachedEvents || []);
        }
      } catch (e2) {}

      setTimeout(applyCardBadgesAndUnlock, 50);
      setTimeout(applyCardBadgesAndUnlock, 300);
      return r;
    };
    return true;
  }

  /* ---------- DOM : badge AUPYGO + remplacer STANDARD par Participer ---------- */
  function applyCardBadgesAndUnlock() {
    (window.cachedEvents || []).forEach(function (ev) {
      if (!isStaffEvent(ev)) return;
      document.querySelectorAll('[data-event-id="' + ev.id + '"]').forEach(function (card) {
        // Badge Événement AUPYGO
        var badge = card.querySelector('.badge');
        if (badge) {
          var t = badge.textContent || '';
          if (t.indexOf('AUPYGO') === -1 && t.indexOf('Événement AUPYGO') === -1) {
            badge.textContent = 'Événement AUPYGO' +
              (isPaid(ev) ? (' · 💶 ' + priceOf(ev)) : ' · Gratuit');
          } else if (t.indexOf('Événement AUPYGO') === -1 && t.indexOf('AUPYGO') !== -1) {
            badge.textContent = t.replace(/⭐\s*AUPYGO|AUPYGO/, 'Événement AUPYGO');
          }
        } else if (!card.querySelector('.aupygo-staff-badge')) {
          var b = document.createElement('span');
          b.className = 'badge aupygo-staff-badge';
          b.style.cssText = 'display:inline-block;margin-bottom:6px;font-weight:800';
          b.textContent = 'Événement AUPYGO' + (isPaid(ev) ? (' · 💶 ' + priceOf(ev)) : ' · Gratuit');
          var body = card.querySelector('.event-body') || card;
          body.insertBefore(b, body.firstChild);
        }

        // Prix visible
        if (isPaid(ev) && !card.querySelector('.aupygo-price-line')) {
          var p = document.createElement('p');
          p.className = 'event-details aupygo-price-line';
          p.style.cssText = 'font-weight:800;color:#7c3aed';
          p.textContent = '💶 ' + priceOf(ev);
          var seats = card.querySelector('.event-seats');
          if (seats && seats.parentNode) seats.parentNode.insertBefore(p, seats);
          else (card.querySelector('.event-body') || card).appendChild(p);
        }

        // Remplacer cadenas STANDARD → bouton rejoindre
        card.querySelectorAll('.btn-locked, .event-upgrade').forEach(function (btn) {
          if (/refuser/i.test(btn.textContent || '')) return;
          btn.className = 'btn btn-primary event-join';
          btn.style.opacity = '1';
          btn.style.filter = 'none';
          if (isPaid(ev)) {
            btn.textContent = '💶 ' + priceOf(ev);
          } else {
            btn.textContent = '✨ Participer';
          }
          btn.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof openSpecialInviteModal === 'function') {
              openSpecialInviteModal(ev.id);
            } else if (typeof joinRealEvent === 'function') {
              joinRealEvent(ev.id);
            }
          };
        });

        card.style.opacity = '1';
        card.style.filter = 'none';
      });
    });
  }

  /* ---------- joinRealEvent : FREE autorisé sur staff AUPYGO ---------- */
  function patchJoin() {
    if (typeof window.joinRealEvent !== 'function') return false;
    if (window._aupygoJoin === window.joinRealEvent) return true;

    var orig = window.joinRealEvent;
    window.joinRealEvent = async function (eventId) {
      if (isStaffUser()) {
        if (typeof showToast === 'function') {
          showToast('Les comptes Staff ne s\'inscrivent pas aux sorties.', 'error');
        }
        return;
      }
      var ev = getEv(eventId);
      if (ev && isStaffEvent(ev)) {
        // Tous les plans peuvent rejoindre
        if (isPaid(ev) && typeof openSpecialInviteModal === 'function') {
          openSpecialInviteModal(eventId);
          return;
        }
        return doJoin(eventId, isPaid(ev));
      }
      return orig.apply(this, arguments);
    };
    window._aupygoJoin = window.joinRealEvent;
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
      // Contourne le check FREE de app.js le temps de l'insert
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

  /* ---------- Modal invitation ---------- */
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

      var actions = '';
      if (isStaffUser()) {
        actions = '<p style="font-size:13px;color:#64748b">Vue staff — pas d\'inscription</p>';
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
          '<button type="button" class="btn btn-accept" id="staffInviteAcceptFree">✨ Participer</button>' +
          '<button type="button" class="btn btn-refuse" onclick="refuseEvent(\'' + ev.id + '\');closeSpecialInviteModal()">✖️ Refuser</button>';
      }

      var desc = String(ev.description || '')
        .replace(/\[STAFF_EVENT\]/g, '')
        .replace(/\[STAFF_PRESENCE\]/g, '')
        .replace(/\[HOST_COUNTRY:[^\]]*\]/g, '')
        .replace(/\[EN_ATTENTE_VALIDATION_ADMIN\]/g, '')
        .trim();

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

  /* ---------- Bandeau special ---------- */
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
        var badge = paid ? ('💶 ' + priceOf(ev)) : '✅ Gratuit';
        return (
          '<div class="special-event-banner" data-event-id="' + ev.id + '" style="cursor:pointer" ' +
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

  /* ---------- Submit staff → public + special ; payant Amiral only ---------- */
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
        if (typeof showToast === 'function') {
          showToast('🔒 Seul l\'Amiral peut créer un événement payant.', 'error');
        }
        enforcePaidUiSecurity();
        return;
      }
      if (wantsPaid && amiral && (!priceVal || priceVal <= 0)) {
        if (typeof showToast === 'function') {
          showToast('Indique un montant valide (€).', 'error');
        }
        return;
      }

      await orig.apply(this, arguments);
      if (!staff || !window.currentUser) return;

      setTimeout(async function () {
        try {
          var client = window.supabaseClient || window.supabase;
          if (!client) return;
          var res = await client.from('events')
            .select('id, description')
            .eq('creator_id', window.currentUser.id)
            .order('created_at', { ascending: false })
            .limit(1).maybeSingle();
          var ev = res.data;
          if (!ev || !ev.id) return;

          var desc = String(ev.description || '')
            .replace(/\[EN_ATTENTE_VALIDATION_ADMIN\]\s*/g, '').trim();
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

          var up = await client.from('events').update(payload).eq('id', ev.id);
          if (up.error) {
            console.warn('[staff-event-notify]', up.error);
            return;
          }
          if (typeof showToast === 'function') {
            showToast('✅ Événement AUPYGO publié — tous les utilisateurs peuvent participer', 'success');
          }
          if (typeof loadAndRenderEvents === 'function') await loadAndRenderEvents();
        } catch (err) {
          console.warn('[staff-event-notify]', err);
        }
      }, 1100);
    };
    return true;
  }

  async function republishStaffEvents() {
    if (!isStaffUser() || !window.currentUser) return;
    var client = window.supabaseClient || window.supabase;
    if (!client) return;
    try {
      var res = await client.from('events')
        .select('id, visibility, description, is_paid, is_special_aupygo')
        .eq('creator_id', window.currentUser.id).limit(40);
      var rows = res.data || [];
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var desc = String(row.description || '')
          .replace(/\[EN_ATTENTE_VALIDATION_ADMIN\]\s*/g, '').trim();
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
      if (rows.length && typeof loadAndRenderEvents === 'function') await loadAndRenderEvents();
    } catch (e) {
      console.warn('[staff-event-notify] republish', e);
    }
  }

  function boot() {
    enforcePaidUiSecurity();
    patchBuildCard();
    patchLoad();
    patchJoin();
    patchInviteModal();
    patchHero();
    patchSubmit();
    applyCardBadgesAndUnlock();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  setTimeout(boot, 500);
  setTimeout(boot, 1500);
  setTimeout(republishStaffEvents, 2500);
  setInterval(function () {
    enforcePaidUiSecurity();
    patchJoin();
    applyCardBadgesAndUnlock();
  }, 2500);

  console.log('[AUPYGO] staff-event-notify.js — AUPYGO staff = ouvert à TOUS les users');
})();
