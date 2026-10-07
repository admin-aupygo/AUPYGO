# AUPYGO

La communauté mondiale des au pairs — **Meet. Go out. Make friends.**

Site : [aupygo.com](https://aupygo.com)

---

## Structure du dépôt (prod)

```
index.html              Loader (injecte le HTML des pages + modules js/)
styles.css              Design complet (~50 Ko)
app.js                  Logique principale (~240 Ko) : auth, carte, messages, profil…
config.js               Supabase URL + clé anon (publique uniquement)
i18n.js                 Traductions FR / EN / ES
i18n-extra.js           Traductions complémentaires
map-markers.js          Marqueurs carte + règles Staff
favicon.svg
CNAME                   aupygo.com (Cloudflare Pages)
STAFF.md                Doc système Staff

js/                     Modules chargés après app.js
  message-rules.js      Compteur mots, quotas UI, masquage coordonnées
  staff-*.js            Hiérarchie, messages, events, restrictions…
  admin*.js             Administration (rôles, create/delete staff)
  *-fix.js             Correctifs (CDC, XSS, realtime, join events…)
  theme-toggle.js       Thème clair / sombre

archive/                Anciens SQL, docs, doublons (ne pas servir en prod)
supabase/               Config / migrations projet Supabase
```

**Sources de vérité :** `styles.css` et `app.js` à la racine.  
Pas de CSS sectorisé (`css/parts` abandonné). Un seul `config.js` (racine).

---

## Stack

| Service | Rôle |
|---------|------|
| **GitHub** | Code (`main`) |
| **Cloudflare Pages** | Hébergement + domaine `aupygo.com` |
| **Supabase** | Auth, Postgres, RLS, RPC |
| **Cloudflare Turnstile** | Captcha login / inscription |

---

## Déploiement

1. Push sur la branche `main`
2. Cloudflare Pages rebuild automatique (1–2 min)
3. Hard refresh navigateur : `Ctrl+Shift+R` si le cache bloque

Fichiers sensibles : **jamais** de `service_role` dans le front. Seule la clé **anon** est dans `config.js`.

---

## Forfaits (rappel)

| Plan | Messages | Carte |
|------|----------|--------|
| FREE | 10 au total · 25 mots max | Autour de soi |
| STANDARD | 10 / jour · 1000 mots | Région |
| PREMIUM | Illimité · 1000 mots | Monde |

Les limites **doivent** être appliquées côté Supabase (triggers / RPC), pas seulement en JS.

---

## Sécurité (points d’attention)

- RLS sur `profiles`, `messages`, events, participants
- Quotas messages + masquage coordonnées côté serveur (`03_messaging_rules` — voir historique Git / archive)
- Rôles Staff uniquement via edge functions / RPC admin (pas d’update libre du client)
- Positions carte **approximatives** uniquement
- Turnstile obligatoire sur login (projet Supabase avec captcha activé)

Voir aussi `STAFF.md` et `archive/README.md`.

---

## Développement local

```bash
git clone https://github.com/admin-aupygo/AUPYGO.git
cd AUPYGO
# Servir en statique (ex. npx serve .) puis ouvrir l’URL locale
```

Auth et données passent par le projet Supabase de prod (même `config.js`).

---

## Historique chantier structure (oct. 2026)

| Id | Décision |
|----|----------|
| A2 | `styles.css` + `app.js` complets sur `main` |
| A3 | CSS sectorisé abandonné |
| A4 | Un seul `config.js` (racine) |
| A5 | SQL / doublons → hors racine (historique Git + `archive/`) |
| A6 | Ce README |
