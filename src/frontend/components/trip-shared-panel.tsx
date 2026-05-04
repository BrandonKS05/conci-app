"use client";

import { useCallback, useEffect, useState } from "react";
import type { TripPlan } from "@/shared/trip-plan";
import type { TripPlanStatus } from "@/shared/trip-status";
import type { CollabStateV1 } from "@/shared/collaboration";
import { TripCollaborationPanel } from "@/frontend/components/trip-collaboration-panel";
import { TripPlanCard } from "@/frontend/components/trip-plan-card";
import { InviteCodeRow } from "@/frontend/components/invite-code-row";
import { TripPlanShareButton } from "@/frontend/components/trip-plan-share-button";
import { TripSpotlightsInteractive } from "@/frontend/components/trip-spotlights-interactive";
import { TripCardChatWidget } from "@/frontend/components/trip-card-chat-widget";

/** Trip home: invite + share (host only), saved plan card, then collaboration. */
export function TripSharedPanel({
  tripId,
  plan: planFromServer,
  inviteCode,
  tripStatus,
  isHost,
  shareMessage,
  tripMemberNames = [],
  viewerUserId,
  initialCollab,
}: {
  tripId: string;
  plan: TripPlan;
  inviteCode?: string | null;
  tripStatus: TripPlanStatus;
  isHost: boolean;
  /** Pre-written invite text for “Share Trip” (host clipboard). */
  shareMessage: string;
  /** Other signed-in travelers on this trip (from memberships). */
  tripMemberNames?: string[];
  viewerUserId: string;
  initialCollab: CollabStateV1;
}) {
  const [plan, setPlan] = useState(planFromServer);
  const [collabRefreshSignal, setCollabRefreshSignal] = useState(0);

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
      {isHost && inviteCode ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          <div className="min-w-0 flex-1">
            <InviteCodeRow rawCode={inviteCode} prominent />
          </div>
          <div className="flex shrink-0 flex-col gap-1 sm:items-end">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-500">
              Share trip
            </span>
            <TripPlanShareButton shareMessage={shareMessage} />
          </div>
        </div>
      ) : isHost ? (
        <div className="flex justify-end">
          <div className="flex flex-col gap-1 sm:items-end">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-500">
              Share trip
            </span>
            <TripPlanShareButton shareMessage={shareMessage} />
          </div>
        </div>
      ) : null}

      <TripPlanCard
        plan={plan}
        badge="Saved"
        showShare={false}
        hideOpenDecisions
        inviteCode={inviteCode ?? null}
        showInviteRow={false}
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
      />

      <TripCardChatWidget
        tripId={tripId}
        spotlights={plan.spotlights ?? []}
        initialMessages={chatSeed}
        onPlanReplaced={setPlan}
        onCollabBump={bumpCollab}
      />
    </div>
  );
}
