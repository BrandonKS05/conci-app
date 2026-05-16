import type { PlaceSpotlight } from "@/shared/place-preview";
import type { HostLodgingType } from "@/shared/trip-plan";

export type MockHotelSearchInput = {
  destination: string;
  checkInIso: string;
  checkOutIso: string;
  guests: number;
  rooms: number;
  lodgingType: HostLodgingType;
};

export type MockHotelResult = {
  id: string;
  name: string;
  neighborhood: string;
  addressLine: string;
  rating: number;
  description: string;
  priceEstimatePerNight: string;
  gradientFrom: string;
  gradientTo: string;
  lodgingType: HostLodgingType;
};

const HOTEL_SKELETONS: Omit<MockHotelResult, "id" | "name" | "addressLine" | "lodgingType">[] = [
  {
    neighborhood: "Waterfront",
    rating: 4.7,
    description: "Floor-to-ceiling windows, quiet rooms, walkable to ferries and dinner spots.",
    priceEstimatePerNight: "~$189 / night",
    gradientFrom: "#0f766e",
    gradientTo: "#134e4a",
  },
  {
    neighborhood: "Arts district",
    rating: 4.5,
    description: "Boutique lobby, espresso bar, small fitness studio — great for long stays.",
    priceEstimatePerNight: "~$156 / night",
    gradientFrom: "#4c1d95",
    gradientTo: "#312e81",
  },
  {
    neighborhood: "Old quarter",
    rating: 4.8,
    description: "Historic façade with modern rooms; cobblestone cafes two blocks away.",
    priceEstimatePerNight: "From $212",
    gradientFrom: "#9a3412",
    gradientTo: "#78350f",
  },
];

const AIRBNB_SKELETONS: Omit<MockHotelResult, "id" | "name" | "addressLine" | "lodgingType">[] = [
  {
    neighborhood: "Residential core",
    rating: 4.9,
    description: "Bright 2BR with kitchen, washer/dryer, and a small balcony — ideal for groups.",
    priceEstimatePerNight: "~$142 / night",
    gradientFrom: "#ff385c",
    gradientTo: "#e11d48",
  },
  {
    neighborhood: "Walkable downtown",
    rating: 4.7,
    description: "Entire loft, fast Wi‑Fi, dedicated workspace, self check-in lockbox.",
    priceEstimatePerNight: "~$118 / night",
    gradientFrom: "#c2410c",
    gradientTo: "#9a3412",
  },
  {
    neighborhood: "Quiet block",
    rating: 4.6,
    description: "Cozy 1BR guest suite with street parking and a shared patio.",
    priceEstimatePerNight: "~$96 / night",
    gradientFrom: "#be185d",
    gradientTo: "#831843",
  },
];

/** Local mock provider — swap for real search later without changing the modal UI. */
export async function mockHotelSearch(input: MockHotelSearchInput): Promise<MockHotelResult[]> {
  await new Promise((r) => setTimeout(r, 420));
  const city = input.destination.trim() || "City center";
  const seed =
    (input.checkInIso + input.checkOutIso + input.guests + input.rooms + input.lodgingType)
      .split("")
      .reduce((a, c) => a + c.charCodeAt(0), 0) % 1000;

  const skeletons = input.lodgingType === "airbnb" ? AIRBNB_SKELETONS : HOTEL_SKELETONS;
  const namePrefixes =
    input.lodgingType === "airbnb"
      ? ["Sunny", "Cozy", "Modern", "Garden"]
      : ["The", "Hotel", "Studio", "Inn"];
  const nameSuffixes =
    input.lodgingType === "airbnb"
      ? ["Flat", "Loft", "Suite", "Townhouse"]
      : ["North", "South", "East", "West"];

  return skeletons.map((s, i) => {
    const n = `${namePrefixes[i % namePrefixes.length]!} ${nameSuffixes[Math.floor(i / 2) % nameSuffixes.length]!} · ${city.split(/\s+/)[0] ?? city}`;
    const streetNum = 120 + ((seed + i * 17) % 80);
    const street = ["Harbor", "Maple", "Station", "Garden", "River"][i % 5]!;
    return {
      id: `mock-${input.lodgingType}-${seed}-${i}`,
      name: n,
      neighborhood: s.neighborhood,
      addressLine: `${streetNum} ${street} St, ${city}`,
      rating: Math.min(5, s.rating + ((seed + i) % 3) * 0.05),
      description: s.description,
      priceEstimatePerNight: s.priceEstimatePerNight,
      gradientFrom: s.gradientFrom,
      gradientTo: s.gradientTo,
      lodgingType: input.lodgingType,
    };
  });
}

export function mockHotelResultToPlace(
  r: MockHotelResult,
  destinationCity: string
): PlaceSpotlight {
  const q = `${r.name} ${r.addressLine}`;
  return {
    name: r.name,
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`,
    rating: r.rating,
    address: r.addressLine,
    priceRange: r.priceEstimatePerNight,
    photoUrl: null,
    spotlightCategory: "hotel",
    sourceQuery: destinationCity.trim() || r.neighborhood,
  };
}
