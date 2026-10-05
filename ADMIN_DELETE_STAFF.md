# Suppression définitive agent Staff (Amiral)

## Prérequis

### 1. SQL (obligatoire)
Supabase → SQL Editor → coller le fichier `SUPABASE_ADMIN_DELETE_STAFF.sql` → **Run**.

### 2. Edge Function
```bash
supabase functions deploy admin-delete-staff
```

Secrets (Dashboard → Project Settings → Edge Functions → Secrets) :
- `RESEND_API_KEY` — clé [Resend](https://resend.com) pour l'envoi du mail
- `STAFF_DELETE_NOTIFY_TO` — `aupygo@protonmail.com` (défaut si absent)
- `STAFF_DELETE_FROM_EMAIL` — expéditeur vérifié chez Resend (ex. `AUPYGO <noreply@ton-domaine.com>`)

Sans `RESEND_API_KEY`, la demande échoue (le code n'est **jamais** renvoyé au navigateur).

### 3. Frontend
`js/admin-delete-staff.js` est chargé via `index.html`.

## Flux utilisateur (Amiral)

1. Ouvre **Administration** (icône bouclier)
2. Sur une ligne **Staff** (Major / Sergent), clique **Supprimer**
3. Confirme → un **code 6 chiffres** est envoyé par email
4. Saisis le code → purge immédiate :
   - profil (`profiles`)
   - messages, conversations, amitiés, participations événements, invitations…
   - compte **Auth** (`auth.users`) → **impossible de se reconnecter** avec cet email sur ce compte

## Sécurité

- Client : bouton uniquement si `isAmiral()` et ligne Staff (pas Amiral, pas User)
- Edge : JWT + `is_amiral()` + `is_deletable_staff_agent`
- SQL : DEFINER, hash SHA-256, TTL 15 min, one-shot
- Impossible de supprimer l'Amiral ou un simple user

## Note email

Après suppression Auth, l'adresse email n'est plus liée à un compte existant.
Une **nouvelle inscription** avec le même email reste techniquement possible (compte neuf, données perdues).
Si tu veux **bloquer définitivement** l'email, il faudrait une table `banned_emails` (non implémentée ici).
