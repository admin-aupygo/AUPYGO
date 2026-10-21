# AUPYGO — Correctifs Stripe (21/10/2026)

## Fichiers à remplacer (même chemin dans ton dépôt GitHub)
- supabase/functions/create-checkout-session/index.ts
- supabase/functions/stripe-webhook/index.ts
- supabase/functions/create-portal-session/index.ts

## Ce qui a été corrigé
1. **Price IDs** : plus codés en dur. Les 4 `price_...` de test ne servent que si la clé est `sk_test_`.
   Avec une clé `sk_live_`, la fonction lit 4 secrets (voir ci-dessous) et refuse proprement (`live_price_not_configured`) s'ils manquent.
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

## Secrets à ajouter pour le mode LIVE (Dashboard → Edge Functions → Secrets)
- STRIPE_SECRET_KEY = sk_live_...
- STRIPE_WEBHOOK_SECRET = whsec_... (celui du webhook LIVE, créé dans Stripe en mode Live)
- STRIPE_PRICE_STANDARD_MONTHLY = price_... (LIVE)
- STRIPE_PRICE_PREMIUM_MONTHLY = price_... (LIVE)
- STRIPE_PRICE_STANDARD_6M = price_... (LIVE)
- STRIPE_PRICE_PREMIUM_6M = price_... (LIVE)

Dans Stripe en mode **Live** : recréer les 4 produits/prix (4,90 €/mois ; 9,90 €/mois ; 24,90 € une fois ; 51,60 € une fois), le webhook (URL de la fonction stripe-webhook, événements : checkout.session.completed, invoice.payment_succeeded, customer.subscription.updated, customer.subscription.deleted) et activer le Portail client.

## Si une erreur apparaît encore
Supabase → Edge Functions → create-checkout-session → **Logs** : chercher la ligne `[create-checkout] ERREUR` et me la copier.
