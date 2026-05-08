import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { resolveDestinationAirportId, searchFlightsOneWayLeg, tripPlannerAdults } from "@/backend/trip-flight-search";
import { CABIN_TO_TRAVEL_CLASS, type CabinClass } from "@/shared/flight-search";
import { hostHasConcreteTripRange, normalizePlan } from "@/shared/trip-plan";
import { isUuid } from "@/shared/is-uuid";

const CABINS = new Set<CabinClass>(["economy", "premium_economy", "business", "first"]);

function isSerpAirportId(s: string): boolean {
  return /^[A-Za-z0-9._-]{2,64}$/.test(s);
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid trip id." }, { status: 400 });
  }

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

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access?.isHost) {
    return NextResponse.json({ error: "Only the trip host can search flights." }, { status: 403 });
  }

  let body: { leg?: string; originAirportId?: string; cabinClass?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const legRaw = typeof body.leg === "string" ? body.leg.trim().toLowerCase() : "";
  const originAirportId = typeof body.originAirportId === "string" ? body.originAirportId.trim() : "";
  if (!(legRaw === "outbound" || legRaw === "return")) {
    return NextResponse.json({ error: "Expected leg: outbound | return" }, { status: 400 });
  }
  if (!isSerpAirportId(originAirportId)) {
    return NextResponse.json({ error: "Invalid origin airport id." }, { status: 400 });
  }

  const cabinToken = typeof body.cabinClass === "string" ? body.cabinClass.trim() : "economy";
  const cabinNorm: CabinClass = CABINS.has(cabinToken as CabinClass) ? (cabinToken as CabinClass) : "economy";

  const { data, error } = await svc.from("trip_plans").select("plan").eq("id", id).maybeSingle();
  if (error || !data?.plan) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const plan = normalizePlan(data.plan);
  const loc = plan.location?.trim();
  const tr = plan.hostSetup?.tripRange;

  if (!loc || !hostHasConcreteTripRange(plan) || !tr?.startIso || !tr.endIso) {
    return NextResponse.json({ error: "Trip needs a destination and confirmed date range." }, { status: 400 });
  }

  const destId = await resolveDestinationAirportId(loc);
  if (!destId) {
    return NextResponse.json({ error: "Could not resolve destination airport for this trip." }, { status: 400 });
  }

  const adults = tripPlannerAdults(plan);
  const travelClass = CABIN_TO_TRAVEL_CLASS[cabinNorm];

  if (legRaw === "outbound") {
    const out = await searchFlightsOneWayLeg({
      departureAirportId: originAirportId,
      arrivalAirportId: destId,
      dateIso: tr.startIso,
      travelClass,
      adults,
    });
    return NextResponse.json({
      leg: "outbound" as const,
      flights: out.flights,
      error: out.error ?? null,
      destinationAirportId: destId,
    });
  }

  const ret = await searchFlightsOneWayLeg({
    departureAirportId: destId,
    arrivalAirportId: originAirportId,
    dateIso: tr.endIso,
    travelClass,
    adults,
  });
  return NextResponse.json({
    leg: "return" as const,
    flights: ret.flights,
    error: ret.error ?? null,
    destinationAirportId: destId,
  });
}
