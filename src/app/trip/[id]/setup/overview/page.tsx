import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { formatInviteCodeDisplay, normalizeInviteCode } from "@/backend/invite-code";
import { fetchTripHostDisplayName } from "@/backend/trip-host-profile";
import { fetchTripMemberDisplayNames } from "@/backend/trip-member-names";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { TripHostSetupOverview } from "@/frontend/components/trip-host-setup-overview";
import {
  buildJoinPageUrlWithCode,
  buildTripShareInviteMessage,
  publicSiteHostFromEnv,
  publicSiteOriginFromEnv,
  siteOriginFromRequestHeaders,
} from "@/shared/trip-share-copy";
import { parseCollabState } from "@/shared/collaboration";
import { normalizePlan } from "@/shared/trip-plan";
import { parseTripPlanStatus } from "@/shared/trip-status";
import { isUuid } from "@/shared/is-uuid";
import { headers } from "next/headers";

export default async function TripHostSetupOverviewPage({
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
    redirect(`/auth?next=${encodeURIComponent(`/trip/${id}/setup/overview`)}`);
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-16 text-center text-sm text-slate-600 dark:bg-dm-page dark:text-neutral-400">
        <p className="mb-4">
          Trip overview needs{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-dm-card dark:text-neutral-200">
            SUPABASE_SERVICE_ROLE_KEY
          </code>{" "}
          on the server.
        </p>
        <Link href="/trip-parser" className="font-medium text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400">
          Back to trip parser
        </Link>
      </div>
    );
  }

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access?.isHost) {
    notFound();
  }

  const { data, error } = await svc
    .from("trip_plans")
    .select("plan, status, invite_code, collab_state, user_id")
    .eq("id", id)
    .maybeSingle();

  if (error || !data?.plan) {
    notFound();
  }

  const plan = normalizePlan(data.plan);
  const initialTripStatus = parseTripPlanStatus(data.status);
  const inviteRaw = typeof data.invite_code === "string" ? data.invite_code : "";
  const initialCollab = parseCollabState(data.collab_state);
  const ownerId = typeof data.user_id === "string" ? data.user_id : null;

  let memberNames: string[] = [];
  try {
    memberNames = await fetchTripMemberDisplayNames(svc, id, user.id);
  } catch {
    memberNames = [];
  }

  const creatorName = await fetchTripHostDisplayName(svc, ownerId);
  const siteHost = publicSiteHostFromEnv();
  const hdrs = await headers();
  const siteOrigin = siteOriginFromRequestHeaders(hdrs) ?? publicSiteOriginFromEnv();
  const tripTitle = plan.title?.trim() || "Trip";
  const normalizedInvite = inviteRaw ? normalizeInviteCode(inviteRaw) : "";
  const hasInvite = normalizedInvite.length === 6;
  const inviteDisplay = hasInvite ? formatInviteCodeDisplay(inviteRaw) : "";
  const shareMessage = hasInvite
    ? buildTripShareInviteMessage({
        creatorName,
        tripTitle,
        inviteCodeDisplay: inviteDisplay,
        siteHost,
        joinPageUrl: buildJoinPageUrlWithCode(siteOrigin, inviteDisplay),
      })
    : `${creatorName} invited you to plan ${tripTitle} 🗓️ Open ${siteOrigin}/join?from=create to enter your invite code, or view this trip while signed in:\n${siteOrigin}/trip/${id}`;

  return (
    <div className="min-h-screen bg-slate-50 py-6 text-slate-900 dark:bg-dm-page dark:text-neutral-100 sm:py-8">
      <TripHostSetupOverview
        tripId={id}
        initialPlan={plan}
        initialTripStatus={initialTripStatus}
        inviteCode={inviteRaw || null}
        shareMessage={shareMessage}
        tripMemberNames={memberNames}
        viewerUserId={user.id}
        tripOwnerUserId={ownerId}
        initialCollab={initialCollab}
      />
    </div>
  );
}
