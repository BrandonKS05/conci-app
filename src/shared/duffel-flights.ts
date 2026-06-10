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
  /** True for local-mock bookings AND real Duffel test-mode orders (test token / live_mode=false). */
  isMock?: boolean;
  /**
   * Every leg of the order (outbound first, return second on round trips).
   * Absent on records persisted before round-trip support — fall back to the
   * flat origin/destination fields above, which describe the first segment only.
   */
  slices?: SelectedFlightSlice[];
};

// ─── Selected (saved, not yet booked) flight ─────────────────────────────────

/** One leg of a saved selection — outbound, plus a return leg for round trips. */
export type SelectedFlightSlice = {
  origin: string; // IATA
  destination: string; // IATA
  departingAt: string; // ISO datetime
  arrivingAt: string; // ISO datetime
  airlineName: string;
  flightNumber: string;
  /** Number of connection stops (segments - 1). */
  stops: number;
};

/**
 * A specific flight the host saved from search results WITHOUT booking it. It
 * replaces the generic AI flight recommendation in trip views and supplies the
 * arrival/departure times used for travel-day blocking. `status: "selected"`
 * keeps it distinct from a confirmed {@link DuffelFlightBookingRecord}.
 */
export type DuffelSelectedFlightRecord = {
  provider: "duffel";
  status: "selected";
  /** Duffel offer id — re-fetched/refreshed before any real order. May expire. */
  offerId: string;
  totalAmount: string;
  currency: string;
  /** [outbound] for one-way, [outbound, return] for round trips. */
  slices: SelectedFlightSlice[];
  passengerCount: number;
  /** Saved from a test-mode / local-mock search (no live Duffel token). */
  isMock?: boolean;
  selectedAt: string;
};

function sliceFromDuffel(slice: DuffelSlice): SelectedFlightSlice {
  const first = slice.segments[0];
  const last = slice.segments[slice.segments.length - 1];
  return {
    origin: first?.origin.iata_code ?? slice.origin.iata_code,
    destination: last?.destination.iata_code ?? slice.destination.iata_code,
    departingAt: first?.departing_at ?? "",
    arrivingAt: last?.arriving_at ?? "",
    airlineName: first?.marketing_carrier.name ?? "",
    flightNumber: first
      ? `${first.marketing_carrier.iata_code}${first.marketing_carrier_flight_number}`
      : "",
    stops: Math.max(0, slice.segments.length - 1),
  };
}

/** All legs of an offer as flat slices (outbound first; return second on round trips). */
export function flightSlicesFromOffer(offer: DuffelOffer): SelectedFlightSlice[] {
  return offer.slices.map(sliceFromDuffel);
}

/** Build a saveable selection from a Duffel offer (server-side, validated input). */
export function selectedFlightFromOffer(
  offer: DuffelOffer,
  opts: { passengerCount: number; isMock?: boolean }
): DuffelSelectedFlightRecord {
  return {
    provider: "duffel",
    status: "selected",
    offerId: offer.id,
    totalAmount: offer.total_amount,
    currency: offer.total_currency,
    slices: offer.slices.map(sliceFromDuffel),
    passengerCount: Math.max(1, opts.passengerCount),
    ...(opts.isMock ? { isMock: true as const } : {}),
    selectedAt: new Date().toISOString(),
  };
}

// ─── API response shapes (Conci API) ─────────────────────────────────────────

export type DuffelFlightsSearchApiResponse = {
  offers: DuffelOffer[];
  requestId: string | null;
  isMock: boolean;
  error?: string;
};

export type DuffelFlightSelectApiResponse = {
  selection: DuffelSelectedFlightRecord | null;
  error?: string;
};

export type DuffelFlightsBookApiResponse = {
  booking: DuffelFlightBookingRecord | null;
  isMock?: boolean;
  requiresAcceptance?: boolean;
  priceChange?: {
    previousAmount: string;
    previousCurrency: string;
    confirmedAmount: string;
    confirmedCurrency: string;
    confirmedOffer: DuffelOffer;
  };
  error?: string;
};
