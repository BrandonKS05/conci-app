import { fetchGooglePlacesExperiences } from "@/backend/trip-live-google-places-experiences";
import type { TripPlan } from "@/shared/trip-plan";
import type { LiveExperienceCard } from "@/shared/trip-live-recommendations";

/** Top experiences: Google Places API (New) Text Search (`GOOGLE_PLACES_API_KEY`). */
export async function fetchLiveExperiencesChained(plan: TripPlan): Promise<{
  items: LiveExperienceCard[];
  error: string | null;
}> {
  return fetchGooglePlacesExperiences(plan);
}
