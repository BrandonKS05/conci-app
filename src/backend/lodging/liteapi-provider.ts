import { searchLiteApiHotels, aiSearchLiteApiHotels, isLiteApiConfigured } from "@/backend/liteapi";
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

function inferLiteApiPropertyKind(h: LiteApiHotelResult): { propertyKind: "hotel" | "home"; lodgingType: MockHotelBrowseResult["lodgingType"] } {
  const text = [h.propertyType, h.name, h.description, ...(h.vibeTags ?? [])].filter(Boolean).join(" ").toLowerCase();
  if (/\b(villa|house|home|apartment|condo|residence|residential|aparthotel|serviced apartment|suite apartment|townhouse|guesthouse)\b/.test(text)) {
    return { propertyKind: "home", lodgingType: /\bvilla\b/.test(text) ? "villa" : "airbnb" };
  }
  if (/\b(resort)\b/.test(text)) {
    return { propertyKind: "hotel", lodgingType: "resort" };
  }
  if (/\b(hostel)\b/.test(text)) {
    return { propertyKind: "hotel", lodgingType: "hostel" };
  }
  return { propertyKind: "hotel", lodgingType: "hotel" };
}

function toBrowseResult(h: LiteApiHotelResult, nights: number): MockHotelBrowseResult | null {
  const rate = h.cheapestRate;
  const total = rate?.retailRate.total[0]?.amount ?? 0;
  if (!rate || total <= 0) return null; // no bookable price → not a usable result

  const nightly = Math.round(total / nights);
  const score = h.reviewScore ?? 0;
  const grad = gradientFor(h.hotelId);
  const kind = inferLiteApiPropertyKind(h);

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
    lodgingType: kind.lodgingType,
    imageUrl: h.photos[0]?.url ?? null,
    distanceLabel: "",
    amenities: mapAmenities(h.amenities),
    reserveNowPayLater: rate.cancellationPolicies.some((p) => p.refundable),
    nightlyUsd: nightly,
    totalUsd: Math.round(total),
    reviewScore: score,
    reviewLabel: reviewLabelFor(score),
    reviewCount: h.reviewCount ?? 0,
    propertyKind: kind.propertyKind,
    provider: "liteapi",
    providerHotelId: h.hotelId,
    providerRateId: rate.rateId,
    ...(h.address.latitude != null ? { latitude: h.address.latitude } : {}),
    ...(h.address.longitude != null ? { longitude: h.address.longitude } : {}),
    ...(h.vibeTags?.length ? { vibeTags: h.vibeTags } : {}),
    ...(h.vibeText ? { vibeText: h.vibeText } : {}),
  };
}

/**
 * Vibe/natural-language search via LiteAPI aiSearch. Returns AI-ranked results
 * (order preserved) normalized into MockHotelBrowseResult with vibe metadata.
 */
export async function liteApiAiSearch(
  aiQuery: string,
  input: LodgingSearchInput
): Promise<MockHotelBrowseResult[]> {
  const nights = nightsBetween(input.checkIn, input.checkOut);
  const hotels = await aiSearchLiteApiHotels({
    aiSearch: aiQuery,
    checkInDate: input.checkIn,
    checkOutDate: input.checkOut,
    adults: input.guests,
    limit: input.limit ?? 20,
  });
  return hotels
    .map((h) => toBrowseResult(h, nights))
    .filter((r): r is MockHotelBrowseResult => r !== null);
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
