/* AUPYGO staff-messages.js v6.7 — XSS fix escapeHtml on member rows */
(function () {
  'use strict';
  if (typeof isStaff !== 'function') {
    console.warn('[AUPYGO] staff-messages: isStaff absent, retry later');
  }

  var STAFF_GROUP_TITLE = '🛡️ Équipe AUPYGO';
  var staffGroupIdCache = null;
  var staffMembersCache = [];
  var STAFF_COLORS = ['#7c3aed', '#2563eb', '#db2777', '#ea580c', '#0891b2', '#4f46e5', '#c026d3', '#0d9488'];
  var ADMIN_COLOR = '#16a34a';

  async function safeAddMembers(rows) {
    if (!rows || !rows.length) return { error: null };
    try {
      var res = await supabaseClient
        .from('conversation_members')
        .upsert(rows, { onConflict: 'conversation_id,user_id', ignoreDuplicates: true });
      if (res.error) {
        for (var i = 0; i < rows.length; i++) {
          var r = await supabaseClient.from('conversation_members').insert(rows[i]);
          if (r.error && r.error.code !== '23505' &&
              !/duplicate|conflict|unique|409/i.test(String(r.error.message || '') + String(r.error.code || ''))) {
            console.warn('[Staff] add member', r.error);
          }
        }
      }
      return { error: null };
    } catch (e) {
      return { error: null };
    }
  }

  function isAdmProfile(p) {
    if (!p) return false;
    if (p.is_admin === true) return true;
    var r = (p.role || '').toLowerCase();
    return r === 'amiral' || r === 'admin_general';
  }

  function colorForUser(uid, isAdminUser) {
    if (isAdminUser) return ADMIN_COLOR;
    if (!uid) return '#64748b';
    var h = 0, s = String(uid);
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
      var results = await Promise.all([
        supabaseClient.from('profiles')
          .select('id, display_name, role, is_admin, is_online, last_seen, city, country')
          .eq('is_admin', true).limit(20),
        supabaseClient.from('profiles')
          .select('id, display_name, role, is_admin, is_online, last_seen, city, country')
          .in('role', ['amiral', 'major_staff', 'sergent_staff', 'major_moderateur', 'sergent_moderateur', 'admin_general', 'host', 'moderator'])
          .limit(150)
      ]);
      var map = {};
      results.forEach(function (res) {
        ((res && res.data) || []).forEach(function (p) { if (p && p.id) map[p.id] = p; });
      });
      staffMembersCache = Object.keys(map).map(function (k) { return map[k]; });
      return staffMembersCache;
    } catch (e) {
      console.warn('[Staff] loadStaffMembers', e);
      return staffMembersCache;
    }
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
      var created = await supabaseClient.from('conversations')
        .insert({ created_by: currentUser.id, type: 'dm', title: null }).select().single();
      if (created.error || !created.data) return null;
      var cid = created.data.id;
      await safeAddMembers([
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
      if (!cid) { showToast('Impossible d ouvrir la conversation (RLS).', 'error'); return; }
      window.activeConversation = { type: 'dm', id: memberId, name: name || 'Staff', conversationId: cid };
      await renderStaffChat(cid, false);
      markRead(cid);
      applyStaffMessagesUI();
    } catch (e) {
      showToast('Impossible d ouvrir la conversation', 'error');
    }
  }

  window.openStaffMemberDm = function (id, name) { return openStaffDm(id, name); };

  async function ensureStaffGroup() {
    if (!isStaff() || !window.currentUser) return null;
    if (staffGroupIdCache) return staffGroupIdCache;
    try {
      var res = await supabaseClient.rpc('get_or_create_staff_group');
      if (res.error || !res.data) {
        console.warn('[Staff] get_or_create_staff_group', res.error);
        return null;
      }
      staffGroupIdCache = res.data;
      return staffGroupIdCache;
    } catch (e) { return null; }
  }
  async function syncStaffMembers(convId) {
    if (!convId) return;
    try {
      var list = await loadStaffMembers();
      var existing = await supabaseClient.from('conversation_members').select('user_id').eq('conversation_id', convId);
      var have = new Set(((existing && existing.data) || []).map(function (r) { return r.user_id; }));
      var toAdd = list.filter(function (s) { return !have.has(s.id); }).map(function (s) {
        return { conversation_id: convId, user_id: s.id };
      });
      if (toAdd.length) await safeAddMembers(toAdd);
    } catch (e) {}
  }

  async function renderStaffChat(convId, isGroup) {
    var box = document.getElementById('chatMessages');
    if (!box || !convId) return;
    await loadStaffMembers();
    try {
      var res = await supabaseClient.from('messages')
        .select('id, content, sender_id, created_at')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true })
        .limit(300);
      var data = res.data || [];
      box.innerHTML = '';
      if (!data.length) {
        box.innerHTML = '<div class="chat-placeholder"><p>Aucun message.</p></div>';
        return;
      }
      data.forEach(function (m) {
        appendNamedBubble(m.content, m.sender_id);
      });
      box.scrollTop = box.scrollHeight;
    } catch (e) {
      console.warn('[Staff] renderStaffChat', e);
    }
  }

  function appendNamedBubble(text, senderId) {
    var box = document.getElementById('chatMessages');
    if (!box) return;
    var isMe = window.currentUser && senderId === window.currentUser.id;
    var p = profileById(senderId);
    var name = (p && p.display_name) || (isMe ? 'Moi' : 'Staff');
    var isAdm = isAdmProfile(p);
    var col = colorForUser(senderId, isAdm);
    var wrap = document.createElement('div');
    wrap.className = 'staff-msg-wrap';
    wrap.style.cssText = 'display:flex;flex-direction:column;margin:6px 0;' +
      (isMe ? 'align-items:flex-end;' : 'align-items:flex-start;');
    var label = document.createElement('div');
    label.className = 'staff-sender-label';
    label.style.cssText = 'font-size:11px;font-weight:800;color:' + col + ';margin:0 6px 2px;';
    label.textContent = name + (isAdm ? ' · Amiral' : '');
    var bubble = document.createElement('div');
    bubble.className = 'bubble' + (isMe ? ' me' : '');
    bubble.textContent = text;
    if (!isMe) bubble.style.borderLeft = '3px solid ' + col;
    wrap.appendChild(label);
    wrap.appendChild(bubble);
    box.appendChild(wrap);
  }

  function markRead(convId) {
    if (!convId || !window.currentUser) return;
    try {
      if (typeof markConversationRead === 'function') markConversationRead(convId, null);
      if (window.unreadByConversation) window.unreadByConversation[convId] = 0;
      if (typeof updateMessagesBadge === 'function') updateMessagesBadge();
    } catch (e) {}
  }

  /* XSS fix: full HTML + attribute escaping */
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function escAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function buildMemberRow(p) {
    if (!p) return '';
    var isAdm = isAdmProfile(p);
    var on = isOnline(p);
    var col = colorForUser(p.id, isAdm);
    var rawName = p.display_name || (isAdm ? 'Amiral' : 'Staff');
    var name = escapeHtml(rawName);
    var loc = escapeHtml([p.city, p.country].filter(Boolean).join(', '));
    var safeName = escAttr(rawName);
    var html = '';
    html += '<div class="conversation" style="cursor:pointer" onclick="window.openStaffMemberDm(\'' + p.id + '\',\'' + safeName + '\')">';
    html += '<div class="conv-avatar" style="background:' + col + ';color:#fff;position:relative">';
    html += isAdm ? '🛡️' : '👤';
    html += '<span style="position:absolute;bottom:0;right:0;width:10px;height:10px;border-radius:50%;border:2px solid #fff;background:' + (on ? '#22c55e' : '#94a3b8') + '"></span></div>';
    html += '<div class="conv-meta"><div class="conv-name">' + name;
    html += ' <span style="font-size:10px;font-weight:700;color:' + col + '">' + (isAdm ? 'Amiral' : 'Staff') + '</span></div>';
    html += '<div class="conv-preview" style="font-size:11px;color:#888">';
    html += (on ? '🟢 En ligne' : '⚫ Hors ligne') + (loc ? ' · ' + loc : '');
    html += '</div></div></div>';
    return html;
  }

  async function applyStaffMessagesUI() {
    if (typeof isStaff !== 'function' || !isStaff()) return;
    document.querySelectorAll(
      '#messages .conv-section-label, #messages h2, #messages h3, #messages h4, #messages .section-title'
    ).forEach(function (el) {
      var t = (el.textContent || '').trim();
      if (/^amis$/i.test(t) || /^équipe$/i.test(t) || /^equipe$/i.test(t) || /^staff$/i.test(t)) {
        el.textContent = 'Équipe';
      }
    });
    document.querySelectorAll('#messages .section-title p, #messages p[data-i18n]').forEach(function (el) {
      if (/échange|echange|membres aupygo|tes amis aupygo/i.test(el.textContent || '')) el.style.display = 'none';
    });
    document.querySelectorAll('#messages p, #messages .conv-empty').forEach(function (el) {
      if (/Aucun ami|ajoute des amis/i.test(el.textContent || '')) el.style.display = 'none';
    });
    document.querySelectorAll('.btn-create-group, #createGroupBtn, [onclick*="openCreateGroup"]').forEach(function (el) {
      if (typeof isAdmin === 'function' && isAdmin()) {
        el.style.display = '';
      } else {
        el.style.display = 'none';
      }
    });

    var list = await loadStaffMembers();
    var me = window.currentUser && window.currentUser.id;
    var friendsList = document.getElementById('convFriendsList');
    var groupsList = document.getElementById('convGroupsList');

    if (friendsList) {
      if (typeof isAdmin === 'function' && isAdmin()) {
        var others = list.filter(function (p) { return p && p.id !== me; });
        friendsList.innerHTML = others.length ? others.map(buildMemberRow).join('') :
          '<p class="conv-empty" style="opacity:0.7;font-size:12px;padding:8px">Aucun membre Staff.</p>';
      } else if (typeof isStaff === 'function' && isStaff()) {
        var admin = list.find(function (p) { return isAdmProfile(p); });
        friendsList.innerHTML = admin ? buildMemberRow(admin) : '<p class="conv-empty">Amiral introuvable.</p>';
      } else {
        friendsList.innerHTML = '';
      }
    }

    var gid = await ensureStaffGroup();
    if (groupsList) {
      var active = window.activeConversation && window.activeConversation.conversationId === gid ? ' active' : '';
      var html =
        '<div class="conversation' + active + '" onclick="window.openStaffGroup && window.openStaffGroup()">' +
        '<div class="conv-avatar" style="background:#111;color:#fff">🛡️</div>' +
        '<div class="conv-meta"><div class="conv-name">' + STAFF_GROUP_TITLE + '</div>' +
        '<div class="conv-preview" style="font-size:11px;color:#888">Canal officiel · ' +
        list.length + ' membre(s)</div></div></div>';
      groupsList.innerHTML = html;
    }
  }

  window.applyStaffMessagesUI = applyStaffMessagesUI;

  window.openStaffGroup = async function () {
    if (typeof isStaff !== 'function' || !isStaff()) return;
    var gid = await ensureStaffGroup();
    if (!gid) { showToast('Impossible d ouvrir le groupe', 'error'); return; }
    if (typeof go === 'function' && typeof getActivePage === 'function' && getActivePage() !== 'messages') go('messages');
    window.activeConversation = { type: 'group', id: gid, name: STAFF_GROUP_TITLE, conversationId: gid };
    await renderStaffChat(gid, true);
    markRead(gid);
    applyStaffMessagesUI();
  };

  var _origSidebar = window.renderConversationSidebar;
  if (typeof _origSidebar === 'function') {
    window.renderConversationSidebar = function () {
      if (typeof isStaff === 'function' && isStaff()) { applyStaffMessagesUI(); return; }
      return _origSidebar.apply(this, arguments);
    };
  }

  var _origHist = window.loadConversationHistory;
  if (typeof _origHist === 'function') {
    window.loadConversationHistory = async function (convId) {
      if (typeof isStaff === 'function' && isStaff()) {
        var cid = convId || (window.activeConversation && window.activeConversation.conversationId);
        var isG = window.activeConversation && window.activeConversation.type === 'group';
        await renderStaffChat(cid, !!isG);
        markRead(cid);
        return;
      }
      return _origHist.apply(this, arguments);
    };
  }

  var prevGo = window.go;
  if (typeof prevGo === 'function' && !window._staffMsgGo66) {
    window._staffMsgGo66 = true;
    window.go = function (page) {
      prevGo(page);
      if (page === 'messages' && typeof isStaff === 'function' && isStaff()) {
        setTimeout(applyStaffMessagesUI, 250);
        setTimeout(applyStaffMessagesUI, 1000);
      }
    };
  }

  setTimeout(function () {
    if (typeof isStaff === 'function' && isStaff() && typeof getActivePage === 'function' && getActivePage() === 'messages') {
      applyStaffMessagesUI();
    }
  }, 1200);

  setInterval(function () {
    if (typeof isStaff !== 'function' || !isStaff()) return;
    if (typeof getActivePage === 'function' && getActivePage() === 'messages') {
      document.querySelectorAll('#messages .conv-section-label').forEach(function (el) {
        var t = (el.textContent || '').trim();
        if (/^amis$/i.test(t) || /^staff$/i.test(t) || /^équipe$/i.test(t) || /^equipe$/i.test(t)) {
          el.textContent = 'Équipe';
        }
      });
    }
  }, 2000);

  console.log('[AUPYGO] staff-messages.js v6.7 (XSS escapeHtml member rows)');
})();
