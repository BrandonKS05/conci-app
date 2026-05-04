import { getGooglePlacesApiKey } from "@/backend/env-api-keys";
import { googlePlaceFirstPhotoProxyPath } from "@/backend/google-places-photo-media";
import type { TripPlan } from "@/shared/trip-plan";
import type { RestaurantPick } from "@/shared/restaurants";

const SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";
/** No spaces allowed in Google's field mask list. */
const FIELD_MASK =
  "places.displayName,places.formattedAddress,places.rating,places.priceLevel,places.photos,places.editorialSummary,places.googleMapsUri";

/** Builds `"{foodPreference} restaurants in {city}"` as requested. */
function buildRestaurantTextQuery(foodPreference: string, cityLabel: string): string {
  const city = cityLabel.trim() || "near me";
  const fp = foodPreference.trim();
  const q = fp ? `${fp} restaurants in ${city}` : `restaurants in ${city}`;
  return q.replace(/\s+/g, " ").slice(0, 490);
}

type PlaceJson = {
  displayName?: { text?: string };
  formattedAddress?: string;
  rating?: number;
  priceLevel?: string;
  editorialSummary?: { text?: string };
  googleMapsUri?: string;
  photos?: Array<{ name?: string } | null>;
};

async function searchTextPlaces(apiKey: string, textQuery: string, pageSize: number): Promise<PlaceJson[]> {
  const res = await fetch(SEARCH_TEXT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({ textQuery, pageSize }),
  });
  const raw = (await res.json().catch(() => ({}))) as {
    places?: unknown;
    error?: { message?: string; status?: string };
  };

  if (!res.ok) {
    const detail =
      typeof raw.error?.message === "string"
        ? raw.error.message
        : typeof raw.error?.status === "string"
          ? raw.error.status
          : "";
    throw new Error(detail || `Places search failed (${res.status})`);
  }

  const list = raw.places;
  if (!Array.isArray(list)) return [];
  return list.filter((p): p is PlaceJson => !!p && typeof p === "object");
}

function formatPriceLevel(level: unknown): string {
  if (level == null || level === "") return "—";
  if (typeof level === "string") {
    const map: Record<string, string> = {
      PRICE_LEVEL_FREE: "$0",
      PRICE_LEVEL_INEXPENSIVE: "$",
      PRICE_LEVEL_MODERATE: "$$",
      PRICE_LEVEL_EXPENSIVE: "$$$",
      PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
      UNSPECIFIED: "—",
    };
    const k = level.toUpperCase();
    return map[k] ?? map[level] ?? level;
  }
  if (typeof level === "number") {
    if (level === 0) return "—";
    return "$".repeat(Math.min(Math.max(level, 1), 4));
  }
  return "—";
}

function mapPlaceToPick(place: PlaceJson, id: string): RestaurantPick {
  const name = place.displayName?.text?.trim().slice(0, 120) || "Restaurant";
  const mapsUrl =
    typeof place.googleMapsUri === "string" && place.googleMapsUri.startsWith("http")
      ? place.googleMapsUri
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;

  const ratingNum = typeof place.rating === "number" ? place.rating : null;
  const ratingDisplay = ratingNum != null ? `${ratingNum.toFixed(1)} ★ · Google Maps` : "Google Maps listing";

  const summary = place.editorialSummary?.text?.trim();

  return {
    id,
    name,
    neighborhood: (place.formattedAddress ?? "—").trim().slice(0, 160),
    ratingDisplay,
    priceRange: formatPriceLevel(place.priceLevel),
    openTableUrl: mapsUrl,
    cuisineType: summary ? summary.slice(0, 240) : undefined,
    reserveCtaLabel: "Open in Google Maps",
    coverPhotoUrl: googlePlaceFirstPhotoProxyPath(place.photos),
  };
}

/**
 * Live restaurant rows for the trip: Google Places Text Search (New).
 * Runs one `places:searchText` per GROUP VOTES food/venue hint (`polls.venues`),
 * `{ textQuery }` = `"{hint} restaurants in {city}"`, top **3** per hint.
 */
export async function fetchLiveRestaurantsForPlan(plan: TripPlan, hints: string[]): Promise<{
  picks: RestaurantPick[];
  error: string | null;
}> {
  const locationStr = plan.location?.trim();
  if (!locationStr) return { picks: [], error: null };

  const apiKey = getGooglePlacesApiKey();
  if (!apiKey) {
    return {
      picks: [],
      error:
        "Set GOOGLE_PLACES_API_KEY in .env.local (Maps Platform Places API enabled) to load live restaurant picks.",
    };
  }

  const foodHints = hints.filter(Boolean).slice(0, 3);
  const picks: RestaurantPick[] = [];
  const errors: string[] = [];

  if (foodHints.length === 0) {
    try {
      const q = buildRestaurantTextQuery("", locationStr);
      const rows = await searchTextPlaces(apiKey, q, 3);
      rows.forEach((row, idx) => {
        picks.push(mapPlaceToPick(row, `eat-${idx}`));
      });
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "Restaurant search failed.");
    }

    return {
      picks,
      error: errors[0] ?? (picks.length ? null : "No restaurant results."),
    };
  }

  for (let hi = 0; hi < foodHints.length; hi += 1) {
    const hint = foodHints[hi]!;
    const q = buildRestaurantTextQuery(hint, locationStr);
    try {
      const rows = await searchTextPlaces(apiKey, q, 3);
      rows.forEach((row, ri) => {
        picks.push(mapPlaceToPick(row, `eat-${hi}-${ri}`));
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Search failed.";
      errors.push(`${hint.trim().slice(0, 42)}…: ${msg}`);
    }
  }

  return {
    picks,
    error: errors.length
      ? errors.slice(0, 2).join(" · ")
      : picks.length
        ? null
        : "No restaurant results.",
  };
}
