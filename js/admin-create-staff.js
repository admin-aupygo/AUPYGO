/* AUPYGO — admin-create-staff.js v1.2
 * Bouton « Agent staff » (Amiral) → Edge admin-create-staff
 * Envoi automatique du lien d'invitation par email (Resend / contact@aupygo.com)
 * + fallback copier le lien si l'email échoue
 */
(function () {
  'use strict';

  var FN_NAME = 'admin-create-staff';
  var GRADES = [
    ['major_staff', 'Major Staff (événementiel · pays)'],
    ['sergent_staff', 'Sergent Staff (événementiel · ville)'],
    ['major_moderateur', 'Major Modérateur'],
    ['sergent_moderateur', 'Sergent Modérateur']
  ];
  var ERRORS = {
    not_authenticated: 'Session expirée, reconnecte-toi.',
    forbidden: "Action réservée à l'Amiral.",
    invalid_email: 'Adresse email invalide.',
    invalid_display_name: "Nom d'affichage trop court (2 caractères minimum).",
    invalid_role: 'Grade invalide.',
    create_failed: 'Création impossible (email déjà utilisé ou bloqué ?).',
    profile_failed: 'Profil non créé : le compte a été annulé.'
  };

  var isRecoveryLink = /type=recovery/.test(location.hash) || /type=recovery/.test(location.search);
  var passwordModalShown = false;

  function client() { return window.supabaseClient || null; }

  function toast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type || 'info');
    else window.alert(msg);
  }

  function h(tag, attrs, kids) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'style') node.style.cssText = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else node.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  var INPUT_CSS = 'width:100%;box-sizing:border-box;padding:10px;margin:4px 0 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:15px;background:#fff;color:#0f172a;';
  var LABEL_CSS = 'font-size:13px;font-weight:600;color:#334155;';
  var OVERLAY_CSS = 'position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;';
  var CARD_CSS = 'background:#fff;color:#0f172a;border-radius:14px;padding:20px;width:100%;max-width:400px;max-height:90vh;overflow:auto;font-family:system-ui,sans-serif;';
  var BTN_CSS = 'padding:10px 16px;border:0;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;';

  function field(label, input) {
    return h('div', {}, [h('label', { style: LABEL_CSS, text: label }), input]);
  }

  function showResult(card, data, emailAddr, close) {
    while (card.firstChild) card.removeChild(card.firstChild);
    var closeBtn = h('button', { style: BTN_CSS + 'background:#e2e8f0;color:#0f172a;', text: 'Fermer', onclick: close });
    var kids = [];

    var emailSent = !!data.email_sent;
    var link = data.setup_link || null;

    if (emailSent) {
      kids.push(
        h('h3', { style: 'margin:0 0 8px;font-size:18px;color:#15803d;', text: 'Invitation envoyée ✔' }),
        h('p', { style: 'margin:0 0 12px;font-size:14px;color:#334155;line-height:1.45;', text:
          'Un e-mail a été envoyé à ' + emailAddr + ' depuis contact@aupygo.com avec le lien pour choisir son mot de passe (valable ~1 h).' })
      );
    } else {
      kids.push(
        h('h3', { style: 'margin:0 0 8px;font-size:18px;', text: 'Agent créé' }),
        h('p', { style: 'margin:0 0 10px;font-size:13px;color:#b45309;', text:
          'Le compte est créé, mais l\'e-mail automatique n\'a pas pu partir' +
          (data.email_error ? ' (' + data.email_error + ')' : '') +
          '. Envoie le lien manuellement :' })
      );
    }

    if (link) {
      var box = h('textarea', { readonly: 'readonly', rows: '4', style: INPUT_CSS + 'font-size:12px;' });
      box.value = link;
      var copy = h('button', {
        style: BTN_CSS + 'background:#2563eb;color:#fff;margin-right:8px;',
        text: 'Copier le lien',
        onclick: function () {
          box.select();
          try {
            navigator.clipboard.writeText(link).then(function () { toast('Lien copié.', 'success'); });
          } catch (e) { document.execCommand('copy'); }
        }
      });
      kids.push(
        h('p', { style: 'margin:0 0 6px;font-size:12px;color:#64748b;', text: emailSent ? 'Lien de secours (si besoin) :' : 'Lien à transmettre :' }),
        box,
        h('div', { style: 'display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;' }, [copy, closeBtn])
      );
    } else {
      kids.push(
        h('p', { style: 'margin:0 0 12px;font-size:13px;color:#b91c1c;', text:
          'Lien non généré' + (data.link_error ? ' (' + data.link_error + ')' : '') +
          '. Supabase → Authentication → Users → Send password recovery.' }),
        h('div', { style: 'display:flex;justify-content:flex-end;' }, [closeBtn])
      );
    }

    kids.forEach(function (k) { card.appendChild(k); });
  }

  function openCreateModal() {
    if (document.getElementById('aupygoStaffModal')) return;

    var email = h('input', { type: 'email', autocomplete: 'off', style: INPUT_CSS, placeholder: 'agent@exemple.com' });
    var name = h('input', { type: 'text', maxlength: '40', style: INPUT_CSS, placeholder: 'Nom affiché' });
    var role = h('select', { style: INPUT_CSS }, GRADES.map(function (g) {
      return h('option', { value: g[0], text: g[1] });
    }));
    var country = h('input', { type: 'text', maxlength: '60', style: INPUT_CSS, placeholder: 'Pays (Major)' });
    var city = h('input', { type: 'text', maxlength: '60', style: INPUT_CSS, placeholder: 'Ville (Sergent)' });
    var msg = h('div', { style: 'font-size:13px;min-height:18px;margin-bottom:8px;color:#b91c1c;' });

    var overlay = h('div', { id: 'aupygoStaffModal', style: OVERLAY_CSS });
    function close() { overlay.remove(); }

    var submit = h('button', { style: BTN_CSS + 'background:#2563eb;color:#fff;', text: "Créer et inviter" });
    var cancel = h('button', { style: BTN_CSS + 'background:#e2e8f0;color:#0f172a;margin-right:8px;', text: 'Annuler', onclick: close });

    submit.addEventListener('click', async function () {
      msg.style.color = '#b91c1c';
      msg.textContent = '';
      var c = client();
      if (!c) { msg.textContent = 'Connexion indisponible.'; return; }

      submit.disabled = true;
      submit.textContent = 'Envoi…';
      try {
        var res = await c.functions.invoke(FN_NAME, {
          body: {
            email: email.value,
            display_name: name.value,
            role: role.value,
            staff_country: country.value,
            staff_city: city.value
          }
        });
        if (res.error) {
          var code = '';
          try { code = (await res.error.context.json()).error; } catch (e) { /* ignore */ }
          msg.textContent = ERRORS[code] || res.error.message || 'Erreur inconnue.';
          return;
        }
        var data = res.data || {};
        if (typeof window.adminRefresh === 'function') { try { window.adminRefresh(); } catch (e) { /* ignore */ } }
        showResult(card, data, email.value.trim(), close);
      } catch (e) {
        msg.textContent = (e && e.message) || 'Erreur réseau.';
      } finally {
        submit.disabled = false;
        submit.textContent = "Créer et inviter";
      }
    });

    var card = h('div', { style: CARD_CSS }, [
      h('h3', { style: 'margin:0 0 4px;font-size:18px;', text: 'Nouvel agent staff' }),
      h('p', { style: 'margin:0 0 14px;font-size:13px;color:#475569;', text:
        "Le compte est créé et un e-mail d'invitation est envoyé à l'agent (lien pour choisir son mot de passe)." }),
      field('Email', email),
      field("Nom d'affichage", name),
      field('Grade', role),
      field('Pays (optionnel)', country),
      field('Ville (optionnel)', city),
      msg,
      h('div', { style: 'display:flex;justify-content:flex-end;' }, [cancel, submit])
    ]);
    overlay.appendChild(card);
    overlay.addEventListener('click', function (ev) { if (ev.target === overlay) close(); });
    document.body.appendChild(overlay);
    email.focus();
  }

  var HEADER_BTN_CSS = 'display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 14px;border-radius:999px;border:1px solid #e2e8f0;background:#fff;color:#0f172a;cursor:pointer;font-size:14px;font-weight:600;margin-right:8px;white-space:nowrap;flex-shrink:0;';
  var FLOAT_BTN_CSS = 'position:fixed;right:16px;bottom:90px;z-index:99999;' + BTN_CSS + 'background:#0f172a;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.3);';

  function injectBtnStyle() {
    if (document.getElementById('aupygoCreateStaffStyle')) return;
    var st = document.createElement('style');
    st.id = 'aupygoCreateStaffStyle';
    st.textContent = '@media (max-width:700px){#aupygoCreateStaffBtn .aupygo-csb-label{display:none}}';
    document.head.appendChild(st);
  }

  function makeButton() {
    return h('button', {
      id: 'aupygoCreateStaffBtn',
      type: 'button',
      title: 'Créer un agent staff',
      'aria-label': 'Créer un agent staff',
      onclick: openCreateModal
    }, [
      h('span', { text: '➕', 'aria-hidden': 'true' }),
      h('span', { 'class': 'aupygo-csb-label', text: 'Agent staff' })
    ]);
  }

  function placeButton() {
    var btn = document.getElementById('aupygoCreateStaffBtn') || makeButton();
    var actions = document.querySelector('.header-actions');
    if (actions) {
      btn.style.cssText = HEADER_BTN_CSS;
      if (btn.parentNode !== actions) {
        var shield = document.getElementById('staffHeaderWrap');
        var lang = actions.querySelector('.lang-select') || actions.querySelector('#language');
        if (shield && shield.parentNode === actions) actions.insertBefore(btn, shield);
        else if (lang && lang.parentNode === actions) actions.insertBefore(btn, lang);
        else actions.appendChild(btn);
      }
    } else {
      btn.style.cssText = FLOAT_BTN_CSS;
      if (btn.parentNode !== document.body) document.body.appendChild(btn);
    }
  }

  function syncButton() {
    var ok = typeof window.isAmiral === 'function' && window.isAmiral() && !!client();
    var existing = document.getElementById('aupygoCreateStaffBtn');
    if (!ok) {
      if (existing) existing.remove();
      return;
    }
    injectBtnStyle();
    placeButton();
  }
  setInterval(syncButton, 1500);
  setTimeout(syncButton, 400);
  setTimeout(syncButton, 1200);
  setTimeout(syncButton, 3000);
  console.log('[AUPYGO] admin-create-staff.js v1.2 (invitation email auto)');

  function openPasswordModal() {
    if (passwordModalShown) return;
    passwordModalShown = true;

    var p1 = h('input', { type: 'password', autocomplete: 'new-password', style: INPUT_CSS, placeholder: '10 caractères minimum' });
    var p2 = h('input', { type: 'password', autocomplete: 'new-password', style: INPUT_CSS, placeholder: 'Répète le mot de passe' });
    var msg = h('div', { style: 'font-size:13px;min-height:18px;margin-bottom:8px;color:#b91c1c;' });
    var overlay = h('div', { id: 'aupygoPasswordModal', style: OVERLAY_CSS });
    var submit = h('button', { style: BTN_CSS + 'background:#2563eb;color:#fff;', text: 'Enregistrer' });

    submit.addEventListener('click', async function () {
      msg.textContent = '';
      if (p1.value.length < 10) { msg.textContent = 'Au moins 10 caractères.'; return; }
      if (p1.value !== p2.value) { msg.textContent = 'Les deux mots de passe sont différents.'; return; }
      var c = client();
      if (!c) { msg.textContent = 'Connexion indisponible.'; return; }
      submit.disabled = true;
      try {
        var res = await c.auth.updateUser({ password: p1.value });
        if (res.error) { msg.textContent = res.error.message; return; }
        toast('Mot de passe enregistré.', 'success');
        overlay.remove();
        try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
      } catch (e) {
        msg.textContent = (e && e.message) || 'Erreur réseau.';
      } finally {
        submit.disabled = false;
      }
    });

    overlay.appendChild(h('div', { style: CARD_CSS }, [
      h('h3', { style: 'margin:0 0 4px;font-size:18px;', text: 'Définis ton mot de passe' }),
      h('p', { style: 'margin:0 0 14px;font-size:13px;color:#475569;', text: 'Choisis le mot de passe que tu utiliseras pour te connecter à AUPYGO.' }),
      field('Nouveau mot de passe', p1),
      field('Confirmation', p2),
      msg,
      h('div', { style: 'display:flex;justify-content:flex-end;' }, [submit])
    ]));
    document.body.appendChild(overlay);
    p1.focus();
  }

  function watchRecovery() {
    var c = client();
    if (!c) return false;
    c.auth.onAuthStateChange(function (event) {
      if (event === 'PASSWORD_RECOVERY') openPasswordModal();
    });
    return true;
  }

  var tries = 0;
  var subscribed = false;
  var timer = setInterval(function () {
    tries++;
    var c = client();
    if (c && !subscribed) { subscribed = watchRecovery(); }
    if (isRecoveryLink && c) {
      c.auth.getSession().then(function (r) {
        if (r && r.data && r.data.session) openPasswordModal();
      });
    }
    if (tries > 40 || passwordModalShown) clearInterval(timer);
  }, 500);
})();
