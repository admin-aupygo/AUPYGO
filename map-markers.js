/* AUPYGO — séparation des avatars superposés (même zone ~1 km) */
(function () {
  function offsetForStack(lat, lng, index, total) {
    if (total <= 1) return [lat, lng];
    var radius = 0.00035 + (Math.floor(index / 8) * 0.0002);
    var angle = (2 * Math.PI * index) / Math.max(total, 1);
    return [lat + radius * Math.cos(angle), lng + radius * Math.sin(angle)];
  }

  window.renderMarkers = function renderMarkers() {
    if (typeof markersLayer === 'undefined' || !markersLayer) return;
    markersLayer.clearLayers();

    var maxKm = (!currentUser) ? null : RADIUS[currentPlan];
    var list = (Array.isArray(profiles) ? profiles : []).filter(function (p) {
      return p && p.approx_lat != null && p.approx_lng != null &&
        !Number.isNaN(Number(p.approx_lat)) && !Number.isNaN(Number(p.approx_lng));
    });

    if (currentUser && userLocation.hasRealGeo) {
      var already = list.some(function (p) { return p.id === currentUser.id; });
      if (!already) {
        list.push({
          id: currentUser.id,
          approx_lat: userLocation.lat,
          approx_lng: userLocation.lng,
          gender: typeof selectedGender !== 'undefined' ? selectedGender : null,
          display_name: ((document.getElementById('firstName') || {}).value) || 'Moi',
          is_online: true
        });
      }
    }

    list = list.filter(function (member) {
      var isMe = currentUser && member.id === currentUser.id;
      if (isMe || maxKm == null) return true;
      return distanceKm(userLocation.lat, userLocation.lng, member.approx_lat, member.approx_lng) <= maxKm;
    });

    var groups = {};
    list.forEach(function (member) {
      var lat = Number(member.approx_lat);
      var lng = Number(member.approx_lng);
      var isMe = currentUser && member.id === currentUser.id;
      if (isMe && userLocation.hasRealGeo) {
        lat = userLocation.lat;
        lng = userLocation.lng;
      }
      var key = lat.toFixed(2) + ',' + lng.toFixed(2);
      if (!groups[key]) groups[key] = [];
      groups[key].push({ member: member, lat: lat, lng: lng, isMe: isMe });
    });

    Object.keys(groups).forEach(function (key) {
      var stack = groups[key];
      stack.sort(function (a, b) { return (b.isMe ? 1 : 0) - (a.isMe ? 1 : 0); });
      stack.forEach(function (item, index) {
        var member = item.member;
        var isMe = item.isMe;
        var pos = offsetForStack(item.lat, item.lng, index, stack.length);
        var kind = getMarkerKind(member);
        var m = L.marker([pos[0], pos[1]], {
          icon: createIcon(member.gender, kind),
          zIndexOffset: isMe ? 1000 : index
        });
        m.on('click', function () {
          if (!currentUser) {
            showToast(t('map.login_required'), 'error');
            go('plans');
            return;
          }
          if (isMe) {
            showToast('📍 C’est toi (position approx. ~1 km)', 'success');
            return;
          }
          openMemberProfile(member.id);
        });
        markersLayer.addLayer(m);
      });
    });
  };

  if (typeof map !== 'undefined' && map && typeof markersLayer !== 'undefined' && markersLayer) {
    try { window.renderMarkers(); } catch (e) { console.warn('map-markers init', e); }
  }
})();
