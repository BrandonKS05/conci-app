"use client";

import Image from "next/image";
import Link from "next/link";
import type { ProfileRecentTrip } from "@/shared/user-profile-page";

export function ProfileVisitsDrawer({
  open,
  onClose,
  trips,
}: {
  open: boolean;
  onClose: () => void;
  trips: ProfileRecentTrip[];
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-xl dark:bg-[#1a1a1a]">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-white/10">
          <h2 className="font-display text-lg font-semibold text-neutral-900 dark:text-white">Trips</h2>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/5">
            Close
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto px-5 py-4">
          {trips.length === 0 ? (
            <li className="py-8 text-center text-sm text-neutral-500">No trips yet.</li>
          ) : (
            trips.map((trip) => (
              <li key={trip.id} className="border-b border-neutral-100 py-3 last:border-0 dark:border-white/5">
                <Link href={`/trip/${trip.id}/setup`} className="flex gap-3 hover:opacity-90" onClick={onClose}>
                  <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800">
                    {trip.coverImageUrl ? (
                      <Image src={trip.coverImageUrl} alt="" fill className="object-cover" unoptimized />
                    ) : (
                      <span className="flex h-full items-center justify-center text-xs text-neutral-400">Trip</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-neutral-900 dark:text-white">{trip.title}</p>
                    <p className="text-xs text-neutral-500">{trip.datesLabel}</p>
                  </div>
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
