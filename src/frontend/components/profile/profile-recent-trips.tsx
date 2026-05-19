"use client";

import Image from "next/image";
import Link from "next/link";
import type { ProfileRecentTrip } from "@/shared/user-profile-page";
import { ProfileSectionLabel, profileCardClass } from "@/frontend/components/profile/profile-section-label";

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
        <ProfileSectionLabel>Recently joined trips</ProfileSectionLabel>
        <Link
          href={isSelf ? "/joined-trips" : "#"}
          className="text-sm font-medium text-[color:var(--sage)] hover:underline dark:text-[color:var(--sage-soft)]"
        >
          View all trips
        </Link>
      </div>

      {isSelf && !recentTripsPublic ? (
        <p className="mb-3 rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-3 py-2 text-xs text-[color:var(--on-surface-variant)] dark:border-white/10 dark:bg-white/5 dark:text-[#9c9a96]">
          Hidden on your public profile — only you can see this section.
        </p>
      ) : null}

      {trips.length === 0 ? (
        <p className={`${profileCardClass} border-dashed px-4 py-8 text-center text-sm text-[color:var(--on-surface-variant)] dark:text-[#9c9a96]`}>
          Join a trip with an invite code to see it here.
        </p>
      ) : (
        <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
          {trips.map((trip) => (
            <Link
              key={trip.id}
              href={`/trip/${trip.id}/setup`}
              className={`w-[min(85vw,260px)] shrink-0 overflow-hidden transition hover:border-[color:var(--sage)]/45 ${profileCardClass}`}
            >
              <div className="relative h-32 bg-[color:var(--surface-container-high)] dark:bg-[#222]">
                {trip.coverImageUrl ? (
                  <Image src={trip.coverImageUrl} alt="" fill className="object-cover" unoptimized />
                ) : (
                  <span className="flex h-full items-center justify-center text-sm text-[color:var(--on-surface-muted)] dark:text-[#6b6965]">
                    Destination
                  </span>
                )}
              </div>
              <div className="p-4">
                <p className="font-display text-lg font-semibold leading-tight tracking-tight text-[color:var(--on-surface)] dark:text-[#ebe9e4]">
                  {trip.title}
                </p>
                <p className="mt-0.5 text-xs text-[color:var(--on-surface-variant)] dark:text-[#9c9a96]">{trip.datesLabel}</p>
                {trip.memberInitials.length > 0 ? (
                  <ul className="mt-3 flex -space-x-2">
                    {trip.memberInitials.slice(0, 4).map((init, i) => (
                      <li
                        key={`${init}-${i}`}
                        className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[color:var(--surface-container-lowest)] bg-[color:var(--surface-container-high)] text-[10px] font-semibold text-[color:var(--on-surface)] dark:border-[#1a1a1a] dark:bg-[#2a2a2a] dark:text-[#ebe9e4]"
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
