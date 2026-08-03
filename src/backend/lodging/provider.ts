import type { HostLodgingType } from "@/shared/trip-plan";
import type {
  MockHotelBrowseResult,
  MockHotelAmenityIcon,
  LodgingProviderName,
} from "@/shared/mock-hotel-search";

export type { LodgingProviderName };

/** Normalized search input every provider receives. */
export type LodgingSearchInput = {
  destination: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  guests: number;
  rooms: number;
  lodgingType: HostLodgingType;
  limit?: number;
};

/**
 * A bookable-hotel provider. Every implementation normalizes its native shape
 * into MockHotelBrowseResult so the calendar, itinerary, and TripCostRollup
 * stay provider-agnostic. Results carry a `provider` tag for debug/logging.
 */
export interface LodgingProvider {
  readonly name: LodgingProviderName;
  isConfigured(): boolean;
  searchHotels(input: LodgingSearchInput): Promise<MockHotelBrowseResult[]>;
}

// ─── Shared normalization helpers ────────────────────────────────────────────

export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = Date.parse(checkIn);
  const b = Date.parse(checkOut);
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 1;
  return Math.max(1, Math.round((b - a) / 86_400_000));
}

export function reviewLabelFor(score: number): string {
  if (score >= 9) return "Exceptional";
  if (score >= 8) return "Excellent";
  if (score >= 7) return "Very good";
  if (score >= 6) return "Good";
  if (score > 0) return "Pleasant";
  return "No reviews yet";
}

const AMENITY_ICONS: { match: RegExp; icon: MockHotelAmenityIcon; label: string }[] = [
  { match: /pool/i, icon: "pool", label: "Pool" },
  { match: /spa|hot ?tub|jacuzzi/i, icon: "hot_tub", label: "Spa" },
  { match: /wifi|wi-fi|internet/i, icon: "wifi", label: "Wi-Fi" },
  { match: /gym|fitness/i, icon: "gym", label: "Gym" },
  { match: /breakfast|kitchen/i, icon: "breakfast", label: "Breakfast" },
  { match: /shuttle|parking|airport/i, icon: "shuttle", label: "Shuttle" },
];

export function mapAmenities(raw: string[]): { icon: MockHotelAmenityIcon; label: string }[] {
  const seen = new Set<MockHotelAmenityIcon>();
  const out: { icon: MockHotelAmenityIcon; label: string }[] = [];
  for (const a of raw) {
    for (const m of AMENITY_ICONS) {
      if (m.match.test(a) && !seen.has(m.icon)) {
        seen.add(m.icon);
        out.push({ icon: m.icon, label: m.label });
      }
    }
  }
  return out.slice(0, 6);
}

/** Deterministic gradient so cards without a photo still look intentional. */
export function gradientFor(seed: string): { from: string; to: string } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return { from: `hsl(${hue}, 45%, 88%)`, to: `hsl(${(hue + 40) % 360}, 40%, 78%)` };
}
