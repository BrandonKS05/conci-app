"use client";

import Image from "next/image";
import Link from "next/link";
import type { ProfileRecentTrip } from "@/shared/user-profile-page";
import { profilePillButtonClass } from "@/frontend/components/profile/profile-section-label";

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
      <div className="relative flex h-full w-full max-w-md flex-col border-l border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] shadow-xl dark:border-white/10 dark:bg-[#1a1a1a]">
        <div className="flex items-center justify-between border-b border-[color:var(--hairline)] px-5 py-4 dark:border-white/10">
          <h2 className="font-display text-lg font-semibold text-[color:var(--on-surface)] dark:text-[#ebe9e4]">Trips</h2>
          <button type="button" onClick={onClose} className={profilePillButtonClass}>
            Close
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto px-5 py-4">
          {trips.length === 0 ? (
            <li className="py-8 text-center text-sm text-[color:var(--on-surface-variant)] dark:text-[#9c9a96]">
              No trips yet.
            </li>
          ) : (
            trips.map((trip) => (
              <li key={trip.id} className="border-b border-[color:var(--hairline)] py-3 last:border-0 dark:border-white/5">
                <Link href={`/trip/${trip.id}/setup`} className="flex gap-3 hover:opacity-90" onClick={onClose}>
                  <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-[color:var(--surface-container-high)] dark:bg-[#222]">
                    {trip.coverImageUrl ? (
                      <Image src={trip.coverImageUrl} alt="" fill className="object-cover" unoptimized />
                    ) : (
                      <span className="flex h-full items-center justify-center text-xs text-[color:var(--on-surface-muted)] dark:text-[#6b6965]">
                        Trip
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-[color:var(--on-surface)] dark:text-[#ebe9e4]">{trip.title}</p>
                    <p className="text-xs text-[color:var(--on-surface-variant)] dark:text-[#9c9a96]">{trip.datesLabel}</p>
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
