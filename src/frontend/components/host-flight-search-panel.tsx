"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AirportSuggestionDto, CabinClass, FlightLegRowDto } from "@/shared/flight-search";
import { CABIN_OPTIONS } from "@/shared/flight-search";

const DEBOUNCE_MS = 300;
/** Delays between failed autocomplete retries (debounce unchanged). */
const AUTOCOMPLETE_RETRY_DELAYS_MS = [300, 600, 1200] as const;
const MAX_AUTOCOMPLETE_ATTEMPTS = 1 + AUTOCOMPLETE_RETRY_DELAYS_MS.length;
const PAGE_SIZE = 10;

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

function useFlightSearchContext(tripId: string, enabled: boolean) {
  const [ctx, setCtx] = useState<{
    ready: boolean;
    reason: string | null;
    destinationAirport: { id: string; label: string; subtitle?: string } | null;
    startIso: string | null;
    endIso: string | null;
    destinationLabel?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setCtx(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/trip-plans/${tripId}/flights/search-context`, { credentials: "include" });
        const j = (await res.json()) as Record<string, unknown>;
        if (cancelled) return;
        if (!res.ok) {
          const err =
            typeof j.error === "string" && j.error
              ? j.error
              : `Could not load flight context (${res.status}).`;
          setCtx({
            ready: false,
            reason: err,
            destinationAirport: null,
            startIso: null,
            endIso: null,
          });
          return;
        }
        setCtx({
          ready: Boolean(j.ready),
          reason: typeof j.reason === "string" ? j.reason : null,
          destinationAirport:
            j.destinationAirport && typeof j.destinationAirport === "object"
              ? (j.destinationAirport as { id: string; label: string; subtitle?: string })
              : null,
          startIso: typeof j.startIso === "string" ? j.startIso : null,
          endIso: typeof j.endIso === "string" ? j.endIso : null,
          destinationLabel: typeof j.destinationLabel === "string" ? j.destinationLabel : undefined,
        });
      } catch {
        if (!cancelled) {
          setCtx({
            ready: false,
            reason: "Could not load flight search context.",
            destinationAirport: null,
            startIso: null,
            endIso: null,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId, enabled]);

  return { ctx, ctxLoading: loading };
}

async function fetchAutocompleteWithBackoff(tripId: string, q: string): Promise<AirportSuggestionDto[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];

  for (let attempt = 0; attempt < MAX_AUTOCOMPLETE_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(AUTOCOMPLETE_RETRY_DELAYS_MS[attempt - 1]!);
    }
    try {
      const res = await fetch(`/api/trip-plans/${tripId}/flights/airport-autocomplete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: trimmed }),
      });
      if (!res.ok) continue;
      const j = (await res.json()) as { suggestions?: AirportSuggestionDto[]; error?: string };
      return Array.isArray(j.suggestions) ? j.suggestions : [];
    } catch {
      /* retry */
    }
  }
  return [];
}

function Paginator({
  page,
  totalPages,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">
      <button
        type="button"
        disabled={page <= 1}
        onClick={onPrev}
        className="rounded-lg border border-[color:var(--hairline)] bg-white px-3 py-1.5 font-medium text-[color:var(--on-surface)] transition hover:bg-[color:var(--surface-container-low)] disabled:opacity-40 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-100 dark:hover:bg-white/5"
      >
        Previous
      </button>
      <span className="text-xs tabular-nums">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={onNext}
        className="rounded-lg border border-[color:var(--hairline)] bg-white px-3 py-1.5 font-medium text-[color:var(--on-surface)] transition hover:bg-[color:var(--surface-container-low)] disabled:opacity-40 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-100 dark:hover:bg-white/5"
      >
        Next
      </button>
    </div>
  );
}

type WizardStep = "form" | "outbound" | "return";

function airlineMonogram(name: string): string {
  const parts = name
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "FL";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function stopsLabel(stops: number): string {
  if (stops <= 0) return "Nonstop";
  return `${stops} stop${stops === 1 ? "" : "s"}`;
}

export function HostFlightSearchPanel({ tripId, enabled }: { tripId: string; enabled: boolean }) {
  const router = useRouter();
  const { ctx, ctxLoading } = useFlightSearchContext(tripId, enabled);

  const [leaveInput, setLeaveInput] = useState("");
  const [pickedOrigin, setPickedOrigin] = useState<AirportSuggestionDto | null>(null);
  const [suggestions, setSuggestions] = useState<AirportSuggestionDto[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [cabin, setCabin] = useState<CabinClass>("economy");

  const [wizard, setWizard] = useState<WizardStep>("form");
  const [outboundFlights, setOutboundFlights] = useState<FlightLegRowDto[]>([]);
  const [returnFlights, setReturnFlights] = useState<FlightLegRowDto[]>([]);
  const [legError, setLegError] = useState<string | null>(null);
  const [legLoading, setLegLoading] = useState(false);
  const [outPage, setOutPage] = useState(1);
  const [retPage, setRetPage] = useState(1);
  const [pickOut, setPickOut] = useState<FlightLegRowDto | null>(null);
  const [pickRet, setPickRet] = useState<FlightLegRowDto | null>(null);
  const [savingSelection, setSavingSelection] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestReqId = useRef(0);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const runAutocomplete = useCallback(
    async (q: string) => {
      const id = ++suggestReqId.current;
      setSuggestBusy(true);
      const list = await fetchAutocompleteWithBackoff(tripId, q);
      if (suggestReqId.current !== id) return;
      setSuggestions(list);
      setSuggestBusy(false);
    },
    [tripId]
  );

  useEffect(() => {
    if (!enabled) return;
    const q = leaveInput.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (q.length < 2) {
      setSuggestions([]);
      setSuggestBusy(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      void runAutocomplete(q);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [leaveInput, enabled, runAutocomplete]);

  useEffect(() => {
    function onDocDown(ev: MouseEvent) {
      const el = rootRef.current;
      if (!el || !(ev.target instanceof Node) || el.contains(ev.target)) return;
      setSuggestOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  const outTotalPages = Math.max(1, Math.ceil(outboundFlights.length / PAGE_SIZE));
  const retTotalPages = Math.max(1, Math.ceil(returnFlights.length / PAGE_SIZE));

  const outSlice = useMemo(() => {
    const i = (outPage - 1) * PAGE_SIZE;
    return outboundFlights.slice(i, i + PAGE_SIZE);
  }, [outboundFlights, outPage]);

  const retSlice = useMemo(() => {
    const i = (retPage - 1) * PAGE_SIZE;
    return returnFlights.slice(i, i + PAGE_SIZE);
  }, [returnFlights, retPage]);

  /** Search disabled until origin is picked from suggestions */
  const searchEnabled = Boolean(pickedOrigin && ctx?.ready && !ctxLoading && !legLoading && wizard === "form");

  const onPickSuggestion = useCallback((s: AirportSuggestionDto) => {
    setPickedOrigin(s);
    setLeaveInput(s.subtitle ? `${s.label} — ${s.subtitle}` : s.label);
    setSuggestOpen(false);
    setSuggestions([]);
  }, []);

  const onLeaveChange = useCallback((v: string) => {
    setLeaveInput(v);
    setPickedOrigin(null);
    setSuggestOpen(v.trim().length >= 2);
  }, []);

  const runLeg = useCallback(
    async (leg: "outbound" | "return") => {
      if (!pickedOrigin) return;
      if (leg === "return" && !pickOut) return;
      setLegLoading(true);
      setLegError(null);
      try {
        const res = await fetch(`/api/trip-plans/${tripId}/flights/search-leg`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leg, originAirportId: pickedOrigin.id, cabinClass: cabin }),
        });
        const j = (await res.json()) as { flights?: FlightLegRowDto[]; error?: string | null };
        if (!res.ok) {
          setLegError(typeof j.error === "string" ? j.error : "Search failed.");
          if (leg === "outbound") setOutboundFlights([]);
          else setReturnFlights([]);
          return;
        }
        const flights = Array.isArray(j.flights) ? j.flights : [];
        if (leg === "outbound") {
          setOutboundFlights(flights);
          setOutPage(1);
          setPickOut(null);
          setWizard("outbound");
        } else {
          setReturnFlights(flights);
          setRetPage(1);
          setPickRet(null);
          setWizard("return");
        }
        if (j.error && !flights.length) {
          setLegError(j.error);
        }
      } catch {
        setLegError("Network error while searching.");
        if (leg === "outbound") setOutboundFlights([]);
        else setReturnFlights([]);
      } finally {
        setLegLoading(false);
      }
    },
    [pickedOrigin, pickOut, tripId, cabin]
  );

  const resetWizard = useCallback(() => {
    setWizard("form");
    setOutboundFlights([]);
    setReturnFlights([]);
    setPickOut(null);
    setPickRet(null);
    setLegError(null);
    setOutPage(1);
    setRetPage(1);
  }, []);

  const renderFlightCard = useCallback(
    (f: FlightLegRowDto, selected: boolean, onSelect: () => void) => (
      <button
        type="button"
        onClick={onSelect}
        className={`w-full overflow-hidden rounded-2xl border text-left transition ${
          selected
            ? "border-teal-500 bg-teal-50 dark:border-teal-500 dark:bg-teal-950/30"
            : "border-[color:var(--hairline)] bg-white hover:border-[color:var(--hairline-strong)] dark:border-white/10 dark:bg-dm-elevated"
        }`}
      >
        <div className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)_auto] md:items-start">
          <div className="min-w-0">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] text-[11px] font-semibold tracking-wide text-[color:var(--on-surface-variant)] dark:border-white/15 dark:bg-white/5 dark:text-neutral-200">
                {airlineMonogram(f.airline)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[22px] font-bold leading-none tracking-tight text-[color:var(--on-surface)] dark:text-white">
                  <span>{f.departureTime}</span>
                  <span className="text-[color:var(--on-surface-muted)] dark:text-neutral-600">→</span>
                  <span>{f.arrivalTime}</span>
                </div>
                <p className="mt-1 truncate text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-300">
                  {f.departureAirport} - {f.arrivalAirport}
                </p>
                <p className="mt-0.5 truncate text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">{f.airline}</p>
              </div>
            </div>
          </div>

          <div className="min-w-0 md:px-1">
            <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--on-surface-variant)] dark:text-neutral-300">
              <span className="whitespace-nowrap">{f.duration}</span>
              <span className="h-px flex-1 bg-emerald-500/70 dark:bg-emerald-400/60" />
              <span className="whitespace-nowrap text-emerald-700 dark:text-emerald-300">{stopsLabel(f.stops)}</span>
            </div>
          </div>

          <div className="text-right md:min-w-[132px]">
            <p className="text-[34px] font-bold leading-none tracking-tight text-[color:var(--on-surface)] dark:text-white">{f.price}</p>
            <p className="mt-1 text-[11px] text-[color:var(--on-surface-muted)] dark:text-neutral-500">Roundtrip per traveler</p>
          </div>
        </div>
        <div className="border-t border-[color:var(--hairline)]/80 px-4 py-2 text-right dark:border-white/10">
          <span className="text-xs font-medium text-[color:var(--on-surface-muted)] underline-offset-2 hover:underline dark:text-neutral-400">
            Flight details
          </span>
        </div>
      </button>
    ),
    []
  );

  if (!enabled) return null;

  return (
    <div className="mt-4 rounded-2xl border border-[color:var(--hairline)] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
      <h3 className="text-base font-semibold text-[color:var(--on-surface)] dark:text-white">Search round-trip flights</h3>
      <p className="mt-1 text-xs leading-relaxed text-[color:var(--on-surface-variant)] dark:text-neutral-400">
        Destination and travel dates come from your trip. Choose where you are leaving from, then pick outbound and return options.
      </p>

      {ctxLoading ? (
        <p className="mt-3 text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-500">Loading trip flight context…</p>
      ) : ctx && !ctx.ready ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          {ctx.reason ?? "Flight search is not ready for this trip yet."}
        </p>
      ) : ctx?.ready ? (
        <p className="mt-2 text-xs text-[color:var(--on-surface-variant)] dark:text-neutral-400">
          To <span className="font-medium text-[color:var(--on-surface)] dark:text-neutral-200">{ctx.destinationLabel}</span>
          {ctx.destinationAirport ? (
            <>
              {" "}
              (<span className="tabular-nums">{ctx.destinationAirport.label}</span>
              {ctx.destinationAirport.subtitle ? ` · ${ctx.destinationAirport.subtitle}` : ""})
            </>
          ) : null}
          {ctx.startIso && ctx.endIso ? (
            <>
              {" "}
              · Outbound <span className="font-medium text-[color:var(--on-surface)] dark:text-neutral-200">{ctx.startIso}</span>, return{" "}
              <span className="font-medium text-[color:var(--on-surface)] dark:text-neutral-200">{ctx.endIso}</span>
            </>
          ) : null}
        </p>
      ) : null}

      {ctx?.ready && wizard === "form" ? (
        <div ref={rootRef} className="mt-4 space-y-3">
          <div className="relative">
            <label className="block text-xs font-medium text-[color:var(--on-surface-variant)] dark:text-neutral-300">Leaving from</label>
            <input
              type="text"
              autoComplete="off"
              value={leaveInput}
              onChange={(e) => onLeaveChange(e.target.value)}
              onFocus={() => leaveInput.trim().length >= 2 && setSuggestOpen(true)}
              placeholder="City or airport"
              className="mt-1 w-full rounded-xl border border-[color:var(--hairline)] bg-white px-3 py-2 text-sm text-[color:var(--on-surface)] outline-none placeholder:text-[color:var(--on-surface-muted)] focus:border-teal-500 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-100"
            />
            {suggestOpen && (suggestions.length > 0 || suggestBusy) ? (
              <ul
                role="listbox"
                className="absolute z-40 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-[color:var(--hairline)] bg-white py-1 text-sm shadow-lg dark:border-white/10 dark:bg-dm-elevated"
              >
                {suggestBusy && !suggestions.length ? (
                  <li className="px-3 py-2 text-[color:var(--on-surface-muted)] dark:text-neutral-500">Searching…</li>
                ) : (
                  suggestions.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={pickedOrigin?.id === s.id}
                        className="flex w-full flex-col px-3 py-2 text-left hover:bg-[color:var(--surface-container-low)] dark:hover:bg-white/5"
                        onClick={() => onPickSuggestion(s)}
                      >
                        <span className="font-medium text-[color:var(--on-surface)] dark:text-neutral-100">{s.label}</span>
                        {s.subtitle ? <span className="text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">{s.subtitle}</span> : null}
                        <span className="text-[10px] uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:text-neutral-600">{s.id}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </div>

          <div>
            <label className="block text-xs font-medium text-[color:var(--on-surface-variant)] dark:text-neutral-300">Cabin class</label>
            <select
              value={cabin}
              onChange={(e) => setCabin(e.target.value as CabinClass)}
              className="mt-1 w-full max-w-xs rounded-xl border border-[color:var(--hairline)] bg-white px-3 py-2 text-sm text-[color:var(--on-surface)] outline-none focus:border-teal-500 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-100"
            >
              {CABIN_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            disabled={!searchEnabled}
            onClick={() => {
              if (!pickedOrigin) return;
              const q = new URLSearchParams({
                originId: pickedOrigin.id,
                originLabel: leaveInput,
                cabinClass: cabin,
                leg: "outbound",
              });
              router.push(`/trip/${tripId}/setup/flights?${q.toString()}`);
            }}
            className="rounded-xl border border-teal-600/80 bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:border-[color:var(--hairline)] disabled:bg-slate-200 disabled:text-[color:var(--on-surface-muted)] dark:disabled:border-white/10 dark:disabled:bg-white/10 dark:disabled:text-neutral-500"
          >
            Search flights
          </button>
        </div>
      ) : null}

      {legError ? (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-100">
          {legError}
        </p>
      ) : null}

      {wizard === "outbound" ? (
        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-white/10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-[color:var(--on-surface)] dark:text-white">Step 1 — Outbound</h4>
            <button
              type="button"
              onClick={resetWizard}
              className="text-xs font-medium text-[color:var(--on-surface-variant)] underline-offset-2 hover:underline dark:text-neutral-400"
            >
              Start over
            </button>
          </div>
          <p className="mt-1 text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">Select a flight, then continue to return options.</p>
          {!outboundFlights.length && !legLoading ? (
            <p className="mt-2 text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">No outbound results.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {outSlice.map((f) => {
                const sel = pickOut?.id === f.id;
                return (
                  <li key={f.id}>
                    {renderFlightCard(f, sel, () => setPickOut(f))}
                  </li>
                );
              })}
            </ul>
          )}
          <Paginator
            page={outPage}
            totalPages={outTotalPages}
            onPrev={() => setOutPage((p) => Math.max(1, p - 1))}
            onNext={() => setOutPage((p) => Math.min(outTotalPages, p + 1))}
          />
          <button
            type="button"
            disabled={!pickOut || legLoading}
            onClick={() => void runLeg("return")}
            className="mt-4 rounded-xl border border-teal-600/80 bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:border-[color:var(--hairline)] disabled:bg-slate-200 disabled:text-[color:var(--on-surface-muted)] dark:disabled:border-white/10 dark:disabled:bg-white/10 dark:disabled:text-neutral-500"
          >
            {legLoading ? "Loading return…" : "Next: return flights"}
          </button>
        </div>
      ) : null}

      {wizard === "return" ? (
        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-white/10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-[color:var(--on-surface)] dark:text-white">Step 2 — Return</h4>
            <button
              type="button"
              onClick={() => {
                setWizard("outbound");
                setPickRet(null);
                setLegError(null);
              }}
              className="text-xs font-medium text-[color:var(--on-surface-variant)] underline-offset-2 hover:underline dark:text-neutral-400"
            >
              Back to outbound
            </button>
          </div>
          {pickOut ? (
            <p className="mt-1 text-xs text-[color:var(--on-surface-variant)] dark:text-neutral-400">
              Outbound: {pickOut.airline} · {pickOut.departureTime}–{pickOut.arrivalTime} ({pickOut.duration})
            </p>
          ) : null}
          {!returnFlights.length && !legLoading ? (
            <p className="mt-2 text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">No return results.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {retSlice.map((f) => {
                const sel = pickRet?.id === f.id;
                return (
                  <li key={f.id}>
                    {renderFlightCard(f, sel, () => setPickRet(f))}
                  </li>
                );
              })}
            </ul>
          )}
          <Paginator
            page={retPage}
            totalPages={retTotalPages}
            onPrev={() => setRetPage((p) => Math.max(1, p - 1))}
            onNext={() => setRetPage((p) => Math.min(retTotalPages, p + 1))}
          />
          {pickRet && pickOut ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-950 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-100">
              <p className="font-medium">Selected pairing</p>
              <p className="mt-1">
                Out: {pickOut.airline}, {pickOut.departureTime} → {pickOut.arrivalTime} ({pickOut.price})
              </p>
              <p>
                Back: {pickRet.airline}, {pickRet.departureTime} → {pickRet.arrivalTime} ({pickRet.price})
              </p>
              <p className="mt-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={savingSelection || !ctx?.startIso || !ctx?.endIso}
                  onClick={async () => {
                    if (!ctx?.startIso || !ctx?.endIso) return;
                    setSavingSelection(true);
                    setSaveMessage(null);
                    try {
                      const res = await fetch(`/api/trip-plans/${tripId}/flights/save-selection`, {
                        method: "POST",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          outbound: pickOut,
                          ret: pickRet,
                          startIso: ctx.startIso,
                          endIso: ctx.endIso,
                        }),
                      });
                      const json = (await res.json().catch(() => ({}))) as { error?: string };
                      if (!res.ok) throw new Error(json.error || "Could not save this flight yet.");
                      setSaveMessage("Flight added to your calendar + dynamic itinerary.");
                      router.refresh();
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : "Could not save this flight yet.";
                      setSaveMessage(msg);
                    } finally {
                      setSavingSelection(false);
                    }
                  }}
                  className="font-semibold text-emerald-800 underline-offset-2 hover:underline disabled:opacity-60 dark:text-emerald-300"
                >
                  {savingSelection ? "Saving..." : "Add to trip itinerary"}
                </button>
              </p>
              {saveMessage ? <p className="mt-2">{saveMessage}</p> : null}
            </div>
          ) : (
            <p className="mt-3 text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">Select a return flight to finish.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
