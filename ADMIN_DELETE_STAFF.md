# Suppression définitive agent Staff (Amiral)

## 1. SQL (obligatoire)
Supabase → SQL Editor → coller le fichier `SUPABASE_ADMIN_DELETE_STAFF.sql` → **Run**.

## 2. Edge Function
```bash
supabase functions deploy admin-delete-staff
```

Secrets (Dashboard → Project Settings → Edge Functions → Secrets) :
- `RESEND_API_KEY` — clé [Resend](https://resend.com) pour l'envoi du mail
- `STAFF_DELETE_NOTIFY_TO` — `aupygo@protonmail.com` (défaut si absent)
- `STAFF_DELETE_FROM_EMAIL` — expéditeur vérifié chez Resend (ex. `AUPYGO <noreply@ton-domaine.com>`)

Sans `RESEND_API_KEY`, la demande échoue (le code n'est **jamais** renvoyé au navigateur).

## 3. Frontend
`js/admin-delete-staff.js` est chargé via `index.html` (`?v=staff-del1`).

## Flux
1. Amiral → tableau Admin → ligne Staff → **Supprimer**
2. Popup → **Envoyer le code** → mail à aupygo@protonmail.com
3. Saisie du code 6 chiffres → purge profil + auth.users

## Sécurité
- Client : bouton seulement si `isAmiral()` et ligne Staff
- Edge : JWT + `is_amiral()` + `is_deletable_staff_agent`
- SQL : DEFINER, hash SHA-256, TTL 15 min, one-shot
- Impossible de supprimer l'Amiral ou un simple user
