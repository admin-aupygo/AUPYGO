/* AUPYGO staff-messages.js
 * - Groupe Équipe AUPYGO
 * - Host : onglet DM auto avec Admin Général uniquement
 * - Pas de DM entre hosts
 * - Affichage prénom expéditeur dans le groupe
 */
(function () {
  'use strict';
  if (typeof isStaff !== 'function') return;

  var STAFF_GROUP_TITLE = '🛡️ Équipe AUPYGO';
  var staffGroupIdCache = null;
  var adminDmCache = null;

  function isMemberStaffProfile(p) {
    if (!p) return false;
    if (p.is_admin === true) return true;
    var r = (p.role || '').toLowerCase();
    return r === 'admin_general' || r === 'host' || r === 'admin' || r === 'moderator';
  }

  async function findAdminGeneralId() {
    try {
      var res = await supabaseClient.from('profiles')
        .select('id, display_name, role, is_admin')
        .or('role.eq.admin_general,is_admin.eq.true')
        .limit(5);
      var rows = res.data || [];
      var admin = rows.find(function (r) { return r.role === 'admin_general'; }) || rows[0];
      return admin || null;
    } catch (e) {
      return null;
    }
  }

  function canStartDm(targetUserId) {
    if (typeof isAdmin === 'function' && isAdmin()) {
      var target = (window.profiles || []).find(function (p) { return p && p.id === targetUserId; });
      if (target && isMemberStaffProfile(target)) return true;
      return false;
    }
    // Host : uniquement vers admin_general
    if (typeof isHost === 'function' && isHost()) {
      var t = (window.profiles || []).find(function (p) { return p && p.id === targetUserId; });
      if (t && (t.role === 'admin_general' || t.is_admin === true)) return true;
      return false;
    }
    if (isStaff()) return false;
    var t2 = (window.profiles || []).find(function (p) { return p && p.id === targetUserId; });
    if (t2 && isMemberStaffProfile(t2)) return false;
    return true;
  }

  var _origMessageMember = window.messageMember;
  if (typeof _origMessageMember === 'function') {
    window.messageMember = function (memberId) {
      if (typeof isAdmin === 'function' && isAdmin()) {
        if (!canStartDm(memberId)) {
          showToast('Admin : DM uniquement vers un membre Staff.', 'error');
          return;
        }
        if (typeof closeMemberProfile === 'function') closeMemberProfile();
        var raw = (window.profiles || []).find(function (m) { return m && m.id === memberId; });
        return openStaffDm(memberId, (raw && raw.display_name) || 'Staff');
      }
      if (typeof isHost === 'function' && isHost()) {
        if (!canStartDm(memberId)) {
          showToast('Host : conversation privée uniquement avec l\'Admin Général.', 'error');
          if (typeof closeMemberProfile === 'function') closeMemberProfile();
          return;
        }
        if (typeof closeMemberProfile === 'function') closeMemberProfile();
        var raw2 = (window.profiles || []).find(function (m) { return m && m.id === memberId; });
        return openStaffDm(memberId, (raw2 && raw2.display_name) || 'Admin');
      }
      if (isStaff()) {
        showToast('Messagerie privée limitée. Utilisez le groupe Équipe AUPYGO.', 'error');
        if (typeof closeMemberProfile === 'function') closeMemberProfile();
        return;
      }
      var target = (window.profiles || []).find(function (p) { return p && p.id === memberId; });
      if (target && isMemberStaffProfile(target)) {
        showToast('Ce compte n\'est pas joignable en message privé.', 'error');
        return;
      }
      return _origMessageMember(memberId);
    };
  }

  async function openStaffDm(memberId, name) {
    try {
      if (typeof go === 'function') go('messages');
      window._adminBypassDm = true;
      if (typeof _origGetDm === 'function') {
        await window.getOrCreateDmConversation(memberId);
      }
      if (typeof _origOpenConv === 'function') {
        await _origOpenConv('dm', memberId, name);
      }
      window._adminBypassDm = false;
    } catch (e) {
      window._adminBypassDm = false;
      console.warn('[Staff] DM', e);
      showToast('Impossible d\'ouvrir la conversation', 'error');
    }
  }

  var _origOpenConv = window.openConversation;
  if (typeof _origOpenConv === 'function') {
    window.openConversation = async function (type, id, name) {
      if (type === 'dm') {
        if (window._adminBypassDm) return _origOpenConv(type, id, name);
        if (isStaff() && !canStartDm(id)) {
          showToast('Conversation privée non autorisée.', 'error');
          return;
        }
        if (canStartDm(id)) {
          window._adminBypassDm = true;
          var r = await _origOpenConv(type, id, name);
          window._adminBypassDm = false;
          return r;
        }
        if (!isStaff()) {
          var target = (window.profiles || []).find(function (p) { return p && p.id === id; });
          if (target && isMemberStaffProfile(target)) {
            showToast('Ce compte n\'est pas joignable en message privé.', 'error');
            return;
          }
        }
      }
      return _origOpenConv(type, id, name);
    };
  }

  var _origGetDm = window.getOrCreateDmConversation;
  if (typeof _origGetDm === 'function') {
    window.getOrCreateDmConversation = async function (friendId) {
      if (canStartDm(friendId) || window._adminBypassDm) {
        return _origGetDm(friendId);
      }
      if (isStaff()) {
        showToast('Conversation privée interdite.', 'error');
        return null;
      }
      var target = (window.profiles || []).find(function (p) { return p && p.id === friendId; });
      if (target && isMemberStaffProfile(target)) {
        showToast('Ce compte n\'est pas joignable en message privé.', 'error');
        return null;
      }
      return _origGetDm(friendId);
    };
  }

  async function ensureStaffGroup() {
    if (!isStaff() || !window.currentUser) return null;
    if (staffGroupIdCache) return staffGroupIdCache;
    try {
      var myRows = await supabaseClient.from('conversation_members').select('conversation_id').eq('user_id', currentUser.id);
      var myIds = ((myRows && myRows.data) || []).map(function (r) { return r.conversation_id; });
      if (myIds.length) {
        var groups = await supabaseClient.from('conversations').select('id, title, type').eq('type', 'group').in('id', myIds);
        var found = ((groups && groups.data) || []).find(function (g) {
          return (g.title || '') === STAFF_GROUP_TITLE || (g.title || '').indexOf('Équipe AUPYGO') !== -1;
        });
        if (found) {
          staffGroupIdCache = found.id;
          await syncStaffMembers(found.id);
          return found.id;
        }
      }
      var anyStaff = await supabaseClient.from('conversations').select('id, title').eq('type', 'group').eq('title', STAFF_GROUP_TITLE).limit(1);
      if (anyStaff && anyStaff.data && anyStaff.data.length) {
        staffGroupIdCache = anyStaff.data[0].id;
        try {
          await supabaseClient.from('conversation_members').insert({ conversation_id: staffGroupIdCache, user_id: currentUser.id });
        } catch (e) {}
        await syncStaffMembers(staffGroupIdCache);
        return staffGroupIdCache;
      }
      var created = await supabaseClient.from('conversations').insert({
        created_by: currentUser.id, type: 'group', title: STAFF_GROUP_TITLE
      }).select().single();
      if (created.error || !created.data) return null;
      staffGroupIdCache = created.data.id;
      await supabaseClient.from('conversation_members').insert({ conversation_id: staffGroupIdCache, user_id: currentUser.id });
      await syncStaffMembers(staffGroupIdCache);
      return staffGroupIdCache;
    } catch (e) {
      console.error('[Staff] ensureStaffGroup', e);
      return null;
    }
  }

  async function syncStaffMembers(convId) {
    if (!convId) return;
    try {
      var staffList = await supabaseClient.from('profiles').select('id').or('is_admin.eq.true,role.eq.admin_general,role.eq.host');
      if (!staffList.data || !staffList.data.length) return;
      var existing = await supabaseClient.from('conversation_members').select('user_id').eq('conversation_id', convId);
      var have = new Set(((existing && existing.data) || []).map(function (r) { return r.user_id; }));
      var toAdd = staffList.data.filter(function (s) { return !have.has(s.id); }).map(function (s) {
        return { conversation_id: convId, user_id: s.id };
      });
      if (toAdd.length) await supabaseClient.from('conversation_members').insert(toAdd);
    } catch (e) {}
  }

  /** Affiche le prénom de l'expéditeur dans les bulles du groupe staff */
  function labelGroupSenders() {
    if (!isStaff()) return;
    var active = window.activeConversation;
    if (!active || active.type !== 'group') return;
    document.querySelectorAll('.message, .msg-bubble, .chat-message').forEach(function (msg) {
      if (msg.querySelector('.staff-sender-label')) return;
      var uid = msg.getAttribute('data-user-id') || msg.getAttribute('data-sender');
      if (!uid) return;
      var p = (window.profiles || []).find(function (x) { return x && x.id === uid; });
      var name = (p && p.display_name) || 'Staff';
      var label = document.createElement('div');
      label.className = 'staff-sender-label';
      label.style.cssText = 'font-size:11px;font-weight:700;color:#64748b;margin-bottom:2px;';
      label.textContent = name;
      msg.insertBefore(label, msg.firstChild);
    });
  }

  async function applyStaffMessagesUI() {
    if (!isStaff()) return;
    var friendsList = document.getElementById('convFriendsList');
    var groupsList = document.getElementById('convGroupsList');

    document.querySelectorAll(
      '#createGroupBtn, [onclick*="openCreateGroup"], [onclick*="CreateGroup"], .messages-create-group'
    ).forEach(function (el) { el.style.display = 'none'; });

    // Liste « privées » : Host → canal Admin ; Admin → info
    if (friendsList) {
      if (typeof isHost === 'function' && isHost() && !(typeof isAdmin === 'function' && isAdmin())) {
        var admin = await findAdminGeneralId();
        if (admin) {
          adminDmCache = admin;
          friendsList.innerHTML =
            '<div class="conversation" onclick="window.openAdminChannel()">' +
            '<div class="conv-avatar" style="background:#7c3aed;color:#fff">🛡️</div>' +
            '<div class="conv-meta"><div class="conv-name">Admin Général</div>' +
            '<div class="conv-preview" style="font-size:11px;color:#888">' +
            ((admin.display_name || 'Aupygo') + ' — canal direct') +
            '</div></div></div>';
        } else {
          friendsList.innerHTML = '<p class="conv-empty" style="opacity:0.7">Canal Admin indisponible pour le moment.</p>';
        }
      } else if (typeof isAdmin === 'function' && isAdmin()) {
        friendsList.innerHTML = '<p class="conv-empty" style="opacity:0.75;font-size:13px">Ouvre un DM avec un Host depuis sa fiche (carte). Groupe officiel ci-dessous.</p>';
      } else {
        friendsList.innerHTML = '<p class="conv-empty" style="opacity:0.7">Canal : groupe Équipe AUPYGO.</p>';
      }
    }

    var gid = await ensureStaffGroup();
    if (groupsList) {
      var active = window.activeConversation && window.activeConversation.conversationId === gid ? ' active' : '';
      groupsList.innerHTML =
        '<div class="conversation' + active + '" onclick="window.openStaffGroup()">' +
        '<div class="conv-avatar" style="background:#111;color:#fff">🛡️</div>' +
        '<div class="conv-meta"><div class="conv-name">' + STAFF_GROUP_TITLE + '</div>' +
        '<div class="conv-preview" style="font-size:11px;color:#888">Canal officiel Admin + Hôtes</div></div></div>';
    }

    setTimeout(labelGroupSenders, 400);
  }

  window.openAdminChannel = async function () {
    if (!(typeof isHost === 'function' && isHost())) return;
    var admin = adminDmCache || await findAdminGeneralId();
    if (!admin) {
      showToast('Admin Général introuvable', 'error');
      return;
    }
    await openStaffDm(admin.id, admin.display_name || 'Admin Général');
  };

  window.openStaffGroup = async function () {
    if (!isStaff()) return;
    var gid = await ensureStaffGroup();
    if (!gid) {
      showToast('Impossible d\'ouvrir le groupe staff', 'error');
      return;
    }
    if (typeof go === 'function' && typeof getActivePage === 'function' && getActivePage() !== 'messages') go('messages');
    if (typeof _origOpenConv === 'function') {
      await _origOpenConv('group', gid, STAFF_GROUP_TITLE);
    }
    applyStaffMessagesUI();
    setTimeout(labelGroupSenders, 500);
  };

  var _origSidebar = window.renderConversationSidebar;
  if (typeof _origSidebar === 'function') {
    window.renderConversationSidebar = function () {
      if (isStaff()) { applyStaffMessagesUI(); return; }
      return _origSidebar.apply(this, arguments);
    };
  }

  // Après chargement historique messages
  var _origHist = window.loadConversationHistory;
  if (typeof _origHist === 'function') {
    window.loadConversationHistory = async function () {
      var r = await _origHist.apply(this, arguments);
      setTimeout(labelGroupSenders, 200);
      return r;
    };
  }

  var prevGo = window.go;
  if (typeof prevGo === 'function') {
    window.go = function (page) {
      prevGo(page);
      if (page === 'messages' && isStaff()) {
        setTimeout(applyStaffMessagesUI, 300);
        setTimeout(applyStaffMessagesUI, 1200);
      }
    };
  }

  setTimeout(function () {
    if (isStaff() && typeof getActivePage === 'function' && getActivePage() === 'messages') applyStaffMessagesUI();
  }, 1500);

  setInterval(function () {
    if (isStaff() && typeof getActivePage === 'function' && getActivePage() === 'messages') labelGroupSenders();
  }, 3000);

  console.log('[AUPYGO] staff-messages.js chargé (canal Admin Host)');
})();
