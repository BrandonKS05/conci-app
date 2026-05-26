/**
 * Mock Duffel Flights responses — used when DUFFEL_ACCESS_TOKEN is not configured.
 */
import type { DuffelOffer, DuffelFlightBookingRecord, DuffelFlightPassenger } from "@/shared/duffel-flights";

const AIRLINES = [
  { iata_code: "AA", name: "American Airlines", logo_symbol_url: null },
  { iata_code: "DL", name: "Delta Air Lines", logo_symbol_url: null },
  { iata_code: "UA", name: "United Airlines", logo_symbol_url: null },
  { iata_code: "B6", name: "JetBlue Airways", logo_symbol_url: null },
  { iata_code: "WN", name: "Southwest Airlines", logo_symbol_url: null },
];

function makeAirport(iata: string, city: string) {
  return { iata_code: iata, name: `${city} Airport`, city_name: city, city: { name: city }, time_zone: null };
}

function addHours(base: Date, h: number): string {
  return new Date(base.getTime() + h * 3600_000).toISOString();
}

function isoDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `PT${h}H${m > 0 ? `${m}M` : ""}`;
}

export function mockSearchFlights(params: {
  origin: string;
  destination: string;
  departureDate: string;
  passengers: number;
}): { offers: DuffelOffer[]; requestId: string; isMock: boolean } {
  const originAirport = makeAirport(params.origin, params.origin);
  const destAirport = makeAirport(params.destination, params.destination);
  const base = new Date(`${params.departureDate}T06:00:00`);
  const paxIds = Array.from({ length: Math.max(1, params.passengers) }, (_, i) => `pas_mock_${i + 1}`);

  const offers: DuffelOffer[] = AIRLINES.slice(0, 4).map((airline, i) => {
    const depHour = 6 + i * 3;
    const durationMin = 120 + i * 30;
    const depDate = new Date(base.getTime() + depHour * 3600_000);
    const arrDate = new Date(depDate.getTime() + durationMin * 60_000);
    const priceBase = 180 + i * 55 + Math.round(Math.random() * 40);
    const total = (priceBase * Math.max(1, params.passengers)).toFixed(2);

    const segId = `seg_mock_${i + 1}`;
    const segment = {
      id: segId,
      origin: originAirport,
      destination: destAirport,
      departing_at: depDate.toISOString(),
      arriving_at: arrDate.toISOString(),
      duration: isoDuration(durationMin),
      marketing_carrier: airline,
      marketing_carrier_flight_number: `${100 + i * 37}`,
      operating_carrier: airline,
      aircraft: null,
      passengers: paxIds.map((id) => ({ passenger_id: id, cabin_class: "economy" })),
    };

    return {
      id: `off_mock_${i + 1}`,
      total_amount: total,
      total_currency: "USD",
      base_amount: (parseFloat(total) * 0.87).toFixed(2),
      tax_amount: (parseFloat(total) * 0.13).toFixed(2),
      expires_at: addHours(new Date(), 1),
      slices: [
        {
          id: `slc_mock_${i + 1}`,
          origin: originAirport,
          destination: destAirport,
          duration: isoDuration(durationMin),
          segments: [segment],
        },
      ],
      passengers: paxIds.map((id, pi) => ({ id, type: "adult" as const, age: 30 + pi })),
    };
  });

  return { offers, requestId: `orq_mock_${Date.now()}`, isMock: true };
}

export function mockBookFlight(params: {
  offerId: string;
  passengers: DuffelFlightPassenger[];
  origin: string;
  destination: string;
  departingAt: string;
  arrivingAt: string;
  airlineName: string;
  flightNumber: string;
  totalAmount: string;
  totalCurrency: string;
}): DuffelFlightBookingRecord {
  return {
    provider: "duffel",
    orderId: `ord_mock_${Date.now()}`,
    bookingReference: `MOCK${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    status: "confirmed",
    totalAmount: params.totalAmount,
    currency: params.totalCurrency,
    origin: params.origin,
    destination: params.destination,
    departingAt: params.departingAt,
    arrivingAt: params.arrivingAt,
    airlineName: params.airlineName,
    flightNumber: params.flightNumber,
    bookedAt: new Date().toISOString(),
    isMock: true,
  };
}
