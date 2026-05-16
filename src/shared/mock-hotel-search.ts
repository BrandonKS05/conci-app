import type { PlaceSpotlight } from "@/shared/place-preview";

export type MockHotelSearchInput = {
  destination: string;
  checkInIso: string;
  checkOutIso: string;
  guests: number;
  rooms: number;
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
};

const SKELETONS: Omit<MockHotelResult, "id" | "name" | "addressLine">[] = [
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
  {
    neighborhood: "Central station",
    rating: 4.3,
    description: "Practical pick for train arrivals; soundproofed windows and 24h desk.",
    priceEstimatePerNight: "~$132 / night",
    gradientFrom: "#1e3a8a",
    gradientTo: "#172554",
  },
  {
    neighborhood: "Garden side",
    rating: 4.6,
    description: "Courtyard seating, family-sized rooms, breakfast included in many rates.",
    priceEstimatePerNight: "~$174 / night",
    gradientFrom: "#166534",
    gradientTo: "#14532d",
  },
];

/** Local mock provider — swap for real search later without changing the modal UI. */
export async function mockHotelSearch(input: MockHotelSearchInput): Promise<MockHotelResult[]> {
  await new Promise((r) => setTimeout(r, 420));
  const city = input.destination.trim() || "City center";
  const seed =
    (input.checkInIso + input.checkOutIso + input.guests + input.rooms).split("").reduce((a, c) => a + c.charCodeAt(0), 0) %
    1000;

  return SKELETONS.map((s, i) => {
    const n = `${["The", "Hotel", "Studio", "Inn"][i % 4]!} ${["North", "South", "East", "West"][Math.floor(i / 2) % 4]!} ${city.split(/\s+/)[0] ?? city}`;
    const streetNum = 120 + ((seed + i * 17) % 80);
    const street = ["Harbor", "Maple", "Station", "Garden", "River"][i % 5]!;
    return {
      id: `mock-${seed}-${i}`,
      name: `${n}`,
      neighborhood: s.neighborhood,
      addressLine: `${streetNum} ${street} St, ${city}`,
      rating: Math.min(5, s.rating + ((seed + i) % 3) * 0.05),
      description: s.description,
      priceEstimatePerNight: s.priceEstimatePerNight,
      gradientFrom: s.gradientFrom,
      gradientTo: s.gradientTo,
    };
  });
}

export function mockHotelResultToPlace(r: MockHotelResult, destinationCity: string): PlaceSpotlight {
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
