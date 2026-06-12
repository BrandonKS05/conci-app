import type { TripPlan } from "@/shared/trip-plan";
import type {
  DuffelFlightBookingRecord,
  SelectedFlightSlice,
} from "@/shared/duffel-flights";

function fmtFlightDateTime(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** "Outbound" / "Return" on round trips, plain "Flight" on one-ways. */
export function flightSliceKind(totalSlices: number, index: number): string {
  return totalSlices > 1 ? (index === 0 ? "Outbound" : "Return") : "Flight";
}

export function FlightSliceLine({ slice, kind }: { slice: SelectedFlightSlice; kind: string }) {
  return (
    <div className="text-sm text-[color:var(--on-surface)] dark:text-[#ebe9e4]">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--on-surface-muted)]">
        {kind} · {slice.origin} → {slice.destination}
        {slice.stops > 0 ? ` · ${slice.stops} stop${slice.stops > 1 ? "s" : ""}` : " · nonstop"}
      </p>
      <p className="text-xs text-[color:var(--on-surface-muted)]">
        {slice.airlineName ? `${slice.airlineName} ${slice.flightNumber} · ` : ""}
        {fmtFlightDateTime(slice.departingAt)} → {fmtFlightDateTime(slice.arrivingAt)}
      </p>
    </div>
  );
}

function TestModeBadge() {
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
      Test mode
    </span>
  );
}

function BookedFlightRow({ booking }: { booking: DuffelFlightBookingRecord }) {
  return (
    <div className="space-y-1.5 text-sm text-[color:var(--on-surface)] dark:text-[#ebe9e4]">
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
        <div>
          <p className="font-semibold">
            {booking.airlineName} {booking.flightNumber} · {booking.origin} → {booking.destination}
          </p>
          <p className="text-xs text-[color:var(--on-surface-muted)]">
            {fmtFlightDateTime(booking.departingAt)} → {fmtFlightDateTime(booking.arrivingAt)}
          </p>
        </div>
      )}
      <p className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--on-surface-muted)]">
        <span>
          Confirmation {booking.bookingReference}
          {booking.status !== "confirmed" ? ` · ${booking.status}` : ""} · {booking.currency}{" "}
          {booking.totalAmount}
          {booking.slices && booking.slices.length > 1 ? " · covers both legs" : ""}
        </span>
        {booking.isMock ? <TestModeBadge /> : null}
      </p>
    </div>
  );
}

/**
 * Read-only flights card for group-visible surfaces (guest transportation tab,
 * shared itinerary view). Shows confirmed bookings from
 * `hostSetup.flightBookings` and the saved-but-unbooked selection distinctly;
 * booking/swap/remove controls stay host-only in HostDuffelFlightPanel.
 * Renders nothing when the trip has no booked or saved flights.
 */
export function TripFlightSummary({ plan }: { plan: TripPlan }) {
  const bookings = plan.hostSetup?.flightBookings ?? [];
  const selection = plan.hostSetup?.flightSelections?.[0] ?? null;
  if (!bookings.length && !selection) return null;

  return (
    <div className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] p-5 dark:border-white/10 dark:bg-white/[0.03]">
      <p className="label-caps text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">Flights</p>

      {bookings.length ? (
        <div className="mt-3 space-y-2 rounded-xl border border-[color:var(--hairline)] bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)]">
            Booked flights
          </p>
          {bookings.map((booking) => (
            <BookedFlightRow key={booking.orderId} booking={booking} />
          ))}
        </div>
      ) : null}

      {selection ? (
        <div className="mt-3 space-y-3 rounded-xl border border-[#2563EB]/40 bg-[#2563EB]/[0.04] p-3 dark:border-[#60A5FA]/30 dark:bg-[#60A5FA]/[0.06]">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#2563EB] dark:text-[#60A5FA]">
              Selected flight
            </p>
            <span className="rounded-full border border-[color:var(--hairline)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:border-white/10">
              Not booked yet
            </span>
            {selection.isMock ? <TestModeBadge /> : null}
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
          <p className="text-[11px] text-[color:var(--on-surface-muted)]">
            The host saved this fare but hasn&apos;t booked it yet — price and seats can change
            until it&apos;s booked.
          </p>
        </div>
      ) : null}
    </div>
  );
}
