import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { publicOriginFromRequest } from "@/backend/app-base-url";
import { checkoutPriceIdForTier } from "@/backend/stripe-subscription-prices";
import { getStripeClient } from "@/backend/stripe";

export const runtime = "nodejs";

type TierBody = { tier: "host" | "host_pro" };

export async function POST(request: Request) {
  const supabase = await createAuthServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: TierBody;
  try {
    body = (await request.json()) as TierBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.tier !== "host" && body.tier !== "host_pro") {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }

  const priceId = checkoutPriceIdForTier(body.tier);
  if (!priceId) {
    return NextResponse.json(
      { error: "Stripe price not configured", detail: "Set STRIPE_PRICE_HOST / STRIPE_PRICE_HOST_PRO." },
      { status: 503 }
    );
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const origin = publicOriginFromRequest(request);
  const successUrl = `${origin}/pricing?subscribed=1`;
  const cancelUrl = `${origin}/pricing?canceled=1`;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: user.id,
    customer_email: user.email ?? undefined,
    metadata: {
      kind: "subscription",
      user_id: user.id,
      tier: body.tier,
    },
    subscription_data: {
      metadata: {
        user_id: user.id,
        tier: body.tier,
      },
    },
  });

  if (!session.url) {
    return NextResponse.json({ error: "Could not start checkout" }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
