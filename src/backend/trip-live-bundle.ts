import { fetchLiveRestaurantsForPlan } from "@/backend/trip-live-restaurants";
import { fetchLiveExperiencesChained } from "@/backend/trip-live-experiences-chain";
import { fetchSerpGoogleFlights } from "@/backend/trip-live-flights";
import { fetchDriveSummary } from "@/backend/trip-live-drive";
import type { TripPlan } from "@/shared/trip-plan";
import type { TripLiveRecommendationsPayload } from "@/shared/trip-live-recommendations";

export async function buildTripLiveRecommendations(plan: TripPlan): Promise<TripLiveRecommendationsPayload> {
  const hints = plan.polls?.venues?.filter(Boolean).slice(0, 3) ?? [];
  const hasDestination = Boolean(plan.location?.trim());

  const [rest, via, fly] = await Promise.all([
    hasDestination ? fetchLiveRestaurantsForPlan(plan, hints) : Promise.resolve({ picks: [], error: null as string | null }),
    fetchLiveExperiencesChained(plan),
    plan.departureCity?.trim() && plan.location?.trim()
      ? fetchSerpGoogleFlights(plan)
      : Promise.resolve({ flights: [], bookBaseUrl: null, error: null as string | null }),
  ]);

  let drive = null as TripLiveRecommendationsPayload["drive"];
  let driveError: string | null = null;
  if (plan.departureCity?.trim() && plan.location?.trim()) {
    const d = await fetchDriveSummary(plan.departureCity, plan.location);
    drive = d.summary;
    driveError = d.error;
  }

  return {
    cached: false,
    restaurants: rest.picks,
    restaurantsError: rest.error,
    experiences: via.items,
    experiencesError: via.error,
    flights: fly.flights,
    flightsError: fly.error,
    drive,
    driveError,
  };
}
