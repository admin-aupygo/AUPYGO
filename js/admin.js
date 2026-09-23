window.initAdminNavigation = function(userProfile) {
  if (!userProfile) return;

  var isStaff = ['moderator', 'admin_assistant', 'admin_general'].includes(userProfile.role);
  var adminNavBtn = document.getElementById('navAdminBtn');
  var reconnectNavBtn = document.getElementById('navReconnectBtn');

  if (adminNavBtn) {
    adminNavBtn.style.display = isStaff ? 'inline-block' : 'none';
  }

  if (reconnectNavBtn && isStaff) {
    reconnectNavBtn.style.display = 'none';
  }
};

window.safeNavigate = function(pageId, currentUser) {
  var isStaff = currentUser && ['moderator', 'admin_assistant', 'admin_general'].includes(currentUser.role);

  if (pageId === 'reconnect' && isStaff) {
    if (typeof showToast === 'function') {
      showToast(window.t("admin.restriction_reconnect"), "warning");
    }
    return;
  }

  if (pageId === 'admin' && !isStaff) {
    if (typeof showToast === 'function') {
      showToast(window.t("admin.access_denied"), "error");
    }
    return;
  }

  document.querySelectorAll('.page').forEach(function(el) {
    el.classList.remove('active');
  });
  
  var targetPage = document.getElementById(pageId);
  if (targetPage) {
    targetPage.classList.add('active');
    if (pageId === 'admin') {
      window.loadAdminPanel(currentUser);
    }
  }
};

window.loadAdminPanel = function(currentUser) {
  var roleCard = document.getElementById('roleManagementCard');
  
  if (roleCard) {
    if (currentUser && currentUser.email === 'aupygo@protonmail.com') {
      roleCard.style.display = 'block';
    } else {
      roleCard.style.display = 'none';
    }
  }

  window.loadGlobalEvents();
};

window.updateUserRole = async function() {
  var emailInput = document.getElementById('userEmailInput');
  var roleSelect = document.getElementById('roleSelect');
  
  if (!emailInput || !roleSelect) return;

  var email = emailInput.value.trim();
  var newRole = roleSelect.value;

  if (!email) {
    if (typeof showToast === 'function') showToast("Veuillez entrer une adresse email valide.", "error");
    return;
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .update({ 
        role: newRole,
        is_ghost: (newRole !== 'user')
      })
      .eq('email', email);

    if (error) throw error;

    if (typeof showToast === 'function') showToast(window.t("admin.role_updated"), "success");
    emailInput.value = '';
  } catch (err) {
    if (typeof showToast === 'function') showToast("Erreur lors de la mise à jour : " + err.message, "error");
  }
};

window.loadGlobalEvents = async function() {
  var container = document.getElementById('adminEventsList');
  if (!container) return;

  container.innerHTML = "<p>Chargement des événements...</p>";

  try {
    const { data: events, error } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!events || events.length === 0) {
      container.innerHTML = "<p>Aucun événement enregistré.</p>";
      return;
    }

    var html = '<table class="admin-table"><thead><tr><th>Titre</th><th>Type</th><th>Visibilité</th><th>Créé le</th><th>Action</th></tr></thead><tbody>';
    events.forEach(function(ev) {
      html += `<tr>
        <td><strong>${ev.title || 'Sans titre'}</strong></td>
        <td>${ev.is_special_aupygo ? 'Officiel AupyGo' : 'Standard'}</td>
        <td>${ev.visibility === 'private' ? '🔒 Privé' : '🌐 Public'}</td>
        <td>${new Date(ev.created_at).toLocaleDateString()}</td>
        <td><button class="btn-danger" onclick="window.deleteEventByAdmin('${ev.id}')">Supprimer</button></td>
      </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<p style="color:red;">Erreur de chargement : ${err.message}</p>`;
  }
};

window.deleteEventByAdmin = async function(eventId) {
  if (!confirm("Êtes-vous sûr de vouloir supprimer cet événement ?")) return;

  try {
    const { error } = await supabase.from('events').delete().eq('id', eventId);
    if (error) throw error;
    if (typeof showToast === 'function') showToast("Événement supprimé avec succès.", "success");
    window.loadGlobalEvents();
  } catch (err) {
    if (typeof showToast === 'function') showToast("Erreur de suppression : " + err.message, "error");
  }
};
