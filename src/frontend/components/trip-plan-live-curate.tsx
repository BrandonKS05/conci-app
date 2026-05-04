"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

import { LivePlaceCoverImage } from "@/frontend/components/live-place-cover-image";
import { primaryFilledInteractive } from "@/frontend/ui/primary-action";
import {
  experienceLiveKey,
  flightLiveKey,
  restaurantLiveKey,
} from "@/shared/itinerary-live-curation";
import type { TripPlan } from "@/shared/trip-plan";
import type { LiveExperienceCard, LiveFlightCard } from "@/shared/trip-live-recommendations";
import type { RestaurantPick } from "@/shared/restaurants";

const SWIPE_DISMISS_PX = 72;

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
        className="relative touch-pan-y overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-dm-elevated/50"
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
    async (action: "keep" | "dismiss" | "unkeep" | "undismiss", key: string) => {
      setErr(null);
      setBusyKey(key);
      try {
        const res = await fetch(`/api/trip-plans/${tripId}/itinerary-live-curation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, key }),
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

type Mutate = (action: "keep" | "dismiss" | "unkeep" | "undismiss", key: string) => void;

export function CuratedFlightsRows({
  plan,
  flights,
  liveLoading,
  flightsError,
  mutate,
  busyKey,
}: {
  plan: TripPlan;
  flights: LiveFlightCard[];
  liveLoading: boolean;
  flightsError: string | null;
  mutate: Mutate;
  busyKey: string | null;
}) {
  const cur = plan.itineraryLiveCuration;
  const kept = new Set(cur?.kept ?? []);
  const dismissed = new Set(cur?.dismissed ?? []);

  const flightKeptMeta = flights
    .map((f, i) => ({ f, key: flightLiveKey(f, i) }))
    .filter(({ key }) => kept.has(key))
    .map(({ f, key }) => ({ key, label: f.airline, sub: f.departureTime }));
  const flightPool = flights
    .map((f, i) => ({ f, key: flightLiveKey(f, i) }))
    .filter(({ key }) => !kept.has(key) && !dismissed.has(key));

  if (liveLoading) {
    return <p className="text-sm text-slate-600 dark:text-neutral-400">Loading flights…</p>;
  }
  if (flightsError) {
    return <p className="text-sm text-amber-800 dark:text-amber-200/90">{flightsError}</p>;
  }
  if (!flights.length) {
    return <p className="text-sm text-slate-600 dark:text-neutral-400">No flight rows yet (check SERPAPI_KEY).</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 dark:text-neutral-500">
        Tap <strong className="text-slate-700 dark:text-neutral-300">Add to trip</strong> for options you want on the itinerary.
        Swipe left or use <strong className="text-slate-700 dark:text-neutral-300">Not interested</strong> to clear the rest.
      </p>
      <KeptStrip title="On your trip" items={flightKeptMeta} busyKey={busyKey} onRemove={(k) => mutate("unkeep", k)} />
      {flightPool.map(({ f, key }) => (
        <SwipeableLiveCard
          key={key}
          disabled={busyKey !== null}
          onSwipeDismiss={() => mutate("dismiss", key)}
          swipeLabel="Swipe left to dismiss this flight suggestion"
        >
          <div className="px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 dark:text-neutral-100">{f.airline}</p>
                <p className="text-sm text-slate-600 dark:text-neutral-400">Departs {f.departureTime}</p>
                <p className="text-sm text-slate-600 dark:text-neutral-400">Duration {f.duration}</p>
                <p className="mt-1 text-base font-semibold text-slate-900 dark:text-neutral-50">{f.pricePerPerson}</p>
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  disabled={busyKey !== null}
                  onClick={() => mutate("dismiss", key)}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-neutral-300 dark:hover:bg-white/5"
                >
                  Not interested
                </button>
                <button
                  type="button"
                  disabled={busyKey !== null}
                  onClick={() => mutate("keep", key)}
                  className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-neutral-100 dark:text-dm-page dark:hover:bg-white"
                >
                  Add to trip
                </button>
              </div>
            </div>
            <a
              href={f.bookOnGoogleFlightsUrl}
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
        <p className="text-sm text-slate-600 dark:text-neutral-400">No more flight suggestions in the deck.</p>
      ) : null}
      {flights.length > 0 && !flightPool.length && !flightKeptMeta.length ? (
        <p className="text-sm text-slate-600 dark:text-neutral-400">
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
}: {
  plan: TripPlan;
  restaurants: RestaurantPick[];
  liveLoading: boolean;
  restaurantsError: string | null;
  mutate: Mutate;
  busyKey: string | null;
}) {
  const cur = plan.itineraryLiveCuration;
  const kept = new Set(cur?.kept ?? []);
  const dismissed = new Set(cur?.dismissed ?? []);

  const restaurantKeptMeta = restaurants
    .filter((r) => kept.has(restaurantLiveKey(r)))
    .map((r) => ({ key: restaurantLiveKey(r), label: r.name, sub: r.neighborhood }));
  const restaurantPool = restaurants.filter((r) => !kept.has(restaurantLiveKey(r)) && !dismissed.has(restaurantLiveKey(r)));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
      <h3 className="font-display text-base font-semibold text-slate-900 dark:text-neutral-100">Restaurants (live)</h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-neutral-500">
        Add picks with <strong className="text-slate-700 dark:text-neutral-300">Add to trip</strong>, or{' '}
        <strong className="text-slate-700 dark:text-neutral-300">Not interested</strong> for the rest. Suggestions come from
        Google Places Text Search (group vote food hints per query).
      </p>
      {liveLoading ? (
        <p className="mt-4 text-sm text-slate-600 dark:text-neutral-400">Loading restaurants…</p>
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
                className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-dm-elevated/50"
              >
                <LivePlaceCoverImage src={r.coverPhotoUrl} />
                <div className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-neutral-100">{r.name}</p>
                      {r.cuisineType ? <p className="text-sm text-slate-600 dark:text-neutral-400">{r.cuisineType}</p> : null}
                      <p className="text-sm text-slate-600 dark:text-neutral-400">{r.neighborhood}</p>
                      <p className="mt-1 text-sm font-medium text-amber-900/90 dark:text-amber-300">{r.ratingDisplay}</p>
                      <p className="mt-1 text-base font-semibold text-slate-900 dark:text-neutral-50">{r.priceRange}</p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                      <button
                        type="button"
                        disabled={busyKey !== null}
                        onClick={() => mutate("dismiss", key)}
                        className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-neutral-300 dark:hover:bg-white/5"
                      >
                        Not interested
                      </button>
                      <button
                        type="button"
                        disabled={busyKey !== null}
                        onClick={() => mutate("keep", key)}
                        className={`rounded-full px-3 py-1.5 text-xs disabled:opacity-50 ${primaryFilledInteractive}`}
                      >
                        Add to trip
                      </button>
                    </div>
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
            <p className="text-sm text-slate-600 dark:text-neutral-400">No more restaurant suggestions in the deck.</p>
          ) : null}
          {restaurants.length > 0 && !restaurantPool.length && !restaurantKeptMeta.length ? (
            <p className="text-sm text-slate-600 dark:text-neutral-400">
              Every live suggestion here was dismissed. Refresh the page after new results load if you want to curate again.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-600 dark:text-neutral-400">No live restaurant rows yet.</p>
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
}: {
  plan: TripPlan;
  experiences: LiveExperienceCard[];
  liveLoading: boolean;
  experiencesError: string | null;
  mutate: Mutate;
  busyKey: string | null;
}) {
  const cur = plan.itineraryLiveCuration;
  const kept = new Set(cur?.kept ?? []);
  const dismissed = new Set(cur?.dismissed ?? []);

  const experienceKeptMeta = experiences
    .map((ex, i) => ({ ex, i, key: experienceLiveKey(ex, i) }))
    .filter(({ key }) => kept.has(key))
    .map(({ ex, key }) => ({ key, label: ex.name, sub: ex.duration }));
  const experiencePool = experiences
    .map((ex, i) => ({ ex, i, key: experienceLiveKey(ex, i) }))
    .filter(({ key }) => !kept.has(key) && !dismissed.has(key));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
      <h3 className="font-display text-base font-semibold text-slate-900 dark:text-neutral-100">Top experiences</h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-neutral-500">
        Same card flow as restaurants. Set{" "}
        <code className="rounded bg-slate-100 px-1 dark:bg-white/10">GOOGLE_PLACES_API_KEY</code> in{" "}
        <code className="rounded bg-slate-100 px-1 dark:bg-white/10">.env.local</code>.
      </p>
      {liveLoading ? (
        <p className="mt-4 text-sm text-slate-600 dark:text-neutral-400">Loading experiences…</p>
      ) : experiencesError ? (
        <p className="mt-4 text-sm text-amber-800 dark:text-amber-200/90">{experiencesError}</p>
      ) : experiences.length ? (
        <div className="mt-4 space-y-3">
          <KeptStrip title="On your trip" items={experienceKeptMeta} busyKey={busyKey} onRemove={(k) => mutate("unkeep", k)} />
          {experiencePool.map(({ ex, key }) => (
            <SwipeableLiveCard
              key={key}
              disabled={busyKey !== null}
              onSwipeDismiss={() => mutate("dismiss", key)}
              swipeLabel="Swipe left to dismiss this experience"
            >
              <LivePlaceCoverImage src={ex.coverPhotoUrl} />
              <div className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-neutral-100">{ex.name}</p>
                    <p className="mt-1 text-base font-semibold text-slate-900 dark:text-neutral-50">{ex.pricePerPerson}</p>
                    <p className="mt-1 text-sm font-medium text-amber-900/90 dark:text-amber-300">{ex.rating}</p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">Duration: {ex.duration}</p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      disabled={busyKey !== null}
                      onClick={() => mutate("dismiss", key)}
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-neutral-300 dark:hover:bg-white/5"
                    >
                      Not interested
                    </button>
                    <button
                      type="button"
                      disabled={busyKey !== null}
                      onClick={() => mutate("keep", key)}
                      className={`rounded-full px-3 py-1.5 text-xs disabled:opacity-50 ${primaryFilledInteractive}`}
                    >
                      Add to trip
                    </button>
                  </div>
                </div>
                <a
                  href={ex.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-900 hover:bg-indigo-50 dark:border-indigo-500/30 dark:bg-dm-page dark:text-indigo-200 dark:hover:bg-indigo-950/40"
                  onClick={(e) => e.stopPropagation()}
                >
                  Open booking link
                </a>
              </div>
            </SwipeableLiveCard>
          ))}
          {!experiencePool.length && experienceKeptMeta.length > 0 ? (
            <p className="text-sm text-slate-600 dark:text-neutral-400">No more experience suggestions in the deck.</p>
          ) : null}
          {experiences.length > 0 && !experiencePool.length && !experienceKeptMeta.length ? (
            <p className="text-sm text-slate-600 dark:text-neutral-400">
              Every suggestion here was dismissed. Refresh after new results load to curate again.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-600 dark:text-neutral-400">
          No experiences found for this destination yet. Try a more specific city, or check back later.
        </p>
      )}
    </section>
  );
}
