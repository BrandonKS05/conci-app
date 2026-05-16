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
  type HostRestaurantPin,
  type ItineraryDay,
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
type MemberSuggestPermissionRow = { userId: string; displayName: string; permission: SuggestPermission };

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

/** Bold pink downward triangle (accordion affordance — mock reference). Rotates when open. */
function PinkAccordionChevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 18"
      className={`h-4 w-6 shrink-0 text-[#e91e8c] transition-transform duration-200 dark:text-[#ff4da6] ${open ? "rotate-180" : ""} ${className ?? ""}`}
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
    <div className="overflow-hidden rounded-xl border border-neutral-900/15 bg-neutral-50/80 shadow-[0_1px_0_rgba(0,0,0,0.04)] dark:border-white/10 dark:bg-white/[0.04]">
      <button
        type="button"
        id={`${sectionId}-header`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition hover:bg-neutral-200/55 dark:hover:bg-white/[0.07] sm:px-6 sm:py-4"
      >
        <div className="min-w-0">
          <span className="font-sans text-lg font-black uppercase tracking-[0.04em] text-neutral-950 dark:text-white">
            {title}
          </span>
          {subtitle ? (
            <p className="mt-1 font-sans text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-600 dark:text-neutral-400">
              {subtitle}
            </p>
          ) : null}
        </div>
        <PinkAccordionChevron open={open} className="mt-1 sm:mt-1.5" />
      </button>
      {open ? (
        <div id={panelId} role="region" aria-labelledby={`${sectionId}-header`} className="border-t border-neutral-900/10 dark:border-white/10">
          <div className="px-5 pb-6 pt-4 sm:px-6 sm:pb-8 sm:pt-5">{children}</div>
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

function itineraryDayForDate(plan: TripPlan, dateIso: string): ItineraryDay | null {
  const days = plan.generatedItinerary?.days;
  if (!days?.length) return null;
  const byIso = days.find((d) => d.dateIso === dateIso);
  if (byIso) return byIso;
  const tr = plan.hostSetup?.tripRange;
  if (tr?.startIso && tr.endIso) {
    const idx = enumerateLocalIsoDays(tr.startIso, tr.endIso).indexOf(dateIso);
    if (idx >= 0 && idx < days.length) return days[idx]!;
  }
  return null;
}

function normalizeMatchKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Match pinned label to generated itinerary row for time hints (food / activity titles). */
function itineraryTimeForPinnedTitle(itin: ItineraryDay | null, pinTitle: string): string | null {
  if (!itin) return null;
  const pinKey = normalizeMatchKey(pinTitle);
  if (!pinKey) return null;
  const pinWords = pinKey.split(" ").filter((w) => w.length > 2);
  for (const a of itin.activities) {
    const actKey = normalizeMatchKey(a.title);
    if (!actKey) continue;
    const timeRaw = a.time?.trim();
    if (!timeRaw) continue;
    if (actKey.includes(pinKey) || pinKey.includes(actKey)) return timeRaw;
    const actWords = actKey.split(" ").filter((w) => w.length > 2);
    const overlap = actWords.filter((w) => pinWords.includes(w)).length;
    if (overlap >= 2 || (overlap >= 1 && pinWords.length <= 2)) return timeRaw;
  }
  return null;
}

function parseClockOrPhaseMinutes(raw: string): number | null {
  const s = raw.trim();
  const lower = s.toLowerCase();

  const m = s.match(/\b(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?\b/i);
  if (m) {
    let h = Number.parseInt(m[1]!, 10);
    const min = Number.parseInt(m[2]!, 10);
    const ap = m[3]?.toLowerCase().replace(/\./g, "");
    if ((ap === "pm" || ap === "p") && h < 12) h += 12;
    if ((ap === "am" || ap === "a") && h === 12) h = 0;
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) return h * 60 + min;
  }

  const buckets: [string, number][] = [
    ["early morning", 8 * 60],
    ["morning", 9 * 60 + 30],
    ["breakfast", 8 * 60 + 30],
    ["brunch", 10 * 60 + 30],
    ["noon", 12 * 60],
    ["lunch", 12 * 60 + 30],
    ["midday", 12 * 60 + 45],
    ["afternoon", 15 * 60],
    ["evening", 18 * 60],
    ["sunset", 18 * 60 + 30],
    ["dinner", 19 * 60 + 30],
    ["night", 21 * 60],
    ["late night", 22 * 60 + 30],
  ];
  for (const [word, mins] of buckets) {
    if (lower.includes(word)) return mins;
  }
  return null;
}

function sortMinutesWithFallback(raw: string | null | undefined, tieBreak: number): number {
  if (raw?.trim()) {
    const n = parseClockOrPhaseMinutes(raw);
    if (n != null) return n + (tieBreak % 12);
  }
  return 9 * 60 + tieBreak * 24;
}

function defaultMealPhaseLabel(index: number, total: number): string {
  if (total <= 1) return "Meal";
  if (total === 2) return index === 0 ? "Lunch" : "Dinner";
  return index === 0 ? "Breakfast" : index === 1 ? "Lunch" : index === 2 ? "Dinner" : `Meal ${index + 1}`;
}

type ScheduleTimelineEntry = {
  key: string;
  sortMinutes: number;
  timeDisplay: string;
  label: string;
  kindLabel: string;
  href?: string;
  recommendedByConci?: boolean;
};

function buildScheduleTimeline(
  plan: TripPlan,
  dateIso: string,
  meals: HostRestaurantPin[],
  activitiesNoFlights: HostActivityPin[]
): ScheduleTimelineEntry[] {
  const itin = itineraryDayForDate(plan, dateIso);
  const rows: ScheduleTimelineEntry[] = [];

  meals.forEach((p, i) => {
    const fromItin = itineraryTimeForPinnedTitle(itin, p.place.name);
    const fallbackLabel = defaultMealPhaseLabel(i, meals.length);
    const timeDisplay = fromItin?.trim() || fallbackLabel;
    rows.push({
      key: `m-${p.place.mapsUrl}`,
      sortMinutes: sortMinutesWithFallback(fromItin ?? fallbackLabel, i),
      timeDisplay,
      label: p.place.name,
      kindLabel: "Restaurant",
      href: p.place.mapsUrl,
      recommendedByConci: p.recommendedByConci === true,
    });
  });

  activitiesNoFlights.forEach((p, i) => {
    const fromItin = itineraryTimeForPinnedTitle(itin, p.experience.name);
    const dur = p.experience.duration?.trim();
    const timeDisplay = fromItin?.trim() || dur || "Time TBD";
    rows.push({
      key: `a-${p.experience.bookingUrl}`,
      sortMinutes: sortMinutesWithFallback(fromItin ?? dur, meals.length + i + 3),
      timeDisplay,
      label: p.experience.name,
      kindLabel: "Activity",
      href: p.experience.bookingUrl || undefined,
      recommendedByConci: p.recommendedByConci === true,
    });
  });

  rows.sort((a, b) => a.sortMinutes - b.sortMinutes || a.label.localeCompare(b.label));
  return rows;
}

function DayScheduleTimeline({ entries }: { entries: ScheduleTimelineEntry[] }) {
  return (
    <div className="ml-1 border-l-2 border-neutral-300 py-1 dark:border-white/20">
      <ul className="space-y-0">
        {entries.map((e) => (
          <li key={e.key} className="relative pb-8 pl-8 last:pb-1">
            <span
              className="absolute left-0 top-1.5 size-3 -translate-x-[calc(50%+1px)] rounded-full bg-[#e91e8c] shadow-[0_0_0_4px_rgba(247,246,248,1)] dark:bg-[#ff4da6] dark:shadow-[0_0_0_4px_rgba(18,18,18,1)]"
              aria-hidden
            />
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-mono text-[13px] font-bold tabular-nums text-neutral-800 dark:text-neutral-200">
                {e.timeDisplay}
              </span>
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#c4176d] dark:text-[#ff7eb8]">
                {e.kindLabel}
              </span>
            </div>
            <p className="mt-1.5 font-sans text-base font-bold text-neutral-950 dark:text-white">{e.label}</p>
            {e.recommendedByConci ? (
              <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-neutral-500/80 dark:text-neutral-500/70">
                recommended by CONCI
              </p>
            ) : null}
            {e.href ? (
              <a
                href={e.href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex font-sans text-[10px] font-black uppercase tracking-wide text-[#0066cc] underline-offset-2 hover:underline dark:text-sky-400"
              >
                Map / link
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
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
      return "Hotels";
    case "flights":
      return "Flights";
    case "activities":
      return "Activities";
    default:
      return "Other options";
  }
}

function categoryCollaborationSubtitle(
  category: "restaurants" | "hotels" | "activities" | "other"
): string {
  switch (category) {
    case "restaurants":
      return "Ideas from your polls, trip chat, traveler notes, and pinned meals";
    case "hotels":
      return "Stay ideas from your trip setup — owner adds one to the plan";
    case "activities":
      return "Ideas from your polls, chat, notes, and pinned experiences";
    default:
      return "Free-form extras for this day";
  }
}

function lockPromptText(category: DayVoteCategory): string {
  switch (category) {
    case "restaurants":
      return "Add restaurant confirmation detail (example: 7:30 PM reservation under Kim).";
    case "hotels":
      return "Add hotel confirmation detail (example: check-in 3:00 PM, confirmation #12345).";
    case "flights":
      return "Add flight confirmation detail (example: DL 123, departs 8:15 AM).";
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
  const [permBusyUserId, setPermBusyUserId] = useState<string | null>(null);
  const [memberSuggestPerms, setMemberSuggestPerms] = useState<MemberSuggestPermissionRow[]>([]);
  const [canSuggest, setCanSuggest] = useState<boolean>(isHost);
  const [suggestDraft, setSuggestDraft] = useState<
    Partial<Record<DayVoteCategory, { label: string; detail: string; href: string }>>
  >({});
  const suppressRealtimeUntilRef = useRef(0);

  useEffect(() => {
    setPlan(initialPlan);
    setDayVotingByDate(mergeDayVoteStateForDate(initialPlan, parseDayVoteState(initialCollab.dayVoting), dateIso, collabHintsFrom(initialCollab)));
  }, [initialPlan, initialCollab.dayVoting, dateIso]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/trip-plans/${tripId}/day-vote-permissions`, { credentials: "include" });
        const j = (await res.json().catch(() => ({}))) as {
          viewerPermission?: SuggestPermission;
          members?: MemberSuggestPermissionRow[];
          error?: string;
        };
        if (cancelled || !res.ok) return;
        setCanSuggest((j.viewerPermission ?? (isHost ? "can_suggest" : "vote_only")) === "can_suggest");
        if (Array.isArray(j.members)) setMemberSuggestPerms(j.members);
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

  const activitiesNoFlights = useMemo(
    () => activities.filter((p) => !isFlightActivityPin(p)),
    [activities]
  );

  const scheduleTimeline = useMemo(
    () => buildScheduleTimeline(plan, dateIso, meals, activitiesNoFlights),
    [plan, dateIso, meals, activitiesNoFlights]
  );

  const prevIso = shiftIsoDay(dateIso, -1);
  const nextIso = shiftIsoDay(dateIso, 1);

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
          className="font-semibold text-teal-700 underline-offset-4 hover:underline dark:text-teal-400"
        >
          ← Trip calendar
        </Link>
        <span className="text-slate-300 dark:text-white/25">/</span>
        <span className="text-[color:var(--on-surface-variant)] dark:text-neutral-400">Host day view</span>
      </nav>

      <header className="mb-10 grid gap-6 lg:grid-cols-[minmax(0,220px)_1fr_minmax(0,280px)] lg:items-start">
        <div className="rounded-[1.35rem] border-4 border-black bg-[#ffb6d9]/35 px-5 py-4 shadow-[inset_0_0_0_1px_rgba(236,72,153,0.35)] dark:border-white/25 dark:bg-rose-950/40 dark:shadow-none">
          <p className="font-sans text-sm font-black uppercase tracking-[0.12em] text-neutral-950 dark:text-white">{dest}</p>
          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-700 dark:text-neutral-300">Lodging</p>
          <p className="mt-1 text-sm font-bold text-neutral-900 dark:text-white">
            <Link
              href={`/trip/${tripId}/setup#sec-dates`}
              className="underline-offset-4 hover:underline"
            >
              On trip calendar
            </Link>
          </p>
          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-700 dark:text-neutral-300">Main Plans</p>
          <p className="mt-1 text-sm font-bold text-neutral-900 dark:text-white">
            {scheduleTimeline.length > 0 ? `${scheduleTimeline.length} stops` : "TBD"}
          </p>
        </div>

        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-neutral-950 dark:text-white sm:text-[2.125rem] sm:leading-tight">
            {formatted.dayIndexLabel ? `${formatted.dayIndexLabel}: ${formatted.line2}` : formatted.line2}
          </h1>
          <div className="mt-6 block rounded-2xl border-2 border-neutral-900 bg-white p-5 shadow-[2px_4px_0_0_rgba(0,0,0,0.08)] dark:border-white/20 dark:bg-dm-card">
            <label htmlFor={`daydream-${dateIso}`} className="font-sans text-sm font-black text-neutral-950 dark:text-white">
              What do you want to do?
            </label>
            <p className="mt-2 text-xs font-normal leading-relaxed text-neutral-600 dark:text-neutral-400">
              Same Trip Copilot as on the calendar: change dinner, pin an experience, tweak the plan — edits anchor to{" "}
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">{dateIso}</span> when possible. Add or move
              lodging on the <Link href={`/trip/${tripId}/setup#sec-dates`} className="font-semibold underline-offset-2 hover:underline">main calendar</Link> (whole trip vs specific nights).
            </p>
            <textarea
              id={`daydream-${dateIso}`}
              placeholder={`e.g. Italian dinner instead of tacos · beach club this afternoon · swap lunch for a food tour…`}
              rows={5}
              value={dreamText}
              onChange={(e) => setDreamText(e.target.value)}
              disabled={dreamBusy}
              className="mt-4 w-full resize-y rounded-lg border border-neutral-900/15 bg-transparent px-2 py-2 text-sm leading-relaxed text-neutral-800 outline-none ring-0 placeholder:text-neutral-400 focus-visible:ring-2 focus-visible:ring-teal-500/40 disabled:opacity-60 dark:border-white/15 dark:text-neutral-200 dark:placeholder:text-neutral-500"
            />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={dreamBusy || !dreamText.trim()}
                onClick={() => void submitDayDream()}
                className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white shadow-[2px_2px_0_0_rgba(0,0,0,0.12)] transition hover:bg-teal-500 disabled:pointer-events-none disabled:opacity-40 dark:shadow-black/40"
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
              <p className="mt-4 rounded-xl border border-teal-200/70 bg-teal-50/80 px-3 py-3 text-sm text-teal-950 dark:border-teal-800/40 dark:bg-teal-950/35 dark:text-teal-50">
                {dreamReply}
              </p>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border-2 border-neutral-900 bg-white p-5 shadow-[2px_4px_0_0_rgba(0,0,0,0.06)] dark:border-white/15 dark:bg-dm-card">
          <p className="text-center text-[10px] font-black uppercase tracking-[0.26em] text-neutral-700 dark:text-neutral-400">
            Nearby days
          </p>
          <div className="mt-4 flex justify-center gap-6">
            {prevIso ? (
              <Link
                href={`/trip/${tripId}/setup/day?date=${encodeURIComponent(prevIso)}`}
                className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-neutral-900 bg-white text-lg font-bold text-neutral-900 transition hover:bg-[#ffb6d9]/25 dark:border-white/25 dark:bg-dm-card dark:text-white dark:hover:bg-white/10"
                aria-label="Previous day"
              >
                ‹
              </Link>
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-transparent text-slate-300 opacity-40 dark:text-neutral-600">
                ‹
              </span>
            )}
            {nextIso ? (
              <Link
                href={`/trip/${tripId}/setup/day?date=${encodeURIComponent(nextIso)}`}
                className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-neutral-900 bg-white text-lg font-bold text-neutral-900 transition hover:bg-[#ffb6d9]/25 dark:border-white/25 dark:bg-dm-card dark:text-white dark:hover:bg-white/10"
                aria-label="Next day"
              >
                ›
              </Link>
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-transparent text-slate-300 opacity-40 dark:text-neutral-600">
                ›
              </span>
            )}
          </div>
          <p className="mt-6 text-[10px] font-black uppercase tracking-[0.24em] text-neutral-800 dark:text-neutral-300">
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
        {isHost ? (
          <DropSection
            title="Member suggestion permissions"
            subtitle="Host controls"
            sectionId="day-suggest-permissions"
            defaultOpen
          >
            {memberSuggestPerms.length === 0 ? (
              <EmptyHint label="No other members yet." />
            ) : (
              <ul className="space-y-2">
                {memberSuggestPerms.map((m) => {
                  const canMemberSuggest = m.permission === "can_suggest";
                  const busy = permBusyUserId === m.userId;
                  return (
                    <li
                      key={m.userId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[color:var(--hairline)] bg-white px-3 py-2 dark:border-white/10 dark:bg-dm-elevated"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[color:var(--on-surface)] dark:text-white">{m.displayName}</p>
                        <p className="text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                          {canMemberSuggest ? "Can suggest new options + vote" : "Vote-only"}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          setPermBusyUserId(m.userId);
                          try {
                            const nextPermission: SuggestPermission = canMemberSuggest ? "vote_only" : "can_suggest";
                            const res = await fetch(`/api/trip-plans/${tripId}/day-vote-permissions`, {
                              method: "PATCH",
                              credentials: "include",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ memberUserId: m.userId, permission: nextPermission }),
                            });
                            const j = (await res.json().catch(() => ({}))) as { error?: string };
                            if (!res.ok) throw new Error(j.error || "Could not update permission");
                            setMemberSuggestPerms((prev) =>
                              prev.map((row) => (row.userId === m.userId ? { ...row, permission: nextPermission } : row))
                            );
                          } catch (e) {
                            setDayErr(e instanceof Error ? e.message : "Could not update permission.");
                          } finally {
                            setPermBusyUserId(null);
                          }
                        }}
                        className="rounded-full border border-indigo-500/50 px-3 py-1 text-[11px] font-bold text-indigo-800 dark:text-indigo-200 disabled:opacity-50"
                      >
                        {busy ? "Saving..." : canMemberSuggest ? "Revoke suggest" : "Allow suggest"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </DropSection>
        ) : null}

        <section
          className="rounded-xl border border-neutral-900/15 bg-neutral-50/80 px-5 py-5 shadow-[0_1px_0_rgba(0,0,0,0.04)] dark:border-white/10 dark:bg-white/[0.04] sm:px-6 sm:py-6"
          aria-labelledby="day-schedule-heading"
        >
          <h2
            id="day-schedule-heading"
            className="font-sans text-lg font-black uppercase tracking-[0.04em] text-neutral-950 dark:text-white"
          >
            Schedule
          </h2>
          <p className="mt-1 font-sans text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-600 dark:text-neutral-400">
            Today&apos;s pinned plans — time order (flights stay on the trip calendar)
          </p>
          <div className="mt-6">
            {scheduleTimeline.length === 0 ? (
              <EmptyHint label="No meals or activities pinned for this day yet — use Add places on the trip calendar. Flight details stay on the main calendar." />
            ) : (
              <DayScheduleTimeline entries={scheduleTimeline} />
            )}
          </div>
        </section>

        {DAY_VOTE_DAY_PAGE_CATEGORIES.map((category) => {
          const cat = dayVoting[category];
          const lockedId = cat.lockedOptionId ?? null;
          const showSuggestForm = category === "other";
          const showTailoredIntro = category !== "other";
          const draft = suggestDraft[category] ?? { label: "", detail: "", href: "" };
          const canPinCategory =
            isHost &&
            (category === "restaurants" || category === "activities");

          return (
            <DropSection
              key={category}
              title={dayCategoryTitle(category)}
              subtitle={categoryCollaborationSubtitle(category)}
              sectionId={`day-${category}`}
            >
              {showTailoredIntro ? (
                <p className="mb-4 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                  We blend pinned calendar items with quick picks based on your group&apos;s answers, vibe, budget, trip chat,
                  and open traveler suggestions.
                </p>
              ) : null}

              {cat.options.length === 0 ? (
                <EmptyHint label={`No ${dayCategoryTitle(category).toLowerCase()} options yet for this day.`} />
              ) : (
                <ul className={`grid gap-3 sm:grid-cols-2 ${showSuggestForm ? "mb-6" : ""}`}>
                  {cat.options.map((opt) => {
                    const voted = opt.votes.includes(viewerUserId);
                    const down = opt.downvotes?.includes(viewerUserId) ?? false;
                    const nInterested = opt.votes.length;
                    const nNot = opt.downvotes?.length ?? 0;
                    const isLocked = lockedId === opt.id;
                    const dimmed = Boolean(lockedId && lockedId !== opt.id);
                    return (
                      <li
                        key={opt.id}
                        className={`rounded-xl border p-3 transition ${
                          dimmed
                            ? "border-[color:var(--hairline)]/60 bg-[color:var(--surface-container-low)]/60 opacity-45 dark:border-white/10 dark:bg-white/5"
                            : "border-neutral-900/10 bg-white dark:border-white/10 dark:bg-dm-elevated"
                        }`}
                      >
                        <p className="font-sans text-base font-bold text-neutral-950 dark:text-white">{opt.label}</p>
                        {opt.suggestedBy === "conci:auto" ? (
                          <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-neutral-500/70 dark:text-neutral-500/70">
                            tailored from your trip / group
                          </p>
                        ) : null}
                        {opt.detail ? <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">{opt.detail}</p> : null}
                        {opt.href ? (
                          <a
                            href={opt.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex text-xs font-semibold text-teal-700 underline-offset-2 hover:underline dark:text-teal-400"
                          >
                            Open link
                          </a>
                        ) : null}
                        {isLocked && opt.lockedDetail ? (
                          <p className="mt-2 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                            Locked in: {opt.lockedDetail}
                          </p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={busyKey === `vote:${category}` || Boolean(lockedId)}
                            onClick={() => void runDayAction({ action: "vote", category, optionId: opt.id })}
                            className={`rounded-full border px-3 py-1 text-[11px] font-bold ${
                              voted
                                ? "border-teal-600 bg-teal-50 text-teal-900 dark:border-teal-400/60 dark:bg-teal-950/30 dark:text-teal-100"
                                : "border-neutral-900/20 dark:border-white/15"
                            }`}
                          >
                            Interested · {nInterested}
                          </button>
                          <button
                            type="button"
                            disabled={busyKey === `toggleNotInterested:${category}:${opt.id}` || Boolean(lockedId)}
                            onClick={() =>
                              void runDayAction({
                                action: "toggleNotInterested",
                                category,
                                optionId: opt.id,
                              })
                            }
                            className={`rounded-full border px-3 py-1 text-[11px] font-bold ${
                              down
                                ? "border-rose-500/70 bg-rose-50 text-rose-900 dark:border-rose-400/50 dark:bg-rose-950/35 dark:text-rose-100"
                                : "border-neutral-900/20 dark:border-white/15"
                            }`}
                          >
                            Not for me · {nNot}
                          </button>
                          {canPinCategory ? (
                            <button
                              type="button"
                              disabled={busyKey === `pinToCalendar:${category}:${opt.id}` || Boolean(lockedId)}
                              onClick={() =>
                                void runDayAction({
                                  action: "pinToCalendar",
                                  category,
                                  optionId: opt.id,
                                })
                              }
                              className="rounded-full border border-indigo-500/50 bg-indigo-50/80 px-3 py-1 text-[11px] font-bold text-indigo-900 dark:border-indigo-400/40 dark:bg-indigo-950/40 dark:text-indigo-100"
                            >
                              {busyKey === `pinToCalendar:${category}:${opt.id}` ? "Adding…" : "Add to trip"}
                            </button>
                          ) : null}
                          {isHost ? (
                            isLocked ? (
                              <button
                                type="button"
                                disabled={busyKey === `unlock:${category}`}
                                onClick={() => void runDayAction({ action: "unlock", category })}
                                className="rounded-full border border-amber-500/60 px-3 py-1 text-[11px] font-bold text-amber-800 dark:text-amber-200"
                              >
                                Unlock
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={busyKey === `lock:${category}`}
                                onClick={() => {
                                  const detail = window.prompt(lockPromptText(category), "");
                                  if (!detail || !detail.trim()) return;
                                  void runDayAction({ action: "lock", category, optionId: opt.id, detail });
                                }}
                                className="rounded-full border border-indigo-500/50 px-3 py-1 text-[11px] font-bold text-indigo-800 dark:text-indigo-200"
                              >
                                Lock in
                              </button>
                            )
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {showSuggestForm ? (
                <div className="rounded-xl border border-[color:var(--hairline)]/90 bg-white p-3 dark:border-white/10 dark:bg-dm-elevated">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                    Suggest an option
                  </p>
                  {!canSuggest ? (
                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                      Host set you to vote-only on suggestions. You can still vote on all options.
                    </p>
                  ) : null}
                  <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <input
                      value={draft.label}
                      onChange={(e) =>
                        setSuggestDraft((prev) => ({ ...prev, [category]: { ...draft, label: e.target.value } }))
                      }
                      disabled={!canSuggest}
                      className="rounded-lg border border-[color:var(--hairline)] bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-dm-card"
                      placeholder={`${dayCategoryTitle(category)} option`}
                    />
                    <input
                      value={draft.detail}
                      onChange={(e) =>
                        setSuggestDraft((prev) => ({ ...prev, [category]: { ...draft, detail: e.target.value } }))
                      }
                      disabled={!canSuggest}
                      className="rounded-lg border border-[color:var(--hairline)] bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-dm-card"
                      placeholder="Optional detail"
                    />
                    <input
                      value={draft.href}
                      onChange={(e) =>
                        setSuggestDraft((prev) => ({ ...prev, [category]: { ...draft, href: e.target.value } }))
                      }
                      disabled={!canSuggest}
                      className="rounded-lg border border-[color:var(--hairline)] bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-dm-card"
                      placeholder="Optional URL"
                    />
                    <button
                      type="button"
                      disabled={!canSuggest || busyKey === `suggest:${category}` || !draft.label.trim()}
                      onClick={() =>
                        void runDayAction({
                          action: "suggest",
                          category,
                          label: draft.label,
                          detail: draft.detail,
                          href: draft.href,
                        }).then(() =>
                          setSuggestDraft((prev) => ({ ...prev, [category]: { label: "", detail: "", href: "" } }))
                        )
                      }
                      className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>
                </div>
              ) : null}
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
