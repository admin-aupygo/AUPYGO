/* AUPYGO — events-region-filter.js v2
 * Centre = ville du PROFIL (pas GPS). Rayon 100 km.
 * S'applique aussi aux sorties staff / AUPYGO.
 * Staff / Amiral / Admin voient tout.
 */
(function () {
  'use strict';

  var RADIUS_KM = 100;

  var CITY_COORDS = {
    barcelona: [41.3874, 2.1686], barcelone: [41.3874, 2.1686],
    paris: [48.8566, 2.3522], lyon: [45.7640, 4.8357], marseille: [43.2965, 5.3698],
    toulouse: [43.6047, 1.4442], nice: [43.7102, 7.2620], bordeaux: [44.8378, -0.5792],
    nantes: [47.2184, -1.5536], lille: [50.6292, 3.0573], strasbourg: [48.5734, 7.7521],
    montpellier: [43.6108, 3.8767], rennes: [48.1173, -1.6778],
    geneve: [46.2044, 6.1432], geneva: [46.2044, 6.1432], lausanne: [46.5197, 6.6323],
    zurich: [47.3769, 8.5417], berne: [46.9480, 7.4474], bern: [46.9480, 7.4474],
    bale: [47.5596, 7.5886], basel: [47.5596, 7.5886], nyon: [46.3833, 6.2396],
    vevey: [46.4628, 6.8434], monterux: [46.4312, 6.9107], montreux: [46.4312, 6.9107],
    hauterive: [46.9667, 6.8833], saconnex: [46.2333, 6.1167],
    'petit-saconnex': [46.2333, 6.1167], 'petit saconnex': [46.2333, 6.1167],
    bruxelles: [50.8503, 4.3517], brussels: [50.8503, 4.3517],
    anvers: [51.2194, 4.4025], antwerp: [51.2194, 4.4025], liege: [50.6326, 5.5797],
    montreal: [45.5017, -73.5673], quebec: [46.8139, -71.2080],
    toronto: [43.6532, -79.3832], vancouver: [49.2827, -123.1207],
    madrid: [40.4168, -3.7038], valence: [39.4699, -0.3763], valencia: [39.4699, -0.3763],
    seville: [37.3891, -5.9845], sevilla: [37.3891, -5.9845],
    bilbao: [43.2630, -2.9350], malaga: [36.7213, -4.4214],
    lisbonne: [38.7223, -9.1393], lisbon: [38.7223, -9.1393], porto: [41.1579, -8.6291],
    rome: [41.9028, 12.4964], roma: [41.9028, 12.4964],
    milan: [45.4642, 9.1900], milano: [45.4642, 9.1900],
    turin: [45.0703, 7.6869], florence: [43.7696, 11.2558],
    napoli: [40.8518, 14.2681], naples: [40.8518, 14.2681],
    berlin: [52.5200, 13.4050], munich: [48.1351, 11.5820],
    hambourg: [53.5511, 9.9937], hamburg: [53.5511, 9.9937],
    cologne: [50.9375, 6.9603], koln: [50.9375, 6.9603],
    francfort: [50.1109, 8.6821], frankfurt: [50.1109, 8.6821],
    amsterdam: [52.3676, 4.9041], rotterdam: [51.9244, 4.4777],
    londres: [51.5074, -0.1278], london: [51.5074, -0.1278],
    manchester: [53.4808, -2.2426], dublin: [53.3498, -6.2603],
    vienne: [48.2082, 16.3738], vienna: [48.2082, 16.3738],
    luxembourg: [49.6116, 6.1319], monaco: [43.7384, 7.4246],
    andorre: [42.5063, 1.5218], andorra: [42.5063, 1.5218]
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
      if (n.indexOf(keys[i]) !== -1) return CITY_COORDS[keys[i]];
    }
    return null;
  }

  function findCityInText(text) {
    var n = norm(text);
    if (!n) return '';
    var keys = Object.keys(CITY_COORDS).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < keys.length; i++) {
      if (n.indexOf(keys[i]) !== -1) return keys[i];
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

  function getViewerCity() {
    var city = '';
    var country = '';
    try {
      var p = window.currentUserProfile || null;
      if (!p && window.currentUser) {
        p = (window.profiles || []).find(function (x) {
          return x && window.currentUser && x.id === window.currentUser.id;
        }) || null;
      }
      if (p) {
        city = norm(p.city || '');
        country = norm(p.host_country || p.country || '');
      }
      if (!city) {
        var el = document.getElementById('city');
        if (el && el.value) city = norm(el.value);
      }
      if (!city) {
        try { city = norm(localStorage.getItem('aupygo_city') || ''); } catch (e) {}
      }
    } catch (e) {}
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
    var fromAddr = findCityInText(ev.address || '');
    if (fromAddr) return fromAddr;
    var creator = (window.profiles || []).find(function (p) { return p && p.id === ev.creator_id; });
    if (creator && creator.city) {
      var cc = findCityInText(creator.city) || norm(creator.city);
      if (cc) return cc;
    }
    var part = norm(ev.address || '').split(',')[0];
    if (part && part.length > 2) return part;
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

    var eCoords = eventCoords(ev);
    var evCity = extractEventCity(ev);

    if (viewer.coords && eCoords) {
      var d = haversineKm(viewer.coords[0], viewer.coords[1], eCoords[0], eCoords[1]);
      if (d > RADIUS_KM) return false;
      return true;
    }

    if (viewer.city && evCity) {
      if (viewer.city === evCity ||
          viewer.city.indexOf(evCity) !== -1 ||
          evCity.indexOf(viewer.city) !== -1) {
        return true;
      }
      if (coordsForCity(viewer.city) && coordsForCity(evCity)) return false;
    }

    if (viewer.city && norm(ev.address).indexOf(viewer.city) !== -1) return true;

    if (viewer.coords && eCoords) return false;
    if (viewer.city && coordsForCity(evCity) && coordsForCity(viewer.city)) return false;

    if (viewer.city || viewer.coords) return false;
    return true;
  }

  function filterEventsForUser(list) {
    if (!Array.isArray(list)) return list || [];
    if (isPrivileged()) return list;
    var viewer = getViewerCity();
    var out = list.filter(function (ev) {
      return eventInViewerRegion(ev, viewer);
    });
    try {
      console.log('[AUPYGO] region filter ville=' + (viewer.city || '?') +
        ' coords=' + (viewer.coords ? viewer.coords.join(',') : 'no') +
        ' ' + list.length + ' → ' + out.length);
    } catch (e) {}
    return out;
  }
  window.aupygoFilterEventsByRegion = filterEventsForUser;

  function applyFilter() {
    if (isPrivileged()) return false;
    if (!Array.isArray(window.cachedEvents)) return false;
    var before = window.cachedEvents.length;
    var filtered = filterEventsForUser(window.cachedEvents);
    if (filtered.length === before) return false;
    window.cachedEvents = filtered;
    return true;
  }

  function reRender() {
    if (isPrivileged()) return;
    try {
      var grid = document.getElementById('eventGrid');
      if (grid && Array.isArray(window.cachedEvents)) {
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
      }
      if (typeof renderSpecialEventsHero === 'function') renderSpecialEventsHero(window.cachedEvents || []);
      if (typeof renderEventsAgenda === 'function') renderEventsAgenda(window.cachedEvents || []);
      if (typeof renderCommunityAgenda === 'function') renderCommunityAgenda(window.cachedEvents || []);
      if (typeof renderPersonalAgenda === 'function') renderPersonalAgenda(window.cachedEvents || []);
      if (typeof updateMyAgendaList === 'function') updateMyAgendaList();
    } catch (e) {
      console.warn('[AUPYGO] region re-render', e);
    }
  }

  function patchLoad() {
    if (typeof window.loadAndRenderEvents !== 'function') return;
    if (window._regionFilterWrapId === window.loadAndRenderEvents) return;
    var orig = window.loadAndRenderEvents;
    var wrapped = async function () {
      var r = await orig.apply(this, arguments);
      applyFilter();
      reRender();
      return r;
    };
    window.loadAndRenderEvents = wrapped;
    window._regionFilterWrapId = wrapped;
    window._regionFilterPatched = true;
  }

  function forceFilterNow() {
    if (isPrivileged()) return;
    if (applyFilter()) reRender();
    else {
      var viewer = getViewerCity();
      if (!viewer.city && !viewer.coords) return;
      var grid = document.getElementById('eventGrid');
      if (!grid) return;
      var html = grid.innerHTML || '';
      var n = norm(html);
      if (viewer.coords) {
        var foreign = ['paris', 'nyon', 'lausanne', 'vevey', 'geneve', 'geneva', 'lyon', 'marseille'];
        var hit = false;
        for (var i = 0; i < foreign.length; i++) {
          if (n.indexOf(foreign[i]) !== -1) {
            var fc = CITY_COORDS[foreign[i]];
            if (fc && haversineKm(viewer.coords[0], viewer.coords[1], fc[0], fc[1]) > RADIUS_KM) {
              hit = true;
              break;
            }
          }
        }
        if (hit) {
          window.cachedEvents = filterEventsForUser(window.cachedEvents || []);
          reRender();
        }
      }
    }
  }

  function boot() {
    patchLoad();
    forceFilterNow();
  }

  boot();
  setTimeout(boot, 400);
  setTimeout(boot, 1200);
  setTimeout(boot, 2500);
  setTimeout(boot, 5000);
  setInterval(function () {
    patchLoad();
    forceFilterNow();
  }, 3000);

  console.log('[AUPYGO] events-region-filter v2 — ville profil + ' + RADIUS_KM + ' km (strict, staff events inclus)');
})();
