import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { bookDuffelFlight } from "@/backend/duffel/flights";
import { isUuid } from "@/shared/is-uuid";
import type { DuffelFlightPassenger, DuffelOffer, DuffelFlightsBookApiResponse } from "@/shared/duffel-flights";

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
    return NextResponse.json({ error: "Trip not found." }, { status: 403 });
  }

  let body: { offerId?: string; passengers?: DuffelFlightPassenger[]; offer?: DuffelOffer };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON", booking: null } satisfies DuffelFlightsBookApiResponse, { status: 400 });
  }

  const offerId = typeof body.offerId === "string" ? body.offerId.trim() : "";
  const offer = body.offer;
  const passengers = body.passengers;

  if (!offerId || !offer || !Array.isArray(passengers) || passengers.length === 0) {
    return NextResponse.json(
      { error: "offerId, offer, and passengers are required.", booking: null } satisfies DuffelFlightsBookApiResponse,
      { status: 400 }
    );
  }

  const leadPax = passengers[0]!;
  if (!leadPax.given_name || !leadPax.family_name || !leadPax.email || !leadPax.born_on) {
    return NextResponse.json(
      { error: "Each passenger needs given_name, family_name, email, and born_on.", booking: null } satisfies DuffelFlightsBookApiResponse,
      { status: 400 }
    );
  }

  try {
    const { booking } = await bookDuffelFlight({ offerId, passengers, offer });
    return NextResponse.json({ booking } satisfies DuffelFlightsBookApiResponse);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Booking failed.";
    console.error("[duffel/flights/book]", msg);
    return NextResponse.json(
      { error: msg, booking: null } satisfies DuffelFlightsBookApiResponse,
      { status: 502 }
    );
  }
}
