/**
 * AUPYGO — Edge Function stripe-webhook
 * Écoute les événements Stripe et met à jour profiles.subscription + expires_at.
 *
 * Secrets requis :
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET  (whsec_... depuis Dashboard → Webhooks)
 *   SUPABASE_SERVICE_ROLE_KEY (auto)
 *
 * Événements à activer dans Stripe :
 *   - checkout.session.completed
 *   - invoice.payment_succeeded
 *   - customer.subscription.updated
 *   - customer.subscription.deleted
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";

const PRICE_TO_PLAN: Record<string, string> = {
  price_1UOMwUPetij5LBkM4uymFy8D: "STANDARD",
  price_1UOMwwPetij5LBkMj0nbSGWh: "PREMIUM",
  price_1UOMwyPetij5LBkMOCACAtTV: "STANDARD",
  price_1UOMwzPetij5LBkMMCuqU3Bc: "PREMIUM",
  standard_monthly: "STANDARD",
  premium_monthly: "PREMIUM",
  standard_6m: "STANDARD",
  premium_6m: "PREMIUM",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type, stripe-signature",
      },
    });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    console.error("[stripe-webhook] missing secrets");
    return json({ error: "not_configured" }, 500);
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2024-12-18.acacia",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return json({ error: "no_signature" }, 400);
  }

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] signature", err);
    return json({ error: "invalid_signature" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(admin, stripe, session);
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(admin, stripe, invoice);
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(admin, sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(admin, sub);
        break;
      }
      default:
        console.log(`[stripe-webhook] ignored ${event.type}`);
    }
  } catch (e) {
    console.error("[stripe-webhook] handler", e);
    return json({ error: "handler_error", message: String(e) }, 500);
  }

  return json({ received: true });
});

async function resolveUserId(
  admin: ReturnType<typeof createClient>,
  opts: {
    metadataUserId?: string | null;
    clientReferenceId?: string | null;
    customerId?: string | null;
  },
): Promise<string | null> {
  if (opts.metadataUserId) return opts.metadataUserId;
  if (opts.clientReferenceId) return opts.clientReferenceId;

  if (opts.customerId) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", opts.customerId)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  return null;
}

async function handleCheckoutCompleted(
  admin: ReturnType<typeof createClient>,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
) {
  const userId = await resolveUserId(admin, {
    metadataUserId: session.metadata?.supabase_user_id,
    clientReferenceId: session.client_reference_id,
    customerId:
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id,
  });
  if (!userId) {
    console.error("[checkout.completed] no user id", session.id);
    return;
  }

  const plan =
    (session.metadata?.plan || "STANDARD").toUpperCase() === "PREMIUM"
      ? "PREMIUM"
      : "STANDARD";
  const billing = session.metadata?.billing || "monthly";
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id || null;

  const updates: Record<string, unknown> = {
    subscription: plan,
    stripe_customer_id: customerId,
  };

  if (billing === "6months" || session.mode === "payment") {
    const expires = new Date();
    expires.setMonth(expires.getMonth() + 6);
    updates.subscription_expires_at = expires.toISOString();
    updates.stripe_subscription_id = null;
  } else if (session.subscription) {
    const subId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription.id;
    updates.stripe_subscription_id = subId;
    updates.subscription_expires_at = null;
  }

  const { error } = await admin
    .from("profiles")
    .update(updates)
    .eq("id", userId);

  if (error) {
    console.error("[checkout.completed] update", error);
  } else {
    console.log(
      `[checkout.completed] user=${userId} plan=${plan} billing=${billing}`,
    );
  }
}

async function handleInvoicePaid(
  admin: ReturnType<typeof createClient>,
  stripe: Stripe,
  invoice: Stripe.Invoice,
) {
  const subId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription?.id;
  if (!subId) return;

  const sub = await stripe.subscriptions.retrieve(subId);
  const userId = await resolveUserId(admin, {
    metadataUserId: sub.metadata?.supabase_user_id,
    customerId:
      typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
  });
  if (!userId) return;

  const priceId = sub.items?.data?.[0]?.price?.id;
  const plan =
    (PRICE_TO_PLAN[priceId || ""] ||
      sub.metadata?.plan ||
      "STANDARD").toUpperCase() === "PREMIUM"
      ? "PREMIUM"
      : "STANDARD";

  await admin
    .from("profiles")
    .update({
      subscription: plan,
      stripe_subscription_id: subId,
      subscription_expires_at: null,
    })
    .eq("id", userId);

  console.log(`[invoice.paid] user=${userId} plan=${plan}`);
}

async function handleSubscriptionUpdated(
  admin: ReturnType<typeof createClient>,
  sub: Stripe.Subscription,
) {
  const userId = await resolveUserId(admin, {
    metadataUserId: sub.metadata?.supabase_user_id,
    customerId:
      typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
  });
  if (!userId) return;

  if (sub.status === "active" || sub.status === "trialing") {
    const priceId = sub.items?.data?.[0]?.price?.id;
    const plan =
      (PRICE_TO_PLAN[priceId || ""] ||
        sub.metadata?.plan ||
        "STANDARD").toUpperCase() === "PREMIUM"
        ? "PREMIUM"
        : "STANDARD";
    await admin
      .from("profiles")
      .update({
        subscription: plan,
        stripe_subscription_id: sub.id,
      })
      .eq("id", userId);
  } else if (
    sub.status === "canceled" ||
    sub.status === "unpaid" ||
    sub.status === "incomplete_expired"
  ) {
    await admin
      .from("profiles")
      .update({
        subscription: "FREE",
        stripe_subscription_id: null,
        subscription_expires_at: null,
      })
      .eq("id", userId);
  }
}

async function handleSubscriptionDeleted(
  admin: ReturnType<typeof createClient>,
  sub: Stripe.Subscription,
) {
  const userId = await resolveUserId(admin, {
    metadataUserId: sub.metadata?.supabase_user_id,
    customerId:
      typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
  });
  if (!userId) return;

  await admin
    .from("profiles")
    .update({
      subscription: "FREE",
      stripe_subscription_id: null,
      subscription_expires_at: null,
    })
    .eq("id", userId);

  console.log(`[subscription.deleted] user=${userId} → FREE`);
}
