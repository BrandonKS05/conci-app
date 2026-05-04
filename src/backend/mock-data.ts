export type Flight = {
  id: string;
  airline: string;
  route: string;
  depart: string;
  arrive: string;
  duration: string;
  price: string;
  badge: string;
};

export type Restaurant = {
  id: string;
  name: string;
  cuisine: string;
  neighborhood: string;
  rating: number;
  price: string;
  summary: string;
};

export type Activity = {
  id: string;
  name: string;
  type: string;
  time: string;
  location: string;
  summary: string;
};

export const flights: Flight[] = [
  {
    id: "f1",
    airline: "Delta",
    route: "New York → San Francisco",
    depart: "7:10 AM",
    arrive: "10:15 AM",
    duration: "6h 5m",
    price: "$428",
    badge: "Best balance",
  },
  {
    id: "f2",
    airline: "United",
    route: "New York → San Francisco",
    depart: "8:45 AM",
    arrive: "12:00 PM",
    duration: "6h 15m",
    price: "$392",
    badge: "Best price",
  },
  {
    id: "f3",
    airline: "JetBlue",
    route: "New York → San Francisco",
    depart: "6:00 AM",
    arrive: "9:05 AM",
    duration: "6h 5m",
    price: "$474",
    badge: "Best timing",
  },
];

export const restaurants: Restaurant[] = [
  {
    id: "r1",
    name: "Luma House",
    cuisine: "Contemporary American",
    neighborhood: "SoMa",
    rating: 4.8,
    price: "$$$$",
    summary: "Quiet corner tables, polished service, and a menu built for power dinners.",
  },
  {
    id: "r2",
    name: "Juniper Table",
    cuisine: "California",
    neighborhood: "Mission",
    rating: 4.7,
    price: "$$$",
    summary: "Bright room with seasonal plates and fast pacing for pre-meeting dinners.",
  },
  {
    id: "r3",
    name: "The Paper Crane",
    cuisine: "Japanese",
    neighborhood: "Jackson Square",
    rating: 4.9,
    price: "$$$$",
    summary: "Intimate omakase counter that works well for a memorable client meal.",
  },
];

export const activities: Activity[] = [
  {
    id: "a1",
    name: "Private bay cruise",
    type: "Experience",
    time: "4:30 PM",
    location: "Embarcadero",
    summary: "Low-friction 90-minute reset with skyline views before dinner.",
  },
  {
    id: "a2",
    name: "Design museum visit",
    type: "Culture",
    time: "2:00 PM",
    location: "Yerba Buena",
    summary: "Short, polished stop with enough depth for a thoughtful afternoon break.",
  },
  {
    id: "a3",
    name: "Coffee tasting",
    type: "Flexible",
    time: "11:30 AM",
    location: "Financial District",
    summary: "A light, easy meetup option if the schedule shifts during the day.",
  },
];

export const itinerary = {
  trip: "Executive trip to San Francisco",
  dates: "Tue, May 12 - Thu, May 14",
  guestCount: 1,
  flight: flights[0],
  dinner: restaurants[0],
  activity: activities[0],
  notes: [
    "Window seat preferred",
    "Quiet dining room requested",
    "Car pickup after landing",
  ],
};
