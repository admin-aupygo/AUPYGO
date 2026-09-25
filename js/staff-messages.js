/* AUPYGO staff-messages.js v3
 * - Amis → Équipe
 * - Couleurs distinctes par membre, VERT = Admin Général
 * - Prénom au-dessus de chaque message groupe
 * - Host: Admin + groupe ; Admin: staff + groupe
 */
(function () {
  'use strict';
  if (typeof isStaff !== 'function') return;

  var STAFF_GROUP_TITLE = '🛡️ Équipe AUPYGO';
  var staffGroupIdCache = null;
  var adminDmCache = null;

  // Palette (vert réservé Admin)
  var STAFF_COLORS = ['#7c3aed', '#2563eb', '#db2777', '#ea580c', '#0891b2', '#4f46e5', '#c026d3', '#0d9488'];
  var ADMIN_COLOR = '#16a34a';

  function isMemberStaffProfile(p) {
    if (!p) return false;
    if (p.is_admin === true) return true;
    var r = (p.role || '').toLowerCase();
    return r === 'admin_general' || r === 'host' || r === 'admin' || r === 'moderator';
  }

  function colorForUser(uid, isAdminUser) {
    if (isAdminUser) return ADMIN_COLOR;
    if (!uid) return '#64748b';
    var h = 0;
    var s = String(uid);
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
    return STAFF_COLORS[Math.abs(h) % STAFF_COLORS.length];
  }

  async function findAdminGeneralId() {
    try {
      var res = await supabaseClient.from('profiles')
        .select('id, display_name, role, is_admin')
        .or('role.eq.admin_general,is_admin.eq.true')
        .limit(5);
      var rows = res.data || [];
      return rows.find(function (r) { return r.role === 'admin_general'; }) || rows[0] || null;
    } catch (e) { return null; }
  }

  function canStartDm(targetUserId) {
    if (typeof isAdmin === 'function' && isAdmin()) {
      var target = (window.profiles || []).find(function (p) { return p && p.id === targetUserId; });
      return !!(target && isMemberStaffProfile(target));
    }
    if (typeof isHost === 'function' && isHost()) {
      var t = (window.profiles || []).find(function (p) { return p && p.id === targetUserId; });
      return !!(t && (t.role === 'admin_general' || t.is_admin === true));
    }
    if (isStaff()) return false;
    var t2 = (window.profiles || []).find(function (p) { return p && p.id === targetUserId; });
    if (t2 && isMemberStaffProfile(t2)) return false;
    return true;
  }

  async function ensureStaffDmConversation(otherUserId) {
    if (!window.currentUser || !otherUserId) return null;
    try {
      var myRows = await supabaseClient.from('conversation_members').select('conversation_id').eq('user_id', currentUser.id);
      var myIds = ((myRows && myRows.data) || []).map(function (r) { return r.conversation_id; });
      if (myIds.length) {
        var otherRows = await supabaseClient.from('conversation_members').select('conversation_id').eq('user_id', otherUserId).in('conversation_id', myIds);
        var shared = ((otherRows && otherRows.data) || []).map(function (r) { return r.conversation_id; });
        if (shared.length) {
          var convs = await supabaseClient.from('conversations').select('id, type').in('id', shared).eq('type', 'dm');
          if (convs.data && convs.data.length) return convs.data[0].id;
        }
      }
      var created = await supabaseClient.from('conversations').insert({ created_by: currentUser.id, type: 'dm', title: null }).select().single();
      if (created.error || !created.data) return null;
      var cid = created.data.id;
      await supabaseClient.from('conversation_members').insert([
        { conversation_id: cid, user_id: currentUser.id },
        { conversation_id: cid, user_id: otherUserId }
      ]);
      return cid;
    } catch (e) { return null; }
  }

  async function openStaffDm(memberId, name) {
    try {
      if (typeof go === 'function') go('messages');
      var cid = await ensureStaffDmConversation(memberId);
      if (!cid) {
        showToast('Impossible d\'ouvrir la conversation (droits / RLS).', 'error');
        return;
      }
      window.activeConversation = { type: 'dm', id: memberId, name: name || 'Staff', conversationId: cid };
      window._adminBypassDm = true;
      if (typeof loadConversationHistory === 'function') await loadConversationHistory(cid);
      var titleEl = document.getElementById('chatTitle') || document.querySelector('.chat-title');
      if (titleEl) titleEl.textContent = name || 'Discussion';
      window._adminBypassDm = false;
      applyStaffMessagesUI();
    } catch (e) {
      window._adminBypassDm = false;
      showToast('Impossible d\'ouvrir la conversation', 'error');
    }
  }

  var _origMessageMember = window.messageMember;
  if (typeof _origMessageMember === 'function') {
    window.messageMember = function (memberId) {
      if (typeof isAdmin === 'function' && isAdmin()) {
        if (!canStartDm(memberId)) { showToast('Admin : DM uniquement vers un membre Staff.', 'error'); return; }
        if (typeof closeMemberProfile === 'function') closeMemberProfile();
        var raw = (window.profiles || []).find(function (m) { return m && m.id === memberId; });
        return openStaffDm(memberId, (raw && raw.display_name) || 'Staff');
      }
      if (typeof isHost === 'function' && isHost()) {
        if (!canStartDm(memberId)) {
          showToast('Host : uniquement avec l\'Admin Général.', 'error');
          if (typeof closeMemberProfile === 'function') closeMemberProfile();
          return;
        }
        if (typeof closeMemberProfile === 'function') closeMemberProfile();
        var raw2 = (window.profiles || []).find(function (m) { return m && m.id === memberId; });
        return openStaffDm(memberId, (raw2 && raw2.display_name) || 'Admin');
      }
      if (isStaff()) {
        showToast('Utilisez le groupe Équipe AUPYGO ou le canal Admin.', 'error');
        return;
      }
      var target = (window.profiles || []).find(function (p) { return p && p.id === memberId; });
      if (target && isMemberStaffProfile(target)) {
        showToast('Compte non joignable en privé.', 'error');
        return;
      }
      return _origMessageMember(memberId);
    };
  }

  var _origOpenConv = window.openConversation;
  if (typeof _origOpenConv === 'function') {
    window.openConversation = async function (type, id, name) {
      if (type === 'dm' && isStaff()) {
        if (window._adminBypassDm || canStartDm(id)) return openStaffDm(id, name);
        showToast('Conversation privée non autorisée.', 'error');
        return;
      }
      return _origOpenConv(type, id, name);
    };
  }

  var _origGetDm = window.getOrCreateDmConversation;
  if (typeof _origGetDm === 'function') {
    window.getOrCreateDmConversation = async function (friendId) {
      if (isStaff() && (canStartDm(friendId) || window._adminBypassDm)) return ensureStaffDmConversation(friendId);
      if (isStaff()) { showToast('Conversation privée interdite.', 'error'); return null; }
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
          return (g.title || '').indexOf('Équipe AUPYGO') !== -1;
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
        try { await supabaseClient.from('conversation_members').insert({ conversation_id: staffGroupIdCache, user_id: currentUser.id }); } catch (e) {}
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
    } catch (e) { return null; }
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

  function renameAmisToEquipe() {
    if (!isStaff()) return;
    document.querySelectorAll(
      '#messages h2, #messages h3, #messages .section-title, #messages .tab, #messages .conv-section-title, ' +
      '.messages-sidebar h3, .messages-sidebar h4, [data-i18n*="friend"]'
    ).forEach(function (el) {
      var t = (el.textContent || '').trim();
      if (/^amis$/i.test(t) || t === 'Amis' || /mes amis/i.test(t)) {
        el.textContent = t.replace(/amis/ig, 'Équipe');
      }
    });
    // Labels sidebar
    document.querySelectorAll('#convFriendsList').forEach(function () {
      var prev = document.getElementById('convFriendsList');
      if (prev && prev.previousElementSibling) {
        var h = prev.previousElementSibling;
        if (/amis/i.test(h.textContent || '')) h.textContent = (h.textContent || '').replace(/amis/ig, 'Équipe');
      }
    });
  }

  function labelGroupSenders() {
    if (!isStaff()) return;
    var msgs = document.querySelectorAll(
      '#chatMessages .message, #messagesList .message, .chat-messages .message, .msg-row, .chat-message, [data-message-id], .bubble'
    );
    msgs.forEach(function (msg) {
      if (msg.querySelector('.staff-sender-label')) return;
      var uid = msg.getAttribute('data-user-id') || msg.getAttribute('data-sender') || msg.getAttribute('data-author-id');
      if (!uid) {
        var sub = msg.querySelector('[data-user-id], [data-sender]');
        if (sub) uid = sub.getAttribute('data-user-id') || sub.getAttribute('data-sender');
      }
      var name = null;
      var isAdm = false;
      if (uid) {
        var p = (window.profiles || []).find(function (x) { return x && x.id === uid; });
        if (p) {
          name = p.display_name || null;
          isAdm = p.role === 'admin_general' || p.is_admin === true;
        }
      }
      if (!name) return;
      var col = colorForUser(uid, isAdm);
      var label = document.createElement('div');
      label.className = 'staff-sender-label';
      label.style.cssText = 'font-size:11px;font-weight:800;color:' + col + ';margin-bottom:3px;padding-left:2px;';
      label.textContent = name + (isAdm ? ' · Admin' : '');
      try { msg.insertBefore(label, msg.firstChild); } catch (e) { msg.appendChild(label); }
      // Teinte légère sur la bulle
      if (msg.classList.contains('bubble') || msg.querySelector('.bubble')) {
        var bubble = msg.classList.contains('bubble') ? msg : msg.querySelector('.bubble');
        if (bubble && !bubble.classList.contains('me')) {
          bubble.style.borderLeft = '3px solid ' + col;
        }
      }
    });
  }

  async function applyStaffMessagesUI() {
    if (!isStaff()) return;
    renameAmisToEquipe();

    var friendsList = document.getElementById('convFriendsList');
    var groupsList = document.getElementById('convGroupsList');

    document.querySelectorAll(
      '#createGroupBtn, [onclick*="openCreateGroup"], [onclick*="CreateGroup"], .messages-create-group'
    ).forEach(function (el) { el.style.display = 'none'; });

    if (friendsList) {
      if (typeof isHost === 'function' && isHost() && !(typeof isAdmin === 'function' && isAdmin())) {
        var admin = await findAdminGeneralId();
        if (admin) {
          adminDmCache = admin;
          friendsList.innerHTML =
            '<div class="conversation" onclick="window.openAdminChannel()">' +
            '<div class="conv-avatar" style="background:' + ADMIN_COLOR + ';color:#fff">🛡️</div>' +
            '<div class="conv-meta"><div class="conv-name">Admin Général</div>' +
            '<div class="conv-preview" style="font-size:11px;color:#888">' +
            ((admin.display_name || 'Aupygo') + ' — canal direct') +
            '</div></div></div>';
        } else {
          friendsList.innerHTML = '<p class="conv-empty" style="opacity:0.7">Canal Admin indisponible.</p>';
        }
      } else if (typeof isAdmin === 'function' && isAdmin()) {
        friendsList.innerHTML = '<p class="conv-empty" style="opacity:0.75;font-size:13px">DM avec un Host depuis la carte. Groupe Équipe ci-dessous.</p>';
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
    if (!admin) { showToast('Admin Général introuvable', 'error'); return; }
    await openStaffDm(admin.id, admin.display_name || 'Admin Général');
  };

  window.openStaffGroup = async function () {
    if (!isStaff()) return;
    var gid = await ensureStaffGroup();
    if (!gid) { showToast('Impossible d\'ouvrir le groupe staff', 'error'); return; }
    if (typeof go === 'function' && typeof getActivePage === 'function' && getActivePage() !== 'messages') go('messages');
    window.activeConversation = { type: 'group', id: gid, name: STAFF_GROUP_TITLE, conversationId: gid };
    if (typeof loadConversationHistory === 'function') await loadConversationHistory(gid);
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

  var _origHist = window.loadConversationHistory;
  if (typeof _origHist === 'function') {
    window.loadConversationHistory = async function () {
      var r = await _origHist.apply(this, arguments);
      setTimeout(labelGroupSenders, 250);
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
    if (!isStaff()) return;
    if (typeof getActivePage === 'function' && getActivePage() === 'messages') {
      renameAmisToEquipe();
      labelGroupSenders();
    }
  }, 2500);

  console.log('[AUPYGO] staff-messages.js v3');
})();
