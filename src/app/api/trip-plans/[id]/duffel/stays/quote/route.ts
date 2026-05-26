import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { quoteDuffelStayRate } from "@/backend/duffel/stays";
import { isUuid } from "@/shared/is-uuid";
import type { DuffelStaysQuoteApiResponse } from "@/shared/duffel-stays";

export const runtime = "nodejs";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid trip id." }, { status: 400 });
  }

  const auth = await createAuthServerClient();
  const { data: { user }, error: authErr } = await auth.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "You don't have access to this trip." }, { status: 403 });
  }

  let body: { rateId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rateId = typeof body.rateId === "string" ? body.rateId.trim() : "";
  if (!rateId) {
    return NextResponse.json(
      { error: "rateId is required.", rate: null, accommodation: null, quoteId: null, isMock: false } satisfies DuffelStaysQuoteApiResponse,
      { status: 400 }
    );
  }

  try {
    const { rate, accommodation, quoteId, isMock } = await quoteDuffelStayRate(rateId);
    return NextResponse.json({
      rate,
      accommodation,
      quoteId,
      isMock,
    } satisfies DuffelStaysQuoteApiResponse);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Rate check failed.";
    console.error("[duffel/stays/quote]", msg);
    return NextResponse.json(
      { error: msg, rate: null, accommodation: null, quoteId: null, isMock: false } satisfies DuffelStaysQuoteApiResponse,
      { status: 502 }
    );
  }
}
