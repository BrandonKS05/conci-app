import { fetchAmadeusActivitiesRapid } from "@/backend/trip-live-amadeus-activities";
import { fetchMusementOrActivitiesRapid } from "@/backend/trip-live-musement-activities";
import { fetchTripadvisorExperiences } from "@/backend/trip-live-tripadvisor-experiences";
import type { TripPlan } from "@/shared/trip-plan";
import type { LiveExperienceCard } from "@/shared/trip-live-recommendations";

/**
 * Experiences: Amadeus Tours & Activities (RapidAPI) first, then optional Musement / generic activities API,
 * then Tripadvisor COM defaults — all with the same RAPIDAPI_KEY where applicable.
 */
export async function fetchLiveExperiencesChained(plan: TripPlan): Promise<{
  items: LiveExperienceCard[];
  error: string | null;
}> {
  const amadeus = await fetchAmadeusActivitiesRapid(plan);
  if (amadeus.items.length) {
    return { items: amadeus.items, error: null };
  }

  const musement = await fetchMusementOrActivitiesRapid(plan);
  if (musement.items.length) {
    return { items: musement.items, error: null };
  }

  const trip = await fetchTripadvisorExperiences(plan);
  if (trip.items.length) {
    return { items: trip.items, error: null };
  }

  const parts = [amadeus.error, musement.error, trip.error].filter(
    (x): x is string => typeof x === "string" && x.length > 0
  );
  const dedup = [...new Set(parts)];
  return {
    items: [],
    error: dedup.length
      ? dedup.join(" · ")
      : "No experiences returned. Set RAPIDAPI_AMADEUS_HOST for Amadeus, or RAPIDAPI_MUSEMENT_HOST / RAPIDAPI_ACTIVITIES_HOST, or use Tripadvisor defaults.",
  };
}
