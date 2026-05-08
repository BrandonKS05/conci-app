"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import Image from "next/image";
import { formatLocalIsoDate } from "@/shared/date-option-parse";
import {
  hotelStayForDay,
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

/** Placeholder section shell (matches “boxes” layout from host mock). */
function SectionShell({
  title,
  eyebrow,
  actions,
  children,
}: {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-dm-card">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-white/10 sm:px-6">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h2>
          {eyebrow ? <p className="mt-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-500 dark:text-neutral-500">{eyebrow}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="min-h-[8rem] p-5 sm:min-h-[10rem] sm:p-6">{children}</div>
    </section>
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
  const hostSetup = initialPlan.hostSetup;
  const dest = initialPlan.location?.trim() || "Destination TBD";

  const formatted = useMemo(() => {
    const d = parseLocalIsoDate(dateIso);
    const line2 = d
      ? d.toLocaleDateString(locale ?? undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" })
      : dateIso;

    let dayIndexLabel: string | null = null;
    const tr = hostSetup?.tripRange;
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
  }, [dateIso, hostSetup?.tripRange, locale]);

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
        <div className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white px-5 py-4 shadow-sm dark:border-rose-900/40 dark:from-rose-950/50 dark:to-dm-card">
          <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-rose-700 dark:text-rose-200">{dest}</p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-neutral-400">Hotel tonight</p>
          <p className="mt-2 text-sm font-medium text-slate-800 dark:text-neutral-100">
            {hotel ? hotel.place.name : "TBD — add stays on calendar setup"}
          </p>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-neutral-400">Main plans</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-neutral-400">
            {scheduleItems.length > 0 ? `${scheduleItems.length} pinned stops` : "Nothing pinned yet"}
          </p>
        </div>

        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
            {formatted.dayIndexLabel ? `${formatted.dayIndexLabel} · ${formatted.line2}` : formatted.line2}
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-neutral-400">
            What should this day become? Sketch it here — Conci can turn this paragraph into pinned meals, stays, and activities
            once your backend flow is wired.
          </p>
          <label className="mt-4 block">
            <span className="sr-only">Describe your ideal day</span>
            <textarea
              placeholder={`Describe your dream day in ${dest}…`}
              rows={5}
              className="mt-2 w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-rose-300 focus:ring-2 focus:ring-rose-200/60 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:border-rose-500/40 dark:focus:ring-rose-500/25"
              defaultValue=""
            />
          </label>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-dm-card">
          <p className="text-center text-[10px] font-bold uppercase tracking-[0.26em] text-slate-500 dark:text-neutral-500">Nearby days</p>
          <div className="mt-4 flex justify-center gap-6">
            {prevIso ? (
              <Link
                href={`/trip/${tripId}/setup/day?date=${encodeURIComponent(prevIso)}`}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-neutral-300 dark:hover:bg-white/5"
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
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-neutral-300 dark:hover:bg-white/5"
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
          <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500 dark:text-neutral-500">Day budget</p>
          <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-neutral-500">
            Slider arrives with pricing — track spend per day once flights and hotels settle.
          </p>
          <input
            type="range"
            min={0}
            max={100}
            defaultValue={50}
            className="mt-5 w-full accent-rose-500"
            aria-label="Day budget placeholder"
          />
        </div>
      </header>

      <SectionShell title="Schedule" eyebrow="Auto-populated from pins">
        {scheduleItems.length === 0 ? (
          <EmptyHint label="No meals or activities pinned yet — use Edit activities on the calendar or add picks after." />
        ) : (
          <div className="overflow-x-auto">
            <div className="flex min-w-[36rem] gap-3 pb-1">
              {scheduleItems.map((row) => (
                <article
                  key={row.key}
                  className="min-w-[10.5rem] flex-1 rounded-xl border border-rose-100 bg-rose-50/70 px-3 py-3 dark:border-rose-900/30 dark:bg-rose-950/30"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-800 dark:text-rose-100">
                    {row.sub}
                  </span>
                  <p className="mt-2 font-display text-sm font-semibold text-slate-900 dark:text-white">{row.label}</p>
                  {row.href ? (
                    <a
                      href={row.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex text-[11px] font-semibold uppercase tracking-wide text-sky-700 underline-offset-2 hover:underline dark:text-sky-400"
                    >
                      Map / open
                    </a>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        )}
      </SectionShell>

      <div className="mt-8 grid gap-8 lg:grid-cols-1">
        <SectionShell title="Hotels" eyebrow="Stay for this night">
          {hotel ? (
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-dm-page/80">
              <p className="font-semibold text-slate-900 dark:text-white">{hotel.place.name}</p>
              {hotel.place.address ? <p className="mt-2 text-sm text-slate-600 dark:text-neutral-400">{hotel.place.address}</p> : null}
              {hotel.place.mapsUrl ? (
                <a
                  href={hotel.place.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex text-sm font-semibold text-teal-700 underline-offset-2 hover:underline dark:text-teal-400"
                >
                  Open in Maps
                </a>
              ) : null}
            </div>
          ) : (
            <EmptyHint label="No hotel night matched to this date — assign stay dates in host setup." />
          )}
        </SectionShell>

        <SectionShell title="Activities" eyebrow="Suggested just for you" actions={<span className="text-slate-400 dark:text-neutral-600">⏷</span>}>
          {activities.length === 0 ? (
            <EmptyHint label="No activities pinned for this day." />
          ) : (
            <ul className="space-y-4">
              {activities.map((p) => (
                <li
                  key={p.experience.bookingUrl}
                  className="flex gap-4 rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-white/10 dark:bg-dm-page/60"
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
                    <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-xs text-slate-500 dark:bg-white/10 dark:text-neutral-500">
                      Activity
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-neutral-500">Activity</span>
                    <p className="mt-1 font-semibold text-slate-900 dark:text-white">{p.experience.name}</p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-neutral-400">
                      {[p.experience.duration, p.experience.pricePerPerson].filter(Boolean).join(" · ")}
                    </p>
                    {p.experience.bookingUrl ? (
                      <a
                        href={p.experience.bookingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex text-xs font-semibold text-teal-700 underline-offset-2 hover:underline dark:text-teal-400"
                      >
                        Booking link
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionShell>

        <SectionShell title="Restaurants" eyebrow="" actions={<span className="text-slate-400 dark:text-neutral-600">⏷</span>}>
          {meals.length === 0 ? (
            <EmptyHint label="No restaurant pins yet for this day." />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {meals.map((p) => (
                <li key={p.place.mapsUrl} className="flex gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-dm-elevated">
                  {p.place.photoUrl ? (
                    <div className="relative h-24 w-28 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-white/10">
                      <Image src={p.place.photoUrl} alt="" fill className="object-cover" sizes="112px" unoptimized />
                    </div>
                  ) : (
                    <div className="flex h-24 w-28 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-semibold uppercase text-slate-400 dark:bg-white/10 dark:text-neutral-500">
                      Restaurant
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-neutral-500">Restaurant</span>
                    <p className="font-semibold text-slate-900 dark:text-white">{p.place.name}</p>
                    {p.place.rating != null ? (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                        {typeof p.place.rating === "number" ? p.place.rating.toFixed(1) : p.place.rating} ★
                      </p>
                    ) : null}
                    {p.place.address ? <p className="mt-2 text-xs text-slate-600 dark:text-neutral-400">{p.place.address}</p> : null}
                    <button
                      type="button"
                      className="mt-3 mr-2 inline-flex rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold dark:border-white/10"
                      disabled
                    >
                      Vote · 0
                    </button>
                    <button type="button" className="mt-3 inline-flex text-[11px] font-semibold text-slate-500 dark:text-neutral-500" disabled>
                      Different option
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionShell>
      </div>
    </div>
  );
}
