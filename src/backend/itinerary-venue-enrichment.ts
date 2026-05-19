import { searchPlacesGoogleMaps } from "@/backend/serpapi-places";
import type { ItineraryActivity, GeneratedItinerary } from "@/shared/trip-plan";

type BudgetTier = "budget" | "moderate" | "splurge";

type EnrichmentResult = {
  itinerary: GeneratedItinerary;
  venuesVerified: number;
  venuesTotal: number;
};

const CATEGORIES_TO_VERIFY = new Set(["food", "activity", "lodging"]);
const MAX_PARALLEL_SEARCHES = 6;

const BUDGET_QUALIFIERS: Record<BudgetTier, Record<string, string>> = {
  budget: {
    food: "cheap",
    activity: "free",
    lodging: "budget",
  },
  moderate: {
    food: "",
    activity: "",
    lodging: "",
  },
  splurge: {
    food: "best",
    activity: "premium",
    lodging: "luxury",
  },
};

const VIBE_SEARCH_KEYWORDS: Record<string, string[]> = {
  party: ["nightlife", "bar", "club", "live music"],
  chill: ["relaxing", "scenic", "spa", "beach"],
  culture: ["museum", "historical", "gallery", "heritage"],
  outdoors: ["outdoor", "nature", "hiking", "adventure"],
  foodie: ["food tour", "restaurant", "culinary", "tasting"],
  adventure: ["adventure", "extreme", "thrill"],
  romantic: ["romantic", "couples", "scenic"],
  luxury: ["luxury", "premium", "exclusive", "VIP"],
};

function buildSearchQuery(
  activity: ItineraryActivity,
  location: string,
  budgetTier: BudgetTier,
  vibes: string[]
): string | null {
  if (!CATEGORIES_TO_VERIFY.has(activity.category)) return null;
  const title = activity.title.trim();
  if (!title || title.length < 3) return null;
  if (/^(arrive|depart|check.?in|check.?out|fly|drive|uber|lyft|taxi|bus|train)/i.test(title)) return null;

  const budgetQual = BUDGET_QUALIFIERS[budgetTier]?.[activity.category] || "";

  let vibeQual = "";
  if (activity.category === "activity" && vibes.length > 0) {
    for (const v of vibes) {
      const keywords = VIBE_SEARCH_KEYWORDS[v.toLowerCase()];
      if (keywords) {
        const titleLower = title.toLowerCase();
        const matchesVibe = keywords.some((kw) => titleLower.includes(kw));
        if (matchesVibe) {
          vibeQual = keywords[0] || "";
          break;
        }
      }
    }
  }

  const parts = [budgetQual, title, vibeQual, location].filter(Boolean);
  return parts.join(" ");
}

export async function enrichItineraryWithVenues(
  itinerary: GeneratedItinerary,
  location: string,
  budgetTier: BudgetTier = "moderate",
  vibes: string[] = []
): Promise<EnrichmentResult> {
  const searches: Array<{
    dayIdx: number;
    actIdx: number;
    query: string;
  }> = [];

  for (let di = 0; di < itinerary.days.length; di++) {
    const day = itinerary.days[di]!;
    for (let ai = 0; ai < day.activities.length; ai++) {
      const act = day.activities[ai]!;
      const query = buildSearchQuery(act, location, budgetTier, vibes);
      if (query) {
        searches.push({ dayIdx: di, actIdx: ai, query });
      }
    }
  }

  if (searches.length === 0) {
    return { itinerary, venuesVerified: 0, venuesTotal: 0 };
  }

  let verified = 0;
  const batches: typeof searches[] = [];
  for (let i = 0; i < searches.length; i += MAX_PARALLEL_SEARCHES) {
    batches.push(searches.slice(i, i + MAX_PARALLEL_SEARCHES));
  }

  for (const batch of batches) {
    const results = await Promise.allSettled(
      batch.map((s) => searchPlacesGoogleMaps(s.query, location, { limit: 3 }))
    );

    for (let i = 0; i < batch.length; i++) {
      const { dayIdx, actIdx } = batch[i]!;
      const result = results[i];
      if (result?.status !== "fulfilled" || !result.value.length) continue;

      const act = itinerary.days[dayIdx]!.activities[actIdx]!;

      // Pick the best-rated result with >= 3.5 stars, or fall back to first
      const candidates = result.value.filter((p) => p.rating == null || p.rating >= 3.5);
      const place = candidates[0] ?? result.value[0]!;

      act.bookingUrl = place.mapsUrl;
      if (place.rating && place.rating >= 3.5) {
        const ratingInfo = `${place.rating}\u2605${place.reviewCount ? `, ${place.reviewCount} reviews` : ""}`;
        act.description = `${act.description} (${ratingInfo})`.trim();
      }

      // For budget tier, check if price range matches expectations
      if (place.priceRange && budgetTier === "budget" && activity_seems_expensive(place.priceRange)) {
        continue;
      }

      verified++;
    }
  }

  return {
    itinerary,
    venuesVerified: verified,
    venuesTotal: searches.length,
  };
}

function activity_seems_expensive(priceRange: string): boolean {
  const dollarSigns = (priceRange.match(/\$/g) || []).length;
  return dollarSigns >= 4;
}
