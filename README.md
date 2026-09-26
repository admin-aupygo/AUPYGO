# AUPYGO

La communauté mondiale des au pairs — **Meet. Go out. Make friends.**

## Structure (sectorisée — finalisée)

```
index.html          → structure HTML des pages
css/styles.css      → tout le design
js/config.js        → Supabase URL + clé anon
js/i18n.js          → traductions FR / EN / ES
js/i18n-extra.js    → traductions complémentaires
js/app.js           → logique (auth, carte, messages, profil, idle…)
js/map-markers.js   → marqueurs carte + règles Staff
js/staff-*.js       → modules Staff (hiérarchie, admin, messages, events…)
js/admin.js         → panneau Administration
CNAME               → domaine Cloudflare
```

## Installation / mise à jour

Utilise le fichier **AUPYGO-sectorized.zip** fourni par Grok :

1. Dézippe
2. Va sur https://github.com/admin-aupygo/AUPYGO/upload/main
3. Glisse `index.html` + dossiers `css/` et `js/`
4. Commit changes
5. Attends 1-2 min

Les anciens fichiers à la racine (`styles.css`, `app.js`…) ne sont plus chargés et peuvent être supprimés plus tard.

## Stack (100 % free)

| Service | Usage |
|---------|--------|
| GitHub | Code |
| Cloudflare Pages + domaine | Hébergement |
| Supabase | Auth + base de données |
| Brevo | Emails |

## Déploiement

Chaque push sur `main` met à jour le site via Cloudflare Pages.

## Fonctionnalités clés

- Invité : carte mondiale + compteur de connectés
- Déconnexion globale (tous appareils)
- Inactivité 45 min + alerte à 40 min
- Messagerie (amis + groupes max 5)
- Profils réels uniquement + avatars universels
- Couleurs carte : moi bleu / en ligne vert / hors ligne rouge
- Système Staff (Amiral / Major / Sergent) avec séparation stricte Users/Staff
