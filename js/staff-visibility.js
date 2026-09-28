/* AUPYGO staff-visibility.js v2
 * Règles :
 * - Users : ne voient PAS Staff/Amiral (liste, carte, recherche)
 * - Users : ne peuvent PAS demander en amis un Staff/Amiral
 * - Staff : voient les users en lecture seule (pas d'amis)
 * - Amiral : peut message un Staff depuis la fiche
 */
(function () {
  'use strict';

  function isStaffViewer() {
    return typeof isStaff === 'function' && isStaff();
  }

  function isMemberStaffProfile(p) {
    if (typeof window.isMemberStaffProfile === 'function') return window.isMemberStaffProfile(p);
    if (!p) return false;
    if (p.is_admin === true) return true;
    var r = (typeof window.normalizeStaffRole === 'function')
      ? window.normalizeStaffRole(p.role)
      : String(p.role || '').toLowerCase();
    if (['host', 'moderator', 'admin_general', 'admin'].indexOf(r) !== -1) return true;
    return ['amiral', 'major_staff', 'sergent_staff', 'major_moderateur', 'sergent_moderateur'].indexOf(r) !== -1;
  }

  /** Filtre window.profiles : un user ne conserve aucun Staff/Amiral */
  function filterStaffOutForUsers() {
    if (isStaffViewer()) return;
    if (!Array.isArray(window.profiles)) return;
    var before = window.profiles.length;
    window.profiles = window.profiles.filter(function (p) {
      if (!p) return false;
      // garder soi-même au cas où
      if (window.currentUser && p.id === window.currentUser.id) return true;
      return !isMemberStaffProfile(p);
    });
    if (window.profiles.length !== before) {
      if (typeof renderMarkers === 'function') renderMarkers();
      if (typeof updateOnlineCount === 'function') updateOnlineCount();
    }
  }

  /** Enrichit les rôles puis filtre pour les users */
  async function enrichAndFilter() {
    try {
      if (!Array.isArray(window.profiles) || !window.profiles.length) return;
      var ids = window.profiles.map(function (p) { return p && p.id; }).filter(Boolean);
      if (!ids.length) return;

      var res = await (window.supabaseClient || window.supabase)
        .from('profiles')
        .select('id, role, is_admin')
        .in('id', ids.slice(0, 400));

      if (res.data && res.data.length) {
        var map = {};
        res.data.forEach(function (r) { map[r.id] = r; });
        window.profiles.forEach(function (p) {
          if (p && map[p.id]) {
            p.role = map[p.id].role;
            p.is_admin = map[p.id].is_admin;
          }
        });
      }
    } catch (e) {
      console.warn('[Staff] enrich roles', e);
    }

    if (isStaffViewer() && window.currentUser) {
      // Staff : s'assurer de voir les autres staff
      try {
        var res2 = await (window.supabaseClient || window.supabase)
          .from('profiles')
          .select('id, display_name, age, gender, city, country, host_country, stay_end, languages, interests, bio, subscription, last_seen, approx_lat, approx_lng, is_admin, role, is_online')
          .limit(500);
        if (res2.data) {
          var byId = {};
          (window.profiles || []).forEach(function (p) {
            if (p && p.id) byId[p.id] = p;
          });
          res2.data.forEach(function (p) {
            if (!p || !p.id) return;
            if (byId[p.id]) {
              byId[p.id].role = p.role;
              byId[p.id].is_admin = p.is_admin;
              byId[p.id].is_online = p.is_online;
            } else if (isMemberStaffProfile(p)) {
              byId[p.id] = p;
            }
          });
          window.profiles = Object.keys(byId).map(function (k) { return byId[k]; });
        }
      } catch (e2) {}
      if (typeof renderMarkers === 'function') renderMarkers();
      if (typeof updateOnlineCount === 'function') updateOnlineCount();
      return;
    }

    // User : retirer tout le Staff
    filterStaffOutForUsers();
  }

  // --- loadProfiles ---
  var _origLoad = window.loadProfiles;
  if (typeof _origLoad === 'function' && !window._staffVisLoadPatched) {
    window._staffVisLoadPatched = true;
    window.loadProfiles = async function () {
      await _origLoad.apply(this, arguments);
      await enrichAndFilter();
    };
  }

  // --- openMemberProfile ---
  var _origOpen = window.openMemberProfile;
  if (typeof _origOpen === 'function' && !window._staffVisOpenPatched) {
    window._staffVisOpenPatched = true;
    window.openMemberProfile = function (memberId, opts) {
      var target = (window.profiles || []).find(function (p) { return p && p.id === memberId; });

      // Si le profil n'est pas en cache, on laisse ouvrir puis on corrige après
      // User → Staff : bloquer
      if (!isStaffViewer() && target && isMemberStaffProfile(target)) {
        if (typeof showToast === 'function') {
          showToast('Profil non disponible', 'error');
        }
        return;
      }

      if (!isStaffViewer()) {
        return _origOpen(memberId, opts);
      }

      var targetIsStaff = isMemberStaffProfile(target);
      var admin = typeof isAdmin === 'function' && isAdmin();

      if (!targetIsStaff) {
        // Staff regarde un user : lecture seule
        _origOpen(memberId, { readOnly: true });
        setTimeout(function () {
          var box = document.getElementById('memberModal');
          if (!box) return;
          box.querySelectorAll(
            '.member-msg-btn, .member-friend-btn, button[onclick*="Friend"], button[onclick*="friend"], button[onclick*="Message"], button[onclick*="message"], button[onclick*="messageMember"], button[onclick*="sendFriend"]'
          ).forEach(function (btn) { btn.style.display = 'none'; });
          if (!box.querySelector('.staff-readonly-badge')) {
            var badge = document.createElement('div');
            badge.className = 'staff-readonly-badge';
            badge.style.cssText = 'margin-top:12px;font-size:12px;font-weight:700;color:#64748b;background:#f1f5f9;padding:8px 12px;border-radius:10px;';
            badge.textContent = '👁️ Vue lecture seule (staff)';
            box.appendChild(badge);
          }
        }, 80);
        return;
      }

      // Staff regarde un autre staff
      _origOpen(memberId);
      setTimeout(function () {
        var box = document.getElementById('memberModal');
        if (!box) return;
        // Jamais d'amis entre staff via la fiche
        box.querySelectorAll(
          '.member-friend-btn, button[onclick*="Friend"], button[onclick*="friend"], button[onclick*="sendFriend"]'
        ).forEach(function (btn) { btn.style.display = 'none'; });

        var allowMsg = admin;
        var msgBtns = box.querySelectorAll(
          '.member-msg-btn, button[onclick*="Message"], button[onclick*="message"], button[onclick*="messageMember"]'
        );
        if (allowMsg) {
          msgBtns.forEach(function (btn) {
            btn.style.display = '';
            btn.disabled = false;
            btn.onclick = function (e) {
              e.preventDefault();
              if (typeof messageMember === 'function') messageMember(memberId);
            };
          });
        } else {
          msgBtns.forEach(function (btn) { btn.style.display = 'none'; });
        }
      }, 80);
    };
  }

  // --- Bloquer demandes d'amis vers Staff (côté user) ---
  function blockFriendToStaff(fnName) {
    var orig = window[fnName];
    if (typeof orig !== 'function' || orig._staffFriendBlocked) return;
    var wrapped = function (memberId) {
      var id = memberId;
      if (id && typeof id === 'object') id = id.id || id.userId || id.targetId;
      var target = (window.profiles || []).find(function (p) { return p && p.id === id; });
      // Si pas en cache, tenter une lecture rapide synchrone impossible → bloquer si role déjà connu
      if (!isStaffViewer() && target && isMemberStaffProfile(target)) {
        if (typeof showToast === 'function') {
          showToast('Impossible d\'ajouter un membre Staff en amis', 'error');
        }
        return;
      }
      // Double check async si besoin
      if (!isStaffViewer() && id && !target) {
        var client = window.supabaseClient || window.supabase;
        if (client) {
          return client.from('profiles').select('id, role, is_admin').eq('id', id).maybeSingle()
            .then(function (res) {
              if (res.data && isMemberStaffProfile(res.data)) {
                if (typeof showToast === 'function') {
                  showToast('Impossible d\'ajouter un membre Staff en amis', 'error');
                }
                return;
              }
              return orig.apply(this, arguments);
            }.bind(this));
        }
      }
      return orig.apply(this, arguments);
    };
    wrapped._staffFriendBlocked = true;
    window[fnName] = wrapped;
  }

  ['sendFriendRequest', 'addFriend', 'requestFriend', 'sendFriend', 'toggleFriend'].forEach(blockFriendToStaff);

  // Re-patch plus tard si app.js redéfinit les fonctions
  setTimeout(function () {
    ['sendFriendRequest', 'addFriend', 'requestFriend', 'sendFriend', 'toggleFriend'].forEach(blockFriendToStaff);
  }, 1500);

  // Filtre périodique (sécurité si loadProfiles hors patch)
  setInterval(function () {
    if (!isStaffViewer()) filterStaffOutForUsers();
  }, 3000);

  setTimeout(function () {
    if (typeof loadProfiles === 'function') loadProfiles();
  }, 2000);

  console.log('[AUPYGO] staff-visibility.js v2 (users ne voient pas le Staff)');
})();
