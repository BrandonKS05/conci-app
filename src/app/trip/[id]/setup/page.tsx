import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { fetchWikipediaThumbnailForQuery } from "@/backend/wikipedia-place-image";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { TripHostSetupDashboard } from "@/frontend/components/trip-host-setup-dashboard";
import { parseCollabState } from "@/shared/collaboration";
import { normalizePlan } from "@/shared/trip-plan";
import { tripDestinationCoverFromPlan } from "@/shared/trip-destination-cover";
import { parseTripPlanStatus } from "@/shared/trip-status";
import { isUuid } from "@/shared/is-uuid";

export default async function TripHostSetupPage({
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
    redirect(`/auth?next=${encodeURIComponent(`/trip/${id}/setup`)}`);
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-16 text-center text-sm text-[color:var(--on-surface-variant)] dark:bg-dm-page dark:text-neutral-400">
        <p className="mb-4">
          Trip setup needs{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-dm-card dark:text-neutral-200">SUPABASE_SERVICE_ROLE_KEY</code> on the server.
        </p>
        <Link href="/trip-parser" className="font-medium text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400">
          Back to trip parser
        </Link>
      </div>
    );
  }

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    notFound();
  }

  const { data, error } = await svc
    .from("trip_plans")
    .select("plan, status, seed_text, collab_state, user_id, invite_code")
    .eq("id", id)
    .maybeSingle();

  if (error || !data?.plan) {
    notFound();
  }

  const plan = normalizePlan(data.plan);
  const initialTripStatus = parseTripPlanStatus(data.status);
  const initialCollab = parseCollabState(data.collab_state);
  const ownerId = typeof data.user_id === "string" ? data.user_id : null;

  const seedText = typeof data.seed_text === "string" ? data.seed_text : null;
  const inviteRaw = typeof data.invite_code === "string" ? data.invite_code : "";

  let destinationCoverUrl: string | null = tripDestinationCoverFromPlan(plan);
  if (!destinationCoverUrl && plan.location?.trim()) {
    const token = plan.location.split(",")[0]?.trim() ?? plan.location.trim();
    if (token.length >= 2 && !/^tbd$/i.test(token)) {
      destinationCoverUrl = await fetchWikipediaThumbnailForQuery(token);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 py-6 text-[color:var(--on-surface)] dark:bg-dm-page dark:text-neutral-100 sm:py-8">
      <TripHostSetupDashboard
        tripId={id}
        initialPlan={plan}
        seedText={seedText}
        initialTripStatus={initialTripStatus}
        initialCollab={initialCollab}
        viewerUserId={user.id}
        tripOwnerUserId={ownerId}
        inviteCode={inviteRaw || null}
        isHost={access.isHost}
        destinationCoverUrl={destinationCoverUrl}
      />
    </div>
  );
}
