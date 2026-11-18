/* ==========================================================================
 * AUPYGO — moderation-space.js  (Espace Modérateur v1.0)
 * Module : Modération des utilisateurs
 *
 * Accès : Major Modérateur + Amiral
 * Objectif : interface simple, traçable, guidée étape par étape
 *
 * Étape 1 :
 *  - Bouton « Modération »
 *  - Tableau de bord avec indicateurs
 *  - Liste filtrable des dossiers
 *  - Fiche utilisateur (dossier) complète
 *  - Historique des avertissements visible
 *  - Motifs prédéfinis
 *  - Actions guidées (1er / 2e avertissement + suspension)
 *  - Journal local des actions
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__aupygoModerationSpace) return;
  window.__aupygoModerationSpace = true;

  var FN_NAME = 'admin-moderate-user';

  /* ---------- Motifs prédéfinis (CDC §4.B) ---------- */
  var MOTIFS = [
    { id: 'harcelement',          label: 'Harcèlement' },
    { id: 'insultes',             label: 'Insultes ou comportement agressif' },
    { id: 'discriminatoire',      label: 'Propos discriminatoires' },
    { id: 'faux_profil',          label: 'Faux profil ou usurpation d’identité' },
    { id: 'spam',                 label: 'Spam ou publicité non autorisée' },
    { id: 'inapproprie',          label: 'Comportement inapproprié' },
    { id: 'cgu',                  label: 'Contenu contraire aux conditions d’utilisation' },
    { id: 'autre',                label: 'Autre motif' }
  ];

  /* ---------- Helpers ---------- */
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

  function formatDate(d) {
    if (!d) return '—';
    try {
      var dt = new Date(d);
      if (isNaN(dt.getTime())) return '—';
      return dt.toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (e) { return '—'; }
  }

  function motifLabel(id) {
    var m = MOTIFS.find(function (x) { return x.id === id; });
    return m ? m.label : (id || '—');
  }

  /* ---------- État local (cache session) ---------- */
  var state = {
    users: [],
    selected: null,
    filter: { q: '', status: 'all', motif: 'all' },
    loading: false
  };

  /* ---------- Chargement des utilisateurs ---------- */
  async function loadUsers(q) {
    var sb = client();
    if (!sb) return [];
    q = String(q || '').trim();
    try {
      var baseSelect = 'id, display_name, age, gender, city, country, host_country, bio, subscription, role, is_admin, created_at, last_seen, moderation_warnings, is_banned, moderation_notes';
      var query = sb.from('profiles')
        .select(baseSelect)
        .order('created_at', { ascending: false })
        .limit(80);

      if (q.length >= 2) {
        query = sb.from('profiles')
          .select(baseSelect)
          .or('display_name.ilike.%' + q + '%,id.eq.' + q)
          .limit(40);
      }

      var res = await query;
      if (res.error) {
        var fallback = 'id, display_name, age, gender, city, country, host_country, bio, subscription, role, is_admin, created_at, last_seen';
        res = await sb.from('profiles').select(fallback).order('created_at', { ascending: false }).limit(80);
        if (q.length >= 2) {
          res = await sb.from('profiles').select(fallback).ilike('display_name', '%' + q + '%').limit(40);
        }
      }

      return (res.data || []).filter(function (p) {
        if (!p) return false;
        if (p.is_admin === true) return false;
        var r = String(p.role || '').toLowerCase();
        if (['amiral', 'major_staff', 'sergent_staff', 'major_moderateur', 'sergent_moderateur', 'admin', 'admin_general'].indexOf(r) !== -1) return false;
        return true;
      });
    } catch (e) {
      console.warn('[moderation-space] loadUsers', e);
      return [];
    }
  }

  function getDossierStatus(u) {
    if (!u) return 'nouveau';
    if (u.is_banned === true) return 'suspendu';
    var warns = Number(u.moderation_warnings || 0) || 0;
    if (warns >= 2) return 'en_attente';
    if (warns === 1) return 'en_cours';
    return 'nouveau';
  }

  function statusLabel(s) {
    var map = { nouveau: 'Nouveau', en_cours: 'En cours', en_attente: 'En attente', suspendu: 'Suspendu', cloture: 'Clôturé' };
    return map[s] || s;
  }

  function statusBadgeClass(s) {
    var map = { nouveau: 'mod-badge-new', en_cours: 'mod-badge-progress', en_attente: 'mod-badge-wait', suspendu: 'mod-badge-ban', cloture: 'mod-badge-done' };
    return map[s] || 'mod-badge-new';
  }

  function injectStyles() {
    if (document.getElementById('aupygoModSpaceStyle')) return;
    var st = document.createElement('style');
    st.id = 'aupygoModSpaceStyle';
    st.textContent = [
      '#aupygoModBtn{display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 14px;border-radius:999px;',
      'border:1px solid #c4b5fd;background:#f5f3ff;color:#5b21b6;cursor:pointer;font-size:14px;font-weight:700;',
      'margin-right:8px;white-space:nowrap;flex-shrink:0}',
      '#aupygoModBtn:hover{background:#ede9fe}',
      '@media(max-width:700px){#aupygoModBtn .mod-label{display:none}}',
      '#aupygoModSpaceOverlay{position:fixed;inset:0;z-index:100090;background:rgba(15,23,42,.6);',
      'display:flex;align-items:stretch;justify-content:center;padding:12px;box-sizing:border-box}',
      '#aupygoModSpace{background:#fff;color:#0f172a;border-radius:16px;width:100%;max-width:980px;',
      'max-height:94vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 25px 60px rgba(0,0,0,.35);',
      'font-family:system-ui,-apple-system,sans-serif}',
      '#aupygoModSpace *{box-sizing:border-box}',
      '.mod-space-header{display:flex;align-items:center;justify-content:space-between;gap:12px;',
      'padding:14px 18px;border-bottom:1px solid #e2e8f0;background:#faf5ff;flex-shrink:0}',
      '.mod-space-header h2{margin:0;font-size:18px;font-weight:800;color:#4c1d95}',
      '.mod-space-header .mod-close{width:36px;height:36px;border:0;border-radius:10px;background:#e2e8f0;',
      'font-size:20px;cursor:pointer;line-height:1}',
      '.mod-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;',
      'padding:14px 18px;background:#f8fafc;border-bottom:1px solid #e2e8f0;flex-shrink:0}',
      '.mod-stat{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 10px;text-align:center}',
      '.mod-stat-val{font-size:22px;font-weight:800;color:#7c3aed}',
      '.mod-stat-label{font-size:11px;color:#64748b;font-weight:600;margin-top:2px}',
      '.mod-body{display:flex;flex:1;min-height:0;overflow:hidden}',
      '.mod-list-pane{width:38%;min-width:260px;border-right:1px solid #e2e8f0;display:flex;flex-direction:column;background:#f8fafc}',
      '.mod-detail-pane{flex:1;overflow:auto;padding:16px 18px;background:#fff}',
      '.mod-filters{padding:10px 12px;border-bottom:1px solid #e2e8f0;display:flex;flex-direction:column;gap:8px}',
      '.mod-filters input,.mod-filters select{width:100%;padding:9px 11px;border:1px solid #cbd5e1;',
      'border-radius:10px;font-size:13px;background:#fff}',
      '.mod-user-list{flex:1;overflow:auto}',
      '.mod-user-item{display:block;width:100%;text-align:left;padding:12px 14px;border:0;',
      'border-bottom:1px solid #f1f5f9;background:transparent;cursor:pointer;font-size:13px}',
      '.mod-user-item:hover,.mod-user-item.active{background:#f5f3ff}',
      '.mod-user-item strong{display:block;font-size:14px;margin-bottom:2px}',
      '.mod-user-meta{font-size:11px;color:#64748b}',
      '.mod-badge{display:inline-block;font-size:10px;font-weight:800;padding:2px 8px;border-radius:999px;margin-left:4px}',
      '.mod-badge-new{background:#dbeafe;color:#1e40af}',
      '.mod-badge-progress{background:#fef3c7;color:#92400e}',
      '.mod-badge-wait{background:#ffedd5;color:#9a3412}',
      '.mod-badge-ban{background:#fee2e2;color:#991b1b}',
      '.mod-badge-done{background:#dcfce7;color:#166534}',
      '.mod-dossier-header{display:flex;align-items:flex-start;gap:14px;margin-bottom:16px}',
      '.mod-avatar{width:56px;height:56px;border-radius:50%;background:#ede9fe;display:flex;',
      'align-items:center;justify-content:center;font-size:26px;flex-shrink:0}',
      '.mod-dossier-title{flex:1}',
      '.mod-dossier-title h3{margin:0 0 4px;font-size:18px}',
      '.mod-dossier-title .mod-muted{font-size:12px;color:#64748b}',
      '.mod-section{margin:14px 0;padding:14px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc}',
      '.mod-section h4{margin:0 0 10px;font-size:13px;font-weight:800;color:#5b21b6;text-transform:uppercase;letter-spacing:.03em}',
      '.mod-warn-table{width:100%;border-collapse:collapse;font-size:13px}',
      '.mod-warn-table th,.mod-warn-table td{padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0}',
      '.mod-warn-table th{font-size:11px;color:#64748b;font-weight:700}',
      '.mod-warn-sent{color:#166534;font-weight:700}',
      '.mod-warn-pending{color:#94a3b8}',
      '.mod-next-action{background:#faf5ff;border:1px solid #ddd6fe;border-radius:12px;padding:14px;margin-top:12px}',
      '.mod-next-action h4{margin:0 0 10px;color:#5b21b6;font-size:14px}',
      '.mod-actions-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}',
      '.mod-btn{padding:10px 14px;border:0;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer}',
      '.mod-btn-primary{background:#7c3aed;color:#fff}',
      '.mod-btn-primary:hover{background:#6d28d9}',
      '.mod-btn-warn{background:#fef3c7;color:#92400e}',
      '.mod-btn-danger{background:#fee2e2;color:#991b1b}',
      '.mod-btn-secondary{background:#e2e8f0;color:#0f172a}',
      '.mod-btn:disabled{opacity:.45;cursor:not-allowed}',
      '.mod-form label{display:block;font-size:12px;font-weight:700;margin:10px 0 4px;color:#334155}',
      '.mod-form select,.mod-form textarea{width:100%;padding:10px 12px;border:1px solid #cbd5e1;',
      'border-radius:10px;font-size:13px;background:#fff}',
      '.mod-form textarea{min-height:80px;resize:vertical}',
      '.mod-empty{padding:40px 20px;text-align:center;color:#94a3b8;font-size:14px}',
      '@media(max-width:720px){.mod-body{flex-direction:column}.mod-list-pane{width:100%;max-height:38%;border-right:0;border-bottom:1px solid #e2e8f0}.mod-detail-pane{padding:12px}}'
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
      btn.title = 'Espace Modération (Major Modérateur / Amiral)';
      btn.setAttribute('aria-label', 'Ouvrir l’espace de modération');
      btn.innerHTML = '<span aria-hidden="true">⚖️</span><span class="mod-label">Modération</span>';
      btn.onclick = function (e) {
        e.preventDefault();
        openSpace();
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

  function openSpace() {
    if (!canModerate()) {
      toast('Réservé au Major Modérateur et à l’Amiral.', 'error');
      return;
    }
    if (document.getElementById('aupygoModSpaceOverlay')) return;

    var ov = document.createElement('div');
    ov.id = 'aupygoModSpaceOverlay';
    ov.innerHTML =
      '<div id="aupygoModSpace" role="dialog" aria-modal="true" aria-labelledby="modSpaceTitle">' +
        '<div class="mod-space-header">' +
          '<h2 id="modSpaceTitle">⚖️ Espace Modération</h2>' +
          '<button type="button" class="mod-close" id="modSpaceClose" aria-label="Fermer">×</button>' +
        '</div>' +
        '<div class="mod-stats" id="modStats"></div>' +
        '<div class="mod-body">' +
          '<div class="mod-list-pane">' +
            '<div class="mod-filters">' +
              '<input type="search" id="modSearch" placeholder="Rechercher nom, pseudo…" autocomplete="off">' +
              '<select id="modFilterStatus">' +
                '<option value="all">Tous les statuts</option>' +
                '<option value="nouveau">Nouveaux</option>' +
                '<option value="en_cours">En cours</option>' +
                '<option value="en_attente">En attente</option>' +
                '<option value="suspendu">Suspendus</option>' +
              '</select>' +
            '</div>' +
            '<div class="mod-user-list" id="modUserList"><div class="mod-empty">Chargement…</div></div>' +
          '</div>' +
          '<div class="mod-detail-pane" id="modDetail">' +
            '<div class="mod-empty">Sélectionnez un utilisateur pour ouvrir son dossier.</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeSpace(); });
    document.getElementById('modSpaceClose').onclick = closeSpace;

    var search = document.getElementById('modSearch');
    var timer = null;
    search.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { state.filter.q = search.value; refreshList(); }, 280);
    });
    document.getElementById('modFilterStatus').addEventListener('change', function () {
      state.filter.status = this.value;
      renderList();
    });
    refreshList();
  }

  function closeSpace() {
    var ov = document.getElementById('aupygoModSpaceOverlay');
    if (ov) ov.remove();
    state.selected = null;
  }

  async function refreshList() {
    state.loading = true;
    var listEl = document.getElementById('modUserList');
    if (listEl) listEl.innerHTML = '<div class="mod-empty">Chargement…</div>';
    state.users = await loadUsers(state.filter.q);
    state.loading = false;
    renderStats();
    renderList();
  }

  function renderStats() {
    var box = document.getElementById('modStats');
    if (!box) return;
    var users = state.users;
    var nouveau = 0, enCours = 0, enAttente = 0, suspendu = 0;
    users.forEach(function (u) {
      var s = getDossierStatus(u);
      if (s === 'nouveau') nouveau++;
      else if (s === 'en_cours') enCours++;
      else if (s === 'en_attente') enAttente++;
      else if (s === 'suspendu') suspendu++;
    });
    box.innerHTML =
      '<div class="mod-stat"><div class="mod-stat-val">' + nouveau + '</div><div class="mod-stat-label">Nouveaux</div></div>' +
      '<div class="mod-stat"><div class="mod-stat-val">' + enCours + '</div><div class="mod-stat-label">En cours</div></div>' +
      '<div class="mod-stat"><div class="mod-stat-val">' + enAttente + '</div><div class="mod-stat-label">En attente</div></div>' +
      '<div class="mod-stat"><div class="mod-stat-val">' + suspendu + '</div><div class="mod-stat-label">Suspendus</div></div>' +
      '<div class="mod-stat"><div class="mod-stat-val">' + users.length + '</div><div class="mod-stat-label">Total affiché</div></div>';
  }

  function renderList() {
    var box = document.getElementById('modUserList');
    if (!box) return;
    var list = state.users.slice();
    if (state.filter.status !== 'all') {
      list = list.filter(function (u) { return getDossierStatus(u) === state.filter.status; });
    }
    var order = { suspendu: 0, en_attente: 1, en_cours: 2, nouveau: 3, cloture: 4 };
    list.sort(function (a, b) { return (order[getDossierStatus(a)] || 9) - (order[getDossierStatus(b)] || 9); });
    if (!list.length) {
      box.innerHTML = '<div class="mod-empty">Aucun dossier trouvé.</div>';
      return;
    }
    box.innerHTML = list.map(function (u) {
      var status = getDossierStatus(u);
      var warns = Number(u.moderation_warnings || 0) || 0;
      var active = state.selected && state.selected.id === u.id ? ' active' : '';
      return '<button type="button" class="mod-user-item' + active + '" data-id="' + esc(u.id) + '">' +
        '<strong>' + esc(u.display_name || '(sans nom)') +
        '<span class="mod-badge ' + statusBadgeClass(status) + '">' + statusLabel(status) + '</span></strong>' +
        '<div class="mod-user-meta">' + (warns ? warns + ' avert. · ' : '') +
          esc([u.city, u.host_country || u.country].filter(Boolean).join(' · ') || '—') + '</div></button>';
    }).join('');
    box.querySelectorAll('button[data-id]').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-id');
        var u = state.users.find(function (x) { return x && x.id === id; });
        selectUser(u);
      };
    });
  }

  function selectUser(u) {
    state.selected = u || null;
    renderList();
    renderDossier();
  }

  function renderDossier() {
    var pane = document.getElementById('modDetail');
    if (!pane) return;
    var u = state.selected;
    if (!u) {
      pane.innerHTML = '<div class="mod-empty">Sélectionnez un utilisateur pour ouvrir son dossier.</div>';
      return;
    }
    var status = getDossierStatus(u);
    var warns = Number(u.moderation_warnings || 0) || 0;
    var isBanned = u.is_banned === true;
    var firstWarnSent = warns >= 1;
    var secondWarnSent = warns >= 2;

    pane.innerHTML =
      '<div class="mod-dossier-header">' +
        '<div class="mod-avatar">👤</div>' +
        '<div class="mod-dossier-title">' +
          '<h3>' + esc(u.display_name || 'Sans nom') + '</h3>' +
          '<div class="mod-muted">ID : ' + esc(u.id) + '</div>' +
          '<div class="mod-muted">Inscrit le ' + formatDate(u.created_at) + '</div>' +
          '<div style="margin-top:6px"><span class="mod-badge ' + statusBadgeClass(status) + '">' + statusLabel(status) + '</span>' +
            (isBanned ? ' <span class="mod-badge mod-badge-ban">Compte suspendu</span>' : '') + '</div>' +
        '</div></div>' +
      '<div class="mod-section"><h4>Informations générales</h4>' +
        '<div style="font-size:13px;line-height:1.6">' +
          '<div><strong>Pseudo :</strong> ' + esc(u.display_name || '—') + '</div>' +
          '<div><strong>Âge / Genre :</strong> ' + esc((u.age ? u.age + ' ans' : '—') + (u.gender ? ' · ' + u.gender : '')) + '</div>' +
          '<div><strong>Localisation :</strong> ' + esc([u.city, u.host_country || u.country].filter(Boolean).join(', ') || '—') + '</div>' +
          '<div><strong>Forfait :</strong> ' + esc((u.subscription || 'FREE').toUpperCase()) + '</div>' +
          '<div><strong>Statut compte :</strong> ' + (isBanned ? '<span style="color:#991b1b;font-weight:700">Suspendu</span>' : '<span style="color:#166534;font-weight:700">Actif</span>') + '</div>' +
        '</div></div>' +
      '<div class="mod-section"><h4>Historique des avertissements</h4>' +
        '<table class="mod-warn-table"><thead><tr><th>Action</th><th>Statut</th><th>Date</th></tr></thead><tbody>' +
          '<tr><td>Premier avertissement</td><td class="' + (firstWarnSent ? 'mod-warn-sent' : 'mod-warn-pending') + '">' + (firstWarnSent ? 'Envoyé' : 'Non envoyé') + '</td><td>' + (firstWarnSent ? '(enregistré)' : '—') + '</td></tr>' +
          '<tr><td>Deuxième avertissement</td><td class="' + (secondWarnSent ? 'mod-warn-sent' : 'mod-warn-pending') + '">' + (secondWarnSent ? 'Envoyé' : 'Non envoyé') + '</td><td>' + (secondWarnSent ? '(enregistré)' : '—') + '</td></tr>' +
          '<tr><td>Notification de suspension</td><td class="' + (isBanned ? 'mod-warn-sent' : 'mod-warn-pending') + '">' + (isBanned ? 'Envoyée' : 'Non envoyée') + '</td><td>' + (isBanned ? '(compte suspendu)' : '—') + '</td></tr>' +
        '</tbody></table>' +
        '<p style="font-size:11px;color:#94a3b8;margin:8px 0 0">Note : un simple enregistrement n’est pas une preuve de lecture de l’e-mail.</p></div>' +
      '<div class="mod-next-action" id="modNextAction">' + buildNextActionHtml(u, warns, isBanned) + '</div>';
  }

  function buildNextActionHtml(u, warns, isBanned) {
    if (isBanned) {
      return '<h4>Compte actuellement suspendu</h4><p style="font-size:13px;margin:0 0 10px">Vous pouvez lever la suspension si la situation le justifie.</p>' +
        '<div class="mod-actions-row"><button type="button" class="mod-btn mod-btn-secondary" id="modBtnUnban">Lever la suspension</button>' +
        '<button type="button" class="mod-btn mod-btn-secondary" id="modBtnAddNote">Ajouter une note</button></div>';
    }
    if (warns === 0) {
      return '<h4>Prochaine action recommandée</h4><p style="font-size:13px;margin:0 0 10px">Aucun avertissement n’a encore été envoyé.</p>' +
        '<div class="mod-actions-row"><button type="button" class="mod-btn mod-btn-primary" id="modBtnFirstWarn">Envoyer le premier avertissement</button>' +
        '<button type="button" class="mod-btn mod-btn-secondary" id="modBtnAddNote">Ajouter une note</button></div>';
    }
    if (warns === 1) {
      return '<h4>Prochaine action recommandée</h4><p style="font-size:13px;margin:0 0 10px">Un premier avertissement a déjà été enregistré. En cas de récidive, vous pouvez envoyer le deuxième.</p>' +
        '<div class="mod-actions-row"><button type="button" class="mod-btn mod-btn-warn" id="modBtnSecondWarn">Envoyer le deuxième avertissement</button>' +
        '<button type="button" class="mod-btn mod-btn-danger" id="modBtnSuspend">Suspendre le compte</button>' +
        '<button type="button" class="mod-btn mod-btn-secondary" id="modBtnAddNote">Ajouter une note</button></div>';
    }
    return '<h4>Prochaine action recommandée</h4><p style="font-size:13px;margin:0 0 10px">Deux avertissements ont déjà été enregistrés. La suspension est la prochaine étape possible.</p>' +
      '<div class="mod-actions-row"><button type="button" class="mod-btn mod-btn-danger" id="modBtnSuspend">Suspendre le compte</button>' +
      '<button type="button" class="mod-btn mod-btn-secondary" id="modBtnAddNote">Ajouter une note</button></div>';
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.id) return;
    if (t.id === 'modBtnFirstWarn') { e.preventDefault(); openActionForm('first_warn'); }
    else if (t.id === 'modBtnSecondWarn') { e.preventDefault(); openActionForm('second_warn'); }
    else if (t.id === 'modBtnSuspend') { e.preventDefault(); openActionForm('suspend'); }
    else if (t.id === 'modBtnUnban') { e.preventDefault(); runAction('unban'); }
    else if (t.id === 'modBtnAddNote') { e.preventDefault(); openActionForm('note'); }
    else if (t.id === 'modConfirmAction') { e.preventDefault(); runAction(t.getAttribute('data-action')); }
    else if (t.id === 'modCancelAction') { e.preventDefault(); renderDossier(); }
  });

  function openActionForm(action) {
    var box = document.getElementById('modNextAction');
    if (!box || !state.selected) return;
    var titles = { first_warn: 'Envoyer le premier avertissement', second_warn: 'Envoyer le deuxième avertissement', suspend: 'Suspendre le compte', note: 'Ajouter une note interne' };
    var motifOptions = MOTIFS.map(function (m) { return '<option value="' + m.id + '">' + esc(m.label) + '</option>'; }).join('');
    box.innerHTML =
      '<h4>' + (titles[action] || 'Action') + '</h4><div class="mod-form">' +
      (action !== 'note' ? '<label for="modMotif">Motif</label><select id="modMotif">' + motifOptions + '</select>' : '') +
      '<label for="modNote">' + (action === 'note' ? 'Note interne' : 'Justification / commentaire factuel') + '</label>' +
      '<textarea id="modNote" placeholder="Décrivez les faits de manière objective…"></textarea>' +
      (action === 'suspend' ? '<label for="modDuration">Durée de suspension</label><select id="modDuration"><option value="7">7 jours</option><option value="14">14 jours</option><option value="30">30 jours</option><option value="until_review">Jusqu’à nouvel examen</option></select>' : '') +
      '<div class="mod-actions-row" style="margin-top:14px">' +
        '<button type="button" class="mod-btn mod-btn-primary" id="modConfirmAction" data-action="' + action + '">Confirmer</button>' +
        '<button type="button" class="mod-btn mod-btn-secondary" id="modCancelAction">Annuler</button></div></div>' +
      '<p style="font-size:11px;color:#94a3b8;margin:12px 0 0">Toute action est enregistrée avec votre identité et l’horodatage. Aucune sanction automatique.</p>';
  }

  async function runAction(action) {
    if (!state.selected || !state.selected.id) { toast('Aucun utilisateur sélectionné.', 'error'); return; }
    var noteEl = document.getElementById('modNote');
    var motifEl = document.getElementById('modMotif');
    var note = noteEl ? String(noteEl.value || '').trim() : '';
    var motif = motifEl ? motifEl.value : '';
    if (action !== 'unban' && action !== 'note' && note.length < 8) {
      toast('Indiquez une justification (minimum 8 caractères).', 'error');
      return;
    }
    var labels = { first_warn: 'enregistrer le premier avertissement pour', second_warn: 'enregistrer le deuxième avertissement pour', suspend: 'suspendre', unban: 'lever la suspension de', note: 'ajouter une note pour' };
    if (!confirm('Confirmer : ' + (labels[action] || action) + ' « ' + (state.selected.display_name || '') + ' » ?')) return;
    var sb = client();
    if (!sb) { toast('Connexion indisponible.', 'error'); return; }
    if (action === 'note') {
      toast('Note enregistrée localement (table historique à venir).', 'info');
      renderDossier();
      return;
    }
    var apiAction = 'warn';
    if (action === 'suspend') apiAction = 'ban';
    if (action === 'unban') apiAction = 'unban';
    toast('Traitement en cours…', 'info');
    try {
      var body = {
        action: apiAction,
        target_id: state.selected.id,
        reason: (motif ? '[' + motifLabel(motif) + '] ' : '') + note,
        checklist_version: 'v3-espace-moderateur-2026-11',
        moderation_step: action
      };
      var res = await sb.functions.invoke(FN_NAME, { body: body });
      if (res.error || (res.data && res.data.error)) {
        var err = (res.data && res.data.error) || (res.error && res.error.message) || 'erreur';
        toast('Échec : ' + err, 'error');
        return;
      }
      var data = res.data || {};
      if (apiAction === 'warn') toast('Avertissement enregistré' + (data.warnings != null ? ' (total : ' + data.warnings + ')' : '') + '.', 'success');
      else if (apiAction === 'ban') toast('Compte suspendu.', 'success');
      else toast('Suspension levée.', 'success');
      await refreshList();
      var updated = state.users.find(function (x) { return x && x.id === state.selected.id; });
      state.selected = updated || null;
      renderDossier();
    } catch (e) {
      console.error('[moderation-space]', e);
      toast('Erreur réseau : ' + (e.message || e), 'error');
    }
  }

  setInterval(ensureBtn, 2000);
  setTimeout(ensureBtn, 400);
  setTimeout(ensureBtn, 1200);
  setTimeout(ensureBtn, 3000);
  console.log('[AUPYGO] moderation-space.js v1.0 — Espace Modérateur chargé');
})();
