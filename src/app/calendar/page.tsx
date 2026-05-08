"use client";

import { SiteShell } from "@/frontend/components/site-shell";
import { TripCalendarDemoPage } from "@/frontend/components/trip-calendar-demo";

export default function CalendarPage() {
  return (
    <SiteShell
      title="Trip calendar"
      eyebrow="Planning surface · Cancun getaway demo"
      contentWide
      tripTypography
    >
      <p className="mb-8 text-center text-xs font-medium uppercase tracking-[0.25em] text-teal-600/90 dark:text-teal-400/90">
        Demo · Highlighted dates open a zoomed itinerary; sidebar stays actionable
      </p>
      <TripCalendarDemoPage />
    </SiteShell>
  );
}
