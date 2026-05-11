"use client";

import { useCallback, useEffect, useState } from "react";
import type { GeneratedItinerary, ItineraryActivity, ItineraryDay } from "@/shared/trip-plan";

const CATEGORY_ICONS: Record<ItineraryActivity["category"], string> = {
  transport: "🚗",
  food: "🍽️",
  activity: "🎯",
  lodging: "🏨",
  "free-time": "☀️",
};

const CATEGORY_COLORS: Record<ItineraryActivity["category"], string> = {
  transport: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  food: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  activity: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  lodging: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  "free-time": "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
};

function ActivityRow({ activity }: { activity: ItineraryActivity }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm" aria-hidden>
        {CATEGORY_ICONS[activity.category]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium text-[color:var(--on-surface-muted)] dark:text-neutral-400">
            {activity.time}
          </span>
          {activity.estimatedCostPp != null && activity.estimatedCostPp > 0 && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${CATEGORY_COLORS[activity.category]}`}>
              ${activity.estimatedCostPp}/pp
            </span>
          )}
        </div>
        <p className="text-sm font-medium text-[color:var(--on-surface)] dark:text-neutral-100">
          {activity.title}
        </p>
        {activity.description && (
          <p className="mt-0.5 text-xs text-[color:var(--on-surface-variant)] dark:text-neutral-400">
            {activity.description}
          </p>
        )}
      </div>
    </div>
  );
}

function DayCard({ day, index }: { day: ItineraryDay; index: number }) {
  return (
    <div className="rounded-xl border border-[color:var(--hairline)] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-dm-card">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            Day {index + 1}
          </span>
          <h3 className="text-base font-semibold text-[color:var(--on-surface)] dark:text-neutral-100">
            {day.label}
          </h3>
          {day.dateIso && !/^Day\s/i.test(day.dateIso) && (
            <p className="text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-400">{day.dateIso}</p>
          )}
        </div>
        {day.estimatedDayCostPp != null && day.estimatedDayCostPp > 0 && (
          <span className="rounded-full bg-[color:var(--surface-container)] px-2.5 py-1 text-xs font-semibold text-[color:var(--on-surface-variant)] dark:bg-white/10 dark:text-neutral-300">
            ~${day.estimatedDayCostPp}/pp
          </span>
        )}
      </div>
      <div className="divide-y divide-slate-100 dark:divide-white/5">
        {day.activities.map((act, i) => (
          <ActivityRow key={i} activity={act} />
        ))}
      </div>
    </div>
  );
}

type Props = {
  tripId: string;
  initialItinerary?: GeneratedItinerary | null;
  headcount?: number;
  /** When false, only POST /generate-itinerary if the visitor clicks Regenerate. */
  autoGenerateOnMount?: boolean;
};

export function GeneratedItineraryView({
  tripId,
  initialItinerary = null,
  headcount = 2,
  autoGenerateOnMount = true,
}: Props) {
  const [itinerary, setItinerary] = useState<GeneratedItinerary | null>(initialItinerary);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItinerary(initialItinerary ?? null);
  }, [initialItinerary]);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/trip-plans/${tripId}/generate-itinerary`, {
        method: "POST",
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Failed to generate itinerary");
        return;
      }
      if (body.itinerary) {
        setItinerary(body.itinerary);
      }
    } catch {
      setError("Network error — check your connection.");
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    if (!autoGenerateOnMount) return;
    if (initialItinerary != null) return;
    if (!itinerary && !loading) {
      void generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading && !itinerary) {
    return (
      <div className="rounded-xl border border-[color:var(--hairline)] bg-white p-8 text-center dark:border-white/10 dark:bg-dm-card">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600 dark:border-indigo-800 dark:border-t-indigo-400" />
        <p className="text-sm font-medium text-[color:var(--on-surface-variant)] dark:text-neutral-300">
          Building your itinerary...
        </p>
        <p className="mt-1 text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">
          This takes a few seconds
        </p>
      </div>
    );
  }

  if (error && !itinerary) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/30">
        <p className="text-sm text-amber-800 dark:text-amber-200">{error}</p>
        <button
          onClick={generate}
          className="mt-2 text-xs font-medium text-amber-700 underline underline-offset-2 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!itinerary) return null;

  const groupTotal = itinerary.totalEstimatePp != null ? itinerary.totalEstimatePp * headcount : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[color:var(--on-surface)] dark:text-neutral-100">
          Your Itinerary
        </h2>
        <button
          onClick={generate}
          disabled={loading}
          className="rounded-lg border border-[color:var(--hairline)] px-3 py-1.5 text-xs font-medium text-[color:var(--on-surface-variant)] transition hover:bg-[color:var(--surface-container-low)] disabled:opacity-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
        >
          {loading ? "Regenerating..." : "Regenerate"}
        </button>
      </div>

      {(itinerary.totalEstimatePp != null || groupTotal != null) && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-900/30 dark:bg-indigo-950/20">
          <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">
            Estimated trip cost
          </p>
          <div className="mt-1 flex flex-wrap gap-4 text-sm text-indigo-700 dark:text-indigo-300">
            {itinerary.totalEstimatePp != null && (
              <span>~${itinerary.totalEstimatePp.toLocaleString()} per person</span>
            )}
            {groupTotal != null && headcount > 1 && (
              <span>~${groupTotal.toLocaleString()} total ({headcount} people)</span>
            )}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {itinerary.days.map((day, i) => (
          <DayCard key={day.dateIso || i} day={day} index={i} />
        ))}
      </div>
    </div>
  );
}
