"use client";

import posthog from "posthog-js";

export type ConciEvent =
  | "landing_start"
  | "trip_prompt_submitted"
  | "trip_created"
  | "invite_shared"
  | "member_joined"
  | "vote_submitted"
  | "hotel_search_started"
  | "booking_task_clicked"
  | "deposit_checkout_started";

export function track(
  event: ConciEvent,
  props?: Record<string, string | number | boolean | null>
) {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  posthog.capture(event, props);
}
