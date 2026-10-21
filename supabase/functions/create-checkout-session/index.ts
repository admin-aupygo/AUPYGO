/**
 * AUPYGO — Edge Function create-checkout-session
 * Crée une session Stripe Checkout (abonnement mensuel ou Pass 6 mois).
 *
 * Body JSON: { price_key: "standard_monthly" | "premium_monthly" | "standard_6m" | "premium_6m" }
 * Auth: Bearer JWT utilisateur (obligatoire)
 *
 * Secrets requis (Supabase Dashboard → Edge Functions → Secrets) :
 *   STRIPE_SECRET_KEY   (sk_test_... en test, sk_live_... en production)
 *   Prix : retrouvés automatiquement dans Stripe (nom du produit + montant + type).
 *   STRIPE_PRICE_STANDARD_MONTHLY / PREMIUM_MONTHLY / STANDARD_6M / PREMIUM_6M
 *   sont FACULTATIFS : s'ils existent, ils ont priorité.
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

type Offer = {
  mode: "subscription" | "payment";
  plan: string;
  productName: string; // nom exact du produit dans Stripe
  amount: number; // en centimes
  env: string; // secret optionnel pour forcer un price_ précis
};

/** Les 4 offres, retrouvées dans Stripe par nom de produit + montant + type. */
const OFFERS: Record<string, Offer> = {
  standard_monthly: {
    mode: "subscription",
    plan: "STANDARD",
    productName: "AUPYGO Standard Mensuel",
    amount: 490,
    env: "STRIPE_PRICE_STANDARD_MONTHLY",
  },
  premium_monthly: {
    mode: "subscription",
    plan: "PREMIUM",
    productName: "AUPYGO Premium Mensuel",
    amount: 990,
    env: "STRIPE_PRICE_PREMIUM_MONTHLY",
  },
  standard_6m: {
    mode: "payment",
    plan: "STANDARD",
    productName: "AUPYGO Standard Pass 6 mois",
    amount: 2490,
    env: "STRIPE_PRICE_STANDARD_6M",
  },
  premium_6m: {
    mode: "payment",
    plan: "PREMIUM",
    productName: "AUPYGO Premium Pass 6 mois",
    amount: 5160,
    env: "STRIPE_PRICE_PREMIUM_6M",
  },
};

const priceCache = new Map<string, string>();

/**
 * 1) secret STRIPE_PRICE_* s'il existe (optionnel) ;
 * 2) sinon recherche dans Stripe (mode de la clé utilisée) : produit actif au nom exact,
 *    prix actif en EUR, montant exact, mensuel (subscription) ou unique (payment).
 */
async function resolvePriceId(
  stripe: Stripe,
  offer: Offer,
): Promise<string | null> {
  const fromEnv = (Deno.env.get(offer.env) || "").trim();
  if (fromEnv) return fromEnv;

  const cached = priceCache.get(offer.productName);
  if (cached) return cached;

  const prices = await stripe.prices.list({
    active: true,
    currency: "eur",
    limit: 100,
    expand: ["data.product"],
  });

  const match = prices.data.find((p) => {
    const product = p.product as Stripe.Product | Stripe.DeletedProduct | string;
    if (!product || typeof product === "string" || product.deleted) return false;
    if (!product.active || product.name.trim() !== offer.productName) return false;
    if (p.unit_amount !== offer.amount) return false;
    return offer.mode === "subscription"
      ? p.type === "recurring" && p.recurring?.interval === "month" &&
        p.recurring?.interval_count === 1
      : p.type === "one_time";
  });

  if (match) priceCache.set(offer.productName, match.id);
  return match?.id ?? null;
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

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-12-18.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const priceId = await resolvePriceId(stripe, offer);
    if (!priceId) {
      console.error(
        `[create-checkout] prix introuvable dans Stripe : "${offer.productName}" ${offer.amount / 100} EUR (${offer.mode})`,
      );
      return json(
        {
          error: "price_not_found",
          product: offer.productName,
          amount_eur: offer.amount / 100,
        },
        500,
      );
    }

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
