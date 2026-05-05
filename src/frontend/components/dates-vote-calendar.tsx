"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactDatePickerCustomHeaderProps } from "react-datepicker";
import { primaryFilledInteractive } from "@/frontend/ui/primary-action";
import {
  aggregatedTallyForBallotOption,
  buildParsedDateOptions,
  earliestParsedDay,
  formatBallotProposalHeading,
  formatLocalIsoDate,
  formatLocalIsoRangeVote,
  inferCalendarOpenDateFromDateOptions,
  inferDefaultYearFromDateOptions,
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

/** Client-only load avoids SSR/hydration issues that left the inline calendar blank in Next.js. */
const InlineRangeDatePicker = dynamic(() => import("@/frontend/components/dates-range-picker-inline"), {
  ssr: false,
  loading: () => (
    <div
      className="flex min-h-[min(380px,50vh)] w-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/60 text-sm text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-neutral-400"
      role="status"
      aria-live="polite"
    >
      Loading calendar…
    </div>
  ),
});

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

  const calendarOpenDate = useMemo(
    () => inferCalendarOpenDateFromDateOptions(options, fallbackCalendarYear),
    [options, fallbackCalendarYear]
  );

  const calendarMountKey = useMemo(
    () => `${options.join("\u001f")}|${formatLocalIsoDate(calendarOpenDate)}`,
    [options, calendarOpenDate]
  );

  const [rangeDraft, setRangeDraft] = useState<[Date | null, Date | null]>([null, null]);

  const cast = (option: string) => {
    onVote({ decisionKey, kind: "dates", option });
  };

  useEffect(() => {
    const m = mine?.trim() ?? "";
    if (!m) return;
    const r = parseDateOptionToRange(m, y0);
    if (!r) return;
    setRangeDraft([r.start, r.end]);
  }, [mine, y0]);

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

  function onRangeCalendarChange(upd: [Date | null, Date | null] | null): void {
    if (busy) return;
    if (!upd) {
      setRangeDraft([null, null]);
      return;
    }
    const [start, end] = upd;
    setRangeDraft(upd);
    if (start != null && end != null) {
      const ordered =
        localDayTime(start) <= localDayTime(end) ? { s: start, e: end } : { s: end, e: start };
      const canon = formatLocalIsoRangeVote(ordered.s, ordered.e);
      if (canon !== (mine?.trim() ?? "")) {
        cast(canon);
      }
    }
  }

  return (
    <div className="space-y-4">
      {hideUnmappedBallotChips && !(mine ?? "").trim() ? (
        <p className="rounded-xl border border-amber-200/90 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/45 dark:bg-amber-950/35 dark:text-amber-100">
          The host suggested a loose timing window — click a start day on the calendar, then click the end day to set your
          range.
        </p>
      ) : null}
      <p className="text-sm text-slate-600 dark:text-neutral-400">
        {embeddedUnderHostProposal ? (
          <>
            Click your first date, then click the second (inclusive range). Tap the same day twice for a one-day trip. Your
            vote saves once the range is complete. Group needs {voterN}/{quorum}+ votes to lock.
          </>
        ) : hideUnmappedBallotChips ? (
          <>
            Same calendar — first click starts the range, second click completes it (same day twice = one-night trip).
            Your vote submits when both ends are set. Group needs {voterN}/{quorum}+ votes to lock.
          </>
        ) : (
          <>
            Votes: {voterN}/{quorum}+ to lock. Use one calendar — click start date, then end date (tap one day twice for a
            one-day trip).
          </>
        )}
      </p>

      <div className="conci-datepicker-shell rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-4 dark:border-white/10 dark:bg-dm-elevated/50">
        <div className="conci-datepicker-centered [&_.react-datepicker]:min-h-[17rem]">
          <InlineRangeDatePicker
            key={calendarMountKey}
            inline
            selectsRange
            allowSameDay
            swapRange
            shouldCloseOnSelect={false}
            openToDate={calendarOpenDate}
            startDate={rangeDraft[0]}
            endDate={rangeDraft[1]}
            onChange={onRangeCalendarChange}
            minDate={minNav}
            maxDate={maxNav}
            disabled={busy}
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
            renderDayContents={(day: number) => <span className="conci-datepicker-day-num">{day}</span>}
          />
        </div>

        {rangeSummariesWithVotes.length > 0 ? (
          <ul className="conci-datepicker-range-totals mt-4 max-w-[20rem] space-y-1.5 border-t border-slate-200 pt-3 dark:border-white/10 sm:mx-auto">
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
          No date suggestions on the ballot — pick any range on the calendar above.
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
  /** When the host has locked dates on the plan, "Works for me" records an ack (`datesWorksForMe`) instead of a ballot vote. */
  worksForMeMode = "ballot",
  viewerAcknowledgedConfirmed = false,
  blockedByDates = false,
}: {
  decisionKey: string;
  options: string[];
  votes: Record<string, unknown>;
  mine: string | null;
  busy: boolean;
  quorum: number;
  voterN: number;
  onVote: (p: Record<string, unknown>) => void;
  worksForMeMode?: "ballot" | "confirmedAck";
  viewerAcknowledgedConfirmed?: boolean;
  blockedByDates?: boolean;
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
  const votedForProposal =
    worksForMeMode === "confirmedAck"
      ? viewerAcknowledgedConfirmed
      : mineTrim.length > 0 && mineTrim === proposalNorm;

  const nudgeAlternativeCalendar = () => {
    calRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlightCalendar(true);
    window.setTimeout(() => setHighlightCalendar(false), 2200);
  };

  const castWorksForMe = () => {
    if (worksForMeMode === "confirmedAck") {
      onVote({ decisionKey, kind: "datesWorksForMe" });
    } else {
      onVote({ decisionKey, kind: "dates", option: proposalRaw });
    }
  };

  return (
    <div className="space-y-5">
      {worksForMeMode !== "confirmedAck" ? (
        <div className="rounded-2xl border border-indigo-200/80 bg-indigo-50/60 px-5 py-4 dark:border-indigo-500/30 dark:bg-indigo-950/25">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-800 dark:text-indigo-300">
            Host proposed trip dates
          </p>
          <p className="mt-3 font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-neutral-100 sm:text-3xl">
            {heading}
          </p>
        </div>
      ) : null}

      <p className="text-sm text-slate-700 dark:text-neutral-300">
        {worksForMeMode === "confirmedAck" ? (
          <>
            Tap <strong className="font-semibold text-slate-900 dark:text-neutral-100">Works for me</strong> if these
            dates work for you, or pick any availability window on the calendar below — including dates outside this range
            if you need to flag a conflict.
          </>
        ) : (
          <>
            Tap <strong className="font-semibold text-slate-900 dark:text-neutral-100">Works for me</strong> to vote yes on
            the host&apos;s dates, or choose a different start and end below. Your vote is required — you can&apos;t skip
            availability.
          </>
        )}
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <button
          type="button"
          disabled={busy || (worksForMeMode === "confirmedAck" && viewerAcknowledgedConfirmed) || blockedByDates}
          onClick={() => castWorksForMe()}
          className={`rounded-full px-6 py-2.5 text-sm transition disabled:opacity-50 ${
            votedForProposal
              ? `${primaryFilledInteractive} ring-2 ring-slate-400 dark:ring-[#d4d2cd]`
              : "border border-slate-200 bg-white font-semibold text-slate-900 hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-dm-card dark:text-neutral-100 dark:hover:border-white/25 dark:hover:bg-white/5"
          }`}
        >
          {worksForMeMode === "confirmedAck" && viewerAcknowledgedConfirmed ? "Thanks — noted" : "Works for me"}
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
        The calendar is below — click two dates for your range (or the same date twice). That replaces your vote with that
        availability window.
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
        {worksForMeMode === "confirmedAck" ? (
          mineTrim || viewerAcknowledgedConfirmed ? (
            <>
              {viewerAcknowledgedConfirmed && !mineTrim
                ? "Noted — you can still add or change your availability on the calendar above."
                : "Your availability is recorded. The host can see votes and suggestions here."}
            </>
          ) : (
            <>Share whether these dates work or use the calendar for your real availability ({voterN}/{quorum}+ travelers).</>
          )
        ) : mineTrim ? (
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

