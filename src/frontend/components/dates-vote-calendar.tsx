"use client";

import { useMemo } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import {
  buildParsedDateOptions,
  earliestParsedDay,
  inferDefaultYearFromDateOptions,
  latestParsedDay,
  localDayTime,
  optionForCalendarDay,
  parseDateOptionToRange,
  tallyDateStringVotes,
} from "@/shared/date-option-parse";
import "./dates-vote-calendar.css";

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
  const fallbackYear = new Date().getFullYear();
  const defaultYear = useMemo(
    () => inferDefaultYearFromDateOptions(options, fallbackYear),
    [options, fallbackYear]
  );
  const parsed = useMemo(() => buildParsedDateOptions(options, fallbackYear), [options, fallbackYear]);
  const unmapped = useMemo(
    () => options.filter((o) => !parsed.some((p) => p.option === o)),
    [options, parsed]
  );
  const tally = useMemo(() => tallyDateStringVotes(votes, options), [votes, options]);

  const defaultActive = useMemo(() => earliestParsedDay(parsed) ?? new Date(defaultYear, 0, 1), [parsed, defaultYear]);

  const minNav = useMemo(() => {
    const e = earliestParsedDay(parsed);
    if (!e) return undefined;
    return new Date(localDayTime(e) - 32 * 86400000);
  }, [parsed]);

  const maxNav = useMemo(() => {
    const l = latestParsedDay(parsed);
    if (!l) return undefined;
    return new Date(localDayTime(l) + 62 * 86400000);
  }, [parsed]);

  const cast = (option: string) => {
    onVote({ decisionKey, kind: "dates", option });
  };

  const rangeSummaries = useMemo(
    () =>
      parsed.map(({ option, start, end }) => ({
        option,
        label: `${start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
        votes: tally[option] ?? 0,
      })),
    [parsed, tally]
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-neutral-400">
        Votes: {voterN}/{quorum}+ to lock. Choose a highlighted date to vote for that option.
      </p>

      {parsed.length > 0 ? (
        <div className="conci-datepicker-shell rounded-2xl border border-slate-200 bg-slate-50/90 p-3 dark:border-white/10 dark:bg-dm-elevated/50">
          <DatePicker
            inline
            showIcon={false}
            shouldCloseOnSelect={false}
            openToDate={defaultActive}
            selected={null}
            onChange={(date: Date | null) => {
              if (busy || !date) return;
              const opt = optionForCalendarDay(date, options, parsed);
              if (opt) cast(opt);
            }}
            filterDate={(d: Date) => optionForCalendarDay(d, options, parsed) !== null}
            minDate={minNav}
            maxDate={maxNav}
            calendarStartDay={1}
            calendarClassName="conci-datepicker-calendar"
            wrapperClassName="conci-datepicker-wrapper"
            dateFormatCalendar="MMMM yyyy"
            dayClassName={(d: Date) => {
              const opt = optionForCalendarDay(d, options, parsed);
              if (!opt) return "";
              const parts = ["conci-datepicker-day--vote"];
              if (mine === opt) parts.push("conci-datepicker-day--mine");
              return parts.join(" ");
            }}
            renderDayContents={(day: number, date?: Date) => {
              if (!date) return <span>{day}</span>;
              const opt = optionForCalendarDay(date, options, parsed);
              if (!opt) return <span>{day}</span>;
              const c = tally[opt] ?? 0;
              return (
                <span className="conci-datepicker-day-inner">
                  <span className="conci-datepicker-day-num">{day}</span>
                  <span className="conci-datepicker-day-votes" aria-hidden={c === 0}>
                    {c > 0 ? c : "\u00a0"}
                  </span>
                </span>
              );
            }}
          />
          {rangeSummaries.length > 0 ? (
            <ul className="conci-datepicker-range-totals mt-4 space-y-1.5 border-t border-slate-200 pt-3 dark:border-white/10">
              {rangeSummaries.map(({ option, label, votes: v }) => (
                <li key={option} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="min-w-0 text-slate-600 dark:text-neutral-400">{label}</span>
                  <span className="shrink-0 tabular-nums text-slate-800 dark:text-neutral-200">
                    {v} {v === 1 ? "vote" : "votes"}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

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
        <p className="text-sm text-slate-600 dark:text-neutral-400">No date options to show.</p>
      ) : null}

      <ul className="sr-only" aria-label="Vote totals by option">
        {options.map((opt) => {
          const r = parseDateOptionToRange(opt, defaultYear);
          const label = r
            ? `${r.start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} – ${r.end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
            : opt;
          return (
            <li key={opt}>
              {tally[opt] ?? 0} votes: {label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
