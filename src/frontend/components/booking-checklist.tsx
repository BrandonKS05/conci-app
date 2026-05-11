"use client";

import { useCallback, useState } from "react";
import type { TripPlan } from "@/shared/trip-plan";
import type { HotelPick } from "@/shared/hotels";
import type { BookingTaskKey, BookingTasksState } from "@/shared/booking-tasks";

function cityQuery(plan: TripPlan): string {
  const loc = plan.location?.trim();
  if (loc) return loc.split(",")[0]?.trim() || loc;
  return plan.title?.trim() || "Trip";
}

function formatWhen(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function BookingChecklist({
  tripId,
  plan,
  hotel,
  initialTasks,
  canEdit,
}: {
  tripId: string;
  plan: TripPlan;
  hotel: HotelPick | null;
  initialTasks: BookingTasksState;
  canEdit: boolean;
}) {
  const city = cityQuery(plan);
  const [tasks, setTasks] = useState<BookingTasksState>(initialTasks);
  const [busy, setBusy] = useState<BookingTaskKey | null>(null);

  const hotelUrl =
    hotel?.bookingUrl ||
    `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}`;

  const flightsUrl = `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights to ${city}`)}`;
  const diningUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`restaurants ${city}`)}`;

  const toggle = useCallback(
    async (task: BookingTaskKey, nextBooked: boolean) => {
      if (!canEdit) return;
      setBusy(task);
      try {
        const r = await fetch(`/api/trip-plans/${tripId}/booking-tasks`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task, booked: nextBooked }),
        });
        const j = (await r.json().catch(() => ({}))) as {
          booking_tasks?: BookingTasksState;
          error?: string;
        };
        if (!r.ok) {
          console.error(j.error || "Update failed");
          return;
        }
        if (j.booking_tasks) setTasks(j.booking_tasks);
      } finally {
        setBusy(null);
      }
    },
    [canEdit, tripId]
  );

  const rows: {
    key: BookingTaskKey;
    title: string;
    description: string;
    actionLabel: string;
    href: string;
    external: boolean;
  }[] = [
    {
      key: "hotel",
      title: "Hotel",
      description: hotel
        ? `Winner: ${hotel.name}${hotel.priceHint ? ` · ${hotel.priceHint}` : ""}`
        : "Book your stay for the voted dates.",
      actionLabel: "Book now",
      href: hotelUrl,
      external: true,
    },
    {
      key: "flights",
      title: "Flights",
      description: "Search routes to your destination.",
      actionLabel: "Search flights",
      href: flightsUrl,
      external: true,
    },
    {
      key: "restaurant",
      title: "Restaurant reservation",
      description: "Find a table for the group.",
      actionLabel: "Find restaurants",
      href: diningUrl,
      external: true,
    },
  ];

  return (
    <div className="space-y-4">
      {!canEdit ? (
        <p className="rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-4 py-3 text-sm text-[color:var(--on-surface-variant)] dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-400">
          You&apos;re viewing this checklist as a guest. Sign in as the trip owner to mark items booked.
        </p>
      ) : null}

      <ul className="space-y-4">
        {rows.map((row) => {
          const t = tasks[row.key];
          const booked = t?.booked === true;
          return (
            <li
              key={row.key}
              className="rounded-2xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] p-5 shadow-[var(--shadow-ambient-sm)] dark:border-white/10 dark:bg-dm-card dark:shadow-none"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-display text-lg font-semibold text-[color:var(--on-surface)] dark:text-neutral-100">{row.title}</p>
                  <p className="mt-1 text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">{row.description}</p>
                  {booked && (t?.bookedBy || t?.bookedAt) ? (
                    <p className="mt-2 text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                      Marked booked{t?.bookedBy ? ` by ${t.bookedBy}` : ""}
                      {t?.bookedAt ? ` · ${formatWhen(t.bookedAt)}` : ""}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                  <a
                    href={row.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex justify-center rounded-lg bg-[#1c1c17] px-4 py-2.5 text-center text-sm font-medium tracking-wide text-[color:var(--surface)] shadow-[var(--shadow-ambient-sm)] transition hover:bg-[#2a2a26] dark:border dark:border-white/10 dark:bg-dm-elevated dark:text-indigo-200 dark:hover:bg-dm-page"
                  >
                    {row.actionLabel}
                  </a>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-300">
                    <input
                      type="checkbox"
                      checked={booked}
                      disabled={!canEdit || busy === row.key}
                      onChange={(e) => void toggle(row.key, e.target.checked)}
                      className="h-4 w-4 rounded border-[color:var(--hairline-strong)] accent-[#1c1c17] dark:border-white/20"
                    />
                    <span>{busy === row.key ? "Saving…" : "Mark as booked"}</span>
                  </label>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
