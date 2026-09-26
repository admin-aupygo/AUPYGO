/* AUPYGO staff-visibility.js
 * - loadProfiles : staff voit les autres staff
 * - Admin peut ouvrir un DM vers un staff depuis la fiche
 * - Staff : lecture seule sur users
 */
(function () {
  'use strict';
  if (typeof isStaff !== 'function') return;

  function isMemberStaffProfile(p) {
    if (typeof window.isMemberStaffProfile === 'function') return window.isMemberStaffProfile(p);
    if (!p) return false;
    if (p.is_admin === true) return true;
    var r = (typeof window.normalizeStaffRole === 'function')
      ? window.normalizeStaffRole(p.role)
      : (p.role || '').toLowerCase();
    return ['amiral','major_staff','sergent_staff','major_moderateur','sergent_moderateur'].indexOf(r) !== -1;
  }

  var _origLoad = window.loadProfiles;
  if (typeof _origLoad === 'function' && !window._staffVisLoadPatched) {
    window._staffVisLoadPatched = true;
    window.loadProfiles = async function () {
      await _origLoad.apply(this, arguments);

      if (!isStaff() || !window.currentUser) return;

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
          if (byId[p.id]) {
            byId[p.id].role = p.role;
            byId[p.id].is_admin = p.is_admin;
            byId[p.id].is_online = p.is_online;
          } else if (isMemberStaffProfile(p)) {
            byId[p.id] = p;
          }
        });

        window.profiles = Object.keys(byId).map(function (k) { return byId[k]; });
        if (typeof renderMarkers === 'function') renderMarkers();
        if (typeof updateOnlineCount === 'function') updateOnlineCount();
      } catch (e) {
        console.warn('[Staff] visibility load', e);
      }
    };
  }

  var _origOpen = window.openMemberProfile;
  if (typeof _origOpen === 'function' && !window._staffVisOpenPatched) {
    window._staffVisOpenPatched = true;
    window.openMemberProfile = function (memberId, opts) {
      var target = (window.profiles || []).find(function (p) { return p && p.id === memberId; });
      var targetIsStaff = isMemberStaffProfile(target);
      var admin = typeof isAdmin === 'function' && isAdmin();

      if (!isStaff()) {
        return _origOpen(memberId, opts);
      }

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

      _origOpen(memberId);
      setTimeout(function () {
        var box = document.getElementById('memberModal');
        if (!box) return;
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

  setTimeout(function () {
    if (isStaff() && typeof loadProfiles === 'function') {
      loadProfiles();
    }
  }, 2000);

  console.log('[AUPYGO] staff-visibility.js (rôles officiels)');
})();
