/* ==========================================================================
 * AUPYGO — staff-event-notify.js
 *
 * Règle métier permanente (pas de forçage temporaire) :
 *
 * 1. Quand le STAFF / Amiral crée un événement (gratuit OU payant) :
 *    → visibility = 'public'
 *    → is_special_aupygo = true
 *    → apparaît dans le bandeau « Invitation spéciale »
 *    → pop-up d'invitation pour chaque user (une fois / event / session)
 *
 * 2. Événement PAYANT staff :
 *    → TOUS les users informés (FREE / STANDARD / PREMIUM)
 *    → TOUS peuvent voir le prix et accepter (modal)
 *
 * 3. Événement GRATUIT staff :
 *    → TOUS informés
 *    → FREE : carte + invitation GRISEES (cadenas → STANDARD)
 *    → STANDARD / PREMIUM : peuvent rejoindre
 *
 * Prérequis SQL : SUPABASE_EVENTS_PUBLIC_SELECT.sql (visibility public lisible)
 * ========================================================================== */
(function () {
  'use strict';

  var TAG = '[STAFF_EVENT]';

  function isStaffUser() {
    try { return typeof isStaff === 'function' && isStaff(); } catch (e) { return false; }
  }
  function isAmiralUser() {
    try {
      if (typeof isAmiral === 'function' && isAmiral()) return true;
      if (typeof isAdmin === 'function' && isAdmin()) return true;
    } catch (e) {}
    return false;
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

  /** Un event est « staff » s'il porte le flag spécial, le tag, ou visibility admin. */
  function isStaffEvent(ev) {
    if (!ev) return false;
    if (ev.is_special_aupygo === true) return true;
    if (ev.visibility === 'admin' || ev.visibility === 'admin_only') return true;
    if (ev.type === 'special') return true;
    var d = String(ev.description || '');
    if (d.indexOf(TAG) !== -1 || d.indexOf('[STAFF_PRESENCE]') !== -1) return true;
    return false;
  }

  /** FREE est verrouillé uniquement sur les events staff GRATUITS. */
  function isGreyedForFree(ev) {
    if (plan() !== 'FREE') return false;
    if (!isStaffEvent(ev)) return false;
    return !isPaid(ev); // gratuit staff → grisé pour FREE
  }

  /* --------------------------------------------------------------------
   * Publication permanente à la création staff
   * ------------------------------------------------------------------ */
  function patchSubmit() {
    if (typeof window.submitCreateEvent !== 'function') return false;
    if (window._staffNotifySubmitPatched) return true;
    window._staffNotifySubmitPatched = true;

    var orig = window.submitCreateEvent;
    window.submitCreateEvent = async function () {
      var wasStaff = isStaffUser();
      var paidRadio = document.querySelector('input[name="eventPaid"]:checked');
      var wantsPaid = !!(paidRadio && paidRadio.value === 'paid');
      var priceEl = document.getElementById('createEventPrice');
      var priceVal = priceEl ? parseFloat(priceEl.value) : 0;

      await orig.apply(this, arguments);

      if (!wasStaff || !window.currentUser) return;

      // Après insert : forcer public + is_special_aupygo (définitif en DB)
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

          var desc = String(ev.description || '');
          if (desc.indexOf(TAG) === -1) desc = TAG + '\n' + desc;
          // Retirer tag attente
          desc = desc.replace(/\[EN_ATTENTE_VALIDATION_ADMIN\]\s*/g, '').trim();

          var payload = {
            visibility: 'public',
            is_special_aupygo: true,
            description: desc || null
          };
          if (wantsPaid && priceVal > 0) {
            payload.is_paid = true;
            payload.price = priceVal;
          }

          var { error } = await client.from('events').update(payload).eq('id', ev.id);
          if (error) {
            console.warn('[staff-event-notify] publish', error);
            return;
          }

          if (typeof showToast === 'function') {
            showToast(
              wantsPaid
                ? '✅ Événement payant publié — tous les users sont informés'
                : '✅ Événement publié — les users sont informés (FREE : grisé)',
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

  /* --------------------------------------------------------------------
   * Élargir renderSpecialEventsHero : tous les events staff (pas seulement type special)
   * ------------------------------------------------------------------ */
  function patchSpecialHero() {
    if (typeof window.renderSpecialEventsHero !== 'function') return false;
    if (window._staffNotifyHeroPatched) return true;
    window._staffNotifyHeroPatched = true;

    var orig = window.renderSpecialEventsHero;
    window.renderSpecialEventsHero = function (list) {
      // Injecte is_special_aupygo virtuel pour que le filtre d'origine les garde,
      // OU on remplace complètement l'affichage.
      var host = document.getElementById('specialEventsHero');
      if (!host) return orig.apply(this, arguments);

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

      // Auto-ouvrir la 1re invitation non vue cette session
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

  /* --------------------------------------------------------------------
   * Modal d'invitation : prix + règles FREE
   * ------------------------------------------------------------------ */
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
      if (grey) {
        // FREE + event staff gratuit → grisé
        actions =
          '<button type="button" class="btn btn-accept" style="opacity:.85" onclick="closeSpecialInviteModal();go(\'plans\')">' +
          '🔒 STANDARD pour participer (gratuit staff)</button>' +
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

      card.innerHTML =
        '<button type="button" class="special-invite-close" onclick="closeSpecialInviteModal()" aria-label="Fermer">×</button>' +
        '<div class="special-invite-sparks" aria-hidden="true"><span></span><span></span><span></span><span></span></div>' +
        '<div class="special-invite-avatar">' + emoji + '</div>' +
        '<div class="si-badge">⭐ Invitation AUPYGO' + (paid ? ' · Payant' : ' · Gratuit') + '</div>' +
        '<h3>' + (typeof escapeHtml === 'function' ? escapeHtml(ev.title || '') : (ev.title || '')) + '</h3>' +
        '<p class="si-meta">📍 ' + (typeof escapeHtml === 'function' ? escapeHtml(ev.address || '') : (ev.address || '')) + '</p>' +
        '<p class="si-meta">🕐 ' + dateStr + '</p>' +
        (desc ? '<p class="si-desc">' + (typeof escapeHtml === 'function' ? escapeHtml(desc) : desc) + '</p>' : '') +
        '<div class="special-invite-actions">' + actions + '</div>';

      ov.classList.remove('open');
      void ov.offsetWidth;
      ov.classList.add('open');
      document.body.style.overflow = 'hidden';

      if (paid) {
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
            // Join en contournant le lock FREE (event payant staff = autorisé)
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
    // Staff ne s'inscrit pas
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
      var { error } = await client.from('event_participants').insert({
        event_id: eventId,
        user_id: window.currentUser.id
      });
      if (error && !/duplicate|unique|23505/i.test(String(error.message || '') + String(error.code || ''))) {
        if (typeof showToast === 'function') showToast('Erreur : ' + (error.message || error), 'error');
        return;
      }
      if (typeof showToast === 'function') showToast('🎉 Place réservée (paiement simulé) !', 'success');
      if (typeof loadAndRenderEvents === 'function') await loadAndRenderEvents();
    } finally {
      try { currentPlan = prev; } catch (e2) {}
      window.currentPlan = prev;
    }
  }

  /* --------------------------------------------------------------------
   * Cartes grille : griser FREE sur staff gratuit ; déverrouiller staff payant
   * ------------------------------------------------------------------ */
  function applyCardRules() {
    (window.cachedEvents || []).forEach(function (ev) {
      if (!isStaffEvent(ev)) return;
      document.querySelectorAll('[data-event-id="' + ev.id + '"]').forEach(function (card) {
        var paid = isPaid(ev);
        var grey = isGreyedForFree(ev);

        // Badge prix / gratuit
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
          var lockedBtn = card.querySelector('.btn-locked, .event-upgrade, .event-join, .btn-primary');
          // Remplacer actions par cadenas
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

  /* --------------------------------------------------------------------
   * joinRealEvent : FREE peut rejoindre staff PAYANT uniquement
   * ------------------------------------------------------------------ */
  function patchJoin() {
    if (typeof window.joinRealEvent !== 'function') return false;
    if (window._staffNotifyJoin === window.joinRealEvent) return true;

    var orig = window.joinRealEvent;
    window.joinRealEvent = async function (eventId) {
      if (isStaffUser()) {
        return orig.apply(this, arguments);
      }
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
          // Ouvre le modal (prix + clause) plutôt que join direct
          if (typeof openSpecialInviteModal === 'function') {
            openSpecialInviteModal(eventId);
            return;
          }
        }
        // Staff gratuit + STANDARD/PREMIUM → join normal en contournant si besoin
        if (plan() === 'FREE' && isPaid(ev)) {
          return staffJoinPaid(eventId);
        }
      }
      return orig.apply(this, arguments);
    };
    window._staffNotifyJoin = window.joinRealEvent;
    return true;
  }

  /* --------------------------------------------------------------------
   * Republier les anciens events staff encore en visibility admin
   * ------------------------------------------------------------------ */
  async function republishStaffAdminEvents() {
    if (!isStaffUser() || !window.currentUser) return;
    var client = window.supabaseClient || window.supabase;
    if (!client) return;
    try {
      var res = await client
        .from('events')
        .select('id, visibility, description, is_special_aupygo')
        .eq('creator_id', window.currentUser.id)
        .in('visibility', ['admin', 'admin_only'])
        .limit(30);
      var rows = res.data || [];
      for (var i = 0; i < rows.length; i++) {
        var desc = String(rows[i].description || '')
          .replace(/\[EN_ATTENTE_VALIDATION_ADMIN\]\s*/g, '')
          .trim();
        if (desc.indexOf(TAG) === -1) desc = TAG + '\n' + desc;
        await client.from('events').update({
          visibility: 'public',
          is_special_aupygo: true,
          description: desc || null
        }).eq('id', rows[i].id);
      }
      if (rows.length && typeof loadAndRenderEvents === 'function') {
        await loadAndRenderEvents();
      }
    } catch (e) {
      console.warn('[staff-event-notify] republish', e);
    }
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

  function boot() {
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
  setTimeout(republishStaffAdminEvents, 2500);
  // Re-assert patches if other scripts overwrite join
  setInterval(function () {
    patchJoin();
    patchInviteModal();
    applyCardRules();
  }, 3000);

  console.log('[AUPYGO] staff-event-notify.js — staff events → users informés');
})();
