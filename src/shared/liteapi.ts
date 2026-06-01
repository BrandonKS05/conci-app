/**
 * LiteAPI (Nuitée) types — safe for both server and client imports.
 * https://docs.liteapi.travel
 */

export type LiteApiHotelPhoto = {
  url: string;
};

export type LiteApiHotelAddress = {
  country: string;
  countryCode: string;
  state: string | null;
  city: string;
  street: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type LiteApiCancellationPolicy = {
  cancelByDate: string | null; // ISO datetime
  refundable: boolean;
  description: string | null;
};

export type LiteApiRoom = {
  name: string;
  description: string | null;
  maxOccupancy: number | null;
  bedTypes: string | null;
};

export type LiteApiRate = {
  rateId: string;
  name: string;
  boardType: string | null;
  retailRate: {
    total: Array<{ amount: number; currency: string }>;
    baseRate: Array<{ amount: number; currency: string }> | null;
    taxes: Array<{ amount: number; currency: string }> | null;
  };
  cancellationPolicies: LiteApiCancellationPolicy[];
  rooms: LiteApiRoom[];
};

export type LiteApiHotelResult = {
  hotelId: string;
  name: string;
  rating: number | null;
  reviewScore: number | null;
  reviewCount: number | null;
  address: LiteApiHotelAddress;
  photos: LiteApiHotelPhoto[];
  description: string | null;
  amenities: string[];
  checkInTime: string | null;
  checkOutTime: string | null;
  cheapestRate: LiteApiRate | null;
  rates: LiteApiRate[];
};

export type LiteApiPrebookResult = {
  prebookId: string;
  hotelId: string;
  rateId: string;
  price: number;
  currency: string;
  cancellationPolicies: LiteApiCancellationPolicy[];
  priceChanged: boolean;
  cancellationChanged: boolean;
};

export type LiteApiBookingGuest = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
};

export type LiteApiBookingRecord = {
  provider: "liteapi";
  bookingId: string;
  clientReference: string;
  status: "CONFIRMED" | "PENDING" | "CANCELLED" | "FAILED";
  hotelId: string;
  hotelName: string;
  rateId: string;
  prebookId: string;
  totalAmount: number;
  currency: string;
  checkInDate: string;
  checkOutDate: string;
  bookedAt: string;
  cancellationPolicies: LiteApiCancellationPolicy[];
  leadGuest: LiteApiBookingGuest;
};

// ─── Conci API response shapes ─────────────────────────────────────────────

export type LiteApiSearchApiResponse = {
  results: LiteApiHotelResult[];
  isMock: boolean;
  error?: string;
};

export type LiteApiPrebookApiResponse = {
  prebook: LiteApiPrebookResult | null;
  isMock: boolean;
  error?: string;
};

export type LiteApiBookApiResponse = {
  booking: LiteApiBookingRecord | null;
  error?: string;
};
