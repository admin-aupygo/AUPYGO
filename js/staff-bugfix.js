/* AUPYGO — staff-bugfix.js (22/10/2026)
 * - loadUnreadCounts : ne plante plus si currentUser devient null en cours d'async
 * - profiles upsert 400 : fallback update-only + ignore erreur non bloquante
 * - dark mode staff : menus / boutons header force styles sombres
 */
(function () {
  'use strict';

  /* ---------- 1. loadUnreadCounts null-safe ---------- */
  function patchLoadUnreadCounts() {
    if (typeof window.loadUnreadCounts !== 'function' || window._sbfUnreadPatched) return;
    window._sbfUnreadPatched = true;
    var orig = window.loadUnreadCounts;
    window.loadUnreadCounts = async function () {
      var cu = window.currentUser || (typeof currentUser !== 'undefined' ? currentUser : null);
      if (!cu || !cu.id) {
        try {
          if (typeof unreadByConversation !== 'undefined') unreadByConversation = {};
          if (typeof friendIdByConversation !== 'undefined') friendIdByConversation = {};
          if (typeof unreadByFriend !== 'undefined') unreadByFriend = {};
          if (typeof updateMessagesBadge === 'function') updateMessagesBadge();
        } catch (e) {}
        return;
      }
      try {
        return await orig.apply(this, arguments);
      } catch (e) {
        var still = window.currentUser || (typeof currentUser !== 'undefined' ? currentUser : null);
        if (!still || !still.id || String(e && e.message || e).indexOf("reading 'id'") !== -1) {
          console.warn('[AUPYGO] loadUnreadCounts ignoré (user null)');
          return;
        }
        console.error('loadUnreadCounts:', e);
      }
    };
  }

  /* ---------- 2. profiles upsert 400 (on_conflict) ---------- */
  function safeProfileWrite(payload) {
    var cu = window.currentUser || (typeof currentUser !== 'undefined' ? currentUser : null);
    if (!cu || !cu.id) return Promise.resolve();
    var client = window.supabaseClient || window.supabase;
    if (!client) return Promise.resolve();
    var id = cu.id;
    var body = Object.assign({ id: id }, payload || {});
    return client.from('profiles').update(body).eq('id', id).then(function (res) {
      if (res && res.error) {
        return client.from('profiles').upsert(body, { onConflict: 'id' }).then(function (r2) {
          if (r2 && r2.error) {
            console.warn('[AUPYGO] profiles write (non bloquant):', r2.error.message || r2.error);
          }
          return r2;
        });
      }
      return res;
    }).catch(function (e) {
      console.warn('[AUPYGO] profiles write catch:', e);
    });
  }
  window.aupygoSafeProfileWrite = safeProfileWrite;

  function patchSetOnlineStatus() {
    if (typeof window.setOnlineStatus !== 'function' || window._sbfOnlinePatched) return;
    window._sbfOnlinePatched = true;
    window.setOnlineStatus = async function (online) {
      var cu = window.currentUser || (typeof currentUser !== 'undefined' ? currentUser : null);
      if (!cu || !cu.id) return;
      try {
        if (typeof isAdmin === 'function' && isAdmin()) return;
      } catch (e) {}
      try {
        var payload = { is_online: !!online };
        if (online) payload.last_seen = new Date().toISOString();
        await safeProfileWrite(payload);
        var list = window.profiles || (typeof profiles !== 'undefined' ? profiles : []);
        var me = list.find(function (p) { return p && p.id === cu.id; });
        if (me) {
          me.is_online = !!online;
          if (online) me.last_seen = payload.last_seen;
        }
        if (typeof renderMarkers === 'function' && window.map) renderMarkers();
        if (typeof updateOnlineCount === 'function') updateOnlineCount();
      } catch (e) {
        console.warn('[AUPYGO] setOnlineStatus safe:', e);
      }
    };
  }

  function patchGeoUpsert() {
    var client = window.supabaseClient || window.supabase;
    if (!client || client._sbfFromPatched) return;
    try {
      var origFrom = client.from.bind(client);
      client.from = function (table) {
        var q = origFrom(table);
        if (table !== 'profiles') return q;
        var origUpsert = q.upsert ? q.upsert.bind(q) : null;
        if (!origUpsert) return q;
        q.upsert = function (rows, opts) {
          try {
            var row = Array.isArray(rows) ? rows[0] : rows;
            if (row && row.id) {
              var id = row.id;
              var body = Object.assign({}, row);
              return origFrom('profiles').update(body).eq('id', id).then(function (res) {
                if (res && res.error) {
                  return origUpsert(rows, opts || { onConflict: 'id' });
                }
                return res;
              });
            }
          } catch (e) {}
          return origUpsert(rows, opts);
        };
        return q;
      };
      client._sbfFromPatched = true;
    } catch (e) {
      console.warn('[AUPYGO] patch geo upsert:', e);
    }
  }

  /* ---------- 3. Dark mode staff ---------- */
  function injectStaffDarkCss() {
    if (document.getElementById('sbf-staff-dark')) return;
    var st = document.createElement('style');
    st.id = 'sbf-staff-dark';
    st.textContent = [
      'html[data-theme="dark"] #staffQuickMenu {',
      '  background: var(--d-surface, #1e1b2e) !important;',
      '  border-color: var(--d-border, #3a3452) !important;',
      '  box-shadow: 0 12px 40px rgba(0,0,0,.45) !important;',
      '  color: var(--d-text, #e2e8f0) !important;',
      '}',
      'html[data-theme="dark"] .staff-qitem { color: var(--d-text, #e2e8f0) !important; }',
      'html[data-theme="dark"] .staff-qitem:hover { background: var(--d-surface-2, #2a2540) !important; }',
      'html[data-theme="dark"] #staffHeaderBtn {',
      '  background: #1a1035 !important;',
      '  border-color: #6d4aff !important;',
      '  color: #e9e5ff !important;',
      '}',
      'html[data-theme="dark"] #headerMessagesBtn {',
      '  background: var(--d-surface-2, #2a2540) !important;',
      '  border-color: var(--d-border, #3a3452) !important;',
      '  color: var(--d-text, #e2e8f0) !important;',
      '}',
      'html[data-theme="dark"] .more-sheet-list,',
      'html[data-theme="dark"] .more-sheet,',
      'html[data-theme="dark"] #moreSheet {',
      '  background: var(--d-surface, #1e1b2e) !important;',
      '  color: var(--d-text, #e2e8f0) !important;',
      '  border-color: var(--d-border, #3a3452) !important;',
      '}',
      'html[data-theme="dark"] .more-sheet-item { color: var(--d-text, #e2e8f0) !important; }',
      'html[data-theme="dark"] .more-sheet-item:hover { background: var(--d-surface-2, #2a2540) !important; }',
      'html[data-theme="dark"] #admin, html[data-theme="dark"] #administration,',
      'html[data-theme="dark"] [id*="admin"] .card, html[data-theme="dark"] .admin-panel {',
      '  background: var(--d-surface, #1e1b2e) !important;',
      '  color: var(--d-text, #e2e8f0) !important;',
      '}',
      'html[data-theme="dark"] body .btn.btn-secondary.aupygo-btn-descriptif {',
      '  background: #ffffff !important;',
      '  color: #5b21b6 !important;',
      '}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function boot() {
    patchLoadUnreadCounts();
    patchSetOnlineStatus();
    patchGeoUpsert();
    injectStaffDarkCss();
  }

  boot();
  setTimeout(boot, 400);
  setTimeout(boot, 1200);
  setTimeout(boot, 3000);

  console.log('[AUPYGO] staff-bugfix.js — unread null-safe + profiles 400 + dark staff');
})();
