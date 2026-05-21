import { notFound, redirect } from "next/navigation";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { normalizePlan } from "@/shared/trip-plan";
import { isUuid } from "@/shared/is-uuid";
import { TripItineraryView } from "@/frontend/components/trip-itinerary-view";

export default async function TripItineraryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id || !isUuid(id)) notFound();

  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/auth?next=${encodeURIComponent(`/trip/${id}/itinerary`)}`);
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) notFound();

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) notFound();

  const { data, error } = await svc
    .from("trip_plans")
    .select("plan")
    .eq("id", id)
    .maybeSingle();

  if (error || !data?.plan) notFound();

  const plan = normalizePlan(data.plan);

  if (!plan.generatedItinerary?.days?.length) {
    redirect(`/trip/${id}/setup`);
  }

  return <TripItineraryView tripId={id} plan={plan} />;
}
