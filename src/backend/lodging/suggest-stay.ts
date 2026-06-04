import { searchLodging } from "@/backend/lodging/lodging-service";
import { liteApiAiSearch } from "@/backend/lodging/liteapi-provider";
import type { LodgingSearchInput } from "@/backend/lodging/provider";
import type { MockHotelBrowseResult } from "@/shared/mock-hotel-search";
import {
  extractLodgingIntent,
  buildAiSearchQuery,
  parsePerNightCap,
  type LodgingSignal,
  type TripLodgingIntent,
} from "@/backend/lodging/trip-intent";

const LOG = "[suggest-stay]";
const AISEARCH_TIMEOUT_MS = 9_000;

/**
 * Pick one bookable stay that feels matched to *this* trip — Conci's default
 * suggestion on a freshly generated itinerary.
 *
 * Strategy: LiteAPI aiSearch (vibe-aware, AI-ranked, free /hotels/rates) first;
 * fall back to the normal rates router on timeout/empty. Then score by vibe
 * signals, value/budget, quality, and centrality, preferring best-value-in-
 * context over cheapest. Returns null (→ keep placeholder) when nothing usable.
 */
export type SuggestStayInput = {
  destination: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  guests: number;
  rooms: number;
  vibe?: string[];
  budgetTier?: string | null;
  budgetPerPerson?: string | null;
  seedText?: string | null;
};

export type SuggestStayResult = {
  hotel: MockHotelBrowseResult;
  reason: string;
  source: "aiSearch" | "rates";
};

function qualityOf(h: MockHotelBrowseResult): number {
  if (h.reviewScore > 0) return Math.min(10, h.reviewScore);
  if (h.rating > 0) return Math.min(10, h.rating * 2);
  return 0;
}

function priceSensitivity(signals: Set<LodgingSignal>, tier: string): number {
  if (signals.has("luxury")) return 0.02;
  if (signals.has("budget")) return 0.22;
  const t = tier.toLowerCase();
  if (/lux|splurge|high/.test(t)) return 0.03;
  if (/budget|cheap|low/.test(t)) return 0.2;
  return 0.08;
}

function candidateText(h: MockHotelBrowseResult): string {
  return [h.vibeText ?? "", ...(h.vibeTags ?? []), h.name, h.neighborhood].join(" ").toLowerCase();
}

/** City token from "Barcelona, Spain" → "barcelona", for sanity-checking aiSearch locality. */
function cityToken(destination: string): string {
  return destination.split(",")[0]?.trim().toLowerCase() ?? "";
}

/**
 * aiSearch occasionally returns loosely-located hotels. Keep only those whose
 * address/neighborhood actually names the destination city. If that empties the
 * list, the caller treats aiSearch as weak and falls back to the (geocoded,
 * location-locked) rates search.
 */
function filterToDestination(hotels: MockHotelBrowseResult[], destination: string): MockHotelBrowseResult[] {
  const token = cityToken(destination);
  if (token.length < 3) return hotels;
  return hotels.filter((h) => `${h.neighborhood} ${h.addressLine}`.toLowerCase().includes(token));
}

function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("aiSearch timeout")), ms))]);
}

// Positive markers per signal — matched against the candidate's vibe text/tags/name.
const MARKERS: Record<LodgingSignal, string[]> = {
  luxury: ["luxur", "upscale", "deluxe", "premium", "five star", "5-star", "elegant"],
  boutique: ["boutique", "design", "stylish", "charming", "chic"],
  romantic: ["romantic", "intimate", "charming", "couple", "garden", "boutique"],
  nightlife: ["nightlife", "bar", "lively", "vibrant", "central", "downtown"],
  family: ["family", "kid", "spacious", "suite", "apartment", "connecting"],
  beach: ["beach", "sea", "ocean", "resort", "coast", "waterfront"],
  cultural: ["historic", "museum", "old town", "art", "cultural", "central", "landmark"],
  foodie: ["food", "restaurant", "dining", "culinary", "market", "central"],
  adventure: ["mountain", "outdoor", "nature", "park", "ski", "trail", "active"],
  relaxing: ["spa", "wellness", "quiet", "peaceful", "garden", "retreat", "calm"],
  budget: ["value", "budget", "affordable"],
  central: ["central", "downtown", "walkable", "city cent", "heart", "prime location"],
  accessibility: ["accessible", "wheelchair", "step-free", "elevator", "lift"],
  transit: ["metro", "subway", "station", "transit", "public transport"],
  quality: ["well-reviewed", "highly rated", "excellent"],
};

const SIGNAL_LABEL: Record<LodgingSignal, string> = {
  luxury: "upscale", boutique: "boutique", romantic: "romantic vibe", nightlife: "near nightlife",
  family: "family-friendly", beach: "near the beach", cultural: "near cultural sights",
  foodie: "near great food", adventure: "good for an active trip", relaxing: "relaxing/spa",
  budget: "good value", central: "central location", accessibility: "accessibility",
  transit: "near transit", quality: "highly rated",
};

const GEO_SIGNALS: LodgingSignal[] = ["central", "transit", "nightlife", "cultural", "foodie"];

function centroidOf(hotels: MockHotelBrowseResult[]): { lat: number; lng: number } | null {
  const pts = hotels.filter((h) => h.latitude != null && h.longitude != null);
  if (pts.length < 3) return null;
  const lat = pts.reduce((s, h) => s + (h.latitude as number), 0) / pts.length;
  const lng = pts.reduce((s, h) => s + (h.longitude as number), 0) / pts.length;
  return { lat, lng };
}

function score(
  hotels: MockHotelBrowseResult[],
  intent: TripLodgingIntent,
  tier: string,
  perNightCap: number | null,
  aiRanked: boolean
): { hotel: MockHotelBrowseResult; reason: string } | null {
  // Keep decent options unless all are weak.
  const decent = hotels.filter((h) => qualityOf(h) >= 6.5 && h.nightlyUsd > 0);
  const pool = decent.length > 0 ? decent : hotels.filter((h) => h.nightlyUsd > 0);
  if (pool.length === 0) return null;

  const sensitivity = priceSensitivity(intent.signals, tier);
  const centroid = centroidOf(pool);
  const wantsCentral = GEO_SIGNALS.some((s) => intent.signals.has(s));

  let best: MockHotelBrowseResult | null = null;
  let bestScore = -Infinity;
  let bestReasons: string[] = [];

  pool.forEach((h, i) => {
    const q = qualityOf(h);
    const text = candidateText(h);
    let s = q * 10 - h.nightlyUsd * sensitivity;
    const reasons: string[] = [];

    if (aiRanked) s += Math.max(0, 14 - i * 0.8); // AI relevance ordering

    for (const sig of intent.signals) {
      const markerHit = MARKERS[sig].some((m) => text.includes(m));
      if (sig === "luxury" && (markerHit || q >= 8.7)) { s += 12; reasons.push(SIGNAL_LABEL[sig]); }
      else if (sig === "quality" && (markerHit || q >= 8.5 || h.reviewCount > 50)) { s += 5; reasons.push(SIGNAL_LABEL[sig]); }
      else if (sig === "accessibility" && markerHit) { s += 11; reasons.push(SIGNAL_LABEL[sig]); }
      else if (markerHit) { s += GEO_SIGNALS.includes(sig) ? 8 : 10; reasons.push(SIGNAL_LABEL[sig]); }
    }

    // Geographic centrality fallback when central-ish intent exists but no tag matched.
    if (wantsCentral && centroid && h.latitude != null && h.longitude != null) {
      const d = Math.hypot(h.latitude - centroid.lat, h.longitude - centroid.lng);
      if (d < 0.025 && !reasons.includes("central location")) { s += 6; reasons.push("central to the area"); }
    }

    // Within explicit per-night budget.
    if (perNightCap && h.nightlyUsd > 0) {
      if (h.nightlyUsd <= perNightCap) { s += 6; reasons.push(`within ~$${perNightCap}/night`); }
      else s -= (h.nightlyUsd - perNightCap) * 0.15;
    }

    if (s > bestScore) { bestScore = s; best = h; bestReasons = reasons; }
  });

  if (!best) return null;
  const chosen: MockHotelBrowseResult = best;
  const q = qualityOf(chosen);
  const reasonParts = [...new Set(bestReasons)];
  if (q >= 8 && !reasonParts.includes("highly rated")) reasonParts.push(`well-rated (${q.toFixed(1)})`);
  reasonParts.push(`$${chosen.nightlyUsd}/night`);
  return { hotel: chosen, reason: reasonParts.join(", ") };
}

export async function suggestStayForTrip(input: SuggestStayInput): Promise<SuggestStayResult | null> {
  const intent = extractLodgingIntent({
    seedText: input.seedText,
    vibe: input.vibe,
    budgetTier: input.budgetTier,
  });
  const perNightCap = parsePerNightCap(input.budgetPerPerson, input.seedText);
  const searchInput: LodgingSearchInput = {
    destination: input.destination,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guests: input.guests,
    rooms: input.rooms,
    lodgingType: "hotel",
    limit: 20,
  };

  // 1) Preferred: vibe-aware aiSearch (AI-ranked, free rates endpoint).
  const aiQuery = buildAiSearchQuery({
    destination: input.destination,
    guests: input.guests,
    intent,
    perNightCapUsd: perNightCap,
  });
  try {
    const aiHotelsRaw = await timeout(liteApiAiSearch(aiQuery, searchInput), AISEARCH_TIMEOUT_MS);
    const aiHotels = filterToDestination(aiHotelsRaw, input.destination);
    if (aiHotelsRaw.length > 0 && aiHotels.length === 0) {
      console.info(`${LOG} aiSearch results were off-location for "${input.destination}" — falling back to rates`);
    }
    const picked = aiHotels.length > 0 ? score(aiHotels, intent, input.budgetTier ?? "", perNightCap, true) : null;
    if (picked) {
      console.info(`${LOG} aiSearch pick`, {
        hotel: picked.hotel.name,
        signals: [...intent.signals],
        query: aiQuery,
        reason: picked.reason,
      });
      return { hotel: picked.hotel, reason: picked.reason, source: "aiSearch" };
    }
    console.info(`${LOG} aiSearch returned no usable pick — falling back to rates`);
  } catch (e) {
    console.warn(`${LOG} aiSearch failed/slow — falling back to rates`, { msg: e instanceof Error ? e.message : String(e) });
  }

  // 2) Fallback: normal provider-router rates search + same scoring (no AI rank).
  try {
    const { hotels } = await searchLodging(searchInput);
    const picked = score(hotels, intent, input.budgetTier ?? "", perNightCap, false);
    if (picked) {
      console.info(`${LOG} rates pick`, { hotel: picked.hotel.name, signals: [...intent.signals], reason: picked.reason });
      return { hotel: picked.hotel, reason: picked.reason, source: "rates" };
    }
  } catch (e) {
    console.warn(`${LOG} rates fallback failed`, { msg: e instanceof Error ? e.message : String(e) });
  }

  console.info(`${LOG} no usable stay — keeping placeholder`);
  return null;
}
