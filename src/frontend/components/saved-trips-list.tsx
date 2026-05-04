"use client";

import Image from "next/image";
import Link from "next/link";
import { primaryFormButtonClass } from "@/frontend/ui/primary-action";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type SavedTripListItem = {
  id: string;
  createdAt: string;
  title: string;
  location: string | null;
  datesLabel: string;
  vibes: string[];
  /** Hero image for the destination (plan place photo or resolved Wikipedia thumb). */
  coverImageUrl?: string | null;
  /** When `draft`, the View link routes to host setup (`/trip/.../setup`). */
  lifecycleStatus?: "draft" | "voting" | "finalized";
};

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}

function formatCreated(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function SavedTripsList({
  initialTrips,
  showDelete = true,
}: {
  initialTrips: SavedTripListItem[];
  /** Host-only: joined trips omit delete. */
  showDelete?: boolean;
}) {
  const router = useRouter();
  const [trips, setTrips] = useState(initialTrips);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const confirmingTrip = confirmId ? trips.find((t) => t.id === confirmId) : null;

  async function confirmDelete() {
    if (!confirmId) return;
    setError(null);
    setBusyId(confirmId);
    try {
      const res = await fetch(`/api/trip-plans/${confirmId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
      if (!res.ok) {
        setError(
          [body.error, body.detail].filter((x): x is string => typeof x === "string" && x.length > 0).join(" ") ||
            "Could not delete trip."
        );
        setBusyId(null);
        return;
      }
      setTrips((prev) => prev.filter((t) => t.id !== confirmId));
      setConfirmId(null);
      router.refresh();
    } catch {
      setError("Could not delete trip. Check your connection.");
    } finally {
      setBusyId(null);
    }
  }

  if (trips.length === 0) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
        <p className="font-display text-lg font-semibold text-slate-900 dark:text-white">No saved trips yet</p>
        <p className="mt-2 text-sm text-slate-600 dark:text-neutral-400">Plans you create and save will show up here.</p>
        <Link href="/trip-parser" className={`mt-6 ${primaryFormButtonClass}`}>
          Create your first plan
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-center text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <ul className="space-y-4">
        {trips.map((trip) => (
          <li
            key={trip.id}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 dark:border-white/10 dark:bg-dm-card dark:shadow-none dark:hover:border-white/15"
          >
            <div className="flex flex-col sm:flex-row">
              <div className="relative h-44 w-full shrink-0 bg-slate-200 sm:h-auto sm:min-h-[11rem] sm:w-52 md:w-60 dark:bg-white/5">
                {trip.coverImageUrl ? (
                  <Image
                    src={trip.coverImageUrl}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, 240px"
                    unoptimized
                  />
                ) : (
                  <div
                    className="flex h-full min-h-[11rem] items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300 dark:from-white/10 dark:to-white/5"
                    aria-hidden
                  >
                    <span className="text-4xl opacity-90">📍</span>
                  </div>
                )}
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-slate-900/50 to-transparent sm:hidden"
                  aria-hidden
                />
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-5 p-6 sm:flex-row sm:items-start sm:justify-between sm:gap-8 sm:p-7">
                <div className="min-w-0 flex-1 space-y-2">
                  <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
                    {trip.title?.trim() || "Untitled trip"}
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-neutral-400">{trip.location?.trim() || "Location TBD"}</p>
                  <p className="text-sm text-slate-700 dark:text-neutral-300">
                    <span className="font-medium text-slate-500 dark:text-neutral-500">Dates: </span>
                    {trip.datesLabel}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {trip.vibes.length ? (
                      trip.vibes.map((v) => (
                        <span
                          key={v}
                          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-0.5 text-xs font-medium text-slate-700 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-300"
                        >
                          {v}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-neutral-600">No vibe tags</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-neutral-500">Created {formatCreated(trip.createdAt)}</p>
                </div>
                <div className="flex shrink-0 flex-row gap-2 sm:flex-col sm:items-stretch">
                  <Link
                    href={
                      trip.lifecycleStatus === "draft"
                        ? `/trip/${trip.id}/setup`
                        : `/trip/${trip.id}`
                    }
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 dark:border-white/10 dark:bg-dm-elevated dark:text-white dark:hover:bg-dm-page"
                  >
                    {trip.lifecycleStatus === "draft" ? "Finish setup" : "View"}
                  </Link>
                  {showDelete ? (
                    <button
                      type="button"
                      disabled={busyId === trip.id}
                      onClick={() => {
                        setError(null);
                        setConfirmId(trip.id);
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 transition hover:bg-rose-100 disabled:opacity-50 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/60"
                      aria-label="Delete trip"
                    >
                      <TrashIcon className="h-4 w-4" />
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {confirmingTrip ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-trip-title"
          onClick={() => !busyId && setConfirmId(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-dm-card dark:shadow-black/50"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            <h3
              id="delete-trip-title"
              className="font-display text-lg font-semibold leading-snug text-slate-900 dark:text-white"
            >
              Are you sure you want to delete this trip? This cannot be undone.
            </h3>
            <p className="mt-3 text-sm text-slate-600 dark:text-neutral-400">
              <span className="font-medium text-slate-800 dark:text-neutral-200">
                {confirmingTrip.title?.trim() || "Untitled trip"}
              </span>
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => setConfirmId(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-neutral-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => void confirmDelete()}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {busyId ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
