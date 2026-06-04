import { searchLiteApiHotels, isLiteApiConfigured } from "@/backend/liteapi";
import type { LiteApiHotelResult } from "@/shared/liteapi";
import type { MockHotelBrowseResult } from "@/shared/mock-hotel-search";
import {
  type LodgingProvider,
  type LodgingSearchInput,
  nightsBetween,
  reviewLabelFor,
  mapAmenities,
  gradientFor,
} from "@/backend/lodging/provider";

function toBrowseResult(h: LiteApiHotelResult, nights: number): MockHotelBrowseResult | null {
  const rate = h.cheapestRate;
  const total = rate?.retailRate.total[0]?.amount ?? 0;
  if (!rate || total <= 0) return null; // no bookable price → not a usable result

  const nightly = Math.round(total / nights);
  const score = h.reviewScore ?? 0;
  const grad = gradientFor(h.hotelId);

  return {
    id: `liteapi:${h.hotelId}`,
    name: h.name,
    neighborhood: h.address.city || h.address.country || "",
    addressLine: [h.address.street, h.address.city, h.address.country].filter(Boolean).join(", "),
    rating: h.rating ?? 0,
    description: h.description ?? "",
    priceEstimatePerNight: `$${nightly}`,
    gradientFrom: grad.from,
    gradientTo: grad.to,
    lodgingType: "hotel",
    imageUrl: h.photos[0]?.url ?? null,
    distanceLabel: "",
    amenities: mapAmenities(h.amenities),
    reserveNowPayLater: rate.cancellationPolicies.some((p) => p.refundable),
    nightlyUsd: nightly,
    totalUsd: Math.round(total),
    reviewScore: score,
    reviewLabel: reviewLabelFor(score),
    reviewCount: h.reviewCount ?? 0,
    propertyKind: "hotel",
    provider: "liteapi",
    providerHotelId: h.hotelId,
    providerRateId: rate.rateId,
  };
}

export const liteApiProvider: LodgingProvider = {
  name: "liteapi",
  isConfigured: isLiteApiConfigured,
  async searchHotels(input: LodgingSearchInput): Promise<MockHotelBrowseResult[]> {
    const nights = nightsBetween(input.checkIn, input.checkOut);
    const hotels = await searchLiteApiHotels({
      destination: input.destination,
      checkInDate: input.checkIn,
      checkOutDate: input.checkOut,
      adults: input.guests,
      limit: input.limit ?? 25,
    });
    return hotels
      .map((h) => toBrowseResult(h, nights))
      .filter((r): r is MockHotelBrowseResult => r !== null);
  },
};
