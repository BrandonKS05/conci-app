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
} from "@/shared/day-collaboration";
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
  hotelUsd,
  mealsUsd,
  activitiesUsd,
  estimatedTotalUsd,
}: {
  baselineGroupUsd: number | null;
  hotelUsd: number;
  mealsUsd: number;
  activitiesUsd: number;
  estimatedTotalUsd: number;
}) {
  const baseline = baselineGroupUsd;
  const fillPct = baseline != null && baseline > 0 ? Math.min(100, (estimatedTotalUsd / baseline) * 100) : 100;
  const over = baseline != null && baseline > 0 && estimatedTotalUsd > baseline;

  const parts = [
    { key: "h", usd: hotelUsd, className: "bg-teal-500 dark:bg-teal-600" },
    { key: "m", usd: mealsUsd, className: "bg-amber-400 dark:bg-amber-500" },
    { key: "a", usd: activitiesUsd, className: "bg-pink-500 dark:bg-pink-600" },
  ].filter((p) => p.usd > 0);

  return (
    <div className="mt-3 space-y-2">
      {estimatedTotalUsd <= 0 ? (
        <p className="font-sans text-xs text-neutral-500 dark:text-neutral-500">
          Pin restaurants or experiences on this day to build an estimate. Lodging is managed on the trip calendar.
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
        {estimatedTotalUsd <= 0 ? null : hotelUsd > 0 ? (
          <li className="flex justify-between gap-2">
            <span className="text-teal-700 dark:text-teal-300">Lodging (night share)</span>
            <span className="tabular-nums font-semibold text-neutral-800 dark:text-neutral-200">
              {formatUsd(hotelUsd)}
            </span>
          </li>
        ) : null}
        {estimatedTotalUsd <= 0 ? null : mealsUsd > 0 ? (
          <li className="flex justify-between gap-2">
            <span className="text-amber-800 dark:text-amber-200">Restaurants (est.)</span>
            <span className="tabular-nums font-semibold text-neutral-800 dark:text-neutral-200">
              {formatUsd(mealsUsd)}
            </span>
          </li>
        ) : null}
        {estimatedTotalUsd <= 0 ? null : activitiesUsd > 0 ? (
          <li className="flex justify-between gap-2">
            <span className="text-pink-700 dark:text-pink-300">Experiences</span>
            <span className="tabular-nums font-semibold text-neutral-800 dark:text-neutral-200">
              {formatUsd(activitiesUsd)}
            </span>
          </li>
        ) : null}
        {estimatedTotalUsd > 0 ? (
          <li className="flex justify-between gap-2 border-t border-neutral-200 pt-1.5 dark:border-white/10">
            <span className="font-bold text-neutral-800 dark:text-neutral-200">Estimated day total</span>
            <span className="tabular-nums font-bold text-neutral-950 dark:text-white">
              {formatUsd(estimatedTotalUsd)}
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
          About {formatUsd(estimatedTotalUsd - baseline!)} over today&apos;s share — rough estimate only.
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

function DayScheduleTimeline({ items, subtitle }: { items: ScheduleRow[]; subtitle?: string }) {
  const sorted = useMemo(() => sortScheduleRows(items), [items]);

  return (
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
            {sorted.map((row, index) => (
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
                  <ScheduleTimelineRowContent row={row} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function ScheduleTimelineRowContent({ row }: { row: ScheduleRow }) {
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
      {row.href ? (
        <a
          href={row.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex rounded-full border border-neutral-200 px-3 py-1 text-[11px] font-semibold text-neutral-600 transition hover:border-[#2563EB] hover:text-[#2563EB] dark:border-white/10 dark:text-neutral-400 dark:hover:border-[#60A5FA] dark:hover:text-[#60A5FA]"
        >
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
        // Skip generic transport placeholders (no real flight data)
        if (act.category === "transport" && /->|→|flight/i.test(act.title) && !act.bookingUrl) continue;
        rows.push({
          key: `gen-${act.time}-${act.title}`,
          label: act.title,
          sub:
            act.category === "food" ? "Restaurant"
            : act.category === "transport" ? "Transport"
            : act.category === "lodging" ? "Lodging"
            : "Activity",
          time: act.time || undefined,
          href: act.bookingUrl || undefined,
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

      <header className="mb-10 grid gap-6 lg:grid-cols-[minmax(0,220px)_1fr_minmax(0,280px)] lg:items-start">
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5 dark:border-white/10 dark:bg-dm-card">
          <p className="font-sans text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">{dest}</p>
          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400 dark:text-neutral-500">Lodging tonight</p>
          <p className="mt-1.5 text-sm font-semibold text-neutral-900 dark:text-white">
            {hotel ? hotel.place.name : <span className="text-neutral-400">TBD</span>}
          </p>
          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400 dark:text-neutral-500">Main Plans</p>
          <p className="mt-1.5 text-sm font-semibold text-neutral-900 dark:text-white">
            {scheduleItems.length > 0 ? `${scheduleItems.length} stops` : <span className="text-neutral-400">TBD</span>}
          </p>
        </div>

        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-neutral-950 dark:text-white sm:text-[2.125rem] sm:leading-tight">
            {formatted.dayIndexLabel ? `${formatted.dayIndexLabel}: ${formatted.line2}` : formatted.line2}
          </h1>
          <div className="mt-6 block rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-dm-card">
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
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5 dark:border-white/10 dark:bg-dm-card">
          <p className="text-center text-[10px] font-black uppercase tracking-[0.22em] text-neutral-500 dark:text-neutral-400">
            Nearby days
          </p>
          <div className="mt-4 flex justify-center gap-5">
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
          <p className="mt-8 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Day spend estimate
          </p>
          {spendBreakdown ? (
            <DaySpendEstimateBar
              baselineGroupUsd={spendBreakdown.baselineGroupUsd}
              hotelUsd={spendBreakdown.hotelUsd}
              mealsUsd={spendBreakdown.mealsUsd}
              activitiesUsd={spendBreakdown.activitiesUsd}
              estimatedTotalUsd={spendBreakdown.estimatedTotalUsd}
            />
          ) : (
            <p className="mt-3 font-sans text-xs leading-relaxed text-neutral-500 dark:text-neutral-500">
              Save trip dates on the host calendar to see how this day lines up with your per-day budget.
            </p>
          )}
        </div>
      </header>

      <div className="mt-10 space-y-4">

        <DayScheduleTimeline
          items={scheduleItems}
          subtitle={plan.generatedItinerary ? "AI-built schedule · edit with Copilot" : "Pinned places for this day"}
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
                    <input
                      value={draft.label}
                      onChange={(e) => setSuggestDraft((prev) => ({ ...prev, [category]: { ...draft, label: e.target.value } }))}
                      className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/15 dark:border-white/10 dark:bg-dm-card dark:text-white"
                      placeholder={`Name (e.g. Tasca do Chico)…`}
                    />
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
                    onClick={() => {
                      setDreamText(`Find some more ${dayCategoryTitle(category).toLowerCase()} options for ${dateIso}`);
                      dreamTextareaRef.current?.focus();
                      dreamTextareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                    className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#2563EB] hover:opacity-80 dark:text-[#60A5FA]"
                  >
                    <span className="text-lg">✧</span> Search alternatives with Copilot
                  </button>
                </div>
              </div>

              {dedupedOptions.length === 0 ? (
                <EmptyHint label={`No ${dayCategoryTitle(category).toLowerCase()} options yet \u2014 be the first to suggest one above.`} />
              ) : (
                <ul className="space-y-2">
                  {dedupedOptions.map((opt) => {
                    const voted = opt.votes.includes(viewerUserId);
                    const skipped = (opt.skipVotes ?? []).includes(viewerUserId);
                    const isLocked = lockedId === opt.id;
                    const dimmed = Boolean(lockedId && lockedId !== opt.id);
                    const isConci = opt.suggestedBy === "conci:auto";
                    return (
                      <li
                        key={opt.id}
                        className={`rounded-xl border px-4 py-3 transition ${
                          isLocked
                            ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-900/10"
                            : dimmed
                            ? "border-neutral-100 bg-neutral-50 opacity-50 dark:border-white/5 dark:bg-white/[0.02]"
                            : "border-neutral-100 bg-white dark:border-white/10 dark:bg-dm-elevated"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="font-sans text-[15px] font-semibold text-neutral-900 dark:text-white">{opt.label}</p>
                              {isLocked ? (
                                <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">✓ Confirmed</span>
                              ) : null}
                              {isConci ? (
                                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:bg-white/10 dark:text-neutral-400">Conci pick</span>
                              ) : null}
                            </div>
                            {/* AI-suggested time */}
                            {opt.time && !isLocked ? (
                              <p className="mt-0.5 text-[11px] font-medium text-[#2563EB] dark:text-[#60A5FA]">Suggested: {opt.time}</p>
                            ) : null}
                            {opt.detail ? (
                              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{opt.detail}</p>
                            ) : null}
                            {isLocked && opt.lockedDetail ? (
                              <p className="mt-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">{opt.time ? `${opt.time} · ` : ""}{opt.lockedDetail}</p>
                            ) : null}
                          </div>
                          {opt.href ? (
                            <a href={opt.href} target="_blank" rel="noopener noreferrer"
                              className="shrink-0 text-[11px] font-semibold text-[#2563EB] underline-offset-2 hover:underline dark:text-[#60A5FA]">
                              Open ↗
                            </a>
                          ) : null}
                        </div>
                        {/* Action row */}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {/* 👍 Interested */}
                          <button
                            type="button"
                            disabled={Boolean(busyKey) || Boolean(lockedId)}
                            onClick={() => void runDayAction({ action: "vote", category, optionId: opt.id })}
                            className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                              voted
                                ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-300"
                                : "border-neutral-200 text-neutral-500 hover:border-emerald-400 hover:text-emerald-700 dark:border-white/15 dark:text-neutral-400"
                            } disabled:opacity-40`}
                          >
                            👍 Interested{opt.votes.length > 0 ? ` · ${opt.votes.length}` : ""}
                          </button>
                          {/* 👎 Not for me */}
                          <button
                            type="button"
                            disabled={Boolean(busyKey) || Boolean(lockedId)}
                            onClick={() => void runDayAction({ action: "skip", category, optionId: opt.id })}
                            className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                              skipped
                                ? "border-rose-300 bg-rose-50 text-rose-600 dark:border-rose-500 dark:bg-rose-900/20 dark:text-rose-300"
                                : "border-neutral-200 text-neutral-500 hover:border-rose-300 hover:text-rose-600 dark:border-white/15 dark:text-neutral-400"
                            } disabled:opacity-40`}
                          >
                            👎 Not for me{(opt.skipVotes?.length ?? 0) > 0 ? ` · ${opt.skipVotes!.length}` : ""}
                          </button>
                          {/* Host-only actions */}
                          {isHost ? (
                            isLocked ? (
                              <button
                                type="button"
                                disabled={Boolean(busyKey)}
                                onClick={() => void runDayAction({ action: "unlock", category })}
                                className="rounded-full border border-neutral-200 px-3 py-1 text-[11px] font-semibold text-neutral-500 transition hover:border-neutral-400 dark:border-white/10 dark:text-neutral-400"
                              >
                                Unconfirm
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  disabled={Boolean(busyKey)}
                                  onClick={() => {
                                    const timeStr = window.prompt("Set time (e.g. 7:30 PM) — leave blank to skip", opt.time ?? "");
                                    const detail = window.prompt(lockPromptText(category), "");
                                    if (!detail?.trim()) return;
                                    void runDayAction({ action: "lock", category, optionId: opt.id, detail: detail.trim(), time: timeStr?.trim() || undefined });
                                  }}
                                  className="rounded-full border border-[#2563EB]/40 px-3 py-1 text-[11px] font-semibold text-[#2563EB] transition hover:bg-[#2563EB] hover:text-white dark:border-[#60A5FA]/30 dark:text-[#60A5FA]"
                                >
                                  Confirm
                                </button>
                                {!opt.time && (
                                  <button
                                    type="button"
                                    disabled={Boolean(busyKey)}
                                    onClick={() => {
                                      const t = window.prompt("Set time (e.g. 7:30 PM)", "");
                                      if (!t?.trim()) return;
                                      void runDayAction({ action: "set-time", category, optionId: opt.id, time: t.trim() });
                                    }}
                                    className="rounded-full border border-neutral-200 px-3 py-1 text-[11px] font-semibold text-neutral-500 transition hover:border-[#2563EB] hover:text-[#2563EB] dark:border-white/10 dark:text-neutral-400"
                                  >
                                    Set time
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={Boolean(busyKey)}
                                  onClick={() => {
                                    if (!window.confirm(`Remove "${opt.label}" from options?`)) return;
                                    void runDayAction({ action: "remove", category, optionId: opt.id });
                                  }}
                                  className="rounded-full border border-neutral-200 px-3 py-1 text-[11px] font-semibold text-neutral-500 transition hover:border-rose-300 hover:text-rose-600 dark:border-white/10 dark:text-neutral-500"
                                >
                                  Remove
                                </button>
                              </>
                            )
                          ) : null}
                        </div>
                      </li>
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
