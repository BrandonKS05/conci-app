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
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 lg:flex-row lg:gap-8">
      <aside className="w-full shrink-0 space-y-4 lg:w-56 xl:w-64">
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
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-white">Trip calendar</h2>
              <p className="mt-1 max-w-xl text-sm text-neutral-400">
                {tripDisplayRange?.startIso
                  ? `${tripDisplayRange.startIso} → ${tripDisplayRange.endIso}. Tap another day if you want to redraw the trip window — first tap starts, second tap ends.`
                  : "Select your trip dates on the calendar below (two taps). The parser couldn’t nail exact days yet."}
              </p>
            </div>
            <div className="flex items-center gap-2">
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
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/5"
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
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/5"
              >
                Next
              </button>
            </div>
          </div>

          {/* Hotel span row */}
          {tripDisplayRange?.startIso && tripDisplayRange.endIso ? (
            <div className="mb-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs text-rose-100">
              <span className="font-semibold">Hotel stay</span>
              <span className="text-rose-200/90">
                {" "}
                — {hostSetup.hotel?.name ? `“${hostSetup.hotel.name}” spanning all trip nights` : "Pick accommodation below"}
              </span>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/80 p-3 sm:p-5">
            <div className="mb-4 text-center font-medium text-neutral-200">
              {new Date(calYear, calMonth, 1).toLocaleString("default", {
                month: "long",
                year: "numeric",
              })}
              {rangeAnchor ? (
                <span className="ml-3 text-xs font-normal text-amber-400">Select end date…</span>
              ) : null}
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-neutral-500">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>

            <div className="mt-1 grid grid-cols-7 gap-1">
              {cells.map((dom, i) =>
                dom == null ? (
                  <div key={`e-${i}`} className="min-h-[4.75rem]" />
                ) : (
                  <button
                    type="button"
                    key={`d-${calYear}-${calMonth}-${dom}`}
                    onClick={() => onCalendarDayClick(dom)}
                    className={[
                      "relative flex min-h-[4.75rem] flex-col items-start rounded-lg border px-2 py-1.5 text-left text-[13px] transition",
                      inTripRangeCell(dom)
                        ? "border-brand-600/70 bg-brand-600/25 text-white shadow-inner"
                        : parseLocalIsoDate(isoFromCell(calYear, calMonth, dom))?.getTime() ===
                            parseLocalIsoDate(rangeAnchor ?? "")?.getTime()
                          ? "border-amber-400/80 bg-amber-500/15 text-amber-50"
                          : "border-white/5 bg-neutral-900/60 text-neutral-200 hover:bg-neutral-800/80",
                    ].join(" ")}
                  >
                    <span className="font-semibold tabular-nums">{dom}</span>
                    {(hostSetup.restaurantPins ?? [])
                      .filter((p) => p.dateIso === isoFromCell(calYear, calMonth, dom))
                      .map((p) => (
                        <div key={p.place.mapsUrl} className="mt-1 line-clamp-2 w-full text-[10px] leading-tight text-neutral-400">
                          <span className="font-medium text-neutral-200">{p.place.name}</span>
                          <div className="mt-0.5 flex gap-1">
                            {p.kept ? (
                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  togglePin(p.dateIso, p.place.mapsUrl, false);
                                }}
                                className="rounded bg-white/10 px-1 py-0.5 hover:bg-rose-500/50"
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
                                className="rounded bg-white/10 px-1 py-0.5 hover:bg-emerald-500/40"
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
              <p className="mt-4 text-xs text-amber-400">
                Dates are required to publish — choose a start and end day on this calendar.
              </p>
            ) : null}
          </div>
        </section>

        <section id="sec-accommodation" className="scroll-mt-28 space-y-3">
          <h2 className="text-lg font-semibold text-white">Accommodation</h2>
          <p className="text-sm text-neutral-400">Search and select the hotel for this trip (shown as the stay block above).</p>
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
          <p className="text-sm text-neutral-400">
            We suggested restaurants scaled to your budget and spread them across trip days. Toggle Add/Remove on each day.
          </p>
          {!hostHasKeptRestaurant(plan) ? (
            <p className="mt-2 text-xs text-amber-400">Keep at least one restaurant to publish.</p>
          ) : null}
        </section>

        <section id="sec-transport" className="scroll-mt-28">
          <h2 className="text-lg font-semibold text-white">Transportation</h2>
          <p className="text-sm text-neutral-400">Finalize flights and ground transfers with your crew after publishing.</p>
        </section>

        <section id="sec-experiences" className="scroll-mt-28 space-y-2">
          <h2 className="text-lg font-semibold text-white">Experiences</h2>
          <p className="text-sm text-neutral-400">Optional — skim ideas with travelers once the invite goes out.</p>
          <label className="flex cursor-pointer items-center gap-3 text-sm text-neutral-300">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-600"
              checked={hostSetup.experiencesOutlined ?? false}
              onChange={(e) => void persistHostSetup({ ...hostSetup, experiencesOutlined: e.target.checked })}
            />
            I&apos;ve skimmed experiences (helps the completion checklist)
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
          <p className="text-sm text-neutral-400">Add packing tasks with your group on the shared trip board after publishing.</p>
        </section>

        <section id="sec-budget" className="scroll-mt-28">
          <h2 className="text-lg font-semibold text-white">Budget</h2>
          <p className="text-sm text-neutral-400">
            {plan.budget.tier ?? plan.budget.perPerson ?? "Budget from chat applies to venue suggestions"}
          </p>
        </section>
      </div>

      <aside className="w-full shrink-0 space-y-4 lg:w-72">
        <div className="sticky top-24 space-y-4 rounded-2xl border border-white/10 bg-neutral-900/70 p-4 shadow-xl">
          <div>
            <p className="text-sm font-semibold text-white">Your trip is {pct}% complete</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-800">
              <div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${pct}%` }} />
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

          <button
            type="button"
            disabled={!pubReady || publishBusy}
            onClick={() => void onPublish()}
            className="w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-900/30 disabled:pointer-events-none disabled:opacity-40"
          >
            {publishBusy ? "Publishing…" : "Publish trip"}
          </button>
          {!pubReady ? (
            <p className="text-xs text-neutral-500">
              Publishing mints your invite code and opens the collaborative trip workspace.
            </p>
          ) : null}

          {err ? <p className="text-xs text-rose-400">{err}</p> : null}
        </div>
      </aside>
    </div>
  );
}
