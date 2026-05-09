"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HOST_SETUP_NAV_ITEMS, type HostSetupNavItemId } from "@/shared/trip-host-setup-nav";
import type { TripPlan } from "@/shared/trip-plan";
import type { TripPlanStatus } from "@/shared/trip-status";
import { VIBE_POLL_DECISION_KEY, type CollabStateV1 } from "@/shared/collaboration";
import { TripCollaborationPanel } from "@/frontend/components/trip-collaboration-panel";
import { TripPlanShareButton } from "@/frontend/components/trip-plan-share-button";
import { TripPlanCard } from "@/frontend/components/trip-plan-card";
import { TripSpotlightsInteractive } from "@/frontend/components/trip-spotlights-interactive";

export type TripHostSetupSidebarProps = {
  tripId: string;
  plan: TripPlan;
  tripStatus: TripPlanStatus;
  onPlanUpdated: (next: TripPlan) => void;
  inviteCode: string | null;
  shareMessage: string;
  tripMemberNames: string[];
  viewerUserId: string;
  tripOwnerUserId: string | null;
  initialCollab: CollabStateV1;
  collabRefreshSignal: number;
  bumpCollab: () => void;
  resolveNavHref: (id: HostSetupNavItemId) => string;
};

export function TripHostSetupSidebar({
  tripId,
  plan,
  tripStatus,
  onPlanUpdated,
  inviteCode,
  shareMessage,
  tripMemberNames,
  viewerUserId,
  tripOwnerUserId,
  initialCollab,
  collabRefreshSignal,
  bumpCollab,
  resolveNavHref,
}: TripHostSetupSidebarProps) {
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const hasSpotlights = Boolean(plan.spotlights?.length);

  useEffect(() => {
    const loc = plan.location?.trim() || plan.title?.trim();
    if (!loc) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/places/destination-cover?q=${encodeURIComponent(loc)}`);
      const j = (await res.json().catch(() => ({}))) as { photoUrl?: string | null };
      if (!cancelled && j.photoUrl?.startsWith("http")) setHeroUrl(j.photoUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [plan.location, plan.title]);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
        <div
          className="aspect-[16/11] bg-slate-200 bg-cover bg-center dark:bg-neutral-800"
          style={heroUrl ? { backgroundImage: `url(${heroUrl})` } : undefined}
        />
        <p className="border-t border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 dark:border-white/10 dark:text-neutral-400">
          {plan.location?.trim() || plan.title?.trim() || "Destination"}
        </p>
      </div>

      <nav className="space-y-1 text-sm">
        {HOST_SETUP_NAV_ITEMS.map((item) => (
          <a
            key={item.id}
            href={resolveNavHref(item.id)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-neutral-100"
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-500 dark:bg-zinc-400" />
            {item.label}
          </a>
        ))}
        <Link
          href={`/trip/${tripId}/setup/packing`}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-neutral-100"
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-500 dark:bg-zinc-400" />
          Packing list
        </Link>
      </nav>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-500">
          Share trip
        </span>
        <TripPlanShareButton shareMessage={shareMessage} />
      </div>

      <TripPlanCard
        plan={plan}
        badge={tripStatus === "draft" ? "Draft" : "Saved"}
        showShare={false}
        hideOpenDecisions
        inviteCode={inviteCode}
        showInviteRow={Boolean(inviteCode)}
        inviteCodeProminent={Boolean(inviteCode)}
        guestJoinNames={tripMemberNames}
        hideSpotlightsSection={hasSpotlights}
      />

      {hasSpotlights ? (
        <TripSpotlightsInteractive
          tripId={tripId}
          plan={plan}
          viewerUserId={viewerUserId}
          initialSpotlightVotes={initialCollab.spotlightVotes}
          onPlanUpdated={onPlanUpdated}
          onCollabBump={bumpCollab}
          collabRefreshSignal={collabRefreshSignal}
          isHost
        />
      ) : null}

      <div id="sec-collab-sidebar" className="scroll-mt-28">
        <TripCollaborationPanel
          tripId={tripId}
          plan={plan}
          tripStatus={tripStatus}
          isHost
          collabRefreshSignal={collabRefreshSignal}
          onPlanUpdated={onPlanUpdated}
          viewerUserId={viewerUserId}
          tripOwnerUserId={tripOwnerUserId}
          omitDecisionKeys={[VIBE_POLL_DECISION_KEY]}
        />
      </div>
    </div>
  );
}
