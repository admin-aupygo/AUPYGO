# AUPYGO

La communauté mondiale des au pairs — **Meet. Go out. Make friends.**

## Structure (prod — 2026-10)

```
index.html          → loader + pages (HTML historique injecté)
styles.css          → design complet (~50 Ko) — source de vérité
app.js              → logique principale (~240 Ko) — source de vérité
config.js           → Supabase URL + clé anon (publique) — unique
i18n.js / i18n-extra.js → traductions FR / EN / ES
map-markers.js      → marqueurs carte + règles Staff
js/                 → modules (staff, admin, fixes, message-rules…)
favicon.svg
CNAME               → domaine Cloudflare
archive/            → SQL / docs / anciens fichiers
supabase/           → config projet Supabase
```

**A3 :** CSS sectorisé abandonné → `styles.css` à la racine.
**A4 :** un seul `config.js` (racine) ; `js/config.js` supprimé.

## Stack

| Service | Usage |
|---------|--------|
| GitHub | Code |
| Cloudflare Pages + domaine | Hébergement |
| Supabase | Auth + base de données |
| Cloudflare Turnstile | Captcha login / signup |

## Déploiement

Chaque push sur `main` met à jour le site via Cloudflare Pages.

## Fonctionnalités clés

- Invité : carte mondiale + compteur de connectés
- Auth + captcha Turnstile
- Messagerie (quotas FREE / STANDARD / PREMIUM, anti-coordonnées)
- Profils + avatars universels
- Carte : positions approximatives uniquement
- Staff (Amiral / Major / Sergent)
