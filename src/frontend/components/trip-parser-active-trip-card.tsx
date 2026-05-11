import Link from "next/link";

export type ActiveTripCardData = {
  tripId: string;
  title: string;
  datesLabel: string;
  /** "3 Days Left" / "Active" / "Upcoming" / "Past" — derived on the server. */
  statusChip: string;
  /** Up to 3 initials. */
  memberInitials: string[];
};

/**
 * Compact preview of the user's most recent in-progress trip on the LUMINA-style home.
 * Renders nothing when there's no trip — never hardcodes data.
 */
export function TripParserActiveTripCard({ data }: { data: ActiveTripCardData | null }) {
  if (!data) return null;
  return (
    <Link
      href={`/trip/${data.tripId}/setup`}
      className="group relative flex h-full flex-col gap-5 rounded-2xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] px-6 py-6 shadow-[var(--shadow-ambient-sm)] transition hover:border-[color:var(--sage)]/45 hover:shadow-[var(--shadow-ambient)] dark:border-white/10 dark:bg-[#1a1a1a]/90"
      aria-label={`Open ${data.title}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">
          <MapPinSparkleIcon className="h-3.5 w-3.5" />
          Active
        </span>
        {data.statusChip ? (
          <span className="rounded-full border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-3 py-0.5 text-[10px] font-medium tracking-wide text-[color:var(--on-surface-variant)] dark:border-white/10 dark:bg-white/5 dark:text-[#c4c2be]">
            {data.statusChip}
          </span>
        ) : null}
      </div>

      <div className="flex-1">
        <h3 className="font-display text-2xl font-semibold leading-[1.1] tracking-[-0.02em] text-[color:var(--on-surface)] dark:text-[#ebe9e4] sm:text-[1.6rem]">
          {data.title}
        </h3>
        {data.datesLabel ? (
          <p className="mt-1.5 text-sm text-[color:var(--on-surface-variant)] dark:text-[#9c9a96]">
            {data.datesLabel}
          </p>
        ) : null}
      </div>

      <div className="flex items-end justify-between gap-3">
        {data.memberInitials.length > 0 ? (
          <ul className="flex -space-x-2" aria-label="Trip members">
            {data.memberInitials.slice(0, 3).map((initial, idx) => (
              <li
                key={`${initial}-${idx}`}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--surface)] bg-[color:var(--surface-container-high)] text-[10px] font-semibold uppercase text-[color:var(--on-surface)] dark:border-[#1a1a1a] dark:bg-[#2a2a2a] dark:text-[#ebe9e4]"
              >
                {initial}
              </li>
            ))}
          </ul>
        ) : (
          <span />
        )}
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] text-[color:var(--on-surface)] transition group-hover:border-[color:var(--sage)] group-hover:bg-[color:var(--surface-container-low)] dark:border-white/15 dark:bg-[#252525] dark:text-[#ebe9e4]">
          <ArrowRightIcon className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}

function MapPinSparkleIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M10 17.5s-5.25-4.4-5.25-9.1A5.25 5.25 0 0 1 10 3.15a5.25 5.25 0 0 1 5.25 5.25c0 4.7-5.25 9.1-5.25 9.1Z" />
      <circle cx="10" cy="8.4" r="1.6" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M4.5 10h11" />
      <path d="m11 5.5 4.5 4.5L11 14.5" />
    </svg>
  );
}
