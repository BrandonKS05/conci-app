"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlaceSpotlight } from "@/shared/place-preview";
import type { TripPlan } from "@/shared/trip-plan";
import { buildLodgingSegmentPresets, type LodgingSegmentPreset } from "@/shared/lodging-segments";
import {
  mockHotelResultToPlace,
  mockHotelSearch,
  type MockHotelResult,
} from "@/shared/mock-hotel-search";

export type HostLodgingCommitPayload = {
  place: PlaceSpotlight;
  stayStartIso: string;
  stayEndIso: string;
  destinationCity?: string;
  bookingUrl?: string | null;
  notes?: string | null;
  guestCount?: number;
  roomCount?: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  plan: TripPlan;
  tripRange: { startIso: string; endIso: string } | null;
  onCommit: (payload: HostLodgingCommitPayload) => void;
};

const fieldLabel = "text-[11px] font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:text-neutral-500";

const inputClass =
  "mt-1 w-full rounded-xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-low)] px-3 py-2.5 text-sm text-[color:var(--on-surface)] outline-none focus:border-[color:var(--hairline-strong)] dark:border-white/15 dark:bg-dm-page dark:text-[#ebe9e4]";

const btnPrimary =
  "rounded-xl bg-[#1c1c17] px-4 py-2.5 text-sm font-semibold tracking-wide text-[color:var(--surface)] shadow-md transition hover:bg-[#2a2a26] disabled:pointer-events-none disabled:opacity-40 dark:bg-neutral-200 dark:text-dm-page dark:hover:bg-white";

const btnSecondary =
  "rounded-xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] px-4 py-2.5 text-sm font-semibold text-[color:var(--on-surface)] transition hover:bg-[color:var(--surface-container-low)] dark:border-white/15 dark:bg-dm-page dark:text-[#ebe9e4]";

function clampDate(iso: string, min?: string | null, max?: string | null): string {
  let v = iso;
  if (min && v < min) v = min;
  if (max && v > max) v = max;
  return v;
}

function applyPresetToFields(p: LodgingSegmentPreset, trip: { startIso: string; endIso: string } | null) {
  const tmin = trip?.startIso;
  const tmax = trip?.endIso;
  return {
    destination: p.cityLabel,
    checkIn: clampDate(p.startIso, tmin, tmax),
    checkOut: clampDate(p.endIso, tmin, tmax),
  };
}

export function HostHotelSearchModal({ open, onClose, plan, tripRange, onCommit }: Props) {
  const segmentPresets = useMemo(() => buildLodgingSegmentPresets(plan, tripRange), [plan, tripRange]);
  const [segmentId, setSegmentId] = useState<string>("whole");

  const [destination, setDestination] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);

  const [results, setResults] = useState<MockHotelResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [manualCity, setManualCity] = useState("");
  const [manualBookingUrl, setManualBookingUrl] = useState("");
  const [manualNotes, setManualNotes] = useState("");

  const activePreset =
    segmentPresets.find((s) => s.id === segmentId) ?? segmentPresets[0] ?? null;

  const resetOnOpen = useCallback(() => {
    const first = segmentPresets[0];
    setSegmentId(first?.id ?? "whole");
    const preset = first ?? {
      id: "fallback",
      label: "",
      cityLabel: plan.location?.split(",")[0]?.trim() || plan.title?.trim() || "",
      startIso: tripRange?.startIso ?? "",
      endIso: tripRange?.endIso ?? "",
    };
    const f = applyPresetToFields(preset as LodgingSegmentPreset, tripRange);
    setDestination(f.destination);
    setCheckIn(f.checkIn);
    setCheckOut(f.checkOut);
    const pc = plan.people.count;
    if (typeof pc === "number" && pc > 0) setGuests(Math.min(12, pc));
    setRooms(1);
    setResults([]);
    setManualOpen(false);
    setManualName("");
    setManualAddress("");
    setManualCity(f.destination);
    setManualBookingUrl("");
    setManualNotes("");
  }, [segmentPresets, plan.location, plan.title, plan.people.count, tripRange]);

  useEffect(() => {
    if (!open) return;
    resetOnOpen();
  }, [open, resetOnOpen]);

  useEffect(() => {
    if (!open || !activePreset) return;
    const f = applyPresetToFields(activePreset, tripRange);
    setDestination(f.destination);
    setCheckIn(f.checkIn);
    setCheckOut(f.checkOut);
  }, [segmentId, activePreset, open, tripRange]);

  const runSearch = useCallback(async () => {
    if (!checkIn || !checkOut || checkIn > checkOut) return;
    setSearching(true);
    try {
      const rows = await mockHotelSearch({
        destination,
        checkInIso: checkIn,
        checkOutIso: checkOut,
        guests,
        rooms,
      });
      setResults(rows);
    } finally {
      setSearching(false);
    }
  }, [destination, checkIn, checkOut, guests, rooms]);

  const commit = useCallback(
    (place: PlaceSpotlight, extra?: { bookingUrl?: string | null; notes?: string | null }) => {
      if (!checkIn || !checkOut || checkIn > checkOut) return;
      onCommit({
        place,
        stayStartIso: checkIn,
        stayEndIso: checkOut,
        destinationCity: destination.trim() || activePreset?.cityLabel,
        bookingUrl: extra?.bookingUrl ?? null,
        notes: extra?.notes ?? null,
        guestCount: guests,
        roomCount: rooms,
      });
      onClose();
    },
    [activePreset?.cityLabel, checkIn, checkOut, destination, guests, rooms, onCommit, onClose]
  );

  const onSetManual = useCallback(() => {
    const name = manualName.trim();
    if (!name) return;
    const addr = manualAddress.trim();
    const city = manualCity.trim() || destination.trim() || activePreset?.cityLabel || "";
    const q = `${name} ${addr} ${city}`;
    const booking = manualBookingUrl.trim();
    const place: PlaceSpotlight = {
      name,
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`,
      address: addr || city,
      spotlightCategory: "hotel",
      ...(city ? { sourceQuery: city } : {}),
    };
    commit(place, {
      bookingUrl: booking.startsWith("http") ? booking : null,
      notes: manualNotes.trim() || null,
    });
  }, [
    manualName,
    manualAddress,
    manualCity,
    manualBookingUrl,
    manualNotes,
    destination,
    activePreset?.cityLabel,
    commit,
  ]);

  if (!open) return null;

  const showSegmentPicker = segmentPresets.length > 1;
  const datesValid = Boolean(checkIn && checkOut && checkIn <= checkOut);

  return (
    <div
      className="fixed inset-0 z-[220] flex flex-col justify-end sm:items-center sm:justify-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lodging-search-title"
    >
      <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 flex max-h-[min(94dvh,820px)] w-full max-w-lg flex-col overflow-hidden rounded-t-[1.35rem] border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] shadow-2xl dark:border-white/10 dark:bg-dm-card sm:max-h-[min(90vh,800px)] sm:rounded-2xl">
        <div className="shrink-0 border-b border-[color:var(--hairline)] px-5 pb-4 pt-5 dark:border-white/10 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2
                id="lodging-search-title"
                className="font-display text-xl font-semibold tracking-tight text-[color:var(--on-surface)] dark:text-[#ebe9e4]"
              >
                Find your stay
              </h2>
              <p className="mt-1 text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-400">
                Optional override — Conci still suggests a home base when you have not picked one. Your choice here is saved as{" "}
                <span className="font-medium text-[color:var(--on-surface)] dark:text-neutral-200">your pick</span> and kept on itinerary
                refit. Ask Trip Copilot to book or change a hotel when you want AI to set lodging instead.
              </p>
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

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
          {showSegmentPicker ? (
            <div className="mb-4">
              <label htmlFor="lodging-segment" className={fieldLabel}>
                Trip segment
              </label>
              <select
                id="lodging-segment"
                value={segmentId}
                onChange={(e) => setSegmentId(e.target.value)}
                className={inputClass}
              >
                {segmentPresets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                Multi-city trips: pick which leg this hotel belongs to. Dates prefilled from an even split of your trip days across
                destination poll options (heuristic).
              </p>
            </div>
          ) : null}

          <div className="space-y-4 rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)]/60 p-4 dark:border-white/10 dark:bg-dm-page/40">
            <div>
              <label className={fieldLabel} htmlFor="lodging-destination">
                Destination / city
              </label>
              <input
                id="lodging-destination"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className={inputClass}
                placeholder="City or neighborhood"
                autoComplete="off"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={fieldLabel} htmlFor="lodging-checkin">
                  Check-in
                </label>
                <input
                  id="lodging-checkin"
                  type="date"
                  value={checkIn}
                  min={tripRange?.startIso}
                  max={tripRange?.endIso}
                  onChange={(e) => setCheckIn(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={fieldLabel} htmlFor="lodging-checkout">
                  Check-out
                </label>
                <input
                  id="lodging-checkout"
                  type="date"
                  value={checkOut}
                  min={tripRange?.startIso}
                  max={tripRange?.endIso}
                  onChange={(e) => setCheckOut(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={fieldLabel} htmlFor="lodging-guests">
                  Guests
                </label>
                <input
                  id="lodging-guests"
                  type="number"
                  min={1}
                  max={20}
                  value={guests}
                  onChange={(e) => setGuests(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={fieldLabel} htmlFor="lodging-rooms">
                  Rooms
                </label>
                <input
                  id="lodging-rooms"
                  type="number"
                  min={1}
                  max={10}
                  value={rooms}
                  onChange={(e) => setRooms(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                className={btnPrimary}
                disabled={!datesValid || searching}
                onClick={() => void runSearch()}
              >
                {searching ? "Searching…" : "Search"}
              </button>
              <button type="button" className={btnSecondary} onClick={() => setManualOpen((v) => !v)}>
                {manualOpen ? "Hide manual entry" : "Add manually"}
              </button>
            </div>
          </div>

          {manualOpen ? (
            <div className="mt-4 space-y-3 rounded-2xl border border-dashed border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] p-4 dark:border-white/20 dark:bg-dm-elevated/50">
              <p className="text-sm font-medium text-[color:var(--on-surface)] dark:text-[#ebe9e4]">Add a stay you already booked</p>
              <input
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                className={inputClass}
                placeholder="Hotel name *"
              />
              <input
                value={manualAddress}
                onChange={(e) => setManualAddress(e.target.value)}
                className={inputClass}
                placeholder="Street address"
              />
              <input
                value={manualCity}
                onChange={(e) => setManualCity(e.target.value)}
                className={inputClass}
                placeholder="City"
              />
              <input
                value={manualBookingUrl}
                onChange={(e) => setManualBookingUrl(e.target.value)}
                className={inputClass}
                placeholder="Booking link (optional)"
              />
              <textarea
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                className={`${inputClass} min-h-[72px] resize-y`}
                placeholder="Notes (optional)"
              />
              <button type="button" className={btnPrimary} disabled={!manualName.trim() || !datesValid} onClick={onSetManual}>
                Save stay
              </button>
            </div>
          ) : null}

          {results.length > 0 ? (
            <ul className="mt-6 space-y-3">
              {results.map((r) => (
                <li
                  key={r.id}
                  className="overflow-hidden rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] dark:border-white/10 dark:bg-dm-elevated"
                >
                  <div
                    className="relative h-28 w-full"
                    style={{
                      background: `linear-gradient(135deg, ${r.gradientFrom}, ${r.gradientTo})`,
                    }}
                  >
                    <span className="absolute bottom-2 left-3 rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      Mock preview
                    </span>
                  </div>
                  <div className="p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold text-[color:var(--on-surface)] dark:text-[#ebe9e4]">{r.name}</p>
                      <span className="text-sm text-amber-700 dark:text-amber-300">★ {r.rating.toFixed(1)}</span>
                    </div>
                    <p className="mt-1 text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-400">
                      {r.neighborhood} · {r.addressLine}
                    </p>
                    <p className="mt-2 text-sm leading-snug text-[color:var(--on-surface-variant)] dark:text-neutral-300">
                      {r.description}
                    </p>
                    <p className="mt-2 text-xs font-semibold text-[color:var(--on-surface-muted)] dark:text-neutral-400">
                      {r.priceEstimatePerNight}
                    </p>
                    <button
                      type="button"
                      className={`${btnPrimary} mt-3 w-full sm:w-auto`}
                      disabled={!datesValid}
                      onClick={() => commit(mockHotelResultToPlace(r, destination))}
                    >
                      Set as hotel
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          <p className="mt-6 text-center text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">
            Nights use your check-in and check-out dates inclusively on the host calendar (same as before).
          </p>
        </div>
      </div>
    </div>
  );
}
