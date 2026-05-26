/**
 * Duffel Flights API types — safe for both server and client imports.
 * https://duffel.com/docs/api/v2/offers
 */

export type DuffelCarrier = {
  iata_code: string;
  name: string;
  logo_symbol_url: string | null;
};

export type DuffelAirport = {
  iata_code: string;
  name: string;
  city_name: string | null;
  city: { name: string } | null;
  time_zone: string | null;
};

export type DuffelSegment = {
  id: string;
  origin: DuffelAirport;
  destination: DuffelAirport;
  departing_at: string; // ISO datetime
  arriving_at: string;
  duration: string; // ISO 8601 duration e.g. "PT2H30M"
  marketing_carrier: DuffelCarrier;
  marketing_carrier_flight_number: string;
  operating_carrier: DuffelCarrier;
  aircraft: { iata_code: string; name: string | null } | null;
  passengers: Array<{ passenger_id: string; cabin_class: string }>;
};

export type DuffelSlice = {
  id: string;
  origin: DuffelAirport;
  destination: DuffelAirport;
  duration: string;
  segments: DuffelSegment[];
};

export type DuffelPassengerInOffer = {
  id: string;
  type: "adult" | "child" | "infant_without_seat";
  age: number | null;
};

export type DuffelOffer = {
  id: string;
  total_amount: string;
  total_currency: string;
  base_amount: string | null;
  tax_amount: string | null;
  expires_at: string;
  slices: DuffelSlice[];
  passengers: DuffelPassengerInOffer[];
};

export type DuffelFlightPassenger = {
  id: string; // must match DuffelPassengerInOffer.id
  title: "mr" | "ms" | "mrs" | "dr";
  gender: "m" | "f";
  given_name: string;
  family_name: string;
  born_on: string; // YYYY-MM-DD
  email: string;
  phone_number: string; // E.164 format e.g. +14155550123
};

export type DuffelFlightBookingRecord = {
  provider: "duffel";
  orderId: string;
  bookingReference: string;
  status: "confirmed" | "pending" | "cancelled";
  totalAmount: string;
  currency: string;
  origin: string; // IATA
  destination: string; // IATA
  departingAt: string;
  arrivingAt: string;
  airlineName: string;
  flightNumber: string;
  bookedAt: string;
  isMock?: boolean;
};

// ─── API response shapes (Conci API) ─────────────────────────────────────────

export type DuffelFlightsSearchApiResponse = {
  offers: DuffelOffer[];
  requestId: string | null;
  isMock: boolean;
  error?: string;
};

export type DuffelFlightsBookApiResponse = {
  booking: DuffelFlightBookingRecord | null;
  error?: string;
};
