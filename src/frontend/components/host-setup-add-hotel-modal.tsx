"use client";

import { useCallback, useEffect, useState } from "react";
import type { PlaceSpotlight } from "@/shared/place-preview";
import type { TripPlan } from "@/shared/trip-plan";

type Props = {
  open: boolean;
  onClose: () => void;
  plan: TripPlan;
  dateLabel: string;
  onSelectHotel: (place: PlaceSpotlight, scope: "full" | "partial") => void;
};

export function HostSetupAddHotelModal({
  open,
  onClose,
  plan,
  dateLabel,
  onSelectHotel,
}: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceSpotlight[]>([]);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<PlaceSpotlight | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
      setPicked(null);
      setBusy(false);
    }
  }, [open]);

  const search = useCallback(async () => {
    const hint = plan.location?.trim() || "";
    const q = query.trim() || `${hint} boutique hotel`.trim();
    setBusy(true);
    try {
      const res = await fetch("/api/places/maps-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q, locationHint: hint || null }),
      });
      const j = (await res.json()) as { places?: PlaceSpotlight[] };
      setHits((j.places ?? []).slice(0, 12));
    } catch {
      setHits([]);
    } finally {
      setBusy(false);
    }
  }, [query, plan.location]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center p-4 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-hotel-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative max-h-[min(90vh,720px)] w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-dm-card">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <div>
            <h2 id="add-hotel-title" className="text-lg font-semibold text-slate-900 dark:text-white">
              Add lodging
            </h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-neutral-400">{dateLabel}</p>
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
          {picked ? (
            <div className="space-y-4">
              <p className="text-sm font-medium text-slate-900 dark:text-neutral-100">{picked.name}</p>
              <p className="text-xs text-slate-500 dark:text-neutral-500">
                How should this stay apply relative to your trip dates?
              </p>
              <button
                type="button"
                className="w-full rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-left text-sm font-medium text-teal-900 transition hover:bg-teal-100 dark:border-teal-500/35 dark:bg-teal-950/55 dark:text-teal-100 dark:hover:bg-teal-950"
                onClick={() => onSelectHotel(picked, "full")}
              >
                This is our stay for the{" "}
                <span className="font-semibold">entire trip</span>
              </button>
              <button
                type="button"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-200 dark:hover:bg-dm-page"
                onClick={() => onSelectHotel(picked, "partial")}
              >
                <span className="font-semibold">Not the entire trip</span> — this stay runs from this
                date through the end of the trip. You can add another hotel later for earlier nights.
              </button>
              <button
                type="button"
                className="text-sm text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline dark:text-neutral-500 dark:hover:text-neutral-200"
                onClick={() => setPicked(null)}
              >
                Pick a different place
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={plan.location ? `Search near ${plan.location}` : "Search hotels"}
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-teal-500 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-100"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void search();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => void search()}
                  disabled={busy}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-100 dark:hover:bg-dm-page"
                >
                  {busy ? "…" : "Search"}
                </button>
              </div>
              <ul className="mt-4 max-h-[min(50vh,360px)] space-y-1 overflow-auto rounded-xl border border-slate-200 bg-slate-50/50 p-2 dark:border-white/10 dark:bg-dm-elevated/50">
                {hits.length === 0 ? (
                  <li className="px-3 py-6 text-center text-sm text-slate-500 dark:text-neutral-500">
                    Search to see places.
                  </li>
                ) : (
                  hits.map((h) => (
                    <li key={h.mapsUrl}>
                      <button
                        type="button"
                        className="w-full rounded-lg px-3 py-2.5 text-left transition hover:bg-white dark:hover:bg-white/5"
                        onClick={() => setPicked(h)}
                      >
                        <span className="font-medium text-slate-900 dark:text-neutral-100">{h.name}</span>
                        {h.priceRange ? (
                          <span className="ml-2 text-slate-500 dark:text-neutral-500">{h.priceRange}</span>
                        ) : null}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
