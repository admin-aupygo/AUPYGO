# Archive — scripts Supabase à NE PLUS EXÉCUTER

Ces fichiers ont été sortis de la racine du dépôt le 2026-09-30.

## Ne jamais réexécuter

| Fichier | Risque |
|---------|--------|
| `SUPABASE_STAFF_RLS.sql` | Supprime **toutes** les policies de `profiles` et recrée une lecture ouverte à tous les connectés. |
| `SUPABASE_ADMIN_SET_ROLE.sql` | Enlève les triggers/protections staff et recrée des policies permissives. |
| `SUPABASE_EVENTS_RLS.sql` | Remet la lecture ouverte (`using (true)`) sur les événements. |
| `SUPABASE_MESSAGING_RLS.sql` | Ancienne version messagerie (conservée pour historique). |
| `SUPABASE_SUBSCRIPTIONS_EVENTS_RLS.sql` | Version intermédiaire abonnements + events. |

Les politiques actives en production doivent être maintenues via les scripts/migrations courants (hors archive).

## Points de vigilance associés

- Bug corrigé dans le script d'événements : dans la sous-requête sur `event_invitations`, `id` désignait l'identifiant de l'invitation et non celui de l'événement. Les invités n'auraient jamais vu les sorties entre amis.
- La suppression de messages par n'importe quel membre (`messages_delete_own_or_member`) est conservée : la fonction de nettoyage des anciens messages (`onCleanupAccept`) en dépend.
- Un DM ne peut désormais être créé qu'entre amis acceptés (ou par le staff) — règle FREE.
