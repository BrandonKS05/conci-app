"use client";

import { useMemo } from "react";
import type { ItineraryLiveCuration } from "@/shared/itinerary-live-curation";
import { inferSpotlightCategory, spotlightCategoryLabel } from "@/shared/spotlight-category";
import type { PlaceSpotlight } from "@/shared/place-preview";
import {
  concreteTripRangeFromPlanDates,
  enumerateLocalIsoDays,
  guaranteedPlanTitle,
  hotelStayForDay,
  parseLocalIsoDate,
  tripRangeBestEffortFromPlanDates,
  type TripPlan,
} from "@/shared/trip-plan";

function formatDayHeading(iso: string, index: number): string {
  const d = parseLocalIsoDate(iso);
  const datePart = d
    ? d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })
    : iso;
  return `Day ${index + 1} · ${datePart}`;
}

function liveKeyFallbackLabel(key: string): string {
  if (key.startsWith("r:")) return "Restaurant (from live picks)";
  if (key.startsWith("ex:")) return "Experience (from live picks)";
  if (key.startsWith("f:")) return "Flight (from live picks)";
  return "Saved pick";
}

function effectiveTripRange(plan: TripPlan): { startIso: string; endIso: string } | null {
  const hs = plan.hostSetup?.tripRange;
  if (hs?.startIso && hs?.endIso) {
    const a = parseLocalIsoDate(hs.startIso);
    const b = parseLocalIsoDate(hs.endIso);
    if (a && b && a.getTime() <= b.getTime()) {
      return { startIso: hs.startIso, endIso: hs.endIso };
    }
  }
  const y = new Date().getFullYear();
  return concreteTripRangeFromPlanDates(plan, y) ?? tripRangeBestEffortFromPlanDates(plan, y);
}

type DayRow = { icon: string; label: string; sub?: string };

function buildDayRows(
  plan: TripPlan,
  iso: string,
  liveByDay: Map<string, string[]>,
  opts: { isFirstTripDay: boolean }
): DayRow[] {
  const rows: DayRow[] = [];
  const stays = plan.hostSetup?.hotelStays;
  const stay = hotelStayForDay(stays, iso);
  const fallbackHotel =
    !stays?.length && opts.isFirstTripDay && plan.hostSetup?.hotel?.name?.trim()
      ? plan.hostSetup.hotel.name.trim()
      : "";
  const hotelName = stay?.place?.name?.trim() ?? fallbackHotel;

  if (hotelName) {
    rows.push({ icon: "🏨", label: hotelName, sub: "Lodging" });
  }

  const restaurants =
    plan.hostSetup?.restaurantPins?.filter((p) => p.kept && p.dateIso === iso && p.place?.name?.trim()) ?? [];
  for (const p of restaurants) {
    rows.push({ icon: "🍽️", label: p.place.name.trim(), sub: "Dining" });
  }

  const activities =
    plan.hostSetup?.activityPins?.filter((p) => p.kept && p.dateIso === iso && p.experience?.name?.trim()) ?? [];
  for (const p of activities) {
    rows.push({ icon: "🎯", label: p.experience.name.trim(), sub: "Activity" });
  }

  for (const label of liveByDay.get(iso) ?? []) {
    rows.push({ icon: "✨", label, sub: "Live pick" });
  }

  return rows;
}

function spotlightRestaurantRows(spotlights: PlaceSpotlight[] | undefined): DayRow[] {
  if (!spotlights?.length) return [];
  const rows: DayRow[] = [];
  for (const s of spotlights) {
    const cat = inferSpotlightCategory(s);
    if (cat !== "restaurant") continue;
    const name = s.name?.trim();
    if (!name) continue;
    rows.push({ icon: "📌", label: name, sub: spotlightCategoryLabel(cat) });
  }
  return rows;
}

export function DynamicTripItinerary({ plan }: { plan: TripPlan }) {
  const { days, liveByDay, unscheduledSpotlights } = useMemo(() => {
    const range = effectiveTripRange(plan);
    const daysList = range ? enumerateLocalIsoDays(range.startIso, range.endIso) : [];

    const cur = plan.itineraryLiveCuration as ItineraryLiveCuration | undefined;
    const sched = cur?.scheduledDates ?? {};
    const kept = new Set(cur?.kept ?? []);
    const liveByDayInner = new Map<string, string[]>();

    for (const k of kept) {
      const day = sched[k];
      if (!day || typeof day !== "string") continue;
      const label = liveKeyFallbackLabel(k);
      const list = liveByDayInner.get(day) ?? [];
      list.push(label);
      liveByDayInner.set(day, list);
    }

    const spotlightRows = spotlightRestaurantRows(plan.spotlights);
    return { days: daysList, liveByDay: liveByDayInner, unscheduledSpotlights: spotlightRows };
  }, [plan]);

  const title = guaranteedPlanTitle(plan.title, plan.location);
  const loc = plan.location?.trim();

  const hasTimelineContent = days.some(
    (iso, idx) => buildDayRows(plan, iso, liveByDay, { isFirstTripDay: idx === 0 }).length > 0
  );
  const emptyTimeline = days.length === 0 || !hasTimelineContent;

  return (
    <div className="space-y-4 rounded-3xl border border-[color:var(--hairline)] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
      <header className="border-b border-slate-100 pb-4 dark:border-white/10">
        <h2 className="text-xl font-semibold text-[color:var(--on-surface)] dark:text-white">{title}</h2>
        {loc ? <p className="mt-1 text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">{loc}</p> : null}
        <p className="mt-2 text-xs leading-relaxed text-[color:var(--on-surface-muted)] dark:text-neutral-500">
          Updates live when someone adds restaurants on the calendar, keeps live picks, or edits trip spotlights.
        </p>
      </header>

      {days.length === 0 ? (
        <p className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/35 dark:bg-amber-950/30 dark:text-amber-100">
          Set trip dates on the calendar to see a day-by-day outline here.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:text-neutral-500">
            Timeline
          </p>
          {emptyTimeline ? (
            <p className="rounded-xl border border-slate-100 bg-[color:var(--surface-container-low)] px-4 py-3 text-sm text-[color:var(--on-surface-variant)] dark:border-white/10 dark:bg-white/5 dark:text-neutral-400">
              No dining or lodging on the calendar yet for these dates — pin restaurants on the month grid or add live picks from
              flights. This section fills in automatically as you go.
            </p>
          ) : null}

          <ul className="space-y-3">
            {days.map((iso, index) => {
              const rows = buildDayRows(plan, iso, liveByDay, { isFirstTripDay: index === 0 });
              if (!rows.length) return null;
              return (
                <li
                  key={iso}
                  className="overflow-hidden rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)]/50 dark:border-white/10 dark:bg-dm-page/80"
                >
                  <div className="border-b border-slate-100 bg-white px-4 py-3 dark:border-white/10 dark:bg-dm-card/90">
                    <h3 className="text-sm font-semibold text-[color:var(--on-surface)] dark:text-neutral-100">
                      {formatDayHeading(iso, index)}
                    </h3>
                  </div>
                  <ul className="divide-y divide-slate-100 dark:divide-white/10">
                    {rows.map((r, i) => (
                      <li key={`${iso}-${i}-${r.label}`} className="flex gap-3 px-4 py-3">
                        <span className="mt-0.5 text-base" aria-hidden>
                          {r.icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[color:var(--on-surface)] dark:text-neutral-100">{r.label}</p>
                          {r.sub ? (
                            <p className="text-[11px] font-medium uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                              {r.sub}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {unscheduledSpotlights.length > 0 ? (
        <div className="border-t border-slate-100 pt-4 dark:border-white/10">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:text-neutral-500">
            Spotlight restaurants (not pinned to a day yet)
          </p>
          <ul className="mt-3 space-y-2">
            {unscheduledSpotlights.map((r, i) => (
              <li key={`spot-${i}-${r.label}`} className="flex gap-3 rounded-lg bg-[color:var(--surface-container-low)] px-3 py-2 dark:bg-white/5">
                <span aria-hidden>{r.icon}</span>
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-neutral-200">{r.label}</p>
                  <p className="text-[11px] text-[color:var(--on-surface-muted)] dark:text-neutral-500">{r.sub}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
