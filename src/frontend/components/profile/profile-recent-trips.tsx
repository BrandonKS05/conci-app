"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import type { ProfileRecentTrip } from "@/shared/user-profile-page";

function SectionIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
      {children}
    </span>
  );
}

export function ProfileRecentTripsSection({
  trips,
  isSelf,
  recentTripsPublic,
}: {
  trips: ProfileRecentTrip[];
  isSelf: boolean;
  recentTripsPublic: boolean;
}) {
  if (!isSelf && trips.length === 0) return null;

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SectionIcon>
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 10h14M10 3v14" strokeLinecap="round" />
            </svg>
          </SectionIcon>
          <h2 className="font-display text-xl font-semibold text-neutral-900 dark:text-white">Recently joined trips</h2>
        </div>
        <Link
          href={isSelf ? "/joined-trips" : "#"}
          className="text-sm font-semibold text-[#2563EB] hover:underline dark:text-[#60A5FA]"
        >
          View all trips
        </Link>
      </div>

      {isSelf && !recentTripsPublic ? (
        <p className="mb-3 rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-600 dark:bg-white/5 dark:text-neutral-400">
          Hidden on your public profile — only you can see this section.
        </p>
      ) : null}

      {trips.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-200 px-4 py-8 text-center text-sm text-neutral-500 dark:border-white/10">
          Join a trip with an invite code to see it here.
        </p>
      ) : (
        <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
          {trips.map((trip) => (
            <Link
              key={trip.id}
              href={`/trip/${trip.id}/setup`}
              className="w-[min(85vw,260px)] shrink-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition hover:border-neutral-300 dark:border-white/10 dark:bg-[#1a1a1a]"
            >
              <div className="relative h-32 bg-neutral-100 dark:bg-neutral-800">
                {trip.coverImageUrl ? (
                  <Image src={trip.coverImageUrl} alt="" fill className="object-cover" unoptimized />
                ) : (
                  <span className="flex h-full items-center justify-center text-sm text-neutral-400">Destination</span>
                )}
              </div>
              <div className="p-4">
                <p className="font-semibold text-neutral-900 dark:text-white">{trip.title}</p>
                <p className="mt-0.5 text-xs text-neutral-500">{trip.datesLabel}</p>
                {trip.memberInitials.length > 0 ? (
                  <ul className="mt-3 flex -space-x-2">
                    {trip.memberInitials.slice(0, 4).map((init, i) => (
                      <li
                        key={`${init}-${i}`}
                        className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-neutral-200 text-[10px] font-semibold dark:border-[#1a1a1a] dark:bg-neutral-700"
                      >
                        {init}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
