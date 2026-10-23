/* AUPYGO — events-region-filter.js
 * Filtre par VILLE DU PROFIL (pas GPS live) + rayon ~100 km.
 * Staff / Amiral / Admin voient tout.
 */
(function () {
  'use strict';

  var RADIUS_KM = 100;

  /* Coordonnées approximatives des villes courantes (centre = profil.city) */
  var CITY_COORDS = {
    'barcelona': [41.3874, 2.1686],
    'barcelone': [41.3874, 2.1686],
    'paris': [48.8566, 2.3522],
    'lyon': [45.7640, 4.8357],
    'marseille': [43.2965, 5.3698],
    'toulouse': [43.6047, 1.4442],
    'nice': [43.7102, 7.2620],
    'bordeaux': [44.8378, -0.5792],
    'nantes': [47.2184, -1.5536],
    'lille': [50.6292, 3.0573],
    'strasbourg': [48.5734, 7.7521],
    'montpellier': [43.6108, 3.8767],
    'rennes': [48.1173, -1.6778],
    'geneve': [46.2044, 6.1432],
    'geneva': [46.2044, 6.1432],
    'lausanne': [46.5197, 6.6323],
    'zurich': [47.3769, 8.5417],
    'berne': [46.9480, 7.4474],
    'bern': [46.9480, 7.4474],
    'bale': [47.5596, 7.5886],
    'basel': [47.5596, 7.5886],
    'bruxelles': [50.8503, 4.3517],
    'brussels': [50.8503, 4.3517],
    'anvers': [51.2194, 4.4025],
    'antwerp': [51.2194, 4.4025],
    'liege': [50.6326, 5.5797],
    'montreal': [45.5017, -73.5673],
    'quebec': [46.8139, -71.2080],
    'toronto': [43.6532, -79.3832],
    'vancouver': [49.2827, -123.1207],
    'madrid': [40.4168, -3.7038],
    'valence': [39.4699, -0.3763],
    'valencia': [39.4699, -0.3763],
    'seville': [37.3891, -5.9845],
    'sevilla': [37.3891, -5.9845],
    'bilbao': [43.2630, -2.9350],
    'malaga': [36.7213, -4.4214],
    'lisbonne': [38.7223, -9.1393],
    'lisbon': [38.7223, -9.1393],
    'porto': [41.1579, -8.6291],
    'rome': [41.9028, 12.4964],
    'roma': [41.9028, 12.4964],
    'milan': [45.4642, 9.1900],
    'milano': [45.4642, 9.1900],
    'turin': [45.0703, 7.6869],
    'florence': [43.7696, 11.2558],
    'napoli': [40.8518, 14.2681],
    'naples': [40.8518, 14.2681],
    'berlin': [52.5200, 13.4050],
    'munich': [48.1351, 11.5820],
    'hambourg': [53.5511, 9.9937],
    'hamburg': [53.5511, 9.9937],
    'cologne': [50.9375, 6.9603],
    'koln': [50.9375, 6.9603],
    'francfort': [50.1109, 8.6821],
    'frankfurt': [50.1109, 8.6821],
    'amsterdam': [52.3676, 4.9041],
    'rotterdam': [51.9244, 4.4777],
    'londres': [51.5074, -0.1278],
    'london': [51.5074, -0.1278],
    'manchester': [53.4808, -2.2426],
    'dublin': [53.3498, -6.2603],
    'vienne': [48.2082, 16.3738],
    'vienna': [48.2082, 16.3738],
    'luxembourg': [49.6116, 6.1319],
    'monaco': [43.7384, 7.4246],
    'andorre': [42.5063, 1.5218],
    'andorra': [42.5063, 1.5218]
  };

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

  function coordsForCity(cityName) {
    var n = norm(cityName);
    if (!n) return null;
    if (CITY_COORDS[n]) return CITY_COORDS[n];
    var keys = Object.keys(CITY_COORDS);
    for (var i = 0; i < keys.length; i++) {
      if (n.indexOf(keys[i]) !== -1 || keys[i].indexOf(n) !== -1) {
        return CITY_COORDS[keys[i]];
      }
    }
    return null;
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

  /** Ville du profil uniquement — JAMAIS le GPS live */
  function getViewerCity() {
    var p = window.currentUserProfile || null;
    if (!p && window.currentUser) {
      p = (window.profiles || []).find(function (x) {
        return x && x.id === window.currentUser.id;
      }) || null;
    }
    if (!p) return { city: '', country: '', coords: null };
    var city = norm(p.city || '');
    var country = norm(p.host_country || p.country || '');
    return {
      city: city,
      country: country,
      coords: coordsForCity(city)
    };
  }

  function extractEventCity(ev) {
    if (!ev) return '';
    var m = String(ev.description || '').match(/\[HOST_CITY:([^\]]+)\]/i);
    if (m) return norm(m[1]);
    var creator = (window.profiles || []).find(function (p) { return p && p.id === ev.creator_id; });
    if (creator && creator.city) return norm(creator.city);
    var addr = norm(ev.address);
    if (addr) {
      var part = addr.split(',')[0];
      if (part && part.length > 2) return part;
    }
    return '';
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

  function eventCoords(ev) {
    if (ev.approx_lat != null && ev.approx_lng != null) {
      return [Number(ev.approx_lat), Number(ev.approx_lng)];
    }
    if (ev.lat != null && ev.lng != null) {
      return [Number(ev.lat), Number(ev.lng)];
    }
    var city = extractEventCity(ev);
    var c = coordsForCity(city);
    if (c) return c;
    var addr = norm(ev.address);
    if (addr) {
      var keys = Object.keys(CITY_COORDS);
      for (var i = 0; i < keys.length; i++) {
        if (addr.indexOf(keys[i]) !== -1) return CITY_COORDS[keys[i]];
      }
    }
    return null;
  }

  function eventInViewerRegion(ev, viewer) {
    if (!ev) return false;
    if (window.currentUser && ev.creator_id === window.currentUser.id) return true;
    var parts = ev.event_participants || [];
    if (window.currentUser && parts.some(function (p) {
      return (p.user_id || p) === window.currentUser.id;
    })) return true;

    if (!viewer.city && !viewer.coords) return true;

    var evCity = extractEventCity(ev);
    var eCoords = eventCoords(ev);

    // Distance 100 km (ville profil ↔ ville event)
    if (viewer.coords && eCoords) {
      var d = haversineKm(viewer.coords[0], viewer.coords[1], eCoords[0], eCoords[1]);
      return d <= RADIUS_KM;
    }

    if (viewer.city && evCity) {
      if (viewer.city === evCity ||
          viewer.city.indexOf(evCity) !== -1 ||
          evCity.indexOf(viewer.city) !== -1) {
        return true;
      }
      if (coordsForCity(viewer.city) && coordsForCity(evCity)) {
        return false;
      }
    }

    var addr = norm(ev.address);
    if (viewer.city && addr && addr.indexOf(viewer.city) !== -1) return true;

    if (viewer.country) {
      var evCountry = extractEventCountry(ev);
      if (evCountry && (viewer.country === evCountry ||
          viewer.country.indexOf(evCountry) !== -1 ||
          evCountry.indexOf(viewer.country) !== -1)) {
        if (!eCoords && !coordsForCity(evCity)) return true;
      }
    }

    if (viewer.city || viewer.coords) return false;
    return true;
  }

  function filterEventsForUser(list) {
    if (!Array.isArray(list)) return list || [];
    if (isPrivileged()) return list;
    var viewer = getViewerCity();
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
      console.log('[AUPYGO] region filter (ville profil, ' + RADIUS_KM + 'km):', before, '→', window.cachedEvents.length);
    }
  }

  function reRender() {
    if (isPrivileged()) return;
    try {
      var grid = document.getElementById('eventGrid');
      if (!grid || !Array.isArray(window.cachedEvents)) return;
      var locked = (window.currentPlan || (typeof currentPlan !== 'undefined' ? currentPlan : 'FREE')) === 'FREE';
      var dayFn = typeof getEventsForSelectedDay === 'function'
        ? getEventsForSelectedDay(window.cachedEvents)
        : window.cachedEvents;
      if (!dayFn.length) {
        grid.innerHTML = '<p class="footer-muted" style="grid-column:1/-1;padding:16px">Aucune sortie dans un rayon de ' + RADIUS_KM + ' km autour de ta ville.</p>';
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
    } catch (e) {
      console.warn('[AUPYGO] region re-render', e);
    }
  }

  function patchLoad() {
    if (typeof window.loadAndRenderEvents !== 'function' || window._regionFilterPatched) return;
    window._regionFilterPatched = true;
    var orig = window.loadAndRenderEvents;
    window.loadAndRenderEvents = async function () {
      var r = await orig.apply(this, arguments);
      applyFilter();
      reRender();
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

  console.log('[AUPYGO] events-region-filter.js — ville profil + ' + RADIUS_KM + ' km (pas GPS)');
})();
