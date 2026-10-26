/* ==========================================================================
 * AUPYGO — moderation-panel.js v1
 * Bouton + panneau réservés à : Major Modérateur + Amiral
 * (pas Sergent Modérateur, pas Staff événementiel)
 *
 * - Checklist conventionnelle conforme bonnes pratiques / CGU / droit FR
 * - Rappel : email Brevo déjà envoyé (profil à compléter sous peine de ban)
 * - Actions : avertissement enregistré + ban / unban (Edge Function)
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__aupygoModerationPanel) return;
  window.__aupygoModerationPanel = true;

  var FN_NAME = 'admin-moderate-user';

  /** Checklist fixe — à cocher avant sanction */
  var CHECKLIST = [
    {
      id: 'identity',
      label: 'Identité communautaire',
      items: [
        'Pseudo / prénom cohérent (pas de spam, pas d\'identité usurpee)',
        'Profil renseigné : âge, genre, pays d\'accueil, langues (obligation rappelée par email Brevo)',
        'Pas de photo personnelle (avatars universels uniquement — charte AUPYGO)'
      ]
    },
    {
      id: 'conduct',
      label: 'Comportement & messages',
      items: [
        'Pas de harcèlement, menaces, propos discriminatoires ou haineux',
        'Pas de spam, pub, phishing, collecte de données d\'autrui',
        'Respect de la charte communauté et des CGU AUPYGO'
      ]
    },
    {
      id: 'legal',
      label: 'Cadre légal (rappel)',
      items: [
        'Sanction proportionnée au manquement constaté',
        'Trace écrite de la décision (motif + date) conservée',
        'Droit d\'accès / rectification : l\'utilisateur peut écrire à contact@aupygo.com',
        'Données traitées uniquement pour la sécurité de la communauté (intérêt légitime / CGU)',
        'Mineurs : en cas de doute sur l\'\u00e2ge, suspension prudente et vérification'
      ]
    },
    {
      id: 'process',
      label: 'Processus AUPYGO',
      items: [
        'Email Brevo déjà envoyé : obligation de compléter le profil sous peine de bannissement',
        'Avertissement préalable enregistré sauf urgence (sécurité, illégalité manifeste)',
        'Ban = impossibilité de se reconnecter (Auth Supabase) — réversible par Amiral / Major Modérateur'
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
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
      'display:flex;align-items:center;justify-content:center;padding:16px}',
      '#aupygoModCard{background:#fff;color:#0f172a;border-radius:16px;width:100%;max-width:560px;',
      'max-height:92vh;overflow:auto;padding:20px 18px;box-shadow:0 24px 60px rgba(0,0,0,.3);',
      'font-family:system-ui,-apple-system,sans-serif}',
      '.mod-section{margin:14px 0;padding:12px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc}',
      '.mod-section h4{margin:0 0 8px;font-size:14px;color:#7c3aed}',
      '.mod-check{display:flex;gap:8px;align-items:flex-start;margin:6px 0;font-size:13px;line-height:1.4;cursor:pointer}',
      '.mod-check input{margin-top:3px;flex-shrink:0;accent-color:#7c3aed}',
      '.mod-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}',
      '.mod-row button{flex:1;min-width:120px;padding:10px 12px;border:0;border-radius:10px;font-weight:700;cursor:pointer;font-size:13px}',
      '.mod-btn-warn{background:#fef3c7;color:#92400e}',
      '.mod-btn-ban{background:#fee2e2;color:#991b1b}',
      '.mod-btn-unban{background:#dcfce7;color:#166534}',
      '.mod-btn-close{background:#e2e8f0;color:#0f172a}',
      '.mod-user{padding:10px 12px;border-radius:10px;background:#faf5ff;border:1px solid #e9d5ff;margin-bottom:10px}',
      '.mod-user strong{display:block;font-size:16px}',
      '.mod-muted{font-size:12px;color:#64748b}',
      '.mod-search{width:100%;box-sizing:border-box;padding:10px;border:1px solid #cbd5e1;border-radius:10px;font-size:14px;margin-bottom:8px}',
      '.mod-list{max-height:180px;overflow:auto;border:1px solid #e2e8f0;border-radius:10px}',
      '.mod-list button{display:block;width:100%;text-align:left;padding:10px 12px;border:0;border-bottom:1px solid #f1f5f9;',
      'background:#fff;cursor:pointer;font-size:13px}',
      '.mod-list button:hover{background:#f8fafc}',
      '.mod-badge{display:inline-block;font-size:11px;font-weight:800;padding:2px 8px;border-radius:999px;margin-left:6px}',
      '.mod-badge.warn{background:#fef3c7;color:#92400e}',
      '.mod-badge.bad{background:#fee2e2;color:#991b1b}',
      '.mod-badge.ok{background:#dcfce7;color:#166534}',
      '.mod-note{width:100%;box-sizing:border-box;min-height:70px;padding:10px;border:1px solid #cbd5e1;border-radius:10px;font-size:13px;margin-top:8px}',
      '.mod-legal{font-size:11px;color:#64748b;line-height:1.45;margin-top:12px}'
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
      btn.title = 'Modération (Major Modérateur / Amiral)';
      btn.setAttribute('aria-label', 'Ouvrir le panneau de modération');
      btn.innerHTML = '<span aria-hidden="true">⚖️</span><span class="mod-label">Modération</span>';
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
      '<h3 id="modTitle" style="margin:0;font-size:18px">⚖️ Modération</h3>' +
      '<button type="button" class="mod-btn-close" id="modCloseX" style="width:auto;padding:6px 12px">×</button></div>' +
      '<p class="mod-muted" style="margin:8px 0 12px">Accès : <strong>Major Modérateur</strong> &amp; <strong>Amiral</strong> uniquement. ' +
      'Les e-mails de rappel profil (Brevo) sont déjà envoyés aux membres ; un profil incomplet peut justifier un ban après checklist.</p>' +
      '<input class="mod-search" id="modSearch" type="search" placeholder="Rechercher un pseudo (ex. jpcabal0608)" autocomplete="off">' +
      '<div class="mod-list" id="modList"><div class="mod-muted" style="padding:12px">Chargement…</div></div>' +
      '<div id="modSelected"></div>' +
      '<div id="modChecklistWrap" style="display:none">' +
      '<p style="font-size:13px;font-weight:700;margin:12px 0 4px">Checklist avant sanction</p>' +
      renderChecklistHtml() +
      '<label style="font-size:13px;font-weight:600;display:block;margin-top:8px">Motif (obligatoire pour avertir / bannir)</label>' +
      '<textarea class="mod-note" id="modNote" placeholder="Ex. : profil non complété malgré email Brevo ; comportement non conforme à la charte…"></textarea>' +
      '<div class="mod-row">' +
      '<button type="button" class="mod-btn-warn" id="modWarn">Avertissement</button>' +
      '<button type="button" class="mod-btn-ban" id="modBan">Bannir le compte</button>' +
      '<button type="button" class="mod-btn-unban" id="modUnban">Lever le ban</button>' +
      '</div>' +
      '<p class="mod-legal">Rappel légal : sanction proportionnée, traçabilité, possibilité de contester auprès de contact@aupygo.com. ' +
      'Pas de traitement discriminatoire. Conservation limitée des logs de modération à des fins de sécurité et de preuve du respect des CGU.</p>' +
      '</div>' +
      '<div class="mod-row" style="margin-top:12px"><button type="button" class="mod-btn-close" id="modClose">Fermer</button></div>' +
      '</div>';

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
        '<strong>' + esc(p.display_name || '(sans nom)') + '</strong>' + badge +
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
      '<span class="mod-muted">id : ' + esc(p.id) + '</span><br>' +
      '<span class="mod-muted">' +
      esc([p.age ? p.age + ' ans' : null, p.gender, p.city, p.host_country || p.country].filter(Boolean).join(' · ')) +
      '</span><br>' +
      '<span class="mod-muted">Forfait : ' + esc(p.subscription || 'FREE') +
      (p.is_banned ? ' · <strong style="color:#991b1b">BANNI</strong>' : '') +
      (incomplete ? ' · <strong style="color:#92400e">Profil incomplet (email Brevo applicable)</strong>' : '') +
      '</span></div>';
    wrap.style.display = 'block';
  }

  async function runAction(action) {
    if (!selectedUser || !selectedUser.id) {
      toast('Sélectionne un membre.', 'error');
      return;
    }
    if (action !== 'unban' && !allChecksDone()) {
      toast('Coche toute la checklist avant d\'avertir ou de bannir.', 'error');
      return;
    }
    var note = (document.getElementById('modNote') || {}).value || '';
    note = String(note).trim();
    if ((action === 'warn' || action === 'ban') && note.length < 8) {
      toast('Indique un motif écrit (min. 8 caractères).', 'error');
      return;
    }

    var labels = { warn: 'enregistrer un avertissement pour', ban: 'BANNIR', unban: 'lever le ban de' };
    if (!confirm(
      (action === 'ban' ? '⚠️ ' : '') +
      'Confirmer : ' + (labels[action] || action) + ' « ' + (selectedUser.display_name || '') + ' » ?'
    )) return;

    var sb = client();
    if (!sb) {
      toast('Connexion indisponible.', 'error');
      return;
    }

    toast('Traitement…', 'info');
    try {
      var res = await sb.functions.invoke(FN_NAME, {
        body: {
          action: action,
          target_id: selectedUser.id,
          reason: note,
          checklist_version: 'v1-2026-10',
          profile_incomplete: isProfileIncomplete(selectedUser),
          brevo_profile_mail_acknowledged: true
        }
      });

      if (res.error || (res.data && res.data.error)) {
        var err = (res.data && res.data.error) || (res.error && res.error.message) || 'erreur';
        var detail = (res.data && (res.data.detail || res.data.message)) || '';
        console.error('[moderation]', res);
        toast('Echec : ' + err + (detail ? ' — ' + detail : ''), 'error');
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

  console.log('[AUPYGO] moderation-panel.js v1 — Major Modérateur + Amiral');
})();
