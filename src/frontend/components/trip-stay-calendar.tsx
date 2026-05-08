"use client";

import { useMemo } from "react";
import {
  inferTripStayInclusiveIsoBounds,
  listTripStayInclusiveIsoDays,
  type TripPlan,
} from "@/shared/trip-plan";

const WEEK_START = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function uniqSortedMonthsFromDays(days: string[]): string[] {
  const s = new Set<string>();
  for (const d of days) {
    const k = d.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(k)) s.add(k);
  }
  return [...s].sort();
}

function utcFirstWeekday(year: number, /** 1-based month */ month1: number): number {
  return new Date(Date.UTC(year, month1 - 1, 1)).getUTCDay();
}

function utcDaysInMonth(year: number, /** 1-based month */ month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

function monthTitle(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return monthKey;
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1))
  );
}

function MonthCalendar({
  monthKey,
  highlight,
}: {
  monthKey: string;
  highlight: Set<string>;
}) {
  const [ys, ms] = monthKey.split("-");
  const y = Number(ys);
  const mNum = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(mNum) || mNum < 1 || mNum > 12) return null;

  const pad = utcFirstWeekday(y, mNum);
  const dim = utcDaysInMonth(y, mNum);
  const cells: ({ kind: "empty" } | { kind: "day"; day: number; iso: string; inTrip: boolean })[] = [];

  for (let i = 0; i < pad; i += 1) {
    cells.push({ kind: "empty" });
  }
  for (let d = 1; d <= dim; d += 1) {
    const iso = `${y}-${String(mNum).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ kind: "day", day: d, iso, inTrip: highlight.has(iso) });
  }

  return (
    <div className="rounded-2xl border border-neutral-700/70 bg-neutral-950/95 p-4 shadow-inner dark:bg-[#141414]/95">
      <p className="mb-4 text-center font-display text-[15px] font-normal tracking-[0.01em] text-neutral-300 lg:text-[16px]">
        {monthTitle(monthKey)}
      </p>
      <div className="grid grid-cols-7 gap-y-3 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
        {WEEK_START.map((w) => (
          <span key={w} className="flex justify-center text-[10px]">
            {w}
          </span>
        ))}
        {cells.map((c, idx) =>
          c.kind === "empty" ? (
            <span key={`e-${monthKey}-${idx}`} aria-hidden />
          ) : (
            <span key={c.iso} className="flex justify-center tabular-nums">
              <span
                title={c.iso}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-medium ${
                  c.inTrip ? "bg-indigo-500/45 text-neutral-50 ring-1 ring-indigo-400/50" : "text-neutral-500"
                }`}
              >
                {c.day}
              </span>
            </span>
          )
        )}
      </div>
    </div>
  );
}

/** Month-grid stay view: shades only inferred ISO-inclusive trip nights (never a whole calendar month via loose parsing). */
export function TripStayCalendar({ plan }: { plan: TripPlan }) {
  const bounds = inferTripStayInclusiveIsoBounds(plan);
  const daysInTrip = useMemo(() => listTripStayInclusiveIsoDays(plan), [plan]);
  const highlight = useMemo(() => new Set(daysInTrip), [daysInTrip]);
  const monthKeys = useMemo(() => uniqSortedMonthsFromDays(daysInTrip), [daysInTrip]);

  if (!bounds || monthKeys.length === 0) return null;

  return (
    <section className="space-y-3 rounded-[1.65rem] border border-neutral-600/55 bg-neutral-900 p-6 text-neutral-200 shadow-xl dark:border-white/12 dark:bg-[#171717] dark:shadow-none">
      <p className="text-center font-display text-[0.9375rem] leading-relaxed tracking-[0.01em] text-neutral-400 lg:text-[1rem]">
        {bounds.startIso} → {bounds.endIso} — only nights between these endpoints are highlighted so the calendar
        does not pretend the whole surrounding month is in trip scope.
      </p>
      <div className="mx-auto mt-6 grid max-w-md gap-5 sm:max-w-none lg:grid-cols-2">
        {monthKeys.map((mk) => (
          <MonthCalendar key={mk} monthKey={mk} highlight={highlight} />
        ))}
      </div>
    </section>
  );
}
