"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CollabStateV1 } from "@/shared/collaboration";
import {
  DAY_VOTE_DAY_PAGE_CATEGORIES,
  mergeDayVoteStateForDate,
  parseDayVoteState,
  type DayVoteCategory,
  type DayVoteOption,
} from "@/shared/day-collaboration";
import type { PlacePreview } from "@/shared/place-preview";
import { formatLocalIsoDate } from "@/shared/date-option-parse";
import { estimateHostDaySpendUsd } from "@/shared/host-day-spend-estimate";
import { useTripWorkspaceRealtime } from "@/frontend/hooks/use-trip-workspace-realtime";
import {
  enumerateLocalIsoDays,
  hotelStayForDay,
  normalizePlan,
  parseLocalIsoDate,
  type HostActivityPin,
  type TripPlan,
} from "@/shared/trip-plan";
import { DayItineraryMap, DayStopPin, type DayMapStop } from "@/frontend/components/day-itinerary-map";
import { DuffelFlightBookingDrawer } from "@/frontend/components/duffel-flight-booking-drawer";
import { DuffelLodgingBookingDrawer } from "@/frontend/components/duffel-lodging-booking-drawer";

type Props = {
  tripId: string;
  dateIso: string;
  /** Optional — use first plan-derived label if missing */
  locale?: string;
  initialPlan: TripPlan;
  initialCollab: CollabStateV1;
  viewerUserId: string;
  isHost: boolean;
};

type SuggestPermission = "vote_only" | "can_suggest";

function collabHintsFrom(collab: CollabStateV1) {
  return {
    cardChat: collab.cardChat,
    adjustmentSubmissions: collab.adjustmentSubmissions,
  };
}

function startOfDay(x: Date) {
  return new Date(x.getFullYear(), x.getMonth(), x.getDate(), 0, 0, 0, 0);
}

function shiftIsoDay(iso: string, delta: number): string | null {
  const d = parseLocalIsoDate(iso);
  if (!d) return null;
  const n = new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta, 12, 0, 0, 0);
  return formatLocalIsoDate(n);
}

/** Blue chevron — rotates when open. */
function AccordionChevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 18"
      className={`h-4 w-6 shrink-0 text-[#2563EB] transition-transform duration-200 dark:text-[#60A5FA] ${open ? "rotate-180" : ""} ${className ?? ""}`}
      aria-hidden
    >
      <polygon points="12,17 3,4 21,4" fill="currentColor" />
    </svg>
  );
}

function DropSection({
  title,
  subtitle,
  sectionId,
  defaultOpen,
  children,
}: {
  title: string;
  subtitle?: string;
  sectionId: string;
  /** When true (default), section starts expanded */
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const panelId = `${sectionId}-panel`;

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-900/12 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-white/[0.03]">
      <button
        type="button"
        id={`${sectionId}-header`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition hover:bg-neutral-50/80 dark:hover:bg-white/[0.04] sm:px-6 sm:py-5"
      >
        <div className="min-w-0">
          <span className="font-sans text-[13px] font-black uppercase tracking-[0.08em] text-neutral-950 dark:text-white">
            {title}
          </span>
          {subtitle ? (
            <p className="mt-0.5 font-sans text-[11px] text-neutral-500 dark:text-neutral-400">
              {subtitle}
            </p>
          ) : null}
        </div>
        <AccordionChevron open={open} className="mt-0.5" />
      </button>
      {open ? (
        <div id={panelId} role="region" aria-labelledby={`${sectionId}-header`} className="border-t border-neutral-900/8 dark:border-white/8">
          <div className="px-5 pb-6 pt-4 sm:px-6 sm:pb-7 sm:pt-5">{children}</div>
        </div>
      ) : null}
    </div>
  );
}

function formatUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

function DaySpendEstimateBar({
  baselineGroupUsd,
  mealsUsd,
  activitiesUsd,
  estimatedTotalUsd,
}: {
  baselineGroupUsd: number | null;
  hotelUsd: number;
  mealsUsd: number;
  activitiesUsd: number;
  transportUsd: number;
  estimatedTotalUsd: number;
}) {
  const baseline = baselineGroupUsd;
  const dayTotal = mealsUsd + activitiesUsd;
  const fillPct = baseline != null && baseline > 0 ? Math.min(100, (dayTotal / baseline) * 100) : 100;
  const over = baseline != null && baseline > 0 && dayTotal > baseline;

  const parts = [
    { key: "m", usd: mealsUsd, className: "bg-amber-400 dark:bg-amber-500" },
    { key: "a", usd: activitiesUsd, className: "bg-pink-500 dark:bg-pink-600" },
  ].filter((p) => p.usd > 0);

  return (
    <div className="mt-3 space-y-2">
      {dayTotal <= 0 ? (
        <p className="font-sans text-xs text-neutral-500 dark:text-neutral-500">
          Pin restaurants or experiences on this day to build an estimate.
        </p>
      ) : (
        <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-white/15">
          <div
            className="flex h-full min-w-[2px] overflow-hidden rounded-full"
            style={{ width: `${Math.min(100, fillPct)}%` }}
          >
            {parts.map((p) => (
              <div key={p.key} className={`min-w-0 ${p.className}`} style={{ flex: p.usd }} title={formatUsd(p.usd)} />
            ))}
          </div>
        </div>
      )}
      <ul className="space-y-1 font-sans text-[11px] text-neutral-600 dark:text-neutral-400">
        {mealsUsd > 0 ? (
          <li className="flex justify-between gap-2">
            <span className="text-amber-800 dark:text-amber-200">Restaurants (est.)</span>
            <span className="tabular-nums font-semibold text-neutral-800 dark:text-neutral-200">
              {formatUsd(mealsUsd)}
            </span>
          </li>
        ) : null}
        {activitiesUsd > 0 ? (
          <li className="flex justify-between gap-2">
            <span className="text-pink-700 dark:text-pink-300">Experiences</span>
            <span className="tabular-nums font-semibold text-neutral-800 dark:text-neutral-200">
              {formatUsd(activitiesUsd)}
            </span>
          </li>
        ) : null}

        {dayTotal > 0 ? (
          <li className="flex justify-between gap-2 border-t border-neutral-200 pt-1.5 dark:border-white/10">
            <span className="font-bold text-neutral-800 dark:text-neutral-200">Estimated day total</span>
            <span className="tabular-nums font-bold text-neutral-950 dark:text-white">
              {formatUsd(dayTotal)}
            </span>
          </li>
        ) : null}

        {baseline != null && baseline > 0 ? (
          <li className="flex justify-between gap-2">
            <span>Your trip budget / day (group)</span>
            <span className="tabular-nums font-semibold text-neutral-700 dark:text-neutral-300">
              {formatUsd(baseline)}
            </span>
          </li>
        ) : (
          <li className="text-neutral-500 dark:text-neutral-500">
            Add a dollar amount in <span className="font-semibold">Budget</span> on the workspace to compare.
          </li>
        )}
      </ul>
      {over ? (
        <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
          About {formatUsd(dayTotal - baseline!)} over today&apos;s share — rough estimate only.
        </p>
      ) : null}
      <p className="text-[10px] leading-snug text-neutral-500 dark:text-neutral-500">
        Based on pinned places, party size, and trip length. Not a quote.
      </p>
    </div>
  );
}

function isFlightActivityPin(p: HostActivityPin): boolean {
  const n = (p.experience.name ?? "").trim();
  return n.startsWith("Flight out ·") || n.startsWith("Flight back ·");
}







function EmptyHint({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[6rem] items-center justify-center rounded-xl border border-dashed border-[color:var(--hairline)] bg-[color:var(--surface-container-low)]/80 text-center text-sm text-[color:var(--on-surface-muted)] dark:border-white/10 dark:bg-dm-page/80 dark:text-neutral-500">
      {label}
    </div>
  );
}

function displayOptionLabel(label: string): string {
  const trimmed = label.trim();
  if (trimmed.length > 0 && trimmed === trimmed.toLowerCase() && /[a-z]/.test(trimmed)) {
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  }
  return trimmed;
}

function parseDetailSegments(detail: string): { prefix?: string; segments: string[] } {
  const trimmed = detail.trim();
  const groupMatch = /^From your group:\s*(.*)$/i.exec(trimmed);
  const body = groupMatch ? groupMatch[1]!.trim() : trimmed;
  const segments = body
    .split("·")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    prefix: groupMatch ? "From your group" : undefined,
    segments: segments.length > 0 ? segments : [trimmed],
  };
}

function DayOptionDetail({ detail }: { detail: string }) {
  const { prefix, segments } = parseDetailSegments(detail);
  const useChips = segments.length > 1 || Boolean(prefix);

  if (!useChips) {
    return <p className="mt-1.5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">{detail}</p>;
  }

  return (
    <div className="mt-2 space-y-1.5">
      {prefix ? (
        <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
          {prefix}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {segments.map((segment) => (
          <span
            key={segment}
            className="rounded-md border border-neutral-200/80 bg-neutral-50 px-2 py-0.5 text-xs text-neutral-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-300"
          >
            {segment}
          </span>
        ))}
      </div>
    </div>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
    </svg>
  );
}

function DayVoteOptionCard({
  opt,
  isHost,
  voted,
  skipped,
  isLocked,
  dimmed,
  voteBusy,
  hostBusy,
  onVote,
  onSkip,
  onConfirm,
  onSetTime,
  onRemove,
  onUnlock,
}: {
  opt: DayVoteOption;
  isHost: boolean;
  voted: boolean;
  skipped: boolean;
  isLocked: boolean;
  dimmed: boolean;
  voteBusy: boolean;
  hostBusy: boolean;
  onVote: () => void;
  onSkip: () => void;
  onConfirm: () => void;
  onSetTime: () => void;
  onRemove: () => void;
  onUnlock: () => void;
}) {
  const isConci = opt.suggestedBy === "conci:auto";
  const voteCount = opt.votes.length;
  const skipCount = opt.skipVotes?.length ?? 0;

  return (
    <li
      className={[
        "overflow-hidden rounded-2xl border transition",
        isLocked
          ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-800/50 dark:bg-emerald-950/20"
          : dimmed
            ? "border-neutral-100 bg-neutral-50/80 opacity-55 dark:border-white/5 dark:bg-white/[0.02]"
            : "border-neutral-200/90 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-white/10 dark:bg-dm-elevated dark:shadow-none",
      ].join(" ")}
    >
      <div className="px-4 py-3.5 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-sans text-base font-semibold leading-snug text-neutral-900 dark:text-white">
                {displayOptionLabel(opt.label)}
              </h3>
              {isLocked ? (
                <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  Confirmed
                </span>
              ) : null}
              {isConci && !isLocked ? (
                <span className="rounded-full border border-[#2563EB]/25 bg-[#2563EB]/8 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#2563EB] dark:border-[#60A5FA]/30 dark:bg-[#60A5FA]/10 dark:text-[#60A5FA]">
                  Conci pick
                </span>
              ) : null}
            </div>
            {opt.time ? (
              <p className="mt-1 text-sm font-medium text-[#2563EB] dark:text-[#60A5FA]">
                {isLocked ? opt.time : `Suggested · ${opt.time}`}
              </p>
            ) : null}
            {opt.detail && !isLocked ? <DayOptionDetail detail={opt.detail} /> : null}
            {isLocked && opt.lockedDetail ? (
              <p className="mt-1.5 text-sm text-emerald-800 dark:text-emerald-200">
                {opt.time ? `${opt.time} · ` : ""}
                {opt.lockedDetail}
              </p>
            ) : null}
          </div>
          {opt.href ? (
            <a
              href={opt.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 transition hover:border-[#2563EB] hover:text-[#2563EB] dark:border-white/15 dark:text-neutral-300 dark:hover:border-[#60A5FA] dark:hover:text-[#60A5FA]"
            >
              Open
              <ExternalLinkIcon className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>

        {!isLocked ? (
          <div className="mt-4 border-t border-neutral-100 pt-3 dark:border-white/8">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-500">
                Your vote
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={voteBusy}
                  onClick={onVote}
                  className={[
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40",
                    voted
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "border border-neutral-200 bg-white text-neutral-700 hover:border-emerald-500 hover:text-emerald-700 dark:border-white/15 dark:bg-transparent dark:text-neutral-300",
                  ].join(" ")}
                >
                  Interested
                  {voteCount > 0 ? (
                    <span
                      className={[
                        "rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums",
                        voted ? "bg-white/20 text-white" : "bg-neutral-100 text-neutral-600 dark:bg-white/10",
                      ].join(" ")}
                    >
                      {voteCount}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  disabled={voteBusy}
                  onClick={onSkip}
                  className={[
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40",
                    skipped
                      ? "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900"
                      : "border border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 dark:border-white/15 dark:bg-transparent dark:text-neutral-400",
                  ].join(" ")}
                >
                  Not for me
                  {skipCount > 0 ? (
                    <span
                      className={[
                        "rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums",
                        skipped ? "bg-white/20" : "bg-neutral-100 text-neutral-600 dark:bg-white/10",
                      ].join(" ")}
                    >
                      {skipCount}
                    </span>
                  ) : null}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {isHost ? (
          <div
            className={[
              "mt-3 flex flex-col gap-2 border-t border-neutral-100 pt-3 dark:border-white/8 sm:flex-row sm:items-center sm:justify-between",
              isLocked ? "mt-4" : "",
            ].join(" ")}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-500">
              {isLocked ? "Host" : "Finalize"}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {isLocked ? (
                <button
                  type="button"
                  disabled={hostBusy}
                  onClick={onUnlock}
                  className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 transition hover:border-neutral-400 disabled:opacity-40 dark:border-white/15 dark:text-neutral-400"
                >
                  Unconfirm
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={hostBusy}
                    onClick={onConfirm}
                    className="rounded-lg bg-[#2563EB] px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1d4ed8] disabled:opacity-40"
                  >
                    Confirm
                  </button>
                  {!opt.time ? (
                    <button
                      type="button"
                      disabled={hostBusy}
                      onClick={onSetTime}
                      className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 transition hover:border-[#2563EB] hover:text-[#2563EB] disabled:opacity-40 dark:border-white/15 dark:text-neutral-400"
                    >
                      Set time
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={hostBusy}
                    onClick={onRemove}
                    className="rounded-lg px-2 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-40 dark:text-rose-400 dark:hover:bg-rose-950/30"
                  >
                    Remove
                  </button>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function dayCategoryTitle(category: DayVoteCategory): string {
  switch (category) {
    case "restaurants":
      return "Restaurants";
    case "hotels":
      return "Lodging";
    case "flights":
      return "Transportation";
    case "activities":
      return "Activities";
    default:
      return "Other options";
  }
}

type ScheduleRow = {
  key: string;
  label: string;
  sub: string;
  time?: string;
  href?: string;
  description?: string;
  dotClass: string;
  confirmed?: boolean;
  confirmedDetail?: string;
};

/** Minutes from midnight for chronological sort; null = no parseable time. */
function parseTimeToSortKey(time?: string): number | null {
  if (!time?.trim()) return null;
  const t = time.trim().toLowerCase();

  const clock = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (clock) {
    let h = parseInt(clock[1]!, 10);
    const m = clock[2] ? parseInt(clock[2], 10) : 0;
    const ampm = clock[3] ?? (t.includes("pm") ? "pm" : t.includes("am") ? "am" : null);
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    if (!ampm && h >= 1 && h <= 7) h += 12;
    return h * 60 + m;
  }

  if (/early morning|sunrise|breakfast|brunch/i.test(t)) return 8 * 60;
  if (/morning|late morning/i.test(t)) return 10 * 60;
  if (/noon|midday|lunch/i.test(t)) return 12 * 60;
  if (/afternoon/i.test(t)) return 14 * 60;
  if (/evening|dinner|sunset/i.test(t)) return 18 * 60;
  if (/night|late/i.test(t)) return 21 * 60;
  return null;
}

function sortScheduleRows(rows: ScheduleRow[]): ScheduleRow[] {
  return [...rows].sort((a, b) => {
    const ka = parseTimeToSortKey(a.time);
    const kb = parseTimeToSortKey(b.time);
    if (ka == null && kb == null) return a.label.localeCompare(b.label);
    if (ka == null) return 1;
    if (kb == null) return -1;
    if (ka !== kb) return ka - kb;
    return a.label.localeCompare(b.label);
  });
}

/** Extract IATA pair from text like "MIA → JFK" or "MIA -> JFK". */
function extractIataCodes(text: string): { origin: string; destination: string } | null {
  const m = text.match(/([A-Z]{3})\s*(?:→|->)\s*([A-Z]{3})/);
  return m ? { origin: m[1]!, destination: m[2]! } : null;
}

/** Advance a YYYY-MM-DD date by one day. */
function nextDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

type BookingDrawerState =
  | { type: "flight"; row: ScheduleRow; origin: string; destination: string }
  | { type: "lodging" }
  | null;

function DayScheduleTimeline({
  items,
  subtitle,
  tripId,
  dateIso,
  destination,
  passengerCount,
}: {
  items: ScheduleRow[];
  subtitle?: string;
  tripId?: string;
  dateIso?: string;
  destination?: string;
  passengerCount?: number;
}) {
  const sorted = useMemo(() => sortScheduleRows(items), [items]);
  const [drawerState, setDrawerState] = useState<BookingDrawerState>(null);

  return (
    <>
      <section className="overflow-hidden rounded-xl border border-neutral-900/12 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-white/[0.03]">
        <div className="border-b border-neutral-900/8 px-5 py-4 dark:border-white/8 sm:px-6 sm:py-5">
          <h2 className="font-sans text-[13px] font-black uppercase tracking-[0.08em] text-neutral-950 dark:text-white">
            Today&apos;s itinerary
          </h2>
          {subtitle ? (
            <p className="mt-0.5 font-sans text-[11px] text-neutral-500 dark:text-neutral-400">{subtitle}</p>
          ) : null}
        </div>
        <div className="px-5 py-5 sm:px-6 sm:py-6">
          {sorted.length === 0 ? (
            <EmptyHint label="No itinerary yet — generate one from the trip calendar, or pin places manually." />
          ) : (
            <ol className="relative space-y-0">
              {sorted.map((row, index) => {
                const iataFromRow = row.sub === "Flight"
                  ? (extractIataCodes(row.description ?? "") ?? extractIataCodes(row.label))
                  : null;

                const onBookFlight = iataFromRow && dateIso && tripId
                  ? () => setDrawerState({ type: "flight", row, origin: iataFromRow.origin, destination: iataFromRow.destination })
                  : undefined;

                const onBookLodging = row.sub === "Lodging" && dateIso && tripId && destination
                  ? () => setDrawerState({ type: "lodging" })
                  : undefined;

                return (
                  <li key={row.key} className="relative flex gap-4 pb-8 last:pb-0">
                    {index < sorted.length - 1 ? (
                      <span
                        className="absolute left-[5px] top-3 h-[calc(100%-4px)] w-px bg-neutral-200 dark:bg-white/10"
                        aria-hidden
                      />
                    ) : null}
                    <span
                      className={`relative z-[1] mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white dark:ring-dm-card ${row.confirmed ? "bg-emerald-500" : row.dotClass}`}
                      aria-hidden
                    />
                    <div className="min-w-[4.5rem] shrink-0 pt-0.5">
                      <p className="text-xs font-bold tabular-nums leading-tight text-[#2563EB] dark:text-[#60A5FA]">
                        {row.time?.trim() || "—"}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <ScheduleTimelineRowContent
                        row={row}
                        onBookFlight={onBookFlight}
                        onBookLodging={onBookLodging}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </section>

      {/* Flight booking drawer */}
      {drawerState?.type === "flight" && tripId && dateIso && (
        <DuffelFlightBookingDrawer
          open
          onClose={() => setDrawerState(null)}
          tripId={tripId}
          origin={drawerState.origin}
          destination={drawerState.destination}
          departureDate={dateIso}
          passengerCount={Math.max(1, passengerCount ?? 1)}
          flightLabel={drawerState.row.label}
        />
      )}

      {/* Lodging booking drawer */}
      {drawerState?.type === "lodging" && tripId && dateIso && destination && (
        <DuffelLodgingBookingDrawer
          open
          onClose={() => setDrawerState(null)}
          tripId={tripId}
          initialDestination={destination}
          initialCheckIn={dateIso}
          initialCheckOut={nextDay(dateIso)}
          initialGuests={Math.max(1, passengerCount ?? 1)}
          initialRooms={1}
        />
      )}
    </>
  );
}

function ScheduleTimelineRowContent({
  row,
  onBookFlight,
  onBookLodging,
}: {
  row: ScheduleRow;
  onBookFlight?: () => void;
  onBookLodging?: () => void;
}) {
  const btnClass =
    "mt-2 inline-flex rounded-full border border-neutral-200 px-3 py-1 text-[11px] font-semibold text-neutral-600 transition hover:border-[#2563EB] hover:text-[#2563EB] dark:border-white/10 dark:text-neutral-400 dark:hover:border-[#60A5FA] dark:hover:text-[#60A5FA]";
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-400 dark:text-neutral-500">
          {row.sub}
        </span>
        {row.confirmed ? (
          <span className="rounded-full bg-emerald-100 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            ✓ Confirmed
          </span>
        ) : null}
      </div>
      <p className="mt-0.5 font-sans text-sm font-semibold text-neutral-900 dark:text-white">{row.label}</p>
      {row.confirmedDetail ? (
        <p className="mt-0.5 text-[11px] text-emerald-700 dark:text-emerald-300">{row.confirmedDetail}</p>
      ) : row.description ? (
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
          {row.description}
        </p>
      ) : null}
      {row.sub === "Flight" && onBookFlight ? (
        <button type="button" onClick={onBookFlight} className={btnClass}>Book</button>
      ) : row.sub === "Lodging" && onBookLodging ? (
        <button type="button" onClick={onBookLodging} className={btnClass}>Book stay</button>
      ) : row.href ? (
        <a href={row.href} target="_blank" rel="noopener noreferrer" className={btnClass}>
          {row.sub === "Transport" ? "Details" : row.confirmed ? "Open ↗" : "Book"}
        </a>
      ) : null}
    </>
  );
}

const CATEGORY_DOT: Record<string, string> = {
  transport: "bg-sky-400",
  food: "bg-amber-400",
  activity: "bg-[#2563EB]",
  lodging: "bg-emerald-500",
  "free-time": "bg-neutral-300",
  Restaurant: "bg-amber-400",
  Activity: "bg-[#2563EB]",
};

function lockPromptText(category: DayVoteCategory): string {
  switch (category) {
    case "restaurants":
      return "Add restaurant confirmation detail (example: 7:30 PM reservation under Kim).";
    case "hotels":
      return "Add lodging confirmation detail (example: check-in 3:00 PM, confirmation #12345).";
    case "flights":
      return "Add transportation confirmation detail (example: DL 123, departs 8:15 AM).";
    case "activities":
      return "Add activity confirmation detail (example: starts 10:00 AM, tickets booked).";
    default:
      return "Add confirmation detail.";
  }
}

export function TripHostSetupDayPage({
  tripId,
  dateIso,
  locale,
  initialPlan,
  initialCollab,
  viewerUserId,
  isHost,
}: Props) {
  const router = useRouter();
  const [plan, setPlan] = useState(initialPlan);
  const [dayVotingByDate, setDayVotingByDate] = useState(() =>
    mergeDayVoteStateForDate(initialPlan, parseDayVoteState(initialCollab.dayVoting), dateIso, collabHintsFrom(initialCollab))
  );
  const [dayErr, setDayErr] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [canSuggest, setCanSuggest] = useState<boolean>(isHost);
  const dreamTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [suggestDraft, setSuggestDraft] = useState<
    Partial<Record<DayVoteCategory, { label: string; detail: string; href: string }>>
  >({});
  const [copilotSearch, setCopilotSearch] = useState<
    Partial<Record<DayVoteCategory, { loading: boolean; results: PlacePreview[]; error: string | null }>>
  >({});

  type AcSuggestion = { name: string; address: string; mapsUrl: string };
  const [autoSuggest, setAutoSuggest] = useState<
    Partial<Record<DayVoteCategory, { items: AcSuggestion[]; open: boolean }>>
  >({});
  const acTimerRef = useRef<Partial<Record<DayVoteCategory, ReturnType<typeof setTimeout>>>>({});

  const suppressRealtimeUntilRef = useRef(0);

  useEffect(() => {
    setPlan(initialPlan);
    setDayVotingByDate(mergeDayVoteStateForDate(initialPlan, parseDayVoteState(initialCollab.dayVoting), dateIso, collabHintsFrom(initialCollab)));
  }, [initialPlan, initialCollab, dateIso]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/trip-plans/${tripId}/day-vote-permissions`, { credentials: "include" });
        const j = (await res.json().catch(() => ({}))) as {
          viewerPermission?: SuggestPermission;
          error?: string;
        };
        if (cancelled || !res.ok) return;
        setCanSuggest((j.viewerPermission ?? (isHost ? "can_suggest" : "vote_only")) === "can_suggest");
      } catch {
        if (!cancelled) setCanSuggest(isHost);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId, isHost]);

  const [dreamText, setDreamText] = useState("");
  const [dreamBusy, setDreamBusy] = useState(false);
  const [dreamErr, setDreamErr] = useState<string | null>(null);
  const [dreamReply, setDreamReply] = useState<string | null>(null);

  const syncPlanFromServer = useCallback(
    (next: TripPlan) => {
      setPlan(next);
      void router.refresh();
    },
    [router]
  );

  useTripWorkspaceRealtime(
    tripId,
    useCallback(
      (row) => {
        if (row.plan != null) {
          try {
            setPlan(normalizePlan(row.plan));
          } catch {
            /* ignore */
          }
        }
        const payload = row.collab_state as { dayVoting?: unknown } | undefined;
        if (payload?.dayVoting !== undefined) {
          setDayVotingByDate((prev) =>
            mergeDayVoteStateForDate(plan, { ...prev, ...parseDayVoteState(payload.dayVoting) }, dateIso, collabHintsFrom(initialCollab))
          );
        }
      },
      [plan, dateIso, initialCollab]
    ),
    { enabled: true, suppressRealtimeUntilRef }
  );

  const runDayAction = useCallback(
    async (payload: Record<string, unknown>) => {
      setDayErr(null);
      const act = String(payload.action);
      const cat = String(payload.category ?? "");
      const oid = typeof payload.optionId === "string" ? payload.optionId : "";
      const key =
        act === "pinToCalendar"
          ? `pinToCalendar:${cat}:${oid}`
          : act === "toggleNotInterested"
            ? `toggleNotInterested:${cat}:${oid}`
            : `${act}:${cat}`;
      setBusyKey(key);
      try {
        const res = await fetch(`/api/trip-plans/${tripId}/day-vote`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dateIso, ...payload }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string; dayVoting?: unknown; plan?: TripPlan };
        if (!res.ok) throw new Error(j.error || "Could not save");
        const mergedPlan = j.plan ? normalizePlan(j.plan) : plan;
        if (j.plan) {
          setPlan(mergedPlan);
          void router.refresh();
        }
        if (j.dayVoting) {
          setDayVotingByDate(
            mergeDayVoteStateForDate(mergedPlan, parseDayVoteState(j.dayVoting), dateIso, collabHintsFrom(initialCollab))
          );
        }
      } catch (e) {
        setDayErr(e instanceof Error ? e.message : "Could not save.");
      } finally {
        setBusyKey(null);
      }
    },
    [tripId, dateIso, plan, initialCollab, router]
  );

  const submitDayDream = useCallback(async () => {
    const t = dreamText.trim();
    if (!t || t.length > 4000) {
      setDreamErr("Say something shorter (under 4000 characters).");
      return;
    }
    setDreamBusy(true);
    setDreamErr(null);
    setDreamReply(null);
    try {
      const res = await fetch(`/api/trip-plans/${tripId}/host-copilot`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `[Day ${dateIso}] ${t}`,
          focusDateIso: dateIso,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        assistantText?: string;
        plan?: TripPlan;
        applied?: boolean;
      };
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "Copilot unavailable.");
      if (typeof j.assistantText === "string") setDreamReply(j.assistantText.trim());
      else setDreamReply("Done.");
      if (j.plan) syncPlanFromServer(normalizePlan(j.plan));
    } catch (e) {
      setDreamErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setDreamBusy(false);
    }
  }, [dateIso, dreamText, syncPlanFromServer, tripId]);

  const hostSetup = plan.hostSetup;
  const dest = plan.location?.trim() || "Destination TBD";

  const formatted = useMemo(() => {
    const d = parseLocalIsoDate(dateIso);
    const line2 = d
      ? d.toLocaleDateString(locale ?? undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" })
      : dateIso;

    let dayIndexLabel: string | null = null;
    const tr = plan.hostSetup?.tripRange;
    if (tr?.startIso && tr.endIso && d) {
      const start = parseLocalIsoDate(tr.startIso);
      const end = parseLocalIsoDate(tr.endIso);
      if (start && end) {
        const dd = startOfDay(d).getTime();
        const ds = startOfDay(start).getTime();
        const de = startOfDay(end).getTime();
        if (dd >= ds && dd <= de) {
          dayIndexLabel = `Day ${Math.round((dd - ds) / (24 * 60 * 60 * 1000)) + 1}`;
        }
      }
    }
    return { line2, dayIndexLabel };
  }, [dateIso, locale, plan]);

  const meals = (hostSetup?.restaurantPins ?? []).filter((p) => p.dateIso === dateIso && p.kept);
  const activities = (hostSetup?.activityPins ?? []).filter((p) => p.dateIso === dateIso && p.kept);
  const dayVoting = useMemo(
    () => mergeDayVoteStateForDate(plan, dayVotingByDate, dateIso, collabHintsFrom(initialCollab))[dateIso],
    [plan, dayVotingByDate, dateIso, initialCollab]
  );



  /** Items for Today's Itinerary — generatedItinerary base, confirmed vote options override/inject. */
  const scheduleItems = useMemo(() => {
    const rows: ScheduleRow[] = [];

    // Base: generatedItinerary activities
    const genDay = plan.generatedItinerary?.days.find((d) => d.dateIso === dateIso);
    if (genDay && genDay.activities.length > 0) {
      for (const act of genDay.activities) {
        if (act.category === "free-time") continue;
        const isTransport = act.category === "transport";
        const isFlight = isTransport && /flight/i.test(act.title);
        const isInterCity = isTransport && /→|->|bus|train|drive|ferry/i.test(act.title);

        let sub = "Activity";
        if (act.category === "food") sub = "Restaurant";
        else if (isFlight) sub = "Flight";
        else if (isInterCity) sub = "Transport";
        else if (isTransport) sub = "Transport";
        else if (act.category === "lodging") sub = "Lodging";

        rows.push({
          key: `gen-${act.time}-${act.title}`,
          label: act.title,
          sub,
          time: act.time || undefined,
          href: act.bookingUrl || (isFlight ? `https://www.google.com/travel/flights?hl=en&q=${encodeURIComponent(act.title.replace(/^Flight:\s*/i, ""))}` : undefined),
          description: act.description || undefined,
          dotClass: CATEGORY_DOT[act.category] ?? "bg-neutral-300",
        });
      }
    } else {
      // Fallback: use pins
      for (const p of meals) {
        rows.push({ key: `m-${p.place.mapsUrl}`, label: p.place.name, sub: "Restaurant",
          href: p.place.mapsUrl, dotClass: CATEGORY_DOT["Restaurant"]! });
      }
      for (const p of activities) {
        if (/->/.test(p.experience.name) || /flight/i.test(p.experience.name)) continue;
        rows.push({ key: `a-${p.experience.bookingUrl}`, label: p.experience.name, sub: "Activity",
          href: p.experience.bookingUrl || undefined, dotClass: CATEGORY_DOT["Activity"]! });
      }
    }

    // Overlay: for each confirmed (locked) vote option, inject into schedule or update existing row
    const voteCategoriesToShow = ["restaurants", "activities"] as const;
    for (const voteCategory of voteCategoriesToShow) {
      const cat = dayVoting?.[voteCategory];
      if (!cat?.lockedOptionId) continue;
      const locked = cat.options.find((o) => o.id === cat.lockedOptionId);
      if (!locked) continue;

      // Try to find existing row by fuzzy name match
      const normLocked = locked.label.trim().toLowerCase();
      const existingIdx = rows.findIndex((r) => {
        const normRow = r.label.trim().toLowerCase();
        return normRow.includes(normLocked.slice(0, 8)) || normLocked.includes(normRow.slice(0, 8));
      });

      if (existingIdx >= 0) {
        // Update existing row with confirmed time + badge
        const existing = rows[existingIdx]!;
        const confirmedTime = locked.time ?? existing.time;
        rows[existingIdx] = {
          ...existing,
          time: confirmedTime,
          href: locked.href ?? existing.href,
          confirmed: true,
          confirmedDetail: locked.lockedDetail,
        };
      } else {
        // Add as a new confirmed-only row
        const t = locked.time ?? "";
        rows.push({
          key: `confirmed-${locked.id}`,
          label: locked.label,
          sub: voteCategory === "restaurants" ? "Restaurant" : "Activity",
          time: t || undefined,
          href: locked.href || undefined,
          dotClass: voteCategory === "restaurants" ? "bg-amber-400" : "bg-[#2563EB]",
          confirmed: true,
          confirmedDetail: locked.lockedDetail,
        });
      }
    }

    return sortScheduleRows(rows);
  }, [plan.generatedItinerary, dateIso, meals, activities, dayVoting]);

  // Derive map stops from the schedule — skip flights (airports, not local pins).
  const mapStops = useMemo<DayMapStop[]>(
    () =>
      scheduleItems
        .filter((row) => row.sub !== "Flight")
        .map((row, idx) => ({
          index: idx + 1,
          label: row.label,
          sub: row.sub,
          mapsUrl: row.href,
          time: row.time,
          description: row.description,
        })),
    [scheduleItems]
  );

  const prevIso = shiftIsoDay(dateIso, -1);
  const nextIso = shiftIsoDay(dateIso, 1);
  const hotel = hotelStayForDay(plan.hostSetup?.hotelStays ?? [], dateIso);

  const tripRange = plan.hostSetup?.tripRange;
  const spendBreakdown = useMemo(() => {
    if (!tripRange?.startIso || !tripRange.endIso) return null;
    if (!enumerateLocalIsoDays(tripRange.startIso, tripRange.endIso).includes(dateIso)) return null;
    const dayMeals = (plan.hostSetup?.restaurantPins ?? []).filter((p) => p.dateIso === dateIso && p.kept);
    const dayActs = (plan.hostSetup?.activityPins ?? []).filter(
      (p) => p.dateIso === dateIso && p.kept && !isFlightActivityPin(p)
    );
    const dayHotel = hotelStayForDay(plan.hostSetup?.hotelStays ?? [], dateIso);
    return estimateHostDaySpendUsd(
      plan,
      dateIso,
      tripRange.startIso,
      tripRange.endIso,
      dayMeals.length,
      dayActs,
      dayHotel
    );
  }, [plan, dateIso, tripRange?.startIso, tripRange?.endIso]);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-4 sm:px-6 lg:px-8">
      <nav className="mb-8 flex flex-wrap items-center gap-4 text-sm">
        <Link
          href={`/trip/${tripId}/setup#sec-dates`}
          className="font-semibold text-[#2563EB] underline-offset-4 hover:underline dark:text-[#60A5FA]"
        >
          ← Trip calendar
        </Link>
        <span className="text-neutral-300 dark:text-white/25">/</span>
        <span className="text-neutral-500 dark:text-neutral-400">{isHost ? "Host" : "Guest"} day view</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-bold tracking-tight text-neutral-950 dark:text-white sm:text-[2.125rem] sm:leading-tight">
          {formatted.dayIndexLabel ? `${formatted.dayIndexLabel}: ${formatted.line2}` : formatted.line2}
        </h1>
        <div className="flex items-center gap-2">
          {prevIso ? (
            <Link
              href={`/trip/${tripId}/setup/day?date=${encodeURIComponent(prevIso)}`}
              className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-neutral-300 bg-white text-lg font-bold text-neutral-700 transition hover:border-neutral-900 hover:text-neutral-900 dark:border-white/20 dark:bg-transparent dark:text-neutral-300 dark:hover:border-white dark:hover:text-white"
              aria-label="Previous day"
            >
              ‹
            </Link>
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-300 dark:text-neutral-700">
              ‹
            </span>
          )}
          {nextIso ? (
            <Link
              href={`/trip/${tripId}/setup/day?date=${encodeURIComponent(nextIso)}`}
              className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-neutral-300 bg-white text-lg font-bold text-neutral-700 transition hover:border-neutral-900 hover:text-neutral-900 dark:border-white/20 dark:bg-transparent dark:text-neutral-300 dark:hover:border-white dark:hover:text-white"
              aria-label="Next day"
            >
              ›
            </Link>
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-300 dark:text-neutral-700">
              ›
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,380px)_1fr] lg:items-stretch">
        <div className="flex flex-col gap-4">
          {/* ── Copilot card ── */}
          <div className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-dm-card">
            <label htmlFor={`daydream-${dateIso}`} className="font-sans text-sm font-bold text-neutral-900 dark:text-white">
              What do you want to do?
            </label>
            <p className="mt-1.5 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
              Same Trip Copilot powers as on the calendar: ask to swap the hotel segment for this night, change dinner, pin an
              experience — we scope edits to{" "}
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">{dateIso}</span> when possible.
            </p>
            <textarea
              id={`daydream-${dateIso}`}
              ref={dreamTextareaRef}
              placeholder={`e.g. Italian dinner instead of tacos · beach club this afternoon · different hotel nearer downtown…`}
              rows={5}
              value={dreamText}
              onChange={(e) => setDreamText(e.target.value)}
              disabled={dreamBusy}
              className="mt-4 w-full resize-y rounded-lg border border-neutral-200 bg-transparent px-3 py-2 text-sm leading-relaxed text-neutral-800 outline-none ring-0 placeholder:text-neutral-400 focus-visible:border-[#2563EB]/50 focus-visible:ring-2 focus-visible:ring-[#2563EB]/20 disabled:opacity-60 dark:border-white/10 dark:text-neutral-200 dark:placeholder:text-neutral-500"
            />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={dreamBusy || !dreamText.trim()}
                onClick={() => void submitDayDream()}
                className="rounded-xl bg-[#2563EB] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:pointer-events-none disabled:opacity-40"
              >
                {dreamBusy ? "Updating day…" : "Update day with Copilot"}
              </button>
            </div>
            {dreamErr ? (
              <p className="mt-3 text-sm font-medium text-rose-700 dark:text-rose-300" role="alert">
                {dreamErr}
              </p>
            ) : null}
            {dreamReply ? (
              <p className="mt-4 rounded-xl border border-[#2563EB]/20 bg-[#2563EB]/5 px-3 py-3 text-sm text-neutral-900 dark:border-[#60A5FA]/20 dark:bg-[#2563EB]/10 dark:text-neutral-100">
                {dreamReply}
              </p>
            ) : null}
          </div>

          {/* ── Day Summary card ── */}
          {mapStops.length > 0 && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-dm-card">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-black uppercase tracking-[0.12em] text-neutral-500 dark:text-neutral-400">
                  Day Summary
                </p>
                <p className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
                  {mapStops.length} stop{mapStops.length === 1 ? "" : "s"}
                </p>
              </div>
              <ul className="mt-3 max-h-[200px] space-y-3 overflow-y-auto">
                {mapStops.map((stop) => (
                  <li key={stop.index} className="flex items-start gap-3">
                    <DayStopPin n={stop.index} size={20} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-neutral-900 dark:text-white">
                        {stop.label}
                      </p>
                      {stop.description && (
                        <p className="truncate text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
                          {stop.description}
                        </p>
                      )}
                    </div>
                    {stop.time && (
                      <p className="shrink-0 tabular-nums text-[11px] text-neutral-400 dark:text-neutral-500">
                        {stop.time}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-4 flex items-center gap-1 text-[11px] text-neutral-400 dark:text-neutral-500">
                <span aria-hidden>ⓘ</span>
                <span>Stops are ordered by itinerary</span>
              </p>
            </div>
          )}
        </div>

        <DayItineraryMap
          stops={mapStops}
          locationHint={plan.location}
          dateIso={dateIso}
        />
      </div>

      {spendBreakdown ? (
        <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Day spend estimate</p>
          <DaySpendEstimateBar
            baselineGroupUsd={spendBreakdown.baselineGroupUsd}
            hotelUsd={spendBreakdown.hotelUsd}
            mealsUsd={spendBreakdown.mealsUsd}
            activitiesUsd={spendBreakdown.activitiesUsd}
            transportUsd={spendBreakdown.transportUsd}
            estimatedTotalUsd={spendBreakdown.estimatedTotalUsd}
          />
        </div>
      ) : null}

      <div className="mt-4 space-y-4">

        <DayScheduleTimeline
          items={scheduleItems}
          subtitle={plan.generatedItinerary ? "AI-built schedule · edit with Copilot" : "Pinned places for this day"}
          tripId={tripId}
          dateIso={dateIso}
          destination={plan.location ?? undefined}
          passengerCount={plan.people.count ?? 1}
        />

        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-400 dark:text-neutral-500">Lodging tonight</p>
                {hotel ? (
                  <div className="mt-2">
                    <p className="font-sans text-[15px] font-semibold text-neutral-900 dark:text-white">{hotel.place.name}</p>
                    {hotel.place.address && <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{hotel.place.address}</p>}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-neutral-400 italic">No hotel pinned for this night yet.</p>
                )}
              </div>
              {hotel?.place.mapsUrl && (
                <a href={hotel.place.mapsUrl} target="_blank" rel="noopener noreferrer" 
                  className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-[11px] font-semibold text-neutral-600 transition hover:border-[#2563EB] hover:text-[#2563EB] dark:border-white/10 dark:text-neutral-400">
                  Open ↗
                </a>
              )}
            </div>
        </div>

        {DAY_VOTE_DAY_PAGE_CATEGORIES.filter((c) => c !== "other").map((category) => {
          const cat = dayVoting[category];

          const lockedId = cat.lockedOptionId ?? null;
          const sectionSubtitles: Record<string, string> = {
            restaurants: "Group input — who's interested?",
            activities: "Group input — who's interested?",
          };
          const draft = suggestDraft[category] ?? { label: "", detail: "", href: "" };

          // Deduplicate by normalised label
          const seenLabels = new Set<string>();
          const dedupedOptions = cat.options.filter((opt) => {
            const key = opt.label.trim().toLowerCase();
            if (seenLabels.has(key)) return false;
            seenLabels.add(key);
            return true;
          });

          return (
            <DropSection
              key={category}
              title={dayCategoryTitle(category)}
              subtitle={sectionSubtitles[category] ?? "Group input"}
              sectionId={`day-${category}`}
            >
              {/* Suggest form — inline, always visible */}
              <div className="mb-5 rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-3 dark:border-white/10 dark:bg-white/[0.02]">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-400 dark:text-neutral-500">
                  {canSuggest ? `Add ${dayCategoryTitle(category).toLowerCase()}` : "Suggestions restricted by host"}
                </p>
                {canSuggest ? (
                  <div className="flex flex-col gap-2">
                    <div
                      className="relative"
                      onBlur={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                          setAutoSuggest((prev) => ({
                            ...prev,
                            [category]: { items: prev[category]?.items ?? [], open: false },
                          }));
                        }
                      }}
                    >
                      <input
                        value={draft.label}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSuggestDraft((prev) => ({ ...prev, [category]: { ...draft, label: val } }));
                          clearTimeout(acTimerRef.current[category]);
                          if (val.trim().length >= 2) {
                            acTimerRef.current[category] = setTimeout(() => {
                              void (async () => {
                                const res = await fetch("/api/places/autocomplete", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ q: val.trim(), locationHint: plan.location ?? null }),
                                });
                                const j = (await res.json().catch(() => ({ suggestions: [] }))) as {
                                  suggestions?: AcSuggestion[];
                                };
                                setAutoSuggest((prev) => ({
                                  ...prev,
                                  [category]: { items: j.suggestions ?? [], open: true },
                                }));
                              })();
                            }, 300);
                          } else {
                            setAutoSuggest((prev) => ({
                              ...prev,
                              [category]: { items: [], open: false },
                            }));
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            setAutoSuggest((prev) => ({
                              ...prev,
                              [category]: { items: prev[category]?.items ?? [], open: false },
                            }));
                          }
                        }}
                        className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/15 dark:border-white/10 dark:bg-dm-card dark:text-white"
                        placeholder="Name (e.g. Tasca do Chico)…"
                        autoComplete="off"
                      />
                      {autoSuggest[category]?.open && (autoSuggest[category]?.items.length ?? 0) > 0 && (
                        <ul className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-white/10 dark:bg-dm-card">
                          {autoSuggest[category]!.items.map((item, i) => (
                            <li key={i} className="border-b border-neutral-100 last:border-b-0 dark:border-white/5">
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setSuggestDraft((prev) => ({
                                    ...prev,
                                    [category]: { ...draft, label: item.name, href: item.mapsUrl },
                                  }));
                                  setAutoSuggest((prev) => ({
                                    ...prev,
                                    [category]: { items: [], open: false },
                                  }));
                                }}
                                className="w-full px-3 py-2.5 text-left transition hover:bg-neutral-50 dark:hover:bg-white/[0.05]"
                              >
                                <p className="text-sm font-medium text-neutral-900 dark:text-white">{item.name}</p>
                                {item.address && (
                                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{item.address}</p>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={draft.href}
                        onChange={(e) => setSuggestDraft((prev) => ({ ...prev, [category]: { ...draft, href: e.target.value } }))}
                        className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/15 dark:border-white/10 dark:bg-dm-card dark:text-white"
                        placeholder="Link (optional)…"
                      />
                      <button
                        type="button"
                        disabled={busyKey === `suggest:${category}` || !draft.label.trim()}
                        onClick={() =>
                          void runDayAction({ action: "suggest", category, label: draft.label, detail: draft.detail, href: draft.href })
                            .then(() => setSuggestDraft((prev) => ({ ...prev, [category]: { label: "", detail: "", href: "" } })))
                        }
                        className="shrink-0 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-40"
                      >
                        {busyKey === `suggest:${category}` ? "…" : "Add"}
                      </button>
                    </div>
                  </div>

                ) : (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">You can vote but not suggest new options on this trip.</p>
                )}

                <div className="mt-4 border-t border-neutral-100 pt-4 dark:border-white/5">
                  <button
                    type="button"
                    disabled={copilotSearch[category]?.loading}
                    onClick={async () => {
                      const query = draft.label.trim();
                      if (!query) return;
                      const locationHint = plan.location ?? null;
                      setCopilotSearch((prev) => ({
                        ...prev,
                        [category]: { loading: true, results: [], error: null },
                      }));
                      try {
                        const res = await fetch("/api/places/maps-search", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ q: query, locationHint, limit: 5 }),
                        });
                        const j = (await res.json().catch(() => ({}))) as { places?: PlacePreview[] };
                        const places = Array.isArray(j.places) ? j.places : [];
                        setCopilotSearch((prev) => ({
                          ...prev,
                          [category]: {
                            loading: false,
                            results: places,
                            error: places.length === 0 ? "No results found. Try a different name or location." : null,
                          },
                        }));
                      } catch {
                        setCopilotSearch((prev) => ({
                          ...prev,
                          [category]: { loading: false, results: [], error: "Search failed. Check your connection." },
                        }));
                      }
                    }}
                    className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#2563EB] hover:opacity-80 disabled:opacity-50 dark:text-[#60A5FA]"
                  >
                    {copilotSearch[category]?.loading ? (
                      <>
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[#2563EB]/30 border-t-[#2563EB] dark:border-[#60A5FA]/30 dark:border-t-[#60A5FA]" />
                        Searching…
                      </>
                    ) : (
                      <><span className="text-lg">✧</span> Search alternatives with Copilot</>
                    )}
                  </button>

                  {/* Copilot search results */}
                  {(() => {
                    const cs = copilotSearch[category];
                    if (!cs || cs.loading) return null;
                    if (cs.error) {
                      return (
                        <p className="mt-3 text-xs text-red-500 dark:text-red-400">{cs.error}</p>
                      );
                    }
                    if (cs.results.length === 0) return null;
                    return (
                      <ul className="mt-3 space-y-2">
                        {cs.results.map((place, i) => (
                          <li key={i}>
                            <button
                              type="button"
                              onClick={() => {
                                setSuggestDraft((prev) => ({
                                  ...prev,
                                  [category]: {
                                    ...(prev[category] ?? { label: "", detail: "", href: "" }),
                                    label: place.name,
                                    href: place.mapsUrl,
                                  },
                                }));
                                setCopilotSearch((prev) => ({ ...prev, [category]: { loading: false, results: [], error: null } }));
                              }}
                              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-left transition hover:border-[#2563EB]/40 hover:bg-blue-50/40 dark:border-white/10 dark:bg-dm-card dark:hover:border-[#60A5FA]/30 dark:hover:bg-white/[0.05]"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-sm font-semibold text-neutral-900 dark:text-white">{place.name}</span>
                                {place.rating != null && (
                                  <span className="shrink-0 text-xs font-semibold text-amber-500">★ {place.rating.toFixed(1)}</span>
                                )}
                              </div>
                              {place.address && (
                                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{place.address}</p>
                              )}
                              <p className="mt-1 text-[10px] font-medium text-[#2563EB] dark:text-[#60A5FA]">Tap to fill ↑</p>
                            </button>
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                </div>
              </div>

              {dedupedOptions.length === 0 ? (
                <EmptyHint label={`No ${dayCategoryTitle(category).toLowerCase()} options yet \u2014 be the first to suggest one above.`} />
              ) : (
                <ul className="space-y-3">
                  {dedupedOptions.map((opt) => {
                    const voted = opt.votes.includes(viewerUserId);
                    const skipped = (opt.skipVotes ?? []).includes(viewerUserId);
                    const isLocked = lockedId === opt.id;
                    const dimmed = Boolean(lockedId && lockedId !== opt.id);
                    const hostBusy = Boolean(busyKey) || dimmed;
                    const voteBusy = Boolean(busyKey) || Boolean(lockedId && !isLocked);
                    return (
                      <DayVoteOptionCard
                        key={opt.id}
                        opt={opt}
                        isHost={isHost}
                        voted={voted}
                        skipped={skipped}
                        isLocked={isLocked}
                        dimmed={dimmed}
                        voteBusy={voteBusy}
                        hostBusy={hostBusy}
                        onVote={() => void runDayAction({ action: "vote", category, optionId: opt.id })}
                        onSkip={() => void runDayAction({ action: "skip", category, optionId: opt.id })}
                        onConfirm={() => {
                          const timeStr = window.prompt("Set time (e.g. 7:30 PM) — leave blank to skip", opt.time ?? "");
                          const detail = window.prompt(lockPromptText(category), "");
                          if (!detail?.trim()) return;
                          void runDayAction({
                            action: "lock",
                            category,
                            optionId: opt.id,
                            detail: detail.trim(),
                            time: timeStr?.trim() || undefined,
                          });
                        }}
                        onSetTime={() => {
                          const t = window.prompt("Set time (e.g. 7:30 PM)", "");
                          if (!t?.trim()) return;
                          void runDayAction({ action: "set-time", category, optionId: opt.id, time: t.trim() });
                        }}
                        onRemove={() => {
                          if (!window.confirm(`Remove "${opt.label}" from options?`)) return;
                          void runDayAction({ action: "remove", category, optionId: opt.id });
                        }}
                        onUnlock={() => void runDayAction({ action: "unlock", category })}
                      />
                    );
                  })}

                </ul>
              )}



            </DropSection>
          );
        })}

        {dayErr ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
            {dayErr}
          </p>
        ) : null}
      </div>
    </div>
  );
}
