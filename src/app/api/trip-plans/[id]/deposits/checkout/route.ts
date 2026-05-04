import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { getStripeClient } from "@/backend/stripe";
import { appBaseUrl } from "@/backend/app-base-url";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { normalizePlan } from "@/shared/trip-plan";
import { isUuid } from "@/shared/is-uuid";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid trip id" }, { status: 400 });
  }

  const supabase = await createAuthServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 503 }
    );
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe is not configured" },
      { status: 503 }
    );
  }

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    return NextResponse.json(
      { error: "You don't have access to this trip" },
      { status: 403 }
    );
  }

  let body: { amount_cents?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const amountCents = body.amount_cents;
  if (
    typeof amountCents !== "number" ||
    !Number.isInteger(amountCents) ||
    amountCents < 100
  ) {
    return NextResponse.json(
      { error: "Amount must be at least $1.00 (100 cents)" },
      { status: 400 }
    );
  }
  if (amountCents > 999999) {
    return NextResponse.json(
      { error: "Amount exceeds maximum" },
      { status: 400 }
    );
  }

  const { data: tripRow } = await svc
    .from("trip_plans")
    .select("plan")
    .eq("id", id)
    .maybeSingle();
  const plan = tripRow?.plan ? normalizePlan(tripRow.plan) : null;
  const tripTitle = plan?.title?.trim() || "Trip";

  const displayName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "Member";

  const { data: deposit, error: insertErr } = await svc
    .from("trip_deposits")
    .insert({
      trip_plan_id: id,
      user_id: user.id,
      amount_cents: amountCents,
      currency: "usd",
      status: "pending",
      contributor_name: displayName,
    })
    .select("id")
    .single();

  if (insertErr || !deposit) {
    console.error("[deposits/checkout] insert failed:", insertErr?.message);
    return NextResponse.json(
      { error: "Failed to create deposit record" },
      { status: 500 }
    );
  }

  const base = appBaseUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: user.email ?? undefined,
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: {
            name: `Deposit for ${tripTitle}`,
            description: `Contribution by ${displayName}`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      trip_plan_id: id,
      deposit_id: deposit.id,
      user_id: user.id,
      contributor_name: displayName,
    },
    success_url: `${base}/trip/${id}?deposit=success`,
    cancel_url: `${base}/trip/${id}?deposit=cancelled`,
  });

  const { error: updErr } = await svc
    .from("trip_deposits")
    .update({ stripe_checkout_session_id: session.id })
    .eq("id", deposit.id);

  if (updErr) {
    console.error(
      "[deposits/checkout] session id update failed:",
      updErr.message
    );
  }

  return NextResponse.json({ url: session.url });
}
