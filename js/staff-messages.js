/* AUPYGO staff-messages.js v4
 * - Liste membres sous Équipe (Admin + Hosts, online/offline)
 * - Prénom + couleur sur chaque message du groupe
 * - VERT = Admin Général
 */
(function () {
  'use strict';
  if (typeof isStaff !== 'function') return;

  var STAFF_GROUP_TITLE = '🛡️ Équipe AUPYGO';
  var staffGroupIdCache = null;
  var adminDmCache = null;
  var staffMembersCache = [];

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

  function profileById(uid) {
    var p = (window.profiles || []).find(function (x) { return x && x.id === uid; });
    if (p) return p;
    return staffMembersCache.find(function (x) { return x && x.id === uid; }) || null;
  }

  function isOnline(p) {
    if (!p) return false;
    if (p.is_online === true) return true;
    if (!p.last_seen) return false;
    return (Date.now() - new Date(p.last_seen).getTime()) < 15 * 60 * 1000;
  }

  async function loadStaffMembers() {
    try {
      var res = await supabaseClient
        .from('profiles')
        .select('id, display_name, role, is_admin, is_online, last_seen, city, country')
        .or('is_admin.eq.true,role.eq.admin_general,role.eq.host')
        .limit(100);
      staffMembersCache = res.data || [];
      return staffMembersCache;
    } catch (e) {
      return staffMembersCache;
    }
  }

  async function findAdminGeneralId() {
    var list = staffMembersCache.length ? staffMembersCache : await loadStaffMembers();
    return list.find(function (r) { return r.role === 'admin_general' || r.is_admin === true; }) || null;
  }

  function canStartDm(targetUserId) {
    if (typeof isAdmin === 'function' && isAdmin()) {
      var target = profileById(targetUserId);
      return !!(target && isMemberStaffProfile(target));
    }
    if (typeof isHost === 'function' && isHost()) {
      var t = profileById(targetUserId);
      return !!(t && (t.role === 'admin_general' || t.is_admin === true));
    }
    return false;
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
      if (created.error || !created.data) {
        console.warn('[Staff] create dm', created.error);
        return null;
      }
      var cid = created.data.id;
      await supabaseClient.from('conversation_members').insert([
        { conversation_id: cid, user_id: currentUser.id },
        { conversation_id: cid, user_id: otherUserId }
      ]);
      return cid;
    } catch (e) {
      console.warn('[Staff] ensureStaffDm', e);
      return null;
    }
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
      var titleEl = document.getElementById('chatTitle') || document.querySelector('.chat-header-title');
      if (titleEl) titleEl.textContent = '💬 ' + (name || 'Discussion');
      window._adminBypassDm = false;
      applyStaffMessagesUI();
    } catch (e) {
      window._adminBypassDm = false;
      showToast('Impossible d\'ouvrir la conversation', 'error');
    }
  }

  window.openStaffMemberDm = function (memberId, name) {
    return openStaffDm(memberId, name);
  };

  var _origMessageMember = window.messageMember;
  if (typeof _origMessageMember === 'function') {
    window.messageMember = function (memberId) {
      if (isStaff()) {
        if (!canStartDm(memberId)) {
          showToast(typeof isAdmin === 'function' && isAdmin()
            ? 'DM uniquement vers un membre Staff.'
            : 'Uniquement avec l\'Admin Général.', 'error');
          return;
        }
        if (typeof closeMemberProfile === 'function') closeMemberProfile();
        var raw = profileById(memberId);
        return openStaffDm(memberId, (raw && raw.display_name) || 'Staff');
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
      var anyStaff = await supabaseClient.from('conversations').select('id, title').eq('type', 'group').ilike('title', '%Équipe AUPYGO%').limit(1);
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
      var list = await loadStaffMembers();
      if (!list.length) return;
      var existing = await supabaseClient.from('conversation_members').select('user_id').eq('conversation_id', convId);
      var have = new Set(((existing && existing.data) || []).map(function (r) { return r.user_id; }));
      var toAdd = list.filter(function (s) { return !have.has(s.id); }).map(function (s) {
        return { conversation_id: convId, user_id: s.id };
      });
      if (toAdd.length) await supabaseClient.from('conversation_members').insert(toAdd);
    } catch (e) {}
  }

  function renameAmisToEquipe() {
    if (!isStaff()) return;
    document.querySelectorAll(
      '#messages h2, #messages h3, #messages .section-title, #messages .tab, #messages .conv-section-title, .messages-sidebar h3, .messages-sidebar h4'
    ).forEach(function (el) {
      var t = (el.textContent || '').trim();
      if (/amis/i.test(t)) el.textContent = t.replace(/amis/ig, 'Équipe');
    });
  }

  /** Patch appendBubble pour stocker sender + afficher prénom */
  var _origAppend = window.appendBubble;
  if (typeof _origAppend === 'function' && !window._staffAppendPatched) {
    window._staffAppendPatched = true;
    window.appendBubble = function (text, isMe, createdAt, senderId) {
      _origAppend(text, isMe, createdAt);
      if (!isStaff()) return;
      var box = document.getElementById('chatMessages');
      if (!box) return;
      var bubbles = box.querySelectorAll('.bubble');
      var last = bubbles[bubbles.length - 1];
      if (!last || last.getAttribute('data-staff-labeled')) return;

      var uid = senderId || (isMe && window.currentUser ? window.currentUser.id : null);
      if (uid) last.setAttribute('data-user-id', uid);

      var p = uid ? profileById(uid) : null;
      var name = p ? (p.display_name || 'Staff') : (isMe ? 'Moi' : null);
      var isAdm = p && (p.role === 'admin_general' || p.is_admin === true);
      if (!name) return;

      var col = colorForUser(uid, isAdm);
      var wrap = document.createElement('div');
      wrap.className = 'staff-msg-wrap';
      wrap.setAttribute('data-staff-labeled', '1');
      wrap.style.cssText = 'display:flex;flex-direction:column;' + (isMe ? 'align-items:flex-end;' : 'align-items:flex-start;');

      var label = document.createElement('div');
      label.className = 'staff-sender-label';
      label.style.cssText = 'font-size:11px;font-weight:800;color:' + col + ';margin:4px 4px 2px;';
      label.textContent = name + (isAdm ? ' · Admin' : '');

      last.setAttribute('data-staff-labeled', '1');
      if (!isMe) last.style.borderLeft = '3px solid ' + col;

      try {
        last.parentNode.insertBefore(wrap, last);
        wrap.appendChild(label);
        wrap.appendChild(last);
      } catch (e) {
        try { last.parentNode.insertBefore(label, last); } catch (e2) {}
      }
    };
  }

  /** Recharge l'historique avec prénoms */
  async function renderStaffGroupHistory(convId) {
    if (!convId) return;
    var box = document.getElementById('chatMessages');
    if (!box) return;
    try {
      await loadStaffMembers();
      var res = await supabaseClient
        .from('messages')
        .select('id, content, sender_id, created_at')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true })
        .limit(200);
      var data = res.data || [];
      box.innerHTML = '';
      if (!data.length) {
        box.innerHTML = '<div class="chat-placeholder"><p>Aucun message. Écris le premier !</p></div>';
        return;
      }
      var lastDate = null;
      data.forEach(function (m) {
        var dk = m.created_at ? String(m.created_at).slice(0, 10) : null;
        if (dk && dk !== lastDate) {
          var sep = document.createElement('div');
          sep.className = 'chat-date-separator';
          try {
            sep.innerHTML = '<span>' + new Date(m.created_at).toLocaleDateString('fr-FR') + '</span>';
          } catch (e) { sep.innerHTML = '<span>' + dk + '</span>'; }
          box.appendChild(sep);
          lastDate = dk;
        }
        var isMe = window.currentUser && m.sender_id === window.currentUser.id;
        if (typeof appendBubble === 'function') {
          appendBubble(m.content, isMe, m.created_at, m.sender_id);
        }
      });
      box.scrollTop = box.scrollHeight;
    } catch (e) {
      console.warn('[Staff] history', e);
    }
  }

  function buildEquipeListHtml(list) {
    if (!list || !list.length) {
      return '<p class="conv-empty" style="opacity:0.7;font-size:12px;padding:8px">Aucun membre Staff.</p>';
    }
    var me = window.currentUser && window.currentUser.id;
    return list.map(function (p) {
      if (!p || p.id === me) return '';
      var isAdm = p.role === 'admin_general' || p.is_admin === true;
      var on = isOnline(p);
      var col = colorForUser(p.id, isAdm);
      var roleLabel = isAdm ? 'Admin' : 'Host';
      var name = p.display_name || roleLabel;
      var loc = [p.city, p.country].filter(Boolean).join(', ');
      return (
        '<div class="conversation" style="cursor:pointer" onclick="window.openStaffMemberDm(\'' + p.id + '\',\'' +
        String(name).replace(/'/g, '\\'') + '\')">' +
        '<div class="conv-avatar" style="background:' + col + ';color:#fff;position:relative">' +
        (isAdm ? '🛡️' : '👤') +
        '<span style="position:absolute;bottom:0;right:0;width:10px;height:10px;border-radius:50%;border:2px solid #fff;background:' +
        (on ? '#22c55e' : '#94a3b8') + '"></span></div>' +
        '<div class="conv-meta"><div class="conv-name">' + name +
        ' <span style="font-size:10px;font-weight:700;color:' + col + '">' + roleLabel + '</span></div>' +
        '<div class="conv-preview" style="font-size:11px;color:#888">' +
        (on ? '🟢 En ligne' : '⚫ Hors ligne') + (loc ? ' · ' + loc : '') +
        '</div></div></div>'
      );
    }).join('');
  }

  async function applyStaffMessagesUI() {
    if (!isStaff()) return;
    renameAmisToEquipe();

    var friendsList = document.getElementById('convFriendsList');
    var groupsList = document.getElementById('convGroupsList');

    document.querySelectorAll(
      '#createGroupBtn, [onclick*="openCreateGroup"], [onclick*="CreateGroup"], .messages-create-group'
    ).forEach(function (el) { el.style.display = 'none'; });

    var list = await loadStaffMembers();

    if (friendsList) {
      if (typeof isAdmin === 'function' && isAdmin()) {
        // Liste tous les hosts (+ autres admin si plusieurs)
        var hosts = list.filter(function (p) {
          return p && (p.role === 'host' || (p.role === 'admin_general' && p.id !== (window.currentUser && window.currentUser.id)));
        });
        friendsList.innerHTML = buildEquipeListHtml(hosts.length ? hosts : list);
      } else if (typeof isHost === 'function' && isHost()) {
        var admin = await findAdminGeneralId();
        adminDmCache = admin;
        friendsList.innerHTML = admin
          ? buildEquipeListHtml([admin])
          : '<p class="conv-empty" style="opacity:0.7">Admin introuvable.</p>';
      } else {
        friendsList.innerHTML = buildEquipeListHtml(list);
      }
    }

    var gid = await ensureStaffGroup();
    if (groupsList) {
      var active = window.activeConversation && window.activeConversation.conversationId === gid ? ' active' : '';
      groupsList.innerHTML =
        '<div class="conversation' + active + '" onclick="window.openStaffGroup()">' +
        '<div class="conv-avatar" style="background:#111;color:#fff">🛡️</div>' +
        '<div class="conv-meta"><div class="conv-name">' + STAFF_GROUP_TITLE + '</div>' +
        '<div class="conv-preview" style="font-size:11px;color:#888">Canal officiel · ' +
        list.length + ' membre(s)</div></div></div>';
    }
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
    await renderStaffGroupHistory(gid);
    applyStaffMessagesUI();
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
    window.loadConversationHistory = async function (convId) {
      if (isStaff() && window.activeConversation && window.activeConversation.type === 'group') {
        await renderStaffGroupHistory(convId || window.activeConversation.conversationId);
        return;
      }
      var r = await _origHist.apply(this, arguments);
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
    if (typeof getActivePage === 'function' && getActivePage() === 'messages') renameAmisToEquipe();
  }, 3000);

  console.log('[AUPYGO] staff-messages.js v4');
})();
