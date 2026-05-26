import { duffelPost, duffelGet, duffelDelete, isDuffelConfigured } from "@/backend/duffel/client";
import { getGooglePlacesApiKey } from "@/backend/env-api-keys";
import type {
  DuffelStayResult,
  DuffelRate,
  DuffelAccommodation,
  DuffelBookingGuestDetails,
  DuffelBookingRecord,
} from "@/shared/duffel-stays";
import {
  mockSearchDuffelStays,
  mockQuoteDuffelRate,
  mockCreateReservation,
} from "@/backend/duffel/stays-mock";

export { isDuffelConfigured };

async function geocodeDestination(
  city: string,
  googleApiKey: string
): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": googleApiKey,
        "X-Goog-FieldMask": "places.location",
      },
      body: JSON.stringify({ textQuery: city }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      places?: Array<{ location?: { latitude: number; longitude: number } }>;
    };
    return data.places?.[0]?.location ?? null;
  } catch {
    return null;
  }
}

// ─── Raw Duffel response shapes ────────────────────────────────────────────

type DuffelSearchResponse = {
  data: {
    id: string;
    results: Array<{
      id: string;
      accommodation: DuffelAccommodation;
      cheapest_rate_total_amount: string;
      cheapest_rate_currency: string;
      rates: DuffelRate[];
    }>;
  };
};

type DuffelQuoteResponse = {
  data: {
    id: string;
    rate: DuffelRate;
    accommodation: DuffelAccommodation;
  };
};

type DuffelReservationResponse = {
  data: {
    id: string;
    booking_reference: string;
    status: string;
    accommodation: DuffelAccommodation;
    rate: DuffelRate;
    total_amount: string;
    total_currency: string;
    check_in_date: string;
    check_out_date: string;
    cancellation: null | { fully_refundable_before: string | null };
  };
};

// ─── Service functions ─────────────────────────────────────────────────────

export type DuffelStaysSearchParams = {
  destination: string;
  checkInDate: string;
  checkOutDate: string;
  guests: number;
  rooms: number;
};

export async function searchDuffelStays(
  params: DuffelStaysSearchParams
): Promise<{ results: DuffelStayResult[]; searchId: string; isMock: boolean }> {
  if (!isDuffelConfigured()) {
    const mock = mockSearchDuffelStays(params);
    return { ...mock, isMock: true };
  }

  const googleApiKey = getGooglePlacesApiKey();
  let lat = 0;
  let lng = 0;

  if (googleApiKey) {
    const coords = await geocodeDestination(params.destination, googleApiKey);
    if (coords) {
      lat = coords.latitude;
      lng = coords.longitude;
    }
  }

  if (!lat || !lng) {
    throw new Error(
      `Could not geocode "${params.destination}". Ensure GOOGLE_PLACES_API_KEY is configured.`
    );
  }

  const guests = Array.from({ length: Math.max(1, params.guests) }, () => ({
    type: "adult" as const,
  }));

  const resp = await duffelPost<DuffelSearchResponse>("/stays/search", {
    data: {
      check_in_date: params.checkInDate,
      check_out_date: params.checkOutDate,
      rooms: Math.max(1, params.rooms),
      guests,
      location: {
        geographic_coordinates: { latitude: lat, longitude: lng },
        radius: 5,
      },
    },
  });

  return {
    results: resp.data.results ?? [],
    searchId: resp.data.id,
    isMock: false,
  };
}

export async function quoteDuffelStayRate(rateId: string): Promise<{
  rate: DuffelRate;
  accommodation: DuffelAccommodation;
  quoteId: string;
  isMock: boolean;
}> {
  if (!isDuffelConfigured()) {
    const mock = mockQuoteDuffelRate(rateId);
    return { ...mock, quoteId: `mock-quote-${Date.now()}`, isMock: true };
  }

  const resp = await duffelPost<DuffelQuoteResponse>("/stays/quotes", {
    data: { rate_id: rateId },
  });

  return {
    rate: resp.data.rate,
    accommodation: resp.data.accommodation,
    quoteId: resp.data.id,
    isMock: false,
  };
}

function reservationToRecord(
  d: DuffelReservationResponse["data"],
  rateId: string,
  isMock = false
): DuffelBookingRecord {
  return {
    provider: "duffel",
    reservationId: d.id,
    bookingReference: d.booking_reference,
    status:
      d.status === "confirmed" || d.status === "pending" || d.status === "cancelled"
        ? d.status
        : "pending",
    rateId,
    totalAmount: d.total_amount,
    currency: d.total_currency,
    checkInDate: d.check_in_date,
    checkOutDate: d.check_out_date,
    bookedAt: new Date().toISOString(),
    cancellationPolicy:
      d.rate?.cancellation_timeline?.length
        ? {
            fully_refundable_before: d.cancellation?.fully_refundable_before ?? null,
            timeline: d.rate.cancellation_timeline,
          }
        : null,
    accommodationName: d.accommodation.name,
    accommodationId: d.accommodation.id,
    ...(isMock ? { isMock: true } : {}),
  };
}

export async function createDuffelStayReservation(params: {
  rateId: string;
  guests: DuffelBookingGuestDetails[];
  checkInDate: string;
  checkOutDate: string;
  accommodationName: string;
  specialRequests?: string | null;
}): Promise<{ booking: DuffelBookingRecord; isMock: boolean }> {
  if (!isDuffelConfigured()) {
    const mock = mockCreateReservation(params);
    return { booking: mock, isMock: true };
  }

  const resp = await duffelPost<DuffelReservationResponse>("/stays/reservations", {
    data: {
      rate_id: params.rateId,
      guests: params.guests,
      accommodation_special_requests: params.specialRequests ?? null,
    },
  });

  return {
    booking: reservationToRecord(resp.data, params.rateId),
    isMock: false,
  };
}

export async function getDuffelReservation(
  reservationId: string
): Promise<{ booking: DuffelBookingRecord; isMock: boolean }> {
  if (!isDuffelConfigured()) {
    throw new Error("Duffel is not configured — cannot retrieve reservation.");
  }

  const resp = await duffelGet<DuffelReservationResponse>(
    `/stays/reservations/${reservationId}`
  );

  return {
    booking: reservationToRecord(resp.data, resp.data.rate?.id ?? ""),
    isMock: false,
  };
}

export async function cancelDuffelReservation(
  reservationId: string
): Promise<{ cancelled: boolean }> {
  if (!isDuffelConfigured()) {
    throw new Error("Duffel is not configured — cannot cancel reservation.");
  }
  await duffelDelete(`/stays/reservations/${reservationId}`);
  return { cancelled: true };
}
