"use client";

import type { TripPlan } from "@/shared/trip-plan";
import type { TripPlanStatus } from "@/shared/trip-status";
import { DynamicTripItinerary } from "@/frontend/components/dynamic-trip-itinerary";

export type TripHostSetupSidebarProps = {
  plan: TripPlan;
  tripStatus: TripPlanStatus;
};

export function TripHostSetupSidebar({
  plan,
  tripStatus,
}: TripHostSetupSidebarProps) {
  void tripStatus;

  return (
    <div className="space-y-4">
      <DynamicTripItinerary plan={plan} />
    </div>
  );
}
