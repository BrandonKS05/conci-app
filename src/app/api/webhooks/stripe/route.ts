import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripeClient } from "@/backend/stripe";
import { tierFromStripePriceId } from "@/backend/stripe-subscription-prices";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import type { SubscriptionTier } from "@/shared/subscription";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const stripe = getStripeClient();
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 503 }
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 503 }
    );
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe-webhook] signature verification failed:", message);
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.kind === "subscription") {
      await handleSubscriptionCheckoutCompleted(stripe, session);
    } else if (session.metadata?.deposit_id) {
      await handleDepositCheckoutCompleted(session);
    }
  }

  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object as Stripe.Subscription;
    await handleSubscriptionUpdated(sub);
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    await handleSubscriptionEnded(sub.id);
  }

  return NextResponse.json({ received: true });
}

async function handleSubscriptionCheckoutCompleted(stripe: Stripe, session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id;
  const tierMeta = session.metadata?.tier;
  if (!userId || (tierMeta !== "host" && tierMeta !== "host_pro")) {
    console.error("[stripe-webhook] subscription checkout missing user_id/tier metadata");
    return;
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    console.error("[stripe-webhook] No Supabase service client");
    return;
  }

  let tier: SubscriptionTier = tierMeta;
  const subId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
  if (subId) {
    try {
      const fullSub = await stripe.subscriptions.retrieve(subId);
      const priceId = fullSub.items.data[0]?.price?.id;
      const fromPrice = tierFromStripePriceId(priceId);
      if (fromPrice) tier = fromPrice;
    } catch (e) {
      console.error("[stripe-webhook] could not load subscription for tier verify:", e);
    }
  }

  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

  const { error } = await svc.from("profiles").upsert(
    {
      id: userId,
      subscription_tier: tier,
      stripe_customer_id: customerId,
      stripe_subscription_id: subId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) {
    console.error("[stripe-webhook] profiles upsert failed:", error.message, { userId });
  }
}

async function handleDepositCheckoutCompleted(session: Stripe.Checkout.Session) {
  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    console.error("[stripe-webhook] No Supabase service client");
    return;
  }

  const depositId = session.metadata?.deposit_id;
  if (!depositId) {
    console.error("[stripe-webhook] No deposit_id in session metadata");
    return;
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const { error } = await svc
    .from("trip_deposits")
    .update({
      status: "succeeded",
      stripe_payment_intent_id: paymentIntentId,
    })
    .eq("id", depositId)
    .eq("status", "pending");

  if (error) {
    console.error(
      "[stripe-webhook] deposit update failed:",
      error.message,
      { depositId }
    );
  }
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  const priceId = sub.items.data[0]?.price?.id;
  const tier = tierFromStripePriceId(priceId);
  if (!tier) {
    console.warn("[stripe-webhook] subscription.updated unknown price", priceId);
    return;
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) return;

  const subId = sub.id;
  const { error } = await svc
    .from("profiles")
    .update({
      subscription_tier: tier,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subId);

  if (error) {
    console.error("[stripe-webhook] profiles update from subscription failed:", error.message);
  }
}

async function handleSubscriptionEnded(stripeSubscriptionId: string) {
  const svc = getSupabaseServiceRoleClient();
  if (!svc) return;

  const { error } = await svc
    .from("profiles")
    .update({
      subscription_tier: "free",
      stripe_subscription_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", stripeSubscriptionId);

  if (error) {
    console.error("[stripe-webhook] profiles clear subscription failed:", error.message);
  }
}
