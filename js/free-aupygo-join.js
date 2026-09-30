/* ==========================================================================
 * AUPYGO — free-aupygo-join.js v2
 * FREE voit tout · rejoint SEULEMENT AUPYGO staff PAYANT (price > 0)
 * Résout l'événement depuis le cache OU Supabase (plus de « introuvable »)
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

  /** Cherche dans le cache (comparaison souple des ids) */
  function fromCache(eventId) {
    var id = String(eventId || '');
    var list = window.cachedEvents || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && String(list[i].id) === id) return list[i];
    }
    return null;
  }

  /** Charge depuis Supabase si absent du cache */
  async function resolveEvent(eventId) {
    var ev = fromCache(eventId);
    if (ev) return ev;

    var sb = client();
    if (!sb || !eventId) return null;

    try {
      var res = await sb
        .from('events')
        .select('*, event_participants(user_id)')
        .eq('id', eventId)
        .maybeSingle();

      if (res.error) {
        console.warn('[free-aupygo-join] fetch event', res.error);
        return null;
      }
      if (res.data) {
        // Injecte dans le cache pour les prochains appels
        if (!Array.isArray(window.cachedEvents)) window.cachedEvents = [];
        var exists = window.cachedEvents.some(function (e) {
          return e && String(e.id) === String(res.data.id);
        });
        if (!exists) window.cachedEvents.push(res.data);
        return res.data;
      }
    } catch (e) {
      console.warn('[free-aupygo-join] resolveEvent', e);
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
      } else {
        console.error('[free-aupygo-join] insert', ins.error);
        if (typeof showToast === 'function') showToast('Erreur inscription : ' + msg, 'error');
        return;
      }
    } else if (typeof showToast === 'function') {
      showToast(paid ? '🎉 Place réservée (paiement simulé) !' : '🎉 Tu es inscrit !', 'success');
    }

    if (typeof loadAndRenderEvents === 'function') {
      try { await loadAndRenderEvents(); } catch (e) {}
    }
  }

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
      '<div style="background:#fff;border-radius:16px;max-width:420px;width:100%;padding:20px;max-height:90vh;overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,.25)">' +
      '<button type="button" id="freeAupygoClose" style="float:right;border:0;background:0;font-size:22px;cursor:pointer">×</button>' +
      '<div style="font-size:28px">' + esc(ev.emoji || '🎉') + '</div>' +
      '<div style="font-size:12px;font-weight:800;color:#7c3aed;margin:6px 0">⭐ Événement AUPYGO · Payant</div>' +
      '<h3 style="margin:4px 0 8px">' + esc(ev.title || '') + '</h3>' +
      '<p style="color:#64748b;font-size:13px;margin:4px 0">📍 ' + esc(ev.address || '') + '</p>' +
      '<p style="color:#64748b;font-size:13px;margin:4px 0">🕐 ' + esc(dateStr) + '</p>' +
      '<div style="margin:14px 0;padding:12px;border-radius:12px;background:#faf5ff;border:1px solid #e9d5ff;font-weight:800;color:#7c3aed">💶 ' + pl + '</div>' +
      '<label style="display:flex;gap:10px;align-items:flex-start;font-size:12px;margin:12px 0;cursor:pointer;color:#334155">' +
      '<input type="checkbox" id="freeAupygoRefund" style="margin-top:3px">' +
      '<span>J\'accepte la clause de non-remboursement (paiement non remboursable sauf obligation légale).</span></label>' +
      '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">' +
      '<button type="button" class="btn btn-primary" id="freeAupygoAccept" style="flex:1;min-width:120px">💶 Accepter · ' + pl + '</button>' +
      '<button type="button" class="btn btn-secondary" id="freeAupygoCancel" style="flex:1;min-width:100px">Annuler</button>' +
      '</div></div>';

    document.body.appendChild(ov);

    function close() { ov.remove(); }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    var c1 = document.getElementById('freeAupygoClose');
    var c2 = document.getElementById('freeAupygoCancel');
    var ok = document.getElementById('freeAupygoAccept');
    if (c1) c1.onclick = close;
    if (c2) c2.onclick = close;
    if (ok) {
      ok.onclick = function () {
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
  }

  function patchJoin() {
    if (typeof window.joinRealEvent !== 'function' && typeof window.joinRealEvent === 'undefined') {
      // Définir quand même une implémentation si absente
    }

    window.joinRealEvent = async function (eventId) {
      if (!eventId) {
        if (typeof showToast === 'function') showToast('Identifiant événement manquant.', 'error');
        return;
      }

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

      var ev = await resolveEvent(eventId);
      if (!ev) {
        // Dernier recours : recharger la liste puis réessayer le cache
        if (typeof loadAndRenderEvents === 'function') {
          try { await loadAndRenderEvents(); } catch (e) {}
          ev = fromCache(eventId);
        }
      }
      if (!ev) {
        console.warn('[free-aupygo-join] event not found', eventId, 'cache size', (window.cachedEvents || []).length);
        if (typeof showToast === 'function') {
          showToast('Événement introuvable. Recharge la page (Ctrl+Shift+R) puis réessaie.', 'error');
        }
        return;
      }

      var p = plan();

      // FREE → uniquement AUPYGO payant
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

      // STANDARD / PREMIUM
      if (isAupygoStaff(ev) && isPaid(ev)) {
        openPaidModal(ev);
        return;
      }
      return doJoin(eventId, false);
    };

    window._freeAupygoJoin = window.joinRealEvent;
    return true;
  }

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
          card.querySelectorAll('button').forEach(function (btn) {
            var tx = (btn.textContent || '').toLowerCase();
            if (/refuser|delete|🗑️|participants|inscrit|complet/i.test(tx)) return;
            if (btn.disabled && /inscrit|complet|toi/i.test(tx)) return;
            // Cible les boutons d'action join / lock
            if (!/standard|participer|€|join|accepter|locked/i.test(tx) &&
                !btn.classList.contains('btn-locked') &&
                !btn.classList.contains('event-upgrade') &&
                !btn.classList.contains('event-join') &&
                !btn.classList.contains('btn-primary')) return;

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
          card.querySelectorAll('button').forEach(function (btn) {
            var tx = (btn.textContent || '').toLowerCase();
            if (/refuser|delete|🗑️|participants|inscrit|complet|toi/i.test(tx)) return;
            if (btn.disabled) return;
            if (!/standard|participer|€|join|accepter/i.test(tx) &&
                !btn.classList.contains('event-join') &&
                !btn.classList.contains('btn-primary')) return;
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

  // Délégation clic : boutons avec onclick joinRealEvent(id) même si patch tardif
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
      if (typeof window.joinRealEvent === 'function') {
        window.joinRealEvent(m[1]);
      }
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
  setTimeout(boot, 3000);
  setInterval(function () {
    if (window.joinRealEvent !== window._freeAupygoJoin) patchJoin();
    applyCards();
  }, 2500);

  console.log('[AUPYGO] free-aupygo-join.js v2 — resolve DB + FREE AUPYGO payant');
})();
