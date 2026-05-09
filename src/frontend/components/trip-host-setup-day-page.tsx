"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CollabStateV1 } from "@/shared/collaboration";
import { DAY_VOTE_CATEGORIES, mergeDayVoteStateForDate, parseDayVoteState, type DayVoteCategory } from "@/shared/day-collaboration";
import { formatLocalIsoDate } from "@/shared/date-option-parse";
import { estimateHostDaySpendUsd } from "@/shared/host-day-spend-estimate";
import { useTripWorkspaceRealtime } from "@/frontend/hooks/use-trip-workspace-realtime";
import {
  enumerateLocalIsoDays,
  hotelStayForDay,
  normalizePlan,
  parseLocalIsoDate,
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
          Pin a hotel night, restaurants, or experiences on this day to build an estimate.
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
            <span className="text-teal-700 dark:text-teal-300">Hotel (night share)</span>
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

function EmptyHint({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[6rem] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/80 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-dm-page/80 dark:text-neutral-500">
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
    mergeDayVoteStateForDate(initialPlan, parseDayVoteState(initialCollab.dayVoting), dateIso)
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
    setDayVotingByDate(mergeDayVoteStateForDate(initialPlan, parseDayVoteState(initialCollab.dayVoting), dateIso));
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
          setDayVotingByDate((prev) => mergeDayVoteStateForDate(plan, { ...prev, ...parseDayVoteState(payload.dayVoting) }, dateIso));
        }
      },
      [plan, dateIso]
    ),
    { enabled: true, suppressRealtimeUntilRef }
  );

  const runDayAction = useCallback(
    async (payload: Record<string, unknown>) => {
      setDayErr(null);
      const key = `${String(payload.action)}:${String(payload.category ?? "")}`;
      setBusyKey(key);
      try {
        const res = await fetch(`/api/trip-plans/${tripId}/day-vote`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dateIso, ...payload }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string; dayVoting?: unknown };
        if (!res.ok) throw new Error(j.error || "Could not save");
        if (j.dayVoting) {
          setDayVotingByDate(mergeDayVoteStateForDate(plan, parseDayVoteState(j.dayVoting), dateIso));
        }
      } catch (e) {
        setDayErr(e instanceof Error ? e.message : "Could not save.");
      } finally {
        setBusyKey(null);
      }
    },
    [tripId, dateIso, plan]
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

  const hotel = hotelStayForDay(hostSetup?.hotelStays ?? [], dateIso);

  const meals = (hostSetup?.restaurantPins ?? []).filter((p) => p.dateIso === dateIso && p.kept);
  const activities = (hostSetup?.activityPins ?? []).filter((p) => p.dateIso === dateIso && p.kept);
  const dayVoting = useMemo(() => mergeDayVoteStateForDate(plan, dayVotingByDate, dateIso)[dateIso], [plan, dayVotingByDate, dateIso]);

  const scheduleItems = useMemo(() => {
    const rows: { key: string; label: string; sub: string; href?: string }[] = [];
    for (const p of meals) {
      rows.push({
        key: `m-${p.place.mapsUrl}`,
        label: p.place.name,
        sub: "Restaurant",
        href: p.place.mapsUrl,
      });
    }
    for (const p of activities) {
      rows.push({
        key: `a-${p.experience.bookingUrl}`,
        label: p.experience.name,
        sub: "Activity",
        href: p.experience.bookingUrl || undefined,
      });
    }
    return rows;
  }, [meals, activities]);

  const prevIso = shiftIsoDay(dateIso, -1);
  const nextIso = shiftIsoDay(dateIso, 1);

  const tripRange = plan.hostSetup?.tripRange;
  const spendBreakdown = useMemo(() => {
    if (!tripRange?.startIso || !tripRange.endIso) return null;
    if (!enumerateLocalIsoDays(tripRange.startIso, tripRange.endIso).includes(dateIso)) return null;
    const dayMeals = (plan.hostSetup?.restaurantPins ?? []).filter((p) => p.dateIso === dateIso && p.kept);
    const dayActs = (plan.hostSetup?.activityPins ?? []).filter((p) => p.dateIso === dateIso && p.kept);
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
        <span className="text-slate-600 dark:text-neutral-400">Host day view</span>
      </nav>

      <header className="mb-10 grid gap-6 lg:grid-cols-[minmax(0,220px)_1fr_minmax(0,280px)] lg:items-start">
        <div className="rounded-[1.35rem] border-4 border-black bg-[#ffb6d9]/35 px-5 py-4 shadow-[inset_0_0_0_1px_rgba(236,72,153,0.35)] dark:border-white/25 dark:bg-rose-950/40 dark:shadow-none">
          <p className="font-sans text-sm font-black uppercase tracking-[0.12em] text-neutral-950 dark:text-white">{dest}</p>
          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-700 dark:text-neutral-300">Hotel</p>
          <p className="mt-1 text-sm font-bold text-neutral-900 dark:text-white">
            {hotel ? hotel.place.name : "TBD"}
          </p>
          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-700 dark:text-neutral-300">Main Plans</p>
          <p className="mt-1 text-sm font-bold text-neutral-900 dark:text-white">
            {scheduleItems.length > 0 ? `${scheduleItems.length} stops` : "TBD"}
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
              Same Trip Copilot powers as on the calendar: ask to swap the hotel segment for this night, change dinner, pin an
              experience — we scope edits to{" "}
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">{dateIso}</span> when possible.
            </p>
            <textarea
              id={`daydream-${dateIso}`}
              placeholder={`e.g. Italian dinner instead of tacos · beach club this afternoon · different hotel nearer downtown…`}
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
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-dm-elevated"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{m.displayName}</p>
                        <p className="text-xs text-slate-500 dark:text-neutral-500">
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

        <DropSection title="Schedule" subtitle="— Auto populated" sectionId="day-schedule" defaultOpen>
          {scheduleItems.length === 0 ? (
            <EmptyHint label="No meals or activities pinned yet — use Add places on the trip calendar, or pull from live picks after." />
          ) : (
            <div className="overflow-x-auto">
              <div className="flex min-w-[36rem] gap-3 pb-1">
                {scheduleItems.map((row) => (
                  <article
                    key={row.key}
                    className="min-w-[10.5rem] flex-1 rounded-xl border-2 border-neutral-900/10 bg-[#ffe4f1]/50 px-3 py-3 dark:border-white/10 dark:bg-rose-950/25"
                  >
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#c4176d] dark:text-[#ff7eb8]">
                      {row.sub}
                    </span>
                    <p className="mt-2 font-sans text-sm font-bold text-neutral-950 dark:text-white">{row.label}</p>
                    {row.href ? (
                      <a
                        href={row.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex font-sans text-[10px] font-black uppercase tracking-wide text-[#0066cc] underline-offset-2 hover:underline dark:text-sky-400"
                      >
                        Map me there
                      </a>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          )}
        </DropSection>

        {DAY_VOTE_CATEGORIES.map((category) => {
          const cat = dayVoting[category];
          const lockedId = cat.lockedOptionId ?? null;
          const subtitle =
            category === "restaurants"
              ? "Catered to your group's taste"
              : category === "hotels"
                ? "Stay for this night"
                : "Collaborative options";
          const draft = suggestDraft[category] ?? { label: "", detail: "", href: "" };
          return (
            <DropSection
              key={category}
              title={dayCategoryTitle(category)}
              subtitle={subtitle}
              sectionId={`day-${category}`}
            >
              <div className="mb-4 rounded-xl border border-slate-200/90 bg-white p-3 dark:border-white/10 dark:bg-dm-elevated">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-500">
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
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-dm-card"
                    placeholder={`${dayCategoryTitle(category)} option`}
                  />
                  <input
                    value={draft.detail}
                    onChange={(e) =>
                      setSuggestDraft((prev) => ({ ...prev, [category]: { ...draft, detail: e.target.value } }))
                    }
                    disabled={!canSuggest}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-dm-card"
                    placeholder="Optional detail"
                  />
                  <input
                    value={draft.href}
                    onChange={(e) =>
                      setSuggestDraft((prev) => ({ ...prev, [category]: { ...draft, href: e.target.value } }))
                    }
                    disabled={!canSuggest}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-dm-card"
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
              {cat.options.length === 0 ? (
                <EmptyHint label={`No ${dayCategoryTitle(category).toLowerCase()} options yet for this day.`} />
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {cat.options.map((opt) => {
                    const voted = opt.votes.includes(viewerUserId);
                    const isLocked = lockedId === opt.id;
                    const dimmed = Boolean(lockedId && lockedId !== opt.id);
                    return (
                      <li
                        key={opt.id}
                        className={`rounded-xl border p-3 transition ${
                          dimmed
                            ? "border-slate-200/60 bg-slate-50/60 opacity-45 dark:border-white/10 dark:bg-white/5"
                            : "border-neutral-900/10 bg-white dark:border-white/10 dark:bg-dm-elevated"
                        }`}
                      >
                        <p className="font-sans text-base font-bold text-neutral-950 dark:text-white">{opt.label}</p>
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
                            {voted ? "Voted" : "Vote"} · {opt.votes.length}
                          </button>
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
