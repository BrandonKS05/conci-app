import { getSerpApiKey } from "@/backend/env-api-keys";
import type { PlacePreview } from "@/shared/place-preview";

const SERP = "https://serpapi.com/search.json";

function mapsSearchUrl(name: string, address?: string): string {
  const q = [name, address].filter(Boolean).join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function num(x: unknown): number | undefined {
  if (typeof x === "number" && !Number.isNaN(x)) return x;
  if (typeof x === "string") {
    const n = parseFloat(x);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

function rowToPreview(row: Record<string, unknown>): PlacePreview | null {
  const a = typeof row.title === "string" ? row.title.trim() : "";
  const b = typeof row.name === "string" ? row.name.trim() : "";
  const c = typeof row.place_title === "string" ? row.place_title.trim() : "";
  const name = a || b || c;
  if (!name) return null;

  const rating = num(row.rating) ?? num(row.stars);
  const reviewCount = num(row.reviews) ?? num(row.review_count) ?? num(row.review_snippet);
  const address =
    (typeof row.address === "string" && row.address) ||
    (typeof row.address_lines === "string" && row.address_lines) ||
    undefined;
  const priceRange =
    (typeof row.price === "string" && row.price) ||
    (typeof row.price_range === "string" && row.price_range) ||
    undefined;

  let photoUrl: string | null =
    (typeof row.thumbnail === "string" && row.thumbnail) ||
    (typeof row.image === "string" && row.image) ||
    null;

  const photos = row.photos;
  if (!photoUrl && Array.isArray(photos) && photos[0] && typeof photos[0] === "object") {
    const p0 = photos[0] as Record<string, unknown>;
    const u = typeof p0.image === "string" ? p0.image : typeof p0.url === "string" ? p0.url : null;
    if (u) photoUrl = u;
  }

  return {
    name,
    rating,
    reviewCount,
    address,
    priceRange,
    photoUrl,
    mapsUrl: mapsSearchUrl(name, address),
  };
}

function extractRows(j: unknown): Record<string, unknown>[] {
  const o = j as Record<string, unknown>;
  const a = o.local_results;
  if (Array.isArray(a)) return a as Record<string, unknown>[];
  const p = o.places_results;
  if (Array.isArray(p)) return p as Record<string, unknown>[];
  return [];
}

export type MapsSearchOpts = {
  /** SerpAPI pagination offset (typically 0, 20, 40, …). */
  start?: number;
  /** Max rows to return after parsing (default 5). */
  limit?: number;
};

/** Google Maps local results via SerpAPI (`engine=google_maps`). */
export async function searchPlacesGoogleMaps(
  query: string,
  _locationHint?: string | null,
  opts?: MapsSearchOpts
): Promise<PlacePreview[]> {
  const key = getSerpApiKey();
  if (!key?.length) return [];

  const start = typeof opts?.start === "number" && opts.start >= 0 ? Math.floor(opts.start) : 0;
  const limit = typeof opts?.limit === "number" && opts.limit > 0 ? Math.min(opts.limit, 30) : 5;

  const qs = new URLSearchParams({
    engine: "google_maps",
    type: "search",
    google_domain: "google.com",
    hl: "en",
    gl: "us",
    q: query.slice(0, 200),
    api_key: key,
    start: String(start),
  });

  const res = await fetch(`${SERP}?${qs}`, { cache: "no-store" });
  if (!res.ok) return [];
  let j: unknown;
  try {
    j = await res.json();
  } catch {
    return [];
  }

  const rows = extractRows(j);
  const out: PlacePreview[] = [];
  for (const row of rows) {
    const p = rowToPreview(row);
    if (p) out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}
