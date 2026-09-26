# AUPYGO — Système Staff (charte organisationnelle)

## Philosophie

AUPYGO est une plateforme communautaire destinée aux au pairs internationaux.
L'équipe Staff n'est **pas** une catégorie d'utilisateurs du réseau social.
Le Staff représente l'organisation AUPYGO (animation, encadrement, modération).

**Séparation stricte et permanente** entre Utilisateurs et Staff.

---

## Rôles (`profiles.role`)

| Rôle                 | Niveau | Branche        | Périmètre     |
|----------------------|--------|----------------|---------------|
| `user`               | —      | —              | Communauté    |
| `sergent_staff`      | 3      | événementiel   | Grande ville  |
| `major_staff`        | 2      | événementiel   | Pays          |
| `amiral`             | 1      | événementiel   | Global        |
| `sergent_moderateur` | 3      | modération     | Grande ville  |
| `major_moderateur`   | 2      | modération     | Pays          |

Colonnes associées :
- `staff_country` — pays de responsabilité
- `staff_city` — ville de responsabilité (Sergents)
- `staff_branch` — `evenementiel` | `moderation`
- `is_admin` — true uniquement pour l'Amiral

### Mapping migration (lecture seule)

| Ancien          | Nouveau            |
|-----------------|--------------------|
| `admin_general` | `amiral`           |
| `host`          | `sergent_staff`    |
| `moderator`     | `sergent_moderateur` |

---

## Sécurité — RLS Supabase (obligatoire)

**Script :** [`SUPABASE_STAFF_RLS.sql`](./SUPABASE_STAFF_RLS.sql)  
À exécuter dans **Supabase → SQL Editor → Run**.

### Règles

1. **Pas d'email / domaine** dans les policies (`auth.jwt() ->> 'email'` interdit).
2. **Source de vérité :** `public.profiles.role` (+ `is_admin`).
3. **Helpers** `SECURITY DEFINER` : `is_amiral()`, `is_staff_member()`, `current_profile_role()`.
4. **Trigger** avant UPDATE/INSERT : bloque toute écriture de `role` / `is_admin` / `staff_*` si l'acteur n'est pas Amiral.
5. **Amiral unique** : impossible d'attribuer `role = amiral` à un autre compte ; l'Amiral ne peut pas se rétrograder via l'API.
6. **Attribution exclusive** : seul l'Amiral peut promouvoir/révoquer le Staff.

### Bootstrap Amiral (une fois)

Dans le SQL Editor (compte service), après avoir collé le script :

```sql
update public.profiles
set role = 'amiral',
    is_admin = true,
    staff_branch = 'evenementiel',
    subscription = 'PREMIUM'
where id = '<TON_UUID_AUTH.USERS>';
```

### Côté client

- Aucune auto-promotion par email.
- Le panneau Admin lit/écrit `profiles.role` ; le RLS refuse si non-Amiral.

---

## Hiérarchie Staff (événementiel)

### Niveau 1 — Amiral
- Administrateur général unique
- Validation finale des événements payants
- Gestion des grades Staff
- Accès à tous les outils
- Peut communiquer individuellement avec tout le Staff

### Niveau 2 — Major Staff (1 par pays)
- Développement local de la communauté
- Coordination des Sergents Staff
- Proposition d'événements officiels
- Validation intermédiaire des événements payants de son pays

### Niveau 3 — Sergent Staff (1 par grande ville)
- Organisation locale
- Création d'événements officiels
- Animation communautaire
- Accueil des nouveaux membres

---

## Hiérarchie Modération (indépendante)

### Major Modérateur (1 par pays)
- Supervision de la modération
- Gestion des signalements
- Accompagnement des Sergents Modérateurs

### Sergent Modérateur (1 par grande ville)
- Aide aux utilisateurs
- Contrôle des événements
- Surveillance du respect des règles
- Gestion des signalements locaux

---

## Messagerie interne Staff

- **Espace commun unique** : « 🛡️ Équipe AUPYGO »
- **Messages privés interdits** entre membres Staff
- **Exception** : l'Amiral peut ouvrir un canal privé vers n'importe quel Staff (pilotage)
- Les Majors peuvent créer des groupes régionaux (visibles uniquement par leur pays + Amiral)

---

## Événements

### Événements Utilisateurs
Créés par la communauté. Le Staff n'y participe **jamais**.

### Événements Officiels AUPYGO
Créés par le Staff. Le Staff organisateur choisit s'il participe ou reste uniquement organisateur.

### Validation des événements payants (obligatoire)

```
Sergent Staff
    ↓
Major Staff (même pays)
    ↓
Amiral (validation finale)
```

Aucun événement payant ne peut être publié sans validation finale de l'Amiral.

---

## Permissions résumées

| Action                              | User | Sergent | Major | Amiral |
|-------------------------------------|------|---------|-------|--------|
| Voir les utilisateurs               | Oui  | Oui     | Oui   | Oui    |
| Voir le Staff                       | Non  | Oui     | Oui   | Oui    |
| Contacter le Staff (DM)             | Non  | Non*    | Non*  | Oui    |
| Créer événement utilisateur         | Oui  | Non     | Non   | Non    |
| Créer événement officiel            | Non  | Oui     | Oui   | Oui    |
| Valider payant (étape Major)        | Non  | Non     | Oui   | Oui    |
| Validation finale payant            | Non  | Non     | Non   | Oui    |
| Participer événements utilisateurs  | Oui  | Non     | Non   | Non    |
| Accès outils admin                  | Non  | Non     | Non   | Oui    |
| Modifier `role` / Staff (RLS)       | Non  | Non     | Non   | Oui    |

\* Exception : l'Amiral peut DM n'importe quel Staff.

---

## Fichiers actifs

| Fichier                    | Rôle                                      |
|----------------------------|-------------------------------------------|
| `SUPABASE_STAFF_RLS.sql`   | RLS + triggers rôles (exécuter une fois)  |
| `js/staff-hierarchy.js`    | Source unique des rôles & permissions     |
| `js/admin.js`              | Panneau Administration (Amiral uniquement)|
| `js/staff-messages.js`     | Messagerie Staff                          |
| `js/staff-events.js`       | Événements officiels + validation         |
| `js/staff-visibility.js`   | Visibilité carte & fiches                 |
| `js/staff-profile.js`      | Profil limité (n'écrit pas le rôle)       |
| `js/staff-restrictions.js` | Masquage boutons / agenda                 |
| `js/staff-msg-unlock.js`   | Déblocage messagerie Staff                |
| `map-markers.js`           | Staff invisible aux users                 |

Chargement : `index.html` → `app.js` → `map-markers.js` → `js/staff-hierarchy.js` → `js/admin.js` → modules staff-*.js
