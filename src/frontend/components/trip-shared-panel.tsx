"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import type { TripPlan } from "@/shared/trip-plan";
import type { TripPlanStatus } from "@/shared/trip-status";
import type { CollabStateV1 } from "@/shared/collaboration";
import { TripCollaborationPanel } from "@/frontend/components/trip-collaboration-panel";
import { TripPlanCard } from "@/frontend/components/trip-plan-card";
import { TripPlanShareButton } from "@/frontend/components/trip-plan-share-button";
import { TripSpotlightsInteractive } from "@/frontend/components/trip-spotlights-interactive";
import { TripCardChatWidget } from "@/frontend/components/trip-card-chat-widget";
import { TripDepositTracker } from "@/frontend/components/trip-deposit-tracker";
import { TripContributeButton } from "@/frontend/components/trip-contribute-button";

/** Trip home: share (host); invite code lives inside `TripPlanCard`, then collaboration. */
export function TripSharedPanel({
  tripId,
  plan: planFromServer,
  inviteCode,
  tripStatus,
  isHost,
  shareMessage,
  tripMemberNames = [],
  viewerUserId,
  tripOwnerUserId,
  initialCollab,
}: {
  tripId: string;
  plan: TripPlan;
  inviteCode?: string | null;
  tripStatus: TripPlanStatus;
  isHost: boolean;
  /** Trip creator (`trip_plans.user_id`) — for owner-only UI in collaboration. */
  tripOwnerUserId?: string | null;
  /** Pre-written invite text for “Share Trip” (host clipboard). */
  shareMessage: string;
  /** Other signed-in travelers on this trip (from memberships). */
  tripMemberNames?: string[];
  viewerUserId: string;
  initialCollab: CollabStateV1;
}) {
  const [plan, setPlan] = useState(planFromServer);
  const [collabRefreshSignal, setCollabRefreshSignal] = useState(0);
  const [lgTwoColumn, setLgTwoColumn] = useState(false);
  const [groupProgressStickyMount, setGroupProgressStickyMount] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setLgTwoColumn(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    setPlan(planFromServer);
  }, [planFromServer]);

  const bumpCollab = useCallback(() => {
    setCollabRefreshSignal((n) => n + 1);
  }, []);

  const hasSpotlights = Boolean(plan.spotlights?.length);
  const chatSeed = initialCollab.cardChat?.messages ?? [];

  return (
    <div className="space-y-8">
      {isHost ? (
        <div className="flex justify-end">
          <div className="flex flex-col gap-1 sm:items-end">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-500">
              Share trip
            </span>
            <TripPlanShareButton shareMessage={shareMessage} />
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[70%_30%] lg:items-start">
        <div className="min-w-0 space-y-8">
          <div className="flex flex-wrap items-center gap-3">
            <TripDepositTracker tripId={tripId} />
            <TripContributeButton tripId={tripId} />
          </div>

          <TripPlanCard
            plan={plan}
            badge="Saved"
            showShare={false}
            hideOpenDecisions
            inviteCode={inviteCode ?? null}
            showInviteRow={Boolean(isHost && inviteCode)}
            inviteCodeProminent={Boolean(isHost && inviteCode)}
            guestJoinNames={tripMemberNames}
            hideSpotlightsSection={hasSpotlights}
          />

          {hasSpotlights ? (
            <TripSpotlightsInteractive
              tripId={tripId}
              plan={plan}
              viewerUserId={viewerUserId}
              initialSpotlightVotes={initialCollab.spotlightVotes}
              onPlanUpdated={setPlan}
              onCollabBump={bumpCollab}
            />
          ) : null}

          <TripCollaborationPanel
            tripId={tripId}
            plan={plan}
            tripStatus={tripStatus}
            isHost={isHost}
            collabRefreshSignal={collabRefreshSignal}
            onPlanUpdated={setPlan}
            viewerUserId={viewerUserId}
            tripOwnerUserId={tripOwnerUserId ?? null}
            {...(lgTwoColumn ? { groupProgressStickyTarget: groupProgressStickyMount } : {})}
          />

          <TripCardChatWidget
            tripId={tripId}
            spotlights={plan.spotlights ?? []}
            initialMessages={chatSeed}
            onPlanReplaced={setPlan}
            onCollabBump={bumpCollab}
          />
        </div>
        {lgTwoColumn ? (
          <aside
            ref={(el) => setGroupProgressStickyMount(el)}
            aria-label="Group progress"
            className="min-w-0 self-start lg:sticky lg:top-28 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto"
          />
        ) : null}
      </div>
    </div>
  );
}
