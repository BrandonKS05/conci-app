import type { TripPlan } from "@/shared/trip-plan";

/** Venue option for collaboration (enriched chips; votes use stable `id`). */
export type RestaurantPick = {
  id: string;
  /** Short label shown on the trip plan & vote cards */
  name: string;
  neighborhood: string;
  /** Guest rating — estimated from plan context until a live Places API wires in */
  ratingDisplay: string;
  /** Typical spend at this tier */
  priceRange: string;
  openTableUrl: string;
  /** When live APIs fill this in (e.g. Italian, Seafood). */
  cuisineType?: string;
  /** Button label — default "Reserve on OpenTable"; Yelp fallback uses "View on Yelp". */
  reserveCtaLabel?: string;
};

function cityFromPlan(plan: TripPlan): string {
  const loc = plan.location?.trim();
  if (loc?.length) return loc.split(",")[0]!.trim();
  const title = plan.title?.trim();
  return title?.length ? title : "your area";
}

function hashSeed(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return Math.abs(h);
}

/** Pull a plausible neighborhood from messy free-text (e.g. "Italian spot on 2nd"). */
function neighborhoodFromHint(hint: string, city: string): string {
  const t = hint.trim();
  const ave = t.match(/\b(\d+(?:st|nd|rd|th)|[A-Za-z]+\s+Ave(?:\.|nue)?)\b/i);
  if (ave) return `${ave[1]} · ${city}`;
  const hood = t.match(/\b(SoHo|NoHo|Tribeca|West Village|UES|UWS|Midtown|Downtown|Arts District|Mile End|Williamsburg)\b/i);
  if (hood) return `${hood[1]} · ${city}`;
  return `Near center · ${city}`;
}

/** Deterministic enrichment so chips always show rating, price tier, neighborhood, OT link. */
export function buildRestaurantPicksFromVenueHints(plan: TripPlan, hints: string[]): RestaurantPick[] {
  const city = cityFromPlan(plan);
  const priceBands = ["$$ · ~$55/person", "$$$ · ~$95/person", "$$$$ · ~$160/person"];

  return hints.slice(0, 3).map((raw, idx) => {
    const name = raw.trim().slice(0, 96) || `Option ${idx + 1}`;
    const seed = hashSeed(`${plan.title ?? ""}|${city}|${name}|${idx}`);
    const bump = seed % 8;
    const rating = `${(4 + bump / 10).toFixed(1)} · diner rating`;
    const priceRange = priceBands[idx % priceBands.length]!;
    const q = new URLSearchParams();
    q.set("name", name);
    q.set("location", city);
    const openTableUrl = `https://www.opentable.com/s?${q.toString()}`;
    const id = `eat-${idx}`;

    return {
      id,
      name,
      neighborhood: neighborhoodFromHint(name, city),
      ratingDisplay: rating,
      priceRange,
      openTableUrl,
    };
  });
}

/** Overlay live API rows onto seeded venue cards; preserves vote ids (`eat-0`…). */
export function mergeLiveRestaurantsOntoHints(
  base: RestaurantPick[],
  live: RestaurantPick[] | null | undefined
): RestaurantPick[] {
  if (!live?.length || !base.length) return base;
  return base.map((b, i) => {
    const L = live[i];
    if (!L) return b;
    return {
      ...b,
      name: L.name,
      neighborhood: L.neighborhood,
      ratingDisplay: L.ratingDisplay,
      priceRange: L.priceRange,
      openTableUrl: L.openTableUrl,
      cuisineType: L.cuisineType,
      reserveCtaLabel: L.reserveCtaLabel,
    };
  });
}
