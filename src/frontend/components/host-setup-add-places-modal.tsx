"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LiveExperienceCard, TripLiveRecommendationsPayload } from "@/shared/trip-live-recommendations";
import type { PlaceSpotlight } from "@/shared/place-preview";
import type { RestaurantPick } from "@/shared/restaurants";
import type { TripPlan } from "@/shared/trip-plan";
import {
  enumerateLocalIsoDays,
  parseLocalIsoDate,
  tripLiveRecommendationsContextFingerprint,
} from "@/shared/trip-plan";

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

const btnDayChip =
  "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition " +
  "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 " +
  "dark:border-white/15 dark:bg-zinc-800/80 dark:text-zinc-100 dark:hover:bg-zinc-700/90";

const btnDayChipInRange =
  "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition " +
  "border-zinc-500 bg-zinc-700 text-white dark:border-zinc-500 dark:bg-zinc-600";

const btnLoadMore =
  "mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 active:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700";

export type HostSetupHotelAddSpec =
  | { kind: "entireTrip" }
  | { kind: "dateRange"; stayStartIso: string; stayEndIso: string };

function shortDayLabel(iso: string): string {
  const d = parseLocalIsoDate(iso);
  if (!d) return iso;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

type Props = {
  open: boolean;
  onClose: () => void;
  tripId: string;
  plan: TripPlan;
  dateLabel: string;
  /** Trip bounds for hotel stay duration (host calendar range). */
  tripRange: { startIso: string; endIso: string } | null;
  onAddRestaurant: (pick: RestaurantPick) => void;
  onAddExperience: (card: LiveExperienceCard) => void;
  onAddHotel: (place: PlaceSpotlight, spec: HostSetupHotelAddSpec) => void;
};

export function HostSetupAddPlacesModal({
  open,
  onClose,
  tripId,
  plan,
  dateLabel,
  tripRange,
  onAddRestaurant,
  onAddExperience,
  onAddHotel,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TripLiveRecommendationsPayload | null>(null);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [hotelPlacesAll, setHotelPlacesAll] = useState<PlaceSpotlight[]>([]);
  const [hotelVisibleCount, setHotelVisibleCount] = useState(3);
  const [hotelRemoteExhausted, setHotelRemoteExhausted] = useState(false);
  const [hotelsLoadingMore, setHotelsLoadingMore] = useState(false);
  const [restaurantVisibleCount, setRestaurantVisibleCount] = useState(3);
  const [experienceVisibleCount, setExperienceVisibleCount] = useState(3);
  const hotelsRef = useRef({ all: [] as PlaceSpotlight[], vis: 3, exhausted: false });
  hotelsRef.current = {
    all: hotelPlacesAll,
    vis: hotelVisibleCount,
    exhausted: hotelRemoteExhausted,
  };
  const [hotelsErr, setHotelsErr] = useState<string | null>(null);

  const [stayPickPlace, setStayPickPlace] = useState<PlaceSpotlight | null>(null);
  const [entireTripPick, setEntireTripPick] = useState(false);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);

  const contextKey = useMemo(() => tripLiveRecommendationsContextFingerprint(plan), [plan]);

  const tripDays = useMemo(() => {
    if (!tripRange) return [];
    return enumerateLocalIsoDays(tripRange.startIso, tripRange.endIso);
  }, [tripRange]);

  useEffect(() => {
    if (!open) {
      setStayPickPlace(null);
      setEntireTripPick(false);
      setRangeStart(null);
      setRangeEnd(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFetchErr(null);
    setHotelsErr(null);
    setHotelPlacesAll([]);
    setHotelVisibleCount(3);
    setHotelRemoteExhausted(false);
    setRestaurantVisibleCount(3);
    setExperienceVisibleCount(3);
    void (async () => {
      const hint = plan.location?.trim() || plan.title?.trim() || "";
      const hotelQuery = hint
        ? `${hint.split(",")[0]?.trim() || hint} boutique hotel`
        : "boutique hotel";

      await Promise.all([
        (async () => {
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
          }
        })(),
        (async () => {
          try {
            const hotelRes = await fetch("/api/places/maps-search", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                q: hotelQuery,
                locationHint: hint || null,
                start: 0,
                limit: 30,
              }),
            });
            const hj = (await hotelRes.json().catch(() => ({}))) as { places?: PlaceSpotlight[] };
            if (!cancelled) {
              if (!hotelRes.ok) {
                setHotelsErr("Could not load hotel suggestions.");
                setHotelPlacesAll([]);
                setHotelRemoteExhausted(true);
              } else {
                const rows = hj.places ?? [];
                setHotelPlacesAll(rows);
                setHotelRemoteExhausted(rows.length < 30);
                setHotelsErr(null);
              }
            }
          } catch {
            if (!cancelled) {
              setHotelsErr("Could not reach the server.");
              setHotelPlacesAll([]);
              setHotelRemoteExhausted(true);
            }
          }
        })(),
      ]);

      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tripId, contextKey, plan.location, plan.title]);

  const beginStayPick = useCallback((place: PlaceSpotlight) => {
    setStayPickPlace(place);
    setEntireTripPick(false);
    setRangeStart(null);
    setRangeEnd(null);
  }, []);

  const cancelStayPick = useCallback(() => {
    setStayPickPlace(null);
    setEntireTripPick(false);
    setRangeStart(null);
    setRangeEnd(null);
  }, []);

  const onDayChipClick = useCallback(
    (iso: string) => {
      if (entireTripPick) setEntireTripPick(false);
      if (!rangeStart || (rangeStart && rangeEnd)) {
        setRangeStart(iso);
        setRangeEnd(null);
        return;
      }
      let a = rangeStart;
      let b = iso;
      if (b < a) [a, b] = [b, a];
      setRangeStart(a);
      setRangeEnd(b);
    },
    [entireTripPick, rangeStart, rangeEnd]
  );

  const dayChipHighlighted = useCallback(
    (iso: string) => {
      if (entireTripPick) return false;
      if (rangeStart && !rangeEnd && iso === rangeStart) return true;
      if (rangeStart && rangeEnd && iso >= rangeStart && iso <= rangeEnd) return true;
      return false;
    },
    [entireTripPick, rangeStart, rangeEnd]
  );

  const confirmStay = useCallback(() => {
    if (!stayPickPlace || !tripRange) return;
    if (entireTripPick) {
      onAddHotel(stayPickPlace, { kind: "entireTrip" });
      cancelStayPick();
      onClose();
      return;
    }
    if (!rangeStart || !rangeEnd) return;
    onAddHotel(stayPickPlace, {
      kind: "dateRange",
      stayStartIso: rangeStart,
      stayEndIso: rangeEnd,
    });
    cancelStayPick();
    onClose();
  }, [
    stayPickPlace,
    tripRange,
    entireTripPick,
    rangeStart,
    rangeEnd,
    onAddHotel,
    cancelStayPick,
    onClose,
  ]);

  const onLoadMoreHotels = useCallback(async () => {
    const { all, vis, exhausted } = hotelsRef.current;
    if (vis < all.length) {
      setHotelVisibleCount((v) => v + 3);
      return;
    }
    if (exhausted || hotelsLoadingMore) return;

    const hint = plan.location?.trim() || plan.title?.trim() || "";
    const hotelQuery = hint
      ? `${hint.split(",")[0]?.trim() || hint} boutique hotel`
      : "boutique hotel";

    setHotelsLoadingMore(true);
    try {
      const hotelRes = await fetch("/api/places/maps-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: hotelQuery,
          locationHint: hint || null,
          start: all.length,
          limit: 20,
        }),
      });
      const hj = (await hotelRes.json().catch(() => ({}))) as { places?: PlaceSpotlight[] };
      const batch = hj.places ?? [];
      if (!hotelRes.ok || batch.length === 0) {
        setHotelRemoteExhausted(true);
        return;
      }

      let added = 0;
      setHotelPlacesAll((prev) => {
        const seen = new Set(prev.map((p) => p.mapsUrl));
        const next = [...prev];
        for (const p of batch) {
          if (!seen.has(p.mapsUrl)) {
            seen.add(p.mapsUrl);
            next.push(p);
            added++;
          }
        }
        return next;
      });
      setHotelRemoteExhausted(batch.length < 20 || added === 0);
      setHotelVisibleCount((v) => v + 3);
    } finally {
      setHotelsLoadingMore(false);
    }
  }, [plan.location, plan.title, hotelsLoadingMore]);

  const allRestaurants = useMemo(() => data?.restaurants ?? [], [data?.restaurants]);
  const allExperiences = useMemo(() => data?.experiences ?? [], [data?.experiences]);
  const visibleHotels = useMemo(
    () => hotelPlacesAll.slice(0, hotelVisibleCount),
    [hotelPlacesAll, hotelVisibleCount]
  );
  const visibleRestaurants = useMemo(
    () => allRestaurants.slice(0, restaurantVisibleCount),
    [allRestaurants, restaurantVisibleCount]
  );
  const visibleExperiences = useMemo(
    () => allExperiences.slice(0, experienceVisibleCount),
    [allExperiences, experienceVisibleCount]
  );

  const showHotelLoadMore =
    !hotelsErr &&
    hotelPlacesAll.length > 0 &&
    (hotelVisibleCount < hotelPlacesAll.length || !hotelRemoteExhausted);
  const showRestaurantLoadMore = allRestaurants.length > restaurantVisibleCount;
  const showExperienceLoadMore = allExperiences.length > experienceVisibleCount;

  const stayPickValid =
    Boolean(tripRange) &&
    (entireTripPick || (Boolean(rangeStart) && Boolean(rangeEnd)));

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
        {stayPickPlace ? (
          <div className="flex max-h-[min(90vh,720px)] flex-col bg-white dark:bg-dm-card">
            <div className="flex items-start justify-between gap-3 border-b border-[color:var(--hairline)] px-5 py-4 dark:border-white/10">
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={cancelStayPick}
                  className="mb-2 text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  ← Back to suggestions
                </button>
                <h2 className="text-lg font-semibold text-[color:var(--on-surface)] dark:text-white">When is this stay?</h2>
                <p className="mt-1 text-sm font-medium text-[color:var(--on-surface)] dark:text-neutral-200">{stayPickPlace.name}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-2 py-1 text-sm text-[color:var(--on-surface-muted)] hover:bg-[color:var(--surface-container)] hover:text-[color:var(--on-surface)] dark:text-neutral-400 dark:hover:bg-dm-elevated dark:hover:text-neutral-200"
              >
                Close
              </button>
            </div>

            <div className="max-h-[min(70vh,560px)] overflow-y-auto px-5 py-4">
              {!tripRange ? (
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Set your trip dates on the calendar first, then you can choose how long this stay runs.
                </p>
              ) : (
                <div className="space-y-5">
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 p-3 dark:border-white/10">
                    <input
                      type="checkbox"
                      className="mt-0.5 rounded border-zinc-400 text-zinc-700 focus:ring-zinc-500"
                      checked={entireTripPick}
                      onChange={() => {
                        setEntireTripPick((v) => {
                          const next = !v;
                          if (next) {
                            setRangeStart(null);
                            setRangeEnd(null);
                          }
                          return next;
                        });
                      }}
                    />
                    <span className="text-sm leading-snug text-[color:var(--on-surface)] dark:text-neutral-200">
                      I&apos;m staying here for the entire trip
                    </span>
                  </label>

                  {!entireTripPick ? (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Trip nights (tap check-in day, then check-out day)
                      </p>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                        One night: tap the same day twice (select start, then end).
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {tripDays.map((iso) => (
                          <button
                            key={iso}
                            type="button"
                            onClick={() => onDayChipClick(iso)}
                            className={dayChipHighlighted(iso) ? btnDayChipInRange : btnDayChip}
                          >
                            {shortDayLabel(iso)}
                          </button>
                        ))}
                      </div>
                      {rangeStart ? (
                        <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
                          {rangeEnd
                            ? `${shortDayLabel(rangeStart)} → ${shortDayLabel(rangeEnd)} (inclusive)`
                            : `Check-in: ${shortDayLabel(rangeStart)} — tap check-out day`}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setRangeStart(null);
                          setRangeEnd(null);
                        }}
                        className="mt-2 text-xs text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline dark:hover:text-zinc-300"
                      >
                        Clear selection
                      </button>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" className={btnPrimary} disabled={!stayPickValid} onClick={confirmStay}>
                      Confirm stay
                    </button>
                    <button
                      type="button"
                      onClick={cancelStayPick}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-white/15 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-[color:var(--hairline)] px-5 py-4 dark:border-white/10">
              <div>
                <h2 id="edit-activities-title" className="text-lg font-semibold text-[color:var(--on-surface)] dark:text-white">
                  Add places
                </h2>
                <p className="mt-0.5 text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-400">{dateLabel}</p>
                <p className="mt-2 text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                  Suggestions use your trip destination, budget, and vibe from the planner.
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
                      Top stays
                    </h3>
                    {hotelsErr ? (
                      <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{hotelsErr}</p>
                    ) : null}
                    <ul className="mt-3 space-y-2">
                      {visibleHotels.length === 0 ? (
                        <li className="text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-500">No hotel picks for this trip yet.</li>
                      ) : (
                        visibleHotels.map((h) => (
                          <li
                            key={h.mapsUrl}
                            className="flex gap-3 rounded-xl border border-zinc-200 p-3 dark:border-white/10"
                          >
                            <SuggestionThumb src={h.photoUrl ?? null} label={h.name} />
                            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <p className="font-medium text-[color:var(--on-surface)] dark:text-neutral-100">{h.name}</p>
                                <p className="text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-400">
                                  {h.rating != null ? `★ ${h.rating.toFixed(1)}` : ""}
                                  {h.rating != null && h.address ? " · " : ""}
                                  {h.address ?? ""}
                                </p>
                              </div>
                              <button type="button" className={`${btnPrimary} shrink-0`} onClick={() => beginStayPick(h)}>
                                Add stay
                              </button>
                            </div>
                          </li>
                        ))
                      )}
                    </ul>
                    {showHotelLoadMore ? (
                      <button
                        type="button"
                        className={btnLoadMore}
                        disabled={hotelsLoadingMore || loading}
                        onClick={() => void onLoadMoreHotels()}
                      >
                        {hotelsLoadingMore ? "Loading…" : "Load 3 more"}
                      </button>
                    ) : null}
                  </section>

                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:text-neutral-400">
                      Top restaurants
                    </h3>
                    {data?.restaurantsError ? (
                      <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{data.restaurantsError}</p>
                    ) : null}
                    <ul className="mt-3 space-y-2">
                      {visibleRestaurants.length === 0 ? (
                        <li className="text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-500">No restaurant picks for this trip yet.</li>
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
                      <button
                        type="button"
                        className={btnLoadMore}
                        disabled={loading}
                        onClick={() => setRestaurantVisibleCount((n) => n + 3)}
                      >
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
                        <li className="text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-500">No activity picks for this trip yet.</li>
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
                      <button
                        type="button"
                        className={btnLoadMore}
                        disabled={loading}
                        onClick={() => setExperienceVisibleCount((n) => n + 3)}
                      >
                        Load 3 more
                      </button>
                    ) : null}
                  </section>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
