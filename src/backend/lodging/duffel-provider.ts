import { searchDuffelStays, isDuffelConfigured } from "@/backend/duffel/stays";
import type { DuffelStayResult } from "@/shared/duffel-stays";
import type { MockHotelBrowseResult } from "@/shared/mock-hotel-search";
import {
  type LodgingProvider,
  type LodgingSearchInput,
  nightsBetween,
  reviewLabelFor,
  mapAmenities,
  gradientFor,
} from "@/backend/lodging/provider";

/** Duffel amenity entries vary in shape — pull whatever human label exists. */
function amenityLabel(a: unknown): string {
  const o = (a ?? {}) as Record<string, unknown>;
  const v = o.description ?? o.name ?? o.type ?? a;
  return typeof v === "string" ? v : "";
}

function toBrowseResult(r: DuffelStayResult, nights: number): MockHotelBrowseResult | null {
  const total = Number(r.cheapest_rate_total_amount);
  if (!Number.isFinite(total) || total <= 0) return null;

  const acc = r.accommodation;
  const nightly = Math.round(total / nights);
  const ratingValue = acc.rating ? Number(acc.rating.value) : 0;
  // Duffel star rating (0–5) → review score scale (0–10) for label parity.
  const score = ratingValue > 0 ? Math.min(10, ratingValue * 2) : 0;
  const grad = gradientFor(acc.id);
  const cheapestRate = r.rates[0] ?? null;
  const photoUrl =
    Array.isArray(acc.photos) && acc.photos.length > 0
      ? ((acc.photos[0] as unknown as { url?: string }).url ?? null)
      : null;

  return {
    id: `duffel:${r.id}`,
    name: acc.name,
    neighborhood: acc.location.address.city_name || "",
    addressLine: [acc.location.address.line_one, acc.location.address.city_name].filter(Boolean).join(", "),
    rating: ratingValue,
    description: acc.description?.text ?? "",
    priceEstimatePerNight: `$${nightly}`,
    gradientFrom: grad.from,
    gradientTo: grad.to,
    lodgingType: "hotel",
    imageUrl: photoUrl,
    distanceLabel: "",
    amenities: mapAmenities((acc.amenities ?? []).map(amenityLabel).filter(Boolean)),
    reserveNowPayLater: cheapestRate ? !cheapestRate.payment_requirements.requires_instant_payment : false,
    nightlyUsd: nightly,
    totalUsd: Math.round(total),
    reviewScore: score,
    reviewLabel: reviewLabelFor(score),
    reviewCount: acc.rating?.count ?? 0,
    propertyKind: "hotel",
    provider: "duffel",
    providerHotelId: acc.id,
    providerRateId: cheapestRate?.id ?? r.id,
  };
}

export const duffelProvider: LodgingProvider = {
  name: "duffel",
  isConfigured: isDuffelConfigured,
  async searchHotels(input: LodgingSearchInput): Promise<MockHotelBrowseResult[]> {
    const nights = nightsBetween(input.checkIn, input.checkOut);
    const { results } = await searchDuffelStays({
      destination: input.destination,
      checkInDate: input.checkIn,
      checkOutDate: input.checkOut,
      guests: input.guests,
      rooms: input.rooms,
    });
    return results
      .map((r) => toBrowseResult(r, nights))
      .filter((r): r is MockHotelBrowseResult => r !== null)
      .slice(0, input.limit ?? 25);
  },
};
