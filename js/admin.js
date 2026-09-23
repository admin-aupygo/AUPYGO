// Verification des droits d'accès à la navigation
function initAdminNavigation(userProfile) {
  if (!userProfile) return;

  var isStaff = ['moderator', 'admin_assistant', 'admin_general'].includes(userProfile.role);
  var adminNavBtn = document.getElementById('navAdminBtn');
  var reconnectNavBtn = document.getElementById('navReconnectBtn');

  // Afficher le bouton Admin uniquement pour le Staff
  if (adminNavBtn) {
    adminNavBtn.style.display = isStaff ? 'inline-block' : 'none';
  }

  // Masquer la navigation "Se retrouver" pour le Staff
  if (reconnectNavBtn && isStaff) {
    reconnectNavBtn.style.display = 'none';
  }
}

// Redirection sécurisée lors de la tentative de navigation
function safeNavigate(pageId, currentUser) {
  var isStaff = currentUser && ['moderator', 'admin_assistant', 'admin_general'].includes(currentUser.role);

  if (pageId === 'reconnect' && isStaff) {
    if (typeof showToast === 'function') {
      showToast(t("admin.restriction_reconnect"), "warning");
    }
    return;
  }

  if (pageId === 'admin' && !isStaff) {
    if (typeof showToast === 'function') {
      showToast(t("admin.access_denied"), "error");
    }
    return;
  }

  // Permuter l'affichage des pages
  document.querySelectorAll('.page').forEach(function(el) {
    el.classList.remove('active');
  });
  
  var targetPage = document.getElementById(pageId);
  if (targetPage) {
    targetPage.classList.add('active');
    if (pageId === 'admin') {
      loadAdminPanel(currentUser);
    }
  }
}

// Chargement et préparation du panneau Admin
function loadAdminPanel(currentUser) {
  var roleCard = document.getElementById('roleManagementCard');
  
  // Seul l'Admin Général (aupygo@protonmail.com) voit l'interface de gestion des rôles
  if (roleCard) {
    if (currentUser && currentUser.email === 'aupygo@protonmail.com') {
      roleCard.style.display = 'block';
    } else {
      roleCard.style.display = 'none';
    }
  }

  loadGlobalEvents();
}

// Attribution du rôle par l'Admin Général
async function updateUserRole() {
  var emailInput = document.getElementById('userEmailInput');
  var roleSelect = document.getElementById('roleSelect');
  
  if (!emailInput || !roleSelect) return;

  var email = emailInput.value.trim();
  var newRole = roleSelect.value;

  if (!email) {
    showToast("Veuillez entrer une adresse email valide.", "error");
    return;
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .update({ 
        role: newRole,
        is_ghost: (newRole !== 'user') // Activation automatique du mode fantôme pour le staff
      })
      .eq('email', email);

    if (error) throw error;

    showToast(t("admin.role_updated"), "success");
    emailInput.value = '';
  } catch (err) {
    showToast("Erreur lors de la mise à jour : " + err.message, "error");
  }
}

// Chargement de l'ensemble des événements pour supervision
async function loadGlobalEvents() {
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

    var html = '<table class="admin-table"><thead><tr><th>Titre</th><th>Type</th><th>Privé</th><th>Créé le</th><th>Action</th></tr></thead><tbody>';
    events.forEach(function(ev) {
      html += `<tr>
        <td><strong>${ev.title || 'Sans titre'}</strong></td>
        <td>${ev.is_official ? 'Officiel' : 'Standard'}</td>
        <td>${ev.is_private ? '🔒 Privé' : '🌐 Public'}</td>
        <td>${new Date(ev.created_at).toLocaleDateString()}</td>
        <td><button class="btn-danger" onclick="deleteEventByAdmin('${ev.id}')">Supprimer</button></td>
      </tr>`;
    });
    html += 'tbody></table>';
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<p style="color:red;">Erreur de chargement : ${err.message}</p>`;
  }
}

// Suppression d'un événement non conforme
async function deleteEventByAdmin(eventId) {
  if (!confirm("Êtes-vous sûr de vouloir supprimer cet événement ?")) return;

  try {
    const { error } = await supabase.from('events').delete().eq('id', eventId);
    if (error) throw error;
    showToast("Événement supprimé avec succès.", "success");
    loadGlobalEvents();
  } catch (err) {
    showToast("Erreur de suppression : " + err.message, "error");
  }
}
