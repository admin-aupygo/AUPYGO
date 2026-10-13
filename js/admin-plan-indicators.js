/* AUPYGO admin-plan-indicators.js
 * Liste utilisateurs (Forfaits & codes promo) :
 *  - badge VERT  = forfait de base (free / stripe / manuel)
 *  - badge ORANGE zébré = avantage promo temporaire + date de fin
 */
(function () {
  'use strict';

  var PLANS = ['FREE', 'STANDARD', 'PREMIUM'];
  var promoByUser = {}; // user_id -> { ends_at, plan, previous_plan }
  var usersCache = [];

  function client() {
    return window.supabaseClient || window.supabase || null;
  }

  function isAmiralNow() {
    try {
      if (typeof isAmiral === 'function' && isAmiral()) return true;
      if (window.currentUser && (window.currentUser.role === 'amiral' || window.currentUser.is_admin)) return true;
    } catch (e) {}
    return false;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDate(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) { return ''; }
  }

  function isPromoActive(u) {
    var src = String(u.subscription_source || '').toLowerCase();
    if (src === 'promo') {
      if (u.subscription_expires_at) {
        var t = new Date(u.subscription_expires_at).getTime();
        if (!isNaN(t) && t > Date.now()) return true;
        if (!isNaN(t) && t <= Date.now()) return false;
      }
      return true;
    }
    var pr = promoByUser[u.id];
    if (pr && pr.ends_at) {
      var te = new Date(pr.ends_at).getTime();
      if (!isNaN(te) && te > Date.now()) return true;
    }
    return false;
  }

  function planBadgeHtml(u) {
    var plan = String(u.subscription || 'FREE').toUpperCase();
    var promo = isPromoActive(u);
    var ends = u.subscription_expires_at || (promoByUser[u.id] && promoByUser[u.id].ends_at) || null;
    var endsLabel = fmtDate(ends);

    if (promo && plan !== 'FREE') {
      return '<span class="plan-ind plan-ind-promo" title="Avantage promo temporaire' +
        (endsLabel ? ' jusqu\'au ' + endsLabel : '') + '">' +
        esc(plan) + ' · promo' +
        (endsLabel ? ' → ' + endsLabel : '') +
        '</span>';
    }

    var cls = 'plan-ind plan-ind-base plan-ind-' + plan.toLowerCase();
    var tip = 'Forfait de base';
    if (u.stripe_subscription_id) tip = 'Abonnement Stripe';
    else if (String(u.subscription_source || '').toLowerCase() === 'manual') tip = 'Forfait manuel (admin)';
    return '<span class="' + cls + '" title="' + tip + '">' + esc(plan) + '</span>';
  }

  function renderList() {
    var box = document.getElementById('planUserList');
    if (!box) return;
    var search = (document.getElementById('planUserSearch') || {}).value || '';
    var q = search.trim().toLowerCase();
    var list = usersCache.filter(function (u) {
      if (!q) return true;
      return String(u.display_name || '').toLowerCase().indexOf(q) !== -1;
    });
    if (!list.length) {
      box.innerHTML = '<p class="plan-ind-empty">Aucun membre</p>';
      return;
    }

    // Légende une fois
    var legend =
      '<div class="plan-ind-legend">' +
        '<span class="plan-ind plan-ind-base plan-ind-free">FREE</span> base &nbsp;' +
        '<span class="plan-ind plan-ind-base plan-ind-standard">STANDARD</span> base &nbsp;' +
        '<span class="plan-ind plan-ind-base plan-ind-premium">PREMIUM</span> base &nbsp;' +
        '<span class="plan-ind plan-ind-promo">PREMIUM · promo</span> temporaire' +
      '</div>';

    box.innerHTML = legend + list.map(function (u) {
      var plan = String(u.subscription || 'FREE').toUpperCase();
      var name = esc(u.display_name || 'Sans nom');
      var promo = isPromoActive(u);
      var rowCls = 'plan-ind-row' + (promo ? ' plan-ind-row-promo' : '');
      var btns = PLANS.map(function (p) {
        if (p === plan) {
          return '<span class="admin-act-btn" style="opacity:.5;cursor:default">' + p + ' ✓</span>';
        }
        return '<button type="button" class="admin-act-btn" onclick="window.adminSetSubscription(\'' +
          u.id + '\',\'' + p + '\')">' + p + '</button>';
      }).join('');
      return '<div class="' + rowCls + '">' +
        '<div class="plan-ind-name"><strong>' + name + '</strong> ' + planBadgeHtml(u) + '</div>' +
        '<div class="admin-actions">' + btns + '</div></div>';
    }).join('');
  }

  async function loadPromoMap(c) {
    promoByUser = {};
    try {
      var res = await c.from('promo_redemptions')
        .select('user_id, plan, ends_at, previous_plan, status')
        .eq('status', 'active');
      if (res.error) {
        // colonnes status/ends_at absentes → fallback sans filtre
        res = await c.from('promo_redemptions')
          .select('user_id, plan, redeemed_at');
      }
      (res.data || []).forEach(function (r) {
        if (!r.user_id) return;
        var ends = r.ends_at || null;
        if (!ends && r.redeemed_at) {
          try {
            ends = new Date(new Date(r.redeemed_at).getTime() + 7 * 86400000).toISOString();
          } catch (e) {}
        }
        if (ends && new Date(ends).getTime() <= Date.now()) return;
        promoByUser[r.user_id] = {
          plan: r.plan,
          ends_at: ends,
          previous_plan: r.previous_plan || 'FREE'
        };
      });
    } catch (e) {
      console.warn('[plan-indicators] promo map', e);
    }
  }

  async function refresh() {
    var box = document.getElementById('planUserList');
    if (!box || !isAmiralNow()) return;
    var c = client();
    if (!c) return;
    box.innerHTML = '<p class="plan-ind-empty">Chargement…</p>';
    try {
      await loadPromoMap(c);
      var res = await c.from('profiles')
        .select('id, display_name, subscription, subscription_source, subscription_expires_at, stripe_subscription_id, role, is_admin')
        .order('display_name');
      if (res.error) {
        // colonnes manquantes → select minimal
        res = await c.from('profiles')
          .select('id, display_name, subscription, role, is_admin')
          .order('display_name');
      }
      if (res.error) throw res.error;
      usersCache = res.data || [];
      renderList();
    } catch (e) {
      box.innerHTML = '<p style="color:#ef4444">Erreur chargement</p>';
      console.error('[plan-indicators]', e);
    }
  }

  function patch() {
    // Remplace le rendu du module admin-set-plan
    window._aupygoRenderPlanUsers = renderList;
    if (typeof window.refreshPlanUserList === 'function' || true) {
      window.refreshPlanUserList = refresh;
    }

    // Intercepter après injection du panneau
    var origRefresh = null;
    try {
      // Hook adminRefresh
      if (typeof window.adminRefresh === 'function' && !window._planIndAdminRefresh) {
        window._planIndAdminRefresh = true;
        var ar = window.adminRefresh;
        window.adminRefresh = function () {
          var r = ar.apply(this, arguments);
          setTimeout(refresh, 300);
          setTimeout(refresh, 900);
          return r;
        };
      }
    } catch (e) {}

    // Recherche
    document.addEventListener('input', function (e) {
      if (e.target && e.target.id === 'planUserSearch') renderList();
    });
  }

  function boot() {
    patch();
    if (document.getElementById('planUserList')) {
      refresh();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(boot, 600);
      setTimeout(boot, 2000);
    });
  } else {
    setTimeout(boot, 600);
    setTimeout(boot, 2000);
  }

  // Navigation admin
  var origGo = window.go;
  if (typeof origGo === 'function' && !window._planIndGo) {
    window._planIndGo = true;
    window.go = function (page) {
      var r = origGo.apply(this, arguments);
      if (page === 'admin' || page === 'administration') {
        setTimeout(boot, 200);
        setTimeout(refresh, 800);
      }
      return r;
    };
  }

  console.log('[AUPYGO] admin-plan-indicators.js chargé');
})();
