/**
 * AUPYGO — Edge Function create-portal-session
 * Ouvre le portail client Stripe (résiliation en ligne, factures, moyen de paiement).
 *
 * Auth : Bearer JWT utilisateur (obligatoire).
 * Secrets requis : STRIPE_SECRET_KEY, SITE_URL (https://aupygo.com)
 * Prérequis Stripe : Dashboard → Paramètres → Billing → Portail client → activer
 *   « Autoriser les clients à annuler leurs abonnements » (annulation à la fin de la période).
 *
 * Déploiement : supabase functions deploy create-portal-session
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "not_authenticated" }, 401);
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "stripe_not_configured" }, 500);

    const siteUrl = (Deno.env.get("SITE_URL") || "https://aupygo.com").replace(
      /\/$/,
      "",
    );
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "not_authenticated" }, 401);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (!profile?.stripe_customer_id) {
      return json({ error: "no_customer" }, 404);
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-12-18.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: siteUrl + "/",
    });

    return json({ ok: true, url: session.url });
  } catch (e) {
    console.error("[create-portal-session]", e);
    return json(
      {
        error: "server_error",
        message: String((e as Error)?.message || e),
      },
      500,
    );
  }
});
