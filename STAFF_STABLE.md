# AUPYGO — Snapshot stable Staff (2026-09-27)

**Commit de référence :** `80e6ddc62931e95196bc4cc708af6e626cd73733` (main)

## Ce qui est figé

### Messagerie Staff (`js/staff-messages.js` v6.6)
- Label **Équipe** (plus « Amis »)
- Non-Amiral : uniquement **Amiral** (DM) + canal **🛡️ Équipe AUPYGO**
- Amiral : tous les membres Staff + groupe officiel
- `loadStaffMembers` sans `role.eq.admin` (évite 400 enum `app_role`)
- 2 requêtes : `is_admin=true` + `.in('role', [...])`

### Fichiers liés
| Fichier | Rôle |
|---------|------|
| `js/staff-messages.js` | Messagerie Staff (stable) |
| `js/staff-groups-fix.js` | Groupes + openStaffAnyGroup |
| `js/staff-msg-badge-fix.js` | Badges / anti-clignotement |
| `js/staff-msg-unlock.js` | Envoi illimité Staff |
| `js/staff-hierarchy.js` | Rôles officiels |
| `js/staff-ui.js` | Badges header / home |
| `js/staff-profile.js` | Profil Staff / Amiral |
| `js/staff-profile-layout-fix.js` | Layout profil (plus de sticky qui balade) |
| `js/staff-events.js` | Événements officiels |
| `js/staff-visibility.js` | Visibilité carte |
| `js/staff-restrictions.js` | Restrictions UI |
| `js/admin.js` | Panneau Amiral |

### Cache scripts
`?v=20260927staff2` (index.html)

## Comportement attendu
1. Page Messages → section **Équipe**
2. Staff (non-Amiral) → 1 contact Amiral + 1 canal groupe
3. Plus d’erreur 400 sur `/profiles?...or=...admin`
4. Profil Staff : carte stable (pas collée en bas)

## Restauration
Revenir à ce snapshot :
```bash
git checkout 80e6ddc62931e95196bc4cc708af6e626cd73733 -- js/staff-messages.js js/staff-groups-fix.js js/staff-profile-layout-fix.js index.html
```
Ou pointer les CDN vers ce SHA si besoin de restauration d’urgence.
