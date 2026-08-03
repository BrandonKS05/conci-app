import type { MockHotelBrowseResult, LodgingProviderName } from "@/shared/mock-hotel-search";

/** Response from GET /api/trip-plans/[id]/lodging/search */
export type LodgingSearchApiResponse = {
  hotels: MockHotelBrowseResult[];
  meta?: {
    destinationQuery: string;
    destId: string | null;
    rawHotelCount: number;
    mappedHotelCount: number;
    /** Which provider served these results (debug/logging). */
    provider?: LodgingProviderName | null;
  };
  error?: string;
  detail?: string;
};
