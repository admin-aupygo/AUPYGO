# AUPYGO — Dossier juridique (version 1.0 — 13/10/2026)

## 1. Contenu

| Fichier | Rôle |
|---|---|
| `legal/mentions-legales.html` | Mentions légales (éditeur, hébergeurs, signalement, point de contact DSA) |
| `legal/cgu.html` | Conditions générales d'utilisation (21 articles) |
| `legal/cgv.html` | CGV / abonnements (prix, renouvellement, résiliation, rétractation 14 j, médiation, formulaire-type) |
| `legal/confidentialite.html` | Politique de confidentialité RGPD / nLPD + cookies |
| `legal/charte-communaute.html` | Charte de la communauté + sécurité + urgences |
| `legal/faq.html` | FAQ (cohérente avec les documents) |
| `legal/retractation.html` | Fonction de rétractation en ligne (bouton « Se rétracter du contrat ici ») |
| `legal/legal-config.js` | **UN SEUL fichier à remplir** : identité de l'éditeur, médiateur, droit applicable… |
| `js/legal-consent.js` | Pied de page légal, case à cocher d'inscription, fenêtre d'acceptation, confirmation avant paiement, lien de résiliation |
| `supabase/sql/06_legal.sql` | Tables de preuve `legal_consents` et `withdrawal_requests` (+ sécurité RLS) |
| `supabase/functions/create-portal-session/` | Portail Stripe : résiliation en ligne en quelques clics |
| `supabase/functions/create-checkout-session/index.ts` | Ton fichier existant + mentions légales sur la page de paiement Stripe |
| `index.html` | Ton loader existant + `js/legal-consent.js` ajouté (et `CACHE_V` changé) |

## 2. Mise en ligne (dans l'ordre)

1. **Remplir `legal/legal-config.js`** (voir §3). Tant qu'un champ « À COMPLÉTER » reste, un bandeau jaune « BROUILLON » s'affiche en haut des pages : ne pas publier avant qu'il ait disparu.
2. Copier dans le dépôt GitHub : dossier `legal/`, `js/legal-consent.js`, `index.html`, `supabase/…`. Push sur `main` (Cloudflare Pages redéploie).
3. Supabase → SQL Editor : exécuter `supabase/sql/06_legal.sql`.
4. Déployer les fonctions : `supabase functions deploy create-checkout-session` et `supabase functions deploy create-portal-session`.
5. Stripe → Paramètres → Billing → **Portail client** : activer « Les clients peuvent annuler leurs abonnements » (à la fin de la période). Stripe → Paramètres → E-mails clients : activer l'envoi des **reçus** pour paiements réussis.
6. Remplacer dans `i18n.js` l'ancien texte `footer.faq_content` (FAQ de 3 questions) par un lien vers `/legal/faq.html`.

## 3. Ce que toi seul peux renseigner (`legal-config.js`)

- Identité de l'éditeur : nom/raison sociale, forme, adresse, pays, n° SIREN/IDE, TVA, directeur de publication. **Obligatoire** : sans identité, les mentions légales sont non conformes (LCEN France / art. 3 LCD Suisse).
- Mention de prix : TTC, TVA non applicable (art. 293 B CGI), etc.
- Droit applicable et tribunaux compétents (ceux du pays de l'éditeur).
- **Médiateur de la consommation** : obligation légale (France : art. L612-1 Code conso) — choisis un médiateur référencé (il en coûte généralement une adhésion annuelle).
- Autorité de protection des données (CNIL / PFPDT…), région Supabase, représentant UE si l'éditeur est hors UE/EEE.
- Vérifier l'adresse de contact (`aupygo@protonmail.com`).

## 4. Points techniques à vérifier — priorité haute

1. **Suppression de compte vs abonnement Stripe.** Les CGU/CGV promettent que supprimer le compte met fin à l'abonnement. Ta fonction SQL `delete_user()` ne touche pas à Stripe (non visible dans le dépôt). Il faut qu'elle (ou une fonction serveur) annule `stripe_subscription_id` avant suppression, sinon un ancien membre pourrait continuer à être prélevé. Dis-moi et je te l'écris.
2. **Libellés « paiement bientôt »** dans `i18n.js` (`plans.*_active`) : à retirer maintenant que Stripe est actif (information précontractuelle incohérente).
3. **Fonctionnalités par forfait** : le tableau des CGV (art. 2) suit tes décisions de messagerie (FREE 10 messages / STANDARD 10 par jour / PREMIUM illimité + groupes). Les textes `plans.premium_f*` dans `i18n.js` doivent dire la même chose. En cas de divergence, c'est la page affichée à l'acheteur qui fait foi.
4. **Visiteurs non connectés** : la politique indique qu'ils voient « au plus » une position approximative. Vérifie que c'est bien le cas (vue `map_profiles` accessible au rôle `anon` ?).
5. **Fond de carte** : vérifie quel fournisseur de tuiles Leaflet est utilisé et garde son attribution visible.
6. **Accès Staff aux messages** : les CGU disent « pas de lecture systématique, consultation en cas de signalement / sécurité / réquisition ». Assure-toi que c'est la réalité (policies RLS).
7. **Rétractation** : la directive UE 2023/2673 (application depuis le 19/06/2026) impose une fonction de rétractation en ligne : fournie. Pense à **accuser réception par e-mail** à chaque demande (webhook Supabase suggéré à la fin de `06_legal.sql`) et à rembourser dans les 14 jours via Stripe.
8. **Inactivité 24 mois** : prévue comme un *droit* de suppression après préavis ; à planifier si tu veux l'appliquer.
9. **PayPal** : non mentionné (le code est un gabarit non activé). Si tu l'actives, ajoute PayPal (Europe) S.à r.l. et Cie, S.C.A. aux mentions légales et à la politique de confidentialité.
10. **Langues** : documents en français uniquement (la version française fait foi). Les cases à cocher existent en FR/EN/ES. Je peux produire les versions EN/ES.
11. **Analytique/publicité** : la politique dit « aucun traceur ». Si tu ajoutes un outil (Google Analytics, pixel…), il faudra un bandeau de consentement et une mise à jour de la politique.

## 5. Ce qui est en place côté preuve (utile en cas de litige)

- Case d'acceptation obligatoire (CGU + confidentialité + charte + 18 ans) avant « Créer mon compte » ; fenêtre bloquante après connexion si la version courante n'est pas acceptée (comptes existants, nouvelle version) ; refus = déconnexion.
- Avant tout paiement : récapitulatif (prix, durée, renouvellement) + 2 cases (CGV, activation immédiate/prorata) + bouton « Commande avec obligation de paiement » + message légal sur la page Stripe.
- Chaque acceptation est enregistrée (compte, document, version, date, contexte) dans `legal_consents`, non modifiable par l'utilisateur.
- **À chaque modification de fond** : incrémenter `version` dans `legal-config.js` **et** `VERSION` dans `js/legal-consent.js` (même numéro) → tous les membres devront ré-accepter.

## 6. Limite honnête

Aucun document ne supprime tout risque de contentieux : les clauses abusives sont réputées non écrites, et les droits impératifs des consommateurs priment toujours. J'ai donc rédigé des clauses **solides parce qu'équilibrées** (pas de plafond de responsabilité inopposable aux consommateurs, rétractation accordée à tous, résiliation facile, preuve d'acceptation), alignées sur ton code réel. Avant de commencer à encaisser à grande échelle, fais relire l'ensemble une fois par un avocat ou juriste (droit du numérique/consommation, ~1 à 2 h de travail) : c'est la vraie « assurance tribunal ». Ce dossier lui évitera de tout rédiger.
