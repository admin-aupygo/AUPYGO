/* AUPYGO admin-promo-redemptions.js — liste qui a utilisé quel code (Amiral) */
(function () {
  'use strict';

  function client() {
    return window.supabaseClient || window.supabase || null;
  }
  function isAmiralNow() {
    try { return typeof isAmiral === 'function' && !!isAmiral(); } catch (e) { return false; }
  }
  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function loadRedemptions() {
    if (!isAmiralNow()) return;
    var box = document.getElementById('promoRedemptions');
    if (!box) {
      var panel = document.getElementById('aupygo-plan-panel');
      var promoList = document.getElementById('promoList');
      var host = promoList && promoList.parentNode ? promoList.parentNode : panel;
      if (!host) return;
      var h = document.createElement('h4');
      h.style.cssText = 'margin:18px 0 8px;font-size:14px';
      h.textContent = 'Utilisations — qui a utilisé un code promo';
      box = document.createElement('div');
      box.id = 'promoRedemptions';
      if (promoList && promoList.parentNode) {
        promoList.parentNode.insertBefore(h, promoList.nextSibling);
        promoList.parentNode.insertBefore(box, h.nextSibling);
      } else {
        host.appendChild(h);
        host.appendChild(box);
      }
    }
    var c = client();
    if (!c) return;
    box.innerHTML = '<p style="color:#94a3b8;font-size:13px">Chargement…</p>';
    try {
      var codesRes = await c.from('promo_codes')
        .select('id, code')
        .limit(100);
      var codeById = {};
      if (!codesRes.error && codesRes.data) {
        codesRes.data.forEach(function (r) { codeById[r.id] = r.code; });
      }

      var red = await c.from('promo_redemptions')
        .select('plan, redeemed_at, code_id, user_id')
        .order('redeemed_at', { ascending: false })
        .limit(100);
      if (red.error) throw red.error;
      var reds = red.data || [];
      if (!reds.length) {
        box.innerHTML = '<p style="color:#94a3b8;font-size:13px">Aucune utilisation pour l\'instant</p>';
        return;
      }
      var ids = [];
      reds.forEach(function (r) {
        if (r.user_id && ids.indexOf(r.user_id) === -1) ids.push(r.user_id);
      });
      var nameById = {};
      if (ids.length) {
        var pr = await c.from('profiles')
          .select('id, display_name, subscription')
          .in('id', ids);
        if (!pr.error && pr.data) {
          pr.data.forEach(function (p) {
            nameById[p.id] = {
              name: p.display_name || 'Sans nom',
              sub: String(p.subscription || 'FREE').toUpperCase()
            };
          });
        }
      }
      box.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
        '<thead><tr style="text-align:left;color:#64748b">' +
        '<th style="padding:6px">Membre</th><th>Code promo</th><th>Plan</th><th>Date</th><th>Forfait actuel</th></tr></thead><tbody>' +
        reds.map(function (r) {
          var info = nameById[r.user_id] || { name: String(r.user_id || '').slice(0, 8) + '…', sub: '—' };
          var code = codeById[r.code_id] || '—';
          var when = r.redeemed_at ? new Date(r.redeemed_at).toLocaleString() : '—';
          return '<tr>' +
            '<td style="padding:6px"><strong>' + esc(info.name) + '</strong></td>' +
            '<td><code style="background:#f3e8ff;color:#6b21a8;padding:2px 6px;border-radius:6px;font-weight:700">' +
            esc(code) + '</code></td>' +
            '<td>' + esc(r.plan) + '</td>' +
            '<td style="font-size:12px;color:#64748b">' + esc(when) + '</td>' +
            '<td>' + esc(info.sub) + '</td>' +
            '</tr>';
        }).join('') + '</tbody></table>';
    } catch (e) {
      box.innerHTML = '<p style="color:#ef4444;font-size:13px">' + esc(e.message || e) + '</p>';
      console.error('[promo-redemptions]', e);
    }
  }

  function boot() {
    if (!isAmiralNow()) return;
    loadRedemptions();
  }

  var origRefresh = window.adminRefresh;
  window.adminRefresh = function () {
    if (typeof origRefresh === 'function') origRefresh();
    setTimeout(boot, 300);
  };
  var origGo = window.go;
  if (typeof origGo === 'function') {
    window.go = function () {
      var r = origGo.apply(this, arguments);
      setTimeout(boot, 200);
      setTimeout(boot, 800);
      return r;
    };
  }
  setTimeout(boot, 800);
  setTimeout(boot, 2500);
  console.log('[AUPYGO] admin-promo-redemptions — qui a utilisé quel code');
})();
