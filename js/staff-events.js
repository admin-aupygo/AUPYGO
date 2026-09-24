/* AUPYGO staff-events.js
 * - Staff : vue seule sorties users
 * - Hôte : payant → validation Admin + tag pays
 * - Users : sorties hôte filtrées par pays
 * - Agenda staff : Contrôle + Équipe
 */
(function () {
  'use strict';
  if (typeof isStaff !== 'function') return;

  var PENDING_TAG = '[EN_ATTENTE_VALIDATION_ADMIN]';
  var COUNTRY_TAG_RE = /\[HOST_COUNTRY:([^\]]+)\]/i;

  function isMemberStaffProfile(p) {
    if (!p) return false;
    if (p.is_admin === true) return true;
    var r = (p.role || '').toLowerCase();
    return r === 'admin_general' || r === 'host' || r === 'admin' || r === 'moderator';
  }

  function getEventById(eventId) {
    return (window.cachedEvents || []).find(function (e) { return e && e.id === eventId; });
  }

  function isUserCreatedEvent(ev) {
    if (!ev) return true;
    if (ev.is_special_aupygo === true) return false;
    if (ev.visibility === 'admin' || ev.visibility === 'admin_only') return false;
    if ((ev.description || '').indexOf(PENDING_TAG) !== -1) return false;
    var creator = (window.profiles || []).find(function (p) { return p && p.id === ev.creator_id; });
    if (creator && isMemberStaffProfile(creator)) return false;
    return true;
  }

  function isPendingApproval(ev) {
    return ev && ((ev.description || '').indexOf(PENDING_TAG) !== -1);
  }

  function extractHostCountry(ev) {
    if (!ev) return null;
    var m = (ev.description || '').match(COUNTRY_TAG_RE);
    if (m) return m[1].trim();
    var creator = (window.profiles || []).find(function (p) { return p && p.id === ev.creator_id; });
    if (creator && isMemberStaffProfile(creator)) {
      return creator.host_country || creator.country || null;
    }
    return null;
  }

  function normalizeCountry(c) {
    return String(c || '').trim().toLowerCase();
  }

  function getViewerCountry() {
    try {
      if (window.currentUserProfile) {
        return window.currentUserProfile.host_country || window.currentUserProfile.country || null;
      }
      var me = (window.profiles || []).find(function (p) {
        return p && window.currentUser && p.id === window.currentUser.id;
      });
      if (me) return me.host_country || me.country || null;
    } catch (e) {}
    return null;
  }

  /** User classique : ne voit les sorties d'un hôte que si même pays (admin/staff voient tout) */
  function filterEventsByHostCountry(list) {
    if (!Array.isArray(list)) return list;
    if (typeof isStaff === 'function' && isStaff()) return list;
    var viewerCountry = normalizeCountry(getViewerCountry());
    return list.filter(function (ev) {
      if (isPendingApproval(ev)) return false;
      var hostC = extractHostCountry(ev);
      if (!hostC) return true; // pas une sortie hôte taguée → visible
      // Sortie d'un hôte : visible si même pays OU si le viewer n'a pas encore de pays (profil incomplet)
      if (!viewerCountry) return true;
      return normalizeCountry(hostC) === viewerCountry;
    });
  }

  function unlockPaidOptionForStaff() {
    if (!isStaff()) return;
    var paidInput = document.getElementById('eventPaidPaid');
    if (paidInput) {
      var lab = paidInput.closest('label');
      if (lab) lab.style.display = '';
      paidInput.disabled = false;
    }
    var priceStep = document.getElementById('eventWizardPriceStep') ||
      document.querySelector('[data-step="price"]');
    if (priceStep) priceStep.style.display = '';
  }

  setInterval(function () {
    if (isStaff()) unlockPaidOptionForStaff();
  }, 1500);

  var _origJoin = window.joinRealEvent;
  if (typeof _origJoin === 'function') {
    window.joinRealEvent = async function (eventId) {
      if (isStaff()) {
        var ev = getEventById(eventId);
        if (ev && !isUserCreatedEvent(ev) && !isPendingApproval(ev)) {
          return _origJoin(eventId);
        }
        showToast('Les comptes Staff ne peuvent pas s\'inscrire aux sorties des membres. Vue et contrôle uniquement.', 'error');
        return;
      }
      var ev2 = getEventById(eventId);
      if (ev2 && isPendingApproval(ev2)) {
        showToast('Cet événement est en attente de validation par l\'administrateur.', 'error');
        return;
      }
      // Bloquer join si pays différent (sortie hôte)
      if (ev2) {
        var hc = extractHostCountry(ev2);
        var vc = getViewerCountry();
        if (hc && vc && normalizeCountry(hc) !== normalizeCountry(vc)) {
          showToast('Cette sortie est réservée aux membres du pays : ' + hc + '.', 'error');
          return;
        }
      }
      return _origJoin(eventId);
    };
  }

  function hideJoinButtonsForStaff() {
    if (!isStaff()) return;
    document.querySelectorAll(
      'button[onclick*="joinRealEvent"], .btn-accept[onclick*="joinRealEvent"]'
    ).forEach(function (btn) {
      var onclick = btn.getAttribute('onclick') || '';
      var m = onclick.match(/joinRealEvent\(['\"]([^'\"]+)['\"]\)/);
      if (m) {
        var ev = getEventById(m[1]);
        if (ev && isUserCreatedEvent(ev)) {
          btn.style.display = 'none';
          if (btn.parentElement && !btn.parentElement.querySelector('.staff-event-viewonly')) {
            var span = document.createElement('span');
            span.className = 'staff-event-viewonly';
            span.style.cssText = 'font-size:12px;color:#64748b;font-weight:600;padding:8px 0;display:inline-block';
            span.textContent = '👁️ Vue seule (staff)';
            btn.parentElement.appendChild(span);
          }
        }
      }
    });
  }

  var _origLoadEvents = window.loadAndRenderEvents;
  if (typeof _origLoadEvents === 'function') {
    window.loadAndRenderEvents = async function () {
      var r = await _origLoadEvents.apply(this, arguments);
      if (Array.isArray(window.cachedEvents)) {
        // Pending + pays hôte
        window.cachedEvents = filterEventsByHostCountry(window.cachedEvents);
      }
      setTimeout(hideJoinButtonsForStaff, 100);
      setTimeout(hideJoinButtonsForStaff, 500);
      setTimeout(injectAgendaTabs, 300);
      setTimeout(injectPendingApprovalsPanel, 400);
      // Re-render grid si filtre a retiré des items (best-effort)
      if (typeof isStaff === 'function' && !isStaff() && typeof renderEventCards === 'function') {
        try { renderEventCards(window.cachedEvents); } catch (e) {}
      }
      return r;
    };
  }

  setInterval(function () {
    if (isStaff() && typeof getActivePage === 'function' &&
        (getActivePage() === 'events' || getActivePage() === 'agenda')) {
      hideJoinButtonsForStaff();
    }
  }, 2000);

  var _origSubmit = window.submitCreateEvent;
  if (typeof _origSubmit === 'function') {
    window.submitCreateEvent = async function () {
      var isHostOnly = typeof isHost === 'function' && isHost() && !(typeof isAdmin === 'function' && isAdmin());
      var hostCountry = null;

      if (isHostOnly || (isStaff() && !(typeof isAdmin === 'function' && isAdmin()))) {
        try {
          var res = await supabaseClient.from('profiles').select('host_country, country, city').eq('id', currentUser.id).maybeSingle();
          var prof = res.data;
          hostCountry = (prof && (prof.host_country || prof.country)) || null;
        } catch (e) {}
        if (isHostOnly && hostCountry) {
          var address = (document.getElementById('createEventAddress') || {}).value || '';
          if (!confirm(
            '📍 Hôte AUPYGO — zone : « ' + hostCountry + ' ».\n\n' +
            'La sortie sera proposée aux users de ce pays.\nAdresse : ' + (address || '(vide)')
          )) return;
        }
        var vis = document.getElementById('createEventVisibility');
        if (vis && vis.value === 'admin') {
          showToast('Les événements spéciaux Aupygo sont réservés à l\'administrateur.', 'error');
          return;
        }
      }

      var paidRadio = document.querySelector('input[name="eventPaid"]:checked');
      var wantsPaid = !!(paidRadio && paidRadio.value === 'paid');
      var priceEl = document.getElementById('createEventPrice');
      var priceVal = priceEl ? parseFloat(priceEl.value) : 0;
      if (wantsPaid && (!priceVal || priceVal <= 0)) {
        showToast('Indique un montant valide (€) pour une sortie payante.', 'error');
        return;
      }

      var staffPaidPending = isStaff() && !(typeof isAdmin === 'function' && isAdmin()) && wantsPaid;

      if (staffPaidPending) {
        if (!confirm(
          '💶 Événement payant (prise en charge Aupygo)\n\n' +
          'Montant : ' + priceVal + ' €\n' +
          'Soumis à validation Admin avant publication.\n\nContinuer ?'
        )) return;
      }

      var visibility = (document.getElementById('createEventVisibility') || {}).value || 'public';
      var isSpecial = visibility === 'admin' || (typeof selectedEventType !== 'undefined' && selectedEventType === 'special');
      var staffParticipates = false;

      if (isStaff() && isSpecial && typeof isAdmin === 'function' && isAdmin()) {
        staffParticipates = confirm(
          '🛡️ Événement spécial Aupygo\n\nParticiper en tant qu\'hôte Aupygo ?\nOK = Oui · Annuler = organisation seule'
        );
      }

      var beforeIds = new Set((window.cachedEvents || []).map(function (e) { return e.id; }));
      await _origSubmit.apply(this, arguments);

      setTimeout(async function () {
        try {
          if (typeof loadAndRenderEvents === 'function') await loadAndRenderEvents();
          var newest = (window.cachedEvents || []).find(function (e) {
            return e && !beforeIds.has(e.id) && e.creator_id === currentUser.id;
          });
          if (!newest) {
            var mine = (window.cachedEvents || []).filter(function (e) { return e.creator_id === currentUser.id; });
            mine.sort(function (a, b) {
              return new Date(b.created_at || b.event_date) - new Date(a.created_at || a.event_date);
            });
            newest = mine[0];
          }
          if (!newest) return;

          // Tag pays pour filtrage users
          var desc = newest.description || '';
          if (hostCountry && !COUNTRY_TAG_RE.test(desc)) {
            desc = '[HOST_COUNTRY:' + hostCountry + ']\n' + desc;
          }

          if (staffPaidPending) {
            if (desc.indexOf(PENDING_TAG) === -1) desc = PENDING_TAG + '\n' + desc;
            await supabaseClient.from('events').update({
              description: desc.trim(),
              visibility: 'admin',
              is_paid: true,
              price: priceVal
            }).eq('id', newest.id);
            showToast('Événement payant soumis — en attente de validation Admin.', 'success');
            if (typeof loadAndRenderEvents === 'function') await loadAndRenderEvents();
            return;
          }

          // Tag pays même si gratuit
          if (hostCountry && desc !== (newest.description || '')) {
            await supabaseClient.from('events').update({ description: desc.trim() }).eq('id', newest.id);
          }

          if (typeof isAdmin === 'function' && isAdmin() && wantsPaid && !newest.is_paid) {
            await supabaseClient.from('events').update({ is_paid: true, price: priceVal }).eq('id', newest.id);
          }

          if (isStaff() && isSpecial && typeof isAdmin === 'function' && isAdmin()) {
            if (!staffParticipates) {
              await supabaseClient.from('event_participants').delete().eq('event_id', newest.id).eq('user_id', currentUser.id);
              showToast('Événement publié — organisation seule.', 'success');
            } else {
              try {
                await supabaseClient.from('events').update({
                  description: (desc + '\n\n✨ Présence d\'un hôte Aupygo confirmée.').trim()
                }).eq('id', newest.id);
              } catch (e) {}
              try {
                await supabaseClient.from('event_participants').insert({ event_id: newest.id, user_id: currentUser.id });
              } catch (e3) {}
              showToast('Événement publié — présence hôte signalée.', 'success');
            }
          }

          if (typeof loadAndRenderEvents === 'function') await loadAndRenderEvents();
        } catch (err) {
          console.warn('[Staff events]', err);
        }
      }, 900);
    };
  }

  window.adminApproveEvent = async function (eventId) {
    if (!(typeof isAdmin === 'function' && isAdmin())) return;
    try {
      var ev = getEventById(eventId);
      if (!ev) return;
      var desc = (ev.description || '').replace(PENDING_TAG, '').trim();
      var { error } = await supabaseClient.from('events').update({
        description: desc || null,
        visibility: 'public'
      }).eq('id', eventId);
      if (error) throw error;
      showToast('Événement approuvé et publié.', 'success');
      if (typeof loadAndRenderEvents === 'function') await loadAndRenderEvents();
      injectPendingApprovalsPanel();
    } catch (e) {
      showToast('Erreur: ' + (e.message || e), 'error');
    }
  };

  window.adminRejectEvent = async function (eventId) {
    if (!(typeof isAdmin === 'function' && isAdmin())) return;
    if (!confirm('Refuser / supprimer cet événement en attente ?')) return;
    try {
      var { error } = await supabaseClient.from('events').delete().eq('id', eventId);
      if (error) throw error;
      showToast('Événement refusé / supprimé.', 'success');
      if (typeof loadAndRenderEvents === 'function') await loadAndRenderEvents();
      injectPendingApprovalsPanel();
    } catch (e) {
      showToast('Erreur: ' + (e.message || e), 'error');
    }
  };

  function injectPendingApprovalsPanel() {
    if (!(typeof isAdmin === 'function' && isAdmin())) return;
    var page = document.getElementById('events') || document.getElementById('agenda');
    if (!page) return;
    // Admin voit aussi les pending (non filtrés par pays)
    var all = window.cachedEvents || [];
    // Recharger bruts si besoin — utiliser ce qui est en cache + tag
    var pending = all.filter(isPendingApproval);
    // Si filtrés ailleurs, tenter une lecture légère
    var box = document.getElementById('staffPendingApprovals');
    if (!pending.length) {
      if (box) box.remove();
      return;
    }
    if (!box) {
      box = document.createElement('div');
      box.id = 'staffPendingApprovals';
      box.style.cssText = 'background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:14px;margin:12px 0;';
      page.insertBefore(box, page.firstChild);
    }
    box.innerHTML = '<div style="font-weight:800;margin-bottom:10px">⏳ Événements payants en attente (' + pending.length + ')</div>' +
      pending.map(function (ev) {
        var hc = extractHostCountry(ev);
        return '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 0;border-top:1px solid #fed7aa">' +
          '<div style="flex:1;min-width:160px"><strong>' + (ev.title || 'Sans titre') + '</strong><br><span style="font-size:12px;color:#9a3412">' +
          (ev.is_paid ? (Number(ev.price || 0) + ' € · ') : '') +
          (hc ? ('📍 ' + hc + ' · ') : '') +
          (ev.event_date ? new Date(ev.event_date).toLocaleString('fr-FR') : '') +
          '</span></div>' +
          '<button type="button" class="btn btn-primary" style="font-size:12px" onclick="window.adminApproveEvent(\'' + ev.id + '\')">✅ Approuver</button>' +
          '<button type="button" class="btn btn-secondary" style="font-size:12px" onclick="window.adminRejectEvent(\'' + ev.id + '\')">✖️ Refuser</button></div>';
      }).join('');
  }

  var agendaStaffMode = 'control';

  function injectAgendaTabs() {
    if (!isStaff()) return;
    var agendaPage = document.getElementById('agenda');
    if (!agendaPage) return;
    if (!document.getElementById('staffAgendaTabs')) {
      var tabs = document.createElement('div');
      tabs.id = 'staffAgendaTabs';
      tabs.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 16px';
      tabs.innerHTML =
        '<button type="button" id="staffAgendaTabControl" class="btn btn-secondary" style="font-size:13px">📅 Contrôle</button>' +
        '<button type="button" id="staffAgendaTabTeam" class="btn btn-secondary" style="font-size:13px">🛡️ Agenda Staff</button>' +
        '<button type="button" class="btn btn-primary" style="font-size:13px" onclick="go(\'events\')">⚡ Spécial Aupygo</button>';
      var title = agendaPage.querySelector('.section-title') || agendaPage.firstElementChild;
      if (title && title.nextSibling) agendaPage.insertBefore(tabs, title.nextSibling);
      else agendaPage.insertBefore(tabs, agendaPage.firstChild);
      document.getElementById('staffAgendaTabControl').onclick = function () {
        agendaStaffMode = 'control'; applyAgendaStaffFilter();
      };
      document.getElementById('staffAgendaTabTeam').onclick = function () {
        agendaStaffMode = 'team'; applyAgendaStaffFilter();
      };
    }
    applyAgendaStaffFilter();
  }

  function applyAgendaStaffFilter() {
    if (!isStaff()) return;
    var cal = document.getElementById('agendaCalendar');
    var btnC = document.getElementById('staffAgendaTabControl');
    var btnT = document.getElementById('staffAgendaTabTeam');
    if (btnC) btnC.style.opacity = agendaStaffMode === 'control' ? '1' : '0.55';
    if (btnT) btnT.style.opacity = agendaStaffMode === 'team' ? '1' : '0.55';
    var all = window.cachedEvents || [];
    var list;
    if (agendaStaffMode === 'team') {
      list = all.filter(function (e) {
        if (typeof getEventUrgency === 'function' && getEventUrgency(e) === 'expired') return false;
        if (e.is_special_aupygo) return true;
        if (e.visibility === 'admin' || e.visibility === 'admin_only') return true;
        var c = (window.profiles || []).find(function (p) { return p && p.id === e.creator_id; });
        return c && isMemberStaffProfile(c);
      });
    } else {
      list = all.filter(function (e) {
        if (typeof getEventUrgency === 'function' && getEventUrgency(e) === 'expired') return false;
        if (e.visibility === 'friends') return false;
        return true;
      });
    }
    if (cal && typeof buildWeekCalendarHtml === 'function') {
      if (!list.length) {
        cal.innerHTML = '<p class="footer-muted" style="grid-column:1/-1;padding:12px">Aucun événement.</p>';
      } else {
        cal.innerHTML = buildWeekCalendarHtml(list);
      }
    }
    hideJoinButtonsForStaff();
  }

  var prevGo = window.go;
  if (typeof prevGo === 'function' && !window._staffEventsGoPatched) {
    window._staffEventsGoPatched = true;
    window.go = function (page) {
      prevGo(page);
      if (page === 'events' || page === 'agenda') {
        setTimeout(hideJoinButtonsForStaff, 400);
        setTimeout(injectAgendaTabs, 400);
        setTimeout(injectPendingApprovalsPanel, 500);
        setTimeout(unlockPaidOptionForStaff, 600);
      }
    };
  }

  setTimeout(function () {
    if (isStaff()) {
      injectAgendaTabs();
      injectPendingApprovalsPanel();
      unlockPaidOptionForStaff();
    }
  }, 1500);

  console.log('[AUPYGO] staff-events.js chargé (filtre pays hôte)');
})();
