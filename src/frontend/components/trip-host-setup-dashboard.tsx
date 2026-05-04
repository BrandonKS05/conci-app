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

function calendarCells(viewYear: number, viewMonth: number): (number | null)[] {
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const n = daysInMonth(viewYear, viewMonth);
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= n; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function isoFromCell(viewYear: number, viewMonth: number, dom: number): string {
  return formatLocalIsoDate(new Date(viewYear, viewMonth, dom, 12, 0, 0, 0));
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
      void persistHostSetup({ ...hostSetup, hotel: h });
    },
    [hostSetup, persistHostSetup]
  );

  const togglePin = useCallback(
    (dateIso: string, mapsUrl: string, kept: boolean) => {
      const pins = [...(hostSetup.restaurantPins ?? [])];
      const idx = pins.findIndex((p) => p.dateIso === dateIso && p.place.mapsUrl === mapsUrl);
      if (idx === -1) return;
      pins[idx] = { ...pins[idx]!, kept };
      void persistHostSetup({ ...hostSetup, restaurantPins: pins });
    },
    [hostSetup, persistHostSetup]
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

  const cells = useMemo(() => calendarCells(calYear, calMonth), [calYear, calMonth]);

  const inTripRangeCell = useCallback(
    (dom: number | null): boolean => {
      if (!dom || !tripDisplayRange?.startIso || !tripDisplayRange.endIso) return false;
      const iso = isoFromCell(calYear, calMonth, dom);
      const days = enumerateLocalIsoDays(tripDisplayRange.startIso, tripDisplayRange.endIso);
      return days.includes(iso);
    },
    [tripDisplayRange, calYear, calMonth]
  );

  return (
    <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-12 lg:flex-row lg:gap-12 xl:gap-16">
      <aside className="w-full shrink-0 space-y-8 lg:min-w-[220px] lg:w-72 xl:w-[20rem]">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-neutral-900/60 shadow-xl shadow-black/20">
          <div
            className="aspect-[4/5] min-h-[220px] bg-neutral-800 bg-cover bg-center sm:min-h-[260px] lg:min-h-[288px]"
            style={heroUrl ? { backgroundImage: `url(${heroUrl})` } : undefined}
          />
          <p className="border-t border-white/10 px-5 py-4 text-sm font-medium leading-snug text-neutral-300">
            {plan.location?.trim() || plan.title?.trim() || "Destination"}
          </p>
        </div>

        <nav className="flex flex-col gap-1 px-1 text-[15px] leading-snug">
          {NAV.map((item) => (
            <a
              key={item.id}
              href={`#sec-${item.id}`}
              className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-neutral-400 transition hover:bg-white/[0.06] hover:text-neutral-100"
            >
              <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.45)]" />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 space-y-16 sm:space-y-20 lg:space-y-[5.5rem]">
        <section id="sec-dates" className="scroll-mt-36">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">Trip calendar</h2>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-neutral-400">
                {tripDisplayRange?.startIso
                  ? `${tripDisplayRange.startIso} → ${tripDisplayRange.endIso}. Tap another day if you want to redraw the trip window — first tap starts, second tap ends.`
                  : "Select your trip dates on the calendar below (two taps). The parser couldn’t nail exact days yet."}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  setCalMonth((m) => {
                    if (m <= 0) {
                      setCalYear((y) => y - 1);
                      return 11;
                    }
                    return m - 1;
                  })
                }
                className="rounded-xl border border-white/10 px-5 py-2.5 text-sm text-neutral-200 transition hover:border-white/15 hover:bg-white/[0.07]"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() =>
                  setCalMonth((m) => {
                    if (m >= 11) {
                      setCalYear((y) => y + 1);
                      return 0;
                    }
                    return m + 1;
                  })
                }
                className="rounded-xl border border-white/10 px-5 py-2.5 text-sm text-neutral-200 transition hover:border-white/15 hover:bg-white/[0.07]"
              >
                Next
              </button>
            </div>
          </div>

          {/* Hotel span row */}
          {tripDisplayRange?.startIso && tripDisplayRange.endIso ? (
            <div className="mb-8 rounded-2xl border border-rose-500/35 bg-rose-500/[0.12] px-6 py-4 text-sm leading-relaxed text-rose-100">
              <span className="font-semibold">Hotel stay</span>
              <span className="text-rose-200/90">
                {" "}
                — {hostSetup.hotel?.name ? `“${hostSetup.hotel.name}” spanning all trip nights` : "Pick accommodation below"}
              </span>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-3xl border border-white/10 bg-neutral-950/80 p-5 shadow-inner shadow-black/20 sm:p-8 lg:p-10">
            <div className="mb-9 text-center text-lg font-semibold text-neutral-100 sm:text-xl">
              {new Date(calYear, calMonth, 1).toLocaleString("default", {
                month: "long",
                year: "numeric",
              })}
              {rangeAnchor ? (
                <span className="ml-4 align-middle text-sm font-normal tracking-normal text-amber-400">
                  Select end date…
                </span>
              ) : null}
            </div>

            <div className="grid grid-cols-7 gap-1 px-0.5 pb-4 text-center text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500 sm:gap-2 sm:text-sm sm:tracking-[0.14em]">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((w) => (
                <div key={w} className="py-2 sm:py-3">
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5 lg:gap-3">
              {cells.map((dom, i) =>
                dom == null ? (
                  <div key={`e-${i}`} className="min-h-[7.25rem] sm:min-h-[8.5rem] lg:min-h-[9.5rem]" />
                ) : (
                  <button
                    type="button"
                    key={`d-${calYear}-${calMonth}-${dom}`}
                    onClick={() => onCalendarDayClick(dom)}
                    className={[
                      "relative flex min-h-[7.25rem] flex-col items-start rounded-xl border px-3 py-3 text-left transition sm:min-h-[8.5rem] sm:px-4 sm:py-4 lg:min-h-[9.5rem]",
                      inTripRangeCell(dom)
                        ? "border-brand-600/70 bg-brand-600/25 text-white shadow-inner shadow-brand-950/40"
                        : parseLocalIsoDate(isoFromCell(calYear, calMonth, dom))?.getTime() ===
                            parseLocalIsoDate(rangeAnchor ?? "")?.getTime()
                          ? "border-amber-400/80 bg-amber-500/15 text-amber-50"
                          : "border-white/5 bg-neutral-900/60 text-neutral-200 hover:bg-neutral-800/85",
                    ].join(" ")}
                  >
                    <span className="text-lg font-semibold tabular-nums sm:text-xl">{dom}</span>
                    {(hostSetup.restaurantPins ?? [])
                      .filter((p) => p.dateIso === isoFromCell(calYear, calMonth, dom))
                      .map((p) => (
                        <div
                          key={p.place.mapsUrl}
                          className="mt-2 line-clamp-2 w-full text-[11px] leading-snug text-neutral-400 sm:text-xs"
                        >
                          <span className="font-medium text-neutral-200">{p.place.name}</span>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {p.kept ? (
                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  togglePin(p.dateIso, p.place.mapsUrl, false);
                                }}
                                className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wide hover:bg-rose-500/50 sm:text-[11px]"
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
                                className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wide hover:bg-emerald-500/40 sm:text-[11px]"
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

            {!hostHasConcreteTripRange(plan) ? (
              <p className="mt-8 text-sm leading-relaxed text-amber-400">
                Dates are required to publish — choose a start and end day on this calendar.
              </p>
            ) : null}
          </div>
        </section>

        <section id="sec-accommodation" className="scroll-mt-36 space-y-7">
          <h2 className="text-xl font-semibold text-white sm:text-2xl">Accommodation</h2>
          <p className="max-w-2xl text-base leading-relaxed text-neutral-400">
            Search and select the hotel for this trip (shown as the stay block above).
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <input
              value={hotelQuery}
              onChange={(e) => setHotelQuery(e.target.value)}
              placeholder={plan.location ? `Search near ${plan.location}` : "Search hotels"}
              className="min-w-[220px] flex-1 rounded-2xl border border-white/10 bg-neutral-900 px-5 py-3.5 text-base outline-none placeholder:text-neutral-600 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
            />
            <button
              type="button"
              onClick={() => void searchHotels()}
              disabled={hotelSearchBusy}
              className="rounded-2xl bg-white px-7 py-3.5 text-base font-medium text-neutral-900 shadow-lg shadow-black/10 disabled:opacity-50"
            >
              {hotelSearchBusy ? "…" : "Search"}
            </button>
          </div>
          <div className="grid gap-6 pt-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-neutral-950/70 p-6 sm:p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Selected</p>
              {hostSetup.hotel?.name ? (
                <div className="mt-4 text-base leading-snug text-neutral-100">
                  {hostSetup.hotel.name}
                  {hostSetup.hotel.priceRange ? (
                    <span className="ml-2 text-neutral-400">({hostSetup.hotel.priceRange})</span>
                  ) : null}
                </div>
              ) : (
                <p className="mt-4 text-base text-neutral-500">No hotel yet</p>
              )}
            </div>
            <ul className="max-h-72 space-y-2 overflow-auto rounded-2xl border border-white/10 bg-neutral-950/40 p-3 text-[15px]">
              {hotelHits.map((h) => (
                <li key={h.mapsUrl}>
                  <button
                    type="button"
                    className="w-full rounded-xl px-4 py-3.5 text-left transition hover:bg-white/[0.07]"
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

        <section id="sec-food" className="scroll-mt-36 space-y-6">
          <h2 className="text-xl font-semibold text-white sm:text-2xl">Food pinboard</h2>
          <p className="max-w-2xl text-base leading-relaxed text-neutral-400">
            We suggested restaurants scaled to your budget and spread them across trip days. Toggle Add/Remove on each day.
          </p>
          {!hostHasKeptRestaurant(plan) ? (
            <p className="mt-4 text-sm text-amber-400">Keep at least one restaurant to publish.</p>
          ) : null}
        </section>

        <section id="sec-transport" className="scroll-mt-36 space-y-5">
          <h2 className="text-xl font-semibold text-white sm:text-2xl">Transportation</h2>
          <p className="max-w-2xl text-base leading-relaxed text-neutral-400">
            Finalize flights and ground transfers with your crew after publishing.
          </p>
        </section>

        <section id="sec-experiences" className="scroll-mt-36 space-y-6 pt-4">
          <h2 className="text-xl font-semibold text-white sm:text-2xl">Experiences</h2>
          <p className="max-w-2xl text-base leading-relaxed text-neutral-400">
            Optional — skim ideas with travelers once the invite goes out.
          </p>
          <label className="flex cursor-pointer items-start gap-4 rounded-2xl border border-transparent px-2 py-2 text-[15px] leading-relaxed text-neutral-300 transition hover:border-white/5 hover:bg-white/[0.03]">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0 accent-brand-600"
              checked={hostSetup.experiencesOutlined ?? false}
              onChange={(e) => void persistHostSetup({ experiencesOutlined: e.target.checked })}
            />
            <span>I&apos;ve skimmed experiences (helps the completion checklist)</span>
          </label>
          <div className="mt-6 h-2.5 w-full max-w-md overflow-hidden rounded-full bg-neutral-800 sm:h-3">
            <div
              className="h-full rounded-full bg-violet-500/80 transition-[width]"
              style={{ width: `${hostSetup.experiencesOutlined ? "100%" : "40%"}` }}
            />
          </div>
        </section>

        <section id="sec-packing" className="scroll-mt-36 space-y-5">
          <h2 className="text-xl font-semibold text-white sm:text-2xl">Packing list</h2>
          <p className="max-w-2xl text-base leading-relaxed text-neutral-400">
            Add packing tasks with your group on the shared trip board after publishing.
          </p>
        </section>

        <section id="sec-budget" className="scroll-mt-36 space-y-5">
          <h2 className="text-xl font-semibold text-white sm:text-2xl">Budget</h2>
          <p className="max-w-2xl text-base leading-relaxed text-neutral-400">
            {plan.budget.tier ?? plan.budget.perPerson ?? "Budget from chat applies to venue suggestions"}
          </p>
        </section>
      </div>

      <aside className="w-full shrink-0 lg:w-80 xl:w-[22rem]">
        <div className="sticky top-28 space-y-10 rounded-3xl border border-white/10 bg-neutral-900/70 p-8 shadow-xl shadow-black/25 sm:p-10">
          <div>
            <p className="text-base font-semibold tracking-tight text-white sm:text-lg">Your trip is {pct}% complete</p>
            <div className="mt-5 h-3.5 overflow-hidden rounded-full bg-neutral-800/90 sm:h-4">
              <div
                className="h-full rounded-full bg-emerald-500 shadow-[0_0_20px_rgba(34,197,94,0.35)] transition-[width]"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <ul className="flex flex-col gap-6 border-t border-white/10 pt-8 text-[15px] sm:text-base">
            <li
              className={`flex items-start justify-between gap-4 pb-3 ${hostHasConcreteTripRange(plan) ? "text-neutral-300" : "text-amber-400"}`}
            >
              <span className="leading-snug">Dates {!hostHasConcreteTripRange(plan) ? "(required)" : ""}</span>
              <span className="shrink-0 text-lg">{hostHasConcreteTripRange(plan) ? "✓" : "—"}</span>
            </li>
            <li
              className={`flex items-start justify-between gap-4 pb-3 ${hostHasHotel(plan) ? "text-neutral-300" : "text-amber-400"}`}
            >
              <span className="leading-snug">Hotel {!hostHasHotel(plan) ? "(required)" : ""}</span>
              <span className="shrink-0 text-lg">{hostHasHotel(plan) ? "✓" : "—"}</span>
            </li>
            <li
              className={`flex items-start justify-between gap-4 pb-3 ${hostHasKeptRestaurant(plan) ? "text-neutral-300" : "text-amber-400"}`}
            >
              <span className="leading-snug">Restaurant {!hostHasKeptRestaurant(plan) ? "(required)" : ""}</span>
              <span className="shrink-0 text-lg">{hostHasKeptRestaurant(plan) ? "✓" : "—"}</span>
            </li>
            <li className="flex items-start justify-between gap-4 border-t border-white/10 pt-7 text-neutral-400">
              <span className="leading-snug">Experiences (optional)</span>
              <span className="shrink-0 text-sm text-violet-300">{hostSetup.experiencesOutlined ? "Outlined" : "Later"}</span>
            </li>
          </ul>

          <button
            type="button"
            disabled={!pubReady || publishBusy}
            onClick={() => void onPublish()}
            className="w-full rounded-2xl bg-rose-500 py-4 text-base font-semibold text-white shadow-lg shadow-rose-900/40 transition hover:bg-rose-400 disabled:pointer-events-none disabled:opacity-40 sm:py-[1.125rem]"
          >
            {publishBusy ? "Publishing…" : "Publish trip"}
          </button>
          {!pubReady ? (
            <p className="mx-auto max-w-xs text-center text-sm leading-relaxed text-neutral-500">
              Publishing mints your invite code and opens the collaborative trip workspace.
            </p>
          ) : null}

          {err ? <p className="text-center text-sm text-rose-400">{err}</p> : null}
        </div>
      </aside>
    </div>
  );
}
