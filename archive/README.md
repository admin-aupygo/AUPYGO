# Archive AUPYGO

Nettoyage **A5** — 2026-10-07. Fichiers retirés de la racine pour alléger le dépôt.

## Déjà présents ici
- Scripts RLS historiques : `SUPABASE_STAFF_RLS.sql`, `SUPABASE_EVENTS_RLS.sql`, `SUPABASE_MESSAGING_RLS.sql`, etc.
- `message-rules (2).js` — ancienne UI messagerie

## Retirés de la racine (toujours dans l’historique Git)
Avant le commit de nettoyage, récupérables avec par ex. :
`git show <commit>:03_messaging_rules.sql`

| Fichier | Rôle |
|---------|------|
| `01_subscription_quota.sql` | Quotas forfaits |
| `02_events_policies.sql` | Policies events |
| `03_messaging_rules.sql` | Règles messages + compteur mots (serveur) |
| `SUPABASE_ADMIN_CREATE_STAFF.sql` | Création staff |
| `SUPABASE_ADMIN_DELETE_STAFF.sql` | Suppression staff |
| `SUPABASE_DROP_AVATARS_STORAGE.sql` | Storage avatars |
| `SUPABASE_EVENTS_PUBLIC_SELECT.sql` | Select events public |
| `SUPABASE_FIX_HANDLE_NEW_USER.sql` | Trigger nouvel user |
| `SUPABASE_FIX_PARTICIPANTS_403.sql` | Fix participants |
| `SUPABASE_FREE_AUPYGO_PAID.sql` | Join events FREE/payant |
| `SUPABASE_JOIN_EVENT_RPC.sql` | RPC join_event |
| `SUPABASE_STAFF_EVENTS_SECURE.sql` | Events staff sécurisés |
| `index (5).html` | Ancien loader |
| `message-rules (3).js` | Ancienne UI (prod = `js/message-rules.js`) |
| `ADMIN_DELETE_STAFF.md` | Doc |
| `STAFF_STABLE.md` | Snapshot staff |

## Attention
Ne pas ré-exécuter les anciens scripts RLS « permissifs » sans relecture — risque sécurité.

## Racine de prod (après A5)
`index.html`, `config.js`, `app.js`, `styles.css`, `i18n*.js`, `map-markers.js`, `favicon.svg`, `CNAME`, `js/`, `css/`, `supabase/`, `README.md`, `STAFF.md`
