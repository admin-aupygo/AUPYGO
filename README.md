# AUPYGO

La communauté mondiale des au pairs — **Meet. Go out. Make friends.**

## Structure cible (sectorisée)

```
index.html          → structure HTML des pages
css/styles.css      → tout le design
js/config.js        → Supabase URL + clé anon (déjà sur le dépôt)
js/i18n.js          → traductions FR / EN / ES
js/app.js           → logique (auth, carte, messages, profil, idle…)
CNAME               → domaine Cloudflare
```

## État actuel

- `js/config.js` est déjà dans le dépôt.
- `index.html` actuel est encore la version **monolithique** (tout-en-un) pour ne pas casser le site en production.
- La version **sectorisée complète** (index + css + js) a été préparée et doit être poussée / uploadée pour finaliser le découpage.

## Stack (100 % free)

| Service | Usage |
|---------|--------|
| GitHub | Code |
| Cloudflare Pages + domaine | Hébergement |
| Supabase | Auth + base de données |
| Brevo | Emails |

## Déploiement

Chaque push sur `branch main` met à jour le site via Cloudflare Pages.

## Améliorations récentes (dans le build sectorisé)

- Invité : carte mondiale + compteur de connectés (sans interaction)
- Déconnexion globale (tous appareils)
- Inactivité 45 min + alerte à 40 min
- Messagerie (amis + groupes max 5)
- Profils réels uniquement (plus de fictifs)
- Couleurs carte : moi bleu / en ligne vert / hors ligne rouge
