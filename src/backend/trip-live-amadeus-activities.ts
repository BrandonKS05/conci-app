import { getRapidApiKey } from "@/backend/rapidapi-key";
import { getRapidApiExperiencesActivitiesPath, getRapidApiExperiencesHost } from "@/backend/env-api-keys";
import type { TripPlan } from "@/shared/trip-plan";
import type { LiveExperienceCard } from "@/shared/trip-live-recommendations";

const UA = "ConciTripPlanner/1.0 (contact: support@example.com)";

type AmadeusActivity = {
  name?: string;
  shortDescription?: string;
  rating?: string | number;
  bookingLink?: string;
  minimumDuration?: string;
  price?: { currencyCode?: string; amount?: string };
};

async function geocodeDestination(q: string): Promise<{ lat: number; lon: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const arr = (await res.json()) as { lat?: string; lon?: string }[];
  const hit = arr[0];
  if (!hit?.lat || !hit?.lon) return null;
  const lat = Number.parseFloat(hit.lat);
  const lon = Number.parseFloat(hit.lon);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return { lat, lon };
}

function destinationQuery(plan: TripPlan): string {
  const loc = plan.location?.trim();
  if (loc?.length) return loc;
  const t = plan.title?.trim();
  return t ?? "";
}

/** Keywords from plan vibe + poll picks for soft ranking (Amadeus radius search has no text filter). */
function experienceKeywords(plan: TripPlan): string[] {
  const raw: string[] = [];
  if (Array.isArray(plan.vibe)) raw.push(...plan.vibe);
  const polls = plan.polls;
  if (polls?.vibePick?.length) raw.push(...polls.vibePick);
  if (polls?.activities?.length) raw.push(...polls.activities);

  const tokens = new Set<string>();
  for (const s of raw) {
    const t = s.trim().toLowerCase();
    if (!t) continue;
    tokens.add(t);
    for (const part of t.split(/[^a-z0-9]+/i)) {
      if (part.length >= 3) tokens.add(part);
    }
  }
  return [...tokens];
}

function formatIsoDuration(iso: string | undefined): string {
  if (!iso || typeof iso !== "string" || !iso.startsWith("PT")) return "—";
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!m) return "—";
  const h = m[1] ? Number.parseInt(m[1], 10) : 0;
  const min = m[2] ? Number.parseInt(m[2], 10) : 0;
  const sec = m[3] ? Number.parseInt(m[3], 10) : 0;
  if (!h && !min && !sec) return "—";
  if (h && min) return `${h}h ${min}m`;
  if (h) return `${h}h`;
  if (min) return `${min} min`;
  return `${sec}s`;
}

function scoreActivity(a: AmadeusActivity, keywords: string[]): number {
  if (!keywords.length) return 0;
  const hay = `${a.name ?? ""} ${a.shortDescription ?? ""}`.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (kw.length >= 3 && hay.includes(kw)) score += 1;
  }
  return score;
}

function numericRating(r: string | number | undefined): number {
  if (r == null) return 0;
  const n = typeof r === "number" ? r : Number.parseFloat(String(r).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function mapToCard(a: AmadeusActivity, destHint: string): LiveExperienceCard {
  const name = String(a.name ?? "Activity").slice(0, 160);
  const cur = a.price?.currencyCode?.trim() || "USD";
  const amt = a.price?.amount?.trim();
  const pricePerPerson =
    amt && amt.length ? `From ${amt} ${cur}/person` : `See provider for pricing (${cur})`;

  const r = numericRating(a.rating);
  const rating = r > 0 ? `${r.toFixed(1)} ★` : "—";

  const bookingUrl =
    typeof a.bookingLink === "string" && a.bookingLink.startsWith("http")
      ? a.bookingLink
      : `https://www.google.com/search?q=${encodeURIComponent(`${name} ${destHint}`.trim())}`;

  return {
    name,
    pricePerPerson,
    rating,
    duration: formatIsoDuration(a.minimumDuration),
    bookingUrl,
  };
}

export async function fetchAmadeusActivitiesRapid(plan: TripPlan): Promise<{
  items: LiveExperienceCard[];
  error: string | null;
}> {
  const key = getRapidApiKey();
  const host = getRapidApiExperiencesHost();
  const path = getRapidApiExperiencesActivitiesPath() ?? "/v1/shopping/activities";

  if (!key) {
    return { items: [], error: "Add RAPIDAPI_KEY to load live experiences (RapidAPI)." };
  }
  if (!host) {
    return {
      items: [],
      error:
        "Set RAPIDAPI_MUSEMENT_HOST, RAPIDAPI_ACTIVITIES_HOST, or RAPIDAPI_AMADEUS_HOST to the X-RapidAPI-Host from your RapidAPI activities product (same RAPIDAPI_KEY).",
    };
  }

  const dest = destinationQuery(plan);
  if (!dest) {
    return { items: [], error: "Set a destination on the plan for activity search." };
  }

  const coords = await geocodeDestination(dest);
  if (!coords) {
    return { items: [], error: "Could not geocode the destination for Amadeus activities search." };
  }

  const keywords = experienceKeywords(plan);
  const radiusKm = 8;
  const url = `https://${host.replace(/^https?:\/\//i, "")}${path.startsWith("/") ? path : `/${path}`}?latitude=${coords.lat}&longitude=${coords.lon}&radius=${radiusKm}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "X-RapidAPI-Key": key,
        "X-RapidAPI-Host": host.replace(/^https?:\/\//i, ""),
      },
    });
    const text = await res.text();
    if (!res.ok) {
      return {
        items: [],
        error: `Amadeus activities ${res.status}: ${text.slice(0, 220)}`,
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      return { items: [], error: "Amadeus activities response was not valid JSON." };
    }

    const root = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    const errors = root.errors;
    if (Array.isArray(errors) && errors.length) {
      const msg = errors.map((e) => (e && typeof e === "object" ? JSON.stringify(e) : String(e))).join("; ");
      return { items: [], error: `Amadeus: ${msg.slice(0, 280)}` };
    }

    let data = root.data;
    if (data && typeof data === "object" && !Array.isArray(data) && "data" in data) {
      const inner = (data as { data?: unknown }).data;
      if (Array.isArray(inner)) data = inner;
    }
    const list: AmadeusActivity[] = Array.isArray(data) ? (data as AmadeusActivity[]) : [];

    const scored = list.map((a) => ({
      a,
      score: scoreActivity(a, keywords),
      ratingN: numericRating(a.rating),
    }));

    scored.sort((x, y) => {
      if (y.score !== x.score) return y.score - x.score;
      return y.ratingN - x.ratingN;
    });

    const items = scored.slice(0, 3).map(({ a }) => mapToCard(a, dest));
    return {
      items,
      error: items.length ? null : "Amadeus returned no activities for this area.",
    };
  } catch (e) {
    return {
      items: [],
      error: e instanceof Error ? e.message : "Amadeus activities request failed.",
    };
  }
}
