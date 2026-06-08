"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { TripPlan } from "@/shared/trip-plan";
import { DuffelFlightBookingDrawer } from "@/frontend/components/duffel-flight-booking-drawer";

/** Pull "JFK → CDG" style airport codes from the generated flight activity. */
function extractIataPair(text: string): { origin: string; destination: string } | null {
  const m = text.match(/([A-Z]{3})\s*(?:→|->)\s*([A-Z]{3})/);
  return m ? { origin: m[1]!, destination: m[2]! } : null;
}

/**
 * Flight search/booking for the trip — routed through the existing Duffel
 * integration (DuffelFlightBookingDrawer), not SerpAPI. Origin/destination
 * airports come from the generated outbound flight activity; if those aren't
 * available we show a clean "add flight details" state instead of fake data.
 */
export function HostDuffelFlightPanel({ tripId, plan }: { tripId: string; plan: TripPlan }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const outbound = useMemo(() => {
    const day0 = plan.generatedItinerary?.days?.[0];
    const flight = day0?.activities.find(
      (a) => a.category === "transport" && /^\s*flight\s*:/i.test(a.title ?? "")
    );
    if (!flight) return null;
    const iata = extractIataPair(`${flight.title} ${flight.description ?? ""}`);
    return iata ? { iata, label: flight.title } : null;
  }, [plan.generatedItinerary]);

  const departureDate = plan.hostSetup?.tripRange?.startIso ?? null;
  const tripEnd = plan.hostSetup?.tripRange?.endIso ?? null;
  const returnDate = tripEnd && departureDate && tripEnd > departureDate ? tripEnd : null;
  const passengers = Math.max(1, plan.people.count ?? plan.people.names.length ?? 1);
  const canSearch = Boolean(outbound && departureDate);
  const bookings = plan.hostSetup?.flightBookings ?? [];

  return (
    <div className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] p-5 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label-caps text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">Flights</p>
          <p className="mt-1 text-sm text-[color:var(--on-surface-variant)] dark:text-[color:var(--on-surface-muted)]">
            {plan.departureCity?.trim()}
            {plan.departureCity?.trim() && plan.location?.trim() ? " → " : ""}
            {plan.location?.trim()}
          </p>
        </div>
        {canSearch ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-full bg-[#1c1c17] px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-[#2a2a26] dark:bg-neutral-200 dark:text-[#1a1a1a] dark:hover:bg-white"
          >
            Search &amp; book flights
          </button>
        ) : null}
      </div>

      {!canSearch ? (
        <p className="mt-3 text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-400">
          Add a departure city and trip dates, then generate the itinerary to search flights with Conci.
        </p>
      ) : null}

      {bookings.length > 0 ? (
        <div className="mt-4 space-y-2 rounded-xl border border-[color:var(--hairline)] bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)]">Booked flights</p>
          {bookings.map((booking) => (
            <div key={booking.orderId} className="text-sm text-[color:var(--on-surface)] dark:text-[#ebe9e4]">
              <p className="font-semibold">
                {booking.airlineName} {booking.flightNumber} · {booking.origin} → {booking.destination}
                {booking.isMock ? (
                  <span className="ml-2 rounded-full border border-[color:var(--hairline)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:border-white/10">
                    Test mode
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-[color:var(--on-surface-muted)]">
                Confirmation {booking.bookingReference} · {booking.currency} {booking.totalAmount}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {open && outbound && departureDate ? (
        <DuffelFlightBookingDrawer
          open
          onClose={() => setOpen(false)}
          tripId={tripId}
          origin={outbound.iata.origin}
          destination={outbound.iata.destination}
          departureDate={departureDate}
          returnDate={returnDate}
          passengerCount={passengers}
          flightLabel={outbound.label}
          onBookingComplete={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
