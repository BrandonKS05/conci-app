import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { publicOriginFromRequest } from "@/backend/app-base-url";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { getStripeClient } from "@/backend/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await createAuthServerClient();
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const { data: profile } = await svc
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  const customerId =
    typeof profile?.stripe_customer_id === "string" ? profile.stripe_customer_id.trim() : "";
  if (!customerId) {
    return NextResponse.json(
      { error: "No Stripe customer on file", detail: "Subscribe to a paid plan first." },
      { status: 400 }
    );
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const origin = publicOriginFromRequest(request);
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/settings`,
  });

  if (!session.url) {
    return NextResponse.json({ error: "Could not start billing portal" }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
