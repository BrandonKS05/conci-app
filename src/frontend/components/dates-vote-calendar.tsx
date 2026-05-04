"use client";

import { useMemo } from "react";
import Calendar from "react-calendar";
import type { TileClassNameFunc, TileContentFunc, TileDisabledFunc } from "react-calendar";
import "react-calendar/dist/Calendar.css";
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
    const t = localDayTime(e) - 32 * 86400000;
    return new Date(t);
  }, [parsed]);

  const maxNav = useMemo(() => {
    const l = latestParsedDay(parsed);
    if (!l) return undefined;
    const t = localDayTime(l) + 62 * 86400000;
    return new Date(t);
  }, [parsed]);

  const tileDisabled: TileDisabledFunc = ({ date, view }) => {
    if (view !== "month") return false;
    return optionForCalendarDay(date, options, parsed) === null;
  };

  const tileClassName: TileClassNameFunc = ({ date, view }) => {
    if (view !== "month") return null;
    const opt = optionForCalendarDay(date, options, parsed);
    if (!opt) return null;
    const classes: string[] = ["dates-tile-proposed"];
    if (mine && mine === opt) classes.push("dates-tile-mine");
    return classes.join(" ");
  };

  const tileContent: TileContentFunc = ({ date, view }) => {
    if (view !== "month") return null;
    const opt = optionForCalendarDay(date, options, parsed);
    if (!opt) return null;
    const c = tally[opt] ?? 0;
    return (
      <span className="dates-tile-votehint" aria-hidden={c === 0}>
        {c > 0 ? <span className="dates-tile-count">{c}</span> : <span className="dates-tile-dot" />}
      </span>
    );
  };

  const cast = (option: string) => {
    onVote({ decisionKey, kind: "dates", option });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-neutral-400">
        Votes: {voterN}/{quorum}+ to lock. Tap a highlighted date to vote for that option. Vote totals appear under each
        day (the same total appears on every day in a range).
      </p>

      {parsed.length > 0 ? (
        <Calendar
          className="dates-vote-calendar rounded-2xl border border-slate-200 bg-slate-50/80 p-2 dark:border-white/10 dark:bg-dm-elevated/40"
          calendarType="iso8601"
          defaultActiveStartDate={defaultActive}
          minDate={minNav}
          maxDate={maxNav}
          minDetail="month"
          maxDetail="month"
          tileDisabled={tileDisabled}
          tileClassName={tileClassName}
          tileContent={tileContent}
          showNeighboringMonth={false}
          onClickDay={(value) => {
            if (busy) return;
            const opt = optionForCalendarDay(value, options, parsed);
            if (!opt) return;
            cast(opt);
          }}
        />
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

      <ul className="space-y-1 text-xs text-slate-500 dark:text-neutral-500" aria-label="Vote totals by option">
        {options.map((opt) => {
          const r = parseDateOptionToRange(opt, defaultYear);
          const label = r
            ? `${r.start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} – ${r.end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
            : opt;
          return (
            <li key={opt}>
              <span className="font-medium text-slate-700 dark:text-neutral-300">{tally[opt] ?? 0} votes</span>
              {" · "}
              <span className="text-slate-600 dark:text-neutral-400">{label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
