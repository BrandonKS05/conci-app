/**
 * Mock Duffel Stays responses — used when DUFFEL_ACCESS_TOKEN is not configured.
 * All types mirror the real Duffel API shapes so the code path is identical.
 */
import type {
  DuffelStayResult,
  DuffelAccommodation,
  DuffelRate,
  DuffelBookingRecord,
  DuffelBookingGuestDetails,
} from "@/shared/duffel-stays";

const MOCK_PHOTOS = [
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=640&h=480&fit=crop",
  "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=640&h=480&fit=crop",
  "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=640&h=480&fit=crop",
  "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=640&h=480&fit=crop",
  "https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=640&h=480&fit=crop",
  "https://images.unsplash.com/photo-1551882547-ff40ed63d685?w=640&h=480&fit=crop",
];

const MOCK_AMENITIES = [
  [
    { type: "wifi", description: "Free WiFi" },
    { type: "pool", description: "Outdoor pool" },
    { type: "gym", description: "Fitness center" },
  ],
  [
    { type: "wifi", description: "Free WiFi" },
    { type: "breakfast", description: "Complimentary breakfast" },
    { type: "parking", description: "Free parking" },
  ],
  [
    { type: "wifi", description: "High-speed WiFi" },
    { type: "spa", description: "Spa & wellness center" },
    { type: "restaurant", description: "On-site restaurant" },
  ],
];

function makeMockRate(
  rateIdx: number,
  nightlyBase: number,
  nights: number,
  checkIn: string
): DuffelRate {
  const boardTypes: DuffelRate["board_type"][] = ["room_only", "breakfast", "room_only"];
  const boardType = boardTypes[rateIdx % boardTypes.length] ?? "room_only";
  const modifier = boardType === "breakfast" ? 1.12 : 1.0;
  const total = Math.round(nightlyBase * nights * modifier);

  const refundBefore = new Date(`${checkIn}T14:00:00Z`);
  refundBefore.setDate(refundBefore.getDate() - 3);

  return {
    id: `mock-rate-${rateIdx}-${nightlyBase}`,
    board_type: boardType,
    total_amount: String(total),
    total_currency: "USD",
    tax_amount: String(Math.round(total * 0.12)),
    tax_currency: "USD",
    rooms: [
      {
        beds: [{ count: 1, type: rateIdx % 2 === 0 ? "king" : "queen" }],
        name: rateIdx % 2 === 0 ? "Deluxe King Room" : "Standard Queen Room",
      },
    ],
    cancellation_timeline: [
      {
        refund_amount: String(total),
        currency: "USD",
        before: refundBefore.toISOString(),
      },
    ],
    payment_requirements: {
      requires_instant_payment: false,
      payment_required_by: null,
      price_guarantee_expires_at: null,
    },
  };
}

function makeMockAccommodation(
  idx: number,
  city: string,
  lat: number,
  lng: number
): DuffelAccommodation {
  const names = [
    `The ${city.split(",")[0]?.trim() ?? city} Grand Hotel`,
    `${city.split(",")[0]?.trim() ?? city} Boutique & Spa`,
    `Residence Inn ${city.split(",")[0]?.trim() ?? city}`,
    `Park Hyatt ${city.split(",")[0]?.trim() ?? city}`,
    `The ${city.split(",")[0]?.trim() ?? city} Collection`,
    `${city.split(",")[0]?.trim() ?? city} Waterfront Hotel`,
  ];

  const descriptions = [
    "A landmark hotel with award-winning service, rooftop bar, and stunning city views.",
    "Intimate boutique property with curated design, a serene spa, and a celebrated kitchen.",
    "Extended-stay comfort with full kitchens, complimentary breakfast, and an evening social.",
    "Sleek luxury hotel with Michelin-starred dining, an infinity pool, and a world-class spa.",
    "Historic property reimagined with contemporary interiors, a vibrant lobby bar, and city-view suites.",
    "Waterfront hotel with panoramic harbor views, fresh seafood restaurant, and outdoor terraces.",
  ];

  const ratings = [4.2, 4.6, 4.0, 4.8, 4.5, 4.3];
  const ratingCounts = [3201, 892, 5614, 1203, 2087, 4412];

  const photoOffset = idx % MOCK_PHOTOS.length;

  return {
    id: `mock-acc-${idx}`,
    name: names[idx % names.length]!,
    rating: {
      value: String(ratings[idx % ratings.length]),
      count: ratingCounts[idx % ratingCounts.length]!,
    },
    location: {
      address: {
        city_name: city.split(",")[0]?.trim() ?? city,
        country_code: "US",
        line_one: `${100 + idx * 17} Main Street`,
      },
      geographic_coordinates: {
        latitude: lat + (idx - 2) * 0.003,
        longitude: lng + (idx - 2) * 0.003,
      },
    },
    photos: [
      { url: MOCK_PHOTOS[photoOffset]!, title: null },
      { url: MOCK_PHOTOS[(photoOffset + 1) % MOCK_PHOTOS.length]!, title: null },
    ],
    description: { text: descriptions[idx % descriptions.length]! },
    amenities: MOCK_AMENITIES[idx % MOCK_AMENITIES.length]!,
    check_in_information: {
      check_in_after_time: "15:00",
      check_out_before_time: "11:00",
    },
  };
}

export function mockSearchDuffelStays(params: {
  destination: string;
  checkInDate: string;
  checkOutDate: string;
  guests: number;
  rooms: number;
}): { results: DuffelStayResult[]; searchId: string } {
  const nights = Math.max(
    1,
    Math.round(
      (new Date(`${params.checkOutDate}T12:00:00`).getTime() -
        new Date(`${params.checkInDate}T12:00:00`).getTime()) /
        86400000
    )
  );

  const basePrices = [189, 142, 96, 312, 228, 165];
  const lat = 40.7128 + (params.destination.length % 5) * 0.4;
  const lng = -74.006 + (params.destination.length % 5) * 0.3;

  const results: DuffelStayResult[] = Array.from({ length: 6 }, (_, i) => {
    const nightly = basePrices[i % basePrices.length]! * params.rooms;
    const accommodation = makeMockAccommodation(i, params.destination, lat, lng);
    const cheapestTotal = Math.round(nightly * nights);
    const rates = [
      makeMockRate(i * 2, nightly, nights, params.checkInDate),
      makeMockRate(i * 2 + 1, nightly, nights, params.checkInDate),
    ];

    return {
      id: `mock-result-${i}`,
      accommodation,
      cheapest_rate_total_amount: String(cheapestTotal),
      cheapest_rate_currency: "USD",
      rates,
    };
  });

  return { results, searchId: `mock-search-${Date.now()}` };
}

export function mockQuoteDuffelRate(rateId: string): {
  rate: DuffelRate;
  accommodation: DuffelAccommodation;
} {
  const refundBefore = new Date();
  refundBefore.setDate(refundBefore.getDate() + 10);

  const rate: DuffelRate = {
    id: rateId,
    board_type: "room_only",
    total_amount: "450.00",
    total_currency: "USD",
    tax_amount: "54.00",
    tax_currency: "USD",
    rooms: [{ beds: [{ count: 1, type: "king" }], name: "Deluxe King Room" }],
    cancellation_timeline: [
      {
        refund_amount: "450.00",
        currency: "USD",
        before: refundBefore.toISOString(),
      },
    ],
    payment_requirements: {
      requires_instant_payment: false,
      payment_required_by: null,
      price_guarantee_expires_at: null,
    },
  };

  const accommodation: DuffelAccommodation = {
    id: "mock-acc-0",
    name: "Mock Hotel & Spa",
    rating: { value: "4.5", count: 1234 },
    location: {
      address: { city_name: "City", country_code: "US", line_one: "123 Main St" },
      geographic_coordinates: { latitude: 40.7128, longitude: -74.006 },
    },
    photos: [{ url: MOCK_PHOTOS[0]!, title: null }],
    description: { text: "A beautiful hotel in the heart of the city." },
    amenities: MOCK_AMENITIES[0]!,
    check_in_information: {
      check_in_after_time: "15:00",
      check_out_before_time: "11:00",
    },
  };

  return { rate, accommodation };
}

export function mockCreateReservation(params: {
  rateId: string;
  guests: DuffelBookingGuestDetails[];
  checkInDate: string;
  checkOutDate: string;
  accommodationName: string;
}): DuffelBookingRecord {
  const refundBefore = new Date();
  refundBefore.setDate(refundBefore.getDate() + 10);

  return {
    provider: "duffel",
    reservationId: `mock-rsv-${Date.now()}`,
    bookingReference: `MOCK${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    status: "confirmed",
    rateId: params.rateId,
    totalAmount: "450.00",
    currency: "USD",
    checkInDate: params.checkInDate,
    checkOutDate: params.checkOutDate,
    bookedAt: new Date().toISOString(),
    cancellationPolicy: {
      fully_refundable_before: refundBefore.toISOString(),
      timeline: [
        {
          refund_amount: "450.00",
          currency: "USD",
          before: refundBefore.toISOString(),
        },
      ],
    },
    accommodationName: params.accommodationName,
    accommodationId: "mock-acc-0",
    isMock: true,
  };
}
