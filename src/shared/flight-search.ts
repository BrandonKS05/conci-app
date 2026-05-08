/** Client/server DTOs for host flight search (Google Flights via SerpApi). */

export type AirportSuggestionDto = {
  id: string;
  label: string;
  subtitle?: string;
};

export type FlightLegRowDto = {
  id: string;
  airline: string;
  airlineLogoUrl?: string;
  departureTime: string;
  departureAirport: string;
  arrivalTime: string;
  arrivalAirport: string;
  duration: string;
  stops: number;
  price: string;
  bookUrl: string;
};

export type CabinClass = "economy" | "premium_economy" | "business" | "first";

/** SerpApi `travel_class` for google_flights engine */
export const CABIN_TO_TRAVEL_CLASS: Record<CabinClass, string> = {
  economy: "1",
  premium_economy: "2",
  business: "3",
  first: "4",
};

export const CABIN_OPTIONS: { value: CabinClass; label: string }[] = [
  { value: "economy", label: "Economy" },
  { value: "premium_economy", label: "Premium Economy" },
  { value: "business", label: "Business" },
  { value: "first", label: "First" },
];
