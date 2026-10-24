/* AUPYGO admin-set-plan.js
 * Amiral : forfaits + codes promo (créer / modifier / activer-désactiver)
 * RPC : admin_set_subscription, admin_create_promo_code, admin_update_promo_code, redeem_promo_code
 */
(function () {
  'use strict';

  var PLANS = ['FREE', 'STANDARD', 'PREMIUM'];
  var panelReady = false;
  var editingPromoId = null;

  function client() {
    return window.supabaseClient || window.supabase || null;
  }

  function toast(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type || 'success');
    else console.log('[plan]', msg);
  }

  function isAmiralNow() {
    try {
      if (typeof isAmiral === 'function') return !!isAmiral();
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

  window.adminSetSubscription = async function (userId, plan) {
    if (!isAmiralNow()) { toast('Réservé à l\'Amiral', 'error'); return; }
    plan = String(plan || '').toUpperCase();
    if (PLANS.indexOf(plan) === -1) { toast('Forfait invalide', 'error'); return; }
    var c = client();
    if (!c) { toast('Supabase indisponible', 'error'); return; }
    try {
      var res = await c.rpc('admin_set_subscription', { p_user_id: userId, p_plan: plan });
      if (res.error) { toast(res.error.message || 'Erreur forfait', 'error'); return; }
      toast('✓ Forfait « ' + plan + ' » enregistré', 'success');
      if (typeof window.adminRefresh === 'function') window.adminRefresh();
      refreshPlanUserList();
    } catch (e) {
      toast('Erreur: ' + (e.message || e), 'error');
    }
  };

  function resetPromoForm() {
    editingPromoId = null;
    var codeEl = document.getElementById('promoCodeInput');
    var planEl = document.getElementById('promoPlanSelect');
    var maxEl = document.getElementById('promoMaxUses');
    var daysEl = document.getElementById('promoValidDays');
    var benefitEl = document.getElementById('promoBenefitDays');
    var noteEl = document.getElementById('promoNote');
    var activeEl = document.getElementById('promoActiveCheck');
    var btn = document.getElementById('promoSubmitBtn');
    var cancel = document.getElementById('promoCancelEdit');
    if (codeEl) { codeEl.value = ''; codeEl.readOnly = false; }
    if (planEl) planEl.value = 'STANDARD';
    if (maxEl) maxEl.value = '';
    if (daysEl) daysEl.value = '';
    if (benefitEl) benefitEl.value = '7';
    if (noteEl) noteEl.value = '';
    if (activeEl) activeEl.checked = true;
    if (btn) btn.textContent = 'Créer le code';
    if (cancel) cancel.style.display = 'none';
  }

  window.adminCancelPromoEdit = function () {
    resetPromoForm();
  };

  window.adminEditPromoCode = async function (id) {
    if (!isAmiralNow() || !id) return;
    var c = client();
    if (!c) return;
    try {
      var res = await c.from('promo_codes')
        .select('id, code, plan, max_uses, used_count, valid_until, active, note, benefit_days')
        .eq('id', id)
        .maybeSingle();
      if (res.error || !res.data) {
        toast('Code introuvable', 'error');
        return;
      }
      var r = res.data;
      editingPromoId = r.id;
      var codeEl = document.getElementById('promoCodeInput');
      var planEl = document.getElementById('promoPlanSelect');
      var maxEl = document.getElementById('promoMaxUses');
      var daysEl = document.getElementById('promoValidDays');
      var benefitEl = document.getElementById('promoBenefitDays');
      var noteEl = document.getElementById('promoNote');
      var activeEl = document.getElementById('promoActiveCheck');
      var btn = document.getElementById('promoSubmitBtn');
      var cancel = document.getElementById('promoCancelEdit');
      if (codeEl) { codeEl.value = r.code || ''; codeEl.readOnly = true; }
      if (planEl) planEl.value = String(r.plan || 'STANDARD').toUpperCase();
      if (maxEl) maxEl.value = r.max_uses != null ? r.max_uses : '';
      if (daysEl) {
        if (r.valid_until) {
          var left = Math.ceil((new Date(r.valid_until) - Date.now()) / 86400000);
          daysEl.value = left > 0 ? left : '';
        } else daysEl.value = '';
      }
      if (benefitEl) benefitEl.value = r.benefit_days != null ? r.benefit_days : '7';
      if (noteEl) noteEl.value = r.note || '';
      if (activeEl) activeEl.checked = r.active !== false;
      if (btn) btn.textContent = 'Enregistrer les modifications';
      if (cancel) cancel.style.display = '';
      try { codeEl && codeEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
      toast('Modification du code « ' + r.code + ' »', 'info');
    } catch (e) {
      toast('Erreur: ' + (e.message || e), 'error');
    }
  };

  window.adminSubmitPromoCode = async function () {
    if (!isAmiralNow()) { toast('Réservé à l\'Amiral', 'error'); return; }
    var codeEl = document.getElementById('promoCodeInput');
    var planEl = document.getElementById('promoPlanSelect');
    var maxEl = document.getElementById('promoMaxUses');
    var daysEl = document.getElementById('promoValidDays');
    var benefitEl = document.getElementById('promoBenefitDays');
    var noteEl = document.getElementById('promoNote');
    var activeEl = document.getElementById('promoActiveCheck');
    var code = (codeEl && codeEl.value || '').trim();
    var plan = (planEl && planEl.value || 'STANDARD').toUpperCase();
    var maxUses = maxEl && maxEl.value !== '' ? parseInt(maxEl.value, 10) : null;
    var validDays = daysEl && daysEl.value !== '' ? parseInt(daysEl.value, 10) : null;
    var benefitDays = benefitEl && benefitEl.value !== '' ? parseInt(benefitEl.value, 10) : 7;
    var note = noteEl && noteEl.value ? noteEl.value.trim() : null;
    var active = activeEl ? !!activeEl.checked : true;
    var c = client();
    if (!c) return;

    if (editingPromoId) {
      try {
        var res = await c.rpc('admin_update_promo_code', {
          p_id: editingPromoId,
          p_plan: plan,
          p_max_uses: maxUses,
          p_valid_days: validDays,
          p_note: note,
          p_benefit_days: benefitDays,
          p_active: active,
          p_clear_max_uses: maxEl && maxEl.value === '',
          p_clear_valid_until: daysEl && daysEl.value === ''
        });
        if (res.error) {
          toast(res.error.message || 'Erreur modification', 'error');
          return;
        }
        toast('✓ Code mis à jour', 'success');
        resetPromoForm();
        loadPromoList();
      } catch (e) {
        toast('Erreur: ' + (e.message || e), 'error');
      }
      return;
    }

    if (code.length < 4) { toast('Code trop court (min. 4)', 'error'); return; }
    try {
      var res2 = await c.rpc('admin_create_promo_code', {
        p_code: code,
        p_plan: plan,
        p_max_uses: maxUses,
        p_valid_days: validDays,
        p_note: note,
        p_benefit_days: benefitDays
      });
      if (res2.error) {
        // fallback sans p_benefit_days si overload absent
        if (/Could not find|schema cache|function/i.test(String(res2.error.message || ''))) {
          res2 = await c.rpc('admin_create_promo_code', {
            p_code: code, p_plan: plan, p_max_uses: maxUses, p_valid_days: validDays, p_note: note
          });
        }
        if (res2.error) {
          toast(res2.error.message || 'Erreur création code', 'error');
          return;
        }
      }
      toast('✓ Code « ' + code.toUpperCase() + ' » → ' + plan, 'success');
      resetPromoForm();
      loadPromoList();
    } catch (e) {
      toast('Erreur: ' + (e.message || e), 'error');
    }
  };

  // aliases
  window.adminCreatePromoCode = window.adminSubmitPromoCode;

  window.redeemPromoCode = async function (code) {
    var c = client();
    if (!c) { toast('Supabase indisponible', 'error'); return; }
    code = String(code || '').trim();
    if (!code) { toast('Entre un code', 'error'); return; }
    try {
      var res = await c.rpc('redeem_promo_code', { p_code: code });
      if (res.error) {
        var m = res.error.message || '';
        if (/CODE_INVALID/i.test(m)) toast('Code invalide', 'error');
        else if (/CODE_EXPIRED/i.test(m)) toast('Code expiré', 'error');
        else if (/CODE_EXHAUSTED/i.test(m)) toast('Code épuisé', 'error');
        else if (/CODE_ALREADY_USED/i.test(m)) toast('Tu as déjà utilisé ce code', 'error');
        else toast(m || 'Erreur code', 'error');
        return;
      }
      var plan = (res.data && res.data.subscription) || '';
      toast('✓ Forfait « ' + plan + ' » activé', 'success');
      setTimeout(function () { location.reload(); }, 800);
    } catch (e) {
      toast('Erreur: ' + (e.message || e), 'error');
    }
  };

  var usersCache = [];

  async function refreshPlanUserList() {
    var box = document.getElementById('planUserList');
    if (!box || !isAmiralNow()) return;
    var c = client();
    if (!c) return;
    box.innerHTML = '<p style="color:#94a3b8;font-size:13px">Chargement…</p>';
    try {
      var res = await c.from('profiles')
        .select('id, display_name, subscription, role, is_admin')
        .order('display_name');
      if (res.error) throw res.error;
      usersCache = res.data || [];
      renderPlanUserList();
    } catch (e) {
      box.innerHTML = '<p style="color:#ef4444">Erreur chargement</p>';
    }
  }

  function renderPlanUserList() {
    var box = document.getElementById('planUserList');
    var search = (document.getElementById('planUserSearch') || {}).value || '';
    if (!box) return;
    var q = search.trim().toLowerCase();
    var list = usersCache.filter(function (u) {
      if (!q) return true;
      return String(u.display_name || '').toLowerCase().indexOf(q) !== -1;
    });
    if (!list.length) {
      box.innerHTML = '<p style="color:#94a3b8;font-size:13px">Aucun membre</p>';
      return;
    }
    box.innerHTML = list.map(function (u) {
      var plan = String(u.subscription || 'FREE').toUpperCase();
      var name = esc(u.display_name || 'Sans nom');
      var btns = PLANS.map(function (p) {
        if (p === plan) {
          return '<span class="admin-act-btn" style="opacity:.5;cursor:default">' + p + ' ✓</span>';
        }
        return '<button type="button" class="admin-act-btn" onclick="window.adminSetSubscription(\'' +
          u.id + '\',\'' + p + '\')">' + p + '</button>';
      }).join('');
      return '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid #f1f5f9">' +
        '<div style="flex:1;min-width:120px"><strong>' + name + '</strong> ' +
        '<span style="font-size:12px;color:#64748b">' + esc(plan) + '</span></div>' +
        '<div class="admin-actions">' + btns + '</div></div>';
    }).join('');
  }
  window._aupygoRenderPlanUsers = renderPlanUserList;

  async function loadPromoList() {
    var box = document.getElementById('promoList');
    if (!box || !isAmiralNow()) return;
    var c = client();
    if (!c) return;
    try {
      var res = await c.from('promo_codes')
        .select('id, code, plan, max_uses, used_count, valid_until, active, note, benefit_days, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (res.error) throw res.error;
      var rows = res.data || [];
      if (!rows.length) {
        box.innerHTML = '<p style="color:#94a3b8;font-size:13px">Aucun code pour l\'instant</p>';
        return;
      }
      box.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
        '<thead><tr style="text-align:left;color:#64748b">' +
        '<th style="padding:6px">Code</th><th>Plan</th><th>Usages</th><th>Jours</th><th>Expire</th><th>Note</th><th></th></tr></thead><tbody>' +
        rows.map(function (r) {
          var uses = (r.used_count || 0) + (r.max_uses != null ? ' / ' + r.max_uses : ' / ∞');
          var exp = r.valid_until ? new Date(r.valid_until).toLocaleDateString() : '—';
          var off = r.active === false ? ' (off)' : '';
          var days = r.benefit_days != null ? r.benefit_days + ' j' : '—';
          return '<tr style="' + (r.active === false ? 'opacity:.55' : '') + '">' +
            '<td style="padding:6px"><code>' + esc(r.code) + off + '</code></td>' +
            '<td>' + esc(r.plan) + '</td><td>' + uses + '</td><td>' + days + '</td><td>' + exp + '</td>' +
            '<td>' + esc(r.note || '') + '</td>' +
            '<td style="white-space:nowrap">' +
            '<button type="button" class="admin-act-btn" style="font-size:12px;padding:4px 8px" ' +
            'onclick="window.adminEditPromoCode(\'' + r.id + '\')">✏️ Modifier</button>' +
            '</td></tr>';
        }).join('') + '</tbody></table>';
    } catch (e) {
      box.innerHTML = '<p style="color:#ef4444;font-size:13px">' + esc(e.message || e) + '</p>';
    }
  }

  function injectPanel() {
    if (document.getElementById('aupygo-plan-panel')) {
      panelReady = true;
      return;
    }
    if (!isAmiralNow()) return;
    var admin = document.getElementById('admin');
    if (!admin) return;

    var panel = document.createElement('div');
    panel.id = 'aupygo-plan-panel';
    panel.style.cssText = 'margin-top:28px;padding:20px;background:#fff;border:1px solid #e8e4ef;border-radius:16px';
    panel.innerHTML =
      '<h3 style="margin:0 0 6px;font-size:18px">💳 Forfaits & codes promo</h3>' +
      '<p style="margin:0 0 16px;color:#64748b;font-size:13px">Forcer un forfait ou créer / modifier des codes promo.</p>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">' +
      '<div>' +
        '<h4 style="margin:0 0 10px;font-size:14px">Changer le forfait d\'un membre</h4>' +
        '<input type="search" id="planUserSearch" placeholder="Rechercher…" ' +
          'oninput="window._aupygoRenderPlanUsers && window._aupygoRenderPlanUsers()" ' +
          'style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:10px;box-sizing:border-box">' +
        '<div id="planUserList" style="max-height:320px;overflow:auto"></div>' +
      '</div>' +
      '<div>' +
        '<h4 style="margin:0 0 10px;font-size:14px">Créer / modifier un code promo</h4>' +
        '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">' +
          '<input id="promoCodeInput" placeholder="Code (ex: AUPYGO25)" style="padding:10px 12px;border:1px solid #e2e8f0;border-radius:12px">' +
          '<select id="promoPlanSelect" style="padding:10px 12px;border:1px solid #e2e8f0;border-radius:12px">' +
            '<option value="STANDARD">STANDARD</option>' +
            '<option value="PREMIUM">PREMIUM</option>' +
          '</select>' +
          '<input id="promoMaxUses" type="number" min="1" placeholder="Max utilisations (vide = ∞)" style="padding:10px 12px;border:1px solid #e2e8f0;border-radius:12px">' +
          '<input id="promoValidDays" type="number" min="1" placeholder="Validité du code en jours (vide = ∞)" style="padding:10px 12px;border:1px solid #e2e8f0;border-radius:12px">' +
          '<input id="promoBenefitDays" type="number" min="1" value="7" placeholder="Durée avantage (jours)" style="padding:10px 12px;border:1px solid #e2e8f0;border-radius:12px">' +
          '<input id="promoNote" placeholder="Note interne (optionnel)" style="padding:10px 12px;border:1px solid #e2e8f0;border-radius:12px">' +
          '<label style="font-size:13px;display:flex;align-items:center;gap:8px;cursor:pointer">' +
            '<input type="checkbox" id="promoActiveCheck" checked> Code actif' +
          '</label>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
            '<button type="button" id="promoSubmitBtn" class="btn" onclick="window.adminSubmitPromoCode()" ' +
              'style="padding:10px 16px;border-radius:12px;border:none;background:#7c3aed;color:#fff;font-weight:700;cursor:pointer">Créer le code</button>' +
            '<button type="button" id="promoCancelEdit" onclick="window.adminCancelPromoEdit()" ' +
              'style="display:none;padding:10px 16px;border-radius:12px;border:1px solid #e2e8f0;background:#fff;cursor:pointer">Annuler</button>' +
          '</div>' +
        '</div>' +
        '<h4 style="margin:12px 0 8px;font-size:14px">Codes existants</h4>' +
        '<div id="promoList"></div>' +
      '</div></div>';

    admin.appendChild(panel);
    panelReady = true;
    refreshPlanUserList();
    loadPromoList();
  }

  function injectRedeemOnPlans() {
    if (document.getElementById('aupygo-redeem-box')) return;
    var plans = document.getElementById('plans');
    if (!plans) return;
    var box = document.createElement('div');
    box.id = 'aupygo-redeem-box';
    box.style.cssText = 'max-width:420px;margin:20px auto;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;text-align:center';
    box.innerHTML =
      '<p style="margin:0 0 10px;font-weight:700;font-size:14px">Tu as un code promo ?</p>' +
      '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">' +
        '<input id="userPromoInput" placeholder="CODE" style="padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;flex:1;min-width:140px">' +
        '<button type="button" onclick="window.redeemPromoCode(document.getElementById(\'userPromoInput\').value)" ' +
          'style="padding:10px 16px;border-radius:10px;border:none;background:#7c3aed;color:#fff;font-weight:700;cursor:pointer">Activer</button>' +
      '</div>';
    plans.appendChild(box);
  }

  function boot() {
    injectPanel();
    injectRedeemOnPlans();
  }

  var origGo = window.go;
  if (typeof origGo === 'function' && !window._adminPlanGoPatched) {
    window._adminPlanGoPatched = true;
    window.go = function () {
      var r = origGo.apply(this, arguments);
      setTimeout(boot, 80);
      setTimeout(boot, 400);
      return r;
    };
  }

  var origRefresh = window.adminRefresh;
  window.adminRefresh = function () {
    if (typeof origRefresh === 'function') origRefresh();
    setTimeout(function () {
      injectPanel();
      refreshPlanUserList();
      loadPromoList();
    }, 200);
  };

  setTimeout(boot, 500);
  setTimeout(boot, 2000);
  console.log('[AUPYGO] admin-set-plan.js — forfaits + codes promo (créer / modifier)');
})();
