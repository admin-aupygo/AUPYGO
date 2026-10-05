# Suppression définitive agent Staff (Amiral)

## Prérequis

### 1. SQL (obligatoire — à rejouer si déjà installé)
Supabase → SQL Editor → coller le fichier `SUPABASE_ADMIN_DELETE_STAFF.sql` → **Run**.

Cela crée notamment :
- `staff_delete_challenges` (codes de sécurité)
- `staff_deleted_archive` (trace de contrôle des agents supprimés)

### 2. Edge Function
```bash
supabase functions deploy admin-delete-staff
```

Secrets (Dashboard → Project Settings → Edge Functions → Secrets) :
- `RESEND_API_KEY` — clé [Resend](https://resend.com)
- `STAFF_DELETE_NOTIFY_TO` — email Amiral pour le **code** (ex. `aupygo@protonmail.com`)
- `STAFF_DELETE_FROM_EMAIL` — expéditeur vérifié chez Resend

### 3. Frontend
`js/admin-delete-staff.js` (bouton + modales).

## Flux

1. Amiral → Administration → ligne Staff → **Supprimer**
2. Confirmation → code 6 chiffres envoyé à l’Amiral
3. Saisie du code →
   - archive dans `staff_deleted_archive`
   - purge profil + données liées
   - suppression `auth.users` (plus de connexion possible)
   - **e-mail de notification** envoyé à l’ex-agent (ton informatif et respectueux)

## Archive `staff_deleted_archive`

Colonnes utiles :
| Colonne | Contenu |
|---------|--------|
| `former_user_id` | Ancien UUID |
| `email` | E-mail au moment de la suppression |
| `display_name`, `role`, `staff_*` | Identité organisationnelle |
| `deleted_at`, `deleted_by` | Quand / par qui |
| `notify_email_sent` | Mail de notification bien parti |

- Visible **uniquement par l’Amiral** (RLS + `is_amiral()`).
- Pas de messages ni d’historique social : trace minimale de contrôle.
- Tu peux consulter dans Supabase → Table Editor → `staff_deleted_archive`.

## E-mail à l’ex-agent

Contenu orienté :
- information claire de la fin d’accès Staff ;
- conséquences (compte / données opérationnelles) ;
- formulation respectueuse ;
- contact `aupygo@protonmail.com` en cas d’erreur ou question données.

## Sécurité

- Client : bouton si Amiral + ligne Staff
- Edge : JWT + `is_amiral()` + `is_deletable_staff_agent`
- SQL : code hashé, TTL 15 min, one-shot
- Impossible de supprimer l’Amiral ou un simple user
