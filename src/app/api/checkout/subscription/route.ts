import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { publicOriginFromRequest } from "@/backend/app-base-url";
import { getStripeClient } from "@/backend/stripe";

export const runtime = "nodejs";

type TierBody = { tier: "host" | "host_pro" };

export async function POST(request: Request) {
  // Server reads `STRIPE_PRICE_HOST` / `STRIPE_PRICE_HOST_PRO` from process.env (Next.js loads .env.local etc.)
  console.log(
    "[checkout/subscription] STRIPE_PRICE_HOST=%s STRIPE_PRICE_HOST_PRO=%s",
    process.env.STRIPE_PRICE_HOST ?? "(unset)",
    process.env.STRIPE_PRICE_HOST_PRO ?? "(unset)"
  );

  const supabase = await createAuthServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    const next = encodeURIComponent("/pricing");
    return NextResponse.json(
      {
        error: "Unauthorized",
        detail: "Sign in to subscribe.",
        redirect: `/auth?next=${next}`,
      },
      { status: 401 }
    );
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

  const priceId =
    body.tier === "host"
      ? process.env.STRIPE_PRICE_HOST?.trim() || null
      : process.env.STRIPE_PRICE_HOST_PRO?.trim() || null;
  if (!priceId) {
    return NextResponse.json(
      {
        error: "Stripe price not configured",
        detail: "Set STRIPE_PRICE_HOST / STRIPE_PRICE_HOST_PRO in the server environment.",
      },
      { status: 503 }
    );
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe not configured", detail: "Set STRIPE_SECRET_KEY." },
      { status: 503 }
    );
  }

  const origin = publicOriginFromRequest(request);
  const successUrl = `${origin}/pricing?subscribed=1`;
  const cancelUrl = `${origin}/pricing?canceled=1`;

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
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
  } catch (err: unknown) {
    console.error("[checkout/subscription] Stripe checkout.sessions.create failed:", err);
    const stripeLike = err as {
      type?: string;
      code?: string;
      message?: string;
      statusCode?: number;
      requestId?: string;
      raw?: unknown;
    };
    console.error("[checkout/subscription] Stripe error full:", {
      type: stripeLike.type,
      code: stripeLike.code,
      message: stripeLike.message,
      statusCode: stripeLike.statusCode,
      requestId: stripeLike.requestId,
      raw: stripeLike.raw ?? err,
    });
    const detail =
      typeof stripeLike.message === "string" && stripeLike.message
        ? stripeLike.message
        : "Stripe could not create the checkout session.";
    return NextResponse.json(
      { error: "Could not start checkout", detail },
      { status: 502 }
    );
  }

  if (!session.url) {
    console.error("[checkout/subscription] Session missing url", { id: session.id });
    return NextResponse.json(
      { error: "Could not start checkout", detail: "Checkout session had no redirect URL." },
      { status: 500 }
    );
  }

  return NextResponse.json({ url: session.url });
}
