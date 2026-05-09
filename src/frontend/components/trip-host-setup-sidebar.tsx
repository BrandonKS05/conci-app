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
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
        <p className="text-sm text-slate-600 dark:text-neutral-400">
          Want a cleaner full itinerary page with print-ready export?
        </p>
        <Link
          href={`/trip/${tripId}/setup/overview-app`}
          className="mt-3 inline-flex items-center rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-500"
        >
          Open trip overview
        </Link>
      </div>
    </div>
  );
}
