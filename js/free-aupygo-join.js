/* ==========================================================================
 * AUPYGO — free-aupygo-join.js v3
 * FREE → rejoint seulement AUPYGO payant
 * UI : UN SEUL affichage du prix + case « paiement confirmé »
 * ========================================================================== */
(function () {
  'use strict';

  function plan() {
    try {
      return String(
        window.currentPlan ||
        (typeof currentPlan !== 'undefined' ? currentPlan : '') ||
        localStorage.getItem('aupygo_plan') ||
        'FREE'
      ).toUpperCase();
    } catch (e) {
      return 'FREE';
    }
  }

  function isStaffUser() {
    try { return typeof isStaff === 'function' && isStaff(); } catch (e) { return false; }
  }

  function client() {
    return window.supabaseClient || window.supabase || null;
  }

  function priceNum(ev) {
    if (!ev) return 0;
    var n = Number(ev.price);
    return isFinite(n) && n > 0 ? n : 0;
  }

  function isPaid(ev) {
    if (!ev) return false;
    if (priceNum(ev) > 0) return true;
    return ev.is_paid === true || ev.is_paid === 'true' || ev.is_paid === 1;
  }

  function priceLabel(ev) {
    var n = priceNum(ev);
    if (n <= 0) return '';
    return n.toFixed(2).replace(/\.00$/, '') + ' €';
  }

  function isAupygoStaff(ev) {
    if (!ev) return false;
    if (ev.is_special_aupygo === true || ev.is_special_aupygo === 'true' || ev.is_special_aupygo === 1) return true;
    if (ev.visibility === 'admin' || ev.visibility === 'admin_only') return true;
    if (String(ev.type || '').toLowerCase() === 'special') return true;
    var d = String(ev.description || '');
    if (/\[STAFF_EVENT\]|\[STAFF_PRESENCE\]/i.test(d)) return true;
    try {
      var c = (window.profiles || []).find(function (p) { return p && p.id === ev.creator_id; });
      if (c) {
        if (c.is_admin === true) return true;
        var r = String(c.role || '').toLowerCase();
        if (['amiral','admin_general','admin','major_staff','sergent_staff',
             'major_moderateur','sergent_moderateur','host','moderator'].indexOf(r) !== -1) return true;
      }
    } catch (e) {}
    return false;
  }

  function freeCanJoin(ev) {
    return isAupygoStaff(ev) && isPaid(ev);
  }

  function fromCache(eventId) {
    var id = String(eventId || '');
    var list = window.cachedEvents || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && String(list[i].id) === id) return list[i];
    }
    return null;
  }

  async function resolveEvent(eventId) {
    var ev = fromCache(eventId);
    if (ev) return ev;
    var sb = client();
    if (!sb || !eventId) return null;
    try {
      var res = await sb.from('events').select('*, event_participants(user_id)').eq('id', eventId).maybeSingle();
      if (res.data) {
        if (!Array.isArray(window.cachedEvents)) window.cachedEvents = [];
        var exists = window.cachedEvents.some(function (e) {
          return e && String(e.id) === String(res.data.id);
        });
        if (!exists) window.cachedEvents.push(res.data);
        return res.data;
      }
    } catch (e) {
      console.warn('[free-aupygo-join] resolve', e);
    }
    return null;
  }

  async function doJoin(eventId, paid) {
    var user = window.currentUser || (typeof currentUser !== 'undefined' ? currentUser : null);
    if (!user || !user.id) {
      if (typeof go === 'function') go('plans');
      return;
    }
    if (isStaffUser()) {
      if (typeof showToast === 'function') showToast('Les comptes Staff ne s\'inscrivent pas.', 'error');
      return;
    }
    var sb = client();
    if (!sb) {
      if (typeof showToast === 'function') showToast('Connexion base indisponible.', 'error');
      return;
    }

    var ins = await sb.from('event_participants').insert({
      event_id: eventId,
      user_id: user.id
    });

    if (ins.error) {
      var msg = String(ins.error.message || ins.error.code || '');
      if (/duplicate|unique|23505/i.test(msg)) {
        if (typeof showToast === 'function') showToast('Tu es déjà inscrit.', 'success');
      } else if (/403|42501|row-level|policy|permission/i.test(msg + String(ins.error.code || ''))) {
        if (typeof showToast === 'function') {
          showToast('Inscription refusée (droits base). Exécute SUPABASE_FIX_PARTICIPANTS_403.sql', 'error');
        }
      } else {
        console.error('[free-aupygo-join] insert', ins.error);
        if (typeof showToast === 'function') showToast('Erreur inscription : ' + msg, 'error');
        return;
      }
    } else if (typeof showToast === 'function') {
      showToast(paid ? '✅ Paiement confirmé — place réservée !' : '🎉 Tu es inscrit !', 'success');
    }

    if (typeof loadAndRenderEvents === 'function') {
      try { await loadAndRenderEvents(); } catch (e) {}
    }
  }

  /** Modal : un prix + une seule case de confirmation paiement */
  function openPaidModal(ev) {
    var old = document.getElementById('freeAupygoPaidOverlay');
    if (old) old.remove();

    var pl = priceLabel(ev);
    var dateStr = typeof formatEventDate === 'function'
      ? formatEventDate(ev.event_date)
      : String(ev.event_date || '');
    var esc = typeof escapeHtml === 'function'
      ? escapeHtml
      : function (s) {
          return String(s || '').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
        };

    var ov = document.createElement('div');
    ov.id = 'freeAupygoPaidOverlay';
    ov.style.cssText =
      'position:fixed;inset:0;z-index:10080;background:rgba(15,23,42,.55);' +
      'display:flex;align-items:center;justify-content:center;padding:16px';
    ov.innerHTML =
      '<div style="background:#fff;border-radius:16px;max-width:400px;width:100%;padding:22px;box-shadow:0 20px 50px rgba(0,0,0,.25)">' +
      '<button type="button" id="freeAupygoClose" style="float:right;border:0;background:0;font-size:22px;cursor:pointer;line-height:1">×</button>' +
      '<div style="font-size:28px">' + esc(ev.emoji || '🎉') + '</div>' +
      '<div style="font-size:12px;font-weight:800;color:#7c3aed;margin:8px 0 4px">⭐ Événement AUPYGO</div>' +
      '<h3 style="margin:0 0 10px;font-size:18px">' + esc(ev.title || '') + '</h3>' +
      '<p style="color:#64748b;font-size:13px;margin:4px 0">📍 ' + esc(ev.address || '') + '</p>' +
      '<p style="color:#64748b;font-size:13px;margin:4px 0 12px">🕐 ' + esc(dateStr) + '</p>' +
      '<div style="padding:14px;border-radius:12px;background:#faf5ff;border:1px solid #e9d5ff;text-align:center;margin-bottom:14px">' +
      '<div style="font-size:12px;color:#7c3aed;font-weight:700;margin-bottom:4px">MONTANT</div>' +
      '<div style="font-size:22px;font-weight:800;color:#6b21a8">' + pl + '</div></div>' +
      '<label style="display:flex;gap:10px;align-items:flex-start;font-size:13px;margin:0 0 16px;cursor:pointer;color:#1e293b;line-height:1.4">' +
      '<input type="checkbox" id="freeAupygoPayConfirm" style="margin-top:3px;width:18px;height:18px;accent-color:#7c3aed;flex-shrink:0">' +
      '<span><strong>✅ Je confirme le paiement de ' + pl + '</strong><br>' +
      '<span style="font-size:11px;color:#64748b">Non remboursable sauf obligation légale.</span></span></label>' +
      '<div style="display:flex;gap:8px">' +
      '<button type="button" id="freeAupygoAccept" class="btn btn-primary" style="flex:1">Valider · ' + pl + '</button>' +
      '<button type="button" id="freeAupygoCancel" class="btn btn-secondary" style="flex:1">Annuler</button>' +
      '</div></div>';

    document.body.appendChild(ov);

    function close() { ov.remove(); }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.getElementById('freeAupygoClose').onclick = close;
    document.getElementById('freeAupygoCancel').onclick = close;
    document.getElementById('freeAupygoAccept').onclick = function () {
      var chk = document.getElementById('freeAupygoPayConfirm');
      if (!chk || !chk.checked) {
        if (typeof showToast === 'function') {
          showToast('Coche « Je confirme le paiement » pour continuer.', 'error');
        }
        return;
      }
      close();
      doJoin(ev.id, true);
    };
  }

  function patchJoin() {
    window.joinRealEvent = async function (eventId) {
      if (!eventId) return;
      if (isStaffUser()) {
        if (typeof showToast === 'function') showToast('Les comptes Staff ne s\'inscrivent pas.', 'error');
        return;
      }
      var user = window.currentUser || (typeof currentUser !== 'undefined' ? currentUser : null);
      if (!user) {
        if (typeof showToast === 'function') showToast('Connecte-toi pour participer.', 'error');
        if (typeof go === 'function') go('plans');
        return;
      }

      var ev = await resolveEvent(eventId);
      if (!ev && typeof loadAndRenderEvents === 'function') {
        try { await loadAndRenderEvents(); } catch (e) {}
        ev = fromCache(eventId);
      }
      if (!ev) {
        if (typeof showToast === 'function') {
          showToast('Événement introuvable. Recharge la page puis réessaie.', 'error');
        }
        return;
      }

      var p = plan();
      if (p === 'FREE') {
        if (freeCanJoin(ev)) {
          openPaidModal(ev);
          return;
        }
        if (typeof showToast === 'function') {
          showToast(
            '🔒 FREE : participation uniquement aux événements AUPYGO payants. Passe en STANDARD pour les gratuites.',
            'error'
          );
        }
        return;
      }

      if (isAupygoStaff(ev) && isPaid(ev)) {
        openPaidModal(ev);
        return;
      }
      return doJoin(eventId, false);
    };
    window._freeAupygoJoin = window.joinRealEvent;
    return true;
  }

  /**
   * Nettoie les doublons de prix sur une carte.
   * Garde : badge type (sans prix répété) + UN bouton avec le prix.
   */
  function cleanCardPrices(card, ev) {
    // Supprimer toutes les lignes injectées par les autres patches
    card.querySelectorAll(
      '.cdc-price, .aupygo-price-line, .staff-ev-badge, [data-aupygo-price]'
    ).forEach(function (el) { el.remove(); });

    // Supprimer les .event-details qui ne font qu'afficher un prix / « Payant »
    var priceLines = [];
    card.querySelectorAll('.event-details, p, span, div').forEach(function (el) {
      if (el.closest('button')) return;
      if (el.querySelector && el.querySelector('button')) return;
      var t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      // Lignes du type « 23 € », « 💶 23 € », « Payant · 23 € »
      if (/^(💶\s*)?(Payant\s*[·•\-]?\s*)?\d+([.,]\d+)?\s*€$/i.test(t)) {
        priceLines.push(el);
      }
    });
    // Tout supprimer (le prix reste sur le bouton uniquement)
    priceLines.forEach(function (el) { el.remove(); });

    // Badge : « Événement AUPYGO » sans empiler le prix plusieurs fois
    var badge = card.querySelector('.badge');
    if (badge && isAupygoStaff(ev)) {
      var paid = isPaid(ev);
      badge.textContent = paid
        ? ('Événement AUPYGO · ' + priceLabel(ev))
        : 'Événement AUPYGO · Gratuit';
    }
  }

  function applyCards() {
    (window.cachedEvents || []).forEach(function (ev) {
      if (!ev || !ev.id) return;
      document.querySelectorAll('[data-event-id="' + ev.id + '"]').forEach(function (card) {
        cleanCardPrices(card, ev);

        if (freeCanJoin(ev)) {
          card.style.opacity = '1';
          card.style.filter = 'none';
          var joinBtns = card.querySelectorAll(
            '.btn-locked, .event-upgrade, .event-join, button.btn-primary'
          );
          var done = false;
          joinBtns.forEach(function (btn) {
            var tx = (btn.textContent || '').toLowerCase();
            if (/refuser|delete|🗑️|participants|inscrit|complet|toi/i.test(tx)) return;
            if (btn.disabled && /inscrit|complet/i.test(tx)) return;
            btn.disabled = false;
            btn.className = 'btn btn-primary event-join';
            // UN SEUL libellé prix sur le bouton
            btn.textContent = priceLabel(ev);
            btn.onclick = function (e) {
              e.preventDefault();
              e.stopPropagation();
              openPaidModal(ev);
            };
            done = true;
          });
          // Si aucun bouton trouvé, en créer un
          if (!done) {
            var actions = card.querySelector('.event-actions-row') || card.querySelector('.event-body') || card;
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-primary event-join';
            b.textContent = priceLabel(ev);
            b.onclick = function (e) {
              e.preventDefault();
              openPaidModal(ev);
            };
            actions.appendChild(b);
          }
        } else if (plan() === 'FREE') {
          card.querySelectorAll('.event-join, button.btn-primary, .btn-locked, .event-upgrade').forEach(function (btn) {
            var tx = (btn.textContent || '').toLowerCase();
            if (/refuser|delete|🗑️|participants|inscrit|complet|toi/i.test(tx)) return;
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

  function patchLoad() {
    if (typeof window.loadAndRenderEvents !== 'function') return false;
    if (window._freeAupygoLoadPatched) return true;
    window._freeAupygoLoadPatched = true;
    var orig = window.loadAndRenderEvents;
    window.loadAndRenderEvents = async function () {
      var r = await orig.apply(this, arguments);
      setTimeout(applyCards, 50);
      setTimeout(applyCards, 350);
      return r;
    };
    return true;
  }

  function patchBuildCard() {
    if (typeof window.buildEventCardHtml !== 'function') return false;
    if (window._freeAupygoCardPatched) return true;
    window._freeAupygoCardPatched = true;
    var orig = window.buildEventCardHtml;
    window.buildEventCardHtml = function (ev, locked) {
      if (freeCanJoin(ev)) locked = false;
      else if (plan() === 'FREE') locked = true;
      var html = orig.call(this, ev, locked);
      // Nettoyage HTML : retirer lignes prix dupliquées dans le template
      if (typeof html === 'string' && isPaid(ev)) {
        // garde une seule occurrence éventuelle dans le body — le bouton portera le prix
      }
      return html;
    };
    return true;
  }

  document.addEventListener(
    'click',
    function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var btn = t.closest('button, a, [onclick]');
      if (!btn) return;
      var oc = btn.getAttribute('onclick') || '';
      var m = oc.match(/joinRealEvent\s*\(\s*['"]([^'"]+)['"]\s*\)/);
      if (!m) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof window.joinRealEvent === 'function') window.joinRealEvent(m[1]);
    },
    true
  );

  function boot() {
    patchJoin();
    patchLoad();
    patchBuildCard();
    applyCards();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  setTimeout(boot, 400);
  setTimeout(boot, 1200);
  setTimeout(boot, 2500);
  setInterval(function () {
    if (window.joinRealEvent !== window._freeAupygoJoin) patchJoin();
    applyCards();
  }, 2500);

  console.log('[AUPYGO] free-aupygo-join.js v3 — 1 prix + confirmation paiement');
})();
