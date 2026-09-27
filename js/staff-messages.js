/* AUPYGO staff-messages.js v6.3 — grades officiels + badges messages */
(function () {
  'use strict';
  if (typeof isStaff !== 'function') return;

  var STAFF_GROUP_TITLE = '🛡️ Équipe AUPYGO';
  var staffGroupIdCache = null;
  var staffMembersCache = [];
  var STAFF_COLORS = ['#7c3aed', '#2563eb', '#db2777', '#ea580c', '#0891b2', '#4f46e5', '#c026d3', '#0d9488'];
  var ADMIN_COLOR = '#16a34a';
  var selectedStaffForGroup = {};

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
        return { error: null };
      }
      return res;
    } catch (e) {
      console.warn('[Staff] safeAddMembers', e);
      return { error: null };
    }
  }

  function isMemberStaffProfile(p) {
    if (!p) return false;
    if (p.is_admin === true) return true;
    if (typeof window.isMemberStaffProfile === 'function' && window.isMemberStaffProfile !== isMemberStaffProfile) {
      try { return window.isMemberStaffProfile(p); } catch (e) {}
    }
    var r = (typeof window.normalizeStaffRole === 'function')
      ? window.normalizeStaffRole(p.role)
      : String(p.role || '').toLowerCase();
    return ['amiral','major_staff','sergent_staff','major_moderateur','sergent_moderateur',
            'admin_general','host','admin','moderator'].indexOf(r) !== -1;
  }

  function roleLabelFor(p) {
    if (!p) return 'Staff';
    var r = (typeof window.normalizeStaffRole === 'function')
      ? window.normalizeStaffRole(p.role)
      : String(p.role || '').toLowerCase();
    if (p.is_admin === true || r === 'amiral' || r === 'admin_general' || r === 'admin') return 'Amiral';
    var map = {
      major_staff: 'Major Staff',
      sergent_staff: 'Sergent Staff',
      major_moderateur: 'Major Mod',
      sergent_moderateur: 'Sergent Mod',
      host: 'Sergent Staff',
      moderator: 'Sergent Mod'
    };
    return map[r] || 'Staff';
  }

  function isAmiralProfile(p) {
    if (!p) return false;
    if (p.is_admin === true) return true;
    var r = (typeof window.normalizeStaffRole === 'function')
      ? window.normalizeStaffRole(p.role)
      : String(p.role || '').toLowerCase();
    return r === 'amiral' || r === 'admin_general' || r === 'admin';
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
      var res = await supabaseClient
        .from('profiles')
        .select('id, display_name, role, is_admin, is_online, last_seen, city, country')
        .or('is_admin.eq.true,role.eq.amiral,role.eq.major_staff,role.eq.sergent_staff,role.eq.major_moderateur,role.eq.sergent_moderateur,role.eq.admin_general,role.eq.host,role.eq.moderator,role.eq.admin')
        .limit(100);
      staffMembersCache = res.data || [];
      return staffMembersCache;
    } catch (e) { return staffMembersCache; }
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
      var all = await supabaseClient.from('conversations')
        .select('id, title, created_at')
        .eq('type', 'group')
        .ilike('title', '%Équipe AUPYGO%')
        .order('created_at', { ascending: true });
      var rows = all.data || [];
      if (rows.length) {
        staffGroupIdCache = rows[0].id;
      } else {
        var created = await supabaseClient.from('conversations').insert({
          created_by: currentUser.id, type: 'group', title: STAFF_GROUP_TITLE
        }).select().single();
        if (created.error || !created.data) return null;
        staffGroupIdCache = created.data.id;
      }
      await syncStaffMembers(staffGroupIdCache);
      await safeAddMembers([{ conversation_id: staffGroupIdCache, user_id: currentUser.id }]);
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
      if (isGroup) {
        var parts = await getParticipantsHtml(convId);
        if (parts) {
          var bar = document.createElement('div');
          bar.id = 'staffParticipantsBar';
          bar.style.cssText = 'padding:8px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-size:12px;margin-bottom:8px;';
          bar.innerHTML = parts;
          box.appendChild(bar);
        }
      }
      if (!data.length) {
        var empty = document.createElement('div');
        empty.className = 'chat-placeholder';
        empty.innerHTML = '<p>Aucun message.</p>';
        box.appendChild(empty);
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
    var isAdm = isAmiralProfile(p);
    var col = colorForUser(senderId, isAdm);
    var grade = roleLabelFor(p);
    var wrap = document.createElement('div');
    wrap.className = 'staff-msg-wrap';
    wrap.style.cssText = 'display:flex;flex-direction:column;margin:6px 0;' +
      (isMe ? 'align-items:flex-end;' : 'align-items:flex-start;');
    var label = document.createElement('div');
    label.className = 'staff-sender-label';
    label.style.cssText = 'font-size:11px;font-weight:800;color:' + col + ';margin:0 6px 2px;';
    label.textContent = name + ' · ' + grade;
    var bubble = document.createElement('div');
    bubble.className = 'bubble' + (isMe ? ' me' : '');
    bubble.textContent = text;
    if (!isMe) bubble.style.borderLeft = '3px solid ' + col;
    wrap.appendChild(label);
    wrap.appendChild(bubble);
    box.appendChild(wrap);
  }

  async function getParticipantsHtml(convId) {
    try {
      var mem = await supabaseClient.from('conversation_members').select('user_id').eq('conversation_id', convId);
      var ids = ((mem && mem.data) || []).map(function (r) { return r.user_id; });
      if (!ids.length) return '';
      await loadStaffMembers();
      var names = ids.map(function (id) {
        var p = profileById(id);
        var n = (p && p.display_name) || 'Membre';
        var isAdm = isAmiralProfile(p);
        var grade = roleLabelFor(p);
        var on = isOnline(p);
        return '<span style="display:inline-flex;align-items:center;gap:4px;margin:2px 6px 2px 0;padding:2px 8px;background:#fff;border-radius:999px;border:1px solid #e2e8f0">' +
          '<span style="width:8px;height:8px;border-radius:50%;background:' + (on ? '#22c55e' : '#94a3b8') + '"></span>' +
          n + ' <strong style="color:' + (isAdm ? ADMIN_COLOR : '#64748b') + '">' + grade + '</strong>' +
          '</span>';
      }).join('');
      return '<strong style="margin-right:8px">Participants (' + ids.length + ') :</strong> ' + names;
    } catch (e) { return ''; }
  }

  function markRead(convId) {
    if (!convId || !window.currentUser) return;
    try {
      if (typeof markConversationRead === 'function') markConversationRead(convId, null);
      if (window.unreadByConversation) window.unreadByConversation[convId] = 0;
      if (typeof updateMessagesBadge === 'function') updateMessagesBadge();
      document.querySelectorAll('#navMessages, #bottomNavMessages, [data-nav="messages"]').forEach(function (el) {
        el.classList.remove('has-unread-messages', 'nav-blink', 'blink', 'pulse');
        var b = el.querySelector('.messages-badge, .badge');
        if (b) { b.textContent = '0'; b.style.display = 'none'; }
      });
    } catch (e) {}
  }

  function escAttr(s) {
    return String(s || '').split("'").join("\\'");
  }

  function buildMemberRow(p) {
    if (!p) return '';
    var isAdm = isAmiralProfile(p);
    var grade = roleLabelFor(p);
    var on = isOnline(p);
    var col = colorForUser(p.id, isAdm);
    var name = p.display_name || grade;
    var loc = [p.city, p.country].filter(Boolean).join(', ');
    var safeName = escAttr(name);
    var html = '';
    html += '<div class="conversation" style="cursor:pointer" onclick="window.openStaffMemberDm(\'' + p.id + '\',\'' + safeName + '\')">';
    html += '<div class="conv-avatar" style="background:' + col + ';color:#fff;position:relative">';
    html += isAdm ? '🛡️' : '👤';
    html += '<span style="position:absolute;bottom:0;right:0;width:10px;height:10px;border-radius:50%;border:2px solid #fff;background:' + (on ? '#22c55e' : '#94a3b8') + '"></span></div>';
    html += '<div class="conv-meta"><div class="conv-name">' + name;
    html += ' <span style="font-size:10px;font-weight:700;color:' + col + '">' + grade + '</span></div>';
    html += '<div class="conv-preview" style="font-size:11px;color:#888">';
    html += (on ? '🟢 En ligne' : '⚫ Hors ligne') + (loc ? ' · ' + loc : '');
    html += '</div></div></div>';
    return html;
  }

  console.log('[AUPYGO] staff-messages.js v6.3 (grades officiels — core helpers)');
  // NOTE: reste du fichier (modals groupes, applyStaffMessagesUI, etc.) conserve le comportement précédent via staff-groups-fix.js
})();
