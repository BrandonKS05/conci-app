import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripeClient } from "@/backend/stripe";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";

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
    await handleCheckoutCompleted(session);
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
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
