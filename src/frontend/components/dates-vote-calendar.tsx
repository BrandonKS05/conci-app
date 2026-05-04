"use client";

import { useEffect, useMemo, useState } from "react";
import DatePicker from "react-datepicker";
import type { ReactDatePickerCustomHeaderProps } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import {
  aggregatedTallyForBallotOption,
  buildParsedDateOptions,
  earliestParsedDay,
  formatBallotProposalHeading,
  formatLocalIsoDate,
  formatLocalIsoRangeVote,
  inferDefaultYearFromDateOptions,
  inferCalendarOpenDateFromDateOptions,
  isDayInRange,
  latestParsedDay,
  listCustomVotesOutsideHostSuggestions,
  localDayTime,
  parseDateOptionToRange,
  startOfLocalDay,
  tallyDateStringVotes,
  votesCoveringCalendarDay,
} from "@/shared/date-option-parse";
import "./dates-vote-calendar.css";

function RangePickerHeader({
  monthDate,
  decreaseMonth,
  increaseMonth,
  prevMonthButtonDisabled,
  nextMonthButtonDisabled,
}: ReactDatePickerCustomHeaderProps) {
  return (
    <div className="conci-datepicker-custom-header">
      <span className="conci-datepicker-month-title">
        {monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
      </span>
      <div className="conci-datepicker-nav">
        <button
          type="button"
          className="conci-datepicker-nav-btn"
          aria-label="Previous month"
          disabled={prevMonthButtonDisabled}
          onClick={decreaseMonth}
        >
          ‹
        </button>
        <button
          type="button"
          className="conci-datepicker-nav-btn"
          aria-label="Next month"
          disabled={nextMonthButtonDisabled}
          onClick={increaseMonth}
        >
          ›
        </button>
      </div>
    </div>
  );
}

export function DatesVoteCalendar({
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

  const [rangeDraft, setRangeDraft] = useState<[Date | null, Date | null]>([null, null]);

  const calendarOpenDate = useMemo(
    () => inferCalendarOpenDateFromDateOptions(options, fallbackCalendarYear),
    [options, fallbackCalendarYear]
  );

  /** Remount picker when ballot copy changes so month view tracks host’s vague timing (e.g. “late May”). */
  const calendarMountKey = useMemo(
    () => `${options.join("\u001f")}|${formatLocalIsoDate(calendarOpenDate)}`,
    [options, calendarOpenDate]
  );

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

  const cast = (option: string) => {
    onVote({ decisionKey, kind: "dates", option });
    setRangeDraft([null, null]);
  };

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

  function dayMatchesMine(d: Date): boolean {
    if (!mine || !mine.trim()) return false;
    const rMine = parseDateOptionToRange(mine.trim(), y0);
    if (rMine && isDayInRange(d, rMine.start, rMine.end)) return true;
    const row = parsed.find((p) => p.option === mine);
    if (row && isDayInRange(d, row.start, row.end)) return true;
    return formatLocalIsoDate(d) === mine.trim();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-neutral-400">
        Votes: {voterN}/{quorum}+ to lock. Tap a start date, then an end date (both inclusive). Tap the same day twice
        for a one-day trip.
      </p>

      <div className="conci-datepicker-shell rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-4 dark:border-white/10 dark:bg-dm-elevated/50">
        <div className="conci-datepicker-centered">
          <DatePicker
            key={calendarMountKey}
            inline
            selectsRange
            allowSameDay
            swapRange
            shouldCloseOnSelect={false}
            openToDate={calendarOpenDate}
            startDate={rangeDraft[0]}
            endDate={rangeDraft[1]}
            onChange={(upd: [Date | null, Date | null]) => {
              if (busy) return;
              setRangeDraft(upd ?? [null, null]);
              const [start, end] = upd ?? [null, null];
              if (start != null && end != null) {
                const ordered =
                  localDayTime(start) <= localDayTime(end)
                    ? { s: start, e: end }
                    : { s: end, e: start };
                cast(formatLocalIsoRangeVote(ordered.s, ordered.e));
              }
            }}
            minDate={minNav}
            maxDate={maxNav}
            calendarStartDay={0}
            calendarClassName="conci-datepicker-calendar"
            wrapperClassName="conci-datepicker-wrapper"
            renderCustomHeader={(p) => <RangePickerHeader {...p} />}
            renderCustomDayName={({ shortName }) => (
              <abbr className="conci-datepicker-week-abbr" title={shortName}>
                {shortName.charAt(0)}
              </abbr>
            )}
            dayClassName={(d: Date) => {
              const parts: string[] = [];
              if (votesCoveringCalendarDay(d, tally, y0) > 0) parts.push("conci-datepicker-day--votes");
              if (dayMatchesMine(d)) parts.push("conci-datepicker-day--mine");
              return parts.join(" ");
            }}
            renderDayContents={(day: number) => (
              <span className="conci-datepicker-day-num">{day}</span>
            )}
          />
        </div>

        {rangeSummariesWithVotes.length > 0 ? (
          <ul className="conci-datepicker-range-totals mt-4 space-y-1.5 border-t border-slate-200 pt-3 dark:border-white/10">
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

      {unmapped.length > 0 ? (
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
          No date suggestions on the ballot — pick any range on the calendar.
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

/** When there is exactly one host-proposed ballot line, members confirm before seeing the calendar. */
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

  const fallbackCalendarYear = new Date().getFullYear();
  const y0 = useMemo(
    () => inferDefaultYearFromDateOptions(options, fallbackCalendarYear),
    [options, fallbackCalendarYear]
  );
  const heading = useMemo(() => formatBallotProposalHeading(proposalRaw, y0), [proposalRaw, y0]);

  const mineTrim = mine?.trim() ?? "";
  const votedForProposal = mineTrim.length > 0 && mineTrim === proposalNorm;

  const [declinedProposal, setDeclinedProposal] = useState(false);
  const [calendarExpanded, setCalendarExpanded] = useState(false);

  useEffect(() => {
    const alt = Boolean(mineTrim && mineTrim !== proposalNorm);
    setDeclinedProposal(alt);
    setCalendarExpanded(alt);
  }, [mineTrim, proposalNorm]);

  const castWorksForMe = () => {
    onVote({ decisionKey, kind: "dates", option: proposalRaw });
    setDeclinedProposal(false);
    setCalendarExpanded(false);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-indigo-200/80 bg-indigo-50/60 px-5 py-4 dark:border-indigo-500/30 dark:bg-indigo-950/25">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-800 dark:text-indigo-300">
          Host proposed trip dates
        </p>
        <p className="mt-2 font-display text-xl font-semibold tracking-tight text-slate-900 dark:text-neutral-100">
          {heading}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          disabled={busy}
          onClick={() => castWorksForMe()}
          className={`rounded-xl px-5 py-3 text-sm font-semibold transition disabled:opacity-50 ${
            votedForProposal
              ? "bg-indigo-700 text-white ring-2 ring-indigo-400 dark:bg-indigo-500 dark:ring-indigo-300/60"
              : "border border-slate-200 bg-white text-slate-900 hover:border-indigo-300 hover:bg-indigo-50 dark:border-white/10 dark:bg-dm-card dark:text-neutral-100 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-950/30"
          }`}
        >
          Works for me
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setDeclinedProposal(true);
            setCalendarExpanded(false);
          }}
          className={`rounded-xl border px-5 py-3 text-sm font-semibold transition disabled:opacity-50 ${
            declinedProposal && !votedForProposal
              ? "border-rose-400 bg-rose-50 text-rose-950 dark:border-rose-600/60 dark:bg-rose-950/40 dark:text-rose-100"
              : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 dark:border-white/10 dark:bg-dm-card dark:text-neutral-200 dark:hover:border-white/20"
          }`}
        >
          Doesn&apos;t work
        </button>
      </div>

      {declinedProposal ? (
        <div className="space-y-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => setCalendarExpanded((e) => !e)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 transition hover:border-slate-300 disabled:opacity-50 dark:border-white/10 dark:bg-dm-card dark:text-neutral-200 dark:hover:border-white/20"
            aria-expanded={calendarExpanded}
          >
            <CalendarGlyph />
            {calendarExpanded ? "Hide calendar" : "Suggest other dates"}
          </button>

          {calendarExpanded ? (
            <DatesVoteCalendar
              decisionKey={decisionKey}
              options={options}
              votes={votes}
              mine={mine}
              busy={busy}
              quorum={quorum}
              voterN={voterN}
              onVote={onVote}
            />
          ) : null}
        </div>
      ) : null}

      <p className="text-xs text-slate-500 dark:text-neutral-500">
        {voterN}/{quorum}+ votes to lock. Pick &quot;Works for me&quot; to vote for the proposed range above, or use the
        calendar after &quot;Doesn&apos;t work&quot; for an alternate.
      </p>
    </div>
  );
}

