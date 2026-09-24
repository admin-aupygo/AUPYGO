/* AUPYGO staff-visibility.js
 * - loadProfiles : staff voit les autres staff (sinon filtrés par Mode Fantôme)
 * - Admin peut ouvrir un DM vers un staff depuis la fiche
 * - Host : lecture seule sur users, DM Admin seulement
 */
(function () {
  'use strict';
  if (typeof isStaff !== 'function') return;

  function isMemberStaffProfile(p) {
    if (!p) return false;
    if (p.is_admin === true) return true;
    var r = (p.role || '').toLowerCase();
    return r === 'admin_general' || r === 'host' || r === 'admin' || r === 'moderator';
  }

  // ---------- loadProfiles : ne plus retirer les staff pour les viewers staff ----------
  var _origLoad = window.loadProfiles;
  if (typeof _origLoad === 'function' && !window._staffVisLoadPatched) {
    window._staffVisLoadPatched = true;
    window.loadProfiles = async function () {
      await _origLoad.apply(this, arguments);

      if (!isStaff() || !window.currentUser) return;

      // Recharger avec role + is_admin pour enrichir / réinjecter les staff manquants
      try {
        var res = await supabaseClient
          .from('profiles')
          .select('id, display_name, age, gender, city, country, host_country, stay_end, languages, interests, bio, subscription, last_seen, approx_lat, approx_lng, is_admin, role, is_online')
          .limit(500);
        if (res.error || !res.data) return;

        var byId = {};
        (window.profiles || []).forEach(function (p) {
          if (p && p.id) byId[p.id] = p;
        });

        res.data.forEach(function (p) {
          if (!p || !p.id) return;
          // Toujours enrichir role / is_admin
          if (byId[p.id]) {
            byId[p.id].role = p.role;
            byId[p.id].is_admin = p.is_admin;
            byId[p.id].is_online = p.is_online;
          } else {
            // Staff absents du Mode Fantôme → les rajouter pour viewer staff
            if (isMemberStaffProfile(p)) {
              byId[p.id] = p;
            }
          }
        });

        window.profiles = Object.keys(byId).map(function (k) { return byId[k]; });
        if (typeof renderMarkers === 'function') renderMarkers();
        if (typeof updateOnlineCount === 'function') updateOnlineCount();
        console.log('[Staff] profils staff réinjectés, total:', window.profiles.length);
      } catch (e) {
        console.warn('[Staff] visibility load', e);
      }
    };
  }

  // ---------- Fiche membre : Admin peut messager le Staff ----------
  var _origOpen = window.openMemberProfile;
  if (typeof _origOpen === 'function' && !window._staffVisOpenPatched) {
    window._staffVisOpenPatched = true;
    window.openMemberProfile = function (memberId, opts) {
      var target = (window.profiles || []).find(function (p) { return p && p.id === memberId; });
      var targetIsStaff = isMemberStaffProfile(target);
      var admin = typeof isAdmin === 'function' && isAdmin();
      var host = typeof isHost === 'function' && isHost();

      // Users classiques : comportement normal (sauf cible staff bloquée ailleurs)
      if (!isStaff()) {
        return _origOpen(memberId, opts);
      }

      // Staff regarde un user : lecture seule
      if (!targetIsStaff) {
        _origOpen(memberId, { readOnly: true });
        setTimeout(function () {
          var box = document.getElementById('memberModal');
          if (!box) return;
          box.querySelectorAll(
            '.member-msg-btn, .member-friend-btn, button[onclick*="Friend"], button[onclick*="friend"], button[onclick*="Message"], button[onclick*="message"], button[onclick*="messageMember"]'
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
        // Pas d'amitié entre staff
        box.querySelectorAll(
          '.member-friend-btn, button[onclick*="Friend"], button[onclick*="friend"], button[onclick*="sendFriend"]'
        ).forEach(function (btn) { btn.style.display = 'none'; });

        // Message : Admin → n'importe quel staff ; Host → uniquement admin_general
        var allowMsg = false;
        if (admin) allowMsg = true;
        if (host && target && (target.role === 'admin_general' || target.is_admin === true)) allowMsg = true;

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
          // Si aucun bouton message, en injecter un
          if (!msgBtns.length) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-primary member-msg-btn';
            b.style.marginTop = '10px';
            b.textContent = '💬 Message';
            b.onclick = function () {
              if (typeof messageMember === 'function') messageMember(memberId);
            };
            box.appendChild(b);
          }
        } else {
          msgBtns.forEach(function (btn) { btn.style.display = 'none'; });
        }
      }, 80);
    };
  }

  // Recharger une fois si déjà staff connecté
  setTimeout(function () {
    if (isStaff() && typeof loadProfiles === 'function') {
      loadProfiles();
    }
  }, 2000);

  console.log('[AUPYGO] staff-visibility.js chargé');
})();
