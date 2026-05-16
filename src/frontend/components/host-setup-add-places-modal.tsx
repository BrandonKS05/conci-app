"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { LiveExperienceCard, TripLiveRecommendationsPayload } from "@/shared/trip-live-recommendations";
import type { RestaurantPick } from "@/shared/restaurants";
import type { TripPlan } from "@/shared/trip-plan";
import { tripLiveRecommendationsContextFingerprint } from "@/shared/trip-plan";

function SuggestionThumb({ src, label }: { src?: string | null; label: string }) {
  return (
    <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl bg-[color:var(--surface-container)] dark:bg-white/5">
      {src?.trim() ? (
        <Image src={src.trim()} alt={label} fill className="object-cover" sizes="72px" unoptimized />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center bg-slate-200/60 px-1 text-center text-[10px] font-medium leading-tight text-[color:var(--on-surface-muted)] dark:bg-white/10 dark:text-neutral-400"
          aria-hidden
        >
          No photo
        </div>
      )}
    </div>
  );
}

/** Primary actions — neutral dark gray (no teal / indigo). */
const btnPrimary =
  "rounded-lg border border-zinc-500/40 bg-zinc-700 px-3 py-1.5 font-sans text-xs font-medium text-white shadow-sm transition hover:bg-zinc-600 active:bg-zinc-800 dark:border-zinc-500/35 dark:bg-zinc-600 dark:hover:bg-zinc-500 dark:active:bg-zinc-700";

const btnLoadMore =
  "mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 active:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700";

export type HostSetupHotelAddSpec =
  | { kind: "entireTrip" }
  | { kind: "dateRange"; stayStartIso: string; stayEndIso: string };

type Props = {
  open: boolean;
  onClose: () => void;
  tripId: string;
  plan: TripPlan;
  dateLabel: string;
  onAddRestaurant: (pick: RestaurantPick) => void;
  onAddExperience: (card: LiveExperienceCard) => void;
};

export function HostSetupAddPlacesModal({
  open,
  onClose,
  tripId,
  plan,
  dateLabel,
  onAddRestaurant,
  onAddExperience,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TripLiveRecommendationsPayload | null>(null);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [restaurantVisibleCount, setRestaurantVisibleCount] = useState(3);
  const [experienceVisibleCount, setExperienceVisibleCount] = useState(3);

  const contextKey = useMemo(() => tripLiveRecommendationsContextFingerprint(plan), [plan]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setFetchErr(null);
    setRestaurantVisibleCount(3);
    setExperienceVisibleCount(3);
    void (async () => {
      try {
        const r = await fetch(`/api/trip-plans/${tripId}/live-recommendations`, { credentials: "include" });
        const j = (await r.json().catch(() => ({}))) as Partial<TripLiveRecommendationsPayload> & {
          error?: string;
        };
        if (!cancelled) {
          if (!r.ok) {
            setFetchErr(typeof j.error === "string" ? j.error : "Could not load suggestions.");
            setData(null);
          } else {
            setData(j as TripLiveRecommendationsPayload);
            setFetchErr(null);
          }
        }
      } catch {
        if (!cancelled) {
          setFetchErr("Could not reach the server.");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tripId, contextKey]);

  const allRestaurants = useMemo(() => data?.restaurants ?? [], [data?.restaurants]);
  const allExperiences = useMemo(() => data?.experiences ?? [], [data?.experiences]);
  const visibleRestaurants = useMemo(
    () => allRestaurants.slice(0, restaurantVisibleCount),
    [allRestaurants, restaurantVisibleCount]
  );
  const visibleExperiences = useMemo(
    () => allExperiences.slice(0, experienceVisibleCount),
    [allExperiences, experienceVisibleCount]
  );

  const showRestaurantLoadMore = allRestaurants.length > restaurantVisibleCount;
  const showExperienceLoadMore = allExperiences.length > experienceVisibleCount;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center p-4 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-activities-title"
    >
      <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" aria-label="Close" onClick={onClose} />
      <div className="relative max-h-[min(90vh,720px)] w-full max-w-lg overflow-hidden rounded-2xl border border-[color:var(--hairline)] bg-white shadow-2xl dark:border-white/10 dark:bg-dm-card">
        <div className="flex items-start justify-between gap-3 border-b border-[color:var(--hairline)] px-5 py-4 dark:border-white/10">
          <div>
            <h2 id="edit-activities-title" className="text-lg font-semibold text-[color:var(--on-surface)] dark:text-white">
              Add places
            </h2>
            <p className="mt-0.5 text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-400">{dateLabel}</p>
            <p className="mt-2 text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">
              Suggestions use your trip destination, budget, and vibe from the planner. For lodging, use Lodging or Home base — Find your
              stay.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-[color:var(--on-surface-muted)] hover:bg-[color:var(--surface-container)] hover:text-[color:var(--on-surface)] dark:text-neutral-400 dark:hover:bg-dm-elevated dark:hover:text-neutral-200"
          >
            Close
          </button>
        </div>

        <div className="max-h-[min(72vh,560px)] overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-400">Loading picks…</p>
          ) : (
            <div className="space-y-8">
              {fetchErr ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-200">
                  {fetchErr}
                </p>
              ) : null}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:text-neutral-400">
                  Top restaurants
                </h3>
                {data?.restaurantsError ? (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{data.restaurantsError}</p>
                ) : null}
                <ul className="mt-3 space-y-2">
                  {visibleRestaurants.length === 0 ? (
                    <li className="text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                      No restaurant picks for this trip yet.
                    </li>
                  ) : (
                    visibleRestaurants.map((r) => (
                      <li
                        key={r.id}
                        className="flex gap-3 rounded-xl border border-[color:var(--hairline)] p-3 dark:border-white/10"
                      >
                        <SuggestionThumb src={r.coverPhotoUrl} label={r.name} />
                        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="font-medium text-[color:var(--on-surface)] dark:text-neutral-100">{r.name}</p>
                            <p className="text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-400">
                              {r.neighborhood} · {r.ratingDisplay} · {r.priceRange}
                            </p>
                          </div>
                          <button type="button" className={`${btnPrimary} shrink-0`} onClick={() => onAddRestaurant(r)}>
                            Add meal
                          </button>
                        </div>
                      </li>
                    ))
                  )}
                </ul>
                {showRestaurantLoadMore ? (
                  <button type="button" className={btnLoadMore} disabled={loading} onClick={() => setRestaurantVisibleCount((n) => n + 3)}>
                    Load 3 more
                  </button>
                ) : null}
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:text-neutral-400">
                  Top activities
                </h3>
                {data?.experiencesError ? (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{data.experiencesError}</p>
                ) : null}
                <ul className="mt-3 space-y-2">
                  {visibleExperiences.length === 0 ? (
                    <li className="text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                      No activity picks for this trip yet.
                    </li>
                  ) : (
                    visibleExperiences.map((x, i) => (
                      <li
                        key={`${x.bookingUrl}-${i}`}
                        className="flex gap-3 rounded-xl border border-[color:var(--hairline)] p-3 dark:border-white/10"
                      >
                        <SuggestionThumb src={x.coverPhotoUrl} label={x.name} />
                        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="font-medium text-[color:var(--on-surface)] dark:text-neutral-100">{x.name}</p>
                            <p className="text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-400">
                              {x.duration} · {x.rating} · {x.pricePerPerson}
                            </p>
                          </div>
                          <button type="button" className={`${btnPrimary} shrink-0`} onClick={() => onAddExperience(x)}>
                            Add activity
                          </button>
                        </div>
                      </li>
                    ))
                  )}
                </ul>
                {showExperienceLoadMore ? (
                  <button type="button" className={btnLoadMore} disabled={loading} onClick={() => setExperienceVisibleCount((n) => n + 3)}>
                    Load 3 more
                  </button>
                ) : null}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
