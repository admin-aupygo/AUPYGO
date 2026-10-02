/* AUPYGO — admin-delete-staff.js
 * Bouton « Supprimer » dans le tableau Admin (lignes Staff uniquement).
 * Flux : demande code → email aupygo@protonmail.com → popup → suppression définitive.
 * Réservé à l'Amiral (contrôles client + serveur).
 */
(function () {
  'use strict';

  var FN = 'admin-delete-staff';
  var state = { targetId: null, targetName: null, challengeId: null };

  function isAmiralOk() {
    return typeof window.isAmiral === 'function' && window.isAmiral();
  }

  function client() {
    return window.supabaseClient || null;
  }

  function toast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type || 'info');
    else window.alert(msg);
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function closeModal() {
    var ov = document.getElementById('aupygoDeleteStaffOverlay');
    if (ov) ov.remove();
    state = { targetId: null, targetName: null, challengeId: null };
  }

  function openModal(step) {
    closeModal();
    var ov = document.createElement('div');
    ov.id = 'aupygoDeleteStaffOverlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;padding:16px';
    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;color:#0f172a;border-radius:16px;padding:24px;width:100%;max-width:420px;font-family:system-ui,sans-serif;box-shadow:0 20px 50px rgba(0,0,0,.25)';

    if (step === 'confirm-start') {
      card.innerHTML =
        '<h3 style="margin:0 0 8px;font-size:18px">Suppression définitive</h3>' +
        '<p style="margin:0 0 14px;font-size:14px;color:#475569;line-height:1.45">Tu vas supprimer <strong>' + esc(state.targetName) + '</strong> (agent Staff). ' +
        'Compte, profil et données personnelles seront effacés. <strong>Irréversible.</strong></p>' +
        '<p style="margin:0 0 16px;font-size:13px;color:#64748b">Un code de sécurité sera envoyé à <strong>aupygo@protonmail.com</strong>.</p>' +
        '<div id="aupygoDelStaffMsg" style="min-height:18px;font-size:13px;color:#b91c1c;margin-bottom:8px"></div>' +
        '<div style="display:flex;justify-content:flex-end;gap:8px">' +
        '<button type="button" id="aupygoDelCancel" style="padding:10px 14px;border:0;border-radius:8px;background:#e2e8f0;font-weight:600;cursor:pointer">Annuler</button>' +
        '<button type="button" id="aupygoDelSend" style="padding:10px 14px;border:0;border-radius:8px;background:#dc2626;color:#fff;font-weight:600;cursor:pointer">Envoyer le code</button>' +
        '</div>';
    } else if (step === 'enter-code') {
      card.innerHTML =
        '<h3 style="margin:0 0 8px;font-size:18px">Code de sécurité</h3>' +
        '<p style="margin:0 0 14px;font-size:14px;color:#475569">Saisis le code à 6 chiffres reçu sur <strong>aupygo@protonmail.com</strong> pour supprimer <strong>' + esc(state.targetName) + '</strong>.</p>' +
        '<label style="font-size:13px;font-weight:600;color:#334155">Code</label>' +
        '<input id="aupygoDelCode" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" ' +
        'placeholder="000000" style="width:100%;box-sizing:border-box;padding:12px;margin:6px 0 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:22px;letter-spacing:6px;text-align:center;font-weight:700">' +
        '<div id="aupygoDelStaffMsg" style="min-height:18px;font-size:13px;color:#b91c1c;margin-bottom:8px"></div>' +
        '<div style="display:flex;justify-content:flex-end;gap:8px">' +
        '<button type="button" id="aupygoDelCancel" style="padding:10px 14px;border:0;border-radius:8px;background:#e2e8f0;font-weight:600;cursor:pointer">Annuler</button>' +
        '<button type="button" id="aupygoDelConfirm" style="padding:10px 14px;border:0;border-radius:8px;background:#dc2626;color:#fff;font-weight:600;cursor:pointer">Supprimer définitivement</button>' +
        '</div>';
    }

    ov.appendChild(card);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeModal(); });
    document.body.appendChild(ov);

    var cancel = document.getElementById('aupygoDelCancel');
    if (cancel) cancel.onclick = closeModal;

    var sendBtn = document.getElementById('aupygoDelSend');
    if (sendBtn) {
      sendBtn.onclick = async function () {
        if (!isAmiralOk()) { toast('Réservé à l\'Amiral', 'error'); return; }
        var msg = document.getElementById('aupygoDelStaffMsg');
        var c = client();
        if (!c) { if (msg) msg.textContent = 'Connexion indisponible.'; return; }
        sendBtn.disabled = true;
        sendBtn.textContent = 'Envoi…';
        try {
          var res = await c.functions.invoke(FN, {
            body: { action: 'request', target_id: state.targetId }
          });
          if (res.error) {
            var code = '';
            try { code = (await res.error.context.json()).error; } catch (e) {}
            if (msg) msg.textContent = code || res.error.message || 'Erreur envoi';
            sendBtn.disabled = false;
            sendBtn.textContent = 'Envoyer le code';
            return;
          }
          var data = res.data || {};
          if (!data.ok || !data.challenge_id) {
            if (msg) msg.textContent = (data && data.error) || 'Échec demande';
            sendBtn.disabled = false;
            sendBtn.textContent = 'Envoyer le code';
            return;
          }
          state.challengeId = data.challenge_id;
          openModal('enter-code');
          toast('Code envoyé à aupygo@protonmail.com', 'success');
        } catch (e) {
          if (msg) msg.textContent = (e && e.message) || 'Erreur réseau';
          sendBtn.disabled = false;
          sendBtn.textContent = 'Envoyer le code';
        }
      };
    }

    var confBtn = document.getElementById('aupygoDelConfirm');
    if (confBtn) {
      confBtn.onclick = async function () {
        if (!isAmiralOk()) { toast('Réservé à l\'Amiral', 'error'); return; }
        var input = document.getElementById('aupygoDelCode');
        var msg = document.getElementById('aupygoDelStaffMsg');
        var code = (input && input.value || '').replace(/\s/g, '');
        if (!/^\d{6}$/.test(code)) {
          if (msg) msg.textContent = 'Code à 6 chiffres requis.';
          return;
        }
        var c = client();
        if (!c) { if (msg) msg.textContent = 'Connexion indisponible.'; return; }
        confBtn.disabled = true;
        confBtn.textContent = 'Suppression…';
        try {
          var res = await c.functions.invoke(FN, {
            body: {
              action: 'confirm',
              target_id: state.targetId,
              challenge_id: state.challengeId,
              code: code
            }
          });
          if (res.error) {
            var errCode = '';
            try { errCode = (await res.error.context.json()).error; } catch (e) {}
            var map = {
              invalid_code: 'Code incorrect.',
              challenge_expired: 'Code expiré — recommence.',
              challenge_used: 'Code déjà utilisé.',
              forbidden: 'Réservé à l\'Amiral.'
            };
            if (msg) msg.textContent = map[errCode] || res.error.message || 'Échec';
            confBtn.disabled = false;
            confBtn.textContent = 'Supprimer définitivement';
            return;
          }
          var data = res.data || {};
          if (!data.ok) {
            if (msg) msg.textContent = data.error || 'Échec suppression';
            confBtn.disabled = false;
            confBtn.textContent = 'Supprimer définitivement';
            return;
          }
          closeModal();
          toast('Agent supprimé définitivement.', 'success');
          if (typeof window.adminRefresh === 'function') window.adminRefresh();
        } catch (e) {
          if (msg) msg.textContent = (e && e.message) || 'Erreur réseau';
          confBtn.disabled = false;
          confBtn.textContent = 'Supprimer définitivement';
        }
      };
    }

    var codeInput = document.getElementById('aupygoDelCode');
    if (codeInput) setTimeout(function () { codeInput.focus(); }, 50);
  }

  window.adminDeleteStaff = function (userId, displayName) {
    if (!isAmiralOk()) {
      toast('Réservé à l\'Amiral', 'error');
      return;
    }
    if (!userId) return;
    state.targetId = userId;
    state.targetName = displayName || 'Agent';
    state.challengeId = null;
    openModal('confirm-start');
  };

  function injectDeleteButtons() {
    if (!isAmiralOk()) return;
    var tbody = document.getElementById('adminTableBody');
    if (!tbody) return;
    var rows = tbody.querySelectorAll('tr');
    rows.forEach(function (tr) {
      if (tr.querySelector('.admin-del-staff-btn')) return;
      var actionsCell = tr.querySelector('td:last-child');
      if (!actionsCell) return;
      var actionsBox = actionsCell.querySelector('.admin-actions');
      if (!actionsBox) return;
      var anyBtn = actionsBox.querySelector('button[onclick*="adminSetRole"]');
      if (!anyBtn) return;
      var m = String(anyBtn.getAttribute('onclick') || '').match(/adminSetRole\('([^']+)'/);
      if (!m) return;
      var uid = m[1];
      var nameEl = tr.querySelector('td strong');
      var name = nameEl ? nameEl.textContent : 'Agent';

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'admin-act-btn admin-del-staff-btn';
      del.textContent = 'Supprimer';
      del.style.cssText = 'padding:5px 10px;border-radius:8px;border:1px solid #fecaca;background:#fef2f2;font-size:11px;font-weight:700;cursor:pointer;color:#b91c1c';
      del.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        window.adminDeleteStaff(uid, name);
      };
      actionsBox.appendChild(del);
    });
  }

  function patchRefresh() {
    if (typeof window.adminRefresh !== 'function') return;
    if (window.adminRefresh._aupygoDelPatch) return;
    var _origRefresh = window.adminRefresh;
    window.adminRefresh = function () {
      var r = _origRefresh.apply(this, arguments);
      setTimeout(injectDeleteButtons, 300);
      setTimeout(injectDeleteButtons, 1000);
      return r;
    };
    window.adminRefresh._aupygoDelPatch = true;
  }

  setInterval(function () {
    patchRefresh();
    if (isAmiralOk()) injectDeleteButtons();
  }, 2000);
  setTimeout(function () { patchRefresh(); injectDeleteButtons(); }, 800);
  setTimeout(function () { injectDeleteButtons(); }, 2500);

  console.log('[AUPYGO] admin-delete-staff.js chargé');
})();
