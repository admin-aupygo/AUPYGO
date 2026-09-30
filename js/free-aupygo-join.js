/* ==========================================================================
 * AUPYGO — free-aupygo-join.js
 * Source de vérité pour les règles de participation FREE.
 * Chargé EN DERNIER.
 *
 * FREE  → voit tout
 * FREE  → rejoint SEULEMENT si événement AUPYGO staff ET prix > 0
 * STD+  → rejoint librement
 * Amiral → seul peut créer du payant (UI)
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
    try {
      return typeof isStaff === 'function' && isStaff();
    } catch (e) {
      return false;
    }
  }

  function isAmiralUser() {
    try {
      if (typeof isAmiral === 'function' && isAmiral()) return true;
      if (typeof isAdmin === 'function' && isAdmin()) return true;
    } catch (e) {}
    return false;
  }

  function getEv(id) {
    return (window.cachedEvents || []).find(function (e) {
      return e && String(e.id) === String(id);
    }) || null;
  }

  /** Prix numérique (tolère string, null) */
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
      var c = (window.profiles || []).find(function (p) {
        return p && p.id === ev.creator_id;
      });
      if (c) {
        if (c.is_admin === true) return true;
        var r = String(c.role || '').toLowerCase();
        if (
          [
            'amiral', 'admin_general', 'admin',
            'major_staff', 'sergent_staff',
            'major_moderateur', 'sergent_moderateur',
            'host', 'moderator'
          ].indexOf(r) !== -1
        ) return true;
      }
    } catch (e) {}
    return false;
  }

  /** FREE peut rejoindre ? */
  function freeCanJoin(ev) {
    return isAupygoStaff(ev) && isPaid(ev);
  }

  /* ---- Join réel (insert participant) ---- */
  async function doJoin(eventId, paid) {
    var user = window.currentUser || (typeof currentUser !== 'undefined' ? currentUser : null);
    if (!user || !user.id) {
      if (typeof go === 'function') go('plans');
      return;
    }
    if (isStaffUser()) {
      if (typeof showToast === 'function') {
        showToast('Les comptes Staff ne s\'inscrivent pas.', 'error');
      }
      return;
    }
    var client = window.supabaseClient || window.supabase;
    if (!client) {
      if (typeof showToast === 'function') showToast('Connexion base indisponible.', 'error');
      return;
    }

    var { error } = await client.from('event_participants').insert({
      event_id: eventId,
      user_id: user.id
    });

    if (error) {
      var msg = String(error.message || error.code || '');
      if (/duplicate|unique|23505/i.test(msg)) {
        if (typeof showToast === 'function') showToast('Tu es déjà inscrit.', 'success');
      } else {
        console.error('[free-aupygo-join] insert', error);
        if (typeof showToast === 'function') {
          showToast('Erreur inscription : ' + msg, 'error');
        }
        return;
      }
    } else if (typeof showToast === 'function') {
      showToast(paid ? '🎉 Place réservée (paiement simulé) !' : '🎉 Tu es inscrit !', 'success');
    }

    if (typeof loadAndRenderEvents === 'function') {
      try { await loadAndRenderEvents(); } catch (e) {}
    }
  }

  /* ---- Modal acceptation payant ---- */
  function openPaidModal(ev) {
    var existing = document.getElementById('freeAupygoPaidOverlay');
    if (existing) existing.remove();

    var pl = priceLabel(ev);
    var dateStr = typeof formatEventDate === 'function'
      ? formatEventDate(ev.event_date)
      : String(ev.event_date || '');
    var esc = typeof escapeHtml === 'function'
      ? escapeHtml
      : function (s) {
          return String(s || '')
            .replace(/&/g, '&')
            .replace(/</g, '<')
            .replace(/>/g, '>');
        };

    var ov = document.createElement('div');
    ov.id = 'freeAupygoPaidOverlay';
    ov.style.cssText =
      'position:fixed;inset:0;z-index:10080;background:rgba(15,23,42,.55);' +
      'display:flex;align-items:center;justify-content:center;padding:16px';
    ov.innerHTML =
      '<div style="background:#fff;border-radius:16px;max-width:420px;width:100%;padding:20px;max-height:90vh;overflow:auto">' +
      '<button type="button" id="freeAupygoClose" style="float:right;border:0;background:0;font-size:22px;cursor:pointer">×</button>' +
      '<div style="font-size:28px">' + esc(ev.emoji || '🎉') + '</div>' +
      '<div style="font-size:12px;font-weight:800;color:#7c3aed;margin:6px 0">⭐ Événement AUPYGO · Payant</div>' +
      '<h3 style="margin:4px 0">' + esc(ev.title || '') + '</h3>' +
      '<p style="color:#64748b;font-size:13px;margin:4px 0">📍 ' + esc(ev.address || '') + '</p>' +
      '<p style="color:#64748b;font-size:13px;margin:4px 0">🕐 ' + esc(dateStr) + '</p>' +
      '<div style="margin:14px 0;padding:12px;border-radius:12px;background:#faf5ff;border:1px solid #e9d5ff;font-weight:800;color:#7c3aed">💶 ' + pl + '</div>' +
      '<label style="display:flex;gap:10px;align-items:flex-start;font-size:12px;margin:12px 0;cursor:pointer">' +
      '<input type="checkbox" id="freeAupygoRefund" style="margin-top:3px">' +
      '<span>J\'accepte la clause de non-remboursement (paiement non remboursable sauf obligation légale).</span></label>' +
      '<div style="display:flex;gap:8px;margin-top:12px">' +
      '<button type="button" class="btn btn-primary" id="freeAupygoAccept" style="flex:1">💶 Accepter · ' + pl + '</button>' +
      '<button type="button" class="btn btn-secondary" id="freeAupygoCancel" style="flex:1">Annuler</button>' +
      '</div></div>';

    document.body.appendChild(ov);

    function close() {
      ov.remove();
    }
    ov.addEventListener('click', function (e) {
      if (e.target === ov) close();
    });
    document.getElementById('freeAupygoClose').onclick = close;
    document.getElementById('freeAupygoCancel').onclick = close;
    document.getElementById('freeAupygoAccept').onclick = function () {
      var chk = document.getElementById('freeAupygoRefund');
      if (!chk || !chk.checked) {
        if (typeof showToast === 'function') {
          showToast('Coche la clause de non-remboursement pour continuer.', 'error');
        }
        return;
      }
      close();
      doJoin(ev.id, true);
    };
  }

  /* ---- Patch joinRealEvent (dernier mot) ---- */
  function patchJoin() {
    if (typeof window.joinRealEvent !== 'function') return false;

    // Toujours remplacer pour gagner sur les autres scripts
    window.joinRealEvent = async function (eventId) {
      if (isStaffUser()) {
        if (typeof showToast === 'function') {
          showToast('Les comptes Staff ne s\'inscrivent pas aux sorties.', 'error');
        }
        return;
      }

      var user = window.currentUser || (typeof currentUser !== 'undefined' ? currentUser : null);
      if (!user) {
        if (typeof showToast === 'function') showToast('Connecte-toi pour participer.', 'error');
        if (typeof go === 'function') go('plans');
        return;
      }

      var ev = getEv(eventId);
      if (!ev) {
        if (typeof showToast === 'function') showToast('Événement introuvable.', 'error');
        return;
      }

      var p = plan();

      // --- FREE ---
      if (p === 'FREE') {
        if (freeCanJoin(ev)) {
          openPaidModal(ev);
          return;
        }
        if (typeof showToast === 'function') {
          showToast(
            '🔒 FREE : tu vois toutes les sorties. ' +
              'Participation uniquement aux événements AUPYGO payants. ' +
              'Passe en STANDARD pour les sorties gratuites.',
            'error'
          );
        }
        return;
      }

      // --- STANDARD / PREMIUM ---
      if (isAupygoStaff(ev) && isPaid(ev)) {
        openPaidModal(ev);
        return;
      }

      // Join direct gratuit
      return doJoin(eventId, false);
    };

    window._freeAupygoJoin = window.joinRealEvent;
    return true;
  }

  /* ---- Cartes : unlock AUPYGO payant pour FREE ---- */
  function applyCards() {
    (window.cachedEvents || []).forEach(function (ev) {
      if (!ev || !ev.id) return;
      document.querySelectorAll('[data-event-id="' + ev.id + '"]').forEach(function (card) {
        if (isAupygoStaff(ev)) {
          var badge = card.querySelector('.badge');
          if (badge) {
            var t = badge.textContent || '';
            if (t.indexOf('Événement AUPYGO') === -1) {
              badge.textContent =
                'Événement AUPYGO' +
                (isPaid(ev) ? ' · 💶 ' + priceLabel(ev) : ' · Gratuit');
            }
          }
        }

        if (freeCanJoin(ev)) {
          card.style.opacity = '1';
          card.style.filter = 'none';
          card.querySelectorAll('.btn-locked, .event-upgrade, .event-join, button.btn-primary').forEach(function (btn) {
            var tx = (btn.textContent || '').toLowerCase();
            if (/refuser|delete|🗑️|participants|inscrit|complet/i.test(tx)) return;
            if (btn.disabled && /inscrit|complet/i.test(tx)) return;
            btn.disabled = false;
            btn.className = 'btn btn-primary event-join';
            btn.textContent = '💶 ' + priceLabel(ev);
            btn.onclick = function (e) {
              e.preventDefault();
              e.stopPropagation();
              openPaidModal(ev);
            };
          });
        } else if (plan() === 'FREE') {
          card.querySelectorAll('.event-join, button.btn-primary').forEach(function (btn) {
            var tx = (btn.textContent || '').toLowerCase();
            if (/refuser|delete|🗑️|participants|inscrit|complet/i.test(tx)) return;
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
      setTimeout(applyCards, 60);
      setTimeout(applyCards, 400);
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
      return orig.call(this, ev, locked);
    };
    return true;
  }

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
  setTimeout(boot, 3000);
  setInterval(function () {
    if (window.joinRealEvent !== window._freeAupygoJoin) patchJoin();
    applyCards();
  }, 2000);

  console.log('[AUPYGO] free-aupygo-join.js prêt — FREE → AUPYGO payant seulement');
})();
