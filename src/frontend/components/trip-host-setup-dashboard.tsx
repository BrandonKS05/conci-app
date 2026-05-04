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
  seedTextMentionsDining,
  type HostActivityExperience,
  type HostRestaurantPin,
  type HostSetupState,
  type TripPlan,
} from "@/shared/trip-plan";
import { HostSetupAddPlacesModal } from "@/frontend/components/host-setup-add-places-modal";
import { SiteShell } from "@/frontend/components/site-shell";
import { restaurantPickToSpotlight, type RestaurantPick } from "@/shared/restaurants";
import type { LiveExperienceCard } from "@/shared/trip-live-recommendations";
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
  /** Original parser message — used only to decide if meal pins auto-seed. */
  seedText?: string | null;
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

function isoFromCell(viewYear: number, viewMonth: number, dom: number): string {
  return formatLocalIsoDate(new Date(viewYear, viewMonth, dom, 12, 0, 0, 0));
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

export function TripHostSetupDashboard({ tripId, initialPlan, seedText = null }: Props) {
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
  const [datePickMode, setDatePickMode] = useState<"range" | "day">(() =>
    hostHasConcreteTripRange(initialPlan) ? "day" : "range"
  );
  const [selectedDayIso, setSelectedDayIso] = useState<string | null>(null);
  const [addPlacesOpen, setAddPlacesOpen] = useState(false);

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

  /** Seed restaurant pins only when the host’s parser message mentioned dining. */
  useEffect(() => {
    const persisted = hostSetup.tripRange;
    if (!persisted?.startIso || !persisted.endIso || suggestedSeededRef.current) return;
    const existing = hostSetup.restaurantPins?.length ?? 0;
    if (existing > 0) {
      suggestedSeededRef.current = true;
      return;
    }

    if (!seedTextMentionsDining(seedText)) {
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
  }, [hostSetup.tripRange?.startIso, hostSetup.tripRange?.endIso, tripId, seedText]);

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

  const toggleActivityPin = useCallback(
    (dateIso: string, bookingUrl: string, kept: boolean) => {
      const pins = [...(hostSetup.activityPins ?? [])];
      const idx = pins.findIndex((p) => p.dateIso === dateIso && p.experience.bookingUrl === bookingUrl);
      if (idx === -1) return;
      pins[idx] = { ...pins[idx]!, kept };
      void persistHostSetup({ activityPins: pins });
    },
    [hostSetup.activityPins, persistHostSetup]
  );

  const clearDayPins = useCallback(
    (dateIso: string) => {
      const rp = (hostSetup.restaurantPins ?? []).filter((p) => p.dateIso !== dateIso);
      const ap = (hostSetup.activityPins ?? []).filter((p) => p.dateIso !== dateIso);
      const nextRp = rp.length ? rp : undefined;
      const nextAp = ap.length ? ap : undefined;
      void persistHostSetup({
        restaurantPins: nextRp ?? [],
        activityPins: nextAp ?? [],
      });
    },
    [hostSetup.restaurantPins, hostSetup.activityPins, persistHostSetup]
  );

  const onCalendarDayClick = useCallback(
    (dom: number) => {
      const iso = isoFromCell(calYear, calMonth, dom);

      if (datePickMode === "range") {
        if (!rangeAnchor) {
          setRangeAnchor(iso);
          return;
        }

        let start = parseLocalIsoDate(rangeAnchor)!;
        let end = parseLocalIsoDate(iso)!;
        if (start.getTime() > end.getTime()) [start, end] = [end, start];
        setRangeAnchor(null);
        suggestedSeededRef.current = false;
        setSelectedDayIso(null);
        void (async () => {
          await persistHostSetup({
            hotel: hostSetup.hotel,
            experiencesOutlined: hostSetup.experiencesOutlined,
            tripRange: { startIso: formatLocalIsoDate(start), endIso: formatLocalIsoDate(end) },
            restaurantPins: [],
            activityPins: [],
          });
          setDatePickMode("day");
        })();
        return;
      }

      const inRange =
        tripDisplayRange?.startIso &&
        tripDisplayRange?.endIso &&
        enumerateLocalIsoDays(tripDisplayRange.startIso, tripDisplayRange.endIso).includes(iso);
      if (!inRange) return;

      /* Focus this day for keyboard / mobile; hover uses the same cell for actions. */
      setSelectedDayIso(iso);
    },
    [
      calYear,
      calMonth,
      rangeAnchor,
      datePickMode,
      tripDisplayRange?.startIso,
      tripDisplayRange?.endIso,
      hostSetup.hotel,
      hostSetup.experiencesOutlined,
      persistHostSetup,
    ]
  );

  const addRestaurantToDay = useCallback(
    (pick: RestaurantPick) => {
      if (!selectedDayIso) return;
      const place = restaurantPickToSpotlight(pick);
      const pins = [...(hostSetup.restaurantPins ?? [])];
      if (pins.some((p) => p.dateIso === selectedDayIso && p.place.mapsUrl === place.mapsUrl)) return;
      pins.push({ dateIso: selectedDayIso, place, kept: true });
      void persistHostSetup({ restaurantPins: pins });
    },
    [hostSetup.restaurantPins, persistHostSetup, selectedDayIso]
  );

  const addExperienceToDay = useCallback(
    (card: LiveExperienceCard) => {
      if (!selectedDayIso) return;
      const experience: HostActivityExperience = {
        name: card.name,
        pricePerPerson: card.pricePerPerson,
        rating: card.rating,
        duration: card.duration,
        bookingUrl: card.bookingUrl,
        coverPhotoUrl: card.coverPhotoUrl ?? null,
      };
      const pins = [...(hostSetup.activityPins ?? [])];
      if (pins.some((p) => p.dateIso === selectedDayIso && p.experience.bookingUrl === experience.bookingUrl)) return;
      pins.push({ dateIso: selectedDayIso, experience, kept: true });
      void persistHostSetup({ activityPins: pins });
    },
    [hostSetup.activityPins, persistHostSetup, selectedDayIso]
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

  const selectedDayLabel = useMemo(() => {
    if (!selectedDayIso) return "";
    const d = parseLocalIsoDate(selectedDayIso);
    return d
      ? d.toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : selectedDayIso;
  }, [selectedDayIso]);

  const completionCard = (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm dark:border-white/15 dark:bg-dm-card dark:shadow-black/20 sm:px-4 sm:py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-900 dark:text-white">Trip {pct}% complete</p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-neutral-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width]"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] sm:justify-end sm:text-[11px]">
          <li
            className={`flex items-center gap-1.5 ${hostHasConcreteTripRange(plan) ? "text-slate-600 dark:text-neutral-300" : "text-amber-600 dark:text-amber-400"}`}
          >
            <span>Dates</span>
            {hostHasConcreteTripRange(plan) ? "✓" : "—"}
          </li>
          <li
            className={`flex items-center gap-1.5 ${hostHasHotel(plan) ? "text-slate-600 dark:text-neutral-300" : "text-amber-600 dark:text-amber-400"}`}
          >
            <span>Hotel</span>
            {hostHasHotel(plan) ? "✓" : "—"}
          </li>
          <li
            className={`flex items-center gap-1.5 ${hostHasKeptRestaurant(plan) ? "text-slate-600 dark:text-neutral-300" : "text-amber-600 dark:text-amber-400"}`}
          >
            <span>Restaurant</span>
            {hostHasKeptRestaurant(plan) ? "✓" : "—"}
          </li>
          <li className="flex items-center gap-1.5 text-slate-500 dark:text-neutral-400">
            <span>Experiences</span>
            <span className="text-violet-600 dark:text-violet-300">{hostSetup.experiencesOutlined ? "Done" : "Opt."}</span>
          </li>
        </ul>
      </div>
      <p className="mt-2 border-t border-slate-200 pt-2 text-[10px] leading-snug text-slate-500 dark:border-white/10 dark:text-neutral-500">
        Publish from the calendar when ready.
      </p>
      {err ? <p className="mt-1.5 text-center text-[10px] text-rose-600 dark:text-rose-400">{err}</p> : null}
    </div>
  );

  return (
    <SiteShell
      title={plan.title || "Trip setup"}
      eyebrow="Host setup"
      tripTypography
      titleRight={completionCard}
      contentWide
    >
      <div className="mx-auto flex w-full flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
      <aside className="w-full shrink-0 space-y-4 lg:w-52 xl:w-56 lg:min-w-[200px]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
          <div
            className="aspect-[16/11] bg-slate-200 bg-cover bg-center dark:bg-neutral-800"
            style={heroUrl ? { backgroundImage: `url(${heroUrl})` } : undefined}
          />
          <p className="border-t border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 dark:border-white/10 dark:text-neutral-400">
            {plan.location?.trim() || plan.title?.trim() || "Destination"}
          </p>
        </div>

        <nav className="space-y-1 text-sm">
          {NAV.map((item) => (
            <a
              key={item.id}
              href={`#sec-${item.id}`}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-neutral-100"
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500" />
              {item.label}
            </a>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 space-y-10 lg:min-w-0">
        <section id="sec-dates" className="scroll-mt-28">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-neutral-400">
                {datePickMode === "range"
                  ? tripDisplayRange?.startIso && tripDisplayRange.endIso
                    ? `Change dates: tap two days (currently ${tripDisplayRange.startIso} → ${tripDisplayRange.endIso}). Confirming new dates clears meal and activity pins for the old range.`
                    : "Tap two days to set your trip; days in range are highlighted below."
                  : tripDisplayRange?.startIso && tripDisplayRange.endIso
                    ? `${tripDisplayRange.startIso} → ${tripDisplayRange.endIso} — hover a trip day for Add or Clear; Add loads contextual meals & activities (tap on mobile).`
                    : "Tap two days to set your trip."}
              </p>
              {rangeAnchor && datePickMode === "range" ? (
                <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">Select end date…</p>
              ) : null}
            </div>
            {hostHasConcreteTripRange(plan) ? (
              <button
                type="button"
                onClick={() => {
                  setDatePickMode("range");
                  setRangeAnchor(null);
                  setSelectedDayIso(null);
                  setAddPlacesOpen(false);
                }}
                className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-200 dark:hover:bg-dm-page"
              >
                Change dates
              </button>
            ) : null}
          </div>

          <div className="mx-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-dm-card dark:text-neutral-100 dark:shadow-none">
            {/* Header — toolbar like reference */}
            <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:px-6 sm:py-4">
              <h3 className="text-lg font-bold tracking-tight text-slate-900 dark:text-neutral-100 sm:text-xl">
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
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:text-neutral-300 dark:hover:border-white/15 dark:hover:bg-dm-elevated"
                >
                  <ChevLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => jumpToToday()}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 sm:text-sm dark:text-neutral-200 dark:hover:bg-dm-elevated"
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
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:text-neutral-300 dark:hover:border-white/15 dark:hover:bg-dm-elevated"
                >
                  <ChevRight className="h-4 w-4" />
                </button>
                <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 sm:text-sm dark:border-white/10 dark:bg-dm-page dark:text-neutral-300">
                  Month view
                  <ChevDownSm className="h-3.5 w-3.5 text-slate-400 dark:text-neutral-500" />
                </div>
                <button
                  type="button"
                  disabled={!pubReady || publishBusy}
                  onClick={() => void onPublish()}
                  className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-500 disabled:pointer-events-none disabled:bg-slate-300 disabled:text-slate-500 sm:px-4 sm:py-2 sm:text-sm dark:disabled:bg-neutral-700 dark:disabled:text-neutral-500"
                >
                  {publishBusy ? "Publishing…" : "Publish trip"}
                </button>
              </div>
            </div>

            {/* Weekday stripe */}
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/90 dark:border-white/10 dark:bg-dm-elevated/80">
              {WEEKDAY_MON_FIRST.map((w) => (
                <div
                  key={w}
                  className="border-l border-transparent py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 first:border-l-0 dark:text-neutral-400 sm:py-3 sm:text-[11px] sm:tracking-[0.15em] md:text-xs md:tracking-[0.16em]"
                >
                  {w}
                </div>
              ))}
            </div>

            <div className="border-x border-slate-200 bg-white dark:border-white/10 dark:bg-dm-card">
              {weeks.map((weekRow, wi) => (
                <div key={`wk-${wi}`} className="grid grid-cols-7">
                  {weekRow.map((dom, ci) => {
                    if (dom == null) {
                      return (
                        <div
                          key={`e-${wi}-${ci}`}
                          className={[
                            "min-h-[7.5rem] border-b border-slate-200 bg-slate-50/40 dark:border-white/10 dark:bg-dm-page/60 sm:min-h-[8.75rem] lg:min-h-[10rem]",
                            ci < 6 ? "border-r border-slate-200 dark:border-white/10" : "",
                          ].join(" ")}
                        />
                      );
                    }
                    const cellIso = isoFromCell(calYear, calMonth, dom);
                    const dayHasPins =
                      (hostSetup.restaurantPins ?? []).some((p) => p.dateIso === cellIso) ||
                      (hostSetup.activityPins ?? []).some((p) => p.dateIso === cellIso);
                    const showDayActions =
                      datePickMode === "day" &&
                      inTripRangeCell(dom) &&
                      tripDisplayRange?.startIso &&
                      tripDisplayRange.endIso;
                    return (
                      <div
                        key={`d-${calYear}-${calMonth}-${dom}-${wi}-${ci}`}
                        tabIndex={0}
                        role="presentation"
                        onClick={() => onCalendarDayClick(dom)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onCalendarDayClick(dom);
                          }
                        }}
                        className={[
                          "group/cell relative flex min-h-[7.5rem] cursor-pointer flex-col border-b border-slate-200 px-2.5 py-2.5 text-left align-top transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 sm:min-h-[8.75rem] sm:px-3 sm:py-3 lg:min-h-[10rem] lg:px-4 lg:py-4 dark:border-white/10",
                          ci < 6 ? "border-r border-slate-200 dark:border-white/10" : "",
                          inTripRangeCell(dom)
                            ? "bg-violet-50/90 hover:bg-violet-50 dark:bg-violet-950/35 dark:hover:bg-violet-950/45"
                            : "bg-white hover:bg-slate-50/80 dark:bg-dm-card dark:hover:bg-dm-elevated/50",
                          parseLocalIsoDate(cellIso)?.getTime() === parseLocalIsoDate(rangeAnchor ?? "")?.getTime()
                            ? "ring-2 ring-amber-300 ring-inset dark:ring-amber-500/50"
                            : "",
                          datePickMode === "day" && selectedDayIso === cellIso
                            ? "ring-1 ring-violet-400/80 ring-inset dark:ring-violet-500/50"
                            : "",
                        ].join(" ")}
                      >
                        <div className="mb-2 flex shrink-0 items-start justify-between gap-2">
                          {isCalendarToday(dom) ? (
                            <span className="flex h-7 min-w-[1.75rem] shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-semibold text-white shadow-sm sm:h-8 sm:min-w-[2rem] sm:text-sm">
                              {dom}
                            </span>
                          ) : (
                            <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-500 dark:text-neutral-400 sm:text-base">
                              {dom}
                            </span>
                          )}
                        </div>

                        {(hostSetup.restaurantPins ?? [])
                          .filter((p) => p.dateIso === cellIso)
                          .map((p) => (
                            <div key={p.place.mapsUrl} className="mb-2 last:mb-0">
                              <div className="flex items-start gap-1.5 rounded-md px-1 py-1 text-left leading-snug text-slate-800 transition hover:bg-white/70 dark:text-neutral-100 dark:hover:bg-white/5">
                                <span className="min-w-0 flex-1 text-[12px] font-medium sm:text-[13px]">{p.place.name}</span>
                                <span className="shrink-0 text-[9px] uppercase tracking-wide text-slate-400 sm:text-[10px] dark:text-neutral-500">
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
                                    className="text-[11px] font-semibold uppercase tracking-wide text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
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
                                    className="text-[11px] font-semibold uppercase tracking-wide text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
                                  >
                                    Add
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}

                        {(hostSetup.activityPins ?? [])
                          .filter((p) => p.dateIso === cellIso)
                          .map((p) => (
                            <div key={p.experience.bookingUrl} className="mb-2 last:mb-0">
                              <div className="flex items-start gap-1.5 rounded-md px-1 py-1 text-left leading-snug text-slate-800 transition hover:bg-white/70 dark:text-neutral-100 dark:hover:bg-white/5">
                                <span className="min-w-0 flex-1 text-[12px] font-medium sm:text-[13px]">{p.experience.name}</span>
                                <span className="shrink-0 text-[9px] uppercase tracking-wide text-slate-400 sm:text-[10px] dark:text-neutral-500">
                                  Activity
                                </span>
                              </div>
                              <div className="mt-1 flex gap-2 pl-1.5">
                                {p.kept ? (
                                  <button
                                    type="button"
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      toggleActivityPin(p.dateIso, p.experience.bookingUrl, false);
                                    }}
                                    className="text-[11px] font-semibold uppercase tracking-wide text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
                                  >
                                    Remove
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      toggleActivityPin(p.dateIso, p.experience.bookingUrl, true);
                                    }}
                                    className="text-[11px] font-semibold uppercase tracking-wide text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
                                  >
                                    Add
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}

                        {showDayActions ? (
                          <div
                            className={[
                              "pointer-events-none absolute inset-x-1 bottom-1 z-[2] flex flex-col gap-1 opacity-0 transition-opacity duration-150",
                              "max-md:pointer-events-auto max-md:opacity-100",
                              "md:pointer-events-none md:opacity-0 md:group-hover/cell:pointer-events-auto md:group-hover/cell:opacity-100",
                            ].join(" ")}
                          >
                            <button
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setSelectedDayIso(cellIso);
                                setAddPlacesOpen(true);
                              }}
                              className="rounded-md border border-violet-200 bg-violet-50/95 px-2 py-1 text-center text-[10px] font-semibold text-violet-800 shadow-sm backdrop-blur-sm hover:bg-violet-100 dark:border-violet-500/40 dark:bg-violet-950/85 dark:text-violet-100 dark:hover:bg-violet-950"
                            >
                              Add meals &amp; activities
                            </button>
                            {dayHasPins ? (
                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  clearDayPins(cellIso);
                                }}
                                className="rounded-md border border-slate-200/90 bg-white/95 px-2 py-1 text-center text-[10px] font-semibold text-slate-600 shadow-sm backdrop-blur-sm hover:bg-rose-50 hover:text-rose-700 dark:border-white/15 dark:bg-dm-elevated/95 dark:text-neutral-300 dark:hover:bg-rose-950/50 dark:hover:text-rose-200"
                              >
                                Clear day
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {!hostHasConcreteTripRange(plan) ? (
              <p className="border-t border-slate-100 bg-amber-50/90 px-5 py-3 text-sm leading-relaxed text-amber-900 dark:border-white/10 dark:bg-amber-950/40 dark:text-amber-100">
                Choose a trip range — two taps on the calendar — before you can publish.
              </p>
            ) : null}
            {err ? (
              <p className="border-t border-slate-100 bg-rose-50/80 px-5 py-3 text-center text-sm text-rose-800 dark:border-white/10 dark:bg-rose-950/40 dark:text-rose-200">
                {err}
              </p>
            ) : null}
          </div>
        </section>

        <section id="sec-accommodation" className="scroll-mt-28 space-y-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Accommodation</h2>
          <p className="text-sm text-slate-600 dark:text-neutral-400">
            Search and select the hotel for this trip — it appears here and in your trip details.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              value={hotelQuery}
              onChange={(e) => setHotelQuery(e.target.value)}
              placeholder={plan.location ? `Search near ${plan.location}` : "Search hotels"}
              className="min-w-[200px] flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-600 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-100 dark:placeholder:text-neutral-500"
            />
            <button
              type="button"
              onClick={() => void searchHotels()}
              disabled={hotelSearchBusy}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-100 dark:hover:bg-dm-page"
            >
              {hotelSearchBusy ? "…" : "Search"}
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-dm-elevated/80">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-500">
                Selected
              </p>
              {hostSetup.hotel?.name ? (
                <div className="mt-2 text-sm text-slate-900 dark:text-neutral-100">
                  {hostSetup.hotel.name}
                  {hostSetup.hotel.priceRange ? (
                    <span className="ml-2 text-slate-500 dark:text-neutral-400">({hostSetup.hotel.priceRange})</span>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500 dark:text-neutral-500">No hotel yet</p>
              )}
            </div>
            <ul className="max-h-60 space-y-1 overflow-auto rounded-xl border border-slate-200 bg-white p-2 text-sm dark:border-white/10 dark:bg-dm-elevated/50">
              {hotelHits.map((h) => (
                <li key={h.mapsUrl}>
                  <button
                    type="button"
                    className="w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/5"
                    onClick={() => onHotelPick(h)}
                  >
                    <span className="font-medium text-slate-900 dark:text-neutral-100">{h.name}</span>
                    <span className="ml-2 text-slate-500 dark:text-neutral-500">{h.priceRange}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="sec-food" className="scroll-mt-28">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Food pinboard</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">
            Meals and activities you add from the calendar show here per day — use Remove if you change your mind.
          </p>
          {!hostHasKeptRestaurant(plan) ? (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Keep at least one restaurant to publish.</p>
          ) : null}
        </section>

        <section id="sec-transport" className="scroll-mt-28">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Transportation</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">
            Finalize flights and ground transfers with your crew after publishing.
          </p>
        </section>

        <section id="sec-experiences" className="scroll-mt-28 space-y-2">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Experiences</h2>
          <p className="text-sm text-slate-600 dark:text-neutral-400">
            Optional — skim ideas with travelers once the invite goes out.
          </p>
          <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-700 dark:text-neutral-300">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-600"
              checked={hostSetup.experiencesOutlined ?? false}
              onChange={(e) => void persistHostSetup({ experiencesOutlined: e.target.checked })}
            />
            <span>I&apos;ve skimmed experiences (helps the completion checklist)</span>
          </label>
          <div className="mt-3 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-slate-200 dark:bg-neutral-800">
            <div
              className="h-full rounded-full bg-violet-500/80 transition-[width]"
              style={{ width: `${hostSetup.experiencesOutlined ? "100%" : "40%"}` }}
            />
          </div>
        </section>

        <section id="sec-packing" className="scroll-mt-28">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Packing list</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">
            Add packing tasks with your group on the shared board after publishing.
          </p>
        </section>

        <section id="sec-budget" className="scroll-mt-28">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Budget</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">
            {plan.budget.tier ?? plan.budget.perPerson ?? "Budget from chat applies to venue suggestions"}
          </p>
        </section>
      </div>
      </div>

      <HostSetupAddPlacesModal
        open={addPlacesOpen && Boolean(selectedDayIso)}
        onClose={() => setAddPlacesOpen(false)}
        tripId={tripId}
        plan={plan}
        dateLabel={selectedDayLabel}
        onAddRestaurant={addRestaurantToDay}
        onAddExperience={addExperienceToDay}
      />
    </SiteShell>
  );
}
