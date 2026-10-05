/* AUPYGO — admin-delete-staff.js v2.1
 * Bouton « Supprimer » sur chaque ligne Staff (Amiral uniquement)
 * Flux sécurisé : code email → purge profil + auth
 */
(function () {
  'use strict';

  var FN_URL = 'https://zdjcjzsmoinrkcezgivs.supabase.co/functions/v1/admin-delete-staff';
  var STAFF_ROLES = {
    major_staff: 1,
    sergent_staff: 1,
    major_moderateur: 1,
    sergent_moderateur: 1,
    host: 1,
    moderator: 1
  };

  function client() {
    return window.supabaseClient || window.supabase || null;
  }

  function anonKey() {
    try {
      return window.SUPABASE_ANON_KEY ||
        (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.anonKey) ||
        (window.__SUPABASE_ANON_KEY__) || '';
    } catch (e) { return ''; }
  }

  function toast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type || 'info');
    else window.alert(msg);
  }

  function isAmiralNow() {
    try {
      if (typeof window.isAmiral === 'function' && window.isAmiral()) return true;
      if (window.currentUserIsAdmin === true) return true;
      if (window.currentUserRole && String(window.currentUserRole).toLowerCase() === 'amiral') return true;
      if (window.currentUserProfile && window.currentUserProfile.is_admin === true) return true;
    } catch (e) {}
    return false;
  }

  function normalizeRole(role) {
    if (typeof window.normalizeStaffRole === 'function') return window.normalizeStaffRole(role);
    var r = String(role || 'user').toLowerCase().trim();
    if (r === 'admin_general' || r === 'admin') return 'amiral';
    if (r === 'host') return 'sergent_staff';
    if (r === 'moderator') return 'sergent_moderateur';
    return r;
  }

  function roleFromBadgeLabel(label) {
    var t = String(label || '').toLowerCase();
    if (t.indexOf('amiral') !== -1) return 'amiral';
    if (t.indexOf('major staff') !== -1) return 'major_staff';
    if (t.indexOf('sergent staff') !== -1) return 'sergent_staff';
    if (t.indexOf('major mod') !== -1) return 'major_moderateur';
    if (t.indexOf('sergent mod') !== -1) return 'sergent_moderateur';
    if (t.indexOf('user') !== -1) return 'user';
    return 'user';
  }

  function isDeletableRole(role) {
    var r = normalizeRole(role);
    return !!STAFF_ROLES[r];
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
        console.error('[AUPYGO delete]', e);
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
        'Toutes ses données personnelles seront effacées et son compte Auth sera détruit. ' +
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
        console.error('[AUPYGO delete confirm]', e);
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

  function removeRow(userId) {
    var btn = document.querySelector('button[data-aupygo-delete-staff="' + userId + '"]');
    if (btn) {
      var tr = btn.closest('tr');
      if (tr) tr.remove();
    }
  }

  /** Extrait l'UUID depuis onclick adminSetRole('uuid','role') */
  function extractIdFromRow(tr) {
    var html = tr.innerHTML || '';
    var m = html.match(/adminSetRole\s*\(\s*['"]([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})['"]/i);
    if (m) return m[1];
    var btns = tr.querySelectorAll('button[onclick]');
    for (var i = 0; i < btns.length; i++) {
      var oc = btns[i].getAttribute('onclick') || '';
      var m2 = oc.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (m2) return m2[1];
    }
    var existing = tr.querySelector('[data-user-id], [data-aupygo-delete-staff]');
    if (existing) {
      return existing.getAttribute('data-user-id') || existing.getAttribute('data-aupygo-delete-staff');
    }
    return null;
  }

  function injectDeleteButtons() {
    var tbody = document.getElementById('adminTableBody');
    if (!tbody) return 0;

    var amiral = isAmiralNow();
    if (!amiral) {
      // Retire les boutons si plus Amiral
      tbody.querySelectorAll('[data-aupygo-delete-staff]').forEach(function (b) { b.remove(); });
      return 0;
    }

    var added = 0;
    var rows = tbody.querySelectorAll('tr');
    rows.forEach(function (tr) {
      if (tr.querySelector('[data-aupygo-delete-staff]')) return;

      var badge = tr.querySelector('.admin-badge');
      var role = roleFromBadgeLabel(badge ? badge.textContent : '');
      if (!isDeletableRole(role)) return;

      var userId = extractIdFromRow(tr);
      if (!userId) {
        console.warn('[AUPYGO delete] UUID introuvable pour la ligne', tr);
        return;
      }

      var nameEl = tr.querySelector('td strong');
      var displayName = nameEl ? nameEl.textContent.trim() : '';

      var actionsTd = tr.querySelector('td:last-child');
      if (!actionsTd) return;

      var wrap = actionsTd.querySelector('.admin-actions');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'admin-actions';
        wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;align-items:center';
        while (actionsTd.firstChild) wrap.appendChild(actionsTd.firstChild);
        actionsTd.appendChild(wrap);
      }

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'admin-act-btn';
      del.setAttribute('data-aupygo-delete-staff', userId);
      del.setAttribute('data-user-id', userId);
      del.textContent = 'Supprimer';
      del.title = 'Suppression définitive (code email requis)';
      del.style.cssText = 'padding:5px 10px;border-radius:8px;border:1px solid #fecaca;background:#fee2e2;color:#b91c1c;font-size:11px;font-weight:700;cursor:pointer;margin-left:4px';
      del.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (!isAmiralNow()) {
          toast('Réservé à l’Amiral', 'error');
          return;
        }
        openConfirmModal({ id: userId, display_name: displayName, role: role });
      });
      wrap.appendChild(del);
      added++;
    });

    if (added > 0) {
      console.log('[AUPYGO delete] boutons injectés:', added);
    }
    return added;
  }

  function watchTable() {
    var tbody = document.getElementById('adminTableBody');
    if (!tbody || tbody._aupygoDeleteObserved) return;
    tbody._aupygoDeleteObserved = true;
    var mo = new MutationObserver(function () {
      setTimeout(injectDeleteButtons, 30);
    });
    mo.observe(tbody, { childList: true, subtree: true });
  }

  function patchGo() {
    if (typeof window.go !== 'function' || window._aupygoDeleteGoPatched) return;
    window._aupygoDeleteGoPatched = true;
    var orig = window.go;
    window.go = function (page) {
      var r = orig.apply(this, arguments);
      if (page === 'admin') {
        setTimeout(function () { watchTable(); injectDeleteButtons(); }, 200);
        setTimeout(injectDeleteButtons, 600);
        setTimeout(injectDeleteButtons, 1500);
        setTimeout(injectDeleteButtons, 3000);
      }
      return r;
    };
  }

  function patchRefresh() {
    if (typeof window.adminRefresh !== 'function' || window._aupygoDeleteRefreshPatched) return;
    window._aupygoDeleteRefreshPatched = true;
    var orig = window.adminRefresh;
    window.adminRefresh = function () {
      var r = orig.apply(this, arguments);
      setTimeout(injectDeleteButtons, 300);
      setTimeout(injectDeleteButtons, 1000);
      return r;
    };
  }

  window.aupygoInjectDeleteButtons = injectDeleteButtons;

  function boot() {
    patchGo();
    patchRefresh();
    watchTable();
    injectDeleteButtons();
  }

  setInterval(function () {
    watchTable();
    patchGo();
    patchRefresh();
    if (document.getElementById('adminTableBody')) injectDeleteButtons();
  }, 1200);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  setTimeout(boot, 500);
  setTimeout(boot, 1500);
  setTimeout(boot, 3000);

  console.log('[AUPYGO] admin-delete-staff.js v2.1 chargé');
})();
