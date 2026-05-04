"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { LiveExperienceCard, TripLiveRecommendationsPayload } from "@/shared/trip-live-recommendations";
import type { PlaceSpotlight } from "@/shared/place-preview";
import type { RestaurantPick } from "@/shared/restaurants";
import type { TripPlan } from "@/shared/trip-plan";
import { tripLiveRecommendationsContextFingerprint } from "@/shared/trip-plan";

function SuggestionThumb({ src, label }: { src?: string | null; label: string }) {
  return (
    <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-white/5">
      {src?.trim() ? (
        <Image src={src.trim()} alt={label} fill className="object-cover" sizes="72px" unoptimized />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center bg-slate-200/60 px-1 text-center text-[10px] font-medium leading-tight text-slate-500 dark:bg-white/10 dark:text-neutral-400"
          aria-hidden
        >
          No photo
        </div>
      )}
    </div>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  tripId: string;
  plan: TripPlan;
  dateLabel: string;
  onAddRestaurant: (pick: RestaurantPick) => void;
  onAddExperience: (card: LiveExperienceCard) => void;
  onAddHotel: (place: PlaceSpotlight, entireTrip: boolean) => void;
};

export function HostSetupAddPlacesModal({
  open,
  onClose,
  tripId,
  plan,
  dateLabel,
  onAddRestaurant,
  onAddExperience,
  onAddHotel,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TripLiveRecommendationsPayload | null>(null);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [hotelPlaces, setHotelPlaces] = useState<PlaceSpotlight[]>([]);
  const [hotelsErr, setHotelsErr] = useState<string | null>(null);
  const [entireTripByUrl, setEntireTripByUrl] = useState<Record<string, boolean>>({});

  const contextKey = useMemo(() => tripLiveRecommendationsContextFingerprint(plan), [plan]);

  useEffect(() => {
    if (!open) {
      setEntireTripByUrl({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFetchErr(null);
    setHotelsErr(null);
    setHotelPlaces([]);
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
              body: JSON.stringify({ q: hotelQuery, locationHint: hint || null }),
            });
            const hj = (await hotelRes.json().catch(() => ({}))) as { places?: PlaceSpotlight[] };
            if (!cancelled) {
              if (!hotelRes.ok) {
                setHotelsErr("Could not load hotel suggestions.");
                setHotelPlaces([]);
              } else {
                setHotelPlaces((hj.places ?? []).slice(0, 3));
                setHotelsErr(null);
              }
            }
          } catch {
            if (!cancelled) {
              setHotelsErr("Could not reach the server.");
              setHotelPlaces([]);
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

  const topRestaurants = useMemo(() => (data?.restaurants ?? []).slice(0, 3), [data?.restaurants]);
  const topExperiences = useMemo(() => (data?.experiences ?? []).slice(0, 3), [data?.experiences]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center p-4 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="edit-activities-title">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative max-h-[min(90vh,720px)] w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-dm-card">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <div>
            <h2 id="edit-activities-title" className="text-lg font-semibold text-slate-900 dark:text-white">
              Edit activities
            </h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-neutral-400">{dateLabel}</p>
            <p className="mt-2 text-xs text-slate-500 dark:text-neutral-500">
              Suggestions use your trip destination, budget, and vibe from the planner.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-neutral-400 dark:hover:bg-dm-elevated dark:hover:text-neutral-200"
          >
            Close
          </button>
        </div>

        <div className="max-h-[min(72vh,560px)] overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-neutral-400">Loading picks…</p>
          ) : (
            <div className="space-y-8">
              {fetchErr ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-200">
                  {fetchErr}
                </p>
              ) : null}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
                  Top stays
                </h3>
                {hotelsErr ? (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{hotelsErr}</p>
                ) : null}
                <ul className="mt-3 space-y-2">
                  {hotelPlaces.length === 0 ? (
                    <li className="text-sm text-slate-500 dark:text-neutral-500">No hotel picks for this trip yet.</li>
                  ) : (
                    hotelPlaces.map((h) => (
                      <li
                        key={h.mapsUrl}
                        className="flex gap-3 rounded-xl border border-indigo-200/80 p-3 dark:border-indigo-500/30"
                      >
                        <SuggestionThumb src={h.photoUrl ?? null} label={h.name} />
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          <div className="min-w-0 sm:flex sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                            <div className="min-w-0">
                              <p className="font-medium text-slate-900 dark:text-neutral-100">{h.name}</p>
                              <p className="text-xs text-slate-500 dark:text-neutral-400">
                                {h.rating != null ? `★ ${h.rating.toFixed(1)}` : ""}
                                {h.rating != null && h.address ? " · " : ""}
                                {h.address ?? ""}
                              </p>
                            </div>
                            <button
                              type="button"
                              className="mt-2 shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-indigo-500 sm:mt-0"
                              onClick={() => onAddHotel(h, Boolean(entireTripByUrl[h.mapsUrl]))}
                            >
                              Add stay
                            </button>
                          </div>
                          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600 dark:text-neutral-400">
                            <input
                              type="checkbox"
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              checked={Boolean(entireTripByUrl[h.mapsUrl])}
                              onChange={() =>
                                setEntireTripByUrl((prev) => ({
                                  ...prev,
                                  [h.mapsUrl]: !prev[h.mapsUrl],
                                }))
                              }
                            />
                            Stay for entire trip
                          </label>
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
                  Top restaurants
                </h3>
                {data?.restaurantsError ? (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{data.restaurantsError}</p>
                ) : null}
                <ul className="mt-3 space-y-2">
                  {topRestaurants.length === 0 ? (
                    <li className="text-sm text-slate-500 dark:text-neutral-500">No restaurant picks for this trip yet.</li>
                  ) : (
                    topRestaurants.map((r) => (
                      <li
                        key={r.id}
                        className="flex gap-3 rounded-xl border border-slate-200 p-3 dark:border-white/10"
                      >
                        <SuggestionThumb src={r.coverPhotoUrl} label={r.name} />
                        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 dark:text-neutral-100">{r.name}</p>
                            <p className="text-xs text-slate-500 dark:text-neutral-400">
                              {r.neighborhood} · {r.ratingDisplay} · {r.priceRange}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="shrink-0 rounded-lg bg-teal-600 px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-teal-500"
                            onClick={() => onAddRestaurant(r)}
                          >
                            Add meal
                          </button>
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
                  Top activities
                </h3>
                {data?.experiencesError ? (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{data.experiencesError}</p>
                ) : null}
                <ul className="mt-3 space-y-2">
                  {topExperiences.length === 0 ? (
                    <li className="text-sm text-slate-500 dark:text-neutral-500">No activity picks for this trip yet.</li>
                  ) : (
                    topExperiences.map((x, i) => (
                      <li
                        key={`${x.bookingUrl}-${i}`}
                        className="flex gap-3 rounded-xl border border-slate-200 p-3 dark:border-white/10"
                      >
                        <SuggestionThumb src={x.coverPhotoUrl} label={x.name} />
                        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 dark:text-neutral-100">{x.name}</p>
                            <p className="text-xs text-slate-500 dark:text-neutral-400">
                              {x.duration} · {x.rating} · {x.pricePerPerson}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="shrink-0 rounded-lg bg-teal-600 px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-teal-500"
                            onClick={() => onAddExperience(x)}
                          >
                            Add activity
                          </button>
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
