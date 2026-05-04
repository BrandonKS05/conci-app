"use client";

import { useCallback, useEffect, useState } from "react";
import { normalizePlan, type TripPlan } from "@/shared/trip-plan";
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
  const [dateConfirmBusy, setDateConfirmBusy] = useState(false);
  const [dateConfirmError, setDateConfirmError] = useState<string | null>(null);

  useEffect(() => {
    setPlan(planFromServer);
    setDateConfirmError(null);
  }, [planFromServer]);

  const bumpCollab = useCallback(() => {
    setCollabRefreshSignal((n) => n + 1);
  }, []);

  const confirmTripDates = useCallback(async () => {
    if (!isHost || plan.dates.confirmed || plan.dates.options.length === 0) return;
    setDateConfirmBusy(true);
    setDateConfirmError(null);
    try {
      const r = await fetch(`/api/trip-plans/${tripId}/dates/confirm`, {
        method: "POST",
        credentials: "include",
      });
      const j = (await r.json()) as { plan?: unknown; error?: string };
      if (!r.ok) {
        setDateConfirmError(typeof j.error === "string" ? j.error : "Could not confirm dates.");
        return;
      }
      if (j.plan && typeof j.plan === "object") {
        setPlan(normalizePlan(j.plan));
        bumpCollab();
      }
    } catch {
      setDateConfirmError("Network error — try again.");
    } finally {
      setDateConfirmBusy(false);
    }
  }, [isHost, plan.dates.confirmed, plan.dates.options.length, tripId, bumpCollab]);

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

      {isHost && !plan.dates.confirmed && plan.dates.options.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 dark:border-amber-900/40 dark:bg-amber-950/30">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-amber-950 dark:text-amber-100">
              Dates aren&apos;t finalized for the group yet. When you&apos;re happy with what&apos;s on the card, lock
              them in so everyone sees the same plan.
            </p>
            <button
              type="button"
              disabled={dateConfirmBusy}
              onClick={() => void confirmTripDates()}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-950 disabled:opacity-50 dark:bg-amber-600 dark:hover:bg-amber-500"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              {dateConfirmBusy ? "Saving…" : "Confirm date"}
            </button>
          </div>
          {dateConfirmError ? <p className="mt-2 text-sm text-rose-700 dark:text-rose-300">{dateConfirmError}</p> : null}
        </div>
      ) : null}

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
