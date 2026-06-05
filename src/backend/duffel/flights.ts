import { duffelPost, isDuffelConfigured } from "@/backend/duffel/client";
import { mockSearchFlights, mockBookFlight } from "@/backend/duffel/flights-mock";
import type {
  DuffelOffer,
  DuffelFlightPassenger,
  DuffelFlightBookingRecord,
} from "@/shared/duffel-flights";

// ─── Raw Duffel API shapes ─────────────────────────────────────────────────

type DuffelOfferRequestResponse = {
  data: {
    id: string;
    offers: DuffelOffer[];
  };
};

type DuffelOrderResponse = {
  data: {
    id: string;
    booking_reference: string;
    payment_status: { awaiting_payment: boolean };
    slices: DuffelOffer["slices"];
    passengers: DuffelOffer["passengers"];
  };
};

// ─── Service functions ─────────────────────────────────────────────────────

export type FlightSearchParams = {
  origin: string; // IATA code
  destination: string;
  departureDate: string; // YYYY-MM-DD
  /** When set, searches a round trip (return leg destination→origin). */
  returnDate?: string; // YYYY-MM-DD
  passengers: number;
  cabinClass?: "economy" | "premium_economy" | "business" | "first";
};

export async function searchDuffelFlights(
  params: FlightSearchParams
): Promise<{ offers: DuffelOffer[]; requestId: string; isMock: boolean }> {
  if (!isDuffelConfigured()) {
    return mockSearchFlights(params);
  }

  const count = Math.max(1, Math.min(9, params.passengers));
  const slices = [
    { origin: params.origin, destination: params.destination, departure_date: params.departureDate },
  ];
  if (params.returnDate) {
    slices.push({ origin: params.destination, destination: params.origin, departure_date: params.returnDate });
  }
  const resp = await duffelPost<DuffelOfferRequestResponse>("/air/offer_requests", {
    data: {
      return_offers: true,
      slices,
      passengers: Array.from({ length: count }, () => ({ type: "adult" })),
      cabin_class: params.cabinClass ?? "economy",
    },
  });

  const offers = [...(resp.data.offers ?? [])].sort(
    (a, b) => parseFloat(a.total_amount) - parseFloat(b.total_amount)
  );

  return { offers: offers.slice(0, 8), requestId: resp.data.id, isMock: false };
}

export async function bookDuffelFlight(params: {
  offerId: string;
  passengers: DuffelFlightPassenger[];
  offer: DuffelOffer;
}): Promise<{ booking: DuffelFlightBookingRecord; isMock: boolean }> {
  if (!isDuffelConfigured()) {
    const seg = params.offer.slices[0]?.segments[0];
    const mock = mockBookFlight({
      offerId: params.offerId,
      passengers: params.passengers,
      origin: seg?.origin.iata_code ?? "",
      destination: seg?.destination.iata_code ?? "",
      departingAt: seg?.departing_at ?? "",
      arrivingAt: seg?.arriving_at ?? "",
      airlineName: seg?.marketing_carrier.name ?? "",
      flightNumber: `${seg?.marketing_carrier.iata_code ?? ""}${seg?.marketing_carrier_flight_number ?? ""}`,
      totalAmount: params.offer.total_amount,
      totalCurrency: params.offer.total_currency,
    });
    return { booking: mock, isMock: true };
  }

  const resp = await duffelPost<DuffelOrderResponse>("/air/orders", {
    data: {
      selected_offers: [params.offerId],
      passengers: params.passengers.map((p) => ({
        id: p.id,
        title: p.title,
        gender: p.gender,
        given_name: p.given_name,
        family_name: p.family_name,
        born_on: p.born_on,
        email: p.email,
        phone_number: p.phone_number,
      })),
      payments: [
        {
          type: "balance",
          amount: params.offer.total_amount,
          currency: params.offer.total_currency,
        },
      ],
    },
  });

  const seg = params.offer.slices[0]?.segments[0];
  const booking: DuffelFlightBookingRecord = {
    provider: "duffel",
    orderId: resp.data.id,
    bookingReference: resp.data.booking_reference,
    status: "confirmed",
    totalAmount: params.offer.total_amount,
    currency: params.offer.total_currency,
    origin: seg?.origin.iata_code ?? "",
    destination: seg?.destination.iata_code ?? "",
    departingAt: seg?.departing_at ?? "",
    arrivingAt: seg?.arriving_at ?? "",
    airlineName: seg?.marketing_carrier.name ?? "",
    flightNumber: `${seg?.marketing_carrier.iata_code ?? ""}${seg?.marketing_carrier_flight_number ?? ""}`,
    bookedAt: new Date().toISOString(),
  };

  return { booking, isMock: false };
}
