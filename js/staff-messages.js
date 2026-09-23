/* AUPYGO staff-messages.js — chargé après admin.js */
(function () {
  'use strict';
  if (typeof isStaff !== 'function') return;

  var STAFF_GROUP_TITLE = '🛡️ Équipe AUPYGO';
  var staffGroupIdCache = null;

  function isMemberStaffProfile(p) {
    if (!p) return false;
    if (p.is_admin === true) return true;
    var r = (p.role || '').toLowerCase();
    return r === 'admin_general' || r === 'host' || r === 'admin' || r === 'moderator';
  }

  var _origMessageMember = window.messageMember;
  if (typeof _origMessageMember === 'function') {
    window.messageMember = function (memberId) {
      if (isStaff()) {
        showToast('Messagerie privée indisponible pour le staff. Utilisez Messages → groupe Équipe AUPYGO.', 'error');
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

  var _origOpenConv = window.openConversation;
  if (typeof _origOpenConv === 'function') {
    window.openConversation = async function (type, id, name) {
      if (type === 'dm' && isStaff()) {
        showToast('Pas de messages privés pour le staff. Utilisez le groupe Équipe AUPYGO.', 'error');
        return;
      }
      if (type === 'dm' && !isStaff()) {
        var target = (window.profiles || []).find(function (p) { return p && p.id === id; });
        if (target && isMemberStaffProfile(target)) {
          showToast('Ce compte n\'est pas joignable en message privé.', 'error');
          return;
        }
      }
      return _origOpenConv(type, id, name);
    };
  }

  var _origGetDm = window.getOrCreateDmConversation;
  if (typeof _origGetDm === 'function') {
    window.getOrCreateDmConversation = async function (friendId) {
      if (isStaff()) {
        showToast('Conversation privée interdite pour le staff.', 'error');
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
      if (created.error || !created.data) {
        console.error('[Staff] create group', created.error);
        return null;
      }
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
    } catch (e) {
      console.warn('[Staff] sync members', e);
    }
  }

  async function applyStaffMessagesUI() {
    if (!isStaff()) return;
    var friendsList = document.getElementById('convFriendsList');
    var groupsList = document.getElementById('convGroupsList');
    if (friendsList) {
      friendsList.innerHTML = '<p class="conv-empty" style="opacity:0.7">Messages privés désactivés pour le staff.</p>';
    }
    var gid = await ensureStaffGroup();
    if (groupsList) {
      var active = window.activeConversation && window.activeConversation.conversationId === gid ? ' active' : '';
      groupsList.innerHTML =
        '<div class="conversation' + active + '" onclick="window.openStaffGroup()">' +
        '<div class="conv-avatar" style="background:#111;color:#fff">🛡️</div>' +
        '<div class="conv-meta"><div class="conv-name">' + STAFF_GROUP_TITLE + '</div>' +
        '<div class="conv-preview" style="font-size:11px;color:#888">Admin + Hôtes uniquement</div></div></div>';
    }
  }

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
    } else {
      window.activeConversation = { type: 'group', id: gid, name: STAFF_GROUP_TITLE, conversationId: gid };
      if (typeof loadConversationHistory === 'function') await loadConversationHistory(gid);
    }
    applyStaffMessagesUI();
  };

  var _origSidebar = window.renderConversationSidebar;
  if (typeof _origSidebar === 'function') {
    window.renderConversationSidebar = function () {
      if (isStaff()) { applyStaffMessagesUI(); return; }
      return _origSidebar.apply(this, arguments);
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
})();
