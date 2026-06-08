import { duffelPost, isDuffelConfigured } from "@/backend/duffel/client";
import { getGooglePlacesApiKey } from "@/backend/env-api-keys";
import { fetchWithRetry } from "@/backend/http-retry";
import type {
  DuffelStayResult,
  DuffelRate,
  DuffelAccommodation,
} from "@/shared/duffel-stays";
import { mockSearchDuffelStays } from "@/backend/duffel/stays-mock";

export { isDuffelConfigured };

async function geocodeDestination(
  city: string,
  googleApiKey: string
): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const res = await fetchWithRetry("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": googleApiKey,
        "X-Goog-FieldMask": "places.location",
      },
      body: JSON.stringify({ textQuery: city }),
      cache: "no-store",
    }, { timeoutMs: 8_000, retryUnsafeMethods: true });
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
