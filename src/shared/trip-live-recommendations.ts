import type { RestaurantPick } from "@/shared/restaurants";

export type LiveExperienceCard = {
  name: string;
  pricePerPerson: string;
  rating: string;
  duration: string;
  bookingUrl: string;
  coverPhotoUrl?: string | null;
};

export type LiveFlightCard = {
  airline: string;
  pricePerPerson: string;
  departureTime: string;
  duration: string;
  bookOnGoogleFlightsUrl: string;
  /** Whether this row is bookable in-app (Duffel) or discovery-only inspiration (SerpAPI). */
  bookingStatus?: "inspiration" | "bookable";
};

export type LiveDriveSummary = {
  mapsDirectionsUrl: string;
  /** Human-readable when OSRM succeeds, else null */
  durationEstimate: string | null;
  distanceMiles: number | null;
};

export type TripLiveRecommendationsPayload = {
  cached: boolean;
  restaurants: RestaurantPick[];
  /** Non-fatal fetch issues */
  restaurantsError: string | null;
  experiences: LiveExperienceCard[];
  experiencesError: string | null;
  flights: LiveFlightCard[];
  flightsError: string | null;
  /** Present when departure + destination available */
  drive: LiveDriveSummary | null;
  driveError: string | null;
};
