/* AUPYGO — configuration publique (clé anon uniquement) */
const SUPABASE_URL = 'https://zdjcjzsmoinrkcezgivs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DzwtV1O2qUsZ6_JslOVpEg_BHoyy-Xi';

/* PayPal — Client ID PUBLIC uniquement (jamais le Secret).
   Sandbox pour tester, remplacer par le Client ID Live en production. */
const PAYPAL_CLIENT_ID = 'COLLE_ICI_TON_CLIENT_ID_PAYPAL';
const PAYPAL_CURRENCY = 'EUR';
/* IDs des plans d'abonnement créés dans PayPal (Produits → Plans d'abonnement) */
const PAYPAL_PLANS = {
  standard_monthly: 'P-XXXXXXXXXXXXXXXXXXXXXXXX',
  premium_monthly: 'P-XXXXXXXXXXXXXXXXXXXXXXXX',
};
