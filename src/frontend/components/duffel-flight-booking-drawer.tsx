"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DuffelOffer,
  DuffelFlightPassenger,
  DuffelFlightBookingRecord,
} from "@/shared/duffel-flights";

type AirportSuggestion = { iata: string; name: string; city: string; country: string };

/** Type city/airport/code → pick an airport (resolves to IATA). Duffel-backed, no SerpAPI. */
function AirportAutocomplete({
  tripId,
  label,
  valueIata,
  onChange,
}: {
  tripId: string;
  label: string;
  valueIata: string;
  onChange: (iata: string) => void;
}) {
  const [query, setQuery] = useState(valueIata);
  const [suggestions, setSuggestions] = useState<AirportSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(valueIata);
  }, [valueIata]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/trip-plans/${tripId}/duffel/flights/airport-search?q=${encodeURIComponent(q)}`, {
          credentials: "include",
        });
        const j = (await r.json()) as { airports?: AirportSuggestion[] };
        if (!cancelled) setSuggestions(j.airports ?? []);
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, tripId]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={boxRef} className="relative flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)]">{label}</span>
      <input
        value={query}
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          setOpen(true);
          const code = v.trim().toUpperCase();
          if (/^[A-Z]{3}$/.test(code)) onChange(code);
        }}
        onFocus={() => setOpen(true)}
        placeholder="City, airport, or code"
        className="rounded-lg border border-[color:var(--hairline-strong)] bg-white px-2 py-1.5 text-sm text-[color:var(--on-surface)] dark:border-white/15 dark:bg-dm-page dark:text-white"
      />
      {open && suggestions.length > 0 ? (
        <ul className="absolute top-full z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-[color:var(--hairline-strong)] bg-white shadow-lg dark:border-white/15 dark:bg-dm-page">
          {suggestions.map((s) => (
            <li key={s.iata}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(s.iata);
                  setQuery(s.iata);
                  setOpen(false);
                }}
                className="flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm hover:bg-[color:var(--surface-container-low)] dark:hover:bg-white/[0.06]"
              >
                <span className="font-semibold text-[color:var(--on-surface)] dark:text-white">{s.iata}</span>
                <span className="truncate text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-400">
                  {[s.city, s.name].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

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
  returnDate?: string | null; // YYYY-MM-DD — enables round-trip when present
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

/** Normalize a phone number to E.164 format required by Duffel. */
function normalizePhone(raw: string): string {
  // Strip everything except digits and leading +
  const stripped = raw.replace(/[\s\-().]/g, "");
  if (stripped.startsWith("+")) return stripped;
  // 10-digit US number → +1...
  if (/^\d{10}$/.test(stripped)) return `+1${stripped}`;
  // 11-digit starting with 1 → +1...
  if (/^1\d{10}$/.test(stripped)) return `+${stripped}`;
  // Best effort: prepend + so Duffel at least sees international format
  return `+${stripped}`;
}

/** Returns true if the born_on date makes this passenger ≥18 years old. */
function isAdult(born_on: string): boolean {
  if (!born_on) return false;
  const dob = new Date(`${born_on}T00:00:00`);
  if (isNaN(dob.getTime())) return false;
  const now = new Date();
  const age = now.getFullYear() - dob.getFullYear() -
    (now < new Date(now.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0);
  return age >= 18;
}

type PassengerFieldErrors = Partial<Record<keyof PassengerForm, string>>;

function validatePassenger(p: PassengerForm): PassengerFieldErrors {
  const errors: PassengerFieldErrors = {};
  if (!p.given_name.trim()) errors.given_name = "Required";
  if (!p.family_name.trim()) errors.family_name = "Required";
  if (!p.email.trim() || !p.email.includes("@")) errors.email = "Valid email required";
  if (!p.born_on) {
    errors.born_on = "Required";
  } else if (!isAdult(p.born_on)) {
    errors.born_on = "Passenger must be 18 or older for an adult ticket";
  }
  if (!p.phone_number.trim()) {
    errors.phone_number = "Required";
  } else {
    const normalized = normalizePhone(p.phone_number);
    if (!/^\+\d{7,15}$/.test(normalized)) {
      errors.phone_number = "Enter a valid international number, e.g. +14155550123";
    }
  }
  return errors;
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
  returnDate,
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
  const [paxErrors, setPaxErrors] = useState<PassengerFieldErrors[]>([]);
  const [booking, setBooking] = useState<DuffelFlightBookingRecord | null>(null);
  // Editable search fields (seeded from props; user can change and re-search).
  const [searchOrigin, setSearchOrigin] = useState(origin);
  const [searchDestination, setSearchDestination] = useState(destination);
  const [searchDate, setSearchDate] = useState(departureDate);
  const [searchReturnDate, setSearchReturnDate] = useState(returnDate ?? "");
  const [searchPax, setSearchPax] = useState(Math.max(1, passengerCount));
  const [searchCabin, setSearchCabin] = useState<"economy" | "premium_economy" | "business" | "first">("economy");

  const runSearch = useCallback(
    async (p: { origin: string; destination: string; date: string; returnDate?: string; pax: number; cabin: string }) => {
      setLoading(true);
      setError(null);
      setOffers(null);
      try {
        const params = new URLSearchParams({
          origin: p.origin.trim().toUpperCase(),
          destination: p.destination.trim().toUpperCase(),
          date: p.date,
          passengers: String(Math.max(1, p.pax)),
          cabin: p.cabin,
        });
        if (p.returnDate && p.returnDate > p.date) params.set("returnDate", p.returnDate);
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
    },
    [tripId]
  );

  // Fetch when drawer opens — reset editable fields to the incoming flight.
  const handleOpen = useCallback(() => {
    setStep("results");
    setSelectedOffer(null);
    setBooking(null);
    setError(null);
    setPaxErrors([]);
    setSearchOrigin(origin);
    setSearchDestination(destination);
    setSearchDate(departureDate);
    setSearchReturnDate(returnDate ?? "");
    setSearchPax(Math.max(1, passengerCount));
    setSearchCabin("economy");
    void runSearch({ origin, destination, date: departureDate, returnDate: returnDate ?? undefined, pax: passengerCount, cabin: "economy" });
  }, [runSearch, origin, destination, departureDate, returnDate, passengerCount]);

  const handleSelectOffer = useCallback((offer: DuffelOffer) => {
    setSelectedOffer(offer);
    setPassengers(Array.from({ length: offer.passengers.length }, blankPassenger));
    setPaxErrors(Array.from({ length: offer.passengers.length }, () => ({})));
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
        phone_number: normalizePhone(p.phone_number),
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
    // Clear the error for this field as the user types
    setPaxErrors((prev) => prev.map((e, idx) => idx === i ? { ...e, [field]: undefined } : e));
  }

  function handleReviewBooking() {
    const allErrors = passengers.map(validatePassenger);
    setPaxErrors(allErrors);
    if (allErrors.some((e) => Object.keys(e).length > 0)) return;
    setStep("confirm");
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

          {/* Editable search — origin/destination/date/travelers/cabin */}
          {step === "results" && (
            <div className="mb-4 grid grid-cols-2 gap-3 rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] p-4 dark:border-white/10 dark:bg-white/[0.03] sm:grid-cols-3">
              <AirportAutocomplete tripId={tripId} label="From" valueIata={searchOrigin} onChange={setSearchOrigin} />
              <AirportAutocomplete tripId={tripId} label="To" valueIata={searchDestination} onChange={setSearchDestination} />
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)]">
                Depart
                <input
                  type="date"
                  value={searchDate}
                  onChange={(e) => setSearchDate(e.target.value)}
                  className="rounded-lg border border-[color:var(--hairline-strong)] bg-white px-2 py-1.5 text-sm text-[color:var(--on-surface)] dark:border-white/15 dark:bg-dm-page dark:text-white"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)]">
                Return <span className="normal-case text-[color:var(--on-surface-muted)]">(optional)</span>
                <input
                  type="date"
                  value={searchReturnDate}
                  min={searchDate || undefined}
                  onChange={(e) => setSearchReturnDate(e.target.value)}
                  className="rounded-lg border border-[color:var(--hairline-strong)] bg-white px-2 py-1.5 text-sm text-[color:var(--on-surface)] dark:border-white/15 dark:bg-dm-page dark:text-white"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)]">
                Travelers
                <input
                  type="number"
                  min={1}
                  max={9}
                  value={searchPax}
                  onChange={(e) => setSearchPax(Math.max(1, Math.min(9, Number(e.target.value) || 1)))}
                  className="rounded-lg border border-[color:var(--hairline-strong)] bg-white px-2 py-1.5 text-sm text-[color:var(--on-surface)] dark:border-white/15 dark:bg-dm-page dark:text-white"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)]">
                Cabin
                <select
                  value={searchCabin}
                  onChange={(e) => setSearchCabin(e.target.value as typeof searchCabin)}
                  className="rounded-lg border border-[color:var(--hairline-strong)] bg-white px-2 py-1.5 text-sm text-[color:var(--on-surface)] dark:border-white/15 dark:bg-dm-page dark:text-white"
                >
                  <option value="economy">Economy</option>
                  <option value="premium_economy">Premium economy</option>
                  <option value="business">Business</option>
                  <option value="first">First</option>
                </select>
              </label>
              <button
                type="button"
                disabled={loading}
                onClick={() => void runSearch({ origin: searchOrigin, destination: searchDestination, date: searchDate, returnDate: searchReturnDate || undefined, pax: searchPax, cabin: searchCabin })}
                className="self-end rounded-full bg-[#1c1c17] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2a2a26] disabled:opacity-50 dark:bg-neutral-200 dark:text-[#1a1a1a] dark:hover:bg-white"
              >
                Search
              </button>
            </div>
          )}

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
                <button onClick={() => void runSearch({ origin: searchOrigin, destination: searchDestination, date: searchDate, returnDate: searchReturnDate || undefined, pax: searchPax, cabin: searchCabin })} className={`mt-3 ${btnSecondary}`}>
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
              {passengers.map((p, i) => {
                const errs = paxErrors[i] ?? {};
                const fieldErr = (f: keyof PassengerForm) =>
                  errs[f] ? <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{errs[f]}</p> : null;
                const inputErrCls = (f: keyof PassengerForm) =>
                  errs[f]
                    ? inputCls.replace("border-[color:var(--hairline-strong)]", "border-red-400 dark:border-red-500")
                    : inputCls;
                return (
                  <div key={i}>
                    {passengers.length > 1 && (
                      <p className={`mb-3 ${labelCls}`}>Passenger {i + 1}</p>
                    )}
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelCls}>First name</label>
                          <input type="text" value={p.given_name} onChange={(e) => updatePassenger(i, "given_name", e.target.value)} placeholder="John" className={inputErrCls("given_name")} />
                          {fieldErr("given_name")}
                        </div>
                        <div>
                          <label className={labelCls}>Last name</label>
                          <input type="text" value={p.family_name} onChange={(e) => updatePassenger(i, "family_name", e.target.value)} placeholder="Doe" className={inputErrCls("family_name")} />
                          {fieldErr("family_name")}
                        </div>
                      </div>
                      <div>
                        <label className={labelCls}>Date of birth (must be 18+)</label>
                        <input type="date" value={p.born_on} onChange={(e) => updatePassenger(i, "born_on", e.target.value)} className={inputErrCls("born_on")} />
                        {fieldErr("born_on")}
                      </div>
                      <div>
                        <label className={labelCls}>Email</label>
                        <input type="email" value={p.email} onChange={(e) => updatePassenger(i, "email", e.target.value)} placeholder="john@example.com" className={inputErrCls("email")} />
                        {fieldErr("email")}
                      </div>
                      <div>
                        <label className={labelCls}>Phone</label>
                        <input type="tel" value={p.phone_number} onChange={(e) => updatePassenger(i, "phone_number", e.target.value)} placeholder="+14155550123" className={inputErrCls("phone_number")} />
                        {fieldErr("phone_number")}
                        <p className="mt-1 text-[10px] text-[color:var(--on-surface-muted)] dark:text-neutral-600">
                          Include country code — e.g. +1 for US
                        </p>
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
                );
              })}

              <div className="flex gap-3 pt-1">
                <button onClick={() => setStep("results")} className={btnSecondary}>Back</button>
                <button onClick={handleReviewBooking} className={`flex-1 ${btnPrimary}`}>
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
