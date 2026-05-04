import type { TripPlan } from "@/shared/trip-plan";

function isUsablePhotoUrl(u: unknown): u is string {
  if (typeof u !== "string") return false;
  const t = u.trim();
  if (!t) return false;
  if (t.startsWith("/api/")) return true;
  return /^https?:\/\//i.test(t);
}

/** First saved place photo on the plan (spotlights / draft hotel), when available. */
export function tripDestinationCoverFromPlan(plan: TripPlan): string | null {
  for (const s of plan.spotlights ?? []) {
    if (isUsablePhotoUrl(s.photoUrl)) return s.photoUrl.trim();
  }
  const hotel = plan.hostSetup?.hotel;
  if (hotel && isUsablePhotoUrl(hotel.photoUrl)) return hotel.photoUrl.trim();
  for (const stay of plan.hostSetup?.hotelStays ?? []) {
    if (stay.place && isUsablePhotoUrl(stay.place.photoUrl)) return stay.place.photoUrl.trim();
  }
  return null;
}
