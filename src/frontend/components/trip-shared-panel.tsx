"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TripPlan } from "@/shared/trip-plan";
import { normalizePlan } from "@/shared/trip-plan";
import type { TripPlanStatus } from "@/shared/trip-status";
import type { CollabStateV1 } from "@/shared/collaboration";
import { useTripWorkspaceRealtime } from "@/frontend/hooks/use-trip-workspace-realtime";
import { TripCollaborationPanel } from "@/frontend/components/trip-collaboration-panel";
import { InviteCodeRow } from "@/frontend/components/invite-code-row";
import { DynamicTripItinerary } from "@/frontend/components/dynamic-trip-itinerary";
import { TripPlanShareButton } from "@/frontend/components/trip-plan-share-button";
import { TripSpotlightsInteractive } from "@/frontend/components/trip-spotlights-interactive";
import { TripCardChatWidget } from "@/frontend/components/trip-card-chat-widget";
import { TripDepositTracker } from "@/frontend/components/trip-deposit-tracker";
import { TripContributeButton } from "@/frontend/components/trip-contribute-button";
import { GeneratedItineraryView } from "@/frontend/components/generated-itinerary-view";

/** Trip home: live itinerary + collaboration; host sees share controls and invite. */
export function TripSharedPanel({
  tripId,
  plan: planFromServer,
  inviteCode,
  tripStatus,
  isHost,
  shareMessage,
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
  viewerUserId: string;
  initialCollab: CollabStateV1;
}) {
  const [plan, setPlan] = useState(planFromServer);
  const [collabRefreshSignal, setCollabRefreshSignal] = useState(0);
  const [lgTwoColumn, setLgTwoColumn] = useState(false);
  const [groupProgressStickyMount, setGroupProgressStickyMount] = useState<HTMLElement | null>(null);
  const suppressRealtimeUntilRef = useRef(0);

  const bumpCollab = useCallback(() => {
    setCollabRefreshSignal((n) => n + 1);
  }, []);

  useTripWorkspaceRealtime(
    tripId,
    useCallback(
      (row) => {
        if (row.plan != null) {
          try {
            setPlan(normalizePlan(row.plan));
          } catch {
            /* ignore */
          }
        }
        bumpCollab();
      },
      [bumpCollab]
    ),
    { enabled: true, suppressRealtimeUntilRef }
  );

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

          {isHost && inviteCode ? (
            <div className="pt-1">
              <InviteCodeRow rawCode={inviteCode} prominent />
            </div>
          ) : null}

          <DynamicTripItinerary plan={plan} />

          {hasSpotlights ? (
            <TripSpotlightsInteractive
              tripId={tripId}
              plan={plan}
              viewerUserId={viewerUserId}
              initialSpotlightVotes={initialCollab.spotlightVotes}
              onPlanUpdated={setPlan}
              onCollabBump={bumpCollab}
              collabRefreshSignal={collabRefreshSignal}
              isHost={isHost}
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

          {plan.generatedItinerary ? (
            <GeneratedItineraryView
              tripId={tripId}
              initialItinerary={plan.generatedItinerary}
              headcount={plan.people.count ?? (plan.people.names.length || 2)}
            />
          ) : null}
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
