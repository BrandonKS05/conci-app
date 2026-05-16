import type { MockHotelBrowseResult } from "@/shared/mock-hotel-search";

/** Response from GET /api/trip-plans/[id]/lodging/search */
export type LodgingSearchApiResponse = {
  hotels: MockHotelBrowseResult[];
  meta?: {
    destinationQuery: string;
    destId: string | null;
    rawHotelCount: number;
    mappedHotelCount: number;
  };
  error?: string;
  detail?: string;
};
