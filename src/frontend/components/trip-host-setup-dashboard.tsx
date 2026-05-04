"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatLocalIsoDate } from "@/shared/date-option-parse";
import {
  enumerateLocalIsoDays,
  hostHasConcreteTripRange,
  hostHasHotel,
  hostHasKeptRestaurant,
  hostSetupCompletionPercent,
  inferredTripRangeFromPlanDates,
  isHostPublishReady,
  parseLocalIsoDate,
  type HostRestaurantPin,
  type HostSetupState,
  type TripPlan,
} from "@/shared/trip-plan";
import { restaurantPickToSpotlight } from "@/shared/restaurants";
import type { PlaceSpotlight } from "@/shared/place-preview";

const NAV = [
  { id: "dates", label: "Dates" },
  { id: "accommodation", label: "Accommodation" },
  { id: "food", label: "Food" },
  { id: "transport", label: "Transportation" },
  { id: "experiences", label: "Experiences" },
  { id: "packing", label: "Packing List" },
  { id: "budget", label: "Budget" },
] as const;

type Props = {
  tripId: string;
  initialPlan: TripPlan;
};

function daysInMonth(y: number, m0: number): number {
  return new Date(y, m0 + 1, 0).getDate();
}

const WEEKDAY_MON_FIRST = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Monday-first month grid padding (classic wall calendar layout). */
function calendarCellsMondayFirst(viewYear: number, viewMonth: number): (number | null)[] {
  const firstDowSun0 = new Date(viewYear, viewMonth, 1).getDay();
  const padMon0 = (firstDowSun0 + 6) % 7;
  const n = daysInMonth(viewYear, viewMonth);
  const cells: (number | null)[] = [];
  for (let i = 0; i < padMon0; i++) cells.push(null);
  for (let d = 1; d <= n; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function chunkWeeks(cells: (number | null)[]): (number | null)[][] {
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

type TripIsoRange = { startIso: string; endIso: string };

function isoFromCell(viewYear: number, viewMonth: number, dom: number): string {
  return formatLocalIsoDate(new Date(viewYear, viewMonth, dom, 12, 0, 0, 0));
}

/** Horizontal span [colStart,colEnd] 0-indexed inclusive for trip nights in one week row. */
function tripColumnSegments(
  week: (number | null)[],
  calYear: number,
  calMonth: number,
  range: TripIsoRange | null
): { start: number; end: number }[] {
  if (!range?.startIso || !range.endIso) return [];
  const days = enumerateLocalIsoDays(range.startIso, range.endIso);
  const included = new Set(days);
  const segments: { start: number; end: number }[] = [];
  let run = -1;
  for (let c = 0; c < 7; c++) {
    const dom = week[c];
    const iso = dom != null ? isoFromCell(calYear, calMonth, dom) : null;
    const inTrip = !!(iso && included.has(iso));
    if (inTrip && run < 0) run = c;
    if ((!inTrip || c === 6) && run >= 0) {
      const end = inTrip && c === 6 ? c : c - 1;
      if (end >= run) segments.push({ start: run, end });
      run = -1;
    }
  }
  return segments;
}

function ChevLeft({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden>
      <path
        fillRule="evenodd"
        d="M12.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L9.414 10l3.293 3.293a1 1 0 010 1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ChevRight({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden>
      <path
        fillRule="evenodd"
        d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ChevDownSm({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden>
      <path d="M4.427 6.073a.75.75 0 001.054 0L8 3.554l2.519 2.519a.75.75 0 001.065-1.06l-3.049-3.05a1.501 1.501 0 00-2.122 0L3.362 5.013a.75.75 0 000 1.06z" />
    </svg>
  );
}

export function TripHostSetupDashboard({ tripId, initialPlan }: Props) {
  const router = useRouter();
  const [plan, setPlan] = useState<TripPlan>(initialPlan);
  const hostSetup = useMemo(() => plan.hostSetup ?? {}, [plan.hostSetup]);
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [hotelQuery, setHotelQuery] = useState("");
  const [hotelHits, setHotelHits] = useState<PlaceSpotlight[]>([]);
  const [hotelSearchBusy, setHotelSearchBusy] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);

  const inferredRange = inferredTripRangeFromPlanDates(plan, new Date().getFullYear());

  const [calYear, setCalYear] = useState(() => {
    const tr = initialPlan.hostSetup?.tripRange ?? inferredTripRangeFromPlanDates(initialPlan, new Date().getFullYear());
    const startIso = tr?.startIso;
    const base = startIso ? parseLocalIsoDate(startIso) : null;
    const d = base ?? new Date();
    return d.getFullYear();
  });
  const [calMonth, setCalMonth] = useState(() => {
    const tr = initialPlan.hostSetup?.tripRange ?? inferredTripRangeFromPlanDates(initialPlan, new Date().getFullYear());
    const startIso = tr?.startIso;
    const base = startIso ? parseLocalIsoDate(startIso) : null;
    const d = base ?? new Date();
    return d.getMonth();
  });

  /** Persisted preferred for saving pins; inferred fills the grid until PATCH returns. */
  const tripDisplayRange = hostSetup.tripRange ?? inferredRange ?? null;

  const suggestedSeededRef = useRef(false);

  type HostSetupPatch = Partial<HostSetupState>;

  const persistHostSetup = useCallback(
    async (patch: HostSetupPatch) => {
      setErr(null);
      try {
        const res = await fetch(`/api/trip-plans/${tripId}/host-setup`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hostSetup: patch }),
        });
        const j = (await res.json().catch(() => ({}))) as { plan?: TripPlan; error?: string };
        if (!res.ok) {
          setErr(j.error || "Could not save setup.");
          return;
        }
        if (j.plan) setPlan(j.plan);
      } catch {
        setErr("Could not save setup.");
      }
    },
    [tripId]
  );

  /** First inferred concrete range → persist once if missing server-side host range. */
  useEffect(() => {
    const y0 = new Date().getFullYear();
    const inferred = inferredTripRangeFromPlanDates(plan, y0);
    if (!inferred || hostSetup.tripRange?.startIso) return;
    void persistHostSetup({ tripRange: inferred });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time hydrate from parser dates
  }, []);

  useEffect(() => {
    const loc = plan.location?.trim() || plan.title?.trim();
    if (!loc) return;
    void (async () => {
      const res = await fetch(`/api/places/destination-cover?q=${encodeURIComponent(loc)}`);
      const j = (await res.json().catch(() => ({}))) as { photoUrl?: string | null };
      if (j.photoUrl?.startsWith("http")) setHeroUrl(j.photoUrl);
    })();
  }, [plan.location, plan.title]);

  /** Seed restaurant pins from live recommendations once a range is persisted (avoids racing the initial range PATCH). */
  useEffect(() => {
    const persisted = hostSetup.tripRange;
    if (!persisted?.startIso || !persisted.endIso || suggestedSeededRef.current) return;
    const existing = hostSetup.restaurantPins?.length ?? 0;
    if (existing > 0) {
      suggestedSeededRef.current = true;
      return;
    }

    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/trip-plans/${tripId}/live-recommendations`, { credentials: "include" });
      const bundle = await res.json().catch(() => ({}));
      const raw = bundle?.restaurants as import("@/shared/restaurants").RestaurantPick[] | undefined;
      if (!res.ok || cancelled || !raw?.length) return;

      const days = enumerateLocalIsoDays(persisted.startIso, persisted.endIso);
      if (!days.length) return;

      const pins: HostRestaurantPin[] = [];
      for (let i = 0; i < days.length; i++) {
        const pick = raw[i % raw.length]!;
        pins.push({
          dateIso: days[i]!,
          place: restaurantPickToSpotlight(pick),
          kept: true,
        });
      }
      suggestedSeededRef.current = true;
      await persistHostSetup({ restaurantPins: pins });
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once when persisted range is ready
  }, [hostSetup.tripRange?.startIso, hostSetup.tripRange?.endIso, tripId]);

  const searchHotels = useCallback(async () => {
    const hint = plan.location?.trim() || "";
    const q = hotelQuery.trim() || `${hint} boutique hotel`;
    setHotelSearchBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/places/maps-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q, locationHint: hint || null }),
      });
      const j = (await res.json()) as { places?: PlaceSpotlight[] };
      setHotelHits((j.places ?? []).slice(0, 12));
    } catch {
      setHotelHits([]);
      setErr("Hotel search failed.");
    } finally {
      setHotelSearchBusy(false);
    }
  }, [hotelQuery, plan.location]);

  const onHotelPick = useCallback(
    (h: PlaceSpotlight) => {
      void persistHostSetup({ hotel: h });
    },
    [persistHostSetup]
  );

  const togglePin = useCallback(
    (dateIso: string, mapsUrl: string, kept: boolean) => {
      const pins = [...(hostSetup.restaurantPins ?? [])];
      const idx = pins.findIndex((p) => p.dateIso === dateIso && p.place.mapsUrl === mapsUrl);
      if (idx === -1) return;
      pins[idx] = { ...pins[idx]!, kept };
      void persistHostSetup({ restaurantPins: pins });
    },
    [hostSetup.restaurantPins, persistHostSetup]
  );

  const onCalendarDayClick = useCallback(
    (dom: number) => {
      const iso = isoFromCell(calYear, calMonth, dom);

      if (!rangeAnchor) {
        setRangeAnchor(iso);
        return;
      }

      let start = parseLocalIsoDate(rangeAnchor)!;
      let end = parseLocalIsoDate(iso)!;
      if (start.getTime() > end.getTime()) [start, end] = [end, start];
      setRangeAnchor(null);
      suggestedSeededRef.current = false;
      void persistHostSetup({
        hotel: hostSetup.hotel,
        experiencesOutlined: hostSetup.experiencesOutlined,
        tripRange: { startIso: formatLocalIsoDate(start), endIso: formatLocalIsoDate(end) },
        restaurantPins: [],
      });
    },
    [calYear, calMonth, rangeAnchor, hostSetup, persistHostSetup]
  );

  const pct = hostSetupCompletionPercent(plan);
  const pubReady = isHostPublishReady(plan);

  const onPublish = useCallback(async () => {
    if (!pubReady) return;
    setPublishBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/trip-plans/${tripId}/publish`, {
        method: "POST",
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
      if (!res.ok) {
        setErr(j.error || "Publish failed.");
        return;
      }
      router.replace(`/trip/${tripId}`);
      router.refresh();
    } finally {
      setPublishBusy(false);
    }
  }, [pubReady, tripId, router]);

  const cells = useMemo(() => calendarCellsMondayFirst(calYear, calMonth), [calYear, calMonth]);
  const weeks = useMemo(() => chunkWeeks(cells), [cells]);

  const jumpToToday = useCallback(() => {
    const now = new Date();
    setCalYear(now.getFullYear());
    setCalMonth(now.getMonth());
  }, []);

  const isCalendarToday = useCallback(
    (dom: number): boolean => {
      const now = new Date();
      return (
        dom === now.getDate() && calMonth === now.getMonth() && calYear === now.getFullYear()
      );
    },
    [calYear, calMonth]
  );

  const inTripRangeCell = useCallback(
    (dom: number | null): boolean => {
      if (!dom || !tripDisplayRange?.startIso || !tripDisplayRange.endIso) return false;
      const iso = isoFromCell(calYear, calMonth, dom);
      const days = enumerateLocalIsoDays(tripDisplayRange.startIso, tripDisplayRange.endIso);
      return days.includes(iso);
    },
    [tripDisplayRange, calYear, calMonth]
  );

  const displayRangeTrip: TripIsoRange | null =
    tripDisplayRange?.startIso && tripDisplayRange?.endIso
      ? { startIso: tripDisplayRange.startIso, endIso: tripDisplayRange.endIso }
      : null;

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 lg:flex-row lg:gap-8">
      <aside className="w-full shrink-0 space-y-4 lg:w-56 xl:w-64 lg:min-w-[220px]">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/60 shadow-lg">
          <div
            className="aspect-[16/11] bg-neutral-800 bg-cover bg-center"
            style={heroUrl ? { backgroundImage: `url(${heroUrl})` } : undefined}
          />
          <p className="border-t border-white/10 px-3 py-2 text-xs font-medium text-neutral-400">
            {plan.location?.trim() || plan.title?.trim() || "Destination"}
          </p>
        </div>

        <nav className="space-y-1 text-sm">
          {NAV.map((item) => (
            <a
              key={item.id}
              href={`#sec-${item.id}`}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-neutral-400 transition hover:bg-white/5 hover:text-neutral-100"
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500" />
              {item.label}
            </a>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 space-y-10">
        <section id="sec-dates" className="scroll-mt-28">
          <div className="mb-4">
            <h2 className="text-lg font-semibold tracking-tight text-white">Trip calendar</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-400">
              {tripDisplayRange?.startIso
                ? `${tripDisplayRange.startIso} → ${tripDisplayRange.endIso}. Tap start, then tap end — or redraw anytime. Bars show your hotel nights; dinners list inside each day.`
                : "Select dates with two taps. The violet bar marks your nights once a range exists."}
            </p>
            {rangeAnchor ? (
              <p className="mt-3 text-xs font-medium text-amber-400">Select end date…</p>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white text-slate-900 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            {/* Header — toolbar like reference */}
            <div className="flex flex-col gap-4 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6">
              <h3 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                {new Date(calYear, calMonth, 1).toLocaleString("default", { month: "long", year: "numeric" })}
              </h3>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() =>
                    setCalMonth((m) => {
                      if (m <= 0) {
                        setCalYear((y) => y - 1);
                        return 11;
                      }
                      return m - 1;
                    })
                  }
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <ChevLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => jumpToToday()}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  Today
                </button>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() =>
                    setCalMonth((m) => {
                      if (m >= 11) {
                        setCalYear((y) => y + 1);
                        return 0;
                      }
                      return m + 1;
                    })
                  }
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <ChevRight className="h-5 w-5" />
                </button>
                <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                  Month view
                  <ChevDownSm className="h-4 w-4 text-slate-400" />
                </div>
                <button
                  type="button"
                  disabled={!pubReady || publishBusy}
                  onClick={() => void onPublish()}
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500 disabled:pointer-events-none disabled:bg-slate-300 disabled:text-slate-500"
                >
                  {publishBusy ? "Publishing…" : "Publish trip"}
                </button>
              </div>
            </div>

            {/* Weekday stripe */}
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/90">
              {WEEKDAY_MON_FIRST.map((w) => (
                <div
                  key={w}
                  className="border-l border-transparent py-3 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 first:border-l-0 sm:text-xs sm:tracking-[0.18em]"
                >
                  {w}
                </div>
              ))}
            </div>

            {/* Body: ribbon + rows per ISO week */}
            <div className="border-x border-slate-200 bg-white">
              {weeks.map((weekRow, wi) => {
                const segs =
                  tripDisplayRange?.startIso && tripDisplayRange.endIso
                    ? tripColumnSegments(weekRow, calYear, calMonth, displayRangeTrip)
                    : [];

                const hotelLabel = hostSetup.hotel?.name ?? "Hotel stay";

                return (
                  <div key={`wk-${wi}`}>
                    {/* Gantt strip for trip / hotel */}
                    <div className="relative h-11 border-b border-slate-100 bg-[#fafafb]">
                      {segs.length > 0
                        ? segs.map((seg) => (
                            <div
                              key={`${wi}-${seg.start}-${seg.end}`}
                              title={hotelLabel}
                              className="pointer-events-none absolute top-3 z-[1] h-7 truncate rounded-lg bg-violet-100 px-3 text-[11px] font-semibold leading-7 text-violet-950 shadow-inner ring-1 ring-violet-200/70"
                              style={{
                                left: `calc(${seg.start} * (100% / 7) + 4px)`,
                                width: `calc(${(seg.end - seg.start + 1) * (100 / 7)}% - 8px)`,
                              }}
                            >
                              · {hotelLabel}
                            </div>
                          ))
                        : null}
                    </div>
                    <div className="grid grid-cols-7">
                      {weekRow.map((dom, ci) =>
                        dom == null ? (
                          <div
                            key={`e-${wi}-${ci}`}
                            className={[
                              "min-h-[6.75rem] border-b border-slate-200 bg-slate-50/40 sm:min-h-[7.75rem]",
                              ci < 6 ? "border-r border-slate-200" : "",
                            ].join(" ")}
                          />
                        ) : (
                          <button
                            type="button"
                            key={`d-${calYear}-${calMonth}-${dom}-${wi}-${ci}`}
                            onClick={() => onCalendarDayClick(dom)}
                            className={[
                              "group flex min-h-[6.75rem] flex-col border-b border-slate-200 px-3 py-3 text-left align-top transition hover:bg-violet-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 sm:min-h-[7.75rem] sm:px-3.5 sm:py-4",
                              ci < 6 ? "border-r border-slate-200" : "",
                              inTripRangeCell(dom)
                                ? "bg-violet-50/90"
                                : "bg-white",
                              parseLocalIsoDate(isoFromCell(calYear, calMonth, dom))?.getTime() ===
                                parseLocalIsoDate(rangeAnchor ?? "")?.getTime()
                                ? "ring-2 ring-amber-300 ring-inset"
                                : "",
                            ].join(" ")}
                          >
                            <div className="mb-3 flex shrink-0 items-start justify-between gap-2">
                              {isCalendarToday(dom) ? (
                                <span className="flex h-7 min-w-[1.75rem] shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-semibold text-white shadow-sm">
                                  {dom}
                                </span>
                              ) : (
                                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-500">{dom}</span>
                              )}
                            </div>

                            {(hostSetup.restaurantPins ?? [])
                              .filter((p) => p.dateIso === isoFromCell(calYear, calMonth, dom))
                              .map((p) => (
                                <div key={p.place.mapsUrl} className="mb-3 last:mb-0">
                                  <div className="flex items-start gap-2 rounded-md px-1.5 py-1.5 text-left leading-snug text-slate-800 transition hover:bg-white/70">
                                    <span className="min-w-0 flex-1 text-[13px] font-medium">{p.place.name}</span>
                                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">
                                      Meal
                                    </span>
                                  </div>
                                  <div className="mt-1 flex gap-2 pl-1.5">
                                    {p.kept ? (
                                      <button
                                        type="button"
                                        onClick={(ev) => {
                                          ev.stopPropagation();
                                          togglePin(p.dateIso, p.place.mapsUrl, false);
                                        }}
                                        className="text-[11px] font-semibold uppercase tracking-wide text-violet-600 underline-offset-2 hover:underline"
                                      >
                                        Remove
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={(ev) => {
                                          ev.stopPropagation();
                                          togglePin(p.dateIso, p.place.mapsUrl, true);
                                        }}
                                        className="text-[11px] font-semibold uppercase tracking-wide text-violet-600 underline-offset-2 hover:underline"
                                      >
                                        Add
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {!hostHasConcreteTripRange(plan) ? (
              <p className="border-t border-slate-100 bg-amber-50/90 px-5 py-3 text-sm leading-relaxed text-amber-900">
                Choose a trip range — two taps on the calendar — before you can publish.
              </p>
            ) : null}
            {err ? (
              <p className="border-t border-slate-100 bg-rose-50/80 px-5 py-3 text-center text-sm text-rose-800">
                {err}
              </p>
            ) : null}
          </div>
        </section>

        <section id="sec-accommodation" className="scroll-mt-28 space-y-3">
          <h2 className="text-lg font-semibold text-white">Accommodation</h2>
          <p className="text-sm text-neutral-400">
            Search and select the hotel for this trip — the violet bar on the calendar updates with the name.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              value={hotelQuery}
              onChange={(e) => setHotelQuery(e.target.value)}
              placeholder={plan.location ? `Search near ${plan.location}` : "Search hotels"}
              className="min-w-[200px] flex-1 rounded-xl border border-white/10 bg-neutral-900 px-4 py-2 text-sm outline-none placeholder:text-neutral-600 focus:border-brand-600"
            />
            <button
              type="button"
              onClick={() => void searchHotels()}
              disabled={hotelSearchBusy}
              className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
            >
              {hotelSearchBusy ? "…" : "Search"}
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-neutral-950/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Selected</p>
              {hostSetup.hotel?.name ? (
                <div className="mt-2 text-sm text-neutral-100">
                  {hostSetup.hotel.name}
                  {hostSetup.hotel.priceRange ? (
                    <span className="ml-2 text-neutral-400">({hostSetup.hotel.priceRange})</span>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-sm text-neutral-500">No hotel yet</p>
              )}
            </div>
            <ul className="max-h-60 space-y-1 overflow-auto rounded-xl border border-white/10 bg-neutral-950/40 p-2 text-sm">
              {hotelHits.map((h) => (
                <li key={h.mapsUrl}>
                  <button
                    type="button"
                    className="w-full rounded-lg px-3 py-2 text-left hover:bg-white/5"
                    onClick={() => onHotelPick(h)}
                  >
                    <span className="font-medium text-neutral-100">{h.name}</span>
                    <span className="ml-2 text-neutral-500">{h.priceRange}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="sec-food" className="scroll-mt-28">
          <h2 className="text-lg font-semibold text-white">Food pinboard</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Suggestions are listed in each day cell like events — Remove or Add as needed.
          </p>
          {!hostHasKeptRestaurant(plan) ? (
            <p className="mt-2 text-xs text-amber-400">Keep at least one restaurant to publish.</p>
          ) : null}
        </section>

        <section id="sec-transport" className="scroll-mt-28">
          <h2 className="text-lg font-semibold text-white">Transportation</h2>
          <p className="mt-1 text-sm text-neutral-400">Finalize flights and ground transfers with your crew after publishing.</p>
        </section>

        <section id="sec-experiences" className="scroll-mt-28 space-y-2">
          <h2 className="text-lg font-semibold text-white">Experiences</h2>
          <p className="text-sm text-neutral-400">Optional — skim ideas with travelers once the invite goes out.</p>
          <label className="flex cursor-pointer items-center gap-3 text-sm text-neutral-300">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-600"
              checked={hostSetup.experiencesOutlined ?? false}
              onChange={(e) => void persistHostSetup({ experiencesOutlined: e.target.checked })}
            />
            <span>I&apos;ve skimmed experiences (helps the completion checklist)</span>
          </label>
          <div className="mt-3 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full rounded-full bg-violet-500/80 transition-[width]"
              style={{ width: `${hostSetup.experiencesOutlined ? "100%" : "40%"}` }}
            />
          </div>
        </section>

        <section id="sec-packing" className="scroll-mt-28">
          <h2 className="text-lg font-semibold text-white">Packing list</h2>
          <p className="mt-1 text-sm text-neutral-400">Add packing tasks with your group on the shared board after publishing.</p>
        </section>

        <section id="sec-budget" className="scroll-mt-28">
          <h2 className="text-lg font-semibold text-white">Budget</h2>
          <p className="mt-1 text-sm text-neutral-400">
            {plan.budget.tier ?? plan.budget.perPerson ?? "Budget from chat applies to venue suggestions"}
          </p>
        </section>
      </div>

      <aside className="w-full shrink-0 lg:w-72">
        <div className="sticky top-24 space-y-4 rounded-2xl border border-white/10 bg-neutral-900/70 p-4 shadow-xl">
          <div>
            <p className="text-sm font-semibold text-white">Your trip is {pct}% complete</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width]"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <ul className="space-y-2 text-sm">
            <li className={`flex justify-between gap-2 ${hostHasConcreteTripRange(plan) ? "text-neutral-300" : "text-amber-400"}`}>
              <span>Dates {!hostHasConcreteTripRange(plan) ? "(required)" : ""}</span>
              {hostHasConcreteTripRange(plan) ? "✓" : "—"}
            </li>
            <li className={`flex justify-between gap-2 ${hostHasHotel(plan) ? "text-neutral-300" : "text-amber-400"}`}>
              <span>Hotel {!hostHasHotel(plan) ? "(required)" : ""}</span>
              {hostHasHotel(plan) ? "✓" : "—"}
            </li>
            <li className={`flex justify-between gap-2 ${hostHasKeptRestaurant(plan) ? "text-neutral-300" : "text-amber-400"}`}>
              <span>Restaurant {!hostHasKeptRestaurant(plan) ? "(required)" : ""}</span>
              {hostHasKeptRestaurant(plan) ? "✓" : "—"}
            </li>
            <li className="flex justify-between gap-2 border-t border-white/10 pt-2 text-neutral-400">
              <span>Experiences (optional)</span>
              <span className="text-xs text-violet-300">{hostSetup.experiencesOutlined ? "Outlined" : "Later"}</span>
            </li>
          </ul>

          <p className="border-t border-white/10 pt-4 text-xs leading-relaxed text-neutral-500">
            When everything above is checked, use the violet <strong className="text-neutral-300">Publish trip</strong> button in
            the calendar header to mint your invite code.
          </p>

          {err ? <p className="text-center text-xs text-rose-400">{err}</p> : null}
        </div>
      </aside>
    </div>
  );
}
