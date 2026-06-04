import { searchHotelsForLodging } from "@/backend/rapidapi-hotels";
import { isRapidApiHotelsConfigured } from "@/backend/rapidapi-key";
import { mapBookingRowToLodgingBrowse } from "@/backend/lodging-hotel-browse-map";
import type { MockHotelBrowseResult } from "@/shared/mock-hotel-search";
import { type LodgingProvider, type LodgingSearchInput } from "@/backend/lodging/provider";

/** Legacy provider — kept as a last-resort fallback behind LiteAPI and Duffel. */
export const rapidApiProvider: LodgingProvider = {
  name: "rapidapi",
  isConfigured: isRapidApiHotelsConfigured,
  async searchHotels(input: LodgingSearchInput): Promise<MockHotelBrowseResult[]> {
    const { rows, destinationQuery } = await searchHotelsForLodging(
      {
        destination: input.destination,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        adults: input.guests,
        rooms: input.rooms,
      },
      { limit: input.limit ?? 25 }
    );

    return rows
      .map((row, index) =>
        mapBookingRowToLodgingBrowse(row, {
          cityLabel: destinationQuery,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          adults: input.guests,
          lodgingType: input.lodgingType,
          index,
        })
      )
      .filter((h): h is MockHotelBrowseResult => h != null)
      .map((h) => ({ ...h, provider: "rapidapi" as const }));
  },
};
