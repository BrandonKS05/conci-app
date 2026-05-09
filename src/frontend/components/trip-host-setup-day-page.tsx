"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import { formatLocalIsoDate } from "@/shared/date-option-parse";
import { estimateHostDaySpendUsd } from "@/shared/host-day-spend-estimate";
import {
  enumerateLocalIsoDays,
  hotelStayForDay,
  normalizePlan,
  parseLocalIsoDate,
  type TripPlan,
} from "@/shared/trip-plan";

type Props = {
  tripId: string;
  dateIso: string;
  /** Optional — use first plan-derived label if missing */
  locale?: string;
  initialPlan: TripPlan;
};

function startOfDay(x: Date) {
  return new Date(x.getFullYear(), x.getMonth(), x.getDate(), 0, 0, 0, 0);
}

function shiftIsoDay(iso: string, delta: number): string | null {
  const d = parseLocalIsoDate(iso);
  if (!d) return null;
  const n = new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta, 12, 0, 0, 0);
  return formatLocalIsoDate(n);
}

/** Bold pink downward triangle (accordion affordance — mock reference). Rotates when open. */
function PinkAccordionChevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 18"
      className={`h-4 w-6 shrink-0 text-[#e91e8c] transition-transform duration-200 dark:text-[#ff4da6] ${open ? "rotate-180" : ""} ${className ?? ""}`}
      aria-hidden
    >
      <polygon points="12,17 3,4 21,4" fill="currentColor" />
    </svg>
  );
}

function DropSection({
  title,
  subtitle,
  sectionId,
  defaultOpen,
  children,
}: {
  title: string;
  subtitle?: string;
  sectionId: string;
  /** When true (default), section starts expanded */
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const panelId = `${sectionId}-panel`;

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-900/15 bg-neutral-50/80 shadow-[0_1px_0_rgba(0,0,0,0.04)] dark:border-white/10 dark:bg-white/[0.04]">
      <button
        type="button"
        id={`${sectionId}-header`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition hover:bg-neutral-200/55 dark:hover:bg-white/[0.07] sm:px-6 sm:py-4"
      >
        <div className="min-w-0">
          <span className="font-sans text-lg font-black uppercase tracking-[0.04em] text-neutral-950 dark:text-white">
            {title}
          </span>
          {subtitle ? (
            <p className="mt-1 font-sans text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-600 dark:text-neutral-400">
              {subtitle}
            </p>
          ) : null}
        </div>
        <PinkAccordionChevron open={open} className="mt-1 sm:mt-1.5" />
      </button>
      {open ? (
        <div id={panelId} role="region" aria-labelledby={`${sectionId}-header`} className="border-t border-neutral-900/10 dark:border-white/10">
          <div className="px-5 pb-6 pt-4 sm:px-6 sm:pb-8 sm:pt-5">{children}</div>
        </div>
      ) : null}
    </div>
  );
}

function formatUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

function DaySpendEstimateBar({
  baselineGroupUsd,
  hotelUsd,
  mealsUsd,
  activitiesUsd,
  estimatedTotalUsd,
}: {
  baselineGroupUsd: number | null;
  hotelUsd: number;
  mealsUsd: number;
  activitiesUsd: number;
  estimatedTotalUsd: number;
}) {
  const baseline = baselineGroupUsd;
  const fillPct = baseline != null && baseline > 0 ? Math.min(100, (estimatedTotalUsd / baseline) * 100) : 100;
  const over = baseline != null && baseline > 0 && estimatedTotalUsd > baseline;

  const parts = [
    { key: "h", usd: hotelUsd, className: "bg-teal-500 dark:bg-teal-600" },
    { key: "m", usd: mealsUsd, className: "bg-amber-400 dark:bg-amber-500" },
    { key: "a", usd: activitiesUsd, className: "bg-pink-500 dark:bg-pink-600" },
  ].filter((p) => p.usd > 0);

  return (
    <div className="mt-3 space-y-2">
      {estimatedTotalUsd <= 0 ? (
        <p className="font-sans text-xs text-neutral-500 dark:text-neutral-500">
          Pin a hotel night, restaurants, or experiences on this day to build an estimate.
        </p>
      ) : (
        <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-white/15">
          <div
            className="flex h-full min-w-[2px] overflow-hidden rounded-full"
            style={{ width: `${Math.min(100, fillPct)}%` }}
          >
            {parts.map((p) => (
              <div key={p.key} className={`min-w-0 ${p.className}`} style={{ flex: p.usd }} title={formatUsd(p.usd)} />
            ))}
          </div>
        </div>
      )}
      <ul className="space-y-1 font-sans text-[11px] text-neutral-600 dark:text-neutral-400">
        {estimatedTotalUsd <= 0 ? null : hotelUsd > 0 ? (
          <li className="flex justify-between gap-2">
            <span className="text-teal-700 dark:text-teal-300">Hotel (night share)</span>
            <span className="tabular-nums font-semibold text-neutral-800 dark:text-neutral-200">
              {formatUsd(hotelUsd)}
            </span>
          </li>
        ) : null}
        {estimatedTotalUsd <= 0 ? null : mealsUsd > 0 ? (
          <li className="flex justify-between gap-2">
            <span className="text-amber-800 dark:text-amber-200">Restaurants (est.)</span>
            <span className="tabular-nums font-semibold text-neutral-800 dark:text-neutral-200">
              {formatUsd(mealsUsd)}
            </span>
          </li>
        ) : null}
        {estimatedTotalUsd <= 0 ? null : activitiesUsd > 0 ? (
          <li className="flex justify-between gap-2">
            <span className="text-pink-700 dark:text-pink-300">Experiences</span>
            <span className="tabular-nums font-semibold text-neutral-800 dark:text-neutral-200">
              {formatUsd(activitiesUsd)}
            </span>
          </li>
        ) : null}
        {estimatedTotalUsd > 0 ? (
          <li className="flex justify-between gap-2 border-t border-neutral-200 pt-1.5 dark:border-white/10">
            <span className="font-bold text-neutral-800 dark:text-neutral-200">Estimated day total</span>
            <span className="tabular-nums font-bold text-neutral-950 dark:text-white">
              {formatUsd(estimatedTotalUsd)}
            </span>
          </li>
        ) : null}
        {baseline != null && baseline > 0 ? (
          <li className="flex justify-between gap-2">
            <span>Your trip budget / day (group)</span>
            <span className="tabular-nums font-semibold text-neutral-700 dark:text-neutral-300">
              {formatUsd(baseline)}
            </span>
          </li>
        ) : (
          <li className="text-neutral-500 dark:text-neutral-500">
            Add a dollar amount in <span className="font-semibold">Budget</span> on the workspace to compare.
          </li>
        )}
      </ul>
      {over ? (
        <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
          About {formatUsd(estimatedTotalUsd - baseline!)} over today&apos;s share — rough estimate only.
        </p>
      ) : null}
      <p className="text-[10px] leading-snug text-neutral-500 dark:text-neutral-500">
        Based on pinned places, party size, and trip length. Not a quote.
      </p>
    </div>
  );
}

function EmptyHint({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[6rem] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/80 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-dm-page/80 dark:text-neutral-500">
      {label}
    </div>
  );
}

export function TripHostSetupDayPage({ tripId, dateIso, locale, initialPlan }: Props) {
  const router = useRouter();
  const [plan, setPlan] = useState(initialPlan);

  useEffect(() => {
    setPlan(initialPlan);
  }, [initialPlan]);

  const [dreamText, setDreamText] = useState("");
  const [dreamBusy, setDreamBusy] = useState(false);
  const [dreamErr, setDreamErr] = useState<string | null>(null);
  const [dreamReply, setDreamReply] = useState<string | null>(null);

  const syncPlanFromServer = useCallback(
    (next: TripPlan) => {
      setPlan(next);
      void router.refresh();
    },
    [router]
  );

  const submitDayDream = useCallback(async () => {
    const t = dreamText.trim();
    if (!t || t.length > 4000) {
      setDreamErr("Say something shorter (under 4000 characters).");
      return;
    }
    setDreamBusy(true);
    setDreamErr(null);
    setDreamReply(null);
    try {
      const res = await fetch(`/api/trip-plans/${tripId}/host-copilot`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `[Day ${dateIso}] ${t}`,
          focusDateIso: dateIso,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        assistantText?: string;
        plan?: TripPlan;
        applied?: boolean;
      };
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "Copilot unavailable.");
      if (typeof j.assistantText === "string") setDreamReply(j.assistantText.trim());
      else setDreamReply("Done.");
      if (j.plan) syncPlanFromServer(normalizePlan(j.plan));
    } catch (e) {
      setDreamErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setDreamBusy(false);
    }
  }, [dateIso, dreamText, syncPlanFromServer, tripId]);

  const hostSetup = plan.hostSetup;
  const dest = plan.location?.trim() || "Destination TBD";

  const formatted = useMemo(() => {
    const d = parseLocalIsoDate(dateIso);
    const line2 = d
      ? d.toLocaleDateString(locale ?? undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" })
      : dateIso;

    let dayIndexLabel: string | null = null;
    const tr = plan.hostSetup?.tripRange;
    if (tr?.startIso && tr.endIso && d) {
      const start = parseLocalIsoDate(tr.startIso);
      const end = parseLocalIsoDate(tr.endIso);
      if (start && end) {
        const dd = startOfDay(d).getTime();
        const ds = startOfDay(start).getTime();
        const de = startOfDay(end).getTime();
        if (dd >= ds && dd <= de) {
          dayIndexLabel = `Day ${Math.round((dd - ds) / (24 * 60 * 60 * 1000)) + 1}`;
        }
      }
    }
    return { line2, dayIndexLabel };
  }, [dateIso, locale, plan]);

  const hotel = hotelStayForDay(hostSetup?.hotelStays ?? [], dateIso);

  const meals = (hostSetup?.restaurantPins ?? []).filter((p) => p.dateIso === dateIso && p.kept);
  const activities = (hostSetup?.activityPins ?? []).filter((p) => p.dateIso === dateIso && p.kept);

  const scheduleItems = useMemo(() => {
    const rows: { key: string; label: string; sub: string; href?: string }[] = [];
    for (const p of meals) {
      rows.push({
        key: `m-${p.place.mapsUrl}`,
        label: p.place.name,
        sub: "Restaurant",
        href: p.place.mapsUrl,
      });
    }
    for (const p of activities) {
      rows.push({
        key: `a-${p.experience.bookingUrl}`,
        label: p.experience.name,
        sub: "Activity",
        href: p.experience.bookingUrl || undefined,
      });
    }
    return rows;
  }, [meals, activities]);

  const prevIso = shiftIsoDay(dateIso, -1);
  const nextIso = shiftIsoDay(dateIso, 1);

  const tripRange = plan.hostSetup?.tripRange;
  const spendBreakdown = useMemo(() => {
    if (!tripRange?.startIso || !tripRange.endIso) return null;
    if (!enumerateLocalIsoDays(tripRange.startIso, tripRange.endIso).includes(dateIso)) return null;
    const dayMeals = (plan.hostSetup?.restaurantPins ?? []).filter((p) => p.dateIso === dateIso && p.kept);
    const dayActs = (plan.hostSetup?.activityPins ?? []).filter((p) => p.dateIso === dateIso && p.kept);
    const dayHotel = hotelStayForDay(plan.hostSetup?.hotelStays ?? [], dateIso);
    return estimateHostDaySpendUsd(
      plan,
      dateIso,
      tripRange.startIso,
      tripRange.endIso,
      dayMeals.length,
      dayActs,
      dayHotel
    );
  }, [plan, dateIso, tripRange?.startIso, tripRange?.endIso]);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-4 sm:px-6 lg:px-8">
      <nav className="mb-8 flex flex-wrap items-center gap-4 text-sm">
        <Link
          href={`/trip/${tripId}/setup#sec-dates`}
          className="font-semibold text-teal-700 underline-offset-4 hover:underline dark:text-teal-400"
        >
          ← Trip calendar
        </Link>
        <span className="text-slate-300 dark:text-white/25">/</span>
        <span className="text-slate-600 dark:text-neutral-400">Host day view</span>
      </nav>

      <header className="mb-10 grid gap-6 lg:grid-cols-[minmax(0,220px)_1fr_minmax(0,280px)] lg:items-start">
        <div className="rounded-[1.35rem] border-4 border-black bg-[#ffb6d9]/35 px-5 py-4 shadow-[inset_0_0_0_1px_rgba(236,72,153,0.35)] dark:border-white/25 dark:bg-rose-950/40 dark:shadow-none">
          <p className="font-sans text-sm font-black uppercase tracking-[0.12em] text-neutral-950 dark:text-white">{dest}</p>
          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-700 dark:text-neutral-300">Hotel</p>
          <p className="mt-1 text-sm font-bold text-neutral-900 dark:text-white">
            {hotel ? hotel.place.name : "TBD"}
          </p>
          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-700 dark:text-neutral-300">Main Plans</p>
          <p className="mt-1 text-sm font-bold text-neutral-900 dark:text-white">
            {scheduleItems.length > 0 ? `${scheduleItems.length} stops` : "TBD"}
          </p>
        </div>

        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-neutral-950 dark:text-white sm:text-[2.125rem] sm:leading-tight">
            {formatted.dayIndexLabel ? `${formatted.dayIndexLabel}: ${formatted.line2}` : formatted.line2}
          </h1>
          <div className="mt-6 block rounded-2xl border-2 border-neutral-900 bg-white p-5 shadow-[2px_4px_0_0_rgba(0,0,0,0.08)] dark:border-white/20 dark:bg-dm-card">
            <label htmlFor={`daydream-${dateIso}`} className="font-sans text-sm font-black text-neutral-950 dark:text-white">
              What do you want to do?
            </label>
            <p className="mt-2 text-xs font-normal leading-relaxed text-neutral-600 dark:text-neutral-400">
              Same Trip Copilot powers as on the calendar: ask to swap the hotel segment for this night, change dinner, pin an
              experience — we scope edits to{" "}
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">{dateIso}</span> when possible.
            </p>
            <textarea
              id={`daydream-${dateIso}`}
              placeholder={`e.g. Italian dinner instead of tacos · beach club this afternoon · different hotel nearer downtown…`}
              rows={5}
              value={dreamText}
              onChange={(e) => setDreamText(e.target.value)}
              disabled={dreamBusy}
              className="mt-4 w-full resize-y rounded-lg border border-neutral-900/15 bg-transparent px-2 py-2 text-sm leading-relaxed text-neutral-800 outline-none ring-0 placeholder:text-neutral-400 focus-visible:ring-2 focus-visible:ring-teal-500/40 disabled:opacity-60 dark:border-white/15 dark:text-neutral-200 dark:placeholder:text-neutral-500"
            />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={dreamBusy || !dreamText.trim()}
                onClick={() => void submitDayDream()}
                className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white shadow-[2px_2px_0_0_rgba(0,0,0,0.12)] transition hover:bg-teal-500 disabled:pointer-events-none disabled:opacity-40 dark:shadow-black/40"
              >
                {dreamBusy ? "Updating day…" : "Update day with Copilot"}
              </button>
            </div>
            {dreamErr ? (
              <p className="mt-3 text-sm font-medium text-rose-700 dark:text-rose-300" role="alert">
                {dreamErr}
              </p>
            ) : null}
            {dreamReply ? (
              <p className="mt-4 rounded-xl border border-teal-200/70 bg-teal-50/80 px-3 py-3 text-sm text-teal-950 dark:border-teal-800/40 dark:bg-teal-950/35 dark:text-teal-50">
                {dreamReply}
              </p>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border-2 border-neutral-900 bg-white p-5 shadow-[2px_4px_0_0_rgba(0,0,0,0.06)] dark:border-white/15 dark:bg-dm-card">
          <p className="text-center text-[10px] font-black uppercase tracking-[0.26em] text-neutral-700 dark:text-neutral-400">
            Nearby days
          </p>
          <div className="mt-4 flex justify-center gap-6">
            {prevIso ? (
              <Link
                href={`/trip/${tripId}/setup/day?date=${encodeURIComponent(prevIso)}`}
                className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-neutral-900 bg-white text-lg font-bold text-neutral-900 transition hover:bg-[#ffb6d9]/25 dark:border-white/25 dark:bg-dm-card dark:text-white dark:hover:bg-white/10"
                aria-label="Previous day"
              >
                ‹
              </Link>
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-transparent text-slate-300 opacity-40 dark:text-neutral-600">
                ‹
              </span>
            )}
            {nextIso ? (
              <Link
                href={`/trip/${tripId}/setup/day?date=${encodeURIComponent(nextIso)}`}
                className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-neutral-900 bg-white text-lg font-bold text-neutral-900 transition hover:bg-[#ffb6d9]/25 dark:border-white/25 dark:bg-dm-card dark:text-white dark:hover:bg-white/10"
                aria-label="Next day"
              >
                ›
              </Link>
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-transparent text-slate-300 opacity-40 dark:text-neutral-600">
                ›
              </span>
            )}
          </div>
          <p className="mt-6 text-[10px] font-black uppercase tracking-[0.24em] text-neutral-800 dark:text-neutral-300">
            Day spend estimate
          </p>
          {spendBreakdown ? (
            <DaySpendEstimateBar
              baselineGroupUsd={spendBreakdown.baselineGroupUsd}
              hotelUsd={spendBreakdown.hotelUsd}
              mealsUsd={spendBreakdown.mealsUsd}
              activitiesUsd={spendBreakdown.activitiesUsd}
              estimatedTotalUsd={spendBreakdown.estimatedTotalUsd}
            />
          ) : (
            <p className="mt-3 font-sans text-xs leading-relaxed text-neutral-500 dark:text-neutral-500">
              Save trip dates on the host calendar to see how this day lines up with your per-day budget.
            </p>
          )}
        </div>
      </header>

      <div className="mt-10 space-y-4">
        <DropSection title="Schedule" subtitle="— Auto populated" sectionId="day-schedule" defaultOpen>
          {scheduleItems.length === 0 ? (
            <EmptyHint label="No meals or activities pinned yet — use Add places on the trip calendar, or pull from live picks after." />
          ) : (
            <div className="overflow-x-auto">
              <div className="flex min-w-[36rem] gap-3 pb-1">
                {scheduleItems.map((row) => (
                  <article
                    key={row.key}
                    className="min-w-[10.5rem] flex-1 rounded-xl border-2 border-neutral-900/10 bg-[#ffe4f1]/50 px-3 py-3 dark:border-white/10 dark:bg-rose-950/25"
                  >
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#c4176d] dark:text-[#ff7eb8]">
                      {row.sub}
                    </span>
                    <p className="mt-2 font-sans text-sm font-bold text-neutral-950 dark:text-white">{row.label}</p>
                    {row.href ? (
                      <a
                        href={row.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex font-sans text-[10px] font-black uppercase tracking-wide text-[#0066cc] underline-offset-2 hover:underline dark:text-sky-400"
                      >
                        Map me there
                      </a>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          )}
        </DropSection>

        <DropSection title="Hotels" subtitle="Stay for this night" sectionId="day-hotels">
          {hotel ? (
            <div className="rounded-xl border-2 border-neutral-900/15 bg-neutral-50/90 p-4 dark:border-white/10 dark:bg-dm-page/80">
              <p className="font-sans text-base font-bold text-neutral-950 dark:text-white">{hotel.place.name}</p>
              {hotel.place.address ? <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{hotel.place.address}</p> : null}
              {hotel.place.mapsUrl ? (
                <a
                  href={hotel.place.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex text-sm font-bold text-teal-700 underline-offset-2 hover:underline dark:text-teal-400"
                >
                  Open in Maps
                </a>
              ) : null}
            </div>
          ) : (
            <EmptyHint label="No hotel night matched to this date — assign stay dates in host setup." />
          )}
        </DropSection>

        <DropSection title="Activities" subtitle="Suggested just for you" sectionId="day-activities">
          {activities.length === 0 ? (
            <EmptyHint label="No activities pinned for this day." />
          ) : (
            <ul className="space-y-4">
              {activities.map((p) => (
                <li
                  key={p.experience.bookingUrl}
                  className="flex gap-4 rounded-xl border-2 border-neutral-900/10 bg-neutral-50/70 p-3 dark:border-white/10 dark:bg-dm-page/60"
                >
                  {p.experience.coverPhotoUrl ? (
                    <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-slate-200 dark:bg-white/10">
                      <Image
                        src={p.experience.coverPhotoUrl}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="112px"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-xs font-bold text-slate-500 dark:bg-white/10 dark:text-neutral-500">
                      Activity
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-500">
                      Activity
                    </span>
                    <p className="mt-1 font-sans text-base font-bold text-neutral-950 dark:text-white">{p.experience.name}</p>
                    <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                      {[p.experience.duration, p.experience.pricePerPerson].filter(Boolean).join(" · ")}
                    </p>
                    {p.experience.bookingUrl ? (
                      <a
                        href={p.experience.bookingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex text-xs font-bold text-teal-700 underline-offset-2 hover:underline dark:text-teal-400"
                      >
                        Booking link
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DropSection>

        <DropSection title="Restaurants" subtitle="Catered to your group's taste" sectionId="day-restaurants">
          {meals.length === 0 ? (
            <EmptyHint label="No restaurant pins yet for this day." />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {meals.map((p) => (
                <li
                  key={p.place.mapsUrl}
                  className="flex gap-3 rounded-xl border-2 border-neutral-900/10 bg-white p-3 dark:border-white/10 dark:bg-dm-elevated"
                >
                  {p.place.photoUrl ? (
                    <div className="relative h-24 w-28 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-white/10">
                      <Image src={p.place.photoUrl} alt="" fill className="object-cover" sizes="112px" unoptimized />
                    </div>
                  ) : (
                    <div className="flex h-24 w-28 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-black uppercase text-slate-400 dark:bg-white/10 dark:text-neutral-500">
                      Restaurant
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-500">
                      Restaurant
                    </span>
                    <p className="font-sans font-bold text-neutral-950 dark:text-white">{p.place.name}</p>
                    {p.place.rating != null ? (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                        {typeof p.place.rating === "number" ? p.place.rating.toFixed(1) : p.place.rating} ★
                      </p>
                    ) : null}
                    {p.place.address ? <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">{p.place.address}</p> : null}
                    <button
                      type="button"
                      className="mt-3 mr-2 inline-flex rounded-full border-2 border-neutral-900/20 px-3 py-1 text-[11px] font-bold dark:border-white/15"
                      disabled
                    >
                      Vote · 0
                    </button>
                    <button
                      type="button"
                      className="mt-3 inline-flex text-[11px] font-bold text-neutral-500 dark:text-neutral-500"
                      disabled
                    >
                      Different option
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DropSection>
      </div>
    </div>
  );
}
