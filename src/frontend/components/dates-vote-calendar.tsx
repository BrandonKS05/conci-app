"use client";

import { useMemo, useState } from "react";
import DatePicker from "react-datepicker";
import type { ReactDatePickerCustomHeaderProps } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import {
  aggregatedTallyForBallotOption,
  buildParsedDateOptions,
  earliestParsedDay,
  formatLocalIsoDate,
  formatLocalIsoRangeVote,
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

  const defaultActive = useMemo(
    () => earliestParsedDay(parsed) ?? startOfLocalDay(new Date()),
    [parsed]
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
            inline
            selectsRange
            allowSameDay
            swapRange
            shouldCloseOnSelect={false}
            openToDate={defaultActive}
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

        {rangeSummaries.length > 0 ? (
          <ul className="conci-datepicker-range-totals mt-4 space-y-1.5 border-t border-slate-200 pt-3 dark:border-white/10">
            {rangeSummaries.map(({ key, label, votes: v }) => (
              <li key={key} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="min-w-0 text-slate-600 dark:text-neutral-400">{label}</span>
                {v > 0 ? (
                  <span className="shrink-0 tabular-nums text-slate-800 dark:text-neutral-200">
                    {v} {v === 1 ? "vote" : "votes"}
                  </span>
                ) : null}
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
        {rangeSummaries.map(({ key, label, votes: v }) => (
          <li key={`sr-${key}`}>{v > 0 ? `${v} ${v === 1 ? "vote" : "votes"}: ${label}` : label}</li>
        ))}
      </ul>
    </div>
  );
}
