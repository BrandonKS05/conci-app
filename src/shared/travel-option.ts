import type { MockHotelBrowseResult } from "@/shared/mock-hotel-search";

export type TravelOptionKind = "lodging" | "flight" | "restaurant" | "experience" | "transport";
export type TravelOptionProvider =
  | "liteapi"
  | "duffel"
  | "rapidapi"
  | "google_places"
  | "serpapi"
  | "viator"
  | "getyourguide"
  | "opentable"
  | "manual";

export type TravelOptionBookingType = "in_app" | "deep_link" | "discovery" | "manual" | "disabled";

export type TravelOption = {
  id: string;
  kind: TravelOptionKind;
  label: string;
  subtitle?: string;
  provider: TravelOptionProvider;
  source?: string;
  providerIds?: {
    hotelId?: string;
    rateId?: string;
    offerId?: string;
    placeId?: string;
    reservationId?: string;
  };
  booking: {
    type: TravelOptionBookingType;
    url?: string | null;
    enabled: boolean;
    reason?: string;
  };
  price?: {
    amount: number;
    currency: string;
    display: string;
    basis?: "nightly" | "total" | "per_person" | "unknown";
  };
  rating?: number;
  imageUrl?: string | null;
  address?: string;
  tags?: string[];
  rawProviderResultId?: string;
};

export function travelOptionFromLodgingBrowse(
  hotel: MockHotelBrowseResult,
  source?: string
): TravelOption {
  const provider = hotel.provider ?? "manual";
  const canLiteApiBook = provider === "liteapi" && Boolean(hotel.providerHotelId && hotel.providerRateId);
  const hasDeepLink = Boolean(hotel.bookingUrl);
  const booking =
    canLiteApiBook
      ? { type: "in_app" as const, enabled: true, url: hotel.bookingUrl ?? null }
      : hasDeepLink
        ? { type: "deep_link" as const, enabled: true, url: hotel.bookingUrl }
        : provider === "duffel"
          ? { type: "disabled" as const, enabled: false, reason: "Duffel Stays checkout is deferred." }
        : { type: "disabled" as const, enabled: false, reason: "No provider-bookable rate is attached." };

  return {
    id: `${provider}:lodging:${hotel.id}`,
    kind: "lodging",
    label: hotel.name,
    subtitle: [hotel.neighborhood, hotel.addressLine].filter(Boolean).join(" · "),
    provider,
    ...(source ? { source } : {}),
    providerIds: {
      ...(hotel.providerHotelId ? { hotelId: hotel.providerHotelId } : {}),
      ...(hotel.providerRateId ? { rateId: hotel.providerRateId } : {}),
    },
    booking,
    price: {
      amount: hotel.totalUsd,
      currency: "USD",
      display: `$${hotel.totalUsd} total`,
      basis: "total",
    },
    rating: hotel.reviewScore || hotel.rating,
    imageUrl: hotel.imageUrl,
    address: hotel.addressLine,
    tags: hotel.vibeTags,
    rawProviderResultId: hotel.id,
  };
}
