import { notFound, redirect } from "next/navigation";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { resolveDestinationAirportId, searchFlightsOneWayLeg, tripPlannerAdults } from "@/backend/trip-flight-search";
import { TripHostFlightsPage } from "@/frontend/components/trip-host-flights-page";
import { CABIN_TO_TRAVEL_CLASS, type CabinClass } from "@/shared/flight-search";
import { hostHasConcreteTripRange, normalizePlan } from "@/shared/trip-plan";
import { parseTripPlanStatus } from "@/shared/trip-status";
import { isUuid } from "@/shared/is-uuid";

const CABINS = new Set<CabinClass>(["economy", "premium_economy", "business", "first"]);

function asSingle(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function TripHostFlightsSetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!id || !isUuid(id)) notFound();

  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/auth?next=${encodeURIComponent(`/trip/${id}/setup/flights`)}`);
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) notFound();
  const access = await resolveTripAccess(svc, id, user.id);
  if (!access?.isHost) notFound();

  const { data, error } = await svc.from("trip_plans").select("plan, status").eq("id", id).maybeSingle();
  if (error || !data?.plan) notFound();
  if (parseTripPlanStatus(data.status) === "finalized") notFound();

  const q = await searchParams;
  const originId = asSingle(q.originId).trim();
  const originLabel = asSingle(q.originLabel).trim();
  const legRaw = asSingle(q.leg).trim().toLowerCase();
  const cabinRaw = asSingle(q.cabinClass).trim();
  const leg = legRaw === "return" ? "return" : "outbound";
  const cabinClass = (CABINS.has(cabinRaw as CabinClass) ? cabinRaw : "economy") as CabinClass;

  if (!originId || !originLabel) {
    redirect(`/trip/${id}/setup`);
  }

  const plan = normalizePlan(data.plan);
  const tripRange = plan.hostSetup?.tripRange;
  const location = plan.location?.trim();
  const destinationAirportId = await resolveDestinationAirportId(location ?? "");

  if (!location || !hostHasConcreteTripRange(plan) || !tripRange?.startIso || !tripRange.endIso || !destinationAirportId) {
    redirect(`/trip/${id}/setup`);
  }

  const search = await searchFlightsOneWayLeg({
    departureAirportId: leg === "outbound" ? originId : destinationAirportId,
    arrivalAirportId: leg === "outbound" ? destinationAirportId : originId,
    dateIso: leg === "outbound" ? tripRange.startIso : tripRange.endIso,
    travelClass: CABIN_TO_TRAVEL_CLASS[cabinClass],
    adults: tripPlannerAdults(plan),
  });

  const outboundSummary =
    leg === "return" && asSingle(q.outAirline)
      ? {
          airline: asSingle(q.outAirline),
          departureTime: asSingle(q.outDeparture),
          arrivalTime: asSingle(q.outArrival),
          duration: asSingle(q.outDuration),
          price: asSingle(q.outPrice),
          bookUrl: asSingle(q.outBookUrl),
        }
      : null;

  return (
    <TripHostFlightsPage
      tripId={id}
      leg={leg}
      originId={originId}
      originLabel={originLabel}
      cabinClass={cabinClass}
      destinationLabel={location}
      startIso={tripRange.startIso}
      endIso={tripRange.endIso}
      flights={search.flights}
      error={search.error ?? null}
      outboundSummary={outboundSummary}
    />
  );
}

