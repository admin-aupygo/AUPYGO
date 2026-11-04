/* ==========================================================================
 * AUPYGO — moderation-panel.js v2.1
 * Bouton + panneau réservés à : Major Modérateur + Amiral
 * (pas Sergent Modérateur, pas Staff événementiel)
 *
 * - Checklist claire et actionnable avant toute sanction
 * - Rappel : email Brevo déjà envoyé (profil à compléter sous peine de ban)
 * - Actions : avertissement enregistré + ban / unban (Edge Function)
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__aupygoModerationPanel) return;
  window.__aupygoModerationPanel = true;

  var FN_NAME = 'admin-moderate-user';

  /** Checklist claire — à cocher avant sanction */
  var CHECKLIST = [
    {
      id: 'identity',
      label: '1. Identité du compte',
      items: [
        'Le pseudo est correct (pas de spam, pas d’usurpation d’identité)',
        'Le profil est bien rempli : âge, genre, pays d’accueil (rappelé par email Brevo)',
        'Aucune photo personnelle : uniquement les avatars AUPYGO'
      ]
    },
    {
      id: 'conduct',
      label: '2. Comportement',
      items: [
        'Aucun harcèlement, menace ou propos haineux / discriminatoires',
        'Pas de spam, publicité, phishing ou collecte de données',
        'Respect de la Charte et des CGU AUPYGO'
      ]
    },
    {
      id: 'legal',
      label: '3. Cadre légal',
      items: [
        'La sanction est proportionnée au manquement constaté',
        'Un motif écrit (date + raison) sera conservé',
        'L’utilisateur peut contester à contact@aupygo.com',
        'En cas de doute sur l’âge (mineur), suspension prudente + vérification'
      ]
    },
    {
      id: 'process',
      label: '4. Processus AUPYGO',
      items: [
        'Email Brevo de rappel profil déjà envoyé (compléter sous peine de ban)',
        'Avertissement préalable sauf urgence (sécurité / illégalité manifeste)',
        'Ban = compte bloqué (Auth Supabase) — réversible par Amiral / Major Modérateur'
      ]
    }
  ];

  function client() {
    return window.supabaseClient || window.supabase || null;
  }

  function canModerate() {
    try {
      if (typeof window.isAmiral === 'function' && window.isAmiral()) return true;
      var r = typeof window.getNormalizedRole === 'function'
        ? window.getNormalizedRole()
        : String(window.currentUserRole || '').toLowerCase();
      return r === 'major_moderateur';
    } catch (e) {
      return false;
    }
  }

  function toast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type || 'info');
    else console.log('[moderation]', type, msg);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"');
  }

  function isProfileIncomplete(p) {
    if (!p) return true;
    var name = String(p.display_name || '').trim();
    if (name.length < 2) return true;
    if (!p.age && p.age !== 0) return true;
    if (!p.gender) return true;
    if (!p.host_country && !p.country && !p.city) return true;
    return false;
  }

  function profileScore(p) {
    var n = 0;
    if (p && String(p.display_name || '').trim().length >= 2) n++;
    if (p && p.age) n++;
    if (p && p.gender) n++;
    if (p && (p.host_country || p.country)) n++;
    if (p && p.city) n++;
    if (p && p.approx_lat != null && p.approx_lng != null) n++;
    if (p && p.bio && String(p.bio).trim().length > 10) n++;
    return n;
  }

  // ---------- UI ----------
  function injectStyles() {
    if (document.getElementById('aupygoModStyle')) return;
    var st = document.createElement('style');
    st.id = 'aupygoModStyle';
    st.textContent = [
      '#aupygoModBtn{display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 14px;border-radius:999px;',
      'border:1px solid #fecaca;background:#fef2f2;color:#991b1b;cursor:pointer;font-size:14px;font-weight:700;',
      'margin-right:8px;white-space:nowrap;flex-shrink:0}',
      '#aupygoModBtn:hover{background:#fee2e2}',
      '@media(max-width:700px){#aupygoModBtn .mod-label{display:none}}',

      '#aupygoModOverlay{position:fixed;inset:0;z-index:100090;background:rgba(15,23,42,.55);',
      'display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}',
      '#aupygoModCard{background:#fff!important;color:#0f172a!important;border-radius:16px;width:100%;max-width:560px;',
      'max-height:92vh;overflow:auto;padding:20px 18px;box-shadow:0 24px 60px rgba(0,0,0,.3);',
      'font-family:system-ui,-apple-system,sans-serif;box-sizing:border-box;line-height:1.45}',
      '#aupygoModCard *{box-sizing:border-box}',
      '#aupygoModCard h3{margin:0;font-size:18px;color:#0f172a}',
      '#aupygoModCard h4{margin:0 0 10px;font-size:14px;font-weight:700;color:#7c3aed}',

      '#aupygoModCard .mod-section{display:block;margin:14px 0;padding:12px 14px;border:1px solid #e2e8f0;',
      'border-radius:12px;background:#f8fafc}',
      '#aupygoModCard .mod-check{display:flex!important;flex-direction:row;align-items:flex-start;gap:10px;',
      'margin:8px 0;font-size:13px;line-height:1.45;cursor:pointer;color:#0f172a}',
      '#aupygoModCard .mod-check input[type=checkbox]{margin:3px 0 0;flex-shrink:0;width:16px;height:16px;',
      'accent-color:#7c3aed;cursor:pointer}',
      '#aupygoModCard .mod-check span{flex:1;display:block}',

      '#aupygoModCard .mod-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}',
      '#aupygoModCard .mod-row button{flex:1 1 140px;min-width:120px;padding:11px 12px;border:0;',
      'border-radius:10px;font-weight:700;cursor:pointer;font-size:13px;line-height:1.3}',
      '#aupygoModCard .mod-btn-warn{background:#fef3c7;color:#92400e}',
      '#aupygoModCard .mod-btn-ban{background:#fee2e2;color:#991b1b}',
      '#aupygoModCard .mod-btn-unban{background:#dcfce7;color:#166534}',
      '#aupygoModCard .mod-btn-close{background:#e2e8f0;color:#0f172a}',
      '#aupygoModCard .mod-footer{margin-top:16px;padding-top:12px;border-top:1px solid #e2e8f0}',

      '#aupygoModCard .mod-user{padding:12px 14px;border-radius:10px;background:#faf5ff;border:1px solid #e9d5ff;margin:12px 0}',
      '#aupygoModCard .mod-user strong{display:block;font-size:16px;margin-bottom:4px;color:#0f172a}',
      '#aupygoModCard .mod-muted{font-size:12px;color:#64748b;line-height:1.4}',
      '#aupygoModCard .mod-search{width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;',
      'font-size:14px;margin:8px 0;background:#fff;color:#0f172a}',
      '#aupygoModCard .mod-list{max-height:180px;overflow:auto;border:1px solid #e2e8f0;border-radius:10px;background:#fff}',
      '#aupygoModCard .mod-list button{display:block;width:100%;text-align:left;padding:11px 12px;border:0;',
      'border-bottom:1px solid #f1f5f9;background:#fff;cursor:pointer;font-size:13px;color:#0f172a}',
      '#aupygoModCard .mod-list button:hover{background:#f8fafc}',
      '#aupygoModCard .mod-list button:last-child{border-bottom:0}',
      '#aupygoModCard .mod-badge{display:inline-block;font-size:11px;font-weight:800;padding:2px 8px;',
      'border-radius:999px;margin-left:6px;vertical-align:middle}',
      '#aupygoModCard .mod-badge.warn{background:#fef3c7;color:#92400e}',
      '#aupygoModCard .mod-badge.bad{background:#fee2e2;color:#991b1b}',
      '#aupygoModCard .mod-badge.ok{background:#dcfce7;color:#166534}',
      '#aupygoModCard .mod-note{width:100%;min-height:72px;padding:10px 12px;border:1px solid #cbd5e1;',
      'border-radius:10px;font-size:13px;margin-top:8px;resize:vertical;background:#fff;color:#0f172a}',
      '#aupygoModCard .mod-legal{font-size:11px;color:#64748b;line-height:1.45;margin:12px 0 0}',
      '#aupygoModCard label{display:flex}'
    ].join('');
    document.head.appendChild(st);
  }

  function ensureBtn() {
    if (!canModerate()) {
      var ex = document.getElementById('aupygoModBtn');
      if (ex) ex.remove();
      return;
    }
    injectStyles();
    var btn = document.getElementById('aupygoModBtn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'aupygoModBtn';
      btn.type = 'button';
      btn.title = 'Sanctions & bannissement (Major Modérateur / Amiral)';
      btn.setAttribute('aria-label', 'Ouvrir le panneau de sanctions et bannissement');
      btn.innerHTML = '<span aria-hidden="true">⚖️</span><span class="mod-label">Sanctions</span>';
      btn.onclick = function (e) {
        e.preventDefault();
        openPanel();
      };
    }
    var actions = document.querySelector('.header-actions');
    if (actions) {
      if (btn.parentNode !== actions) {
        var createStaff = document.getElementById('aupygoCreateStaffBtn');
        var lang = actions.querySelector('.lang-select') || actions.querySelector('#language');
        if (createStaff && createStaff.parentNode === actions) actions.insertBefore(btn, createStaff);
        else if (lang && lang.parentNode === actions) actions.insertBefore(btn, lang);
        else actions.appendChild(btn);
      }
    } else if (btn.parentNode !== document.body) {
      btn.style.cssText = 'position:fixed;right:16px;bottom:140px;z-index:99999;';
      document.body.appendChild(btn);
    }
  }

  var selectedUser = null;

  async function loadCandidates(q) {
    var sb = client();
    if (!sb) return [];
    q = String(q || '').trim();
    try {
      var query = sb
        .from('profiles')
        .select('id, display_name, age, gender, city, country, host_country, bio, subscription, role, is_admin, approx_lat, approx_lng, last_seen, created_at, moderation_warnings, is_banned')
        .order('created_at', { ascending: false })
        .limit(40);
      if (q.length >= 2) {
        query = sb
          .from('profiles')
          .select('id, display_name, age, gender, city, country, host_country, bio, subscription, role, is_admin, approx_lat, approx_lng, last_seen, created_at, moderation_warnings, is_banned')
          .ilike('display_name', '%' + q + '%')
          .limit(40);
      }
      var res = await query;
      if (res.error) {
        // colonnes moderation_* absentes → fallback sans
        var res2 = await sb
          .from('profiles')
          .select('id, display_name, age, gender, city, country, host_country, bio, subscription, role, is_admin, approx_lat, approx_lng, last_seen, created_at')
          .order('created_at', { ascending: false })
          .limit(40);
        if (q.length >= 2) {
          res2 = await sb
            .from('profiles')
            .select('id, display_name, age, gender, city, country, host_country, bio, subscription, role, is_admin, approx_lat, approx_lng, last_seen, created_at')
            .ilike('display_name', '%' + q + '%')
            .limit(40);
        }
        return (res2.data || []).filter(function (p) {
          if (!p) return false;
          if (p.is_admin === true) return false;
          var r = String(p.role || '').toLowerCase();
          if (['amiral', 'major_staff', 'sergent_staff', 'major_moderateur', 'sergent_moderateur', 'admin', 'admin_general'].indexOf(r) !== -1) return false;
          return true;
        });
      }
      return (res.data || []).filter(function (p) {
        if (!p) return false;
        if (p.is_admin === true) return false;
        var r = String(p.role || '').toLowerCase();
        if (['amiral', 'major_staff', 'sergent_staff', 'major_moderateur', 'sergent_moderateur', 'admin', 'admin_general'].indexOf(r) !== -1) return false;
        return true;
      });
    } catch (e) {
      console.warn('[moderation] load', e);
      return [];
    }
  }

  function renderChecklistHtml() {
    return CHECKLIST.map(function (sec) {
      var items = sec.items.map(function (t, i) {
        var id = 'modchk_' + sec.id + '_' + i;
        return '<label class="mod-check" for="' + id + '">' +
          '<input type="checkbox" id="' + id + '" data-mod-check="1">' +
          '<span>' + esc(t) + '</span></label>';
      }).join('');
      return '<div class="mod-section"><h4>' + esc(sec.label) + '</h4>' + items + '</div>';
    }).join('');
  }

  function allChecksDone() {
    var boxes = document.querySelectorAll('#aupygoModCard input[data-mod-check]');
    if (!boxes.length) return false;
    for (var i = 0; i < boxes.length; i++) {
      if (!boxes[i].checked) return false;
    }
    return true;
  }

  function openPanel() {
    if (!canModerate()) {
      toast('Réservé au Major Modérateur et à l\'Amiral.', 'error');
      return;
    }
    if (document.getElementById('aupygoModOverlay')) return;
    selectedUser = null;

    var ov = document.createElement('div');
    ov.id = 'aupygoModOverlay';
    ov.innerHTML =
      '<div id="aupygoModCard" role="dialog" aria-modal="true" aria-labelledby="modTitle">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">' +
      '<h3 id="modTitle" style="margin:0;font-size:18px">⚖️ Sanctions & bannissement</h3>' +
      '<button type="button" class="mod-btn-close" id="modCloseX" style="width:auto;padding:6px 12px">×</button></div>' +
      '<p class="mod-muted" style="margin:8px 0 12px">' +
      'Accès réservé au <strong>Major Modérateur</strong> et à l\'<strong>Amiral</strong>. ' +
      'Les emails de rappel profil (Brevo) sont déjà envoyés. Un profil incomplet peut justifier un ban après validation de la checklist.</p>' +
      '<input class="mod-search" id="modSearch" type="search" placeholder="Rechercher un pseudo (ex. jpcabal0608)" autocomplete="off">' +
      '<div class="mod-list" id="modList"><div class="mod-muted" style="padding:12px">Chargement…</div></div>' +
      '<div id="modSelected"></div>' +
      '<div id="modChecklistWrap" style="display:none">' +
      '<p style="font-size:13px;font-weight:700;margin:12px 0 4px">Checklist obligatoire avant sanction</p>' +
      renderChecklistHtml() +
      '<label style="font-size:13px;font-weight:600;display:block;margin-top:8px">Motif (obligatoire pour avertir ou bannir)</label>' +
      '<textarea class="mod-note" id="modNote" placeholder="Ex. : profil non complété malgré email Brevo du [date] ; propos non conformes à la charte…"></textarea>' +
      '<div class="mod-row">' +
      '<button type="button" class="mod-btn-warn" id="modWarn">Enregistrer un avertissement</button>' +
      '<button type="button" class="mod-btn-ban" id="modBan">Bannir le compte</button>' +
      '<button type="button" class="mod-btn-unban" id="modUnban">Lever le ban</button>' +
      '</div>' +
      '<p class="mod-legal">Rappel : sanction proportionnée, traçabilité, possibilité de contester à contact@aupygo.com. ' +
      'Pas de traitement discriminatoire. Logs de modération conservés uniquement pour la sécurité et le respect des CGU.</p>' +
      '</div>' +
      '<div class="mod-footer">' +
      '<div class="mod-row"><button type="button" class="mod-btn-close" id="modClose" style="flex:0 0 auto;min-width:100px">Fermer</button></div>' +
      '</div></div>';

    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) {
      if (e.target === ov) ov.remove();
    });
    document.getElementById('modClose').onclick = function () { ov.remove(); };
    document.getElementById('modCloseX').onclick = function () { ov.remove(); };

    var search = document.getElementById('modSearch');
    var timer = null;
    function refreshList() {
      loadCandidates(search.value).then(renderList);
    }
    search.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(refreshList, 280);
    });
    refreshList();

    document.getElementById('modWarn').onclick = function () { runAction('warn'); };
    document.getElementById('modBan').onclick = function () { runAction('ban'); };
    document.getElementById('modUnban').onclick = function () { runAction('unban'); };
  }

  function renderList(users) {
    var box = document.getElementById('modList');
    if (!box) return;
    if (!users.length) {
      box.innerHTML = '<div class="mod-muted" style="padding:12px">Aucun membre trouvé.</div>';
      return;
    }
    box.innerHTML = users.map(function (p) {
      var incomplete = isProfileIncomplete(p);
      var banned = p.is_banned === true;
      var warns = Number(p.moderation_warnings || 0) || 0;
      var badge = banned
        ? '<span class="mod-badge bad">BANNI</span>'
        : (incomplete ? '<span class="mod-badge warn">Profil incomplet</span>' : '<span class="mod-badge ok">OK</span>');
      if (warns > 0 && !banned) badge += '<span class="mod-badge warn">' + warns + ' avert.</span>';
      var meta = [p.city, p.host_country || p.country, p.subscription || 'FREE'].filter(Boolean).join(' · ');
      return '<button type="button" data-id="' + esc(p.id) + '">' +
        '<strong>' + esc(p.display_name || '(sans nom)') + '</strong> ' + badge +
        '<div class="mod-muted">' + esc(meta) + ' · score profil ' + profileScore(p) + '/7</div></button>';
    }).join('');

    box.querySelectorAll('button[data-id]').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-id');
        var u = users.find(function (x) { return x && x.id === id; });
        selectUser(u);
      };
    });
  }

  function selectUser(p) {
    selectedUser = p || null;
    var el = document.getElementById('modSelected');
    var wrap = document.getElementById('modChecklistWrap');
    if (!el || !wrap) return;
    if (!p) {
      el.innerHTML = '';
      wrap.style.display = 'none';
      return;
    }
    var incomplete = isProfileIncomplete(p);
    el.innerHTML =
      '<div class="mod-user">' +
      '<strong>' + esc(p.display_name || '') + '</strong>' +
      '<span class="mod-muted">id : ' + esc(p.id) + '</span><br>' +
      '<span class="mod-muted">' +
      esc([p.age ? p.age + ' ans' : null, p.gender, p.city, p.host_country || p.country].filter(Boolean).join(' · ')) +
      '</span><br>' +
      '<span class="mod-muted">Forfait : ' + esc(p.subscription || 'FREE') +
      (p.is_banned ? ' · <strong style="color:#991b1b">BANNI</strong>' : '') +
      (incomplete ? ' · <strong style="color:#92400e">Profil incomplet (email Brevo applicable)</strong>' : '') +
      '</span></div>';
    wrap.style.display = 'block';
  }

  async function runAction(action) {
    if (!selectedUser || !selectedUser.id) {
      toast('Sélectionne d’abord un membre.', 'error');
      return;
    }
    if (action !== 'unban' && !allChecksDone()) {
      toast('Coche toute la checklist avant d’avertir ou de bannir.', 'error');
      return;
    }
    var note = (document.getElementById('modNote') || {}).value || '';
    note = String(note).trim();
    if ((action === 'warn' || action === 'ban') && note.length < 8) {
      toast('Indique un motif écrit (minimum 8 caractères).', 'error');
      return;
    }

    var labels = {
      warn: 'enregistrer un avertissement pour',
      ban: 'BANNIR définitivement',
      unban: 'lever le ban de'
    };
    if (!confirm(
      (action === 'ban' ? '⚠️ ' : '') +
      'Confirmer : ' + (labels[action] || action) + ' « ' + (selectedUser.display_name || '') + ' » ?'
    )) return;

    var sb = client();
    if (!sb) {
      toast('Connexion indisponible.', 'error');
      return;
    }

    toast('Traitement en cours…', 'info');
    try {
      var res = await sb.functions.invoke(FN_NAME, {
        body: {
          action: action,
          target_id: selectedUser.id,
          reason: note,
          checklist_version: 'v2-2026-11',
          profile_incomplete: isProfileIncomplete(selectedUser),
          brevo_profile_mail_acknowledged: true
        }
      });

      if (res.error || (res.data && res.data.error)) {
        var err = (res.data && res.data.error) || (res.error && res.error.message) || 'erreur';
        var detail = (res.data && (res.data.detail || res.data.message)) || '';
        console.error('[moderation]', res);
        toast('Échec : ' + err + (detail ? ' — ' + detail : ''), 'error');
        return;
      }

      var data = res.data || {};
      if (action === 'warn') {
        toast('Avertissement enregistré' + (data.warnings != null ? ' (total : ' + data.warnings + ')' : '') + '.', 'success');
      } else if (action === 'ban') {
        toast('Compte banni. Connexion désormais impossible.', 'success');
      } else {
        toast('Ban levé. Le membre peut se reconnecter.', 'success');
      }

      // refresh list
      var search = document.getElementById('modSearch');
      var users = await loadCandidates(search ? search.value : '');
      renderList(users);
      var updated = users.find(function (u) { return u && u.id === selectedUser.id; });
      if (updated) selectUser(updated);
      else selectUser(null);
    } catch (e) {
      console.error('[moderation]', e);
      toast('Erreur réseau : ' + (e.message || e), 'error');
    }
  }

  setInterval(ensureBtn, 2000);
  setTimeout(ensureBtn, 500);
  setTimeout(ensureBtn, 1500);
  setTimeout(ensureBtn, 3500);

  console.log('[AUPYGO] moderation-panel.js v2.1 — layout fix');
})();
