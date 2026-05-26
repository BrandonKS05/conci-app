import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { searchDuffelFlights } from "@/backend/duffel/flights";
import { isUuid } from "@/shared/is-uuid";
import type { DuffelFlightsSearchApiResponse } from "@/shared/duffel-flights";

export const runtime = "nodejs";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const IATA = /^[A-Z]{3}$/;

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
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

  const url = new URL(req.url);
  const origin = (url.searchParams.get("origin") ?? "").trim().toUpperCase();
  const destination = (url.searchParams.get("destination") ?? "").trim().toUpperCase();
  const departureDate = (url.searchParams.get("date") ?? "").trim();
  const passengers = Math.max(1, Number(url.searchParams.get("passengers")) || 1);

  if (!IATA.test(origin) || !IATA.test(destination)) {
    return NextResponse.json(
      { error: "origin and destination must be 3-letter IATA codes.", offers: [], requestId: null, isMock: false } satisfies DuffelFlightsSearchApiResponse,
      { status: 400 }
    );
  }

  if (!ISO_DAY.test(departureDate)) {
    return NextResponse.json(
      { error: "date must be YYYY-MM-DD.", offers: [], requestId: null, isMock: false } satisfies DuffelFlightsSearchApiResponse,
      { status: 400 }
    );
  }

  try {
    const result = await searchDuffelFlights({ origin, destination, departureDate, passengers });
    return NextResponse.json(result satisfies DuffelFlightsSearchApiResponse);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Flight search failed.";
    console.error("[duffel/flights/search]", msg);
    return NextResponse.json(
      { error: msg, offers: [], requestId: null, isMock: false } satisfies DuffelFlightsSearchApiResponse,
      { status: 502 }
    );
  }
}
