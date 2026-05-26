"use client";

import { useCallback, useState } from "react";
import type {
  DuffelOffer,
  DuffelFlightPassenger,
  DuffelFlightBookingRecord,
} from "@/shared/duffel-flights";

// ─── Style tokens (matches lodging drawer) ───────────────────────────────────

const inputCls =
  "mt-1 w-full rounded-xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-low)] px-3 py-2.5 text-sm text-[color:var(--on-surface)] outline-none focus:border-[color:var(--hairline-strong)] dark:border-white/15 dark:bg-dm-page dark:text-[#ebe9e4]";
const labelCls =
  "text-[11px] font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:text-neutral-500";
const btnPrimary =
  "rounded-xl bg-[#1c1c17] px-4 py-2.5 text-sm font-semibold tracking-wide text-[color:var(--surface)] shadow-md transition hover:bg-[#2a2a26] disabled:pointer-events-none disabled:opacity-40 dark:bg-neutral-200 dark:text-dm-page dark:hover:bg-white";
const btnSecondary =
  "rounded-xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] px-4 py-2.5 text-sm font-semibold text-[color:var(--on-surface)] transition hover:bg-[color:var(--surface-container-low)] dark:border-white/15 dark:bg-dm-page dark:text-[#ebe9e4]";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "results" | "passenger-details" | "confirm" | "done";

type PassengerForm = {
  given_name: string;
  family_name: string;
  born_on: string;
  email: string;
  phone_number: string;
  title: "mr" | "ms" | "mrs" | "dr";
  gender: "m" | "f";
};

export type DuffelFlightDrawerProps = {
  open: boolean;
  onClose: () => void;
  tripId: string;
  origin: string; // IATA e.g. "MIA"
  destination: string; // IATA e.g. "JFK"
  departureDate: string; // YYYY-MM-DD
  passengerCount: number;
  flightLabel?: string; // e.g. "Flight: Miami → New York City"
  onBookingComplete?: (booking: DuffelFlightBookingRecord) => void;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCurrency(amount: string, currency: string): string {
  const n = parseFloat(amount);
  if (isNaN(n)) return `${currency} ${amount}`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
}

function fmtDatetime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function parseDuration(iso: string): string {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return iso;
  const h = m[1] ? `${m[1]}h` : "";
  const min = m[2] ? `${m[2]}m` : "";
  return [h, min].filter(Boolean).join(" ") || iso;
}

function blankPassenger(): PassengerForm {
  return { given_name: "", family_name: "", born_on: "", email: "", phone_number: "", title: "mr", gender: "m" };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function MockBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
      Test mode
    </span>
  );
}

function OfferCard({
  offer,
  onSelect,
}: {
  offer: DuffelOffer;
  onSelect: () => void;
}) {
  const seg = offer.slices[0]?.segments[0];
  if (!seg) return null;
  const stops = (offer.slices[0]?.segments.length ?? 1) - 1;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full rounded-2xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] p-4 text-left transition hover:border-[#2563EB] hover:shadow-sm dark:border-white/10 dark:bg-dm-page dark:hover:border-[#60A5FA]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-[color:var(--on-surface)] dark:text-[#ebe9e4]">
            {seg.marketing_carrier.name}
            <span className="ml-1.5 text-xs font-normal text-[color:var(--on-surface-muted)] dark:text-neutral-500">
              {seg.marketing_carrier.iata_code}{seg.marketing_carrier_flight_number}
            </span>
          </p>
          <div className="mt-2 flex items-center gap-3">
            <div className="text-center">
              <p className="text-base font-bold tabular-nums text-[color:var(--on-surface)] dark:text-[#ebe9e4]">{fmtTime(seg.departing_at)}</p>
              <p className="text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">{seg.origin.iata_code}</p>
            </div>
            <div className="flex flex-1 flex-col items-center gap-0.5">
              <p className="text-[10px] text-[color:var(--on-surface-muted)] dark:text-neutral-500">{parseDuration(seg.duration)}</p>
              <div className="flex w-full items-center gap-1">
                <div className="h-px flex-1 bg-[color:var(--hairline)] dark:bg-white/15" />
                <svg className="h-3 w-3 text-[color:var(--on-surface-muted)]" viewBox="0 0 16 16" fill="currentColor" aria-hidden><path d="M14.5 8.5a1 1 0 000-1H9.5l-2-4H6l1 4H3.5l-.75-1.5H1.5L2.5 8l-1 1.5h1.25L3.5 8h3l-1 4h1.5l2-4h5z"/></svg>
                <div className="h-px flex-1 bg-[color:var(--hairline)] dark:bg-white/15" />
              </div>
              <p className="text-[10px] text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                {stops === 0 ? "Nonstop" : `${stops} stop${stops > 1 ? "s" : ""}`}
              </p>
            </div>
            <div className="text-center">
              <p className="text-base font-bold tabular-nums text-[color:var(--on-surface)] dark:text-[#ebe9e4]">{fmtTime(seg.arriving_at)}</p>
              <p className="text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">{seg.destination.iata_code}</p>
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold text-[#2563EB] dark:text-[#60A5FA]">
            {fmtCurrency(offer.total_amount, offer.total_currency)}
          </p>
          <p className="text-[10px] text-[color:var(--on-surface-muted)] dark:text-neutral-500">total</p>
        </div>
      </div>
    </button>
  );
}

// ─── Main drawer ──────────────────────────────────────────────────────────────

export function DuffelFlightBookingDrawer({
  open,
  onClose,
  tripId,
  origin,
  destination,
  departureDate,
  passengerCount,
  flightLabel,
  onBookingComplete,
}: DuffelFlightDrawerProps) {
  const [step, setStep] = useState<Step>("results");
  const [offers, setOffers] = useState<DuffelOffer[] | null>(null);
  const [isMock, setIsMock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<DuffelOffer | null>(null);
  const [passengers, setPassengers] = useState<PassengerForm[]>([]);
  const [booking, setBooking] = useState<DuffelFlightBookingRecord | null>(null);

  const fetchOffers = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOffers(null);
    try {
      const params = new URLSearchParams({
        origin,
        destination,
        date: departureDate,
        passengers: String(Math.max(1, passengerCount)),
      });
      const r = await fetch(`/api/trip-plans/${tripId}/duffel/flights/search?${params.toString()}`, {
        credentials: "include",
      });
      const j = (await r.json()) as { offers?: DuffelOffer[]; isMock?: boolean; error?: string };
      if (!r.ok || !j.offers) {
        setError(j.error ?? "Failed to load flights.");
        return;
      }
      setOffers(j.offers);
      setIsMock(j.isMock ?? false);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [tripId, origin, destination, departureDate, passengerCount]);

  // Fetch when drawer opens
  const handleOpen = useCallback(() => {
    setStep("results");
    setSelectedOffer(null);
    setBooking(null);
    setError(null);
    void fetchOffers();
  }, [fetchOffers]);

  const handleSelectOffer = useCallback((offer: DuffelOffer) => {
    setSelectedOffer(offer);
    setPassengers(Array.from({ length: offer.passengers.length }, blankPassenger));
    setStep("passenger-details");
  }, []);

  const handleBook = useCallback(async () => {
    if (!selectedOffer) return;
    setLoading(true);
    setError(null);
    try {
      const paxPayload: DuffelFlightPassenger[] = passengers.map((p, i) => ({
        id: selectedOffer.passengers[i]!.id,
        title: p.title,
        gender: p.gender,
        given_name: p.given_name.trim(),
        family_name: p.family_name.trim(),
        born_on: p.born_on,
        email: p.email.trim(),
        phone_number: p.phone_number.trim(),
      }));

      const r = await fetch(`/api/trip-plans/${tripId}/duffel/flights/book`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId: selectedOffer.id, offer: selectedOffer, passengers: paxPayload }),
      });
      const j = (await r.json()) as { booking?: DuffelFlightBookingRecord; error?: string };
      if (!r.ok || !j.booking) {
        setError(j.error ?? "Booking failed.");
        return;
      }
      setBooking(j.booking);
      setStep("done");
      onBookingComplete?.(j.booking);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [selectedOffer, passengers, tripId, onBookingComplete]);

  function updatePassenger(i: number, field: keyof PassengerForm, value: string) {
    setPassengers((prev) => prev.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)));
  }

  function passengerFormValid(): boolean {
    return passengers.every(
      (p) => p.given_name.trim() && p.family_name.trim() && p.born_on && p.email.trim() && p.phone_number.trim()
    );
  }

  // Trigger fetch when open transitions to true
  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    handleOpen();
  }
  if (!open && wasOpen) {
    setWasOpen(false);
  }

  if (!open) return null;

  const seg = selectedOffer?.slices[0]?.segments[0];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[400] bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Book flight"
        className="fixed bottom-0 right-0 top-0 z-[401] flex w-full max-w-lg flex-col bg-[color:var(--surface-container-lowest)] shadow-2xl dark:bg-dm-card sm:bottom-0"
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[color:var(--hairline)] px-5 py-4 dark:border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                Book flight
              </p>
              {isMock && <MockBadge />}
            </div>
            <h2 className="mt-0.5 font-display text-lg font-semibold text-[color:var(--on-surface)] dark:text-[#ebe9e4]">
              {flightLabel?.replace(/^Flight:\s*/i, "") ?? `${origin} → ${destination}`}
            </h2>
            <p className="mt-0.5 text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">
              {new Date(`${departureDate}T12:00:00`).toLocaleDateString("en-US", {
                weekday: "long", month: "long", day: "numeric", year: "numeric",
              })} · {passengerCount} passenger{passengerCount !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="mt-0.5 shrink-0 rounded-full p-1.5 text-[color:var(--on-surface-muted)] hover:bg-[color:var(--surface-container)] dark:hover:bg-white/10"
            aria-label="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
              <path d="M4 4l12 12M16 4L4 16" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <svg className="h-8 w-8 animate-spin text-[#2563EB]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              <p className="text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-400">
                {step === "results" ? "Searching available flights…" : "Confirming your booking…"}
              </p>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-900/30 dark:bg-red-950/20">
              <p className="text-sm font-medium text-red-800 dark:text-red-300">{error}</p>
              {step === "results" && (
                <button onClick={() => void fetchOffers()} className={`mt-3 ${btnSecondary}`}>
                  Try again
                </button>
              )}
            </div>
          )}

          {/* Offer list */}
          {!loading && !error && step === "results" && offers && (
            <div className="space-y-3">
              {offers.length === 0 ? (
                <p className="text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-400">
                  No flights found for this route and date.
                </p>
              ) : (
                <>
                  <p className="text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                    {offers.length} flight{offers.length !== 1 ? "s" : ""} found · tap to select
                  </p>
                  {offers.map((offer) => (
                    <OfferCard key={offer.id} offer={offer} onSelect={() => handleSelectOffer(offer)} />
                  ))}
                </>
              )}
            </div>
          )}

          {/* Passenger details */}
          {!loading && step === "passenger-details" && selectedOffer && (
            <div className="space-y-6">
              {/* Selected flight summary */}
              {seg && (
                <div className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] p-4 dark:border-white/10 dark:bg-dm-elevated">
                  <p className="text-xs font-semibold text-[color:var(--on-surface-muted)] dark:text-neutral-500">Selected flight</p>
                  <p className="mt-1 font-semibold text-[color:var(--on-surface)] dark:text-[#ebe9e4]">
                    {seg.marketing_carrier.name} {seg.marketing_carrier.iata_code}{seg.marketing_carrier_flight_number}
                  </p>
                  <p className="mt-0.5 text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-400">
                    {fmtDatetime(seg.departing_at)} → {fmtTime(seg.arriving_at)}
                  </p>
                  <p className="mt-1 text-base font-bold text-[#2563EB] dark:text-[#60A5FA]">
                    {fmtCurrency(selectedOffer.total_amount, selectedOffer.total_currency)}
                  </p>
                </div>
              )}

              {/* Passenger forms */}
              {passengers.map((p, i) => (
                <div key={i}>
                  {passengers.length > 1 && (
                    <p className={`mb-3 ${labelCls}`}>Passenger {i + 1}</p>
                  )}
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>First name</label>
                        <input type="text" value={p.given_name} onChange={(e) => updatePassenger(i, "given_name", e.target.value)} placeholder="John" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Last name</label>
                        <input type="text" value={p.family_name} onChange={(e) => updatePassenger(i, "family_name", e.target.value)} placeholder="Doe" className={inputCls} />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Date of birth</label>
                      <input type="date" value={p.born_on} onChange={(e) => updatePassenger(i, "born_on", e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Email</label>
                      <input type="email" value={p.email} onChange={(e) => updatePassenger(i, "email", e.target.value)} placeholder="john@example.com" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Phone (E.164 e.g. +14155550123)</label>
                      <input type="tel" value={p.phone_number} onChange={(e) => updatePassenger(i, "phone_number", e.target.value)} placeholder="+14155550123" className={inputCls} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Title</label>
                        <select value={p.title} onChange={(e) => updatePassenger(i, "title", e.target.value as PassengerForm["title"])} className={inputCls}>
                          <option value="mr">Mr</option>
                          <option value="ms">Ms</option>
                          <option value="mrs">Mrs</option>
                          <option value="dr">Dr</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Gender</label>
                        <select value={p.gender} onChange={(e) => updatePassenger(i, "gender", e.target.value as PassengerForm["gender"])} className={inputCls}>
                          <option value="m">Male</option>
                          <option value="f">Female</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex gap-3 pt-1">
                <button onClick={() => setStep("results")} className={btnSecondary}>Back</button>
                <button
                  onClick={() => setStep("confirm")}
                  disabled={!passengerFormValid()}
                  className={`flex-1 ${btnPrimary}`}
                >
                  Review booking
                </button>
              </div>
            </div>
          )}

          {/* Confirm */}
          {!loading && step === "confirm" && selectedOffer && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] p-4 dark:border-white/10 dark:bg-dm-elevated">
                <p className="text-xs font-semibold text-[color:var(--on-surface-muted)] dark:text-neutral-500">Flight</p>
                {seg && (
                  <>
                    <p className="mt-1 font-semibold text-[color:var(--on-surface)] dark:text-[#ebe9e4]">
                      {seg.marketing_carrier.name} {seg.marketing_carrier.iata_code}{seg.marketing_carrier_flight_number}
                    </p>
                    <p className="mt-0.5 text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-400">
                      {seg.origin.iata_code} → {seg.destination.iata_code} · {fmtDatetime(seg.departing_at)}
                    </p>
                  </>
                )}
              </div>

              <div className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] p-4 dark:border-white/10 dark:bg-dm-elevated">
                <p className="text-xs font-semibold text-[color:var(--on-surface-muted)] dark:text-neutral-500">Passengers</p>
                {passengers.map((p, i) => (
                  <p key={i} className="mt-1 text-sm text-[color:var(--on-surface)] dark:text-[#ebe9e4]">
                    {p.given_name} {p.family_name} · {p.email}
                  </p>
                ))}
              </div>

              <div className="rounded-2xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] p-4 dark:border-white/15 dark:bg-dm-page">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-[color:var(--on-surface)] dark:text-[#ebe9e4]">Total</p>
                  <p className="text-xl font-bold text-[#2563EB] dark:text-[#60A5FA]">
                    {fmtCurrency(selectedOffer.total_amount, selectedOffer.total_currency)}
                  </p>
                </div>
                {isMock && (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    Test mode — no real payment will be charged.
                  </p>
                )}
              </div>

              {error && (
                <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-300">
                  {error}
                </p>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStep("passenger-details")} className={btnSecondary}>Back</button>
                <button onClick={() => void handleBook()} className={`flex-1 ${btnPrimary}`}>
                  Confirm &amp; book
                </button>
              </div>
            </div>
          )}

          {/* Done */}
          {step === "done" && booking && (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <svg className="h-7 w-7 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div>
                <p className="text-lg font-semibold text-[color:var(--on-surface)] dark:text-[#ebe9e4]">Flight booked!</p>
                <p className="mt-1 text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-400">
                  Booking reference:{" "}
                  <span className="font-mono font-bold text-[color:var(--on-surface)] dark:text-[#ebe9e4]">
                    {booking.bookingReference}
                  </span>
                </p>
                {booking.isMock && (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    Test booking — no real charges made.
                  </p>
                )}
              </div>
              <button onClick={onClose} className={btnPrimary}>Done</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
