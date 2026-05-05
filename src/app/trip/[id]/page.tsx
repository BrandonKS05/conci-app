import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { formatInviteCodeDisplay, normalizeInviteCode } from "@/backend/invite-code";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { fetchTripHostDisplayName } from "@/backend/trip-host-profile";
import { fetchTripMemberDisplayNames } from "@/backend/trip-member-names";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { TripSharedPanel } from "@/frontend/components/trip-shared-panel";
import { SiteShell } from "@/frontend/components/site-shell";
import {
  buildJoinPageUrlWithCode,
  buildTripShareInviteMessage,
  publicSiteHostFromEnv,
  publicSiteOriginFromEnv,
  siteOriginFromRequestHeaders,
} from "@/shared/trip-share-copy";
import { normalizePlan } from "@/shared/trip-plan";
import { parseCollabState } from "@/shared/collaboration";
import { parseTripPlanStatus } from "@/shared/trip-status";
import { isUuid } from "@/shared/is-uuid";

export default async function SavedTripPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id || !isUuid(id)) {
    notFound();
  }

  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/auth?next=${encodeURIComponent(`/trip/${id}`)}`);
  }

  const svc = getSupabaseServiceRoleClient();

  if (!svc) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-16 text-center text-sm text-slate-600 dark:bg-dm-page dark:text-neutral-400">
        <p className="mb-4">
          Trip pages need{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-dm-card dark:text-neutral-200">SUPABASE_SERVICE_ROLE_KEY</code> on the
          server. Add it to{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-dm-card dark:text-neutral-200">.env.local</code> from Supabase → Project
          Settings → API → service_role.
        </p>
        <Link
          href="/trip-parser"
          className="font-medium text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400"
        >
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
    .select("plan, invite_code, user_id, status, collab_state")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[Conci Supabase] Saved trip page query failed:", {
      id,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    notFound();
  }

  if (!data?.plan) {
    notFound();
  }

  const plan = normalizePlan(data.plan);
  const initialCollab = parseCollabState(data.collab_state);
  const tripStatus = parseTripPlanStatus(data.status);
  const isHost = access.isHost;

  if (tripStatus === "draft") {
    if (!isHost) notFound();
    redirect(`/trip/${id}/setup`);
  }

  const inviteRaw = typeof data.invite_code === "string" ? data.invite_code : "";
  let memberNames: string[] = [];
  try {
    memberNames = await fetchTripMemberDisplayNames(svc, id, user.id);
  } catch {
    memberNames = [];
  }

  const ownerId = typeof data.user_id === "string" ? data.user_id : null;
  let shareMessage = "";
  if (isHost) {
    const creatorName = await fetchTripHostDisplayName(svc, ownerId);
    const siteHost = publicSiteHostFromEnv();
    const hdrs = await headers();
    const siteOrigin = siteOriginFromRequestHeaders(hdrs) ?? publicSiteOriginFromEnv();
    const tripTitle = plan.title?.trim() || "Trip";
    const normalizedInvite = inviteRaw ? normalizeInviteCode(inviteRaw) : "";
    const hasInvite = normalizedInvite.length === 6;
    const inviteDisplay = hasInvite ? formatInviteCodeDisplay(inviteRaw) : "";
    shareMessage = hasInvite
      ? buildTripShareInviteMessage({
          creatorName,
          tripTitle,
          inviteCodeDisplay: inviteDisplay,
          siteHost,
          joinPageUrl: buildJoinPageUrlWithCode(siteOrigin, inviteDisplay),
        })
      : `${creatorName} invited you to plan ${tripTitle} 🗓️ Open ${siteOrigin}/join?from=create to enter your invite code, or view this trip while signed in:\n${siteOrigin}/trip/${id}`;
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 dark:bg-dm-page sm:py-12">
      <SiteShell title={plan.title || "Trip plan"} eyebrow="Your trip" tripTypography>
        <div className="mx-auto w-full max-w-6xl space-y-6">
          <TripSharedPanel
            tripId={id}
            plan={plan}
            inviteCode={inviteRaw || null}
            tripStatus={tripStatus}
            isHost={isHost}
            shareMessage={shareMessage}
            tripMemberNames={memberNames}
            viewerUserId={user.id}
            initialCollab={initialCollab}
          />
          <p className="text-center text-xs text-slate-500 dark:text-neutral-500">
            Bookmark this URL to reopen this plan anytime.
          </p>
          <p className="text-center">
            <Link
              href="/trip-parser"
              className="text-sm font-medium text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400"
            >
              Create another plan
            </Link>
          </p>
        </div>
      </SiteShell>
    </div>
  );
}
