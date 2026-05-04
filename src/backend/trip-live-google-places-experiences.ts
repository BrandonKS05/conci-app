import { getGooglePlacesApiKey } from "@/backend/env-api-keys";
import type { TripPlan } from "@/shared/trip-plan";
import type { LiveExperienceCard } from "@/shared/trip-live-recommendations";

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK =
  "places.displayName,places.formattedAddress,places.rating,places.photos,places.editorialSummary,places.googleMapsUri";

function cityHead(location: string | null): string {
  const raw = (location || "").trim();
  if (!raw) return "";
  const head = raw.split(",")[0]?.trim() ?? raw;
  return head.length >= 2 ? head : "";
}

/** Alternate phrasing for variety between reloads. */
function textQueryForCity(city: string): string {
  let h = 0;
  for (let i = 0; i < city.length; i++) {
    h = (h * 31 + city.charCodeAt(i)) | 0;
  }
  return (h & 1) === 0 ? `top experiences in ${city}` : `things to do in ${city}`;
}

function errMessageFromGoogleJson(j: unknown): string {
  if (!j || typeof j !== "object") return "Google Places returned an unexpected response.";
  const o = j as Record<string, unknown>;
  const err = o.error;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const msg = typeof e.message === "string" ? e.message : typeof e.status === "string" ? e.status : "";
    if (msg) return `Google Places: ${msg.slice(0, 280)}`;
  }
  return "Google Places request did not succeed.";
}

function mapPlace(row: Record<string, unknown>, city: string): LiveExperienceCard | null {
  const dn = row.displayName as { text?: string } | undefined;
  const name = (typeof dn?.text === "string" && dn.text.trim() ? dn.text.trim() : "").slice(0, 160);
  if (!name) return null;

  const ratingRaw = row.rating;
  const rN = typeof ratingRaw === "number" ? ratingRaw : typeof ratingRaw === "string" ? Number.parseFloat(ratingRaw) : NaN;
  const rating = Number.isFinite(rN) && rN > 0 ? `${rN.toFixed(1)} ★` : "—";

  const summary = row.editorialSummary as { text?: string } | undefined;
  const sumText = typeof summary?.text === "string" ? summary.text.trim() : "";
  const duration =
    sumText.length > 0 ? (sumText.length > 160 ? `${sumText.slice(0, 157)}…` : sumText) : "—";

  const formatted = typeof row.formattedAddress === "string" ? row.formattedAddress.trim() : "";
  const mapsUri = typeof row.googleMapsUri === "string" && row.googleMapsUri.startsWith("http") ? row.googleMapsUri : "";
  const bookingUrl =
    mapsUri || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${city}`)}`;

  const pricePerPerson =
    formatted.length > 0 ? formatted.slice(0, 120) + (formatted.length > 120 ? "…" : "") : "See Google Maps";

  return { name, pricePerPerson, rating, duration, bookingUrl };
}

/**
 * Top experiences via Google Places API (New) Text Search — `GOOGLE_PLACES_API_KEY`.
 */
export async function fetchGooglePlacesExperiences(plan: TripPlan): Promise<{
  items: LiveExperienceCard[];
  error: string | null;
}> {
  const key = getGooglePlacesApiKey();
  if (!key) {
    return {
      items: [],
      error: "Add GOOGLE_PLACES_API_KEY to load top experiences from Google Places.",
    };
  }

  const city = cityHead(plan.location);
  if (!city) {
    return {
      items: [],
      error: "We need a clearer destination (city or region) to find things to do nearby.",
    };
  }

  const textQuery = textQueryForCity(city);

  try {
    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery,
        maxResultCount: 5,
        languageCode: "en",
      }),
      cache: "no-store",
    });

    const text = await res.text();
    let j: unknown;
    try {
      j = text ? JSON.parse(text) : {};
    } catch {
      return {
        items: [],
        error: res.ok
          ? "Google Places returned data we could not read. Try again in a moment."
          : `Google Places (${res.status}): ${text.slice(0, 200)}`,
      };
    }

    if (!res.ok) {
      return { items: [], error: errMessageFromGoogleJson(j) };
    }

    const o = j as Record<string, unknown>;
    const places = o.places;
    if (!Array.isArray(places) || places.length === 0) {
      return {
        items: [],
        error: null,
      };
    }

    const items: LiveExperienceCard[] = [];
    for (const row of places) {
      if (!row || typeof row !== "object") continue;
      const card = mapPlace(row as Record<string, unknown>, city);
      if (card) items.push(card);
      if (items.length >= 5) break;
    }

    return {
      items,
      error: items.length ? null : "No matching places were found for that search. Try refining the trip destination.",
    };
  } catch (e) {
    return {
      items: [],
      error:
        e instanceof Error
          ? `Could not reach Google Places (${e.message.slice(0, 160)}).`
          : "Could not reach Google Places. Check your connection and try again.",
    };
  }
}
