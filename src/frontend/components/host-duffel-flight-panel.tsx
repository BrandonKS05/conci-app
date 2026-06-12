"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import type { TripPlan } from "@/shared/trip-plan";
import type { DuffelSelectedFlightRecord } from "@/shared/duffel-flights";
import { DuffelFlightBookingDrawer } from "@/frontend/components/duffel-flight-booking-drawer";
import { FlightSliceLine, flightSliceKind } from "@/frontend/components/trip-flight-summary";

/** Pull "JFK → CDG" style airport codes from the generated flight activity. */
function extractIataPair(text: string): { origin: string; destination: string } | null {
  const m = text.match(/([A-Z]{3})\s*(?:→|->)\s*([A-Z]{3})/);
  return m ? { origin: m[1]!, destination: m[2]! } : null;
}

/**
 * Flight search/booking for the trip — routed through the existing Duffel
 * integration (DuffelFlightBookingDrawer), not SerpAPI. When the host has saved
 * a specific flight (selected but not booked) it replaces the generic AI flight
 * recommendation here; otherwise we fall back to searching from the generated
 * outbound flight's airports. No fake data is shown when neither exists.
 */
export function HostDuffelFlightPanel({ tripId, plan }: { tripId: string; plan: TripPlan }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

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
  const bookings = plan.hostSetup?.flightBookings ?? [];
  const selection: DuffelSelectedFlightRecord | null = plan.hostSetup?.flightSelections?.[0] ?? null;

  // Seed the drawer from the saved selection's route when present, else the AI flight.
  const drawerOrigin = selection?.slices[0]?.origin ?? outbound?.iata.origin ?? null;
  const drawerDestination = selection?.slices[0]?.destination ?? outbound?.iata.destination ?? null;
  const drawerLabel = selection
    ? `${selection.slices[0]?.origin} → ${selection.slices[0]?.destination}`
    : outbound?.label;
  const canSearch = Boolean(drawerOrigin && drawerDestination && departureDate);

  const handleRemove = useCallback(async () => {
    setRemoving(true);
    try {
      await fetch(`/api/trip-plans/${tripId}/duffel/flights/select`, {
        method: "DELETE",
        credentials: "include",
      });
      router.refresh();
    } finally {
      setRemoving(false);
    }
  }, [tripId, router]);

  const googleFlightsUrl =
    plan.departureCity?.trim() && plan.location?.trim()
      ? `https://www.google.com/travel/flights?hl=en&q=${encodeURIComponent(
          `Flights from ${plan.departureCity.trim()} to ${plan.location.trim()}`
        )}`
      : null;

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
            {selection ? "Change flight" : "Search & select flights"}
          </button>
        ) : null}
      </div>

      {!canSearch ? (
        <p className="mt-3 text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-400">
          Add a departure city and trip dates, then generate the itinerary to search flights with Conci.
        </p>
      ) : null}

      {/* Selected (saved, not booked) flight — replaces the generic recommendation */}
      {selection ? (
        <div className="mt-4 space-y-3 rounded-xl border border-[#2563EB]/40 bg-[#2563EB]/[0.04] p-3 dark:border-[#60A5FA]/30 dark:bg-[#60A5FA]/[0.06]">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#2563EB] dark:text-[#60A5FA]">
              Selected flight
            </p>
            <span className="rounded-full border border-[color:var(--hairline)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:border-white/10">
              Not booked yet
            </span>
            {selection.isMock ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                Test mode
              </span>
            ) : null}
          </div>
          {selection.slices.map((slice, i) => (
            <FlightSliceLine
              key={`${slice.origin}-${slice.destination}-${i}`}
              slice={slice}
              kind={flightSliceKind(selection.slices.length, i)}
            />
          ))}
          <p className="text-sm font-semibold text-[color:var(--on-surface)] dark:text-[#ebe9e4]">
            {selection.currency} {selection.totalAmount} total · {selection.passengerCount} passenger
            {selection.passengerCount !== 1 ? "s" : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-full bg-[#1c1c17] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#2a2a26] dark:bg-neutral-200 dark:text-[#1a1a1a] dark:hover:bg-white"
            >
              Search again to book
            </button>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-full border border-[color:var(--hairline-strong)] px-3 py-1.5 text-xs font-semibold text-[color:var(--on-surface)] transition hover:bg-[color:var(--surface-container-low)] dark:border-white/15 dark:text-[#ebe9e4]"
            >
              Swap
            </button>
            <button
              type="button"
              onClick={() => void handleRemove()}
              disabled={removing}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-40 dark:text-rose-400 dark:hover:bg-rose-950/30"
            >
              {removing ? "Removing…" : "Remove"}
            </button>
          </div>
          <p className="text-[11px] text-[color:var(--on-surface-muted)]">
            Saved fares expire after a short time, so booking runs a fresh search to confirm current price and seats.
            Flights are booked directly through Conci — there is no separate external booking link for this fare.
          </p>
        </div>
      ) : googleFlightsUrl ? (
        <p className="mt-3 text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">
          Prefer to compare elsewhere first?{" "}
          <a
            href={googleFlightsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[#2563EB] underline-offset-2 hover:underline dark:text-[#60A5FA]"
          >
            Compare on Google Flights ↗
          </a>
        </p>
      ) : null}

      {bookings.length > 0 ? (
        <div className="mt-4 space-y-2 rounded-xl border border-[color:var(--hairline)] bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)]">Booked flights</p>
          {bookings.map((booking) => (
            <div key={booking.orderId} className="space-y-1.5 text-sm text-[color:var(--on-surface)] dark:text-[#ebe9e4]">
              {booking.slices?.length ? (
                // Full itinerary (outbound + return on round trips).
                booking.slices.map((slice, i) => (
                  <FlightSliceLine
                    key={`${booking.orderId}-${i}`}
                    slice={slice}
                    kind={flightSliceKind(booking.slices!.length, i)}
                  />
                ))
              ) : (
                // Legacy records persisted before round-trip support: first segment only.
                <p className="font-semibold">
                  {booking.airlineName} {booking.flightNumber} · {booking.origin} → {booking.destination}
                </p>
              )}
              <p className="text-xs text-[color:var(--on-surface-muted)]">
                Confirmation {booking.bookingReference} · {booking.currency} {booking.totalAmount}
                {booking.slices && booking.slices.length > 1 ? " · covers both legs" : ""}
                {booking.isMock ? (
                  <span className="ml-2 rounded-full border border-[color:var(--hairline)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:border-white/10">
                    Test mode
                  </span>
                ) : null}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {open && drawerOrigin && drawerDestination && departureDate ? (
        <DuffelFlightBookingDrawer
          open
          onClose={() => setOpen(false)}
          tripId={tripId}
          origin={drawerOrigin}
          destination={drawerDestination}
          departureDate={departureDate}
          returnDate={returnDate}
          passengerCount={passengers}
          flightLabel={drawerLabel}
          onFlightSelected={() => {
            setOpen(false);
            router.refresh();
          }}
          onBookingComplete={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
