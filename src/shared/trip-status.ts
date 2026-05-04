export type TripPlanStatus = "draft" | "voting" | "finalized";

export function parseTripPlanStatus(raw: unknown): TripPlanStatus {
  if (raw === "finalized" || raw === "voting" || raw === "draft") return raw;
  return "draft";
}
