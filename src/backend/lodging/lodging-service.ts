import type { LodgingProvider, LodgingSearchInput } from "@/backend/lodging/provider";
import { liteApiProvider } from "@/backend/lodging/liteapi-provider";
import { duffelProvider } from "@/backend/lodging/duffel-provider";
import { cacheKey, readCache, writeCache, type LodgingSearchResult } from "@/backend/lodging/search-cache";

const LOG = "[lodging-service]";
const PROVIDER_TIMEOUT_MS = 12_000;

/** Priority order: LiteAPI primary → Duffel fallback. RapidAPI remains legacy-only, never auto-checkout. */
const PROVIDERS: LodgingProvider[] = [liteApiProvider, duffelProvider];

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

/**
 * Search bookable hotels across providers in priority order. The first
 * configured provider that returns at least one usable result wins; any error,
 * timeout, or empty result advances to the next. Results are cached briefly.
 */
export async function searchLodging(input: LodgingSearchInput): Promise<LodgingSearchResult> {
  const key = cacheKey(input);
  const cached = readCache(key);
  if (cached) {
    console.info(`${LOG} cache hit`, { key, provider: cached.provider, count: cached.hotels.length });
    return cached;
  }

  for (const provider of PROVIDERS) {
    if (!provider.isConfigured()) {
      console.info(`${LOG} skip ${provider.name} (not configured)`);
      continue;
    }
    try {
      const hotels = await withTimeout(provider.searchHotels(input), PROVIDER_TIMEOUT_MS, provider.name);
      if (hotels.length > 0) {
        console.info(`${LOG} ${provider.name} returned ${hotels.length}`, { destination: input.destination });
        const result: LodgingSearchResult = { hotels, provider: provider.name };
        writeCache(key, result);
        return result;
      }
      console.info(`${LOG} ${provider.name} returned 0 — falling back`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`${LOG} ${provider.name} failed — falling back`, { msg });
    }
  }

  console.warn(`${LOG} all providers exhausted`, { destination: input.destination });
  return { hotels: [], provider: null };
}
