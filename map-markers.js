/* AUPYGO map-markers.js
 * Privacy: positions always on ~1 km grid. Never exact GPS.
 *
 * Staff :
 *  - Users ne voient pas les marqueurs Staff
 *  - Staff voit les autres Staff en NOIR
 *  - Pastille : vert = en ligne, rouge = hors ligne
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

  function isMemberStaff(p) {
    if (!p) return false;
    if (p.is_admin === true) return true;
    var r = (typeof window.normalizeStaffRole === 'function')
      ? window.normalizeStaffRole(p.role)
      : String(p.role || '').toLowerCase();
    if (['host', 'moderator', 'admin_general', 'admin'].indexOf(String(p.role || '').toLowerCase()) !== -1) return true;
    return ['amiral', 'major_staff', 'sergent_staff', 'major_moderateur', 'sergent_moderateur'].indexOf(r) !== -1;
  }

  function viewerIsStaff() {
    if (typeof isStaff === 'function') return isStaff();
    if (typeof isAdmin === 'function' && isAdmin()) return true;
    return false;
  }

  function memberIsOnline(member) {
    if (!member) return false;
    if (member.is_online === true) return true;
    if (typeof isRecentlyOnline === 'function') {
      try { return !!isRecentlyOnline(member); } catch (e) {}
    }
    if (member.last_seen) {
      var t = new Date(member.last_seen).getTime();
      if (!isNaN(t) && (Date.now() - t) < 15 * 60 * 1000) return true;
    }
    return false;
  }

  /** Icône : staff noir + classe online/offline pour la pastille */
  function createStaffIcon(gender, online) {
    var emoji = gender === 'Homme' ? '👨' : (gender === 'Femme' ? '👩' : '🛡️');
    var statusCls = online ? 'staff-online' : 'staff-offline';
    var cls = 'aupy-marker staff ' + statusCls;
    return L.divIcon({
      className: '',
      html: '<div class="' + cls + '">' + emoji + '<span class="status-dot"></span></div>',
      iconSize: [44, 44],
      iconAnchor: [22, 44]
    });
  }

  window.renderMarkers = function renderMarkers() {
    if (typeof markersLayer === 'undefined' || !markersLayer) return;
    if (typeof L === 'undefined') return;
    markersLayer.clearLayers();

    var maxKm = (!currentUser) ? null : (typeof RADIUS !== 'undefined' ? RADIUS[currentPlan] : null);
    var list = (Array.isArray(profiles) ? profiles : []).filter(function (p) {
      return p && p.approx_lat != null && p.approx_lng != null &&
        !Number.isNaN(Number(p.approx_lat)) && !Number.isNaN(Number(p.approx_lng));
    });

    // Users : jamais de marqueurs Staff
    if (!viewerIsStaff()) {
      list = list.filter(function (p) {
        if (currentUser && p.id === currentUser.id) return true;
        return !isMemberStaff(p);
      });
    }

    if (currentUser && typeof userLocation !== 'undefined' && userLocation && userLocation.hasRealGeo) {
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
      if (viewerIsStaff()) return true;
      if (typeof userLocation === 'undefined' || !userLocation) return true;
      if (typeof distanceKm !== 'function') return true;
      return distanceKm(
        userLocation.lat, userLocation.lng,
        member.approx_lat, member.approx_lng
      ) <= maxKm;
    });

    var groups = {};
    list.forEach(function (member) {
      var snap = privacySnap(member.approx_lat, member.approx_lng);
      var isMe = currentUser && member.id === currentUser.id;
      if (isMe && typeof userLocation !== 'undefined' && userLocation && userLocation.hasRealGeo) {
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

        var icon;
        var zOff = index;

        if (isMe) {
          // Toi : marqueur « me » (bleu) habituel
          icon = (typeof createIcon === 'function')
            ? createIcon(member.gender, 'me')
            : createStaffIcon(member.gender, true);
          zOff = 1000;
        } else if (isMemberStaff(member) && viewerIsStaff()) {
          // Autre Staff → NOIR + pastille vert/rouge
          var online = memberIsOnline(member);
          icon = createStaffIcon(member.gender, online);
          zOff = 800;
        } else if (typeof createIcon === 'function' && typeof getMarkerKind === 'function') {
          icon = createIcon(member.gender, getMarkerKind(member));
        } else if (typeof createIcon === 'function') {
          icon = createIcon(member.gender, memberIsOnline(member) ? 'online' : 'offline');
        } else {
          icon = createStaffIcon(member.gender, memberIsOnline(member));
        }

        var m = L.marker([pos[0], pos[1]], {
          icon: icon,
          zIndexOffset: zOff
        });
        m.on('click', function () {
          if (!currentUser) {
            if (typeof showToast === 'function') showToast(typeof t === 'function' ? t('map.login_required') : 'Connexion requise', 'error');
            if (typeof go === 'function') go('plans');
            return;
          }
          if (isMe) {
            if (typeof showToast === 'function') {
              showToast('📍 C’est toi — position approximative (~1 km), jamais exacte', 'success');
            }
            return;
          }
          if (typeof openMemberProfile === 'function') {
            openMemberProfile(member.id);
          }
        });
        markersLayer.addLayer(m);
      });
    });
  };

  // Styles Staff : fond noir + pastille vert/rouge
  var styleId = 'staffMarkerStyle';
  var existing = document.getElementById(styleId);
  if (existing) existing.remove();
  var st = document.createElement('style');
  st.id = styleId;
  st.textContent = [
    '.aupy-marker.staff {',
    '  background: linear-gradient(135deg, #1f2937, #0a0a0a) !important;',
    '  box-shadow: 0 3px 14px rgba(0, 0, 0, 0.55) !important;',
    '  border: 2px solid #111 !important;',
    '  color: #fff !important;',
    '}',
    '.aupy-marker.staff .status-dot {',
    '  width: 10px !important;',
    '  height: 10px !important;',
    '  border: 2px solid #fff !important;',
    '  border-radius: 50% !important;',
    '  position: absolute !important;',
    '  right: 2px !important;',
    '  bottom: 2px !important;',
    '}',
    /* Vert = en ligne */
    '.aupy-marker.staff.staff-online .status-dot {',
    '  background: #22c55e !important;',
    '  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.35) !important;',
    '}',
    /* Rouge = hors ligne */
    '.aupy-marker.staff.staff-offline .status-dot {',
    '  background: #ef4444 !important;',
    '  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.3) !important;',
    '}'
  ].join('\n');
  document.head.appendChild(st);

  try {
    if (typeof map !== 'undefined' && map && typeof markersLayer !== 'undefined' && markersLayer) {
      window.renderMarkers();
    }
  } catch (e) {
    console.warn('map-markers init', e);
  }

  console.log('[AUPYGO] map-markers.js (Staff noir + pastille vert/rouge)');
})();
