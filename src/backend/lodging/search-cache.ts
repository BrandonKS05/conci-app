import type { MockHotelBrowseResult, LodgingProviderName } from "@/shared/mock-hotel-search";
import type { LodgingSearchInput } from "@/backend/lodging/provider";

/**
 * Short-TTL in-memory cache for repeated identical hotel searches. Protects our
 * look-to-book ratio with LiteAPI (free endpoints can be throttled if hit
 * thousands of times per booking). Process-local — fine for this use; identical
 * searches within the window reuse the same provider result.
 */
type CacheEntry = { at: number; value: LodgingSearchResult };
const TTL_MS = 7 * 60 * 1000;
const store = new Map<string, CacheEntry>();

export type LodgingSearchResult = {
  hotels: MockHotelBrowseResult[];
  provider: LodgingProviderName | null;
};

export function cacheKey(input: LodgingSearchInput): string {
  return [
    input.destination.trim().toLowerCase(),
    input.checkIn,
    input.checkOut,
    input.guests,
    input.rooms,
    input.lodgingType,
    input.limit ?? 25,
  ].join("|");
}

export function readCache(key: string): LodgingSearchResult | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    store.delete(key);
    return null;
  }
  return hit.value;
}

export function writeCache(key: string, value: LodgingSearchResult): void {
  // Bound memory: drop the oldest entry if the map grows large.
  if (store.size > 500) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  store.set(key, { at: Date.now(), value });
}
