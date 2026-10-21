# AUPYGO — Correctifs Stripe (21/10/2026)

## Fichiers à remplacer (même chemin dans ton dépôt GitHub)
- supabase/functions/create-checkout-session/index.ts
- supabase/functions/stripe-webhook/index.ts
- supabase/functions/create-portal-session/index.ts

## Ce qui a été corrigé
1. **Price IDs** : plus codés en dur. La fonction retrouve les prix toute seule dans Stripe (mode de la clé utilisée) par **nom de produit exact + montant + type** : « AUPYGO Standard Mensuel » 4,90 €/mois, « AUPYGO Premium Mensuel » 9,90 €/mois, « AUPYGO Standard Pass 6 mois » 24,90 € unique, « AUPYGO Premium Pass 6 mois » 51,60 € unique. Si un prix est introuvable : erreur `price_not_found` (avec le nom attendu). Ne renomme donc pas ces produits dans Stripe.
2. **Webhook** : `constructEvent` (synchrone) ne marche pas sous Deno → remplacé par `constructEventAsync` + `createSubtleCryptoProvider()`. Sans ça, la signature Stripe échoue et l'abonnement n'est jamais activé.
3. **Customer test ≠ customer live** : un `stripe_customer_id` créé en test n'existe pas en live. Si Stripe répond `resource_missing`, un nouveau customer est créé automatiquement (checkout) / `no_customer` renvoyé (portail).
4. **Imports** : `esm.sh/...?target=deno` remplacé par `npm:stripe@17.7.0` et `npm:@supabase/supabase-js@2.49.1` (méthode actuelle Supabase, évite les soucis de polyfills qui peuvent donner `Deno.core.runMicrotasks()`).
5. **Logs** : en cas d'erreur, `[create-checkout] ERREUR {message,type,code}` + stack, pour voir la vraie cause.

## Déploiement
```
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy create-portal-session
```
(ou copier/coller dans Dashboard → Edge Functions)

## Secrets Supabase (Dashboard → Edge Functions → Secrets)
- STRIPE_SECRET_KEY = ta clé Live (rk_live_... ou sk_live_...)
- STRIPE_WEBHOOK_SECRET = whsec_... (webhook créé en mode Live)
- SITE_URL = https://aupygo.com
Aucun secret de prix n'est nécessaire (STRIPE_PRICE_* sont facultatifs).

## Autorisations de la clé restreinte rk_live_ (Stripe → Développeurs → Clés API)
- Écriture : Checkout Sessions, Customers, Customer portal sessions
- Lecture : Prices, Products, Subscriptions, Invoices
(la lecture de Prices + Products est indispensable pour retrouver les prix)

## Webhook Live (Stripe → Développeurs → Webhooks)
URL = fonction stripe-webhook ; événements : checkout.session.completed, invoice.payment_succeeded, customer.subscription.updated, customer.subscription.deleted.

## Si une erreur apparaît encore
Supabase → Edge Functions → create-checkout-session → **Logs** : chercher la ligne `[create-checkout] ERREUR` et me la copier.
