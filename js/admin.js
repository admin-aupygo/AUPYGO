/* =========================
   AUPYGO — Panneau Administrateur (complet)
   Chargé APRÈS app.js
   Ne redéfinit PAS isAdmin / setOnlineStatus / refreshAuthUI
========================= */

(function () {
  'use strict';

  // Sécurité : on ne fait rien si les fonctions globales n'existent pas
  if (typeof isAdmin !== 'function') {
    console.warn('[AUPYGO Admin] isAdmin() introuvable — admin.js ignoré');
    return;
  }

  let adminUsersCache = [];
  let adminFilter = 'all'; // all | online | premium | free | admin
  let adminSearch = '';

  /* =========================
     INITIALISATION
  ========================= */
  function initAdminPanel() {
    injectAdminButton();
    injectAdminPage();
    // Re-vérifie après chaque refreshAuthUI
    const originalGo = window.go;
    if (typeof originalGo === 'function') {
      window.go = function (page) {
        originalGo(page);
        if (page === 'admin') {
          if (!isAdmin()) {
            showToast('Accès réservé à l\'administrateur', 'error');
            originalGo('home');
            return;
          }
          loadAdminData();
        }
        updateAdminButtonVisibility();
      };
    }

    // Premier affichage
    setTimeout(updateAdminButtonVisibility, 800);
  }

  /* =========================
     BOUTON NAV ADMIN
  ========================= */
  function injectAdminButton() {
    // Desktop nav
    const nav = document.querySelector('header nav');
    if (nav && !document.getElementById('navAdminBtn')) {
      const btn = document.createElement('button');
      btn.id = 'navAdminBtn';
      btn.style.display = 'none';
      btn.title = 'Administration';
      btn.setAttribute('aria-label', 'Administration');
      btn.innerHTML = '<span class="icon">🛡️</span>';
      btn.onclick = function () { go('admin'); };
      nav.appendChild(btn);
    }

    // Menu "more" mobile
    const moreList = document.querySelector('.more-sheet-list');
    if (moreList && !document.getElementById('moreAdminItem')) {
      const item = document.createElement('button');
      item.type = 'button';
      item.id = 'moreAdminItem';
      item.className = 'more-sheet-item';
      item.style.display = 'none';
      item.innerHTML = '<span class="msi-icon">🛡️</span><span>Administration</span>';
      item.onclick = function () {
        if (typeof closeMoreMenu === 'function') closeMoreMenu();
        go('admin');
      };
      moreList.appendChild(item);
    }
  }

  function updateAdminButtonVisibility() {
    const visible = isAdmin();
    const btn = document.getElementById('navAdminBtn');
    const more = document.getElementById('moreAdminItem');
    if (btn) btn.style.display = visible ? 'flex' : 'none';
    if (more) more.style.display = visible ? 'flex' : 'none';
  }

  /* =========================
     PAGE ADMIN (HTML)
  ========================= */
  function injectAdminPage() {
    if (document.getElementById('admin')) return;

    const main = document.querySelector('main');
    if (!main) return;

    const section = document.createElement('section');
    section.id = 'admin';
    section.className = 'page';
    section.innerHTML = `
      <div class="section-title">
        <h2>🛡️ Administration AUPYGO</h2>
        <p>Panneau réservé à l'administrateur</p>
      </div>

      <!-- STATS -->
      <div class="admin-stats" id="adminStats">
        <div class="admin-stat-card">
          <div class="admin-stat-value" id="statTotal">—</div>
          <div class="admin-stat-label">Membres</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-value" id="statOnline">—</div>
          <div class="admin-stat-label">En ligne</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-value" id="statPremium">—</div>
          <div class="admin-stat-label">Premium</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-value" id="statStandard">—</div>
          <div class="admin-stat-label">Standard</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-value" id="statFree">—</div>
          <div class="admin-stat-label">Free</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-value" id="statAdmins">—</div>
          <div class="admin-stat-label">Admins</div>
        </div>
      </div>

      <!-- BARRE D'OUTILS -->
      <div class="admin-toolbar">
        <input type="search" id="adminSearchInput" placeholder="🔍 Rechercher un membre (nom, ville, pays…)" 
               oninput="window.adminOnSearch(this.value)">
        <select id="adminFilterSelect" onchange="window.adminOnFilter(this.value)">
          <option value="all">Tous</option>
          <option value="online">En ligne</option>
          <option value="premium">Premium</option>
          <option value="standard">Standard</option>
          <option value="free">Free</option>
          <option value="admin">Admins</option>
        </select>
        <button class="btn btn-secondary" onclick="window.adminRefresh()">🔄 Actualiser</button>
      </div>

      <!-- LISTE -->
      <div class="admin-table-wrap">
        <table class="admin-table" id="adminTable">
          <thead>
            <tr>
              <th>Membre</th>
              <th>Plan</th>
              <th>Localisation</th>
              <th>Statut</th>
              <th>Admin</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="adminTableBody">
            <tr><td colspan="6" style="text-align:center;padding:30px;color:#888">Chargement…</td></tr>
          </tbody>
        </table>
      </div>
    `;
    main.appendChild(section);

    // Styles admin (injectés une seule fois)
    if (!document.getElementById('adminStyles')) {
      const style = document.createElement('style');
      style.id = 'adminStyles';
      style.textContent = `
        .admin-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 12px;
          margin-bottom: 22px;
        }
        .admin-stat-card {
          background: #fff;
          border: 1px solid var(--border, #e8e4ef);
          border-radius: 16px;
          padding: 16px 12px;
          text-align: center;
          box-shadow: 0 4px 14px rgba(42,24,70,.06);
        }
        .admin-stat-value {
          font-size: 26px;
          font-weight: 800;
          color: var(--primary, #7c3aed);
          line-height: 1.1;
        }
        .admin-stat-label {
          font-size: 12px;
          color: var(--muted, #777);
          margin-top: 4px;
          font-weight: 600;
        }
        .admin-toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 16px;
          align-items: center;
        }
        .admin-toolbar input[type="search"] {
          flex: 1;
          min-width: 200px;
          padding: 11px 14px;
          border: 1px solid var(--border, #e8e4ef);
          border-radius: 12px;
          font-size: 14px;
        }
        .admin-toolbar select {
          padding: 11px 12px;
          border: 1px solid var(--border, #e8e4ef);
          border-radius: 12px;
          font-size: 14px;
          background: #fff;
        }
        .admin-table-wrap {
          background: #fff;
          border: 1px solid var(--border, #e8e4ef);
          border-radius: 16px;
          overflow: auto;
          box-shadow: 0 4px 14px rgba(42,24,70,.06);
        }
        .admin-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .admin-table th {
          background: #f7f5fb;
          text-align: left;
          padding: 12px 14px;
          font-weight: 700;
          color: var(--text, #292638);
          white-space: nowrap;
        }
        .admin-table td {
          padding: 11px 14px;
          border-top: 1px solid #f0ecf6;
          vertical-align: middle;
        }
        .admin-table tr:hover td {
          background: #faf8ff;
        }
        .admin-avatar {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: linear-gradient(135deg, #ffd54f, #fbbf24);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          margin-right: 10px;
          vertical-align: middle;
        }
        .admin-name {
          font-weight: 700;
        }
        .admin-meta {
          font-size: 11px;
          color: #888;
        }
        .admin-badge {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
        }
        .admin-badge.FREE { background: #f3f4f6; color: #6b7280; }
        .admin-badge.STANDARD { background: #f1eafd; color: #7c3aed; }
        .admin-badge.PREMIUM { background: linear-gradient(135deg,#7c3aed,#ec4899); color: #fff; }
        .admin-online {
          color: #16a34a;
          font-weight: 700;
        }
        .admin-offline {
          color: #9ca3af;
        }
        .admin-toggle {
          cursor: pointer;
          font-size: 18px;
          border: none;
          background: none;
          padding: 4px;
        }
        .admin-actions button {
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 8px;
          border: 1px solid var(--border, #e8e4ef);
          background: #f7f5fb;
          cursor: pointer;
          margin-right: 4px;
        }
        .admin-actions button:hover {
          background: #ede9fe;
        }
        @media (max-width: 700px) {
          .admin-table th:nth-child(3),
          .admin-table td:nth-child(3) { display: none; }
        }
      `;
      document.head.appendChild(style);
    }
  }

  /* =========================
     CHARGEMENT DES DONNÉES
  ========================= */
  async function loadAdminData() {
    if (!isAdmin()) return;

    const tbody = document.getElementById('adminTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:#888">Chargement…</td></tr>';

    try {
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('id, display_name, age, gender, city, country, host_country, subscription, last_seen, is_online, is_admin, approx_lat, approx_lng, bio, interests')
        .order('last_seen', { ascending: false });

      if (error) throw error;

      adminUsersCache = data || [];
      renderAdminStats();
      renderAdminTable();
    } catch (e) {
      console.error('[Admin] load error:', e);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:#c00">Erreur : ${e.message || e}</td></tr>`;
      }
      if (typeof showToast === 'function') showToast('Erreur chargement admin', 'error');
    }
  }

  function renderAdminStats() {
    const list = adminUsersCache;
    const now = Date.now();
    const ONLINE_THRESHOLD = 15 * 60 * 1000; // 15 min

    const isOnline = (u) => {
      if (u.is_online === true) return true;
      if (u.last_seen) {
        return (now - new Date(u.last_seen).getTime()) < ONLINE_THRESHOLD;
      }
      return false;
    };

    const total = list.length;
    const online = list.filter(isOnline).length;
    const premium = list.filter(u => (u.subscription || '').toUpperCase() === 'PREMIUM').length;
    const standard = list.filter(u => (u.subscription || '').toUpperCase() === 'STANDARD').length;
    const free = list.filter(u => !u.subscription || (u.subscription || '').toUpperCase() === 'FREE').length;
    const admins = list.filter(u => u.is_admin === true).length;

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    set('statTotal', total);
    set('statOnline', online);
    set('statPremium', premium);
    set('statStandard', standard);
    set('statFree', free);
    set('statAdmins', admins);
  }

  function renderAdminTable() {
    const tbody = document.getElementById('adminTableBody');
    if (!tbody) return;

    const now = Date.now();
    const ONLINE_THRESHOLD = 15 * 60 * 1000;

    let list = [...adminUsersCache];

    // Filtre
    if (adminFilter === 'online') {
      list = list.filter(u => u.is_online === true || (u.last_seen && (now - new Date(u.last_seen).getTime()) < ONLINE_THRESHOLD));
    } else if (adminFilter === 'premium') {
      list = list.filter(u => (u.subscription || '').toUpperCase() === 'PREMIUM');
    } else if (adminFilter === 'standard') {
      list = list.filter(u => (u.subscription || '').toUpperCase() === 'STANDARD');
    } else if (adminFilter === 'free') {
      list = list.filter(u => !u.subscription || (u.subscription || '').toUpperCase() === 'FREE');
    } else if (adminFilter === 'admin') {
      list = list.filter(u => u.is_admin === true);
    }

    // Recherche
    if (adminSearch.trim()) {
      const q = adminSearch.trim().toLowerCase();
      list = list.filter(u => {
        const hay = [
          u.display_name, u.city, u.country, u.host_country, u.bio, u.gender
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
    }

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:#888">Aucun membre trouvé</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(u => {
      const name = u.display_name || 'Sans nom';
      const plan = (u.subscription || 'FREE').toUpperCase();
      const loc = [u.city, u.country || u.host_country].filter(Boolean).join(', ') || '—';
      const online = u.is_online === true || (u.last_seen && (now - new Date(u.last_seen).getTime()) < ONLINE_THRESHOLD);
      const lastSeen = u.last_seen ? new Date(u.last_seen).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
      const isAdm = u.is_admin === true;
      const genderIcon = u.gender === 'female' ? '👩' : (u.gender === 'male' ? '👨' : '👤');

      return `
        <tr data-id="${u.id}">
          <td>
            <span class="admin-avatar">${genderIcon}</span>
            <span class="admin-name">${escapeHtml(name)}</span>
            ${u.age ? `<span class="admin-meta"> · ${u.age} ans</span>` : ''}
          </td>
          <td><span class="admin-badge ${plan}">${plan}</span></td>
          <td>${escapeHtml(loc)}</td>
          <td>
            <span class="${online ? 'admin-online' : 'admin-offline'}">
              ${online ? '🟢 En ligne' : '⚫ Hors ligne'}
            </span>
            <div class="admin-meta">${lastSeen}</div>
          </td>
          <td style="text-align:center">
            <button class="admin-toggle" title="${isAdm ? 'Retirer admin' : 'Donner admin'}"
                    onclick="window.adminToggleAdmin('${u.id}', ${!isAdm})">
              ${isAdm ? '🛡️' : '⬜'}
            </button>
          </td>
          <td class="admin-actions">
            <button onclick="window.adminViewProfile('${u.id}')">Voir</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"');
  }

  /* =========================
     ACTIONS
  ========================= */
  window.adminOnSearch = function (val) {
    adminSearch = val || '';
    renderAdminTable();
  };

  window.adminOnFilter = function (val) {
    adminFilter = val || 'all';
    renderAdminTable();
  };

  window.adminRefresh = function () {
    loadAdminData();
    if (typeof showToast === 'function') showToast('Données actualisées', 'success');
  };

  window.adminToggleAdmin = async function (userId, makeAdmin) {
    if (!isAdmin()) return;
    if (!confirm(makeAdmin ? 'Donner les droits administrateur à ce membre ?' : 'Retirer les droits administrateur ?')) return;

    try {
      const { error } = await supabaseClient
        .from('profiles')
        .update({ is_admin: !!makeAdmin })
        .eq('id', userId);

      if (error) throw error;

      // Met à jour le cache local
      const u = adminUsersCache.find(x => x.id === userId);
      if (u) u.is_admin = !!makeAdmin;

      renderAdminStats();
      renderAdminTable();
      if (typeof showToast === 'function') {
        showToast(makeAdmin ? 'Droits admin accordés' : 'Droits admin retirés', 'success');
      }
    } catch (e) {
      console.error(e);
      if (typeof showToast === 'function') showToast('Erreur : ' + (e.message || e), 'error');
    }
  };

  window.adminViewProfile = function (userId) {
    const u = adminUsersCache.find(x => x.id === userId);
    if (!u) return;

    const plan = (u.subscription || 'FREE').toUpperCase();
    const loc = [u.city, u.country || u.host_country].filter(Boolean).join(', ') || '—';
    const interests = u.interests || '—';
    const bio = u.bio || '—';

    alert(
      `👤 ${u.display_name || 'Sans nom'}\n` +
      `─────────────────\n` +
      `Âge : ${u.age || '—'}\n` +
      `Genre : ${u.gender || '—'}\n` +
      `Plan : ${plan}\n` +
      `Localisation : ${loc}\n` +
      `Admin : ${u.is_admin ? 'Oui' : 'Non'}\n` +
      `Intérêts : ${interests}\n` +
      `Bio : ${bio}\n` +
      `ID : ${u.id}`
    );
  };

  /* =========================
     DÉMARRAGE
  ========================= */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminPanel);
  } else {
    initAdminPanel();
  }

  // Au cas où auth arrive plus tard
  setInterval(updateAdminButtonVisibility, 3000);

})();
