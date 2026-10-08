# AUPYGO — Mise en place PayPal

## 1. PayPal (developer.paypal.com → Apps & Credentials)
1. Crée une app (mode **Sandbox** d'abord). Note le **Client ID** et le **Secret**.
2. **Plans d'abonnement** (compte Business → Produits et services → Abonnements, ou Sandbox) :
   crée 2 plans mensuels en EUR : Standard 4,90 € et Premium 9,90 €. Note les IDs `P-...`.
3. **Webhook** (App → Webhooks → Add) : URL
   `https://zdjcjzsmoinrkcezgivs.supabase.co/functions/v1/paypal-webhook`
   Événements : BILLING.SUBSCRIPTION.ACTIVATED / CANCELLED / SUSPENDED / EXPIRED, PAYMENT.SALE.COMPLETED.
   Note le **Webhook ID**.

## 2. Supabase
1. SQL Editor → exécuter `supabase/sql/05_paypal.sql`.
2. Secrets (Edge Functions → Secrets) :
   PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_ENV (sandbox | live), PAYPAL_WEBHOOK_ID,
   PAYPAL_PLAN_STANDARD_MONTHLY, PAYPAL_PLAN_PREMIUM_MONTHLY
3. Déployer :
   supabase functions deploy paypal-create-order
   supabase functions deploy paypal-capture-order
   supabase functions deploy paypal-activate-subscription
   supabase functions deploy paypal-webhook --no-verify-jwt

## 3. Site
- `config.js` : renseigner PAYPAL_CLIENT_ID (public) et PAYPAL_PLANS (IDs P-...).
- `js/paypal-checkout.js` est déjà ajouté dans le loader `index.html`.
- Les boutons existants `selectPlan('STANDARD'|'PREMIUM', 'monthly'|'pass6')` ouvrent désormais la fenêtre PayPal.

## 4. Passage en production
Remplacer Client ID / Secret / plans / webhook par ceux du mode **Live**, et PAYPAL_ENV=live.

## Rappels
- Le Secret PayPal ne va JAMAIS dans config.js ni dans le navigateur.
- Les prix sont définis dans `supabase/functions/_shared/paypal.ts` (OFFERS) — à garder identiques à ceux affichés sur le site.
- Planifier `select public.expire_pass_subscriptions();` (pg_cron, 1×/jour) pour rétrograder les Pass expirés et les abonnements résiliés.
