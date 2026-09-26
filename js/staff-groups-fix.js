/* AUPYGO — staff-groups-fix.js
 * Cahier des charges messagerie :
 * - Tout Staff invité dans un groupe (ex. Team France) le voit dans sa liste
 * - openStaffAnyGroup accessible à tout membre (plus seulement Amiral)
 * - loadStaffMembers avec les rôles officiels (amiral, major_*, sergent_*)
 * - markRead renforcé (stop clignotement)
 */
(function () {
  'use strict';

  function staffReady() {
    return typeof isStaff === 'function' && isStaff();
  }

  function escAttr(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  /** Tous les groupes dont l'utilisateur est membre */
  async function loadMyStaffGroups() {
    if (!window.currentUser) return [];
    try {
      var myM = await supabaseClient
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', currentUser.id);
      var myIds = ((myM && myM.data) || []).map(function (r) { return r.conversation_id; });
      if (!myIds.length) return [];
      var gs = await supabaseClient
        .from('conversations')
        .select('id, title, type, created_at')
        .eq('type', 'group')
        .in('id', myIds)
        .order('created_at', { ascending: false });
      return gs.data || [];
    } catch (e) {
      console.warn('[Staff groups]', e);
      return [];
    }
  }

  /** Liste Staff avec rôles officiels + legacy */
  async function loadStaffMembersFixed() {
    try {
      var res = await supabaseClient
        .from('profiles')
        .select('id, display_name, role, is_admin, is_online, last_seen, city, country')
        .or(
          'is_admin.eq.true,' +
          'role.eq.amiral,' +
          'role.eq.major_staff,' +
          'role.eq.sergent_staff,' +
          'role.eq.major_moderateur,' +
          'role.eq.sergent_moderateur,' +
          'role.eq.admin_general,' +
          'role.eq.host,' +
          'role.eq.moderator,' +
          'role.eq.admin'
        )
        .limit(150);
      return res.data || [];
    } catch (e) {
      return [];
    }
  }

  function stopAllMessageBlink() {
    document.querySelectorAll(
      '#navMessages, #bottomNavMessages, [data-nav="messages"], #homeBtnMessages, #headerMessagesBtn'
    ).forEach(function (el) {
      if (!el) return;
      el.classList.remove('has-unread-messages', 'nav-blink', 'blink', 'pulse', 'unread');
      el.querySelectorAll('.messages-badge, .badge, .bn-badge').forEach(function (b) {
        b.textContent = '0';
        b.style.display = 'none';
        b.classList.remove('show');
      });
    });
    ['messagesBadge', 'messagesBadgeBottom', 'bottomMessagesBadge', 'headerMessagesBadge'].forEach(function (id) {
      var b = document.getElementById(id);
      if (b) {
        b.textContent = '0';
        b.style.display = 'none';
        b.classList.remove('show');
      }
    });
  }

  // openStaffAnyGroup : tout Staff membre peut ouvrir
  window.openStaffAnyGroup = async function (gid, title) {
    if (!staffReady()) return;
    if (!gid) return;
    // Vérifie appartenance
    try {
      var mem = await supabaseClient
        .from('conversation_members')
        .select('user_id')
        .eq('conversation_id', gid)
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (!mem.data) {
        showToast('Tu n\'es pas membre de ce groupe.', 'error');
        return;
      }
    } catch (e) {}

    if (typeof go === 'function' && typeof getActivePage === 'function' && getActivePage() !== 'messages') {
      go('messages');
    }
    window.activeConversation = {
      type: 'group',
      id: gid,
      name: title || 'Groupe',
      conversationId: gid
    };
    if (typeof renderStaffChat === 'function') {
      // renderStaffChat may not be global — use loadConversationHistory path
    }
    try {
      if (typeof window.loadConversationHistory === 'function') {
        await window.loadConversationHistory(gid);
      }
    } catch (e2) {}
    // Render via staff-messages internals if available
    try {
      var box = document.getElementById('chatMessages');
      if (box) {
        var res = await supabaseClient.from('messages')
          .select('id, content, sender_id, created_at')
          .eq('conversation_id', gid)
          .order('created_at', { ascending: true })
          .limit(300);
        var data = res.data || [];
        box.innerHTML = '';
        if (!data.length) {
          box.innerHTML = '<div class="chat-placeholder"><p>Aucun message.</p></div>';
        } else {
          data.forEach(function (m) {
            var isMe = window.currentUser && m.sender_id === window.currentUser.id;
            var wrap = document.createElement('div');
            wrap.className = 'staff-msg-wrap';
            wrap.style.cssText = 'display:flex;flex-direction:column;margin:6px 0;' +
              (isMe ? 'align-items:flex-end;' : 'align-items:flex-start;');
            var bubble = document.createElement('div');
            bubble.className = 'bubble' + (isMe ? ' me' : '');
            bubble.textContent = m.content;
            wrap.appendChild(bubble);
            box.appendChild(wrap);
          });
          box.scrollTop = box.scrollHeight;
        }
      }
    } catch (e3) {
      console.warn('[Staff] open group', e3);
    }

    // Header
    var header = document.getElementById('chatHeader');
    if (header) {
      header.removeAttribute('data-i18n');
      header.innerHTML = '<span style="font-weight:700">' + (title || 'Groupe') + '</span>';
    }

    // Mark read + stop blink
    if (typeof markConversationRead === 'function') markConversationRead(gid, null);
    if (window.unreadByConversation) window.unreadByConversation[gid] = 0;
    if (typeof updateMessagesBadge === 'function') updateMessagesBadge();
    stopAllMessageBlink();
  };

  /** Enrichit la liste groupes pour TOUT staff (pas seulement Amiral) */
  async function enrichGroupsList() {
    if (!staffReady()) return;
    var groupsList = document.getElementById('convGroupsList');
    if (!groupsList) return;

    var groups = await loadMyStaffGroups();
    if (!groups.length) return;

    var officialTitle = '🛡️ Équipe AUPYGO';
    var html = '';
    var seen = {};

    // Conserver le canal officiel en premier s'il existe déjà dans le DOM
    var existingOfficial = groupsList.querySelector('[onclick*="openStaffGroup"]');
    if (existingOfficial) {
      html += existingOfficial.outerHTML;
      seen['official'] = true;
    }

    groups.forEach(function (g) {
      if (!g || !g.id) return;
      var title = g.title || 'Groupe';
      if (title.indexOf('Équipe AUPYGO') !== -1) {
        if (seen['official']) return;
        html +=
          '<div class="conversation" onclick="window.openStaffGroup && window.openStaffGroup()">' +
          '<div class="conv-avatar" style="background:#111;color:#fff">🛡️</div>' +
          '<div class="conv-meta"><div class="conv-name">' + officialTitle + '</div>' +
          '<div class="conv-preview" style="font-size:11px;color:#888">Canal officiel Staff</div></div></div>';
        seen['official'] = true;
        return;
      }
      if (seen[g.id]) return;
      seen[g.id] = true;
      var active = window.activeConversation && window.activeConversation.conversationId === g.id ? ' active' : '';
      html +=
        '<div class="conversation' + active + '" onclick="window.openStaffAnyGroup(\'' + g.id + '\',\'' +
        escAttr(title) + '\')">' +
        '<div class="conv-avatar" style="background:#6366f1;color:#fff">👥</div>' +
        '<div class="conv-meta"><div class="conv-name">' + title + '</div>' +
        '<div class="conv-preview" style="font-size:11px;color:#888">Groupe Staff</div></div></div>';
    });

    if (html) groupsList.innerHTML = html;
  }

  // Patch applyStaffMessagesUI si présent
  function patchApply() {
    if (typeof window.applyStaffMessagesUI === 'function' && !window._staffGroupsApplyPatched) {
      // applyStaffMessagesUI n'est pas forcément sur window — on hooke via interval
    }
  }

  // Après chaque rendu messages staff, enrichir les groupes
  if (typeof window.go === 'function' && !window._staffGroupsGo) {
    window._staffGroupsGo = true;
    var prevGo = window.go;
    window.go = function (page) {
      prevGo(page);
      if (page === 'messages') {
        setTimeout(enrichGroupsList, 400);
        setTimeout(enrichGroupsList, 1200);
        setTimeout(stopAllMessageBlink, 500);
      }
    };
  }

  // Patch renderConversationSidebar
  if (typeof window.renderConversationSidebar === 'function' && !window._staffGroupsSidebar) {
    window._staffGroupsSidebar = true;
    var orig = window.renderConversationSidebar;
    window.renderConversationSidebar = function () {
      var r = orig.apply(this, arguments);
      if (staffReady()) setTimeout(enrichGroupsList, 200);
      return r;
    };
  }

  // Interval de secours
  setInterval(function () {
    if (!staffReady()) return;
    if (typeof getActivePage === 'function' && getActivePage() === 'messages') {
      enrichGroupsList();
    }
    // Stop blink si 0 non-lus
    try {
      if (typeof getTotalUnreadCount === 'function' && getTotalUnreadCount() === 0) {
        stopAllMessageBlink();
      }
    } catch (e) {}
  }, 2500);

  setTimeout(enrichGroupsList, 1500);
  setTimeout(enrichGroupsList, 3000);

  console.log('[AUPYGO] staff-groups-fix.js chargé');
})();
