/**
 * Trip workspace tab ids for /trip/[id]/setup — used by the host setup dashboard
 * for explicit tabs and for mapping in-page #sec-* anchors to a tab.
 */
export type TripWorkspaceTabId = "overview" | "budget" | "fund" | "collaborate";

/** Section element ids (without #) → which main-column tab owns that block. */
export const TRIP_WORKSPACE_SECTION_TO_TAB: Record<string, TripWorkspaceTabId> = {
  "sec-fund": "fund",
  "sec-dates": "overview",
  "sec-setup-copilot": "overview",
  "sec-preferences-adjustments": "collaborate",
  "sec-collab-sidebar": "collaborate",
  "sec-budget": "budget",
  "sec-trip-chat": "overview",
  "sec-itinerary": "collaborate",
  "sec-invite": "overview",
  "sec-flights": "overview",
  "trip-live-flights": "overview",
  "trip-card-chat": "overview",
};
