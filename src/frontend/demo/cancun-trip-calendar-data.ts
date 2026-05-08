/** Seed data for the /calendar demo (matches finalized Cancun preview). */

export type DemoRestaurant = {
  name: string;
  note?: string;
};

export type DemoDayPlan = {
  iso: string;
  title: string;
  subtitle?: string;
  timeline: string[];
  restaurants: DemoRestaurant[];
  /** Where the group sleeps that night — often the same hotel for multi-night trips. */
  hotel: {
    name: string;
    line: string;
  };
};

export const DEMO_TRIP_HOTEL_PRIMARY = {
  name: "Residence Inn by Marriott Cancun Hotel Zone",
  address: "Blvd. Kukulcan Km 9.5, Zona Hotelera",
  nightly: "~$180/night (split 4 ways = $45/person/night)",
  rating: "8.8/10",
  includes: "Free breakfast, pool, airport shuttle, beach access, kitchen in room",
};

export const DEMO_FLIGHT_OPTIONS = [
  {
    id: "ua-direct",
    label: "United direct (selected)",
    outbound: "Dec 15 — UA 1245 — LAX 7:00 AM → CUN 2:45 PM (nonstop, 4h 45m)",
    return: "Dec 18 — UA 1246 — CUN 4:00 PM → LAX 7:30 PM (nonstop, 4h 30m)",
    price: "~$480/person round trip",
    bookUrl: "https://www.united.com",
    bookHost: "united.com",
  },
  {
    id: "aa-one-stop",
    label: "American with connection",
    outbound: "Dec 15 — AA 319 + AA 884 — LAX → MIA → CUN (arrive ~5:40 PM)",
    return: "Dec 18 — AA 1451 — CUN → DFW → LAX (evening)",
    price: "~$395/person round trip — longer travel day",
    bookUrl: "https://www.aa.com",
    bookHost: "aa.com",
  },
] as const;

export const DEMO_DAY_PLANS: DemoDayPlan[] = [
  {
    iso: "2026-12-15",
    title: "Day 1 · Arrival",
    subtitle: "Dec 15, 2026",
    hotel: {
      name: DEMO_TRIP_HOTEL_PRIMARY.name,
      line: `${DEMO_TRIP_HOTEL_PRIMARY.nightly} — check in afternoon`,
    },
    restaurants: [
      { name: "La Habichuela Downtown", note: "Yucatan seafood, ~$25/person · dinner" },
    ],
    timeline: [
      "7:00 AM Depart LAX on United UA 1245",
      "2:45 PM Arrive Cancun CUN — hotel shuttle (~25 min)",
      "4:00 PM Check in, drop bags, hit the pool",
      "6:30 PM Playa Langosta beach for sunset",
      "8:00 PM Dinner at La Habichuela Downtown",
      "10:00 PM Nightcap at Coco Bongo strip",
    ],
  },
  {
    iso: "2026-12-16",
    title: "Day 2 · Ruins & beach",
    subtitle: "Dec 16, 2026",
    hotel: {
      name: DEMO_TRIP_HOTEL_PRIMARY.name,
      line: "Second night · same hotel",
    },
    restaurants: [
      { name: "Mercado 28", note: "Tacos & ceviche, ~$8/person · lunch" },
      { name: "Roots Jazz Club & Restaurant", note: "Live music + cocktails, ~$35/person · dinner" },
    ],
    timeline: [
      "8:00 AM Breakfast at hotel",
      "10:00 AM El Rey Ruins (& iguanas) — ~$3 entry",
      "12:30 PM Lunch at Mercado 28",
      "2:30 PM Playa Delfines — public beach & sunset views",
      "5:00 PM Back to hotel, freshen up",
      "7:30 PM Dinner at Roots Jazz Club",
      "10:00 PM Nightlife on Kukulcan Blvd",
    ],
  },
  {
    iso: "2026-12-17",
    title: "Day 3 · Isla Mujeres",
    subtitle: "Dec 17, 2026",
    hotel: {
      name: DEMO_TRIP_HOTEL_PRIMARY.name,
      line: "Third night · same hotel",
    },
    restaurants: [
      { name: "Playa Norte (beach stands)", note: "Fresh fish tacos, ~$12/person · lunch" },
      { name: "El Fish Fritanga", note: "Casual seafood, ~$15/person · dinner" },
      { name: "La Vaquita", note: "Rooftop drinks — nightcap" },
    ],
    timeline: [
      "8:00 AM Hotel breakfast",
      "9:00 AM Uber to Puerto Juarez ferry (~$12)",
      "9:30 AM Ferry to Isla Mujeres (~$10 RT/person)",
      "10:00 AM Golf cart island tour (~$45 split 4 ways)",
      "12:00 PM Lunch at Playa Norte",
      "2:30 PM MUSA snorkel tour (~$40/person)",
      "5:30 PM Ferry back to Cancun",
      "7:30 PM Dinner at El Fish Fritanga",
      "9:30 PM Rooftop drinks at La Vaquita",
    ],
  },
  {
    iso: "2026-12-18",
    title: "Day 4 · Departure",
    subtitle: "Dec 18, 2026",
    hotel: {
      name: DEMO_TRIP_HOTEL_PRIMARY.name,
      line: "Checkout · bags with concierge until shuttle",
    },
    restaurants: [{ name: "Hotel breakfast", note: "Last morning at Residence Inn" }],
    timeline: [
      "8:00 AM Last hotel breakfast",
      "10:00 AM Final swim + pack",
      "12:00 PM Checkout",
      "1:00 PM Hotel shuttle to CUN airport",
      "4:00 PM Depart CUN on United UA 1246",
      "7:30 PM Arrive LAX",
    ],
  },
];

const byIso = new Map(DEMO_DAY_PLANS.map((d) => [d.iso, d]));

export function getDemoDayPlan(iso: string): DemoDayPlan | undefined {
  return byIso.get(iso);
}

export function demoTripDateSet(): Set<string> {
  return new Set(DEMO_DAY_PLANS.map((d) => d.iso));
}
