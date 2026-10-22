/* AUPYGO — events-region-filter.js
 * Les users ne voient que les événements de leur région (pays d'accueil / pays / proximité GPS).
 * Staff / Amiral / Admin voient tout.
 */
(function () {
  'use strict';

  var RADIUS_KM = 120;

  function isPrivileged() {
    try {
      if (typeof isStaff === 'function' && isStaff()) return true;
      if (typeof isAdmin === 'function' && isAdmin()) return true;
      if (typeof isAmiral === 'function' && isAmiral()) return true;
    } catch (e) {}
    return false;
  }

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getViewer() {
    var p = window.currentUserProfile || null;
    if (!p && window.currentUser) {
      p = (window.profiles || []).find(function (x) {
        return x && x.id === window.currentUser.id;
      }) || null;
    }
    var loc = window.userLocation || {};
    return {
      country: norm(p && (p.host_country || p.country)),
      city: norm(p && p.city),
      lat: loc.lat != null ? Number(loc.lat) : (p && p.approx_lat != null ? Number(p.approx_lat) : null),
      lng: loc.lng != null ? Number(loc.lng) : (p && p.approx_lng != null ? Number(p.approx_lng) : null)
    };
  }

  function extractEventCountry(ev) {
    if (!ev) return '';
    var m = String(ev.description || '').match(/\[HOST_COUNTRY:([^\]]+)\]/i);
    if (m) return norm(m[1]);
    var creator = (window.profiles || []).find(function (p) { return p && p.id === ev.creator_id; });
    if (creator) return norm(creator.host_country || creator.country);
    var addr = norm(ev.address);
    var countries = [
      'france', 'suisse', 'switzerland', 'belgique', 'belgium', 'canada',
      'espagne', 'spain', 'italie', 'italy', 'allemagne', 'germany',
      'portugal', 'royaume-uni', 'united kingdom', 'uk', 'irlande', 'ireland',
      'autriche', 'austria', 'pays-bas', 'netherlands', 'luxembourg'
    ];
    for (var i = 0; i < countries.length; i++) {
      if (addr.indexOf(countries[i]) !== -1) return countries[i];
    }
    return '';
  }

  function extractEventCity(ev) {
    if (!ev) return '';
    var creator = (window.profiles || []).find(function (p) { return p && p.id === ev.creator_id; });
    if (creator && creator.city) return norm(creator.city);
    var addr = norm(ev.address);
    if (addr) {
      var part = addr.split(',')[0];
      if (part && part.length > 2) return part;
    }
    return '';
  }

  function haversineKm(lat1, lng1, lat2, lng2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function eventInViewerRegion(ev, viewer) {
    if (!ev) return false;
    if (window.currentUser && ev.creator_id === window.currentUser.id) return true;
    var parts = ev.event_participants || [];
    if (window.currentUser && parts.some(function (p) {
      return (p.user_id || p) === window.currentUser.id;
    })) return true;

    var evCountry = extractEventCountry(ev);
    var evCity = extractEventCity(ev);

    if (viewer.country && evCountry) {
      if (viewer.country === evCountry ||
          viewer.country.indexOf(evCountry) !== -1 ||
          evCountry.indexOf(viewer.country) !== -1) {
        return true;
      }
      return false;
    }

    if (viewer.city && evCity) {
      if (viewer.city === evCity ||
          viewer.city.indexOf(evCity) !== -1 ||
          evCity.indexOf(viewer.city) !== -1) {
        return true;
      }
    }

    var evLat = ev.approx_lat != null ? Number(ev.approx_lat) : (ev.lat != null ? Number(ev.lat) : null);
    var evLng = ev.approx_lng != null ? Number(ev.approx_lng) : (ev.lng != null ? Number(ev.lng) : null);
    if (viewer.lat != null && viewer.lng != null && evLat != null && evLng != null &&
        !isNaN(viewer.lat) && !isNaN(viewer.lng) && !isNaN(evLat) && !isNaN(evLng)) {
      return haversineKm(viewer.lat, viewer.lng, evLat, evLng) <= RADIUS_KM;
    }

    var addr = norm(ev.address);
    if (viewer.city && addr && addr.indexOf(viewer.city) !== -1) return true;
    if (viewer.country && addr && addr.indexOf(viewer.country) !== -1) return true;

    if (!viewer.country && !viewer.city && (viewer.lat == null)) return true;
    if (!evCountry && !evCity && evLat == null) return true;

    if (viewer.country || viewer.city) return false;
    return true;
  }

  function filterEventsForUser(list) {
    if (!Array.isArray(list)) return list || [];
    if (isPrivileged()) return list;
    var viewer = getViewer();
    return list.filter(function (ev) {
      return eventInViewerRegion(ev, viewer);
    });
  }
  window.aupygoFilterEventsByRegion = filterEventsForUser;

  function applyFilter() {
    if (isPrivileged()) return;
    if (!Array.isArray(window.cachedEvents)) return;
    var before = window.cachedEvents.length;
    window.cachedEvents = filterEventsForUser(window.cachedEvents);
    if (window.cachedEvents.length !== before) {
      console.log('[AUPYGO] events region filter:', before, '→', window.cachedEvents.length);
    }
  }

  function patchLoad() {
    if (typeof window.loadAndRenderEvents !== 'function' || window._regionFilterPatched) return;
    window._regionFilterPatched = true;
    var orig = window.loadAndRenderEvents;
    window.loadAndRenderEvents = async function () {
      var r = await orig.apply(this, arguments);
      applyFilter();
      try {
        if (!isPrivileged() && typeof window.renderEventsAgenda === 'function') {
          var grid = document.getElementById('eventGrid');
          if (grid && Array.isArray(window.cachedEvents)) {
            var locked = (window.currentPlan || (typeof currentPlan !== 'undefined' ? currentPlan : 'FREE')) === 'FREE';
            var dayFn = typeof getEventsForSelectedDay === 'function'
              ? getEventsForSelectedDay(window.cachedEvents)
              : window.cachedEvents;
            if (!dayFn.length) {
              grid.innerHTML = '<p class="footer-muted" style="grid-column:1/-1;padding:16px">Aucune sortie près de ta région pour le moment.</p>';
            } else if (typeof buildEventCardHtml === 'function') {
              grid.innerHTML = dayFn.map(function (ev) {
                return buildEventCardHtml(ev, locked);
              }).join('');
            }
            if (typeof renderSpecialEventsHero === 'function') renderSpecialEventsHero(window.cachedEvents);
            if (typeof renderEventsAgenda === 'function') renderEventsAgenda(window.cachedEvents);
            if (typeof renderCommunityAgenda === 'function') renderCommunityAgenda(window.cachedEvents);
            if (typeof renderPersonalAgenda === 'function') renderPersonalAgenda(window.cachedEvents);
            if (typeof updateMyAgendaList === 'function') updateMyAgendaList();
          }
        }
      } catch (e) {
        console.warn('[AUPYGO] region re-render', e);
      }
      return r;
    };
  }

  function boot() {
    patchLoad();
    applyFilter();
  }
  boot();
  setTimeout(boot, 500);
  setTimeout(boot, 1500);
  setTimeout(boot, 3500);

  console.log('[AUPYGO] events-region-filter.js — users = région / staff = tout');
})();
