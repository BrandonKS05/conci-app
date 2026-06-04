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

export type MockHotelAmenityIcon = "pool" | "hot_tub" | "wifi" | "gym" | "breakfast" | "shuttle";

/** Which integration returned a lodging result. Used for routing, booking, and debug logging. */
export type LodgingProviderName = "liteapi" | "duffel" | "rapidapi";

export type MockHotelBrowseResult = MockHotelResult & {
  imageUrl: string | null;
  distanceLabel: string;
  amenities: { icon: MockHotelAmenityIcon; label: string }[];
  dealHighlight?: string;
  reserveNowPayLater: boolean;
  nightlyUsd: number;
  totalUsd: number;
  reviewScore: number;
  reviewLabel: string;
  reviewCount: number;
  isAd?: boolean;
  vipAccess?: boolean;
  urgencyText?: string;
  propertyKind: "hotel" | "home";
  bookingUrl?: string;
  /** Provider that produced this result (omitted on legacy/mock rows). */
  provider?: LodgingProviderName;
  /** Provider-native hotel id — needed to fetch details or prebook. */
  providerHotelId?: string;
  /** Provider-native cheapest-rate id — the offer a future checkout page prebooks. */
  providerRateId?: string;
  /** Coordinates when the provider supplies them (used for centrality scoring). */
  latitude?: number;
  longitude?: number;
  /** Vibe descriptors from LiteAPI aiSearch (tags like "central location", "boutique hotel"). */
  vibeTags?: string[];
  /** Joined persona/style/story text from aiSearch, for semantic intent matching. */
  vibeText?: string;
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

const BROWSE_HOTEL_PHOTOS = [
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=440&h=320&fit=crop",
  "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=440&h=320&fit=crop",
  "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=440&h=320&fit=crop",
  "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=440&h=320&fit=crop",
  "https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=440&h=320&fit=crop",
  "https://images.unsplash.com/photo-1551882547-ff40ed63d685?w=440&h=320&fit=crop",
  "https://images.unsplash.com/photo-1542314831-068cd1dbcd55?w=440&h=320&fit=crop",
  "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=440&h=320&fit=crop",
];

const BROWSE_HOTEL_TEMPLATES: Omit<
  MockHotelBrowseResult,
  "id" | "name" | "addressLine" | "lodgingType" | "imageUrl" | "nightlyUsd" | "totalUsd"
>[] = [
  {
    neighborhood: "Airport",
    rating: 4.4,
    description:
      "Sound-insulated rooms, 24-hour fitness center, and a complimentary airport shuttle on a fixed schedule.",
    priceEstimatePerNight: "~$184 / night",
    gradientFrom: "#0f766e",
    gradientTo: "#134e4a",
    distanceLabel: "1.69 mi from Los Angeles Intl. (LAX)",
    amenities: [
      { icon: "pool", label: "Pool" },
      { icon: "hot_tub", label: "Hot tub" },
    ],
    dealHighlight: "Stay for Breakfast + Free LAX Shuttle",
    reserveNowPayLater: true,
    reviewScore: 8.8,
    reviewLabel: "Excellent",
    reviewCount: 4446,
    vipAccess: true,
    isAd: true,
    urgencyText: "We have 6 left at this price",
    propertyKind: "hotel",
  },
  {
    neighborhood: "Downtown",
    rating: 4.2,
    description: "Rooftop lounge, coworking nook, and walkable to museums, stadiums, and the metro.",
    priceEstimatePerNight: "~$156 / night",
    gradientFrom: "#1e3a8a",
    gradientTo: "#312e81",
    distanceLabel: "0.4 mi from downtown core",
    amenities: [
      { icon: "wifi", label: "Free WiFi" },
      { icon: "gym", label: "Gym" },
    ],
    dealHighlight: "Member Price — 15% off",
    reserveNowPayLater: true,
    reviewScore: 8.4,
    reviewLabel: "Very good",
    reviewCount: 2187,
    propertyKind: "hotel",
  },
  {
    neighborhood: "Waterfront",
    rating: 4.7,
    description: "Floor-to-ceiling windows, quiet rooms, walkable to ferries and dinner spots.",
    priceEstimatePerNight: "~$212 / night",
    gradientFrom: "#0f766e",
    gradientTo: "#134e4a",
    distanceLabel: "2.1 mi from convention center",
    amenities: [
      { icon: "pool", label: "Pool" },
      { icon: "breakfast", label: "Breakfast" },
    ],
    dealHighlight: "Breakfast included",
    reserveNowPayLater: false,
    reviewScore: 9.1,
    reviewLabel: "Wonderful",
    reviewCount: 1203,
    isAd: true,
    propertyKind: "hotel",
  },
  {
    neighborhood: "Arts district",
    rating: 4.5,
    description: "Boutique lobby, espresso bar, small fitness studio — great for long stays.",
    priceEstimatePerNight: "~$142 / night",
    gradientFrom: "#4c1d95",
    gradientTo: "#312e81",
    distanceLabel: "0.8 mi from arts district",
    amenities: [
      { icon: "wifi", label: "Free WiFi" },
      { icon: "gym", label: "Gym" },
    ],
    reserveNowPayLater: true,
    reviewScore: 8.6,
    reviewLabel: "Excellent",
    reviewCount: 892,
    propertyKind: "hotel",
  },
  {
    neighborhood: "Residential",
    rating: 4.9,
    description: "Bright 2BR with kitchen, washer/dryer, and a small balcony — ideal for groups.",
    priceEstimatePerNight: "~$118 / night",
    gradientFrom: "#ff385c",
    gradientTo: "#e11d48",
    distanceLabel: "1.2 mi from city center",
    amenities: [
      { icon: "wifi", label: "Free WiFi" },
      { icon: "breakfast", label: "Kitchen" },
    ],
    dealHighlight: "Entire home · Self check-in",
    reserveNowPayLater: true,
    reviewScore: 9.4,
    reviewLabel: "Exceptional",
    reviewCount: 341,
    propertyKind: "home",
  },
  {
    neighborhood: "Old quarter",
    rating: 4.8,
    description: "Historic façade with modern rooms; cobblestone cafes two blocks away.",
    priceEstimatePerNight: "~$198 / night",
    gradientFrom: "#9a3412",
    gradientTo: "#78350f",
    distanceLabel: "0.2 mi from old town square",
    amenities: [
      { icon: "breakfast", label: "Breakfast" },
      { icon: "shuttle", label: "Shuttle" },
    ],
    dealHighlight: "Airport shuttle included",
    reserveNowPayLater: true,
    reviewScore: 8.9,
    reviewLabel: "Excellent",
    reviewCount: 1567,
    vipAccess: true,
    propertyKind: "hotel",
  },
];

/** Richer mock results for the dedicated lodging browse page (swap for real search later). */
export async function mockHotelSearchBrowse(input: MockHotelSearchInput): Promise<MockHotelBrowseResult[]> {
  const base = await mockHotelSearch(input);
  const nights = Math.max(
    1,
    Math.round(
      (new Date(`${input.checkOutIso}T12:00:00`).getTime() - new Date(`${input.checkInIso}T12:00:00`).getTime()) /
        86400000
    )
  );
  const cityToken = (input.destination.trim() || "City center").split(/\s+/)[0] ?? "City";

  const hotelNames = [
    `The Westin ${cityToken} Airport`,
    `Hilton ${cityToken} Downtown`,
    `Marriott ${cityToken} Convention Center`,
    `Hyatt Regency ${cityToken}`,
    `Courtyard by Marriott ${cityToken}`,
    `Holiday Inn Express ${cityToken}`,
    `Sunny ${cityToken} Loft`,
    `Garden ${cityToken} Townhouse`,
  ];

  const merged: MockHotelBrowseResult[] = [];
  for (let i = 0; i < 8; i++) {
    const tpl = BROWSE_HOTEL_TEMPLATES[i % BROWSE_HOTEL_TEMPLATES.length]!;
    const b = base[i % base.length]!;
    const nightly = 96 + ((i * 37 + input.guests * 11) % 140);
    const total = nightly * nights * input.rooms;
    const kind = i >= 6 ? "home" : "hotel";
    const lodgingType: HostLodgingType = kind === "home" ? "airbnb" : input.lodgingType === "airbnb" ? "airbnb" : "hotel";
    merged.push({
      ...tpl,
      ...b,
      id: `browse-${input.lodgingType}-${i}-${input.checkInIso}`,
      name: hotelNames[i] ?? b.name,
      lodgingType,
      propertyKind: kind,
      imageUrl: BROWSE_HOTEL_PHOTOS[i % BROWSE_HOTEL_PHOTOS.length]!,
      nightlyUsd: nightly,
      totalUsd: total,
      priceEstimatePerNight: `~$${nightly} nightly`,
    });
  }
  return merged;
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
