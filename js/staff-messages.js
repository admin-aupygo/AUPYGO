/* AUPYGO staff-messages.js v6 — Staff tab + groupes Admin */
(function () {
  'use strict';
  if (typeof isStaff !== 'function') return;

  var STAFF_GROUP_TITLE = '🛡️ Équipe AUPYGO';
  var staffGroupIdCache = null;
  var staffMembersCache = [];
  var STAFF_COLORS = ['#7c3aed', '#2563eb', '#db2777', '#ea580c', '#0891b2', '#4f46e5', '#c026d3', '#0d9488'];
  var ADMIN_COLOR = '#16a34a';
  var selectedStaffForGroup = {};

  function isMemberStaffProfile(p) {
    if (!p) return false;
    if (p.is_admin === true) return true;
    var r = (p.role || '').toLowerCase();
    return r === 'admin_general' || r === 'host' || r === 'admin' || r === 'moderator';
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
        .or('is_admin.eq.true,role.eq.admin_general,role.eq.host')
        .limit(100);
      staffMembersCache = res.data || [];
      return staffMembersCache;
    } catch (e) { return staffMembersCache; }
  }

  function canStartDm(targetUserId) {
    if (typeof isAdmin === 'function' && isAdmin()) {
      var t = profileById(targetUserId);
      return !!(t && isMemberStaffProfile(t) && t.id !== (window.currentUser && window.currentUser.id));
    }
    if (typeof isHost === 'function' && isHost()) {
      var t2 = profileById(targetUserId);
      return !!(t2 && (t2.role === 'admin_general' || t2.is_admin === true));
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
      var created = await supabaseClient.from('conversations')
        .insert({ created_by: currentUser.id, type: 'dm', title: null }).select().single();
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
        if (typeof isAdmin === 'function' && isAdmin() && rows.length > 1) {
          for (var i = 1; i < rows.length; i++) {
            try {
              await supabaseClient.from('conversation_members').delete().eq('conversation_id', rows[i].id);
              await supabaseClient.from('messages').delete().eq('conversation_id', rows[i].id);
              await supabaseClient.from('conversations').delete().eq('id', rows[i].id);
            } catch (e) {}
          }
        }
      } else {
        var created = await supabaseClient.from('conversations').insert({
          created_by: currentUser.id, type: 'group', title: STAFF_GROUP_TITLE
        }).select().single();
        if (created.error || !created.data) return null;
        staffGroupIdCache = created.data.id;
      }
      await syncStaffMembers(staffGroupIdCache);
      try {
        await supabaseClient.from('conversation_members')
          .insert({ conversation_id: staffGroupIdCache, user_id: currentUser.id });
      } catch (e) {}
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
      if (toAdd.length) await supabaseClient.from('conversation_members').insert(toAdd);
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
    var isAdm = p && (p.role === 'admin_general' || p.is_admin === true);
    var col = colorForUser(senderId, isAdm);

    var wrap = document.createElement('div');
    wrap.className = 'staff-msg-wrap';
    wrap.style.cssText = 'display:flex;flex-direction:column;margin:6px 0;' +
      (isMe ? 'align-items:flex-end;' : 'align-items:flex-start;');

    var label = document.createElement('div');
    label.className = 'staff-sender-label';
    label.style.cssText = 'font-size:11px;font-weight:800;color:' + col + ';margin:0 6px 2px;';
    label.textContent = name + (isAdm ? ' · Admin' : '');

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
      var mem = await supabaseClient.from('conversation_members')
        .select('user_id').eq('conversation_id', convId);
      var ids = ((mem && mem.data) || []).map(function (r) { return r.user_id; });
      if (!ids.length) return '';
      await loadStaffMembers();
      var names = ids.map(function (id) {
        var p = profileById(id);
        var n = (p && p.display_name) || 'Membre';
        var isAdm = p && (p.role === 'admin_general' || p.is_admin === true);
        var on = isOnline(p);
        return '<span style="display:inline-flex;align-items:center;gap:4px;margin:2px 6px 2px 0;padding:2px 8px;background:#fff;border-radius:999px;border:1px solid #e2e8f0">' +
          '<span style="width:8px;height:8px;border-radius:50%;background:' + (on ? '#22c55e' : '#94a3b8') + '"></span>' +
          n + (isAdm ? ' <strong style="color:' + ADMIN_COLOR + '">Admin</strong>' : '') +
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
    var isAdm = p.role === 'admin_general' || p.is_admin === true;
    var on = isOnline(p);
    var col = colorForUser(p.id, isAdm);
    var name = p.display_name || (isAdm ? 'Admin' : 'Host');
    var loc = [p.city, p.country].filter(Boolean).join(', ');
    var safeName = escAttr(name);
    var html = '';
    html += '<div class="conversation" style="cursor:pointer" onclick="window.openStaffMemberDm(\'' + p.id + '\',\'' + safeName + '\')">';
    html += '<div class="conv-avatar" style="background:' + col + ';color:#fff;position:relative">';
    html += isAdm ? '🛡️' : '👤';
    html += '<span style="position:absolute;bottom:0;right:0;width:10px;height:10px;border-radius:50%;border:2px solid #fff;background:' + (on ? '#22c55e' : '#94a3b8') + '"></span></div>';
    html += '<div class="conv-meta"><div class="conv-name">' + name;
    html += ' <span style="font-size:10px;font-weight:700;color:' + col + '">' + (isAdm ? 'Admin' : 'Host') + '</span></div>';
    html += '<div class="conv-preview" style="font-size:11px;color:#888">';
    html += (on ? '🟢 En ligne' : '⚫ Hors ligne') + (loc ? ' · ' + loc : '');
    html += '</div></div></div>';
    return html;
  }

  /* ---- Création de groupe Admin (membres Staff uniquement) ---- */
  window.openAdminStaffGroupModal = async function () {
    if (!(typeof isAdmin === 'function' && isAdmin())) return;
    selectedStaffForGroup = {};
    var list = await loadStaffMembers();
    var me = window.currentUser && window.currentUser.id;
    var others = list.filter(function (p) { return p && p.id !== me; });

    var overlay = document.getElementById('adminStaffGroupOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'adminStaffGroupOverlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:10050;display:flex;align-items:center;justify-content:center;padding:16px';
      overlay.onclick = function (e) { if (e.target === overlay) overlay.style.display = 'none'; };
      overlay.innerHTML =
        '<div style="background:#fff;border-radius:18px;padding:22px;max-width:420px;width:100%;max-height:85vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.2)">' +
        '<h3 style="margin:0 0 6px;text-align:center">Créer un groupe Staff</h3>' +
        '<p style="font-size:13px;color:#64748b;text-align:center;margin:0 0 14px">Choisis les membres Staff à inclure</p>' +
        '<label style="font-size:13px;font-weight:700">Titre du groupe</label>' +
        '<input id="adminGroupTitleInput" type="text" maxlength="40" placeholder="Ex : Équipe France" ' +
        'style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:12px;margin:6px 0 14px;font-size:14px;box-sizing:border-box">' +
        '<label style="font-size:13px;font-weight:700">Membres Staff <span id="adminGroupPickCount" style="color:#94a3b8;font-weight:400">(0)</span></label>' +
        '<div id="adminGroupPickList" style="margin:8px 0 16px;max-height:240px;overflow:auto;border:1px solid #e2e8f0;border-radius:12px;padding:8px"></div>' +
        '<button type="button" class="btn btn-primary" style="width:100%;margin-bottom:8px" onclick="window.createAdminStaffGroup()">Créer le groupe</button>' +
        '<button type="button" class="btn btn-secondary" style="width:100%" onclick="document.getElementById(\'adminStaffGroupOverlay\').style.display=\'none\'">Annuler</button>' +
        '</div>';
      document.body.appendChild(overlay);
    }

    var pickList = document.getElementById('adminGroupPickList');
    if (!others.length) {
      pickList.innerHTML = '<p style="padding:12px;color:#94a3b8;font-size:13px">Aucun membre Staff disponible.</p>';
    } else {
      pickList.innerHTML = others.map(function (p) {
        var isAdm = p.role === 'admin_general' || p.is_admin === true;
        var name = p.display_name || (isAdm ? 'Admin' : 'Host');
        return '<label style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:10px;cursor:pointer">' +
          '<input type="checkbox" data-staff-id="' + p.id + '" onchange="window.toggleStaffGroupPick(\'' + p.id + '\', this.checked)" style="width:18px;height:18px">' +
          '<span style="font-weight:600;font-size:13px">' + name +
          ' <span style="font-size:11px;color:#64748b">' + (isAdm ? 'Admin' : 'Host') + '</span></span></label>';
      }).join('');
    }

    var titleIn = document.getElementById('adminGroupTitleInput');
    if (titleIn) titleIn.value = '';
    var cnt = document.getElementById('adminGroupPickCount');
    if (cnt) cnt.textContent = '(0)';
    overlay.style.display = 'flex';
  };

  window.toggleStaffGroupPick = function (id, checked) {
    if (checked) selectedStaffForGroup[id] = true;
    else delete selectedStaffForGroup[id];
    var cnt = document.getElementById('adminGroupPickCount');
    if (cnt) cnt.textContent = '(' + Object.keys(selectedStaffForGroup).length + ')';
  };

  window.createAdminStaffGroup = async function () {
    if (!(typeof isAdmin === 'function' && isAdmin())) return;
    var titleIn = document.getElementById('adminGroupTitleInput');
    var title = (titleIn && titleIn.value || '').trim();
    if (!title) { showToast('Titre du groupe requis', 'error'); return; }
    var ids = Object.keys(selectedStaffForGroup);
    if (!ids.length) { showToast('Sélectionne au moins un membre Staff', 'error'); return; }

    try {
      var created = await supabaseClient.from('conversations').insert({
        created_by: currentUser.id,
        type: 'group',
        title: title
      }).select().single();
      if (created.error || !created.data) {
        showToast('Erreur création: ' + ((created.error && created.error.message) || ''), 'error');
        return;
      }
      var cid = created.data.id;
      var members = [{ conversation_id: cid, user_id: currentUser.id }];
      ids.forEach(function (uid) {
        members.push({ conversation_id: cid, user_id: uid });
      });
      var ins = await supabaseClient.from('conversation_members').insert(members);
      if (ins.error) {
        showToast('Groupe créé mais membres partiels: ' + ins.error.message, 'error');
      } else {
        showToast('Groupe « ' + title + ' » créé', 'success');
      }
      var ov = document.getElementById('adminStaffGroupOverlay');
      if (ov) ov.style.display = 'none';
      await applyStaffMessagesUI();
      window.activeConversation = { type: 'group', id: cid, name: title, conversationId: cid };
      await renderStaffChat(cid, true);
    } catch (e) {
      showToast('Erreur: ' + (e.message || e), 'error');
    }
  };

  // Intercepter le bouton + Groupe natif pour Admin
  var _origOpenCreate = window.openCreateGroupModal;
  if (typeof _origOpenCreate === 'function') {
    window.openCreateGroupModal = function () {
      if (typeof isAdmin === 'function' && isAdmin()) {
        return window.openAdminStaffGroupModal();
      }
      if (isStaff()) {
        showToast('Seul l Admin peut créer des groupes.', 'error');
        return;
      }
      return _origOpenCreate.apply(this, arguments);
    };
  } else {
    window.openCreateGroupModal = function () {
      if (typeof isAdmin === 'function' && isAdmin()) return window.openAdminStaffGroupModal();
      if (isStaff()) showToast('Seul l Admin peut créer des groupes.', 'error');
    };
  }

  async function applyStaffMessagesUI() {
    if (!isStaff()) return;

    // 1) Onglet Amis → Staff
    document.querySelectorAll(
      '#messages .conv-section-label, #messages h2, #messages h3, #messages h4, ' +
      '#messages .section-title, .messages-sidebar h3, .messages-sidebar h4'
    ).forEach(function (el) {
      var t = (el.textContent || '').trim();
      if (/^amis$/i.test(t) || /mes amis/i.test(t) || /^équipe$/i.test(t) || /^equipe$/i.test(t)) {
        el.textContent = 'Staff';
      }
    });

    // 2) Supprimer sous-titre "Échange avec..."
    document.querySelectorAll('#messages .section-title p, #messages > .section-title p, #messages p[data-i18n]').forEach(function (el) {
      var t = (el.textContent || '').toLowerCase();
      if (/échange|echange|membres aupygo|tes amis aupygo/i.test(t)) {
        el.style.display = 'none';
      }
    });

    // Texte vide amis
    document.querySelectorAll('#messages p, #messages .conv-empty').forEach(function (el) {
      if (/Aucun ami|ajoute des amis/i.test(el.textContent || '')) el.style.display = 'none';
    });

    // 3) Bouton + Groupe : Admin seulement → ouvre modal Staff
    document.querySelectorAll('.btn-create-group, #createGroupBtn, [onclick*="openCreateGroup"]').forEach(function (el) {
      if (typeof isAdmin === 'function' && isAdmin()) {
        el.style.display = '';
        el.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation();
          window.openAdminStaffGroupModal();
        };
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
        friendsList.innerHTML = others.length
          ? others.map(buildMemberRow).join('')
          : '<p class="conv-empty" style="opacity:0.7;font-size:12px;padding:8px">Aucun membre Staff.</p>';
      } else if (typeof isHost === 'function' && isHost()) {
        var admin = list.find(function (p) { return p.role === 'admin_general' || p.is_admin === true; });
        friendsList.innerHTML = admin
          ? buildMemberRow(admin)
          : '<p class="conv-empty" style="opacity:0.7">Admin introuvable.</p>';
      } else {
        friendsList.innerHTML = '';
      }
    }

    var gid = await ensureStaffGroup();

    if (groupsList) {
      var active = window.activeConversation && window.activeConversation.conversationId === gid ? ' active' : '';
      var html =
        '<div class="conversation' + active + '" onclick="window.openStaffGroup()">' +
        '<div class="conv-avatar" style="background:#111;color:#fff">🛡️</div>' +
        '<div class="conv-meta"><div class="conv-name">' + STAFF_GROUP_TITLE + '</div>' +
        '<div class="conv-preview" style="font-size:11px;color:#888">Canal officiel · ' +
        list.length + ' membre(s)</div></div></div>';

      if (typeof isAdmin === 'function' && isAdmin()) {
        try {
          var myM = await supabaseClient.from('conversation_members').select('conversation_id').eq('user_id', currentUser.id);
          var myIds = ((myM && myM.data) || []).map(function (r) { return r.conversation_id; });
          if (myIds.length) {
            var gs = await supabaseClient.from('conversations').select('id, title').eq('type', 'group').in('id', myIds);
            (gs.data || []).forEach(function (g) {
              if (!g || g.id === gid) return;
              if ((g.title || '').indexOf('Équipe AUPYGO') !== -1) return;
              html +=
                '<div class="conversation" onclick="window.openStaffAnyGroup(\'' + g.id + '\',\'' +
                escAttr(g.title || 'Groupe') + '\')">' +
                '<div class="conv-avatar" style="background:#6366f1;color:#fff">👥</div>' +
                '<div class="conv-meta"><div class="conv-name">' + (g.title || 'Groupe') + '</div></div></div>';
            });
          }
        } catch (e) {}
      }
      groupsList.innerHTML = html;
    }

    document.querySelectorAll('#messages button, .chat-header-actions button').forEach(function (btn) {
      var t = (btn.textContent || '').toLowerCase();
      if (/quitter/i.test(t)) btn.style.display = 'none';
      if (/supprimer/i.test(t) && !(typeof isAdmin === 'function' && isAdmin())) btn.style.display = 'none';
    });
  }

  window.openStaffGroup = async function () {
    if (!isStaff()) return;
    var gid = await ensureStaffGroup();
    if (!gid) { showToast('Impossible d ouvrir le groupe', 'error'); return; }
    if (typeof go === 'function' && typeof getActivePage === 'function' && getActivePage() !== 'messages') go('messages');
    window.activeConversation = { type: 'group', id: gid, name: STAFF_GROUP_TITLE, conversationId: gid };
    await renderStaffChat(gid, true);
    markRead(gid);
    applyStaffMessagesUI();
  };

  window.openStaffAnyGroup = async function (gid, title) {
    if (!(typeof isAdmin === 'function' && isAdmin())) return;
    window.activeConversation = { type: 'group', id: gid, name: title || 'Groupe', conversationId: gid };
    await renderStaffChat(gid, true);
    markRead(gid);
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
      if (isStaff()) {
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
  if (typeof prevGo === 'function') {
    window.go = function (page) {
      prevGo(page);
      if (page === 'messages' && isStaff()) {
        setTimeout(applyStaffMessagesUI, 250);
        setTimeout(applyStaffMessagesUI, 1000);
      }
    };
  }

  setTimeout(function () {
    if (isStaff() && typeof getActivePage === 'function' && getActivePage() === 'messages') applyStaffMessagesUI();
  }, 1200);

  setInterval(function () {
    if (!isStaff()) return;
    if (typeof getActivePage === 'function' && getActivePage() === 'messages') {
      document.querySelectorAll('#messages .conv-section-label').forEach(function (el) {
        if (/^amis$/i.test((el.textContent || '').trim()) || /^équipe$/i.test((el.textContent || '').trim())) {
          el.textContent = 'Staff';
        }
      });
    }
  }, 2000);

  console.log('[AUPYGO] staff-messages.js v6');
})();
