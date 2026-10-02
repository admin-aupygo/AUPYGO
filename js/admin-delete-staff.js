// Gestion de la suppression d'un membre du staff
document.addEventListener('click', async (e) => {
  const button = e.target.closest('[data-user-id]');
  if (!button) return;

  // Récupération de l'ID utilisateur
  const targetUserId = button.getAttribute('data-user-id');

  if (!targetUserId) {
    console.error("Erreur : data-user-id manquant sur le bouton.");
    alert("Impossible de supprimer : identifiant utilisateur manquant.");
    return;
  }

  console.log("ID qui va être envoyé :", targetUserId);

  // Confirmation
  if (!confirm("Êtes-vous sûr de vouloir supprimer ce staff ?")) {
    return;
  }

  try {
    // Récupération de la session
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error("Erreur récupération session :", sessionError);
      alert("Impossible de récupérer votre session.");
      return;
    }

    if (!session) {
      alert("Session expirée. Reconnectez-vous.");
      return;
    }

    // Appel de l'Edge Function
    const response = await fetch(
      'https://zdjcjzsmoinrkcezgivs.supabase.co/functions/v1/admin-delete-staff',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token,
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          action: 'request',
          target_id: targetUserId
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("Erreur Edge Function :", result);
      alert(result.error || "Erreur lors de la suppression.");
      return;
    }

    console.log("Suppression réussie :", result);

    alert("Staff supprimé avec succès.");

    // Retirer la ligne de la liste
    button.closest('tr')?.remove();

  } catch (err) {
    console.error("Erreur réseau :", err);
    alert("Erreur de connexion.");
  }
});
```
