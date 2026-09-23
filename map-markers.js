/* AUPYGO map-markers.js
 * Privacy: positions always on ~1 km grid. Never exact GPS.
 * Overlapping users in the same cell get a small visual offset (~50–80 m)
 * based on a hash of their id (not real relative position).
 *
 * Staff rules (admin_general / host):
 *  - Normal users never see staff markers
 *  - Staff see other staff as black markers
 *  - Staff can see all users (read-only interactions handled elsewhere)
 */
(function () {
  function privacySnap(lat, lng) {
    return {
      lat: Math.round(Number(lat) * 100) / 100,
      lng: Math.round(Number(lng) * 100) / 100
    };
  }

  function hash01(str) {
    var h = 0;
    var s = String(str || '');
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) - h) + s.charCodeAt(i);
      h |= 0;
    }
    return (Math.abs(h) % 10000) / 10000;
  }

  function offsetInCell(lat, lng, id, index, total) {
    if (total <= 1) return [lat, lng];
    var base = 0.00035;
    var radius = base + (Math.floor(index / 8) * 0.0002);
    var angle = (2 * Math.PI * (index + hash01(id))) / Math.max(total, 1);
    return [lat + radius * Math.cos(angle), lng + radius * Math.sin(angle)];
  }

  /** True if this profile is staff (admin or host) */
  function isMemberStaff(p) {
    if (!p) return false;
    if (p.is_admin === true) return true;
    var r = (p.role || '').toLowerCase();
    return r === 'admin_general' || r === 'host' || r === 'admin' || r === 'moderator';
  }

  /** Current viewer is staff */
  function viewerIsStaff() {
    if (typeof isStaff === 'function') return isStaff();
    if (typeof isAdmin === 'function' && isAdmin()) return true;
    return false;
  }

  window.renderMarkers = function renderMarkers() {
    if (typeof markersLayer === 'undefined' || !markersLayer) return;
    if (typeof L === 'undefined') return;
    markersLayer.clearLayers();

    var maxKm = (!currentUser) ? null : RADIUS[currentPlan];
    var list = (Array.isArray(profiles) ? profiles : []).filter(function (p) {
      return p && p.approx_lat != null && p.approx_lng != null &&
        !Number.isNaN(Number(p.approx_lat)) && !Number.isNaN(Number(p.approx_lng));
    });

    // Staff ghost mode: normal users never see staff markers
    if (!viewerIsStaff()) {
      list = list.filter(function (p) {
        // always show self
        if (currentUser && p.id === currentUser.id) return true;
        return !isMemberStaff(p);
      });
    }

    if (currentUser && userLocation && userLocation.hasRealGeo) {
      var already = list.some(function (p) { return p.id === currentUser.id; });
      if (!already) {
        var meSnap = privacySnap(userLocation.lat, userLocation.lng);
        list.push({
          id: currentUser.id,
          approx_lat: meSnap.lat,
          approx_lng: meSnap.lng,
          gender: typeof selectedGender !== 'undefined' ? selectedGender : null,
          display_name: ((document.getElementById('firstName') || {}).value) || 'Moi',
          is_online: true,
          role: window.currentUserRole || null,
          is_admin: typeof isAdmin === 'function' ? isAdmin() : false
        });
      }
    }

    list = list.filter(function (member) {
      var isMe = currentUser && member.id === currentUser.id;
      if (isMe || maxKm == null) return true;
      // Staff: no distance limit (see everyone)
      if (viewerIsStaff()) return true;
      return distanceKm(
        userLocation.lat, userLocation.lng,
        member.approx_lat, member.approx_lng
      ) <= maxKm;
    });

    var groups = {};
    list.forEach(function (member) {
      var snap = privacySnap(member.approx_lat, member.approx_lng);
      var isMe = currentUser && member.id === currentUser.id;
      if (isMe && userLocation && userLocation.hasRealGeo) {
        snap = privacySnap(userLocation.lat, userLocation.lng);
      }
      var key = snap.lat.toFixed(2) + ',' + snap.lng.toFixed(2);
      if (!groups[key]) groups[key] = [];
      groups[key].push({ member: member, lat: snap.lat, lng: snap.lng, isMe: isMe });
    });

    Object.keys(groups).forEach(function (key) {
      var stack = groups[key];
      stack.sort(function (a, b) { return (b.isMe ? 1 : 0) - (a.isMe ? 1 : 0); });
      stack.forEach(function (item, index) {
        var member = item.member;
        var isMe = item.isMe;
        var pos = offsetInCell(item.lat, item.lng, member.id, index, stack.length);

        var kind;
        if (isMe) {
          kind = 'me';
        } else if (isMemberStaff(member) && viewerIsStaff()) {
          // Other staff → black marker for staff viewers
          kind = 'staff';
        } else if (typeof getMarkerKind === 'function') {
          kind = getMarkerKind(member);
        } else {
          kind = 'offline';
        }

        var m = L.marker([pos[0], pos[1]], {
          icon: createIcon(member.gender, kind),
          zIndexOffset: isMe ? 1000 : (kind === 'staff' ? 800 : index)
        });
        m.on('click', function () {
          if (!currentUser) {
            showToast(t('map.login_required'), 'error');
            go('plans');
            return;
          }
          if (isMe) {
            showToast('📍 C’est toi — position approximative (~1 km), jamais exacte', 'success');
            return;
          }
          // Staff viewer: read-only view
          if (viewerIsStaff()) {
            if (typeof openMemberProfile === 'function') {
              openMemberProfile(member.id, { readOnly: true });
            } else {
              showToast('Vue lecture seule (staff)', 'success');
            }
            return;
          }
          openMemberProfile(member.id);
        });
        markersLayer.addLayer(m);
      });
    });
  };

  // Inject staff marker style once
  if (!document.getElementById('staffMarkerStyle')) {
    var st = document.createElement('style');
    st.id = 'staffMarkerStyle';
    st.textContent = [
      '.aupy-marker.staff {',
      '  background: linear-gradient(135deg, #1f2937, #111827) !important;',
      '  box-shadow: 0 3px 14px rgba(17, 24, 39, 0.5) !important;',
      '  border-color: #374151 !important;',
      '}',
      '.aupy-marker.staff .status-dot { background: #9ca3af !important; box-shadow: none !important; }'
    ].join('\n');
    document.head.appendChild(st);
  }

  try {
    if (typeof map !== 'undefined' && map && typeof markersLayer !== 'undefined' && markersLayer) {
      window.renderMarkers();
    }
  } catch (e) {
    console.warn('map-markers init', e);
  }
})();
