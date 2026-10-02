// Récupère le bouton cliqué (exemple classique avec event delegation)
document.addEventListener('click', async (e) => {
  const button = e.target.closest('[data-user-id]');
  if (!button) return;

  // 1. Récupération de l'ID
  const targetUserId = button.getAttribute('data-user-id');

  // Sécurité obligatoire
  if (!targetUserId) {
    console.error("Erreur : target_user_id est introuvable sur le bouton.");
    alert("Impossible de supprimer : identifiant utilisateur manquant.");
    return;
  }

  // Confirmation optionnelle
  if (!confirm("Êtes-vous sûr de vouloir supprimer ce staff ?")) return;

  try {
    // Récupération de la session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      alert("Session expirée. Reconnectez-vous.");
      return;
    }

    // 2. Appel à la fonction
    const response = await fetch('https://zdjcjzsmoinrkcezgivs.supabase.co/functions/v1/admin-delete-staff', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        target_user_id: targetUserId   // ← doit être une vraie UUID non vide
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Erreur Edge Function :", result);
      alert(result.error || "Erreur lors de la suppression");
      return;
    }

    // Succès
    alert("Staff supprimé avec succès");
    // Recharge la liste ou retire la ligne du DOM
    button.closest('tr')?.remove(); // adapte selon ton HTML

  } catch (err) {
    console.error("Erreur réseau :", err);
    alert("Erreur de connexion");
  }
});
