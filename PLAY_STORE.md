# AUPYGO → Google Play (Android)

Objectif : **garder le site web** (aupygo.com) et publier la **même expérience** comme application Android sur le Play Store (frais unique **25 $**).

Méthode retenue : **Capacitor** = coque native Android autour du site existant.

---

## 1. Ce que tu gardes

- Tout le code actuel (HTML / JS / CSS / Supabase / Stripe)
- L’URL publique : https://aupygo.com
- Les mises à jour du site = mises à jour de l’app (si mode “live URL”)

## 2. Ce qu’il faut en plus

| Élément | Détail |
|--------|--------|
| Compte Google Play | [play.google.com/console](https://play.google.com/console) — **25 $ une fois** |
| Ordinateur | macOS, Windows ou Linux |
| Outils | Node.js 20+, Android Studio (SDK + build tools) |
| Identifiant app | ex. `com.aupygo.app` (unique, ne change plus après publication) |
| Icônes | 512×512 PNG minimum (idéalement 1024×1024) |
| Captures d’écran | téléphone (min. 2) pour la fiche Play Store |

---

## 3. Choix technique (important)

Deux modes possibles avec Capacitor :

### A. App “coque” qui charge le site en live (recommandé pour commencer)
- L’app ouvre `https://aupygo.com`
- Tu modifies le site → l’app affiche tout de suite les changements
- Build Android plus simple
- Google accepte si l’app apporte une vraie valeur (notif, install, etc.)

### B. App qui embarque les fichiers web
- Les fichiers sont dans l’APK
- Chaque maj web exige un nouveau build + soumission Play Store
- Plus de contrôle offline, mais plus lourd à maintenir

**On part sur le mode A** (site live) pour rester agile.

---

## 4. Étapes concrètes

### Étape A — Compte Play Console
1. Créer un compte Google (ou utiliser le tien)
2. S’inscrire sur [Google Play Console](https://play.google.com/console) → payer **25 $**
3. Créer une application : nom **AUPYGO**, langue par défaut FR

### Étape B — Préparer le projet (sur ton PC)

```bash
# 1. Cloner le dépôt
git clone https://github.com/admin-aupygo/AUPYGO.git
cd AUPYGO

# 2. Init Capacitor (une seule fois)
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "AUPYGO" "com.aupygo.app" --web-dir www

# 3. Le fichier capacitor.config.json est déjà dans le repo

# 4. Ajouter Android
npx cap add android
npx cap sync android

# 5. Ouvrir dans Android Studio
npx cap open android
```

### Étape C — Build de test
1. Dans Android Studio : lancer sur un émulateur ou un téléphone USB
2. Vérifier connexion, carte, messages, abonnements

### Étape D — Signature & publication
1. Générer une **keystore** (une seule fois, à sauvegarder précieusement)
2. Build **AAB** (Android App Bundle)
3. Upload dans Play Console → test interne → production

---

## 5. Fichier `capacitor.config.json` (mode site live)

Déjà présent à la racine du dépôt. Il charge `https://aupygo.com`.

---

## 6. Points de vigilance Play Store

1. **Paiements**  
   - Abonnements digitaux : Google préfère (ou impose) Google Play Billing.  
   - Stripe “web only” peut être refusé si l’app n’est qu’une coque de paiement.  
   - À anticiper : soit garder le paiement sur le site (lien externe), soit intégrer Billing plus tard.

2. **Confidentialité**  
   - Lien politique de confidentialité obligatoire  
   - Déclaration Data safety (localisation approx, compte, messages…)

3. **Contenu / âge**  
   - Communauté au pairs → préciser public cible (18+)  
   - Modération déjà en place = argument positif

4. **Icônes & store listing**  
   - Icône haute résolution (pas seulement le SVG emoji actuel)  
   - Description FR (+ EN recommandé)  
   - 2 à 8 captures d’écran téléphone

---

## 7. Ordre de travail recommandé

| # | Action | Qui |
|---|--------|-----|
| 1 | Créer compte Play Console (25 $) | Toi |
| 2 | Fournir / valider icône 512+ PNG | Toi (ou on génère une base) |
| 3 | Ajouter `capacitor.config.json` + guide dans le repo | Fait |
| 4 | Installer Node + Android Studio sur ton PC | Toi |
| 5 | Premier build de test (APK interne) | Toi + assistance |
| 6 | Fiche store + Data safety | Toi |
| 7 | Soumission production | Toi |

---

## 8. Coûts récurrents

- Google Play : **25 $ une seule fois**
- Apple (plus tard, optionnel) : **99 $/an**
- Hébergement site : inchangé (aupygo.com)

---

## 9. Suite immédiate

Dis ce que tu as déjà :
- [ ] Compte Google Play créé / payé
- [ ] Android Studio installé
- [ ] Icône PNG 512×512 (ou on part d’une version simple)

Ensuite on enchaîne sur le premier build de test.
