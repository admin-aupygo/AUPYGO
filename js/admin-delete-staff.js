/* AUPYGO — admin-delete-staff.js v2
 * Bouton « Supprimer » sur chaque ligne Staff (Amiral uniquement)
 * Flux sécurisé :
 *   1) Confirmation
 *   2) Envoi d'un code 6 chiffres par email (Resend)
 *   3) Saisie du code → purge profil + données liées + auth.users
 * Le compte Auth est détruit : l'agent ne peut plus se connecter avec cet email.
 */
(function () {
  'use strict';

  var FN_URL = 'https://zdjcjzsmoinrkcezgivs.supabase.co/functions/v1/admin-delete-staff';
  var STAFF_ROLES = ['major_staff', 'sergent_staff', 'major_moderateur', 'sergent_moderateur', 'host', 'moderator'];

  function client() {
    return window.supabaseClient || window.supabase || null;
  }

  function anonKey() {
    return window.SUPABASE_ANON_KEY || (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.anonKey) || '';
  }

  function toast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type || 'info');
    else window.alert(msg);
  }

  function isAmiralNow() {
    return typeof window.isAmiral === 'function' && window.isAmiral();
  }

  function normalizeRole(role) {
    if (typeof window.normalizeStaffRole === 'function') return window.normalizeStaffRole(role);
    var r = String(role || 'user').toLowerCase().trim();
    if (r === 'admin_general' || r === 'admin') return 'amiral';
    if (r === 'host') return 'sergent_staff';
    if (r === 'moderator') return 'sergent_moderateur';
    return r;
  }

  function isDeletableStaff(u) {
    if (!u || !u.id) return false;
    if (u.is_admin === true) return false;
    var r = normalizeRole(u.role);
    if (r === 'amiral') return false;
    return STAFF_ROLES.indexOf(r) !== -1;
  }

  async function getAccessToken() {
    var c = client();
    if (!c || !c.auth) return null;
    try {
      var res = await c.auth.getSession();
      return (res && res.data && res.data.session && res.data.session.access_token) || null;
    } catch (e) {
      return null;
    }
  }

  async function callDeleteFn(body) {
    var token = await getAccessToken();
    if (!token) throw new Error('Session expirée. Reconnecte-toi.');
    var headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    };
    var key = anonKey();
    if (key) headers['apikey'] = key;

    var res = await fetch(FN_URL, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    });
    var data = {};
    try { data = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok) {
      var err = new Error(data.error || data.message || ('Erreur HTTP ' + res.status));
      err.code = data.error;
      err.status = res.status;
      err.payload = data;
      throw err;
    }
    return data;
  }

  /* ---------- UI helpers ---------- */
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'style') el.style.cssText = attrs[k];
      else if (k === 'text') el.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) el.appendChild(c); });
    return el;
  }

  var OVERLAY_CSS = 'position:fixed;inset:0;z-index:100001;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;';
  var CARD_CSS = 'background:#fff;color:#0f172a;border-radius:14px;padding:22px;width:100%;max-width:420px;max-height:90vh;overflow:auto;font-family:system-ui,sans-serif;box-shadow:0 20px 50px rgba(0,0,0,.25);';
  var BTN_CSS = 'padding:10px 16px;border:0;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;';
  var INPUT_CSS = 'width:100%;box-sizing:border-box;padding:12px;margin:6px 0 14px;border:1px solid #cbd5e1;border-radius:8px;font-size:18px;letter-spacing:6px;text-align:center;font-weight:700;';

  function closeModal(id) {
    var m = document.getElementById(id);
    if (m) m.remove();
  }

  function openConfirmModal(user) {
    closeModal('aupygoDeleteStaffModal');
    var name = user.display_name || 'cet agent';
    var role = normalizeRole(user.role);

    var msg = h('div', { style: 'font-size:13px;min-height:18px;margin-bottom:10px;color:#b91c1c;' });
    var sendBtn = h('button', {
      style: BTN_CSS + 'background:#b91c1c;color:#fff;',
      text: 'Envoyer le code de sécurité'
    });
    var cancelBtn = h('button', {
      style: BTN_CSS + 'background:#e2e8f0;color:#0f172a;margin-right:8px;',
      text: 'Annuler',
      onclick: function () { closeModal('aupygoDeleteStaffModal'); }
    });

    sendBtn.addEventListener('click', async function () {
      msg.style.color = '#b91c1c';
      msg.textContent = '';
      sendBtn.disabled = true;
      sendBtn.textContent = 'Envoi…';
      try {
        var res = await callDeleteFn({ action: 'request', target_id: user.id });
        closeModal('aupygoDeleteStaffModal');
        openCodeModal(user, res.challenge_id, res.email_to || 'aupygo@protonmail.com');
      } catch (e) {
        msg.textContent = mapError(e);
      } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Envoyer le code de sécurité';
      }
    });

    var overlay = h('div', { id: 'aupygoDeleteStaffModal', style: OVERLAY_CSS });
    overlay.addEventListener('click', function (ev) {
      if (ev.target === overlay) closeModal('aupygoDeleteStaffModal');
    });
    overlay.appendChild(h('div', { style: CARD_CSS }, [
      h('h3', { style: 'margin:0 0 8px;font-size:18px;color:#b91c1c;', text: 'Suppression définitive' }),
      h('p', { style: 'margin:0 0 12px;font-size:14px;color:#334155;line-height:1.45;', text:
        'Tu vas supprimer définitivement « ' + name + ' » (' + role + '). ' +
        'Toutes ses données personnelles (profil, messages, participations…) seront effacées et son compte Auth sera détruit. ' +
        'Il ne pourra plus se connecter avec cette adresse email.' }),
      h('p', { style: 'margin:0 0 14px;font-size:13px;color:#64748b;', text:
        'Un code de sécurité à 6 chiffres sera envoyé par email. Tu devras le saisir pour confirmer.' }),
      msg,
      h('div', { style: 'display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;' }, [cancelBtn, sendBtn])
    ]));
    document.body.appendChild(overlay);
  }

  function openCodeModal(user, challengeId, emailTo) {
    closeModal('aupygoDeleteStaffCodeModal');
    var name = user.display_name || 'cet agent';
    var codeInput = h('input', {
      type: 'text',
      inputmode: 'numeric',
      maxlength: '6',
      autocomplete: 'one-time-code',
      style: INPUT_CSS,
      placeholder: '000000'
    });
    var msg = h('div', { style: 'font-size:13px;min-height:18px;margin-bottom:10px;color:#b91c1c;' });
    var confirmBtn = h('button', {
      style: BTN_CSS + 'background:#b91c1c;color:#fff;',
      text: 'Confirmer la suppression'
    });
    var cancelBtn = h('button', {
      style: BTN_CSS + 'background:#e2e8f0;color:#0f172a;margin-right:8px;',
      text: 'Annuler',
      onclick: function () { closeModal('aupygoDeleteStaffCodeModal'); }
    });

    confirmBtn.addEventListener('click', async function () {
      var code = String(codeInput.value || '').replace(/\s/g, '');
      msg.style.color = '#b91c1c';
      msg.textContent = '';
      if (!/^\d{6}$/.test(code)) {
        msg.textContent = 'Saisis le code à 6 chiffres reçu par email.';
        return;
      }
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Suppression…';
      try {
        await callDeleteFn({
          action: 'confirm',
          target_id: user.id,
          challenge_id: challengeId,
          code: code
        });
        closeModal('aupygoDeleteStaffCodeModal');
        toast('Agent « ' + name + ' » supprimé définitivement. Compte et données effacés.', 'success');
        removeRow(user.id);
        if (typeof window.adminRefresh === 'function') {
          try { window.adminRefresh(); } catch (e) { /* ignore */ }
        }
      } catch (e) {
        msg.textContent = mapError(e);
      } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Confirmer la suppression';
      }
    });

    codeInput.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') confirmBtn.click();
    });

    var overlay = h('div', { id: 'aupygoDeleteStaffCodeModal', style: OVERLAY_CSS });
    overlay.addEventListener('click', function (ev) {
      if (ev.target === overlay) closeModal('aupygoDeleteStaffCodeModal');
    });
    overlay.appendChild(h('div', { style: CARD_CSS }, [
      h('h3', { style: 'margin:0 0 8px;font-size:18px;', text: 'Code de sécurité' }),
      h('p', { style: 'margin:0 0 6px;font-size:14px;color:#334155;', text:
        'Un code a été envoyé à ' + emailTo + ' pour confirmer la suppression de « ' + name + ' ».' }),
      h('p', { style: 'margin:0 0 12px;font-size:12px;color:#64748b;', text: 'Valable 15 minutes · usage unique' }),
      h('label', { style: 'font-size:13px;font-weight:600;color:#334155;', text: 'Code à 6 chiffres' }),
      codeInput,
      msg,
      h('div', { style: 'display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;' }, [cancelBtn, confirmBtn])
    ]));
    document.body.appendChild(overlay);
    setTimeout(function () { codeInput.focus(); }, 50);
  }

  function mapError(e) {
    var code = (e && e.code) || '';
    var map = {
      not_authenticated: 'Session expirée. Reconnecte-toi.',
      forbidden: 'Action réservée à l’Amiral.',
      invalid_target: 'Cible invalide.',
      not_staff_agent: 'Seul un agent Staff/Modérateur (non Amiral) peut être supprimé.',
      invalid_code: 'Code incorrect.',
      challenge_expired: 'Code expiré. Relance la suppression.',
      challenge_used: 'Ce code a déjà été utilisé.',
      EMAIL_NOT_CONFIGURED: 'Email non configuré (RESEND_API_KEY manquant côté Supabase).',
      EMAIL_SEND_FAILED: 'Échec d’envoi du mail. Vérifie Resend.',
      email_failed: 'Échec d’envoi du mail.'
    };
    return map[code] || (e && e.message) || 'Erreur inconnue.';
  }

  function removeRow(userId) {
    var btn = document.querySelector('button[data-aupygo-delete-staff="' + userId + '"]');
    if (btn) {
      var tr = btn.closest('tr');
      if (tr) tr.remove();
    }
  }

  /* ---------- Injection du bouton dans le tableau Admin ---------- */
  function findUserFromRow(tr) {
    // On s'appuie sur le cache admin si dispo, sinon on lit le data-user-id déjà posé
    var btn = tr.querySelector('[data-aupygo-delete-staff]');
    if (btn) {
      var id = btn.getAttribute('data-aupygo-delete-staff');
      var cache = window.adminUsersCache || [];
      for (var i = 0; i < cache.length; i++) {
        if (cache[i] && cache[i].id === id) return cache[i];
      }
      return { id: id, display_name: (tr.querySelector('td strong') || {}).textContent || '', role: 'sergent_staff' };
    }
    return null;
  }

  function injectDeleteButtons() {
    if (!isAmiralNow()) return;
    var tbody = document.getElementById('adminTableBody');
    if (!tbody) return;

    var cache = Array.isArray(window.adminUsersCache) ? window.adminUsersCache : [];
    var byName = {};
    cache.forEach(function (u) {
      if (u && u.display_name) byName[String(u.display_name).trim().toLowerCase()] = u;
    });

    var rows = tbody.querySelectorAll('tr');
    rows.forEach(function (tr) {
      if (tr.querySelector('[data-aupygo-delete-staff]')) return;

      var nameEl = tr.querySelector('td strong');
      var name = nameEl ? String(nameEl.textContent || '').trim().toLowerCase() : '';
      var user = byName[name] || null;

      // Fallback : si le cache expose les IDs via data déjà présents
      if (!user) {
        var existingIdBtn = tr.querySelector('[data-user-id]');
        if (existingIdBtn) {
          var uid = existingIdBtn.getAttribute('data-user-id');
          user = cache.find(function (u) { return u && u.id === uid; }) || { id: uid, display_name: name, role: 'sergent_staff' };
        }
      }

      if (!user || !isDeletableStaff(user)) return;

      var actionsTd = tr.querySelector('td:last-child');
      if (!actionsTd) return;

      var wrap = actionsTd.querySelector('.admin-actions');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'admin-actions';
        wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;align-items:center';
        // Si le contenu était du texte seul, on le garde au-dessus
        while (actionsTd.firstChild) wrap.appendChild(actionsTd.firstChild);
        actionsTd.appendChild(wrap);
      }

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'admin-act-btn';
      del.setAttribute('data-aupygo-delete-staff', user.id);
      del.setAttribute('data-user-id', user.id);
      del.textContent = 'Supprimer';
      del.title = 'Suppression définitive (code email requis)';
      del.style.cssText = 'padding:5px 10px;border-radius:8px;border:1px solid #fecaca;background:#fee2e2;color:#b91c1c;font-size:11px;font-weight:700;cursor:pointer';
      del.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (!isAmiralNow()) {
          toast('Réservé à l’Amiral', 'error');
          return;
        }
        openConfirmModal(user);
      });
      wrap.appendChild(del);
    });
  }

  /* Expose cache used by admin.js if not already global */
  function captureAdminCache() {
    // admin.js utilise une variable locale adminUsersCache ; on tente de la récupérer
    // via un patch de loadAdminData / renderAdminTable si possible.
    if (typeof window.loadAdminData === 'function' && !window._aupygoDeleteCachePatched) {
      window._aupygoDeleteCachePatched = true;
      var orig = window.loadAdminData;
      // loadAdminData n'est souvent pas exposé ; on patch adminRefresh à la place
    }
    if (typeof window.adminRefresh === 'function' && !window._aupygoDeleteRefreshPatched) {
      window._aupygoDeleteRefreshPatched = true;
      var origRefresh = window.adminRefresh;
      window.adminRefresh = function () {
        var r = origRefresh.apply(this, arguments);
        setTimeout(injectDeleteButtons, 400);
        setTimeout(injectDeleteButtons, 1200);
        return r;
      };
    }
  }

  // Patch go('admin') pour réinjecter après chargement
  function patchGo() {
    if (typeof window.go !== 'function' || window._aupygoDeleteGoPatched) return;
    window._aupygoDeleteGoPatched = true;
    var orig = window.go;
    window.go = function (page) {
      var r = orig.apply(this, arguments);
      if (page === 'admin') {
        setTimeout(injectDeleteButtons, 300);
        setTimeout(injectDeleteButtons, 900);
        setTimeout(injectDeleteButtons, 2000);
      }
      return r;
    };
  }

  // Observer le tbody pour réinjecter après chaque re-render
  function watchTable() {
    var tbody = document.getElementById('adminTableBody');
    if (!tbody || tbody._aupygoDeleteObserved) return;
    tbody._aupygoDeleteObserved = true;
    var mo = new MutationObserver(function () {
      setTimeout(injectDeleteButtons, 50);
    });
    mo.observe(tbody, { childList: true, subtree: false });
  }

  function boot() {
    captureAdminCache();
    patchGo();
    watchTable();
    injectDeleteButtons();
  }

  // Rendre le cache accessible : on intercepte le select profiles de loadAdminData
  // via un proxy léger sur supabaseClient.from quand possible
  function tryExposeCache() {
    // Si admin.js a déjà exposé quelque chose
    if (Array.isArray(window.adminUsersCache) && window.adminUsersCache.length) {
      injectDeleteButtons();
      return;
    }
    // Heuristique : après render, on reconstruit un mini-cache depuis les lignes + boutons grades
    // Les boutons setRole portent l'id dans onclick="window.adminSetRole('uuid','role')"
    var tbody = document.getElementById('adminTableBody');
    if (!tbody) return;
    var rebuilt = [];
    tbody.querySelectorAll('tr').forEach(function (tr) {
      var nameEl = tr.querySelector('td strong');
      var name = nameEl ? nameEl.textContent.trim() : '';
      var roleBtn = tr.querySelector('button[onclick*="adminSetRole"]');
      var id = null;
      var role = 'user';
      if (roleBtn) {
        var m = String(roleBtn.getAttribute('onclick') || '').match(/adminSetRole\('([0-9a-f-]{36})'/i);
        if (m) id = m[1];
      }
      // badge rôle
      var badge = tr.querySelector('.admin-badge');
      var label = badge ? badge.textContent.trim().toLowerCase() : '';
      if (label.indexOf('major staff') !== -1) role = 'major_staff';
      else if (label.indexOf('sergent staff') !== -1) role = 'sergent_staff';
      else if (label.indexOf('major mod') !== -1) role = 'major_moderateur';
      else if (label.indexOf('sergent mod') !== -1) role = 'sergent_moderateur';
      else if (label.indexOf('amiral') !== -1) role = 'amiral';

      if (id && role !== 'amiral' && role !== 'user') {
        rebuilt.push({ id: id, display_name: name, role: role, is_admin: false });
      }
    });
    if (rebuilt.length) {
      window.adminUsersCache = rebuilt;
      injectDeleteButtons();
    }
  }

  setInterval(function () {
    if (!isAmiralNow()) return;
    watchTable();
    tryExposeCache();
    injectDeleteButtons();
  }, 1500);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  setTimeout(boot, 800);
  setTimeout(boot, 2000);

  console.log('[AUPYGO] admin-delete-staff.js v2 (bouton + flux code email)');
})();
