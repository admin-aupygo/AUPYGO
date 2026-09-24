/* AUPYGO staff-messages.js — chargé après admin.js
 * - Staff (hôte) : uniquement le groupe Équipe AUPYGO, aucun DM
 * - Admin Général : peut ouvrir un DM privé avec un membre staff uniquement
 * - Users : ne peuvent pas DM le staff
 */
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

  /** Host/staff non-admin : aucun DM. Admin : DM uniquement vers un autre staff. */
  function canStartDm(targetUserId) {
    if (typeof isAdmin === 'function' && isAdmin()) {
      var target = (window.profiles || []).find(function (p) { return p && p.id === targetUserId; });
      // Admin peut DM uniquement un staff (pas un user classique)
      if (target && isMemberStaffProfile(target)) return true;
      return false;
    }
    // Staff non-admin : jamais de DM
    if (isStaff()) return false;
    // User classique : pas de DM vers staff
    var t2 = (window.profiles || []).find(function (p) { return p && p.id === targetUserId; });
    if (t2 && isMemberStaffProfile(t2)) return false;
    return true;
  }

  var _origMessageMember = window.messageMember;
  if (typeof _origMessageMember === 'function') {
    window.messageMember = function (memberId) {
      if (isStaff() && !(typeof isAdmin === 'function' && isAdmin())) {
        showToast('Messagerie privée indisponible. Utilisez le groupe Équipe AUPYGO.', 'error');
        if (typeof closeMemberProfile === 'function') closeMemberProfile();
        return;
      }
      if (typeof isAdmin === 'function' && isAdmin()) {
        if (!canStartDm(memberId)) {
          showToast('En tant qu\'Admin, tu peux contacter en privé uniquement un membre Staff.', 'error');
          return;
        }
        // Admin → staff : ouvrir DM même sans amitié
        if (typeof closeMemberProfile === 'function') closeMemberProfile();
        var raw = (window.profiles || []).find(function (m) { return m && m.id === memberId; });
        var name = (raw && raw.display_name) || 'Staff';
        if (typeof openConversation === 'function') {
          // Bypass friendship via appel direct getOrCreate + open
          return openAdminStaffDm(memberId, name);
        }
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

  async function openAdminStaffDm(memberId, name) {
    if (!(typeof isAdmin === 'function' && isAdmin())) return;
    try {
      var convId = null;
      if (typeof _origGetDm === 'function') {
        // temporairement autoriser
        convId = await window.getOrCreateDmConversation(memberId);
      }
      if (typeof go === 'function') go('messages');
      if (typeof _origOpenConv === 'function') {
        // Forcer type dm même sans amitié côté openConversation patch
        window._adminBypassDm = true;
        await _origOpenConv('dm', memberId, name);
        window._adminBypassDm = false;
      }
    } catch (e) {
      console.warn('[Staff] admin DM', e);
      showToast('Impossible d\'ouvrir la conversation privée', 'error');
    }
  }

  var _origOpenConv = window.openConversation;
  if (typeof _origOpenConv === 'function') {
    window.openConversation = async function (type, id, name) {
      if (type === 'dm') {
        if (window._adminBypassDm && typeof isAdmin === 'function' && isAdmin()) {
          return _origOpenConv(type, id, name);
        }
        if (isStaff() && !(typeof isAdmin === 'function' && isAdmin())) {
          showToast('Pas de messages privés pour le staff. Utilisez le groupe Équipe AUPYGO.', 'error');
          return;
        }
        if (typeof isAdmin === 'function' && isAdmin()) {
          if (!canStartDm(id)) {
            showToast('DM réservé aux membres Staff uniquement.', 'error');
            return;
          }
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
      if (typeof isAdmin === 'function' && isAdmin() && canStartDm(friendId)) {
        return _origGetDm(friendId);
      }
      if (isStaff()) {
        showToast('Conversation privée interdite pour le staff.', 'error');
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

    // Masquer boutons création de groupe / actions inutiles
    document.querySelectorAll(
      '#createGroupBtn, [onclick*="openCreateGroup"], [onclick*="CreateGroup"], .messages-create-group'
    ).forEach(function (el) { el.style.display = 'none'; });

    if (friendsList) {
      if (typeof isAdmin === 'function' && isAdmin()) {
        friendsList.innerHTML = '<p class="conv-empty" style="opacity:0.75;font-size:13px">Admin : tu peux ouvrir un DM privé avec un membre Staff depuis sa fiche (carte). Les users classiques restent injoignables en privé.</p>';
      } else {
        friendsList.innerHTML = '<p class="conv-empty" style="opacity:0.7">Messages privés désactivés. Canal unique : groupe Équipe AUPYGO.</p>';
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

  console.log('[AUPYGO] staff-messages.js chargé (admin DM staff autorisé)');
})();
