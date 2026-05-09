import { notFound, redirect } from "next/navigation";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { TripOverviewApp } from "@/frontend/components/trip-overview-app";
import { isUuid } from "@/shared/is-uuid";
import { normalizePlan } from "@/shared/trip-plan";

export default async function TripSetupOverviewAppPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id || !isUuid(id)) notFound();

  const auth = await createAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) redirect(`/auth?next=${encodeURIComponent(`/trip/${id}/setup/overview-app`)}`);

  const svc = getSupabaseServiceRoleClient();
  if (!svc) notFound();

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) notFound();

  const { data, error } = await svc.from("trip_plans").select("plan").eq("id", id).maybeSingle();
  if (error || !data?.plan) notFound();

  const plan = normalizePlan(data.plan);
  return <TripOverviewApp tripId={id} plan={plan} />;
}

