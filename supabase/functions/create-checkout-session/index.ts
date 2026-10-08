/**
 * AUPYGO — Edge Function create-checkout-session
 * Crée une session Stripe Checkout (abonnement mensuel ou Pass 6 mois).
 *
 * Body JSON: { price_key: "standard_monthly" | "premium_monthly" | "standard_6m" | "premium_6m" }
 * Auth: Bearer JWT utilisateur (obligatoire)
 *
 * Secrets requis (Supabase Dashboard → Edge Functions → Secrets) :
 *   STRIPE_SECRET_KEY   (sk_test_... en mode test)
 *   SITE_URL            (https://aupygo.com)
 *   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY (auto)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Price IDs mode Test — à remplacer par les price_ live lors du passage en production */
const PRICE_MAP: Record<
  string,
  { priceId: string; mode: "subscription" | "payment"; plan: string }
> = {
  standard_monthly: {
    priceId: "price_1UOMwUPetij5LBkM4uymFy8D",
    mode: "subscription",
    plan: "STANDARD",
  },
  premium_monthly: {
    priceId: "price_1UOMwwPetij5LBkMj0nbSGWh",
    mode: "subscription",
    plan: "PREMIUM",
  },
  standard_6m: {
    priceId: "price_1UOMwyPetij5LBkMOCACAtTV",
    mode: "payment",
    plan: "STANDARD",
  },
  premium_6m: {
    priceId: "price_1UOMwzPetij5LBkMMCuqU3Bc",
    mode: "payment",
    plan: "PREMIUM",
  },
};

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
    const offer = PRICE_MAP[priceKey];
    if (!offer) {
      return json(
        {
          error: "invalid_price_key",
          allowed: Object.keys(PRICE_MAP),
        },
        400,
      );
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
      line_items: [{ price: offer.priceId, quantity: 1 }],
      mode: offer.mode,
      success_url: `${siteUrl}/?checkout=success&plan=${offer.plan}`,
      cancel_url: `${siteUrl}/?checkout=cancel`,
      metadata: {
        supabase_user_id: user.id,
        plan: offer.plan,
        price_key: priceKey,
        billing: offer.mode === "subscription" ? "monthly" : "6months",
      },
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      locale: "fr",
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
    console.error("[create-checkout]", e);
    return json(
      {
        error: "server_error",
        message: String((e as Error)?.message || e),
      },
      500,
    );
  }
});
