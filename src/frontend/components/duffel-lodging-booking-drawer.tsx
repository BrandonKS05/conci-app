"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import type {
  DuffelStayResult,
  DuffelRate,
  DuffelAccommodation,
  DuffelBookingGuestDetails,
  DuffelBookingRecord,
} from "@/shared/duffel-stays";

// ─── Shared style tokens ────────────────────────────────────────────────────

const inputCls =
  "mt-1 w-full rounded-xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-low)] px-3 py-2.5 text-sm text-[color:var(--on-surface)] outline-none focus:border-[color:var(--hairline-strong)] dark:border-white/15 dark:bg-dm-page dark:text-[#ebe9e4]";
const labelCls =
  "text-[11px] font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:text-neutral-500";
const btnPrimary =
  "rounded-xl bg-[#1c1c17] px-4 py-2.5 text-sm font-semibold tracking-wide text-[color:var(--surface)] shadow-md transition hover:bg-[#2a2a26] disabled:pointer-events-none disabled:opacity-40 dark:bg-neutral-200 dark:text-dm-page dark:hover:bg-white";
const btnSecondary =
  "rounded-xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] px-4 py-2.5 text-sm font-semibold text-[color:var(--on-surface)] transition hover:bg-[color:var(--surface-container-low)] dark:border-white/15 dark:bg-dm-page dark:text-[#ebe9e4]";

// ─── Types ──────────────────────────────────────────────────────────────────

type Step = "search" | "results" | "rate-select" | "guest-details" | "confirm" | "done";

type SearchForm = {
  destination: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  rooms: number;
};

type GuestForm = {
  given_name: string;
  family_name: string;
  email: string;
  phone_number: string;
  special_requests: string;
};

export type DuffelBookingDrawerProps = {
  open: boolean;
  onClose: () => void;
  tripId: string;
  initialDestination?: string;
  initialCheckIn?: string;
  initialCheckOut?: string;
  initialGuests?: number;
  initialRooms?: number;
  onBookingComplete?: (booking: DuffelBookingRecord) => void;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtCurrency(amount: string, currency: string): string {
  const n = parseFloat(amount);
  if (isNaN(n)) return `${currency} ${amount}`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function boardTypeLabel(bt: DuffelRate["board_type"]): string {
  switch (bt) {
    case "breakfast": return "Breakfast included";
    case "half_board": return "Half board";
    case "full_board": return "Full board";
    case "all_inclusive": return "All inclusive";
    default: return "Room only";
  }
}

function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.max(
    1,
    Math.round(
      (new Date(`${checkOut}T12:00:00`).getTime() - new Date(`${checkIn}T12:00:00`).getTime()) /
        86400000
    )
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function MockBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
      Test mode
    </span>
  );
}

function StepBreadcrumb({ step, isMock }: { step: Step; isMock: boolean }) {
  const steps: { id: Step; label: string }[] = [
    { id: "results", label: "Browse" },
    { id: "rate-select", label: "Select rate" },
    { id: "guest-details", label: "Guest info" },
    { id: "confirm", label: "Confirm" },
  ];
  const activeIdx = steps.findIndex((s) => s.id === step);

  return (
    <div className="flex items-center gap-1.5">
      {isMock && <MockBadge />}
      {steps.map((s, i) => (
        <span
          key={s.id}
          className={[
            "text-xs font-medium",
            i < activeIdx
              ? "text-[color:var(--on-surface-muted)] dark:text-neutral-500"
              : i === activeIdx
                ? "text-[color:var(--on-surface)] dark:text-[#ebe9e4]"
                : "text-[color:var(--on-surface-muted)]/50 dark:text-neutral-600",
          ].join(" ")}
        >
          {i > 0 && <span className="mr-1.5 opacity-40">›</span>}
          {s.label}
        </span>
      ))}
    </div>
  );
}

function AccommodationPhoto({ result }: { result: DuffelStayResult }) {
  const photo = result.accommodation.photos[0];
  if (!photo) {
    return (
      <div className="aspect-[16/9] w-full rounded-xl bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800" />
    );
  }
  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-800">
      <Image src={photo.url} alt={result.accommodation.name} fill className="object-cover" unoptimized />
    </div>
  );
}

function RateCard({
  rate,
  nights,
  onSelect,
  selected,
}: {
  rate: DuffelRate;
  nights: number;
  onSelect: () => void;
  selected: boolean;
}) {
  const nightly = parseFloat(rate.total_amount) / nights;
  const refundDeadline = rate.cancellation_timeline[0];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "w-full rounded-xl border p-4 text-left transition",
        selected
          ? "border-[#2563EB] bg-blue-50 dark:border-blue-400 dark:bg-blue-950/30"
          : "border-[color:var(--hairline)] hover:border-[color:var(--hairline-strong)] dark:border-white/10 dark:hover:border-white/20",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="font-semibold text-[color:var(--on-surface)] dark:text-[#ebe9e4]">
            {boardTypeLabel(rate.board_type)}
          </p>
          {rate.rooms[0] && (
            <p className="text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-400">
              {rate.rooms[0].name ?? `${rate.rooms[0].beds[0]?.type ?? ""} bed`}
            </p>
          )}
          {refundDeadline && (
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              Free cancellation before {fmtDate(refundDeadline.before)}
            </p>
          )}
          {!refundDeadline && (
            <p className="text-xs text-amber-700 dark:text-amber-400">Non-refundable</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold text-[color:var(--on-surface)] dark:text-white">
            {fmtCurrency(String(Math.round(nightly)), rate.total_currency)}
          </p>
          <p className="text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-400">/night</p>
          <p className="mt-0.5 text-sm font-medium text-[color:var(--on-surface)] dark:text-neutral-200">
            {fmtCurrency(rate.total_amount, rate.total_currency)} total
          </p>
        </div>
      </div>
      {selected && (
        <p className="mt-2 text-xs font-semibold text-[#2563EB] dark:text-blue-400">Selected</p>
      )}
    </button>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function DuffelLodgingBookingDrawer({
  open,
  onClose,
  tripId,
  initialDestination = "",
  initialCheckIn = "",
  initialCheckOut = "",
  initialGuests = 2,
  initialRooms = 1,
  onBookingComplete,
}: DuffelBookingDrawerProps) {
  const [step, setStep] = useState<Step>("search");
  const [isMock, setIsMock] = useState(false);

  // Search state
  const [form, setForm] = useState<SearchForm>({
    destination: initialDestination,
    checkIn: initialCheckIn,
    checkOut: initialCheckOut,
    guests: initialGuests,
    rooms: initialRooms,
  });
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<DuffelStayResult[]>([]);

  // Rate selection state
  const [selectedResult, setSelectedResult] = useState<DuffelStayResult | null>(null);
  const [selectedRate, setSelectedRate] = useState<DuffelRate | null>(null);
  const [quotedRate, setQuotedRate] = useState<DuffelRate | null>(null);
  const [quotedAccommodation, setQuotedAccommodation] = useState<DuffelAccommodation | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Guest details state
  const [guestForm, setGuestForm] = useState<GuestForm>({
    given_name: "",
    family_name: "",
    email: "",
    phone_number: "",
    special_requests: "",
  });
  const [guestError, setGuestError] = useState<string | null>(null);

  // Booking state
  const [booking, setBooking] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<DuffelBookingRecord | null>(null);

  const resetToSearch = useCallback(() => {
    setStep("search");
    setSearchError(null);
    setResults([]);
    setSelectedResult(null);
    setSelectedRate(null);
    setQuotedRate(null);
    setQuotedAccommodation(null);
    setQuoteError(null);
    setGuestError(null);
    setBookError(null);
    setConfirmedBooking(null);
    setIsMock(false);
  }, []);

  const handleSearch = useCallback(async () => {
    const dest = form.destination.trim();
    if (dest.length < 2 || !form.checkIn || !form.checkOut || form.checkIn >= form.checkOut) {
      setSearchError("Enter a destination and valid date range.");
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const params = new URLSearchParams({
        destination: dest,
        checkIn: form.checkIn,
        checkOut: form.checkOut,
        guests: String(form.guests),
        rooms: String(form.rooms),
      });
      const res = await fetch(`/api/trip-plans/${tripId}/duffel/stays/search?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json()) as {
        results?: DuffelStayResult[];
        searchId?: string;
        isMock?: boolean;
        error?: string;
      };
      if (!res.ok || data.error) {
        setSearchError(data.error ?? `Search failed (${res.status})`);
        return;
      }
      setResults(data.results ?? []);
      setIsMock(data.isMock ?? false);
      setStep("results");
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }, [form, tripId]);

  const handleSelectResult = useCallback((result: DuffelStayResult) => {
    setSelectedResult(result);
    setSelectedRate(result.rates[0] ?? null);
    setStep("rate-select");
  }, []);

  const handleConfirmRate = useCallback(async () => {
    if (!selectedRate) return;
    setQuoting(true);
    setQuoteError(null);
    try {
      const res = await fetch(`/api/trip-plans/${tripId}/duffel/stays/quote`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rateId: selectedRate.id }),
      });
      const data = (await res.json()) as {
        rate?: DuffelRate;
        accommodation?: DuffelAccommodation;
        isMock?: boolean;
        error?: string;
      };
      if (!res.ok || data.error) {
        setQuoteError(data.error ?? "Rate check failed.");
        return;
      }
      if (data.rate) setQuotedRate(data.rate);
      if (data.accommodation) setQuotedAccommodation(data.accommodation);
      if (data.isMock !== undefined) setIsMock(data.isMock);
      setStep("guest-details");
    } catch (e) {
      setQuoteError(e instanceof Error ? e.message : "Rate check failed.");
    } finally {
      setQuoting(false);
    }
  }, [selectedRate, tripId]);

  const validateGuest = useCallback((): boolean => {
    if (!guestForm.given_name.trim()) { setGuestError("First name is required."); return false; }
    if (!guestForm.family_name.trim()) { setGuestError("Last name is required."); return false; }
    if (!guestForm.email.trim() || !guestForm.email.includes("@")) {
      setGuestError("A valid email is required."); return false;
    }
    setGuestError(null);
    return true;
  }, [guestForm]);

  const handleBook = useCallback(async () => {
    if (!validateGuest()) return;
    const effectiveRate = quotedRate ?? selectedRate;
    if (!effectiveRate || !selectedResult) return;

    setBooking(true);
    setBookError(null);

    const guest: DuffelBookingGuestDetails = {
      given_name: guestForm.given_name.trim(),
      family_name: guestForm.family_name.trim(),
      email: guestForm.email.trim(),
      phone_number: guestForm.phone_number.trim() || "+10000000000",
      type: "adult",
    };

    const accommodation = quotedAccommodation ?? selectedResult.accommodation;

    try {
      const res = await fetch(`/api/trip-plans/${tripId}/duffel/stays/book`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rateId: effectiveRate.id,
          guests: [guest],
          specialRequests: guestForm.special_requests.trim() || null,
          checkInDate: form.checkIn,
          checkOutDate: form.checkOut,
          accommodationName: accommodation.name,
          accommodationId: accommodation.id,
          destinationCity: accommodation.location.address.city_name,
          totalAmount: effectiveRate.total_amount,
          currency: effectiveRate.total_currency,
        }),
      });
      const data = (await res.json()) as { booking?: DuffelBookingRecord; error?: string };
      if (!res.ok || data.error) {
        setBookError(data.error ?? "Booking failed.");
        return;
      }
      if (data.booking) {
        setConfirmedBooking(data.booking);
        setStep("done");
        onBookingComplete?.(data.booking);
      }
    } catch (e) {
      setBookError(e instanceof Error ? e.message : "Booking failed.");
    } finally {
      setBooking(false);
    }
  }, [
    validateGuest,
    quotedRate,
    selectedRate,
    selectedResult,
    guestForm,
    quotedAccommodation,
    tripId,
    form.checkIn,
    form.checkOut,
    onBookingComplete,
  ]);

  if (!open) return null;

  const nights = form.checkIn && form.checkOut ? nightsBetween(form.checkIn, form.checkOut) : 1;
  const effectiveRate = quotedRate ?? selectedRate;
  const accommodation = quotedAccommodation ?? selectedResult?.accommodation ?? null;

  return (
    <div
      className="fixed inset-0 z-[220] flex flex-col justify-end sm:items-center sm:justify-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="duffel-booking-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[min(94dvh,860px)] w-full max-w-xl flex-col overflow-hidden rounded-t-[1.35rem] border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] shadow-2xl dark:border-white/10 dark:bg-dm-card sm:max-h-[min(90vh,840px)] sm:rounded-2xl">
        {/* Header */}
        <div className="shrink-0 border-b border-[color:var(--hairline)] px-5 pb-4 pt-5 dark:border-white/10 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2
                id="duffel-booking-title"
                className="font-display text-xl font-semibold tracking-tight text-[color:var(--on-surface)] dark:text-[#ebe9e4]"
              >
                {step === "done" ? "Booking confirmed" : "Book a stay"}
              </h2>
              {step !== "search" && step !== "done" && (
                <div className="mt-1">
                  <StepBreadcrumb step={step} isMock={isMock} />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-sm text-[color:var(--on-surface-muted)] hover:bg-[color:var(--surface-container-low)] dark:text-neutral-400 dark:hover:bg-white/10"
            >
              Close
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
          {step === "search" && (
            <SearchStep
              form={form}
              setForm={setForm}
              searching={searching}
              error={searchError}
              onSearch={() => void handleSearch()}
            />
          )}

          {step === "results" && (
            <ResultsStep
              results={results}
              nights={nights}
              checkIn={form.checkIn}
              checkOut={form.checkOut}
              onSelect={handleSelectResult}
              onBack={() => setStep("search")}
            />
          )}

          {step === "rate-select" && selectedResult && (
            <RateSelectStep
              result={selectedResult}
              selectedRate={selectedRate}
              nights={nights}
              quoting={quoting}
              quoteError={quoteError}
              onSelectRate={setSelectedRate}
              onConfirm={() => void handleConfirmRate()}
              onBack={() => setStep("results")}
            />
          )}

          {step === "guest-details" && accommodation && effectiveRate && (
            <GuestDetailsStep
              accommodation={accommodation}
              rate={effectiveRate}
              nights={nights}
              isMock={isMock}
              form={guestForm}
              setForm={setGuestForm}
              error={guestError}
              onNext={() => setStep("confirm")}
              onBack={() => setStep("rate-select")}
            />
          )}

          {step === "confirm" && accommodation && effectiveRate && (
            <ConfirmStep
              accommodation={accommodation}
              rate={effectiveRate}
              nights={nights}
              checkIn={form.checkIn}
              checkOut={form.checkOut}
              guest={guestForm}
              isMock={isMock}
              booking={booking}
              bookError={bookError}
              onBook={() => void handleBook()}
              onBack={() => setStep("guest-details")}
            />
          )}

          {step === "done" && confirmedBooking && (
            <DoneStep booking={confirmedBooking} onClose={onClose} onReset={resetToSearch} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step components ─────────────────────────────────────────────────────────

function SearchStep({
  form,
  setForm,
  searching,
  error,
  onSearch,
}: {
  form: SearchForm;
  setForm: (f: SearchForm) => void;
  searching: boolean;
  error: string | null;
  onSearch: () => void;
}) {
  const u = <K extends keyof SearchForm>(k: K, v: SearchForm[K]) => setForm({ ...form, [k]: v });
  const datesValid = form.checkIn && form.checkOut && form.checkIn < form.checkOut;

  return (
    <div className="space-y-4">
      <p className="text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-400">
        Search and book lodging inside Conci — powered by Duffel.
      </p>

      <div className="space-y-3 rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)]/60 p-4 dark:border-white/10 dark:bg-dm-page/40">
        <div>
          <label className={labelCls}>Destination</label>
          <input
            value={form.destination}
            onChange={(e) => u("destination", e.target.value)}
            className={inputCls}
            placeholder="City or neighborhood"
            autoComplete="off"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Check-in</label>
            <input
              type="date"
              value={form.checkIn}
              onChange={(e) => u("checkIn", e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Check-out</label>
            <input
              type="date"
              value={form.checkOut}
              onChange={(e) => u("checkOut", e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Guests</label>
            <input
              type="number"
              min={1}
              max={20}
              value={form.guests}
              onChange={(e) => u("guests", Math.max(1, parseInt(e.target.value, 10) || 1))}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Rooms</label>
            <input
              type="number"
              min={1}
              max={10}
              value={form.rooms}
              onChange={(e) => u("rooms", Math.max(1, parseInt(e.target.value, 10) || 1))}
              className={inputCls}
            />
          </div>
        </div>
        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300">
            {error}
          </p>
        )}
        <button
          type="button"
          className={btnPrimary}
          disabled={!datesValid || searching}
          onClick={onSearch}
        >
          {searching ? "Searching Duffel…" : "Search stays"}
        </button>
      </div>
    </div>
  );
}

function ResultsStep({
  results,
  nights,
  checkIn,
  checkOut,
  onSelect,
  onBack,
}: {
  results: DuffelStayResult[];
  nights: number;
  checkIn: string;
  checkOut: string;
  onSelect: (r: DuffelStayResult) => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[color:var(--on-surface)] dark:text-neutral-200">
          {results.length} {results.length === 1 ? "property" : "properties"} · {fmtDate(checkIn)} – {fmtDate(checkOut)} ({nights} night{nights !== 1 ? "s" : ""})
        </p>
        <button type="button" className={btnSecondary} onClick={onBack}>
          ← Edit search
        </button>
      </div>

      {results.length === 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-900 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-200">
          No properties found. Try a different city or dates.
        </p>
      )}

      <ul className="space-y-3">
        {results.map((r) => (
          <li key={r.id}>
            <ResultCard result={r} nights={nights} onSelect={() => onSelect(r)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResultCard({
  result,
  nights,
  onSelect,
}: {
  result: DuffelStayResult;
  nights: number;
  onSelect: () => void;
}) {
  const acc = result.accommodation;
  const photo = acc.photos[0];
  const nightly = parseFloat(result.cheapest_rate_total_amount) / nights;
  const rating = acc.rating?.value ? parseFloat(acc.rating.value) : null;

  return (
    <article className="overflow-hidden rounded-2xl border border-[color:var(--hairline)] bg-white shadow-sm transition hover:border-[color:var(--hairline-strong)] dark:border-white/10 dark:bg-[#1a1a1a]">
      {photo ? (
        <div className="relative h-40 w-full bg-neutral-100 dark:bg-neutral-800">
          <Image src={photo.url} alt={acc.name} fill className="object-cover" unoptimized />
        </div>
      ) : (
        <div className="h-40 w-full bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800" />
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold leading-snug text-[color:var(--on-surface)] dark:text-[#ebe9e4]">
              {acc.name}
            </h3>
            <p className="mt-0.5 text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-400">
              {acc.location.address.line_one ?? acc.location.address.city_name}
            </p>
          </div>
          <div className="shrink-0 text-right">
            {rating && (
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                ★ {rating.toFixed(1)}
              </p>
            )}
            {!isNaN(nightly) && (
              <p className="text-sm font-bold text-[color:var(--on-surface)] dark:text-white">
                {fmtCurrency(String(Math.round(nightly)), result.cheapest_rate_currency)}/night
              </p>
            )}
          </div>
        </div>
        {acc.description && (
          <p className="mt-2 line-clamp-2 text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-300">
            {acc.description.text}
          </p>
        )}
        {acc.amenities.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {acc.amenities.slice(0, 3).map((a) => (
              <span
                key={a.type}
                className="rounded-full bg-[color:var(--surface-container-low)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--on-surface-muted)] dark:bg-white/10 dark:text-neutral-400"
              >
                {a.description}
              </span>
            ))}
          </div>
        )}
        <button type="button" className={`${btnPrimary} mt-3 w-full`} onClick={onSelect}>
          See rates
        </button>
      </div>
    </article>
  );
}

function RateSelectStep({
  result,
  selectedRate,
  nights,
  quoting,
  quoteError,
  onSelectRate,
  onConfirm,
  onBack,
}: {
  result: DuffelStayResult;
  selectedRate: DuffelRate | null;
  nights: number;
  quoting: boolean;
  quoteError: string | null;
  onSelectRate: (r: DuffelRate) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const acc = result.accommodation;

  return (
    <div className="space-y-4">
      <button type="button" className="text-sm text-[color:var(--on-surface-muted)] hover:underline dark:text-neutral-400" onClick={onBack}>
        ← Back to results
      </button>

      <AccommodationPhoto result={result} />

      <div>
        <h3 className="font-display text-lg font-semibold text-[color:var(--on-surface)] dark:text-[#ebe9e4]">
          {acc.name}
        </h3>
        <p className="mt-0.5 text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-400">
          {acc.location.address.city_name}
          {acc.check_in_information && (
            <> · Check-in {acc.check_in_information.check_in_after_time ?? "15:00"} · Check-out {acc.check_in_information.check_out_before_time ?? "11:00"}</>
          )}
        </p>
      </div>

      <div className="space-y-2">
        <p className={labelCls}>Available rates ({nights} night{nights !== 1 ? "s" : ""})</p>
        {result.rates.map((rate) => (
          <RateCard
            key={rate.id}
            rate={rate}
            nights={nights}
            onSelect={() => onSelectRate(rate)}
            selected={selectedRate?.id === rate.id}
          />
        ))}
      </div>

      {quoteError && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300">
          {quoteError}
        </p>
      )}

      <button
        type="button"
        className={`${btnPrimary} w-full`}
        disabled={!selectedRate || quoting}
        onClick={onConfirm}
      >
        {quoting ? "Checking rate…" : "Confirm rate & continue"}
      </button>
    </div>
  );
}

function GuestDetailsStep({
  accommodation,
  rate,
  nights,
  isMock,
  form,
  setForm,
  error,
  onNext,
  onBack,
}: {
  accommodation: DuffelAccommodation;
  rate: DuffelRate;
  nights: number;
  isMock: boolean;
  form: GuestForm;
  setForm: (f: GuestForm) => void;
  error: string | null;
  onNext: () => void;
  onBack: () => void;
}) {
  const u = <K extends keyof GuestForm>(k: K, v: GuestForm[K]) => setForm({ ...form, [k]: v });

  return (
    <div className="space-y-4">
      <button type="button" className="text-sm text-[color:var(--on-surface-muted)] hover:underline dark:text-neutral-400" onClick={onBack}>
        ← Back to rates
      </button>

      <div className="rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] p-3 dark:border-white/10 dark:bg-dm-page/40">
        <p className="text-sm font-semibold text-[color:var(--on-surface)] dark:text-[#ebe9e4]">{accommodation.name}</p>
        <p className="mt-0.5 text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-400">
          {boardTypeLabel(rate.board_type)} · {fmtCurrency(rate.total_amount, rate.total_currency)} for {nights} night{nights !== 1 ? "s" : ""}
        </p>
      </div>

      {isMock && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800/40 dark:bg-amber-950/20">
          <p className="font-semibold text-amber-900 dark:text-amber-200">Test mode — no real booking</p>
          <p className="mt-0.5 text-amber-800 dark:text-amber-300">Add DUFFEL_ACCESS_TOKEN to enable live bookings. Guest info saved for the trip record.</p>
        </div>
      )}

      <div className="space-y-3">
        <p className={`${labelCls} mb-1`}>Lead guest details</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>First name *</label>
            <input value={form.given_name} onChange={(e) => u("given_name", e.target.value)} className={inputCls} placeholder="Jane" />
          </div>
          <div>
            <label className={labelCls}>Last name *</label>
            <input value={form.family_name} onChange={(e) => u("family_name", e.target.value)} className={inputCls} placeholder="Smith" />
          </div>
        </div>
        <div>
          <label className={labelCls}>Email *</label>
          <input type="email" value={form.email} onChange={(e) => u("email", e.target.value)} className={inputCls} placeholder="jane@example.com" />
        </div>
        <div>
          <label className={labelCls}>Phone number</label>
          <input type="tel" value={form.phone_number} onChange={(e) => u("phone_number", e.target.value)} className={inputCls} placeholder="+1 555 000 0000" />
        </div>
        <div>
          <label className={labelCls}>Special requests (optional)</label>
          <textarea
            value={form.special_requests}
            onChange={(e) => u("special_requests", e.target.value)}
            className={`${inputCls} min-h-[72px] resize-y`}
            placeholder="Dietary requirements, late check-in, etc."
          />
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300">
          {error}
        </p>
      )}

      <button type="button" className={`${btnPrimary} w-full`} onClick={onNext}>
        Review & confirm booking
      </button>
    </div>
  );
}

function ConfirmStep({
  accommodation,
  rate,
  nights,
  checkIn,
  checkOut,
  guest,
  isMock,
  booking,
  bookError,
  onBook,
  onBack,
}: {
  accommodation: DuffelAccommodation;
  rate: DuffelRate;
  nights: number;
  checkIn: string;
  checkOut: string;
  guest: GuestForm;
  isMock: boolean;
  booking: boolean;
  bookError: string | null;
  onBook: () => void;
  onBack: () => void;
}) {
  const refundBefore = rate.cancellation_timeline[0];

  return (
    <div className="space-y-4">
      <button type="button" className="text-sm text-[color:var(--on-surface-muted)] hover:underline dark:text-neutral-400" onClick={onBack}>
        ← Edit guest details
      </button>

      <div className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] p-4 dark:border-white/10 dark:bg-dm-page/60">
        <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:text-neutral-500">Property</p>
        <p className="mt-1 font-semibold text-[color:var(--on-surface)] dark:text-[#ebe9e4]">{accommodation.name}</p>
        <p className="text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-400">{accommodation.location.address.city_name}</p>

        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:text-neutral-500">Check-in</p>
            <p className="mt-0.5 font-medium text-[color:var(--on-surface)] dark:text-[#ebe9e4]">{fmtDate(checkIn)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:text-neutral-500">Check-out</p>
            <p className="mt-0.5 font-medium text-[color:var(--on-surface)] dark:text-[#ebe9e4]">{fmtDate(checkOut)}</p>
          </div>
        </div>

        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:text-neutral-500">Rate</p>
          <p className="mt-0.5 font-medium text-[color:var(--on-surface)] dark:text-[#ebe9e4]">{boardTypeLabel(rate.board_type)}</p>
          {rate.rooms[0]?.name && (
            <p className="text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-400">{rate.rooms[0].name}</p>
          )}
        </div>

        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:text-neutral-500">Cancellation</p>
          {refundBefore ? (
            <p className="mt-0.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
              Free cancellation before {fmtDate(refundBefore.before)}
            </p>
          ) : (
            <p className="mt-0.5 text-sm font-medium text-amber-700 dark:text-amber-400">Non-refundable</p>
          )}
        </div>

        <div className="mt-3 border-t border-[color:var(--hairline)] pt-3 dark:border-white/10">
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:text-neutral-500">Guest</p>
          <p className="mt-0.5 font-medium text-[color:var(--on-surface)] dark:text-[#ebe9e4]">
            {guest.given_name} {guest.family_name}
          </p>
          <p className="text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-400">{guest.email}</p>
        </div>

        <div className="mt-3 border-t border-[color:var(--hairline)] pt-3 dark:border-white/10">
          <div className="flex items-baseline justify-between">
            <p className="font-semibold text-[color:var(--on-surface)] dark:text-[#ebe9e4]">Total</p>
            <p className="text-xl font-bold text-[color:var(--on-surface)] dark:text-white">
              {fmtCurrency(rate.total_amount, rate.total_currency)}
            </p>
          </div>
          <p className="text-right text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-400">
            for {nights} night{nights !== 1 ? "s" : ""} · {rate.total_currency}
          </p>
          {rate.tax_amount && (
            <p className="text-right text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-400">
              incl. {fmtCurrency(rate.tax_amount, rate.tax_currency ?? rate.total_currency)} taxes & fees
            </p>
          )}
        </div>
      </div>

      {isMock && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800/40 dark:bg-amber-950/20">
          <p className="font-semibold text-amber-900 dark:text-amber-200">Test mode — no charge</p>
          <p className="mt-0.5 text-amber-800 dark:text-amber-300">
            This booking will be recorded in the trip but no real reservation is created. Add DUFFEL_ACCESS_TOKEN to go live.
          </p>
        </div>
      )}

      {bookError && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300">
          {bookError}
        </p>
      )}

      <button
        type="button"
        className={`${btnPrimary} w-full`}
        disabled={booking}
        onClick={onBook}
      >
        {booking ? "Creating booking…" : isMock ? "Confirm (test mode)" : `Confirm & pay ${fmtCurrency(rate.total_amount, rate.total_currency)}`}
      </button>
    </div>
  );
}

function DoneStep({
  booking,
  onClose,
  onReset,
}: {
  booking: DuffelBookingRecord;
  onClose: () => void;
  onReset: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-800/40 dark:bg-emerald-950/20">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
          <svg className="h-6 w-6 text-emerald-700 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <div>
          <p className="font-display text-xl font-semibold text-emerald-900 dark:text-emerald-100">
            {booking.isMock ? "Test booking recorded" : "Booking confirmed"}
          </p>
          <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">
            {booking.accommodationName}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] p-4 dark:border-white/10 dark:bg-dm-page/60 space-y-3 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:text-neutral-500">Booking reference</p>
          <p className="mt-0.5 font-mono text-lg font-bold text-[color:var(--on-surface)] dark:text-[#ebe9e4]">
            {booking.bookingReference}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:text-neutral-500">Check-in</p>
            <p className="mt-0.5 font-medium text-[color:var(--on-surface)] dark:text-[#ebe9e4]">{fmtDate(booking.checkInDate)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:text-neutral-500">Check-out</p>
            <p className="mt-0.5 font-medium text-[color:var(--on-surface)] dark:text-[#ebe9e4]">{fmtDate(booking.checkOutDate)}</p>
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:text-neutral-500">Total paid</p>
          <p className="mt-0.5 font-bold text-[color:var(--on-surface)] dark:text-[#ebe9e4]">
            {fmtCurrency(booking.totalAmount, booking.currency)}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:text-neutral-500">Status</p>
          <p className={[
            "mt-0.5 font-semibold capitalize",
            booking.status === "confirmed" ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400",
          ].join(" ")}>
            {booking.status}
          </p>
        </div>
        {booking.cancellationPolicy?.fully_refundable_before && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:text-neutral-500">Free cancellation</p>
            <p className="mt-0.5 text-emerald-700 dark:text-emerald-400">
              Before {fmtDate(booking.cancellationPolicy.fully_refundable_before)}
            </p>
          </div>
        )}
      </div>

      <p className="text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-400">
        This booking has been saved to your trip itinerary and budget.
      </p>

      <div className="flex gap-3">
        <button type="button" className={`${btnPrimary} flex-1`} onClick={onClose}>
          Back to trip
        </button>
        <button type="button" className={btnSecondary} onClick={onReset}>
          Book another stay
        </button>
      </div>
    </div>
  );
}
