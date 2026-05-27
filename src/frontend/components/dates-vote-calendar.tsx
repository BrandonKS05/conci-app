"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

// ── Types ──────────────────────────────────────────────────────────────────────

export type CalendarBusyRange = {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD (inclusive)
  source: "apple" | "google" | "manual";
};

// ── ICS parsing (client-side, no package needed) ───────────────────────────────

function parseIsoFromIcsStamp(stamp: string): string | null {
  // Handles YYYYMMDD and YYYYMMDDTHHMMSS[Z]
  const m = stamp.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function addDaysToIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return formatLocalIsoDate(d);
}

/**
 * Minimal iCalendar parser: extracts VEVENT and VFREEBUSY blocks.
 * Returns busy ranges as { start, end } ISO date strings.
 */
function parseIcsBusyRanges(icsText: string): Array<{ start: string; end: string }> {
  const lines = icsText
    .replace(/\r\n[ \t]/g, "") // unfold
    .replace(/\r\n/g, "\n")
    .split("\n");

  const ranges: Array<{ start: string; end: string }> = [];
  let inEvent = false;
  let dtStart: string | null = null;
  let dtEnd: string | null = null;
  let transp: string | null = null;
  let status: string | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;
    const prop = line.slice(0, colonIdx).toUpperCase().split(";")[0]!;
    const val = line.slice(colonIdx + 1).trim();

    if (prop === "BEGIN" && val.toUpperCase() === "VEVENT") {
      inEvent = true;
      dtStart = null;
      dtEnd = null;
      transp = null;
      status = null;
    } else if (prop === "END" && val.toUpperCase() === "VEVENT") {
      inEvent = false;
      // Skip cancelled or transparent events
      if (transp === "TRANSPARENT" || status === "CANCELLED") continue;
      if (dtStart) {
        const end = dtEnd ?? addDaysToIso(dtStart, 1);
        ranges.push({ start: dtStart, end: end });
      }
    } else if (inEvent) {
      if (prop === "DTSTART") {
        dtStart = parseIsoFromIcsStamp(val);
      } else if (prop === "DTEND") {
        const parsed = parseIsoFromIcsStamp(val);
        if (parsed) {
          // iCal DTEND for all-day events is exclusive; subtract 1 day to make it inclusive
          const isAllDay = !val.includes("T");
          dtEnd = isAllDay ? addDaysToIso(parsed, -1) : parsed;
        }
      } else if (prop === "TRANSP") {
        transp = val.toUpperCase();
      } else if (prop === "STATUS") {
        status = val.toUpperCase();
      }
    }

    // VFREEBUSY blocks
    if (prop === "FREEBUSY") {
      // Format: YYYYMMDDTHHMMSSZ/YYYYMMDDTHHMMSSZ
      for (const period of val.split(",")) {
        const [s, e] = period.split("/");
        if (!s || !e) continue;
        const start = parseIsoFromIcsStamp(s);
        const end = parseIsoFromIcsStamp(e);
        if (start && end) ranges.push({ start, end });
      }
    }
  }

  return ranges;
}

function isDayBusy(d: Date, busyRanges: CalendarBusyRange[]): boolean {
  const iso = formatLocalIsoDate(d);
  for (const r of busyRanges) {
    if (iso >= r.start && iso <= r.end) return true;
  }
  return false;
}

// ── Calendar connect section ───────────────────────────────────────────────────

function AppleCalIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect x="1.5" y="3.5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1.5 7.5h17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M6.5 1.5v4M13.5 1.5v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M6 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GoogleCalIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect x="1.5" y="3.5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1.5 7.5h17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M6.5 1.5v4M13.5 1.5v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M10 10.5v-.75M10 10.5c0 1.25 1.75 2 1.75 2M10 10.5c0 1.25-1.75 2-1.75 2M8.25 9.25A1.75 1.75 0 0110 8.5c.97 0 1.75.78 1.75 1.75"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <path d="M8 11V4M5 7l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 13h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" fill="none" className={className} aria-hidden>
      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type CalendarConnectProps = {
  tripId: string;
  busyRanges: CalendarBusyRange[];
  onBusyRangesChange: (ranges: CalendarBusyRange[]) => void;
};

function CalendarConnect({ tripId, busyRanges, onBusyRangesChange }: CalendarConnectProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const gcalConfigured = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID);

  const saveRanges = useCallback(
    async (ranges: CalendarBusyRange[]) => {
      setSaving(true);
      setErr(null);
      try {
        const r = await fetch(`/api/trip-plans/${tripId}/collab/calendar-import`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ busyRanges: ranges }),
        });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; count?: number; stored?: boolean };
        if (!r.ok) {
          setErr("Could not save calendar data.");
          return;
        }
        onBusyRangesChange(ranges);
        setNotice(
          `${j.count ?? ranges.length} busy period${(j.count ?? ranges.length) === 1 ? "" : "s"} imported — blocked dates are now visible on the calendar.`
        );
      } catch {
        setErr("Network error — busy dates saved locally.");
        // Still update local state
        onBusyRangesChange(ranges);
      } finally {
        setSaving(false);
      }
    },
    [tripId, onBusyRangesChange]
  );

  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".ics") && file.type !== "text/calendar") {
        setErr("Please upload an .ics file.");
        return;
      }
      setErr(null);
      setNotice(null);
      const text = await file.text();
      const parsed = parseIcsBusyRanges(text);
      if (parsed.length === 0) {
        setErr("No events found in this file — try exporting a date range that includes your busy times.");
        return;
      }
      const ranges: CalendarBusyRange[] = parsed.map((r) => ({ ...r, source: "apple" as const }));
      await saveRanges(ranges);
    },
    [saveRanges]
  );

  const handleGoogleCalendar = useCallback(() => {
    if (!gcalConfigured) {
      setNotice(
        "Google Calendar OAuth is not configured. Add NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET to .env.local to enable the full Google Calendar integration."
      );
      return;
    }
    window.open(
      `/api/trip-plans/${tripId}/collab/google-calendar-auth`,
      "gcal-oauth",
      "width=500,height=600,scrollbars=yes"
    );
  }, [gcalConfigured, tripId]);

  // Listen for popup postMessage result from Google Calendar OAuth callback
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "gcal-success") {
        // Reload from server so UI reflects what was saved
        fetch(`/api/trip-plans/${tripId}/collab/calendar-import`, { credentials: "include" })
          .then((r) => r.json())
          .then((j: { busyRanges?: CalendarBusyRange[] }) => {
            if (Array.isArray(j.busyRanges)) onBusyRangesChange(j.busyRanges);
          })
          .catch(() => null);
        const count = typeof e.data.count === "number" ? e.data.count : 0;
        setNotice(`Google Calendar connected — ${count} busy period${count !== 1 ? "s" : ""} imported.`);
      } else if (e.data?.type === "gcal-error") {
        setNotice(`Google Calendar error: ${String(e.data.error ?? "unknown")}`);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [tripId, onBusyRangesChange]);

  const clearBusy = useCallback(async () => {
    await saveRanges([]);
    setNotice("Calendar data cleared.");
  }, [saveRanges]);

  const hasBusy = busyRanges.length > 0;

  return (
    <div className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] dark:border-white/10 dark:bg-dm-page">
      {/* Header row */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[color:var(--hairline)] bg-white shadow-sm dark:border-white/10 dark:bg-dm-card">
            <AppleCalIcon className="h-4 w-4 text-[color:var(--on-surface-variant)] dark:text-neutral-400" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[color:var(--on-surface)] dark:text-neutral-100">
              Connect your calendar
            </p>
            <p className="text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">
              {hasBusy
                ? `${busyRanges.length} busy period${busyRanges.length === 1 ? "" : "s"} blocking dates`
                : "Block out dates you're not available"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hasBusy && (
            <span className="rounded-full border border-[color:var(--sage)]/35 bg-[color:var(--sage)]/8 px-2 py-0.5 text-[11px] font-semibold text-[color:var(--sage)] dark:border-blue-400/30 dark:bg-blue-950/30 dark:text-blue-300">
              {busyRanges.length} blocked
            </span>
          )}
          <ChevronDown
            className={`h-3.5 w-3.5 text-[color:var(--on-surface-muted)] transition-transform duration-200 dark:text-neutral-500 ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {open && (
        <div className="border-t border-[color:var(--hairline)] px-4 pb-4 pt-3 dark:border-white/10">
          <p className="text-xs leading-relaxed text-[color:var(--on-surface-muted)] dark:text-neutral-500">
            Your busy dates appear greyed out on the voting calendar so the group can find times that work for everyone.
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {/* Apple Calendar / .ics upload */}
            <div className="flex flex-col gap-2 rounded-xl border border-[color:var(--hairline)] bg-white p-3 dark:border-white/10 dark:bg-dm-card">
              <div className="flex items-center gap-2">
                <AppleCalIcon className="h-4 w-4 shrink-0 text-[color:var(--on-surface-variant)] dark:text-neutral-400" />
                <p className="text-xs font-semibold text-[color:var(--on-surface)] dark:text-neutral-100">Apple Calendar</p>
              </div>
              <p className="text-[11px] leading-relaxed text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                In Calendar app: File → Export → Export… and upload the .ics file below.
              </p>
              <button
                type="button"
                disabled={saving}
                onClick={() => fileRef.current?.click()}
                className="mt-auto flex items-center justify-center gap-1.5 rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-3 py-2 text-xs font-semibold text-[color:var(--on-surface)] transition hover:border-[color:var(--hairline-strong)] hover:bg-[color:var(--surface-container)] disabled:opacity-50 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-200 dark:hover:border-white/20"
              >
                <UploadIcon className="h-3.5 w-3.5" />
                {saving ? "Importing…" : "Upload .ics file"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".ics,text/calendar"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFileUpload(f);
                  e.target.value = "";
                }}
              />
            </div>

            {/* Google Calendar */}
            <div className="flex flex-col gap-2 rounded-xl border border-[color:var(--hairline)] bg-white p-3 dark:border-white/10 dark:bg-dm-card">
              <div className="flex items-center gap-2">
                <GoogleCalIcon className="h-4 w-4 shrink-0 text-[color:var(--on-surface-variant)] dark:text-neutral-400" />
                <p className="text-xs font-semibold text-[color:var(--on-surface)] dark:text-neutral-100">Google Calendar</p>
              </div>
              {gcalConfigured ? (
                <p className="text-[11px] leading-relaxed text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                  Connect your Google account to automatically block busy times.
                </p>
              ) : (
                <p className="text-[11px] leading-relaxed text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                  Export from Google Calendar as .ics, or click below to learn how to configure full sync.
                </p>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={handleGoogleCalendar}
                className="mt-auto flex items-center justify-center gap-1.5 rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-3 py-2 text-xs font-semibold text-[color:var(--on-surface)] transition hover:border-[color:var(--hairline-strong)] hover:bg-[color:var(--surface-container)] disabled:opacity-50 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-200 dark:hover:border-white/20"
              >
                <GoogleCalIcon className="h-3.5 w-3.5" />
                {gcalConfigured ? "Connect Google Calendar" : "How to export from Google"}
              </button>
            </div>
          </div>

          {notice && (
            <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-900 dark:border-emerald-800/40 dark:bg-emerald-950/35 dark:text-emerald-200">
              {notice}
            </p>
          )}
          {err && (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/35 dark:text-rose-200">
              {err}
            </p>
          )}

          {hasBusy && (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-[color:var(--surface-container)] px-3 py-2 dark:bg-dm-elevated">
              <div className="min-w-0">
                <p className="text-xs font-medium text-[color:var(--on-surface)] dark:text-neutral-200">
                  {busyRanges.length} busy period{busyRanges.length === 1 ? "" : "s"} imported
                </p>
                <p className="mt-0.5 text-[11px] text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                  Striped dates on the calendar are blocked for you.
                </p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => void clearBusy()}
                className="shrink-0 rounded-md border border-[color:var(--hairline)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[color:var(--on-surface-muted)] hover:bg-[color:var(--surface-container-low)] disabled:opacity-50 dark:border-white/10 dark:bg-dm-card dark:text-neutral-400 dark:hover:bg-dm-elevated"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Date picker (client-only) ──────────────────────────────────────────────────

/** Client-only load avoids SSR/hydration issues that left the inline calendar blank in Next.js. */
const InlineRangeDatePicker = dynamic(() => import("@/frontend/components/dates-range-picker-inline"), {
  ssr: false,
  loading: () => (
    <div
      className="flex min-h-[min(380px,50vh)] w-full items-center justify-center rounded-xl border border-dashed border-[color:var(--hairline)] bg-white/60 text-sm text-[color:var(--on-surface-muted)] dark:border-white/10 dark:bg-white/5 dark:text-neutral-400"
      role="status"
      aria-live="polite"
    >
      Loading calendar…
    </div>
  ),
});

/** Compact overlay calendar for "Suggest other dates" on confirmed host trips. */
export function AlternateDatesRangeModal({
  open,
  onClose,
  decisionKey,
  options,
  mine,
  busy,
  onVote,
}: {
  open: boolean;
  onClose: () => void;
  decisionKey: string;
  options: string[];
  mine: string | null;
  busy: boolean;
  onVote: (p: Record<string, unknown>) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const fallbackCalendarYear = new Date().getFullYear();
  const y0 = useMemo(
    () => inferDefaultYearFromDateOptions(options, fallbackCalendarYear),
    [options, fallbackCalendarYear]
  );
  const parsed = useMemo(() => buildParsedDateOptions(options, fallbackCalendarYear), [options, fallbackCalendarYear]);

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
    () => `alt-modal-${options.join("")}|${formatLocalIsoDate(calendarOpenDate)}`,
    [options, calendarOpenDate]
  );

  const [rangeDraft, setRangeDraft] = useState<[Date | null, Date | null]>([null, null]);

  useEffect(() => {
    if (!open) return;
    const m = mine?.trim() ?? "";
    if (!m) {
      setRangeDraft([null, null]);
      return;
    }
    const r = parseDateOptionToRange(m, y0);
    if (r) setRangeDraft([r.start, r.end]);
    else setRangeDraft([null, null]);
  }, [open, mine, y0]);

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
        onVote({ decisionKey, kind: "dates", option: canon });
      }
      onClose();
    }
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[240] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="alternate-dates-title"
    >
      <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" aria-label="Close" onClick={onClose} />
      <div className="relative max-h-[min(90vh,560px)] w-full max-w-md overflow-hidden rounded-2xl border border-[color:var(--hairline)] bg-white shadow-2xl dark:border-white/10 dark:bg-dm-card">
        <div className="flex items-start justify-between gap-3 border-b border-[color:var(--hairline)] px-5 py-4 dark:border-white/10">
          <div className="min-w-0">
            <h2 id="alternate-dates-title" className="text-lg font-semibold text-[color:var(--on-surface)] dark:text-white">
              Suggest other dates
            </h2>
            <p className="mt-1 text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">
              Tap the first day, then the last day of the range that works for you. Your suggestion is saved when both ends
              are set.
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg px-2 py-1 text-sm text-[color:var(--on-surface-muted)] hover:bg-[color:var(--surface-container)] dark:text-neutral-400 dark:hover:bg-dm-elevated"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="max-h-[min(70vh,480px)] overflow-y-auto px-5 py-4">
          <div className="conci-datepicker-shell rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)]/90 px-3 py-3 dark:border-white/10 dark:bg-dm-elevated/50">
            <div className="conci-datepicker-centered [&_.react-datepicker]:min-h-[14rem]">
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
                renderDayContents={(day: number) => <span className="conci-datepicker-day-num">{day}</span>}
              />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

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

// ── Vote tally legend ──────────────────────────────────────────────────────────

function VoteLegend({
  hasBusy,
  hasVotes,
}: {
  hasBusy: boolean;
  hasVotes: boolean;
}) {
  if (!hasBusy && !hasVotes) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1">
      {hasVotes && (
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border border-[rgb(165_180_252/0.75)] dark:border-[rgb(129_140_248/0.45)]" />
          <span className="text-[11px] text-[color:var(--on-surface-muted)] dark:text-neutral-500">Others available</span>
        </div>
      )}
      {hasBusy && (
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-[repeating-linear-gradient(-45deg,rgb(239_246_255),rgb(239_246_255)_2px,rgb(214_226_255)_2px,rgb(214_226_255)_4px)] dark:bg-[repeating-linear-gradient(-45deg,rgb(30_27_75/0.3),rgb(30_27_75/0.3)_2px,rgb(79_70_229/0.2)_2px,rgb(79_70_229/0.2)_4px)]" />
          <span className="text-[11px] text-[color:var(--on-surface-muted)] dark:text-neutral-500">You&apos;re busy</span>
        </div>
      )}
    </div>
  );
}

// ── Main dates vote calendar ───────────────────────────────────────────────────

export function DatesVoteCalendar({
  decisionKey,
  options,
  votes,
  mine,
  busy,
  quorum,
  voterN,
  onVote,
  tripId,
  /** When set (e.g. vague "Late July" as the only line), hide chip votes for unparseable ballot text so members must pick a concrete range on the calendar. */
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
  tripId?: string;
  hideUnmappedBallotChips?: boolean;
  /** Shorter copy when nested under the host's single concrete date card */
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

  // Calendar busy ranges state — loaded from server, updated by CalendarConnect
  const [busyRanges, setBusyRanges] = useState<CalendarBusyRange[]>([]);
  const [busyLoaded, setBusyLoaded] = useState(false);

  useEffect(() => {
    if (!tripId) { setBusyLoaded(true); return; }
    void (async () => {
      try {
        const r = await fetch(`/api/trip-plans/${tripId}/collab/calendar-import`, { credentials: "include" });
        if (!r.ok) { setBusyLoaded(true); return; }
        const j = (await r.json()) as { busyRanges?: CalendarBusyRange[] };
        if (Array.isArray(j.busyRanges)) setBusyRanges(j.busyRanges);
      } catch {
        // Non-critical; fall through
      } finally {
        setBusyLoaded(true);
      }
    })();
  }, [tripId]);

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
    () => `${options.join("")}|${formatLocalIsoDate(calendarOpenDate)}`,
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

  const hasVotes = rangeSummariesWithVotes.length > 0;
  const hasBusy = busyRanges.length > 0;

  return (
    <div className="space-y-4">
      {/* Instruction banner for loose/vague ballot */}
      {hideUnmappedBallotChips && !(mine ?? "").trim() ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200/90 bg-amber-50 px-4 py-3 dark:border-amber-900/45 dark:bg-amber-950/35">
          <span className="mt-0.5 text-base leading-none" aria-hidden>⏳</span>
          <p className="text-sm text-amber-950 dark:text-amber-100">
            The host suggested a loose timing window — click a start day on the calendar, then click the end day to set your
            range.
          </p>
        </div>
      ) : null}

      {/* Context line + vote counter */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">
          {embeddedUnderHostProposal ? (
            <>Click start date, then end date. Same day twice = one-day trip.</>
          ) : hideUnmappedBallotChips ? (
            <>First click starts the range, second click completes it.</>
          ) : (
            <>Use the calendar to mark your available dates.</>
          )}
        </p>
        <span className="shrink-0 rounded-full border border-[color:var(--hairline)] bg-[color:var(--surface-container)] px-2.5 py-0.5 text-xs font-medium tabular-nums text-[color:var(--on-surface-variant)] dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-400">
          {voterN}/{quorum}+ to lock
        </span>
      </div>

      {/* Calendar card */}
      <div className="overflow-hidden rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)]/90 dark:border-white/10 dark:bg-dm-elevated/50">
        <div className="px-4 py-4">
          <div className="conci-datepicker-shell">
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
                  if (busyLoaded && isDayBusy(d, busyRanges)) parts.push("conci-datepicker-day--busy");
                  return parts.join(" ");
                }}
                renderDayContents={(day: number) => <span className="conci-datepicker-day-num">{day}</span>}
              />
            </div>
          </div>
        </div>

        {/* Legend */}
        {(hasVotes || hasBusy) && (
          <div className="border-t border-[color:var(--hairline)] px-4 py-3 dark:border-white/10">
            <VoteLegend hasBusy={hasBusy} hasVotes={hasVotes} />
          </div>
        )}

        {/* Vote tally */}
        {rangeSummariesWithVotes.length > 0 ? (
          <div className="border-t border-[color:var(--hairline)] px-4 py-3 dark:border-white/10">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:text-neutral-500">
              Vote tally
            </p>
            <ul className="space-y-1.5">
              {rangeSummariesWithVotes.map(({ key, label, votes: v }) => (
                <li key={key} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate text-[color:var(--on-surface-variant)] dark:text-neutral-400">{label}</span>
                  <span className="shrink-0 tabular-nums font-medium text-[color:var(--on-surface)] dark:text-neutral-200">
                    {v} {v === 1 ? "vote" : "votes"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {/* Calendar connect section */}
      {tripId ? (
        <CalendarConnect
          tripId={tripId}
          busyRanges={busyRanges}
          onBusyRangesChange={setBusyRanges}
        />
      ) : null}

      {/* Unmapped ballot chips */}
      {unmapped.length > 0 && !hideUnmappedBallotChips ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 dark:border-amber-900/40 dark:bg-amber-950/30">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200/90">
            Also on the ballot
          </p>
          <p className="mt-1 text-xs text-amber-950/90 dark:text-amber-100/85">
            These choices couldn&apos;t be placed on the calendar — tap to vote.
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
                    ? "border-[color:var(--sage)] bg-[color:var(--sage)]/10 text-[color:var(--sage)] ring-2 ring-[color:var(--sage)]/20 dark:border-blue-400 dark:bg-blue-950/50 dark:text-blue-200 dark:ring-blue-500/30"
                    : "border-[color:var(--hairline)] bg-white text-[color:var(--on-surface)] hover:border-[color:var(--hairline-strong)] dark:border-white/10 dark:bg-dm-card dark:text-neutral-200 dark:hover:border-white/15"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {parsed.length === 0 && unmapped.length === 0 ? (
        <p className="text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">
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
 * Case 1: Single concrete host date — "Works for me", "Suggest other dates" (modal calendar), plus inline calendar.
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
  tripId,
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
  tripId?: string;
  worksForMeMode?: "ballot" | "confirmedAck";
  viewerAcknowledgedConfirmed?: boolean;
  blockedByDates?: boolean;
}) {
  const proposalRaw = options[0]!;
  const proposalNorm = proposalRaw.trim();
  const [alternateModalOpen, setAlternateModalOpen] = useState(false);

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

  const castWorksForMe = () => {
    if (worksForMeMode === "confirmedAck") {
      onVote({ decisionKey, kind: "datesWorksForMe" });
    } else {
      onVote({ decisionKey, kind: "dates", option: proposalRaw });
    }
  };

  return (
    <div className="space-y-5">
      {/* Host proposal banner */}
      {worksForMeMode !== "confirmedAck" ? (
        <div className="rounded-2xl border border-[color:var(--sage)]/25 bg-[color:var(--sage)]/5 px-5 py-4 dark:border-blue-500/30 dark:bg-blue-950/20">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--sage)] dark:text-blue-400">
            Host proposed dates
          </p>
          <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-[color:var(--on-surface)] dark:text-neutral-100 sm:text-3xl">
            {heading}
          </p>
        </div>
      ) : null}

      <p className="text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-300">
        {worksForMeMode === "confirmedAck" ? (
          <>
            Tap <strong className="font-semibold text-[color:var(--on-surface)] dark:text-neutral-100">Works for me</strong> if these
            dates work for you, or pick any availability window on the calendar below.
          </>
        ) : (
          <>
            Tap <strong className="font-semibold text-[color:var(--on-surface)] dark:text-neutral-100">Works for me</strong> to vote yes on
            the host&apos;s dates, or choose a different range below.
          </>
        )}
      </p>

      {/* Action buttons */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <button
          type="button"
          disabled={busy || (worksForMeMode === "confirmedAck" && viewerAcknowledgedConfirmed) || blockedByDates}
          onClick={() => castWorksForMe()}
          className={`rounded-full px-6 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
            votedForProposal
              ? `${primaryFilledInteractive} ring-2 ring-slate-400 dark:ring-[#d4d2cd]`
              : "border border-[color:var(--hairline)] bg-white text-[color:var(--on-surface)] hover:border-[color:var(--hairline-strong)] hover:bg-[color:var(--surface-container-low)] dark:border-white/10 dark:bg-dm-card dark:text-neutral-100 dark:hover:border-white/25 dark:hover:bg-white/5"
          }`}
        >
          {worksForMeMode === "confirmedAck" && viewerAcknowledgedConfirmed ? "Thanks — noted" : "Works for me"}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => setAlternateModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-[color:var(--hairline)] bg-white px-6 py-2.5 text-sm font-semibold text-[color:var(--on-surface)] transition hover:border-[color:var(--hairline-strong)] disabled:opacity-50 dark:border-white/10 dark:bg-dm-card dark:text-neutral-200 dark:hover:border-white/20"
          aria-haspopup="dialog"
        >
          <CalendarGlyph className="shrink-0 opacity-70" />
          Suggest other dates
        </button>
      </div>

      <p className="text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-500">
        Or use the calendar below — click two dates for your range.
      </p>

      {/* Inline calendar */}
      <div id="dates-member-alternate-range" className="rounded-2xl outline-none">
        <DatesVoteCalendar
          decisionKey={decisionKey}
          options={options}
          votes={votes}
          mine={mine}
          busy={busy}
          quorum={quorum}
          voterN={voterN}
          onVote={onVote}
          tripId={tripId}
          embeddedUnderHostProposal
        />
      </div>

      <AlternateDatesRangeModal
        open={alternateModalOpen}
        onClose={() => setAlternateModalOpen(false)}
        decisionKey={decisionKey}
        options={options}
        mine={mine}
        busy={busy}
        onVote={onVote}
      />

      <p className="text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">
        {worksForMeMode === "confirmedAck" ? (
          mineTrim || viewerAcknowledgedConfirmed ? (
            <>
              {viewerAcknowledgedConfirmed && !mineTrim
                ? "Noted — you can still update your availability on the calendar above."
                : "Your availability is recorded. The host can see all responses here."}
            </>
          ) : (
            <>Share whether these dates work or use the calendar for your availability ({voterN}/{quorum}+ travelers).</>
          )
        ) : mineTrim ? (
          <>
            Your availability is recorded. The host may confirm the locked date once enough votes are in.
          </>
        ) : (
          <>
            Waiting on your vote ({voterN}/{quorum}+ toward locking).
          </>
        )}
      </p>
    </div>
  );
}
