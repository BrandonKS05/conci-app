import type { HotelPick } from "@/shared/hotels";

export type MockHotel = HotelPick;

/** Placeholder “AI picks” until a real search API exists. */
export function getMockHotelsForTrip(location: string | null, budgetTier: string | null): MockHotel[] {
  const place = location?.trim() || "your destination";
  const budget = budgetTier?.toLowerCase().includes("lux") ? "upscale" : "great value";
  return [
    {
      id: "mh_1",
      name: `${place.split(",")[0]?.trim() || "Harbor"} Inn & Suites`,
      area: "Near the main strip",
      priceHint: budget === "upscale" ? "~$240/night · pool" : "~$165/night · free cancel",
    },
    {
      id: "mh_2",
      name: "District House",
      area: "Walkable to dining",
      priceHint: "~$198/night · breakfast included",
    },
    {
      id: "mh_3",
      name: "Garden Court",
      area: "Quieter block",
      priceHint: "~$142/night · kitchenette",
    },
  ];
}
