"use client";

import Link from "next/link";
import type { TripPlan } from "@/shared/trip-plan";
import type { TripPlanStatus } from "@/shared/trip-status";
import { DynamicTripItinerary } from "@/frontend/components/dynamic-trip-itinerary";

export type TripHostSetupSidebarProps = {
  tripId: string;
  plan: TripPlan;
  tripStatus: TripPlanStatus;
};

export function TripHostSetupSidebar({
  tripId,
  plan,
  tripStatus,
}: TripHostSetupSidebarProps) {
  void tripStatus;

  return (
    <div className="space-y-4">
      <DynamicTripItinerary plan={plan} />
      <div className="rounded-2xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] p-4 shadow-[var(--shadow-ambient-sm)] dark:border-white/10 dark:bg-dm-card dark:shadow-none">
        <p className="text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">
          Want a cleaner full itinerary page with print-ready export?
        </p>
        <Link
          href={`/trip/${tripId}/setup/overview-app`}
          className="mt-3 inline-flex items-center rounded-lg bg-[#1c1c17] px-4 py-2 text-sm font-medium tracking-wide text-[color:var(--surface)] transition hover:bg-[#2a2a26] dark:bg-neutral-200 dark:text-dm-page dark:hover:bg-white"
        >
          Open trip overview
        </Link>
      </div>
    </div>
  );
}
