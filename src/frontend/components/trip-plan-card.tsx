import Image from "next/image";
import { formatBudgetPollChipLabel } from "@/shared/budget-poll";
import type { TripPlan } from "@/shared/trip-plan";
import { InviteCodeRow } from "@/frontend/components/invite-code-row";
import { TripPlanShareButton } from "@/frontend/components/trip-plan-share-button";

function travelersCountLabel(n: number): string {
  return `${n} traveler${n === 1 ? "" : "s"}`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((chunk) => chunk[0]?.toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join("");
}

export function TripPlanCard({
  plan,
  badge = "✦ Plan",
  showShare = false,
  /** SMS-verified travelers on this trip (invite + phone verify); not AI-inferred names. */
  guestJoinNames,
  dateVoteTallies,
  viewerDateVote,
  inviteCode,
  hideOpenDecisions = false,
  showInviteRow = true,
  /** Use larger invite styling (trip host summary). */
  inviteCodeProminent = false,
  hideSpotlightsSection = false,
}: {
  plan: TripPlan;
  badge?: string;
  /** When true, shows Share in the card header (e.g. public /trip/[id] page). */
  showShare?: boolean;
  /** Verified travelers (invite + phone); shown as name chips. Plan headcount stays in `plan.people.count`. */
  guestJoinNames?: string[];
  /** Vote counts per date option (from anonymous voters). */
  dateVoteTallies?: Record<string, number>;
  /** Highlight which date the current visitor voted for (shared link only). */
  viewerDateVote?: string | null;
  /** Stored 6-character invite code (shown as AAA-BBB). */
  inviteCode?: string | null;
  /** Hide the read-only open-decisions list (collaboration UI shows them below). */
  hideOpenDecisions?: boolean;
  /** When false, omit the invite strip inside this card. */
  showInviteRow?: boolean;
  inviteCodeProminent?: boolean;
  /** Trip page: spotlights rendered in interactive panel instead. */
  hideSpotlightsSection?: boolean;
}) {
  const verifiedNames = guestJoinNames ?? [];
  const count = plan.people.count;
  const othersCount =
    count != null && count > 0 ? Math.max(0, count - verifiedNames.length) : 0;

  return (
    <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">{plan.title || "Untitled trip plan"}</h2>
          <p className="text-sm text-slate-600 dark:text-neutral-400">{plan.location || "Location TBD"}</p>
          {plan.departureCity ? (
            <p className="text-sm text-slate-500 dark:text-neutral-500">Departing from {plan.departureCity}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showShare ? <TripPlanShareButton /> : null}
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:border-white/10 dark:bg-white/5 dark:text-neutral-300">
            {badge}
          </span>
        </div>
      </header>

      {inviteCode && showInviteRow ? (
        <div className="pt-1">
          <InviteCodeRow rawCode={inviteCode} prominent={inviteCodeProminent} />
        </div>
      ) : null}

      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-500">Dates</p>
          {plan.dates.confirmed ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/50 dark:text-emerald-200"
              title="Trip owner confirmed these dates for the group"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Confirmed
            </span>
          ) : null}
        </div>
        {plan.dates.options.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {plan.dates.options.map((date) => {
              const tally = dateVoteTallies?.[date] ?? 0;
              const isViewerPick = viewerDateVote != null && viewerDateVote === date;
              return (
                <span
                  key={date}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    isViewerPick
                      ? "border-indigo-400 bg-indigo-50 font-medium text-indigo-900 ring-2 ring-indigo-200 dark:border-indigo-500/50 dark:bg-indigo-950/50 dark:text-indigo-100 dark:ring-indigo-500/30"
                      : "border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-300"
                  }`}
                >
                  {date}
                  {tally > 0 ? (
                    <span className="text-slate-500 dark:text-neutral-500">
                      {" "}
                      · {tally} vote{tally === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </span>
              );
            })}
          </div>
        ) : (
          <span className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-sm text-slate-500 dark:border-white/20 dark:text-neutral-500">
            TBD
          </span>
        )}
      </section>

      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-500">
          People
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {count != null && count > 0 ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-800 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-200">
              {travelersCountLabel(count)}
            </span>
          ) : null}
          {verifiedNames.map((name, idx) => (
            <div
              key={`${name}-${idx}`}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1 dark:border-white/10 dark:bg-dm-elevated"
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white dark:bg-neutral-200 dark:text-dm-page">
                {initials(name)}
              </span>
              <span className="text-sm text-slate-700 dark:text-neutral-300">{name}</span>
            </div>
          ))}
          {othersCount > 0 && verifiedNames.length > 0 ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-600 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-400">
              +{othersCount} not joined yet
            </span>
          ) : null}
          {(count == null || count <= 0) && verifiedNames.length === 0 ? (
            <span className="text-sm text-slate-500 dark:text-neutral-500">People TBD</span>
          ) : null}
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300">
          {plan.budget.tier || "budget TBD"}
        </span>
        <span className="text-sm text-slate-600 dark:text-neutral-400">
          {plan.budget.perPerson || "Per-person estimate TBD"}
        </span>
      </section>

      {!hideSpotlightsSection && plan.spotlights && plan.spotlights.length > 0 ? (
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-500">
            Picked places
          </p>
          <ul className="space-y-3">
            {plan.spotlights.map((s, idx) => (
              <li key={`${s.mapsUrl}-${idx}`}>
                <a
                  href={s.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/80 text-left ring-1 ring-slate-200/60 transition hover:border-indigo-300 hover:ring-indigo-200/40 dark:border-white/10 dark:bg-dm-elevated dark:ring-white/[0.04] dark:hover:border-indigo-500/40"
                >
                  {s.photoUrl ? (
                    <Image
                      src={s.photoUrl}
                      alt=""
                      width={112}
                      height={112}
                      unoptimized
                      className="h-24 w-24 shrink-0 object-cover sm:h-28 sm:w-28"
                    />
                  ) : (
                    <div className="flex h-24 w-24 shrink-0 items-center justify-center bg-slate-200 text-xs text-slate-500 dark:bg-white/10 dark:text-neutral-500 sm:h-28 sm:w-28">
                      Map
                    </div>
                  )}
                  <div className="min-w-0 flex-1 p-3">
                    <p className="font-semibold text-slate-900 dark:text-white">{s.name}</p>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-neutral-400">
                      {s.rating != null ? (
                        <>
                          <span className="font-medium text-amber-700 dark:text-amber-400">{s.rating.toFixed(1)}</span> ★
                        </>
                      ) : null}
                      {s.reviewCount != null ? (
                        <span className="text-slate-500 dark:text-neutral-500"> · {s.reviewCount.toLocaleString()} reviews</span>
                      ) : null}
                      {s.priceRange ? (
                        <span className="text-slate-600 dark:text-neutral-400"> · {s.priceRange}</span>
                      ) : null}
                    </p>
                    {s.address ? <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-neutral-400">{s.address}</p> : null}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-500">
          Vibe
        </p>
        <div className="flex flex-wrap gap-2">
          {plan.vibe.length ? (
            plan.vibe.map((tag, idx) => (
              <span
                key={tag}
                className={`rounded-full px-3 py-1 text-sm ${
                  idx % 3 === 0
                    ? "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300"
                    : idx % 3 === 1
                      ? "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
                      : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                }`}
              >
                {tag}
              </span>
            ))
          ) : (
            <span className="text-sm text-slate-500 dark:text-neutral-500">No vibe tags yet</span>
          )}
        </div>
      </section>

      {(() => {
        const pollRows = [
          ["Destination", plan.polls?.destinations],
          ["Food & venues", plan.polls?.venues],
          ["Activities", plan.polls?.activities],
          ["Vibe", plan.polls?.vibePick],
          ["Budget bands", plan.polls?.budgetPick],
          ["Transport", plan.polls?.transport],
        ] as const;
        return plan.polls && pollRows.some(([, xs]) => xs && xs.length > 0) ? (
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-500">
            Group votes (≤ 3 options each)
          </p>
          <ul className="space-y-3 text-sm text-slate-700 dark:text-neutral-300">
            {pollRows.map(([label, xs]) =>
              xs && xs.length ? (
                <li key={label}>
                  <span className="font-medium text-slate-900 dark:text-neutral-100">{label}</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {xs.map((chip) => (
                      <span
                        key={`${label}-${chip}`}
                        className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-xs dark:border-violet-500/40 dark:bg-violet-950/40 dark:text-violet-200"
                      >
                        {label === "Budget bands" ? formatBudgetPollChipLabel(chip) : chip}
                      </span>
                    ))}
                  </div>
                </li>
              ) : null
            )}
          </ul>
        </section>
        ) : null;
      })()}

      {!hideOpenDecisions ? (
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-500">
            Open decisions
          </p>
          {plan.openDecisions.length ? (
            <ul className="space-y-2">
              {plan.openDecisions.map((decision) => (
                <li
                  key={decision}
                  className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-neutral-200"
                >
                  {decision}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 dark:text-neutral-500">No open decisions detected.</p>
          )}
        </section>
      ) : null}

      <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 dark:border-white/10 dark:bg-dm-elevated">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-neutral-400">Next step</p>
        <p className="mt-1 text-sm font-medium text-indigo-900 dark:text-neutral-100">
          {plan.nextStep || "Pick the first unresolved decision."}
        </p>
      </section>
    </div>
  );
}
