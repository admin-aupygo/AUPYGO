/**
 * AUPYGO — Edge Function create-checkout-session
 * Crée une session Stripe Checkout (abonnement mensuel ou Pass 6 mois).
 *
 * Body JSON: { price_key: "standard_monthly" | "premium_monthly" | "standard_6m" | "premium_6m" }
 * Auth: Bearer JWT utilisateur (obligatoire)
 *
 * Secrets requis (Supabase Dashboard → Edge Functions → Secrets) :
 *   STRIPE_SECRET_KEY   (sk_test_... en test, sk_live_... en production)
 *   Prix LIVE (obligatoires dès que la clé est sk_live_) :
 *     STRIPE_PRICE_STANDARD_MONTHLY, STRIPE_PRICE_PREMIUM_MONTHLY,
 *     STRIPE_PRICE_STANDARD_6M,      STRIPE_PRICE_PREMIUM_6M   (valeurs price_...)
 *   SITE_URL            (https://aupygo.com)
 *   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY (auto)
 */
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@17.7.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Offer = { mode: "subscription" | "payment"; plan: string; env: string; testPriceId: string };

/** Définition des 4 offres. Les price_ de test ne servent QUE si la clé est sk_test_. */
const OFFERS: Record<string, Offer> = {
  standard_monthly: {
    mode: "subscription",
    plan: "STANDARD",
    env: "STRIPE_PRICE_STANDARD_MONTHLY",
    testPriceId: "price_1UOMwUPetij5LBkM4uymFy8D",
  },
  premium_monthly: {
    mode: "subscription",
    plan: "PREMIUM",
    env: "STRIPE_PRICE_PREMIUM_MONTHLY",
    testPriceId: "price_1UOMwwPetij5LBkMj0nbSGWh",
  },
  standard_6m: {
    mode: "payment",
    plan: "STANDARD",
    env: "STRIPE_PRICE_STANDARD_6M",
    testPriceId: "price_1UOMwyPetij5LBkMOCACAtTV",
  },
  premium_6m: {
    mode: "payment",
    plan: "PREMIUM",
    env: "STRIPE_PRICE_PREMIUM_6M",
    testPriceId: "price_1UOMwzPetij5LBkMMCuqU3Bc",
  },
};

/** Secret d'abord (production), sinon price_ de test uniquement si clé de test. */
function resolvePriceId(offer: Offer, stripeKey: string): string | null {
  const fromEnv = (Deno.env.get(offer.env) || "").trim();
  if (fromEnv) return fromEnv;
  const isTestKey = stripeKey.startsWith("sk_test_") ||
    stripeKey.startsWith("rk_test_");
  return isTestKey ? offer.testPriceId : null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "not_authenticated" }, 401);
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      console.error("[create-checkout] STRIPE_SECRET_KEY missing");
      return json({ error: "stripe_not_configured" }, 500);
    }

    const siteUrl = (Deno.env.get("SITE_URL") || "https://aupygo.com").replace(
      /\/$/,
      "",
    );
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Vérifier l'utilisateur
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "not_authenticated" }, 401);
    }
    const user = userData.user;

    const body = await req.json().catch(() => ({}));
    const priceKey = String(body.price_key || "").trim();
    const offer = OFFERS[priceKey];
    if (!offer) {
      return json(
        {
          error: "invalid_price_key",
          allowed: Object.keys(OFFERS),
        },
        400,
      );
    }

    const priceId = resolvePriceId(offer, stripeKey);
    if (!priceId) {
      console.error(
        `[create-checkout] clé live sans secret ${offer.env} (price_key=${priceKey})`,
      );
      return json({ error: "live_price_not_configured", secret: offer.env }, 500);
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-12-18.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Récupérer ou créer le Customer Stripe lié au profil
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await admin
      .from("profiles")
      .select("id, display_name, stripe_customer_id, email")
      .eq("id", user.id)
      .maybeSingle();

    let customerId = profile?.stripe_customer_id || null;

    // Un customer créé en mode Test n'existe pas en Live (et inversement) :
    // on vérifie qu'il existe pour la clé actuelle, sinon on en recrée un.
    if (customerId) {
      try {
        const existing = await stripe.customers.retrieve(customerId);
        if ((existing as { deleted?: boolean }).deleted) customerId = null;
      } catch (e) {
        const code = (e as { code?: string })?.code;
        if (code === "resource_missing") {
          console.warn(
            `[create-checkout] customer ${customerId} introuvable avec cette clé Stripe → recréation`,
          );
          customerId = null;
        } else {
          throw e;
        }
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        name: profile?.display_name || undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await admin
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: offer.mode,
      success_url: `${siteUrl}/?checkout=success&plan=${offer.plan}`,
      cancel_url: `${siteUrl}/?checkout=cancel`,
      metadata: {
        supabase_user_id: user.id,
        plan: offer.plan,
        price_key: priceKey,
        billing: offer.mode === "subscription" ? "monthly" : "6months",
        cgv_version: "1.0",
      },
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      locale: "fr",
      // Mentions légales affichées sur la page de paiement Stripe (non contournables)
      custom_text: {
        submit: {
          message:
            offer.mode === "subscription"
              ? "Abonnement renouvelé chaque mois jusqu'à résiliation (résiliable à tout moment en ligne, effet à la fin de la période payée). Droit de rétractation de 14 jours ; activation immédiate demandée : la part du service utilisé reste due au prorata. CGV : " +
                siteUrl +
                "/legal/cgv.html"
              : "Paiement unique pour 6 mois, sans renouvellement automatique. Droit de rétractation de 14 jours ; activation immédiate demandée : la part du service utilisé reste due au prorata. CGV : " +
                siteUrl +
                "/legal/cgv.html",
        },
      },
    };

    // Pour les abonnements : metadata sur la subscription
    if (offer.mode === "subscription") {
      sessionParams.subscription_data = {
        metadata: {
          supabase_user_id: user.id,
          plan: offer.plan,
          price_key: priceKey,
        },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return json({
      ok: true,
      url: session.url,
      session_id: session.id,
    });
  } catch (e) {
    const err = e as { message?: string; type?: string; code?: string; stack?: string };
    console.error(
      "[create-checkout] ERREUR",
      JSON.stringify({ message: err?.message, type: err?.type, code: err?.code }),
      err?.stack || "",
    );
    return json(
      {
        error: "server_error",
        message: String((e as Error)?.message || e),
      },
      500,
    );
  }
});
