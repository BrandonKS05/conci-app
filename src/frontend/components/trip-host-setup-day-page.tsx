"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type ReactNode } from "react";
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

type ManualRestaurantResult = {
  name: string;
  mapsUrl: string;
  address?: string;
  photoUrl?: string | null;
  rating?: number;
  priceRange?: string;
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

function EmptyHint({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[6rem] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/80 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-dm-page/80 dark:text-neutral-500">
      {label}
    </div>
  );
}

export function TripHostSetupDayPage({ tripId, dateIso, locale, initialPlan }: Props) {
  const [plan, setPlan] = useState<TripPlan>(initialPlan);
  const [restaurantQuery, setRestaurantQuery] = useState("");
  const [restaurantResults, setRestaurantResults] = useState<ManualRestaurantResult[]>([]);
  const [restaurantSearching, setRestaurantSearching] = useState(false);
  const [restaurantSearchErr, setRestaurantSearchErr] = useState<string | null>(null);
  const [addingMapsUrl, setAddingMapsUrl] = useState<string | null>(null);

  const hostSetup = plan.hostSetup;
  const dest = plan.location?.trim() || "Destination TBD";

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

  const searchRestaurants = useCallback(async () => {
    const q = restaurantQuery.trim();
    if (q.length < 2) {
      setRestaurantResults([]);
      setRestaurantSearchErr("Type at least 2 characters to search.");
      return;
    }
    setRestaurantSearching(true);
    setRestaurantSearchErr(null);
    try {
      const res = await fetch("/api/places/maps-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q,
          locationHint: plan.location?.trim() || null,
          start: 0,
          limit: 8,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        places?: {
          name?: string;
          mapsUrl?: string;
          address?: string;
          photoUrl?: string | null;
          rating?: number;
          priceRange?: string;
        }[];
      };
      if (!res.ok) {
        setRestaurantResults([]);
        setRestaurantSearchErr("Could not search restaurants right now.");
        return;
      }
      const places = (j.places ?? []).filter((p) => typeof p?.name === "string" && typeof p?.mapsUrl === "string");
      setRestaurantResults(
        places.map((p) => ({
          name: p.name!.trim(),
          mapsUrl: p.mapsUrl!,
          address: p.address,
          photoUrl: p.photoUrl ?? null,
          rating: typeof p.rating === "number" ? p.rating : undefined,
          priceRange: p.priceRange,
        }))
      );
    } catch {
      setRestaurantResults([]);
      setRestaurantSearchErr("Could not reach the server.");
    } finally {
      setRestaurantSearching(false);
    }
  }, [restaurantQuery, plan.location]);

  const addRestaurantToDay = useCallback(
    async (place: ManualRestaurantResult) => {
      if (!place.mapsUrl) return;
      const current = hostSetup?.restaurantPins ?? [];
      if (current.some((p) => p.dateIso === dateIso && p.place.mapsUrl === place.mapsUrl && p.kept)) {
        return;
      }
      setAddingMapsUrl(place.mapsUrl);
      const nextPins = [
        ...current,
        {
          dateIso,
          kept: true,
          place: {
            name: place.name,
            mapsUrl: place.mapsUrl,
            address: place.address,
            photoUrl: place.photoUrl ?? null,
            rating: place.rating,
            priceRange: place.priceRange,
            spotlightCategory: "restaurant" as const,
          },
        },
      ];
      try {
        const res = await fetch(`/api/trip-plans/${tripId}/host-setup`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hostSetup: { restaurantPins: nextPins } }),
        });
        const j = (await res.json().catch(() => ({}))) as { plan?: TripPlan; error?: string };
        if (!res.ok || !j.plan) {
          setRestaurantSearchErr(typeof j.error === "string" ? j.error : "Could not save restaurant pin.");
          return;
        }
        setPlan(j.plan);
      } catch {
        setRestaurantSearchErr("Could not save restaurant pin.");
      } finally {
        setAddingMapsUrl(null);
      }
    },
    [dateIso, hostSetup?.restaurantPins, tripId]
  );

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
          <label htmlFor={`daydream-${dateIso}`} className="mt-6 block rounded-2xl border-2 border-neutral-900 bg-white p-5 shadow-[2px_4px_0_0_rgba(0,0,0,0.08)] dark:border-white/20 dark:bg-dm-card">
            <span className="font-sans text-sm font-black text-neutral-950 dark:text-white">What do you want to do?</span>
            <textarea
              id={`daydream-${dateIso}`}
              placeholder={`Describe your dream day’s vacation in ${dest} — Conci will make it reality…`}
              rows={5}
              className="mt-4 w-full resize-y border-0 bg-transparent p-0 text-sm leading-relaxed text-neutral-800 outline-none ring-0 placeholder:text-neutral-400 dark:text-neutral-200 dark:placeholder:text-neutral-500"
              defaultValue=""
            />
          </label>
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
            Day budget
          </p>
          <div className="mt-3 flex justify-between font-sans text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
            <span>0</span>
            <span>50k</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            defaultValue={50}
            className="mt-2 w-full accent-[#e91e8c]"
            aria-label="Day budget (placeholder scale 0–50k)"
          />
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
          <div className="mb-4 rounded-xl border border-neutral-900/10 bg-neutral-50/80 p-3 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-neutral-700 dark:text-neutral-300">Manual search</p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={restaurantQuery}
                onChange={(e) => setRestaurantQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void searchRestaurants();
                  }
                }}
                placeholder={`Search restaurants in ${dest}`}
                className="w-full rounded-lg border border-neutral-900/20 bg-white px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-[#e91e8c] dark:border-white/15 dark:bg-dm-elevated dark:text-neutral-100"
              />
              <button
                type="button"
                onClick={() => void searchRestaurants()}
                disabled={restaurantSearching}
                className="rounded-lg border border-neutral-900/20 bg-white px-3 py-2 text-sm font-bold text-neutral-900 transition hover:bg-neutral-100 disabled:opacity-50 dark:border-white/15 dark:bg-dm-elevated dark:text-neutral-100 dark:hover:bg-white/10"
              >
                {restaurantSearching ? "Searching…" : "Search"}
              </button>
            </div>
            {restaurantSearchErr ? <p className="mt-2 text-xs text-rose-700 dark:text-rose-300">{restaurantSearchErr}</p> : null}
            {restaurantResults.length ? (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {restaurantResults.map((p) => {
                  const alreadyAdded = meals.some((m) => m.place.mapsUrl === p.mapsUrl);
                  return (
                    <li
                      key={p.mapsUrl}
                      className="rounded-lg border border-neutral-900/10 bg-white px-3 py-2 dark:border-white/10 dark:bg-dm-elevated"
                    >
                      <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100">{p.name}</p>
                      {p.address ? <p className="mt-1 line-clamp-2 text-xs text-neutral-600 dark:text-neutral-400">{p.address}</p> : null}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <a
                          href={p.mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-bold text-teal-700 underline-offset-2 hover:underline dark:text-teal-400"
                        >
                          Open in Maps
                        </a>
                        <button
                          type="button"
                          disabled={alreadyAdded || addingMapsUrl === p.mapsUrl}
                          onClick={() => void addRestaurantToDay(p)}
                          className="rounded-full border border-neutral-900/20 px-2.5 py-1 text-[11px] font-bold text-neutral-900 disabled:opacity-50 dark:border-white/15 dark:text-neutral-100"
                        >
                          {alreadyAdded ? "Added" : addingMapsUrl === p.mapsUrl ? "Adding…" : "Add to this day"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

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
