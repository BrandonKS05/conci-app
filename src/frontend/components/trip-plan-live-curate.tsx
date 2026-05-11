"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

import { LivePlaceCoverImage } from "@/frontend/components/live-place-cover-image";
import {
  experienceLiveKey,
  flightLiveKey,
  restaurantLiveKey,
} from "@/shared/itinerary-live-curation";
import { parseLocalIsoDate, type TripPlan } from "@/shared/trip-plan";
import type { LiveExperienceCard, LiveFlightCard } from "@/shared/trip-live-recommendations";
import type { RestaurantPick } from "@/shared/restaurants";

const SWIPE_DISMISS_PX = 72;

export type LiveCurationMutate = (
  action: "keep" | "dismiss" | "unkeep" | "undismiss",
  key: string,
  dateIso?: string
) => void;

function googleFlightsHrefForCard(f: LiveFlightCard, plan: TripPlan): string {
  const raw = f.bookOnGoogleFlightsUrl?.trim() ?? "";
  if (raw && /^https?:\/\//i.test(raw)) return raw;
  const origin = plan.departureCity?.trim() ?? "";
  const dest = plan.location?.trim() ?? "";
  const q = ["Flights", origin && `from ${origin}`, dest && `to ${dest}`].filter(Boolean).join(" ");
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}`;
}

function formatShortTripDay(iso: string): string {
  const d = parseLocalIsoDate(iso);
  return d
    ? d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
    : iso;
}

function labelForLiveKeptKey(
  key: string,
  restaurants: RestaurantPick[],
  experiences: LiveExperienceCard[],
  flights: LiveFlightCard[]
): string {
  if (key.startsWith("r:")) {
    const r = restaurants.find((x) => restaurantLiveKey(x) === key);
    return r?.name ?? "Restaurant";
  }
  if (key.startsWith("ex:")) {
    const hit = experiences
      .map((ex, i) => ({ ex, i }))
      .find(({ ex, i }) => experienceLiveKey(ex, i) === key);
    return hit?.ex.name ?? "Experience";
  }
  if (key.startsWith("f:")) {
    const hit = flights.map((f, i) => ({ f, i })).find(({ f, i }) => flightLiveKey(f, i) === key);
    return hit?.f.airline ?? "Flight";
  }
  return "Saved pick";
}

function LivePickTripDayModal({
  open,
  tripDays,
  busy,
  onCancel,
  onPick,
}: {
  open: boolean;
  tripDays: string[];
  busy: boolean;
  onCancel: () => void;
  onPick: (iso: string) => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center p-4 sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" aria-label="Close" onClick={onCancel} />
      <div className="relative max-h-[88vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[color:var(--hairline)] bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-dm-card">
        <h3 className="font-display text-lg font-semibold text-[color:var(--on-surface)] dark:text-white">Pick a trip day</h3>
        <p className="mt-2 text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">
          Choose which day this reservation belongs on (within your trip date range).
        </p>
        {tripDays.length === 0 ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/35 dark:text-amber-100">
            Add concrete trip dates on the trip card first — then you can place picks on the calendar.
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {tripDays.map((iso) => (
              <button
                key={iso}
                type="button"
                disabled={busy}
                onClick={() => onPick(iso)}
                className="rounded-lg border border-[color:var(--hairline-strong)] bg-white px-3 py-2 text-xs font-medium text-[color:var(--on-surface)] shadow-sm transition hover:bg-[color:var(--surface-container-low)] disabled:opacity-50 dark:border-white/15 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
              >
                {formatShortTripDay(iso)}
              </button>
            ))}
          </div>
        )}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[color:var(--hairline)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--on-surface-variant)] shadow-sm hover:bg-[color:var(--surface-container-low)] dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-200 dark:hover:bg-dm-page"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function LiveHostCurateRowActions({
  itemKey,
  isHost,
  tripDays,
  busyAll,
  mutate,
}: {
  itemKey: string;
  isHost: boolean;
  tripDays: string[];
  busyAll: boolean;
  mutate: LiveCurationMutate;
}) {
  const [open, setOpen] = useState(false);
  if (!isHost) {
    return (
      <p className="text-[11px] text-[color:var(--on-surface-muted)] dark:text-neutral-500">Only the trip host can add or dismiss suggestions.</p>
    );
  }
  return (
    <>
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          disabled={busyAll}
          onClick={() => mutate("dismiss", itemKey)}
          className="rounded-full border border-[color:var(--hairline)] px-3 py-1.5 text-xs font-semibold text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container-low)] disabled:opacity-50 dark:border-white/10 dark:text-neutral-300 dark:hover:bg-white/5"
        >
          Not interested
        </button>
        <button
          type="button"
          disabled={busyAll}
          onClick={() => setOpen(true)}
          className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-neutral-100 dark:text-dm-page dark:hover:bg-white"
        >
          Add to trip
        </button>
      </div>
      <LivePickTripDayModal
        open={open}
        tripDays={tripDays}
        busy={busyAll}
        onCancel={() => setOpen(false)}
        onPick={(iso) => {
          void mutate("keep", itemKey, iso);
          setOpen(false);
        }}
      />
    </>
  );
}

export function HostLiveScheduleByDay({
  plan,
  flights,
  restaurants,
  experiences,
}: {
  plan: TripPlan;
  flights: LiveFlightCard[];
  restaurants: RestaurantPick[];
  experiences: LiveExperienceCard[];
}) {
  const sched = plan.itineraryLiveCuration?.scheduledDates ?? {};
  const kept = plan.itineraryLiveCuration?.kept ?? [];
  const dated = kept.filter((k) => typeof sched[k] === "string" && sched[k].length > 0);
  if (!dated.length) return null;

  const byDay = new Map<string, string[]>();
  for (const k of dated) {
    const day = sched[k]!;
    const label = labelForLiveKeptKey(k, restaurants, experiences, flights);
    const list = byDay.get(day) ?? [];
    list.push(label);
    byDay.set(day, list);
  }
  const days = [...byDay.keys()].sort();

  return (
    <div className="rounded-xl border border-teal-200/70 bg-teal-50/50 p-4 dark:border-teal-800/40 dark:bg-teal-950/25">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-900 dark:text-teal-200/90">
        Reservations by day
      </p>
      <ul className="mt-3 space-y-4">
        {days.map((day) => (
          <li key={day}>
            <p className="text-sm font-semibold text-[color:var(--on-surface)] dark:text-neutral-100">{formatShortTripDay(day)}</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-300">
              {(byDay.get(day) ?? []).map((label, i) => (
                <li key={`${day}-${i}-${label}`}>{label}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SwipeableLiveCard({
  children,
  onSwipeDismiss,
  disabled,
  swipeLabel = "Swipe left to dismiss",
}: {
  children: ReactNode;
  onSwipeDismiss: () => void;
  disabled?: boolean;
  swipeLabel?: string;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const activeId = useRef<number | null>(null);

  const reset = useCallback(() => {
    setDragging(false);
    setOffset(0);
    activeId.current = null;
  }, []);

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div
        className="pointer-events-none absolute inset-y-0 right-0 flex w-24 items-center justify-center bg-rose-100/90 text-xs font-semibold text-rose-900 dark:bg-rose-950/80 dark:text-rose-100"
        aria-hidden
      >
        Dismiss
      </div>
      <div
        role="group"
        aria-label={swipeLabel}
        className="relative touch-pan-y overflow-hidden rounded-xl border border-[color:var(--hairline)] bg-white dark:border-white/10 dark:bg-dm-elevated/50"
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? "none" : "transform 0.22s ease-out",
        }}
        onPointerDown={(e) => {
          if (disabled || e.button !== 0) return;
          startX.current = e.clientX;
          activeId.current = e.pointerId;
          setDragging(true);
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (activeId.current !== e.pointerId || disabled) return;
          const dx = e.clientX - startX.current;
          setOffset(dx < 0 ? Math.max(dx, -120) : 0);
        }}
        onPointerUp={(e) => {
          if (activeId.current !== e.pointerId) return;
          try {
            (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
          const dx = e.clientX - startX.current;
          if (dx < -SWIPE_DISMISS_PX && !disabled) {
            onSwipeDismiss();
          }
          reset();
        }}
        onPointerCancel={reset}
      >
        {children}
      </div>
    </div>
  );
}

export function useLiveCurationMutation(tripId: string, onPlanUpdated?: (plan: TripPlan) => void) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const mutate = useCallback(
    async (action: "keep" | "dismiss" | "unkeep" | "undismiss", key: string, dateIso?: string) => {
      setErr(null);
      setBusyKey(key);
      try {
        const body: Record<string, unknown> = { action, key };
        if (action === "keep" && typeof dateIso === "string") {
          body.dateIso = dateIso;
        }
        const res = await fetch(`/api/trip-plans/${tripId}/itinerary-live-curation`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = (await res.json()) as { error?: string; plan?: TripPlan };
        if (!res.ok) {
          setErr(typeof j.error === "string" ? j.error : "Could not save");
          return;
        }
        if (j.plan) onPlanUpdated?.(j.plan);
      } catch {
        setErr("Network error — try again.");
      } finally {
        setBusyKey(null);
      }
    },
    [tripId, onPlanUpdated]
  );

  return { mutate, busyKey, err, setErr };
}

export function LiveCurationErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
      {message}{" "}
      <button type="button" className="font-semibold underline" onClick={onDismiss}>
        Dismiss
      </button>
    </p>
  );
}

function KeptStrip({
  title,
  items,
  busyKey,
  onRemove,
}: {
  title: string;
  items: { key: string; label: string; sub?: string }[];
  busyKey: string | null;
  onRemove: (key: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="mb-4 rounded-xl border border-emerald-200/80 bg-emerald-50/60 p-3 dark:border-emerald-800/50 dark:bg-emerald-950/25">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-200/90">{title}</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {items.map(({ key, label, sub }) => (
          <li
            key={key}
            className="flex max-w-full items-center gap-1 rounded-full border border-emerald-300/80 bg-white py-1 pl-3 pr-1 text-sm text-emerald-950 shadow-sm dark:border-emerald-700/50 dark:bg-dm-card dark:text-emerald-100"
          >
            <span className="min-w-0 truncate font-medium">{label}</span>
            {sub ? <span className="hidden text-xs text-emerald-800/80 sm:inline dark:text-emerald-300/80">{sub}</span> : null}
            <button
              type="button"
              disabled={busyKey === key}
              onClick={() => onRemove(key)}
              className="shrink-0 rounded-full p-1.5 text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50 dark:text-emerald-200 dark:hover:bg-emerald-900/50"
              aria-label={`Remove ${label} from trip`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CuratedFlightsRows({
  plan,
  flights,
  liveLoading,
  flightsError,
  mutate,
  busyKey,
  isHost,
  tripDays,
}: {
  plan: TripPlan;
  flights: LiveFlightCard[];
  liveLoading: boolean;
  flightsError: string | null;
  mutate: LiveCurationMutate;
  busyKey: string | null;
  isHost: boolean;
  tripDays: string[];
}) {
  const cur = plan.itineraryLiveCuration;
  const kept = new Set(cur?.kept ?? []);
  const dismissed = new Set(cur?.dismissed ?? []);
  const sched = cur?.scheduledDates ?? {};

  const flightKeptMeta = flights
    .map((f, i) => ({ f, key: flightLiveKey(f, i) }))
    .filter(({ key }) => kept.has(key))
    .map(({ f, key }) => ({
      key,
      label: f.airline,
      sub: sched[key] ? `${formatShortTripDay(sched[key]!)} · departs ${f.departureTime}` : f.departureTime,
    }));
  const flightPool = flights
    .map((f, i) => ({ f, key: flightLiveKey(f, i) }))
    .filter(({ key }) => !kept.has(key) && !dismissed.has(key));

  if (liveLoading) {
    return <p className="text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">Loading flights…</p>;
  }
  if (flightsError) {
    return <p className="text-sm text-amber-800 dark:text-amber-200/90">{flightsError}</p>;
  }
  if (!flights.length) {
    return <p className="text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">No flight rows yet (check SERPAPI_KEY).</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">
        {isHost ? (
          <>
            Tap <strong className="text-[color:var(--on-surface-variant)] dark:text-neutral-300">Add to trip</strong>, pick a day in the trip range,
            then see it under <strong className="text-[color:var(--on-surface-variant)] dark:text-neutral-300">Reservations by day</strong>. Swipe
            left or use <strong className="text-[color:var(--on-surface-variant)] dark:text-neutral-300">Not interested</strong> to clear the rest.
          </>
        ) : (
          "Flight suggestions for your group (only the host can add them to the trip)."
        )}
      </p>
      <KeptStrip title="On your trip" items={flightKeptMeta} busyKey={busyKey} onRemove={(k) => mutate("unkeep", k)} />
      {flightPool.map(({ f, key }) => (
        <SwipeableLiveCard
          key={key}
          disabled={busyKey !== null || !isHost}
          onSwipeDismiss={() => mutate("dismiss", key)}
          swipeLabel="Swipe left to dismiss this flight suggestion"
        >
          <div className="px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-[color:var(--on-surface)] dark:text-neutral-100">{f.airline}</p>
                <p className="text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">Departs {f.departureTime}</p>
                <p className="text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">Duration {f.duration}</p>
                <p className="mt-1 text-base font-semibold text-[color:var(--on-surface)] dark:text-neutral-50">{f.pricePerPerson}</p>
              </div>
              <LiveHostCurateRowActions
                itemKey={key}
                isHost={isHost}
                tripDays={tripDays}
                busyAll={busyKey !== null}
                mutate={mutate}
              />
            </div>
            <a
              href={googleFlightsHrefForCard(f, plan)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-50 dark:border-sky-500/30 dark:bg-dm-page dark:text-sky-200 dark:hover:bg-sky-950/40"
              onClick={(e) => e.stopPropagation()}
            >
              Book on Google Flights
            </a>
          </div>
        </SwipeableLiveCard>
      ))}
      {!flightPool.length && flightKeptMeta.length > 0 ? (
        <p className="text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">No more flight suggestions in the deck.</p>
      ) : null}
      {flights.length > 0 && !flightPool.length && !flightKeptMeta.length ? (
        <p className="text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">
          Every flight row here was dismissed. Refresh after new results load to curate again.
        </p>
      ) : null}
    </div>
  );
}

export function CuratedRestaurantsSection({
  plan,
  restaurants,
  liveLoading,
  restaurantsError,
  mutate,
  busyKey,
  isHost,
  tripDays,
}: {
  plan: TripPlan;
  restaurants: RestaurantPick[];
  liveLoading: boolean;
  restaurantsError: string | null;
  mutate: LiveCurationMutate;
  busyKey: string | null;
  isHost: boolean;
  tripDays: string[];
}) {
  const cur = plan.itineraryLiveCuration;
  const kept = new Set(cur?.kept ?? []);
  const dismissed = new Set(cur?.dismissed ?? []);
  const sched = cur?.scheduledDates ?? {};

  const restaurantKeptMeta = restaurants
    .filter((r) => kept.has(restaurantLiveKey(r)))
    .map((r) => {
      const key = restaurantLiveKey(r);
      const day = sched[key];
      const sub =
        day && r.neighborhood ? `${formatShortTripDay(day)} · ${r.neighborhood}` : day ? formatShortTripDay(day) : r.neighborhood;
      return { key, label: r.name, sub };
    });
  const restaurantPool = restaurants.filter((r) => !kept.has(restaurantLiveKey(r)) && !dismissed.has(restaurantLiveKey(r)));

  return (
    <section className="rounded-2xl border border-[color:var(--hairline)] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
      <h3 className="font-display text-base font-semibold text-[color:var(--on-surface)] dark:text-neutral-100">Restaurants (live)</h3>
      <p className="mt-1 text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">
        {isHost ? (
          <>
            Use <strong className="text-[color:var(--on-surface-variant)] dark:text-neutral-300">Add to trip</strong>, choose a trip day, then find it
            under <strong className="text-[color:var(--on-surface-variant)] dark:text-neutral-300">Reservations by day</strong>. Suggestions come from
            Google Places (group food hints).
          </>
        ) : (
          "Restaurant ideas from Google Places — only the host can add them to the trip."
        )}
      </p>
      {liveLoading ? (
        <p className="mt-4 text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">Loading restaurants…</p>
      ) : restaurantsError ? (
        <p className="mt-4 text-sm text-amber-800 dark:text-amber-200/90">{restaurantsError}</p>
      ) : restaurants.length ? (
        <div className="mt-4 space-y-3">
          <KeptStrip title="On your trip" items={restaurantKeptMeta} busyKey={busyKey} onRemove={(k) => mutate("unkeep", k)} />
          {restaurantPool.map((r) => {
            const key = restaurantLiveKey(r);
            return (
              <div
                key={key}
                className="overflow-hidden rounded-xl border border-[color:var(--hairline)] bg-white dark:border-white/10 dark:bg-dm-elevated/50"
              >
                <LivePlaceCoverImage src={r.coverPhotoUrl} />
                <div className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-[color:var(--on-surface)] dark:text-neutral-100">{r.name}</p>
                      {r.cuisineType ? <p className="text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">{r.cuisineType}</p> : null}
                      <p className="text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">{r.neighborhood}</p>
                      <p className="mt-1 text-sm font-medium text-amber-900/90 dark:text-amber-300">{r.ratingDisplay}</p>
                      <p className="mt-1 text-base font-semibold text-[color:var(--on-surface)] dark:text-neutral-50">{r.priceRange}</p>
                    </div>
                    <LiveHostCurateRowActions
                      itemKey={key}
                      isHost={isHost}
                      tripDays={tripDays}
                      busyAll={busyKey !== null}
                      mutate={mutate}
                    />
                  </div>
                  <a
                    href={r.openTableUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-900 hover:bg-rose-50 dark:border-white/10 dark:bg-dm-page dark:text-rose-300 dark:hover:bg-dm-elevated"
                  >
                    {r.reserveCtaLabel ?? "Open in Maps"}
                  </a>
                </div>
              </div>
            );
          })}
          {!restaurantPool.length && restaurantKeptMeta.length > 0 ? (
            <p className="text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">No more restaurant suggestions in the deck.</p>
          ) : null}
          {restaurants.length > 0 && !restaurantPool.length && !restaurantKeptMeta.length ? (
            <p className="text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">
              Every live suggestion here was dismissed. Refresh the page after new results load if you want to curate again.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">No live restaurant rows yet.</p>
      )}
    </section>
  );
}

export function CuratedExperiencesSection({
  plan,
  experiences,
  liveLoading,
  experiencesError,
  mutate,
  busyKey,
  isHost,
  tripDays,
}: {
  plan: TripPlan;
  experiences: LiveExperienceCard[];
  liveLoading: boolean;
  experiencesError: string | null;
  mutate: LiveCurationMutate;
  busyKey: string | null;
  isHost: boolean;
  tripDays: string[];
}) {
  const cur = plan.itineraryLiveCuration;
  const kept = new Set(cur?.kept ?? []);
  const dismissed = new Set(cur?.dismissed ?? []);
  const sched = cur?.scheduledDates ?? {};

  const experienceKeptMeta = experiences
    .map((ex, i) => ({ ex, i, key: experienceLiveKey(ex, i) }))
    .filter(({ key }) => kept.has(key))
    .map(({ ex, key }) => {
      const day = sched[key];
      const sub = day ? `${formatShortTripDay(day)} · ${ex.duration}` : ex.duration;
      return { key, label: ex.name, sub };
    });
  const experiencePool = experiences
    .map((ex, i) => ({ ex, i, key: experienceLiveKey(ex, i) }))
    .filter(({ key }) => !kept.has(key) && !dismissed.has(key));

  return (
    <section className="rounded-2xl border border-[color:var(--hairline)] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
      <h3 className="font-display text-base font-semibold text-[color:var(--on-surface)] dark:text-neutral-100">Top experiences</h3>
      <p className="mt-1 text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">
        {isHost ? (
          <>
            <strong className="text-[color:var(--on-surface-variant)] dark:text-neutral-300">Add to trip</strong> and pick a day — it will show under{" "}
            <strong className="text-[color:var(--on-surface-variant)] dark:text-neutral-300">Reservations by day</strong>. Suggestions from Google Places.
          </>
        ) : (
          "Experience ideas — only the host can add them to the trip."
        )}
      </p>
      {liveLoading ? (
        <p className="mt-4 text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">Loading experiences…</p>
      ) : experiencesError ? (
        <p className="mt-4 text-sm text-amber-800 dark:text-amber-200/90">{experiencesError}</p>
      ) : experiences.length ? (
        <div className="mt-4 space-y-3">
          <KeptStrip title="On your trip" items={experienceKeptMeta} busyKey={busyKey} onRemove={(k) => mutate("unkeep", k)} />
          {experiencePool.map(({ ex, key }) => (
            <div
              key={key}
              className="overflow-hidden rounded-xl border border-[color:var(--hairline)] bg-white dark:border-white/10 dark:bg-dm-elevated/50"
            >
              <LivePlaceCoverImage src={ex.coverPhotoUrl} />
              <div className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-[color:var(--on-surface)] dark:text-neutral-100">{ex.name}</p>
                    <p className="mt-1 text-base font-semibold text-[color:var(--on-surface)] dark:text-neutral-50">{ex.pricePerPerson}</p>
                    <p className="mt-1 text-sm font-medium text-amber-900/90 dark:text-amber-300">{ex.rating}</p>
                    <p className="mt-1 text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">Duration: {ex.duration}</p>
                  </div>
                  <LiveHostCurateRowActions
                    itemKey={key}
                    isHost={isHost}
                    tripDays={tripDays}
                    busyAll={busyKey !== null}
                    mutate={mutate}
                  />
                </div>
                <a
                  href={ex.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-900 hover:bg-indigo-50 dark:border-indigo-500/30 dark:bg-dm-page dark:text-indigo-200 dark:hover:bg-indigo-950/40"
                >
                  Open booking link
                </a>
              </div>
            </div>
          ))}
          {!experiencePool.length && experienceKeptMeta.length > 0 ? (
            <p className="text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">No more experience suggestions in the deck.</p>
          ) : null}
          {experiences.length > 0 && !experiencePool.length && !experienceKeptMeta.length ? (
            <p className="text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">
              Every suggestion here was dismissed. Refresh after new results load to curate again.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">
          No experiences found for this destination yet. Try a more specific city, or check back later.
        </p>
      )}
    </section>
  );
}
