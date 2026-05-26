/**
 * Duffel Stays API types — safe for both server and client imports.
 * https://duffel.com/docs/api/stays
 */

export type DuffelRoomBed = {
  count: number;
  type: string;
};

export type DuffelRoom = {
  beds: DuffelRoomBed[];
  name: string | null;
};

export type DuffelCancellationTimeline = {
  refund_amount: string;
  currency: string;
  before: string; // ISO datetime
};

export type DuffelRate = {
  id: string;
  board_type: "room_only" | "breakfast" | "half_board" | "full_board" | "all_inclusive" | null;
  total_amount: string;
  total_currency: string;
  tax_amount: string | null;
  tax_currency: string | null;
  rooms: DuffelRoom[];
  cancellation_timeline: DuffelCancellationTimeline[];
  payment_requirements: {
    requires_instant_payment: boolean;
    payment_required_by: string | null;
    price_guarantee_expires_at: string | null;
  };
};

export type DuffelPhoto = {
  url: string;
  title: string | null;
};

export type DuffelAmenity = {
  type: string;
  description: string;
};

export type DuffelAccommodation = {
  id: string;
  name: string;
  rating: { value: string; count: number } | null;
  location: {
    address: {
      city_name: string;
      country_code: string;
      line_one: string | null;
    };
    geographic_coordinates: { latitude: number; longitude: number };
  };
  photos: DuffelPhoto[];
  description: { text: string } | null;
  amenities: DuffelAmenity[];
  check_in_information: {
    check_in_after_time: string | null;
    check_out_before_time: string | null;
  } | null;
};

export type DuffelStayResult = {
  id: string;
  accommodation: DuffelAccommodation;
  cheapest_rate_total_amount: string;
  cheapest_rate_currency: string;
  rates: DuffelRate[];
};

export type DuffelCancellationPolicy = {
  fully_refundable_before: string | null;
  timeline: DuffelCancellationTimeline[];
};

/** Booking confirmation stored in the trip plan after a successful Duffel reservation. */
export type DuffelBookingRecord = {
  provider: "duffel";
  reservationId: string;
  bookingReference: string;
  status: "confirmed" | "pending" | "cancelled";
  rateId: string;
  totalAmount: string;
  currency: string;
  checkInDate: string;
  checkOutDate: string;
  bookedAt: string;
  cancellationPolicy: DuffelCancellationPolicy | null;
  accommodationName: string;
  accommodationId: string;
  isMock?: boolean;
};

export type DuffelBookingGuestDetails = {
  given_name: string;
  family_name: string;
  email: string;
  phone_number: string;
  born_on?: string;
  type: "adult";
};

// ─── API response shapes (Conci API, not raw Duffel) ───────────────────────

export type DuffelStaysSearchApiResponse = {
  results: DuffelStayResult[];
  searchId: string | null;
  isMock: boolean;
  error?: string;
};

export type DuffelStaysQuoteApiResponse = {
  rate: DuffelRate | null;
  accommodation: DuffelAccommodation | null;
  quoteId: string | null;
  isMock: boolean;
  error?: string;
};

export type DuffelStaysBookApiResponse = {
  booking: DuffelBookingRecord | null;
  error?: string;
};

export type DuffelStaysRetrieveApiResponse = {
  booking: DuffelBookingRecord | null;
  error?: string;
};
