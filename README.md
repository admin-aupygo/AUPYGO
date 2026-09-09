# AUPYGO

La communauté mondiale des au pairs — Meet. Go out. Make friends.

## Structure

```
index.html       → pages et structure
css/styles.css   → design
js/config.js     → Supabase (clé anon)
js/i18n.js       → traductions FR / EN / ES
js/app.js        → logique (auth, carte, messages, profil…)
CNAME            → domaine Cloudflare
```

## Stack

- Front : HTML / CSS / JS (statique)
- Auth & data : Supabase
- Hébergement : Cloudflare Pages + domaine custom
- Emails : Brevo

## Déploiement

Chaque push sur `main` met à jour le site via Cloudflare Pages.
