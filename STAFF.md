# AUPYGO — Système Staff (Admin + Hôte)

## Rôles (`profiles.role` / enum `app_role`)

| Valeur | Droits |
|--------|--------|
| `user` | Membre standard |
| `host` | Hôte : crée des sorties dans son pays, mêmes restrictions sociales que l’admin |
| `admin_general` | Admin complet (+ panneau Administration) |
| `moderator` / `admin_assistant` | Réservés (non utilisés pour l’instant) |

Colonnes utiles : `is_admin` (bool), `host_country`, `country`.

### SQL de référence

```sql
-- Ajouter host si absent (exécuter seul, puis commit avant usage)
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'host';

-- Promouvoir un compte en admin
UPDATE profiles
SET role = 'admin_general', is_admin = true
WHERE id = '<uuid>';

-- Promouvoir en hôte
UPDATE profiles
SET role = 'host', is_admin = false
WHERE id = '<uuid>';
```

## Fichiers

| Fichier | Rôle |
|---------|------|
| `js/admin.js` | Rôles, panneau admin, amis grisés, charge les modules staff |
| `js/staff-messages.js` | Pas de DM staff↔user ; groupe unique « Équipe AUPYGO » |
| `js/staff-events.js` | Vue seule sur sorties users ; hôte/pays ; spéciaux + participation |
| `js/staff-profile.js` | Profil limité (Prénom, Âge, Genre, Pays, Ville, Langues) |
| `map-markers.js` | Staff invisible aux users ; marqueur noir entre staff |

Chargement : `index.html` → `app.js` → `map-markers.js` → `js/admin.js` → (dynamique) staff-*.js

## Règles métier

1. **Amis** — page / boutons inaccessibles pour le staff
2. **Carte** — users ne voient pas le staff ; staff voit tout + marqueurs noirs pour les autres staff ; fiches en lecture seule
3. **Messages** — aucun DM avec les users ; un seul groupe Admin+Hôtes
4. **Sorties** — staff ne s’inscrit pas aux sorties users ; hôte crée dans sa zone ; événement spécial Aupygo avec participation optionnelle + mention « Présence d’un hôte Aupygo »
5. **Profil** — champs limités listés ci-dessus

## Test rapide

1. Ctrl+F5 après déploiement
2. Compte `admin_general` : bouton 🛡️ Administration visible
3. Carte : pas de marqueur staff pour un user test
4. Messages : uniquement le groupe Équipe
5. Sorties : pas de « Participer » sur sorties membres
6. Profil : bio / hobbies masqués

## Panneau Admin

Depuis Administration : changer le rôle d’un membre (→ Hôte / User / Admin).
