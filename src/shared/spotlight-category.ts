import type { PlaceSpotlight, SpotlightVenueKind } from "@/shared/place-preview";

/** Major brands / words that strongly imply a lodging Google Maps place. */
const HOTEL_NAME_HINT =
  /\b(hotel|inn|suites|resort|hostel|motel|novotel|marriott|hilton|hyatt|sheraton|westin|holiday inn|hampton|embassy|wyndham|best western|radisson|omni|conrad|doubletree|four seasons|ritz|westgate|sofitel|pullman|mercure|intercontinental|kimpton|aloft|fairfield|comfort inn|courtyard|residence inn|hyatt place|hyatt house)\b/i;

/**
 * Label for UI. Uses persisted `spotlightCategory` when present; otherwise best-effort inference.
 */
export function inferSpotlightCategory(s: PlaceSpotlight): SpotlightVenueKind {
  if (s.spotlightCategory) return s.spotlightCategory;

  const sq = (s.sourceQuery ?? "").toLowerCase();
  const name = (s.name ?? "").toLowerCase();
  const url = (s.mapsUrl ?? "").toLowerCase();
  const price = (s.priceRange ?? "").trim();

  if (/viator|getyourguide|airbnb\.com\/experiences|fareharbor|peek\.com|musement|klook|headout|expedia\.com\/things/i.test(url)) {
    return "experience";
  }
  if (/\b(tour|tours|snorkel|kayak|excursion|museum|zoo|aquarium|show|concert|attraction|experience)\b/.test(sq)) {
    return "experience";
  }

  if (/\b(hotel|inn|suites|resort|hostel|motel|lodging|accommodation)\b/.test(sq)) return "hotel";
  /** Name-only: chains and lodging keywords (maps titles often omit category in sourceQuery). */
  if (HOTEL_NAME_HINT.test(name)) return "hotel";
  if (/per night|\$\s*\d+\s*\/\s*night/i.test(price)) return "hotel";
  if (/^\s*\$\s*[1-9]\d{2,3}\s*$/.test(price)) return "hotel";

  if (/\b(brunch|lunch|dinner|breakfast|restaurant|cafe|coffee|bar|grill|kitchen|eatery|diner|meal|eat|food)\b/.test(sq)) {
    return "restaurant";
  }
  if (/\$\d+\s*[–-]\s*\$\d+/.test(price)) return "restaurant";

  /** Common dining venue words in business titles (Google Maps names). */
  if (
    /\b(restaurant|café|cafe|kitchen|grill|diner|brewery|brewpub|bistro|bar & grill|steakhouse|pizzeria|bakery|deli)\b/i.test(
      name
    )
  ) {
    return "restaurant";
  }

  return "restaurant";
}

export function spotlightCategoryLabel(k: SpotlightVenueKind): string {
  switch (k) {
    case "hotel":
      return "Hotel";
    case "experience":
      return "Experience";
    default:
      return "Restaurant";
  }
}

/** Tailwind classes for the venue-kind pill in picked-place cards. */
export function spotlightCategoryBadgeClass(kind: SpotlightVenueKind): string {
  switch (kind) {
    case "hotel":
      return "bg-violet-100 text-violet-900 ring-violet-400/35 dark:bg-violet-950/55 dark:text-violet-200 dark:ring-violet-500/30";
    case "experience":
      return "bg-teal-100 text-teal-900 ring-teal-400/35 dark:bg-teal-950/50 dark:text-teal-200 dark:ring-teal-500/25";
    default:
      return "bg-amber-100 text-amber-950 ring-amber-400/35 dark:bg-amber-950/45 dark:text-amber-200 dark:ring-amber-500/25";
  }
}
