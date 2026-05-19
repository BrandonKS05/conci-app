import { notFound, redirect } from "next/navigation";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { TripHostLodgingPage } from "@/frontend/components/trip-host-lodging-page";
import { hostHasConcreteTripRange, normalizePlan, parseHostLodgingType, type HostLodgingType } from "@/shared/trip-plan";
import { parseTripPlanStatus } from "@/shared/trip-status";
import { isUuid } from "@/shared/is-uuid";

function asSingle(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function TripHostLodgingSetupPage({
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
    redirect(`/auth?next=${encodeURIComponent(`/trip/${id}/setup/lodging`)}`);
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) notFound();
  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) notFound();

  const { data, error } = await svc.from("trip_plans").select("plan, status").eq("id", id).maybeSingle();
  if (error || !data?.plan) notFound();
  if (parseTripPlanStatus(data.status) === "finalized") notFound();

  const plan = normalizePlan(data.plan);
  const tripRange = plan.hostSetup?.tripRange;
  if (!hostHasConcreteTripRange(plan) || !tripRange?.startIso || !tripRange?.endIso) {
    redirect(`/trip/${id}/setup`);
  }

  const q = await searchParams;
  const lodgingRaw = asSingle(q.lodgingType).trim().toLowerCase();
  const lodgingType: HostLodgingType = parseHostLodgingType(lodgingRaw) ?? "hotel";
  const primaryCity = plan.location?.split(",")[0]?.trim() || plan.title?.trim() || "Trip";

  return (
    <TripHostLodgingPage
      tripId={id}
      initialPlan={plan}
      isHost={access.isHost}
      tripRange={{ startIso: tripRange.startIso, endIso: tripRange.endIso }}
      initialDestination={asSingle(q.destination).trim() || primaryCity}
      initialCheckIn={asSingle(q.checkIn).trim() || tripRange.startIso}
      initialCheckOut={asSingle(q.checkOut).trim() || tripRange.endIso}
      initialGuests={Math.max(1, Number(asSingle(q.guests)) || plan.people.count || 2)}
      initialRooms={Math.max(1, Number(asSingle(q.rooms)) || 1)}
      initialLodgingType={lodgingType}
      initialSegmentId={asSingle(q.segment).trim() || undefined}
    />
  );
}
