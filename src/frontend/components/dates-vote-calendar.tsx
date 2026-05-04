"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { primaryFilledInteractive } from "@/frontend/ui/primary-action";
import {
  aggregatedTallyForBallotOption,
  buildParsedDateOptions,
  earliestParsedDay,
  formatBallotProposalHeading,
  formatLocalIsoDate,
  formatLocalIsoRangeVote,
  inferDefaultYearFromDateOptions,
  latestParsedDay,
  listCustomVotesOutsideHostSuggestions,
  localDayTime,
  parseDateOptionToRange,
  startOfLocalDay,
  tallyDateStringVotes,
} from "@/shared/date-option-parse";

/** Native date controls — `react-datepicker` inline range was failing to render in production (blank UI). */
const dateInputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-orange-500/50 dark:border-white/10 dark:bg-[#161616] dark:text-[#ebe9e4]";

export function DatesVoteCalendar({
  decisionKey,
  options,
  votes,
  mine,
  busy,
  quorum,
  voterN,
  onVote,
  /** When set (e.g. vague “Late July” as the only line), hide chip votes for unparseable ballot text so members must pick a concrete range on the calendar. */
  hideUnmappedBallotChips = false,
  embeddedUnderHostProposal = false,
}: {
  decisionKey: string;
  options: string[];
  votes: Record<string, unknown>;
  mine: string | null;
  busy: boolean;
  quorum: number;
  voterN: number;
  onVote: (p: Record<string, unknown>) => void;
  hideUnmappedBallotChips?: boolean;
  /** Shorter copy when nested under the host’s single concrete date card */
  embeddedUnderHostProposal?: boolean;
}) {
  const fallbackCalendarYear = new Date().getFullYear();
  const y0 = useMemo(
    () => inferDefaultYearFromDateOptions(options, fallbackCalendarYear),
    [options, fallbackCalendarYear]
  );
  const parsed = useMemo(() => buildParsedDateOptions(options, fallbackCalendarYear), [options, fallbackCalendarYear]);
  const unmapped = useMemo(
    () => options.filter((o) => !parsed.some((p) => p.option === o)),
    [options, parsed]
  );
  const tally = useMemo(() => tallyDateStringVotes(votes, options), [votes, options]);

  const minNav = useMemo(() => {
    const today0 = localDayTime(startOfLocalDay(new Date()));
    const back = today0 - 14 * 86400000;
    const e = earliestParsedDay(parsed);
    if (!e) return new Date(back);
    return new Date(Math.min(back, localDayTime(e) - 30 * 86400000));
  }, [parsed]);

  const maxNav = useMemo(() => {
    const today0 = localDayTime(startOfLocalDay(new Date()));
    const forward = today0 + 540 * 86400000;
    const l = latestParsedDay(parsed);
    if (!l) return new Date(forward);
    return new Date(Math.max(forward, localDayTime(l) + 120 * 86400000));
  }, [parsed]);

  const minIso = formatLocalIsoDate(minNav);
  const maxIso = formatLocalIsoDate(maxNav);

  const [nativeStart, setNativeStart] = useState("");
  const [nativeEnd, setNativeEnd] = useState("");

  const cast = (option: string) => {
    onVote({ decisionKey, kind: "dates", option });
  };

  /** Sync inputs when vote loads from collab — don’t clear when mine is empty (avoids wiping a selection before POST returns). */
  useEffect(() => {
    const m = mine?.trim() ?? "";
    if (!m) return;
    const r = parseDateOptionToRange(m, y0);
    if (!r) return;
    setNativeStart(formatLocalIsoDate(r.start));
    setNativeEnd(formatLocalIsoDate(r.end));
  }, [mine, y0]);

  function tryCastNativeRange(startStr: string, endStr: string) {
    if (busy || !startStr || !endStr || endStr < startStr) return;
    const start = new Date(`${startStr}T12:00:00`);
    const end = new Date(`${endStr}T12:00:00`);
    const canon = formatLocalIsoRangeVote(start, end);
    if (canon === (mine?.trim() ?? "")) return;
    cast(canon);
  }

  const rangeSummaries = useMemo(() => {
    const hostRows = parsed.map(({ option, start, end }) => ({
      key: option,
      label: `${start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
      votes: aggregatedTallyForBallotOption(option, parsed, tally, y0),
    }));
    const customRows = listCustomVotesOutsideHostSuggestions(tally, parsed, options, y0).map((r) => ({
      key: r.key,
      label: r.label,
      votes: r.votes,
    }));
    return [...hostRows, ...customRows];
  }, [parsed, tally, options, y0]);

  const rangeSummariesWithVotes = useMemo(
    () => rangeSummaries.filter((r) => r.votes > 0),
    [rangeSummaries]
  );

  return (
    <div className="space-y-4">
      {hideUnmappedBallotChips && !(mine ?? "").trim() ? (
        <p className="rounded-xl border border-amber-200/90 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/45 dark:bg-amber-950/35 dark:text-amber-100">
          The host suggested a loose timing window — choose a start and end date below.
          Your vote submits when both are set.
        </p>
      ) : null}
      <p className="text-sm text-slate-600 dark:text-neutral-400">
        {embeddedUnderHostProposal ? (
          <>
            Pick a start and end date below (same day twice = one-day trip). Your vote saves as soon as both are set.
            Group needs {voterN}/{quorum}+ votes to lock.
          </>
        ) : hideUnmappedBallotChips ? (
          <>
            Choose start and end dates below (same day for a single-night trip). Your vote saves when both fields are set.
            Group needs {voterN}/{quorum}+ votes to lock.
          </>
        ) : (
          <>
            Votes: {voterN}/{quorum}+ to lock. Set start and end dates below (both inclusive; use one day twice for a
            one-day trip).
          </>
        )}
      </p>

      <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-4 dark:border-white/10 dark:bg-dm-elevated/50">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-slate-600 dark:text-neutral-400">
            Start
            <input
              type="date"
              className={dateInputClass}
              min={minIso}
              max={maxIso}
              disabled={busy}
              value={nativeStart}
              onChange={(e) => {
                const v = e.target.value;
                setNativeStart(v);
                tryCastNativeRange(v, nativeEnd);
              }}
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-slate-600 dark:text-neutral-400">
            End <span className="font-normal text-slate-400">(same as start for one day)</span>
            <input
              type="date"
              className={dateInputClass}
              min={nativeStart ? nativeStart : minIso}
              max={maxIso}
              disabled={busy}
              value={nativeEnd}
              onChange={(e) => {
                const v = e.target.value;
                setNativeEnd(v);
                tryCastNativeRange(nativeStart, v);
              }}
            />
          </label>
        </div>

        {rangeSummariesWithVotes.length > 0 ? (
          <ul className="mt-4 max-w-[20rem] space-y-1.5 border-t border-slate-200 pt-3 dark:border-white/10 sm:mx-auto">
            {rangeSummariesWithVotes.map(({ key, label, votes: v }) => (
              <li key={key} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="min-w-0 text-slate-600 dark:text-neutral-400">{label}</span>
                <span className="shrink-0 tabular-nums text-slate-800 dark:text-neutral-200">
                  {v} {v === 1 ? "vote" : "votes"}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {unmapped.length > 0 && !hideUnmappedBallotChips ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3 dark:border-amber-900/40 dark:bg-amber-950/30">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200/90">
            Also on the ballot
          </p>
          <p className="mt-1 text-xs text-amber-950/90 dark:text-amber-100/85">
            These choices couldn&apos;t be placed on the calendar automatically — use a button to vote.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {unmapped.map((opt) => (
              <button
                key={opt}
                type="button"
                disabled={busy}
                onClick={() => cast(opt)}
                className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition disabled:opacity-50 ${
                  mine === opt
                    ? "border-indigo-500 bg-indigo-50 text-indigo-950 ring-2 ring-indigo-200 dark:border-indigo-400 dark:bg-indigo-950/50 dark:text-indigo-100 dark:ring-indigo-500/30"
                    : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 dark:border-white/10 dark:bg-dm-card dark:text-neutral-200 dark:hover:border-white/15"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {parsed.length === 0 && unmapped.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-neutral-400">
          No date suggestions on the ballot — pick any range with the dates above.
        </p>
      ) : null}

      <ul className="sr-only" aria-label="Vote totals">
        {rangeSummariesWithVotes.map(({ key, label, votes: v }) => (
          <li key={`sr-${key}`}>
            {v} {v === 1 ? "vote" : "votes"}: {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CalendarGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="currentColor" strokeWidth="2" />
      <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Case 1: Single concrete host date — show proposal, “Works for me” vs scroll-to calendar for an alternate range.
 * The calendar stays on-screen at all times (never fully hidden).
 */
export function DatesSingleProposalMemberVote({
  decisionKey,
  options,
  votes,
  mine,
  busy,
  quorum,
  voterN,
  onVote,
}: {
  decisionKey: string;
  options: string[];
  votes: Record<string, unknown>;
  mine: string | null;
  busy: boolean;
  quorum: number;
  voterN: number;
  onVote: (p: Record<string, unknown>) => void;
}) {
  const proposalRaw = options[0]!;
  const proposalNorm = proposalRaw.trim();
  const calRef = useRef<HTMLDivElement>(null);
  const [highlightCalendar, setHighlightCalendar] = useState(false);

  const fallbackCalendarYear = new Date().getFullYear();
  const y0 = useMemo(
    () => inferDefaultYearFromDateOptions(options, fallbackCalendarYear),
    [options, fallbackCalendarYear]
  );
  const heading = useMemo(() => formatBallotProposalHeading(proposalRaw, y0), [proposalRaw, y0]);

  const mineTrim = mine?.trim() ?? "";
  const votedForProposal = mineTrim.length > 0 && mineTrim === proposalNorm;

  const nudgeAlternativeCalendar = () => {
    calRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlightCalendar(true);
    window.setTimeout(() => setHighlightCalendar(false), 2200);
  };

  const castWorksForMe = () => {
    onVote({ decisionKey, kind: "dates", option: proposalRaw });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-indigo-200/80 bg-indigo-50/60 px-5 py-4 dark:border-indigo-500/30 dark:bg-indigo-950/25">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-800 dark:text-indigo-300">
          Host proposed trip dates
        </p>
        <p className="mt-3 font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-neutral-100 sm:text-3xl">
          {heading}
        </p>
      </div>

      <p className="text-sm text-slate-700 dark:text-neutral-300">
        Tap <strong className="font-semibold text-slate-900 dark:text-neutral-100">Works for me</strong> to vote yes on
        the host&apos;s dates, or choose a different start and end below. Your vote is required — you can&apos;t skip
        availability.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <button
          type="button"
          disabled={busy}
          onClick={() => castWorksForMe()}
          className={`rounded-full px-6 py-2.5 text-sm transition disabled:opacity-50 ${
            votedForProposal
              ? `${primaryFilledInteractive} ring-2 ring-slate-400 dark:ring-[#d4d2cd]`
              : "border border-slate-200 bg-white font-semibold text-slate-900 hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-dm-card dark:text-neutral-100 dark:hover:border-white/25 dark:hover:bg-white/5"
          }`}
        >
          Works for me
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={nudgeAlternativeCalendar}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-300 disabled:opacity-50 dark:border-white/10 dark:bg-dm-card dark:text-neutral-200 dark:hover:border-white/20"
          aria-controls="dates-member-alternate-range"
        >
          <CalendarGlyph className="shrink-0 opacity-70" />
          Suggest different dates
        </button>
      </div>

      <p className="text-sm text-slate-600 dark:text-neutral-400">
        The date fields are below — selecting a range replaces your vote with that availability window.
      </p>

      <div
        id="dates-member-alternate-range"
        ref={calRef}
        tabIndex={-1}
        className={`rounded-2xl outline-none transition-shadow duration-300 ${
          highlightCalendar
            ? "ring-2 ring-indigo-500 ring-offset-2 ring-offset-white dark:ring-indigo-400 dark:ring-offset-dm-card"
            : ""
        }`}
      >
        <DatesVoteCalendar
          decisionKey={decisionKey}
          options={options}
          votes={votes}
          mine={mine}
          busy={busy}
          quorum={quorum}
          voterN={voterN}
          onVote={onVote}
          embeddedUnderHostProposal
        />
      </div>

      <p className="text-xs text-slate-500 dark:text-neutral-500">
        {mineTrim ? (
          <>
            Your availability is recorded. The host may confirm the locked date once there are enough votes, or sooner if
            needed.
          </>
        ) : (
          <>
            Waiting on your vote ({voterN}/{quorum}+ toward locking once everyone submits). Voting feeds the same tally the
            host uses to finalize.
          </>
        )}
      </p>
    </div>
  );
}

