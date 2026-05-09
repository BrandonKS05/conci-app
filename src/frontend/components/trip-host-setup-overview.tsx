"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SiteShell } from "@/frontend/components/site-shell";
import { TripHostSetupSidebar } from "@/frontend/components/trip-host-setup-sidebar";
import type { CollabStateV1 } from "@/shared/collaboration";
import type { TripPlan } from "@/shared/trip-plan";
import type { TripPlanStatus } from "@/shared/trip-status";
import type { HostSetupNavItemId } from "@/shared/trip-host-setup-nav";

type Props = {
  tripId: string;
  initialPlan: TripPlan;
  initialTripStatus: TripPlanStatus;
  inviteCode: string | null;
  shareMessage: string;
  tripMemberNames: string[];
  viewerUserId: string;
  tripOwnerUserId: string | null;
  initialCollab: CollabStateV1;
};

export function TripHostSetupOverview({
  tripId,
  initialPlan,
  initialTripStatus,
  inviteCode,
  shareMessage,
  tripMemberNames,
  viewerUserId,
  tripOwnerUserId,
  initialCollab,
}: Props) {
  const setupRoot = `/trip/${tripId}/setup`;

  const [plan, setPlan] = useState(initialPlan);
  const [effectiveTripStatus, setEffectiveTripStatus] = useState(initialTripStatus);
  const [collabRefreshSignal, setCollabRefreshSignal] = useState(0);
  const bumpCollab = useCallback(() => setCollabRefreshSignal((n) => n + 1), []);

  useEffect(() => setPlan(initialPlan), [initialPlan]);
  useEffect(() => setEffectiveTripStatus(initialTripStatus), [initialTripStatus]);

  const resolveNavHref = useCallback(
    (id: HostSetupNavItemId): string =>
      id === "collab-sidebar" ? "#sec-collab-sidebar" : `${setupRoot}#sec-${id}`,
    [setupRoot]
  );

  return (
    <SiteShell
      title={plan.title?.trim() || "Trip"}
      eyebrow={effectiveTripStatus === "draft" ? "Host setup overview" : "Your trip"}
      tripTypography
    >
      <div className="mx-auto max-w-xl px-4 pb-16 pt-4 sm:px-6 lg:max-w-xl">
        <div className="mb-8 border-b border-slate-200 pb-6 dark:border-white/10">
          <Link
            href={setupRoot}
            className="font-semibold text-teal-700 underline-offset-4 hover:underline dark:text-teal-400"
          >
            ← Back to workspace
          </Link>
          <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-neutral-400">
            Trip card, invites, deposits, spotlight votes, and group decisions stay here so the workspace calendar stays
            uncluttered.
          </p>
        </div>

        <TripHostSetupSidebar
          tripId={tripId}
          plan={plan}
          tripStatus={effectiveTripStatus}
          onPlanUpdated={setPlan}
          inviteCode={inviteCode}
          shareMessage={shareMessage}
          tripMemberNames={tripMemberNames}
          viewerUserId={viewerUserId}
          tripOwnerUserId={tripOwnerUserId}
          initialCollab={initialCollab}
          collabRefreshSignal={collabRefreshSignal}
          bumpCollab={bumpCollab}
          resolveNavHref={resolveNavHref}
        />
      </div>
    </SiteShell>
  );
}
