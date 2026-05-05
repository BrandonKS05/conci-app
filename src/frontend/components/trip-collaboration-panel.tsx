"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { primaryFilledInteractive } from "@/frontend/ui/primary-action";
import {
  ACTIVITY_POLL_DECISION_KEY,
  buildClassifiedDecisions,
  collaborationQuorum,
  countLocked,
  datesGroupResolved,
  decisionDependsOnDatesLocked,
  isDecisionLocked,
  isTransportStyleGroupPoll,
  parseCollabState,
  TRANSPORT_POLL_DECISION_KEY,
  VIBE_POLL_DECISION_KEY,
  BUDGET_POLL_DECISION_KEY,
  VENUE_POLL_DECISION_KEY,
  type ClassifiedDecision,
  type CollabDecisionBlob,
  type CollabStateV1,
} from "@/shared/collaboration";
import {
  formatBudgetPollChipLabel,
  isValidBudgetCustomVoteToken,
  parseBudgetCustomAmountInput,
} from "@/shared/budget-poll";
import { visitorVoteKey, voteKeysIntersectAliases } from "@/shared/collab-vote-keys";
import {
  POLL_WRITE_IN_MAX_LEN,
  coerceScalarVoteChoice,
  coerceVoteAgainstList,
  isAllowedPollWriteIn,
} from "@/shared/collab-pick-vote";
import {
  dateVoteMatchesHostBallot,
  formatBallotProposalHeading,
  inferDefaultYearFromDateOptions,
  isParsableConcreteDateBallotLine,
} from "@/shared/date-option-parse";
import {
  normalizePlan,
  tripLiveRecommendationsContextFingerprint,
  type TripPlan,
} from "@/shared/trip-plan";
import type { HotelPick } from "@/shared/hotels";
import { mergeLiveRestaurantsOntoHints, type RestaurantPick } from "@/shared/restaurants";
import type { TripLiveRecommendationsPayload } from "@/shared/trip-live-recommendations";
import type { TripPlanStatus } from "@/shared/trip-status";
import type { TripRosterPerson } from "@/shared/trip-roster";
import { LivePlaceCoverImage } from "@/frontend/components/live-place-cover-image";
import { DatesSingleProposalMemberVote, DatesVoteCalendar } from "@/frontend/components/dates-vote-calendar";
import { HostTripMemberEmailModal } from "@/frontend/components/host-trip-member-email-modal";
import {
  CuratedExperiencesSection,
  CuratedFlightsRows,
  CuratedRestaurantsSection,
  LiveCurationErrorBanner,
  useLiveCurationMutation,
} from "@/frontend/components/trip-plan-live-curate";

type CollabPayload = {
  collab: CollabStateV1;
  classified: ClassifiedDecision[];
  quorum: number;
  visitorKey: string;
  canonicalVoterKey: string;
  roster: TripRosterPerson[];
  viewerIsTripOwner?: boolean;
  nudgeEmailReady?: boolean;
  /** Trip `trip_plans.user_id` — used to hide remove on the owner row. */
  tripOwnerUserId?: string;
  planSnapshot: { datesOptions: string[]; peopleNames: string[]; peopleCount: number | null };
};

function rosterNudgeKey(p: TripRosterPerson): string {
  if (p.memberId) return `m:${p.memberId}`;
  return "";
}

/** Raw vote blob for the current traveler (canonical member key first). */
function readRawVotePayload(
  votes: Record<string, unknown>,
  visitorKey: string,
  canonicalVoterKey: string
): unknown {
  const order = [canonicalVoterKey, visitorVoteKey(visitorKey), visitorKey].filter(
    (k): k is string => typeof k === "string" && k.length > 0
  );
  const seen = new Set<string>();
  for (const k of order) {
    if (seen.has(k)) continue;
    seen.add(k);
    const v = votes[k];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function readScalarVote(
  votes: Record<string, unknown>,
  visitorKey: string,
  canonicalVoterKey: string
): string | null {
  const raw = readRawVotePayload(votes, visitorKey, canonicalVoterKey);
  if (typeof raw === "string") return raw.length ? raw : null;
  return coerceScalarVoteChoice(raw);
}

function readPeopleVoteRow(
  votes: Record<string, unknown>,
  visitorKey: string,
  canonicalVoterKey: string
): Record<string, "in" | "maybe" | "out"> {
  const order = [canonicalVoterKey, visitorVoteKey(visitorKey), visitorKey].filter(
    (k): k is string => typeof k === "string" && k.length > 0
  );
  for (const k of order) {
    const v = votes[k];
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, "in" | "maybe" | "out">;
  }
  return {};
}

export function TripCollaborationPanel({
  tripId,
  plan,
  tripStatus,
  isHost,
  collabRefreshSignal = 0,
  onPlanUpdated,
  groupProgressStickyTarget,
}: {
  tripId: string;
  plan: TripPlan;
  tripStatus: TripPlanStatus;
  isHost: boolean;
  /** Increment to refetch collaboration payload (e.g. after trip card chat / spotlight votes). */
  collabRefreshSignal?: number;
  /** Called after live suggestion curation is saved (restaurants, experiences, flights). */
  onPlanUpdated?: (plan: TripPlan) => void;
  /**
   * When set (typically the trip page’s sticky aside mount), Group Progress renders there via portal.
   * Omit to use the panel’s built-in grid / stacked layout.
   */
  groupProgressStickyTarget?: HTMLElement | null;
}) {
  const router = useRouter();
  const stickyGroupProgressRail = typeof groupProgressStickyTarget !== "undefined";
  const [data, setData] = useState<CollabPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [finalizeBusy, setFinalizeBusy] = useState(false);
  const [finalizeErr, setFinalizeErr] = useState<string | null>(null);
  const [datesHostConfirmBusy, setDatesHostConfirmBusy] = useState(false);
  const [datesHostConfirmErr, setDatesHostConfirmErr] = useState<string | null>(null);
  const [nudgeBusyKey, setNudgeBusyKey] = useState<string | null>(null);
  const [nudgeNotice, setNudgeNotice] = useState<string | null>(null);
  const [removeMemberBusyId, setRemoveMemberBusyId] = useState<string | null>(null);
  const [removeMemberErr, setRemoveMemberErr] = useState<string | null>(null);
  const [notifySelectedMemberIds, setNotifySelectedMemberIds] = useState(() => new Set<string>());
  const [notifyEmailModalOpen, setNotifyEmailModalOpen] = useState(false);
  const [notifyEmailModalRecipients, setNotifyEmailModalRecipients] = useState<string[]>([]);
  const [liveData, setLiveData] = useState<TripLiveRecommendationsPayload | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveFetchErr, setLiveFetchErr] = useState<string | null>(null);
  const [transportMode, setTransportMode] = useState<"fly" | "drive">("fly");

  const transportStorageKey = `conci_trip_transport_${tripId}`;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(transportStorageKey);
      if (raw === "drive" || raw === "fly") setTransportMode(raw);
    } catch {
      /* ignore */
    }
  }, [transportStorageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(transportStorageKey, transportMode);
    } catch {
      /* ignore */
    }
  }, [transportMode, transportStorageKey]);

  const livePlanContext = tripLiveRecommendationsContextFingerprint(plan);

  useEffect(() => {
    let cancelled = false;
    setLiveLoading(true);
    setLiveFetchErr(null);
    void (async () => {
      try {
        const r = await fetch(`/api/trip-plans/${tripId}/live-recommendations`, { credentials: "include" });
        const j = (await r.json().catch(() => ({}))) as Partial<TripLiveRecommendationsPayload> & { error?: string };
        if (!r.ok) {
          if (!cancelled) setLiveFetchErr(typeof j.error === "string" ? j.error : "Could not load live picks.");
          return;
        }
        if (!cancelled) setLiveData(j as TripLiveRecommendationsPayload);
      } catch {
        if (!cancelled) setLiveFetchErr("Could not reach the server for live picks.");
      } finally {
        if (!cancelled) setLiveLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId, livePlanContext]);

  const load = useCallback(async () => {
    const r = await fetch(`/api/trip-plans/${tripId}/collab`, { credentials: "include" });
    const j = (await r.json().catch(() => ({}))) as { error?: string } & Partial<CollabPayload>;
    if (!r.ok) {
      setError(typeof j.error === "string" ? j.error : "Could not load collaboration.");
      setData(null);
      return;
    }
    setData(j as CollabPayload);
    setError(null);
  }, [tripId]);

  useEffect(() => {
    void load();
  }, [load, collabRefreshSignal]);

  const classified = data?.classified ?? buildClassifiedDecisions(plan);
  const collab = data?.collab ?? parseCollabState(null);
  const quorum = data?.quorum ?? collaborationQuorum(plan);

  const viewerMemberId = useMemo(() => {
    const k = data?.canonicalVoterKey ?? "";
    return k.startsWith("member:") ? k.slice("member:".length) : null;
  }, [data?.canonicalVoterKey]);

  const showHostNotifyUi =
    isHost && data?.viewerIsTripOwner === true && Boolean(data?.nudgeEmailReady);

  const notifyEligibleMemberIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of data?.roster ?? []) {
      const id = p.memberId;
      if (typeof id !== "string" || !id) continue;
      if (viewerMemberId && id === viewerMemberId) continue;
      ids.add(id);
    }
    return ids;
  }, [data?.roster, viewerMemberId]);

  useEffect(() => {
    setNotifySelectedMemberIds((prev) => new Set([...prev].filter((id) => notifyEligibleMemberIds.has(id))));
  }, [notifyEligibleMemberIds]);

  const toggleNotifyMember = useCallback((memberId: string) => {
    if (!notifyEligibleMemberIds.has(memberId)) return;
    setNotifySelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  }, [notifyEligibleMemberIds]);

  const notifyCheckAllEligible = useCallback(() => {
    setNotifySelectedMemberIds(new Set(notifyEligibleMemberIds));
  }, [notifyEligibleMemberIds]);

  const notifyUncheckAll = useCallback(() => {
    setNotifySelectedMemberIds(new Set());
  }, []);

  const lockedCount = useMemo(() => countLocked(classified, collab), [classified, collab]);
  const datesLockedByGroup = useMemo(
    () => datesGroupResolved(plan, classified, collab),
    [plan, classified, collab]
  );

  /** Open decisions: interactive first, date-gated (hotels / dinner) last until weekends lock. Host-confirmed trip dates stay interactive for member feedback. */
  const activeDecisionOrder = useMemo(
    () =>
      classified
        .filter((meta) => {
          if (meta.kind === "dates" && plan.dates.confirmed) return true;
          return !isDecisionLocked(collab.decisions[meta.key]);
        })
        .sort((a, b) => {
          const ga = decisionDependsOnDatesLocked(a) && !datesLockedByGroup;
          const gb = decisionDependsOnDatesLocked(b) && !datesLockedByGroup;
          if (ga !== gb) return ga ? 1 : -1;
          return a.index - b.index;
        }),
    [classified, collab, datesLockedByGroup, plan.dates.confirmed]
  );

  const total = classified.length;
  const progress = total === 0 ? 100 : Math.round((lockedCount / total) * 100);
  const allLocked = total > 0 && lockedCount === total;
  /** Includes synthetic date/poll cards, not only explicit openDecisions strings. */
  const noDecisionsToResolve = total === 0;
  const showReady = noDecisionsToResolve || allLocked;
  const showDecideTogetherColumn = total > 0 && (!showReady || activeDecisionOrder.length > 0);

  const canSendNudges = isHost && data?.viewerIsTripOwner === true && Boolean(data?.nudgeEmailReady);

  const sendOneNudge = async (p: TripRosterPerson) => {
    const key = rosterNudgeKey(p);
    if (!key) return;
    setNudgeBusyKey(key);
    setNudgeNotice(null);
    try {
      const body = p.memberId != null ? { memberId: p.memberId } : null;
      if (!body) return;
      const r = await fetch(`/api/trip-plans/${tripId}/collab/nudge`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json().catch(() => ({}))) as {
        error?: string;
        channel?: string;
        displayName?: string;
      };
      if (!r.ok) {
        setNudgeNotice(typeof j.error === "string" ? j.error : "Could not send reminder.");
        return;
      }
      const ch = j.channel === "email" ? "email" : "message";
      setNudgeNotice(
        j.displayName ? `Sent ${ch} reminder to ${j.displayName}.` : `Sent ${ch} reminder.`
      );
      await load();
    } finally {
      setNudgeBusyKey(null);
    }
  };

  const sendNudgeAllPending = async () => {
    if (!canSendNudges) return;
    const pending = (data?.roster ?? []).filter((p) => !p.hasParticipated);
    if (pending.length === 0) return;
    if (!window.confirm(`Send a reminder to up to ${Math.min(pending.length, 25)} pending travelers?`)) return;
    setNudgeBusyKey("__all__");
    setNudgeNotice(null);
    try {
      const r = await fetch(`/api/trip-plans/${tripId}/collab/nudge`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nudgeAllPending: true }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        error?: string;
        results?: { displayName: string; ok: boolean; channel?: string; error?: string }[];
      };
      if (!r.ok) {
        setNudgeNotice(typeof j.error === "string" ? j.error : "Batch nudge failed.");
        return;
      }
      const okN = (j.results ?? []).filter((x) => x.ok).length;
      const failN = (j.results ?? []).filter((x) => !x.ok).length;
      setNudgeNotice(`Reminders sent: ${okN}. Skipped or failed: ${failN}.`);
      await load();
    } finally {
      setNudgeBusyKey(null);
    }
  };

  const removeMemberFromTrip = useCallback(
    async (memberUserId: string, displayName: string) => {
      if (
        !window.confirm(
          `Remove ${displayName} from this trip? They will lose access; their votes on group decisions will be cleared.`
        )
      ) {
        return;
      }
      setRemoveMemberBusyId(memberUserId);
      setRemoveMemberErr(null);
      try {
        const r = await fetch(`/api/trip-plans/${tripId}/members/${memberUserId}`, {
          method: "DELETE",
          credentials: "include",
        });
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        if (!r.ok) {
          setRemoveMemberErr(typeof j.error === "string" ? j.error : "Could not remove member.");
          return;
        }
        await load();
      } catch {
        setRemoveMemberErr("Network error — try again.");
      } finally {
        setRemoveMemberBusyId(null);
      }
    },
    [tripId, load]
  );

  const submitVote = async (payload: Record<string, unknown>) => {
    setBusyKey(typeof payload.decisionKey === "string" ? payload.decisionKey : "x");
    try {
      const r = await fetch(`/api/trip-plans/${tripId}/collab/vote`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setError(typeof j.error === "string" ? j.error : "Vote failed.");
        return;
      }
      await load();
      setError(null);
    } finally {
      setBusyKey(null);
    }
  };

  const confirmHostTripDates = useCallback(async (): Promise<boolean> => {
    if (!isHost || plan.dates.confirmed || plan.dates.options.length === 0) return false;
    setDatesHostConfirmBusy(true);
    setDatesHostConfirmErr(null);
    try {
      const r = await fetch(`/api/trip-plans/${tripId}/dates/confirm`, {
        method: "POST",
        credentials: "include",
      });
      const j = (await r.json()) as { plan?: unknown; error?: string };
      if (!r.ok) {
        setDatesHostConfirmErr(typeof j.error === "string" ? j.error : "Could not confirm dates.");
        return false;
      }
      if (j.plan && typeof j.plan === "object") {
        onPlanUpdated?.(normalizePlan(j.plan));
      }
      await load();
      return true;
    } catch {
      setDatesHostConfirmErr("Network error — try again.");
      return false;
    } finally {
      setDatesHostConfirmBusy(false);
    }
  }, [isHost, plan.dates.confirmed, plan.dates.options.length, tripId, onPlanUpdated, load]);

  const renderGroupProgressCard = () => (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-500">Group progress</p>
        <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
          {lockedCount}/{total} decisions locked
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-neutral-500">
        Quorum: at least <strong>{quorum}</strong> people need to vote to lock a decision (when options exist).
      </p>
      {data?.roster && data.roster.length > 0 ? (
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-3 dark:border-white/10 dark:bg-dm-elevated/80">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-500">
              Who&apos;s weighing in
            </p>
            {canSendNudges && data.roster.some((p) => !p.hasParticipated) ? (
              <button
                type="button"
                disabled={nudgeBusyKey !== null}
                onClick={() => void sendNudgeAllPending()}
                className="shrink-0 rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-800 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-500/30 dark:bg-dm-page dark:text-indigo-200 dark:hover:bg-indigo-950/40"
              >
                {nudgeBusyKey === "__all__" ? "Sending…" : "Nudge all pending"}
              </button>
            ) : null}
          </div>
          {isHost && data?.viewerIsTripOwner === true && !data?.nudgeEmailReady ? (
            <p className="mt-2 text-[11px] leading-relaxed text-amber-800 dark:text-amber-200/90">
              Set <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-950/50">RESEND_API_KEY</code> +{" "}
              <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-950/50">NUDGE_EMAIL_FROM</code> in{" "}
              <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-950/50">.env.local</code> to send email reminders.
            </p>
          ) : null}
          {nudgeNotice ? (
            <p className="mt-2 text-[11px] text-slate-600 dark:text-neutral-400">{nudgeNotice}</p>
          ) : null}
          {removeMemberErr ? (
            <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-400" role="alert">
              {removeMemberErr}
            </p>
          ) : null}
          {showHostNotifyUi && notifyEligibleMemberIds.size > 0 ? (
            <div className="mt-3 space-y-2 border-t border-slate-200/80 pt-3 dark:border-white/10">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <button
                  type="button"
                  onClick={() => notifyCheckAllEligible()}
                  className="text-[11px] font-medium text-slate-500 underline decoration-slate-400/60 underline-offset-2 transition hover:text-slate-700 dark:text-neutral-500 dark:decoration-neutral-600 dark:hover:text-neutral-300"
                >
                  Check all
                </button>
                <button
                  type="button"
                  onClick={() => notifyUncheckAll()}
                  className="text-[11px] font-medium text-slate-500 underline decoration-slate-400/60 underline-offset-2 transition hover:text-slate-700 dark:text-neutral-500 dark:decoration-neutral-600 dark:hover:text-neutral-300"
                >
                  Uncheck all
                </button>
              </div>
              <button
                type="button"
                disabled={notifySelectedMemberIds.size === 0}
                onClick={() => {
                  if (notifySelectedMemberIds.size === 0) return;
                  setNotifyEmailModalRecipients([...notifySelectedMemberIds]);
                  setNotifyEmailModalOpen(true);
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-dm-page dark:text-neutral-200 dark:hover:bg-dm-elevated"
              >
                Notify selected
              </button>
            </div>
          ) : null}
          <ul className="mt-2 space-y-2 text-xs text-slate-700 dark:text-neutral-300">
            {data.roster.map((p, i) => {
              const nk = rosterNudgeKey(p);
              const showNudge = canSendNudges && !p.hasParticipated && nk.length > 0;
              const recipientId =
                typeof p.memberId === "string" && p.memberId.length > 0 ? p.memberId : null;
              const showEmailCheckbox =
                Boolean(showHostNotifyUi && recipientId && notifyEligibleMemberIds.has(recipientId));
              const ownerId = data.tripOwnerUserId;
              const canRemoveMember =
                isHost &&
                Boolean(recipientId) &&
                typeof ownerId === "string" &&
                recipientId !== ownerId &&
                recipientId !== viewerMemberId;
              return (
                <li
                  key={`${p.kind}-${p.memberId ?? ""}-${p.displayName}-${i}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-transparent px-1 py-0.5 hover:border-slate-200/80 dark:hover:border-white/10"
                >
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
                    {showEmailCheckbox && recipientId ? (
                      <label className="flex shrink-0 cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={notifySelectedMemberIds.has(recipientId)}
                          onChange={() => toggleNotifyMember(recipientId)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-white/20 dark:bg-dm-card"
                        />
                      </label>
                    ) : null}
                    <span className="font-medium">{p.displayName}</span>
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {p.hasParticipated ? "✓" : <span className="text-slate-400 dark:text-neutral-500">pending</span>}
                    </span>
                    {p.maskedContact ? (
                      <span className="text-[11px] text-slate-500 dark:text-neutral-500">{p.maskedContact}</span>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {showNudge ? (
                      <button
                        type="button"
                        disabled={nudgeBusyKey !== null}
                        onClick={() => void sendOneNudge(p)}
                        className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-indigo-800 hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:bg-dm-page dark:text-indigo-200 dark:hover:bg-dm-elevated"
                      >
                        {nudgeBusyKey === nk ? "…" : "Nudge"}
                      </button>
                    ) : null}
                    {canRemoveMember && recipientId ? (
                      <button
                        type="button"
                        disabled={removeMemberBusyId !== null}
                        onClick={() => void removeMemberFromTrip(recipientId, p.displayName)}
                        className="rounded-md border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/50 dark:bg-dm-page dark:text-rose-300 dark:hover:bg-rose-950/40"
                      >
                        {removeMemberBusyId === recipientId ? "…" : "Remove"}
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );

  if (error && !data) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
        {error}
      </p>
    );
  }

  const mainCollaborationColumn = (
    <>
      {showDecideTogetherColumn ? (
        <div className="space-y-6">
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-neutral-100">Decide together</h2>
          {activeDecisionOrder.map((meta) => {
            const blob = collab.decisions[meta.key];
            const gated = decisionDependsOnDatesLocked(meta) && !datesLockedByGroup;
            return (
              <DecisionCard
                key={meta.key}
                tripId={tripId}
                meta={meta}
                blob={blob}
                plan={plan}
                quorum={quorum}
                visitorKey={data?.visitorKey ?? ""}
                canonicalVoterKey={data?.canonicalVoterKey ?? visitorVoteKey(data?.visitorKey ?? "")}
                roster={data?.roster ?? []}
                busy={busyKey === meta.key}
                onVote={(p) => void submitVote(p)}
                reloadCollab={load}
                blockedByDates={gated}
                canRunHotelSearch={isHost}
                liveVenueMerge={meta.key === VENUE_POLL_DECISION_KEY ? liveData?.restaurants ?? null : null}
                isHost={isHost}
                datesHostConfirmBusy={datesHostConfirmBusy}
                datesHostConfirmErr={datesHostConfirmErr}
                onHostConfirmDates={confirmHostTripDates}
              />
            );
          })}
        </div>
      ) : null}

      {lockedCount > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-500">
            Locked in
          </h3>
          <ul className="space-y-3">
            {classified.map((meta) => {
              const blob = collab.decisions[meta.key];
              if (!isDecisionLocked(blob)) return null;
              if (meta.kind === "dates" && plan.dates.confirmed) return null;
              return (
                <li
                  key={meta.key}
                  className="overflow-hidden rounded-2xl border-2 border-emerald-400/60 bg-gradient-to-br from-emerald-50 via-white to-violet-50/40 shadow-sm dark:border-emerald-600/35 dark:from-emerald-950/50 dark:via-dm-card dark:to-violet-950/20 dark:shadow-none"
                >
                  <div className="flex items-start gap-3 px-4 py-4 sm:gap-4 sm:px-5 sm:py-4">
                    <span className="text-2xl leading-none text-emerald-600 dark:text-emerald-400" aria-hidden>
                      ✅
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-lg font-semibold tracking-tight text-emerald-950 dark:text-emerald-100">
                        {resolvedCelebrationHeadline(meta, blob)}
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed text-emerald-900/85 dark:text-emerald-200/90">
                        {formatResolvedDetail(meta, blob)}
                      </p>
                    </div>
                  </div>
                  {meta.kind === "dates" &&
                  isHost &&
                  !plan.dates.confirmed &&
                  plan.dates.options.length > 0 ? (
                    <div className="border-t border-emerald-200/50 bg-emerald-50/30 px-4 py-4 dark:border-emerald-800/40 dark:bg-emerald-950/25 sm:px-5">
                      <HostDatesConfirmFooter
                        embedded
                        quorum={quorum}
                        voterN={Object.keys((blob?.votes ?? {}) as Record<string, unknown>).length}
                        voteBusy={busyKey === meta.key}
                        confirmBusy={datesHostConfirmBusy}
                        errorMessage={datesHostConfirmErr}
                        onHostConfirmDates={confirmHostTripDates}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <TripPlanLiveBlocks
        tripId={tripId}
        plan={plan}
        liveData={liveData}
        liveLoading={liveLoading}
        liveFetchErr={liveFetchErr}
        transportMode={transportMode}
        onTransportModeChange={setTransportMode}
        onPlanUpdated={onPlanUpdated}
      />
    </>
  );

  return (
    <div className="space-y-8">
      <HostTripMemberEmailModal
        open={notifyEmailModalOpen}
        tripId={tripId}
        recipientMemberIds={notifyEmailModalRecipients}
        onClose={() => {
          setNotifyEmailModalOpen(false);
          setNotifyEmailModalRecipients([]);
        }}
        onSendSuccess={() => {
          setNotifySelectedMemberIds(new Set());
        }}
      />
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-center text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {showReady && tripStatus === "finalized" ? (
        <div className="rounded-3xl border-2 border-emerald-300 bg-gradient-to-b from-emerald-50 to-white p-8 text-center shadow-lg dark:border-emerald-700/40 dark:from-emerald-950/50 dark:to-dm-card dark:shadow-black/30">
          <p className="font-display text-2xl font-semibold text-emerald-950 dark:text-emerald-100">Trip finalized</p>
          <p className="mt-2 text-sm text-emerald-900/90 dark:text-emerald-200/90">
            Open the booking checklist to reserve stays, flights, and dinner.
          </p>
          <Link
            href={`/booking/${tripId}`}
            className="mt-6 inline-flex rounded-xl bg-emerald-700 px-8 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-800"
          >
            View booking checklist
          </Link>
        </div>
      ) : null}

      {showReady && tripStatus !== "finalized" && isHost ? (
        <div className="rounded-3xl border-2 border-indigo-200 bg-gradient-to-b from-indigo-50 to-white p-8 text-center shadow-lg dark:border-indigo-500/30 dark:from-indigo-950/40 dark:to-dm-card dark:shadow-black/30">
          <p className="font-display text-2xl font-semibold text-slate-900 dark:text-neutral-100">All decisions resolved</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-neutral-400">
            Finalize the trip to unlock the booking checklist for everyone.
          </p>
          {finalizeErr ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
              {finalizeErr}
            </p>
          ) : null}
          <button
            type="button"
            disabled={finalizeBusy}
            onClick={() => {
              setFinalizeErr(null);
              setFinalizeBusy(true);
              void (async () => {
                try {
                  const r = await fetch(`/api/trip-plans/${tripId}/finalize`, {
                    method: "POST",
                    credentials: "include",
                  });
                  const j = (await r.json().catch(() => ({}))) as { error?: string; detail?: string };
                  if (!r.ok) {
                    setFinalizeErr([j.error, j.detail].filter(Boolean).join(" ") || "Could not finalize.");
                    return;
                  }
                  router.push(`/booking/${tripId}`);
                  router.refresh();
                } catch {
                  setFinalizeErr("Network error. Try again.");
                } finally {
                  setFinalizeBusy(false);
                }
              })();
            }}
            className={`mt-6 inline-flex rounded-xl px-8 py-3 text-sm shadow-md disabled:opacity-50 ${primaryFilledInteractive}`}
          >
            {finalizeBusy ? "Finalizing…" : "Finalize trip"}
          </button>
        </div>
      ) : null}

      {showReady && tripStatus !== "finalized" && !isHost ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-center text-sm text-slate-700 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-300">
          Every decision is resolved. The trip host can <strong>finalize</strong> the trip to open the booking checklist.
        </div>
      ) : null}

      {!showReady ? (
        stickyGroupProgressRail ? (
          <>
            <div className="space-y-8">{mainCollaborationColumn}</div>
            {groupProgressStickyTarget
              ? createPortal(renderGroupProgressCard(), groupProgressStickyTarget)
              : null}
          </>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[70%_30%] lg:items-start lg:gap-8">
            <div className="min-w-0 space-y-8">{mainCollaborationColumn}</div>
            <aside
              aria-label="Group progress"
              className="min-w-0 lg:sticky lg:top-28 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto"
            >
              {renderGroupProgressCard()}
            </aside>
          </div>
        )
      ) : (
        <div className="space-y-8">{mainCollaborationColumn}</div>
      )}
    </div>
  );
}

function googleMapsDirUrl(origin: string, dest: string): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}`;
}

function TripPlanLiveBlocks({
  tripId,
  plan,
  liveData,
  liveLoading,
  liveFetchErr,
  transportMode,
  onTransportModeChange,
  onPlanUpdated,
}: {
  tripId: string;
  plan: TripPlan;
  liveData: TripLiveRecommendationsPayload | null;
  liveLoading: boolean;
  liveFetchErr: string | null;
  transportMode: "fly" | "drive";
  onTransportModeChange: (m: "fly" | "drive") => void;
  onPlanUpdated?: (plan: TripPlan) => void;
}) {
  const { mutate, busyKey, err, setErr } = useLiveCurationMutation(tripId, onPlanUpdated);
  const showRestaurants = Boolean(plan.location?.trim());
  const showExperiences = Boolean(plan.location?.trim());
  const showTransport =
    Boolean(plan.departureCity?.trim()) && Boolean(plan.location?.trim());

  const flights = liveData?.flights ?? [];
  const restaurants = liveData?.restaurants ?? [];
  const experiences = liveData?.experiences ?? [];

  return (
    <div className="space-y-8 pt-4">
      {liveFetchErr ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          {liveFetchErr}
        </p>
      ) : null}

      {err ? <LiveCurationErrorBanner message={err} onDismiss={() => setErr(null)} /> : null}

      {showTransport ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-neutral-100">Transport</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-neutral-500">
            From <strong>{plan.departureCity}</strong> to <strong>{plan.location}</strong>
          </p>
          <div className="mt-3 inline-flex rounded-full border border-slate-200 p-0.5 dark:border-white/10">
            <button
              type="button"
              onClick={() => onTransportModeChange("fly")}
              className={`rounded-full px-4 py-1.5 text-sm transition ${
                transportMode === "fly" ? primaryFilledInteractive : "font-semibold text-slate-600 dark:text-neutral-400"
              }`}
            >
              Fly
            </button>
            <button
              type="button"
              onClick={() => onTransportModeChange("drive")}
              className={`rounded-full px-4 py-1.5 text-sm transition ${
                transportMode === "drive" ? primaryFilledInteractive : "font-semibold text-slate-600 dark:text-neutral-400"
              }`}
            >
              Drive
            </button>
          </div>

          {transportMode === "fly" ? (
            <div className="mt-4">
              <CuratedFlightsRows
                plan={plan}
                flights={flights}
                liveLoading={liveLoading}
                flightsError={liveData?.flightsError ?? null}
                mutate={(a, k) => void mutate(a, k)}
                busyKey={busyKey}
              />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {liveLoading ? (
                <p className="text-sm text-slate-600 dark:text-neutral-400">Loading drive info…</p>
              ) : liveData?.driveError ? (
                <p className="text-sm text-amber-800 dark:text-amber-200/90">{liveData.driveError}</p>
              ) : null}
              {liveData?.drive?.durationEstimate ? (
                <p className="text-sm text-slate-700 dark:text-neutral-300">
                  Estimated drive time: <strong>{liveData.drive.durationEstimate}</strong>
                  {liveData.drive.distanceMiles != null ? (
                    <>
                      {" "}
                      · ~{liveData.drive.distanceMiles} mi
                    </>
                  ) : null}
                </p>
              ) : (
                <p className="text-sm text-slate-600 dark:text-neutral-400">
                  Open Google Maps for live traffic and exact timing.
                </p>
              )}
              {(() => {
                const dc = plan.departureCity?.trim();
                const loc = plan.location?.trim();
                const href =
                  liveData?.drive?.mapsDirectionsUrl ??
                  (dc && loc ? googleMapsDirUrl(dc, loc) : undefined);
                return href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
                  >
                    Get directions
                  </a>
                ) : null;
              })()}
            </div>
          )}
        </section>
      ) : null}

      {showRestaurants ? (
        <CuratedRestaurantsSection
          plan={plan}
          restaurants={restaurants}
          liveLoading={liveLoading}
          restaurantsError={liveData?.restaurantsError ?? null}
          mutate={(a, k) => void mutate(a, k)}
          busyKey={busyKey}
        />
      ) : null}

      {showExperiences ? (
        <CuratedExperiencesSection
          plan={plan}
          experiences={experiences}
          liveLoading={liveLoading}
          experiencesError={liveData?.experiencesError ?? null}
          mutate={(a, k) => void mutate(a, k)}
          busyKey={busyKey}
        />
      ) : null}
    </div>
  );
}

function resolvedCelebrationHeadline(meta: ClassifiedDecision, blob: CollabDecisionBlob | undefined): string {
  const L = blob?.locked;
  if (meta.kind === "dates" && typeof L === "string") {
    return `Group picked ${L}`;
  }
  if (meta.kind === "hotel") {
    const name =
      typeof L === "object" && L !== null && "name" in L ? (L as { name?: string }).name : null;
    return name?.trim()
      ? `Group picked ${name}`
      : "Stay locked in";
  }
  if (meta.kind === "pick") {
    if (meta.key === VENUE_POLL_DECISION_KEY) {
      const name =
        typeof L === "object" && L !== null && "name" in L
          ? (L as { name?: string }).name
          : typeof L === "string"
            ? L
            : null;
      return name?.trim()
        ? `Group picked dinner · ${name}`
        : "Dinner vote locked";
    }
    if (typeof L === "object" && L !== null && "name" in L) {
      const n = (L as { name: string }).name?.trim();
      if (n) return `Group picked · ${n}`;
    }
    const label =
      typeof L === "string"
        ? meta.key === BUDGET_POLL_DECISION_KEY
          ? formatBudgetPollChipLabel(L)
          : L
        : "";
    return label.trim() ? `Group picked · ${label}` : "Vote locked";
  }
  return meta.label ? `Done · ${meta.label}` : "Decision locked";
}

function formatResolvedDetail(meta: ClassifiedDecision, blob: CollabDecisionBlob | undefined): string {
  if (!blob?.locked) return "";
  const L = blob.locked;
  if (meta.kind === "dates" && typeof L === "string") {
    return `The group converged on ${L}. Hotels and dinner polls can anchor to those nights.`;
  }
  if ((meta.kind === "binary" || meta.kind === "generic") && typeof L === "string") {
    return `The group leaned toward ${L}.`;
  }
  if (meta.kind === "hotel" && L && typeof L === "object" && "name" in L) {
    const o = L as { name: string };
    return `${o.name} wins the poll for where to stay. Tap booking when you finalize the trip.`;
  }
  if (meta.kind === "people" && L && typeof L === "object" && "headcount" in L) {
    const o = L as { headcount: number; names: string[]; maybeNames?: string[] };
    const base = `Headcount landed around ${o.headcount}${o.names.length ? ` (${o.names.join(", ")} confirmed in)` : ""}`;
    if (o.maybeNames?.length) return `${base}. Still tentative: ${o.maybeNames.join(", ")}`;
    return `${base}.`;
  }
  if (meta.kind === "pick") {
    if (typeof L === "string") {
      return meta.key === BUDGET_POLL_DECISION_KEY
        ? `${formatBudgetPollChipLabel(L)} carried the poll.`
        : `"${L}" carried the poll.`;
    }
    if (typeof L === "object" && L !== null && "name" in L)
      return `${(L as { name: string }).name} is locked for this choice.`;
  }
  return "";
}

function HostDatesConfirmFooter({
  quorum,
  voterN,
  voteBusy,
  confirmBusy,
  errorMessage,
  onHostConfirmDates,
  embedded = false,
}: {
  quorum: number;
  voterN: number;
  voteBusy: boolean;
  confirmBusy: boolean;
  errorMessage: string | null;
  onHostConfirmDates: () => Promise<boolean>;
  /** When nested in “Locked in” card, omit top rule so parent chrome reads as one panel. */
  embedded?: boolean;
}) {
  const [anywayOpen, setAnywayOpen] = useState(false);
  const enoughVotes = voterN >= quorum;
  const busy = confirmBusy || voteBusy;

  return (
    <>
      {anywayOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={() => {
            if (!busy) setAnywayOpen(false);
          }}
        >
          <div
            className="max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-dm-card"
            role="dialog"
            aria-labelledby="confirm-date-anyway-title"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <p
              id="confirm-date-anyway-title"
              className="text-sm leading-relaxed text-slate-900 dark:text-neutral-100"
            >
              Not everyone has voted yet. Are you sure you want to lock in the date?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAnywayOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-white/10 dark:text-neutral-200 dark:hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                className={`rounded-lg px-4 py-2 text-sm disabled:opacity-50 ${primaryFilledInteractive}`}
                onClick={() => {
                  void onHostConfirmDates().then((ok) => {
                    if (ok) setAnywayOpen(false);
                  });
                }}
              >
                {confirmBusy ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div
        className={`flex flex-col items-stretch gap-2 ${
          embedded
            ? "mt-3 pt-0"
            : "mt-4 border-t border-slate-100 pt-4 dark:border-white/10"
        }`}
      >
        <button
          type="button"
          disabled={!enoughVotes || busy}
          onClick={() => void onHostConfirmDates()}
          className={`rounded-xl px-4 py-2.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
            enoughVotes && !busy ? primaryFilledInteractive : "font-semibold bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-neutral-500"
          }`}
        >
          {confirmBusy ? "Saving…" : "Confirm Date"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setAnywayOpen(true)}
          className="text-center text-xs font-medium text-slate-500 underline decoration-slate-400/70 underline-offset-2 transition hover:text-slate-700 disabled:opacity-50 dark:text-neutral-500 dark:decoration-neutral-600 dark:hover:text-neutral-300"
        >
          confirm anyway
        </button>
        {errorMessage ? (
          <p className="text-sm text-rose-600 dark:text-rose-300">{errorMessage}</p>
        ) : null}
      </div>
    </>
  );
}

function tallyAgainstVotesForOptions(votes: Record<string, unknown>, optionLabels: string[]): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const o of optionLabels) tally[o] = 0;
  for (const raw of Object.values(votes)) {
    if (typeof raw === "object" && raw !== null) {
      for (const x of coerceVoteAgainstList(raw)) {
        if (optionLabels.includes(x)) tally[x] += 1;
      }
    }
  }
  return tally;
}

/** Frosted lock overlay when hotels / dinner polls are blocked until group dates are chosen. */
function DatesLockedGate({ active, children }: { active: boolean; children: ReactNode }) {
  if (!active) return <>{children}</>;
  return (
    <div className="relative isolate overflow-hidden rounded-2xl">
      <div className="pointer-events-none">{children}</div>
      <div
        className="pointer-events-auto absolute inset-0 z-10 flex items-center justify-center bg-black/60 px-5 text-center text-sm font-medium leading-snug text-white [backdrop-filter:blur(4px)]"
        role="status"
        aria-live="polite"
      >
        Locked — waiting on dates
      </div>
    </div>
  );
}

function ActivityVibePollCard({
  tripId,
  meta,
  chips,
  viewerPrimaryPick,
  busy,
  voterN,
  quorum,
  onVote,
}: {
  tripId: string;
  meta: ClassifiedDecision;
  chips: readonly string[];
  viewerPrimaryPick: string | null | undefined;
  busy: boolean;
  voterN: number;
  quorum: number;
  onVote: (p: Record<string, unknown>) => void;
}) {
  const [draft, setDraft] = useState("");
  const [polishBusy, setPolishBusy] = useState(false);
  const [polishErr, setPolishErr] = useState<string | null>(null);

  const mineTrim = viewerPrimaryPick?.trim() ?? "";

  const submitPolished = useCallback(async () => {
    const raw = draft.trim();
    if (raw.length < 1 || raw.length > POLL_WRITE_IN_MAX_LEN) {
      setPolishErr("Use 1–80 characters.");
      return;
    }
    setPolishBusy(true);
    setPolishErr(null);
    try {
      const res = await fetch(`/api/trip-plans/${tripId}/collab/polish-vote-text`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionKey: meta.key, text: raw }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; polished?: string };
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "Could not polish answer");
      const polished = (j.polished ?? "").trim();
      if (!polished || !isAllowedPollWriteIn(polished, chips)) {
        setPolishErr("That didn’t come back as a valid short answer—try rephrasing.");
        return;
      }
      onVote({ decisionKey: meta.key, kind: "pick", option: polished });
      setDraft("");
    } catch (e) {
      setPolishErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPolishBusy(false);
    }
  }, [chips, draft, meta.key, onVote, tripId]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
      <h3 className="font-display text-base font-semibold text-slate-900 dark:text-neutral-100">{meta.label}</h3>
      <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">
        {chips.length > 0
          ? `Vote for a suggestion or add your own (${voterN} vote(s); ${quorum}+ to lock).`
          : `The host left this open—type your answer (${voterN} vote(s); ${quorum}+ to lock).`}
      </p>

      {!mineTrim ? (
        <p className="mt-3 rounded-xl border border-amber-200/90 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/45 dark:bg-amber-950/35 dark:text-amber-100">
          Please submit your vote: pick a suggestion or use the text box (your wording is cleaned up automatically when you
          submit).
        </p>
      ) : null}

      {chips.length > 0 ? (
        <ul className="mt-4 space-y-2.5">
          {chips.map((opt) => {
            const forSelected = viewerPrimaryPick === opt;
            return (
              <li
                key={opt}
                className={`flex flex-col gap-2 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                  forSelected
                    ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200 dark:border-indigo-400 dark:bg-indigo-950/40 dark:ring-indigo-500/30"
                    : "border-slate-200 bg-white dark:border-white/10 dark:bg-dm-card"
                }`}
              >
                <p className="text-sm font-medium text-slate-900 dark:text-neutral-100">{opt}</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onVote({ decisionKey: meta.key, kind: "pick", option: opt })}
                  className={`rounded-lg px-3 py-2 text-sm transition disabled:opacity-50 ${
                    forSelected ? primaryFilledInteractive : "border border-slate-200 bg-white font-semibold hover:bg-slate-50 dark:border-white/10 dark:bg-dm-page dark:text-neutral-200 dark:hover:bg-dm-elevated"
                  }`}
                >
                  Vote
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3 dark:border-white/15 dark:bg-dm-elevated/60">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-500">
          {chips.length > 0 ? "Or type your own answer" : "Your answer"}
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-neutral-500">
          We fix typos and phrasing before saving (e.g. &ldquo;beacj vibes lol&rdquo; → &ldquo;Beach vibes&rdquo;).
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="text"
            autoComplete="off"
            maxLength={POLL_WRITE_IN_MAX_LEN}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. beach days, food-first, chill nights…"
            disabled={busy || polishBusy}
            className="min-w-[12rem] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 dark:border-white/10 dark:bg-dm-page dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
          <button
            type="button"
            disabled={busy || polishBusy || draft.trim().length < 1}
            onClick={() => void submitPolished()}
            className={`rounded-lg px-4 py-2 text-sm disabled:opacity-40 ${primaryFilledInteractive}`}
          >
            {polishBusy ? "Polishing…" : "Submit answer"}
          </button>
        </div>
        {polishErr ? <p className="mt-2 text-sm text-rose-600 dark:text-rose-300">{polishErr}</p> : null}
      </div>

      {mineTrim ? (
        <p className="mt-3 text-xs text-slate-600 dark:text-neutral-400">
          Your vote: <span className="font-semibold text-slate-900 dark:text-neutral-100">{viewerPrimaryPick}</span>
        </p>
      ) : null}
    </section>
  );
}

function displayNamesForVoteKeys(keys: string[], roster: TripRosterPerson[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    const person = roster.find((p) => voteKeysIntersectAliases([k], new Set(p.voteAliases)));
    const name = person?.displayName;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return out;
}

function DecisionCard({
  tripId,
  meta,
  blob,
  plan,
  quorum,
  visitorKey,
  canonicalVoterKey,
  roster = [],
  busy,
  onVote,
  reloadCollab,
  blockedByDates = false,
  canRunHotelSearch,
  liveVenueMerge,
  isHost = false,
  datesHostConfirmBusy = false,
  datesHostConfirmErr = null,
  onHostConfirmDates,
}: {
  tripId: string;
  meta: ClassifiedDecision;
  blob: CollabDecisionBlob | undefined;
  plan: TripPlan;
  quorum: number;
  visitorKey: string;
  canonicalVoterKey: string;
  roster?: TripRosterPerson[];
  busy: boolean;
  onVote: (p: Record<string, unknown>) => void;
  reloadCollab: () => Promise<void>;
  blockedByDates?: boolean;
  canRunHotelSearch: boolean;
  /** Live API rows aligned by index with venue poll cards (same `eat-*` ids). */
  liveVenueMerge?: RestaurantPick[] | null;
  isHost?: boolean;
  datesHostConfirmBusy?: boolean;
  datesHostConfirmErr?: string | null;
  /** Host-only trip plan date confirmation (below dates calendar). */
  onHostConfirmDates?: () => Promise<boolean>;
}) {
  const [hotelSearchBusy, setHotelSearchBusy] = useState(false);
  const [hotelSearchErr, setHotelSearchErr] = useState<string | null>(null);
  const [budgetCustom, setBudgetCustom] = useState("");
  const [againstPrep, setAgainstPrep] = useState<string[]>([]);
  const [pollWriteIn, setPollWriteIn] = useState("");

  const hotels = (blob?.hotels ?? meta.hotels) as HotelPick[] | undefined;
  const spots = (blob?.restaurants ?? meta.restaurants) as RestaurantPick[] | undefined;
  const votes = (blob?.votes ?? {}) as Record<string, unknown>;
  const voterN = Object.keys(votes).length;

  const rawVoteBlob = readRawVotePayload(votes, visitorKey, canonicalVoterKey);
  const serverAgainstChoices = coerceVoteAgainstList(rawVoteBlob);
  const viewerPrimaryPick = readScalarVote(votes, visitorKey, canonicalVoterKey);

  const wfmMap = blob?.dateWorksForMe ?? {};
  const viewerSaidWorksForConfirmed =
    Boolean(wfmMap[canonicalVoterKey]) || Boolean(wfmMap[visitorVoteKey(visitorKey)]);

  useEffect(() => {
    setAgainstPrep([]);
    setPollWriteIn("");
  }, [meta.key]);

  useEffect(() => {
    setAgainstPrep([]);
  }, [viewerPrimaryPick]);

  async function runHotelSearch() {
    if (blockedByDates) return;
    setHotelSearchErr(null);
    setHotelSearchBusy(true);
    try {
      const r = await fetch(
        `/api/trip-plans/${tripId}/hotels/search?decisionKey=${encodeURIComponent(meta.key)}`,
        { credentials: "include" }
      );
      const j = (await r.json().catch(() => ({}))) as { error?: string; detail?: string };
      if (!r.ok) {
        setHotelSearchErr(
          [j.error, j.detail].filter(Boolean).join(" ") || "Hotel search failed."
        );
        return;
      }
      await reloadCollab();
    } catch {
      setHotelSearchErr("Could not reach the server.");
    } finally {
      setHotelSearchBusy(false);
    }
  }

  if (meta.kind === "dates") {
    const opts = plan.dates.options;
    if (opts.length === 0 && isHost) {
      return (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          Add date options to the trip (edit the trip card or use the trip parser). Members see a dates poll on this page
          where they can submit their availability even before the plan lists host dates.
        </div>
      );
    }

    if (plan.dates.confirmed && opts.length > 0) {
      const yHeadline = inferDefaultYearFromDateOptions(opts, new Date().getFullYear());
      const primaryHeading =
        opts.length === 1
          ? formatBallotProposalHeading(opts[0]!, yHeadline)
          : opts.map((o) => formatBallotProposalHeading(o, yHeadline)).join(" · ");

      const altKeys: string[] = [];
      for (const [vk, val] of Object.entries(votes)) {
        if (typeof val !== "string" || !val.trim()) continue;
        if (dateVoteMatchesHostBallot(val, opts, new Date().getFullYear())) continue;
        altKeys.push(vk);
      }

      const worksNames = displayNamesForVoteKeys(Object.keys(wfmMap), roster);
      const altNames = displayNamesForVoteKeys(altKeys, roster);

      const singleLineConcrete =
        opts.length === 1 && isParsableConcreteDateBallotLine(opts[0]!, yHeadline);
      const singleVagueBallotOnly = opts.length === 1 && !singleLineConcrete;
      const showSingleProposal = opts.length > 0 && singleLineConcrete;

      return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-neutral-100">{meta.label}</h3>
          <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-300/90">
            The host has confirmed these trip dates for the group. Everyone should still use the calendar to share when
            they&apos;re available — including ranges outside the host window if needed.
          </p>

          <div className="mt-4 rounded-2xl border-2 border-emerald-500/35 bg-gradient-to-br from-emerald-50 to-white px-4 py-5 dark:border-emerald-600/30 dark:from-emerald-950/45 dark:to-dm-card sm:px-6 sm:py-6">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800/90 dark:text-emerald-400/90">
              Confirmed dates
            </p>
            <p className="mt-1 font-display text-2xl font-bold tracking-tight text-emerald-950 dark:text-emerald-50">
              {primaryHeading}
            </p>
          </div>

          {!isHost ? (
            <div className="mt-5 space-y-4">
              {showSingleProposal ? (
                <DatesSingleProposalMemberVote
                  decisionKey={meta.key}
                  options={opts}
                  votes={votes}
                  mine={viewerPrimaryPick}
                  busy={busy}
                  quorum={quorum}
                  voterN={voterN}
                  onVote={onVote}
                  worksForMeMode="confirmedAck"
                  viewerAcknowledgedConfirmed={viewerSaidWorksForConfirmed}
                  blockedByDates={blockedByDates}
                />
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busy || viewerSaidWorksForConfirmed || blockedByDates}
                    onClick={() => onVote({ decisionKey: meta.key, kind: "datesWorksForMe" })}
                    className={`w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50 sm:w-auto ${primaryFilledInteractive}`}
                  >
                    {viewerSaidWorksForConfirmed ? "Thanks — noted" : "Works for me"}
                  </button>
                  <p className="text-sm text-slate-600 dark:text-neutral-400">
                    Tap <span className="font-semibold text-slate-800 dark:text-neutral-200">Works for me</span> if these
                    dates work, or pick any range on the calendar — not limited to the host&apos;s options.
                  </p>
                  <DatesVoteCalendar
                    decisionKey={meta.key}
                    options={opts}
                    votes={votes}
                    mine={viewerPrimaryPick}
                    busy={busy}
                    quorum={quorum}
                    voterN={voterN}
                    onVote={onVote}
                    hideUnmappedBallotChips={singleVagueBallotOnly || opts.length === 0}
                  />
                </>
              )}
            </div>
          ) : (
            <p className="mt-5 text-sm text-slate-600 dark:text-neutral-400">
              Travelers tap <span className="font-semibold">Works for me</span> and use the calendar to record availability.
            </p>
          )}

          {isHost ? (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm dark:border-white/10 dark:bg-dm-elevated/60">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-500">
                Member responses
              </p>
              <p className="mt-2 text-slate-800 dark:text-neutral-200">
                <span className="font-semibold text-slate-900 dark:text-neutral-100">Works for me: </span>
                {worksNames.length > 0 ? worksNames.join(", ") : "—"}
              </p>
              <p className="mt-2 text-slate-800 dark:text-neutral-200">
                <span className="font-semibold text-slate-900 dark:text-neutral-100">Suggested other dates: </span>
                {altNames.length > 0 ? altNames.join(", ") : "—"}
              </p>
            </div>
          ) : null}
        </section>
      );
    }

    const datesVoteYear = inferDefaultYearFromDateOptions(opts, new Date().getFullYear());
    const singleLineConcrete =
      opts.length === 1 && isParsableConcreteDateBallotLine(opts[0]!, datesVoteYear);
    /** Single non-concrete host line (“Late July”, “TBD”) — hide chip voting; range inputs are the ballot. */
    const singleVagueBallotOnly = opts.length === 1 && !singleLineConcrete;
    const showSingleProposal = opts.length > 0 && singleLineConcrete;
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-neutral-100">{meta.label}</h3>
        <p className="mt-2 text-xs text-slate-500 dark:text-neutral-500">
          {opts.length === 0 ? (
            <>
              The trip doesn&apos;t list host dates yet — add your availability below. Group needs {voterN}/{quorum}+
              votes to lock this decision.
            </>
          ) : (
            <>
              Date availability is required for this trip — confirm the host&apos;s dates or choose a range below. You
              can&apos;t skip this step.
            </>
          )}
        </p>
        <div className="mt-4">
          {showSingleProposal ? (
            <DatesSingleProposalMemberVote
              decisionKey={meta.key}
              options={opts}
              votes={votes}
              mine={viewerPrimaryPick}
              busy={busy}
              quorum={quorum}
              voterN={voterN}
              onVote={onVote}
            />
          ) : (
            <DatesVoteCalendar
              decisionKey={meta.key}
              options={opts}
              votes={votes}
              mine={viewerPrimaryPick}
              busy={busy}
              quorum={quorum}
              voterN={voterN}
              onVote={onVote}
              hideUnmappedBallotChips={singleVagueBallotOnly || opts.length === 0}
            />
          )}
        </div>
        {isHost &&
        !plan.dates.confirmed &&
        opts.length > 0 &&
        onHostConfirmDates ? (
          <HostDatesConfirmFooter
            quorum={quorum}
            voterN={voterN}
            voteBusy={busy}
            confirmBusy={datesHostConfirmBusy}
            errorMessage={datesHostConfirmErr}
            onHostConfirmDates={onHostConfirmDates}
          />
        ) : null}
      </section>
    );
  }

  if (meta.kind === "pick") {
    const opts = meta.pickOptions ?? [];
    const alwaysShowsSynthPick =
      meta.key === TRANSPORT_POLL_DECISION_KEY ||
      meta.key === ACTIVITY_POLL_DECISION_KEY ||
      meta.key === VIBE_POLL_DECISION_KEY;

    if (!alwaysShowsSynthPick && opts.length < 2) {
      return (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          This poll needs at least two curated options. Re-run the trip parser with clearer choices.
        </div>
      );
    }
    /** Food poll mirrors hotel rows: OT link, rating tier, neighborhood, vote-by-spot id. */
    if (spots?.length && meta.key === VENUE_POLL_DECISION_KEY) {
      const venueList = mergeLiveRestaurantsOntoHints(spots, liveVenueMerge ?? undefined);
      return (
        <DatesLockedGate active={blockedByDates}>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-neutral-100">{meta.label}</h3>
            {blockedByDates ? null : (
              <p className="mt-1 text-xs text-slate-500 dark:text-neutral-500">
                Live listings when available — book ahead to secure a table.
              </p>
            )}
            <ul className="mt-4 space-y-3">
              {venueList.map((r) => {
                const picked = viewerPrimaryPick === r.id || viewerPrimaryPick === r.name;
                return (
                  <li
                    key={r.id}
                    className={`overflow-hidden rounded-xl border ${
                      picked
                        ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200 dark:border-indigo-400 dark:bg-indigo-950/40 dark:ring-indigo-500/30"
                        : "border-slate-200 bg-transparent dark:border-white/10 dark:bg-dm-elevated/50"
                    }`}
                  >
                    <LivePlaceCoverImage src={r.coverPhotoUrl} />
                    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-neutral-100">{r.name}</p>
                        {r.cuisineType ? (
                          <p className="text-sm text-slate-600 dark:text-neutral-400">{r.cuisineType}</p>
                        ) : null}
                        <p className="text-sm text-slate-600 dark:text-neutral-400">{r.neighborhood}</p>
                        <p className="mt-1 text-sm font-medium text-amber-900/90 dark:text-amber-300">{r.ratingDisplay}</p>
                        <p className="mt-1 text-base font-semibold text-slate-900 dark:text-neutral-50">{r.priceRange}</p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                        <a
                          href={r.openTableUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex justify-center rounded-lg border border-rose-200 bg-white px-3 py-2 text-center text-sm font-semibold text-rose-900 hover:bg-rose-50 dark:border-white/10 dark:bg-dm-elevated dark:text-rose-300 dark:hover:bg-dm-page"
                        >
                          {r.reserveCtaLabel ?? "Open in Maps"}
                        </a>
                        <button
                          type="button"
                          disabled={busy || blockedByDates}
                          onClick={() => onVote({ decisionKey: meta.key, kind: "pick", option: r.id })}
                          className={`rounded-lg px-4 py-2 text-sm disabled:opacity-40 ${
                            picked
                              ? primaryFilledInteractive
                              : "border border-slate-200 bg-white font-semibold text-slate-800 hover:bg-slate-50 dark:border-white/10 dark:bg-dm-page dark:text-neutral-200 dark:hover:bg-dm-elevated"
                          }`}
                        >
                          Vote for this dinner
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 text-xs text-slate-500 dark:text-neutral-500">{voterN} vote(s) · needs quorum</div>
          </section>
        </DatesLockedGate>
      );
    }

    if (meta.key === ACTIVITY_POLL_DECISION_KEY || meta.key === VIBE_POLL_DECISION_KEY) {
      return (
        <ActivityVibePollCard
          tripId={tripId}
          meta={meta}
          chips={opts}
          viewerPrimaryPick={viewerPrimaryPick}
          busy={busy}
          voterN={voterN}
          quorum={quorum}
          onVote={onVote}
        />
      );
    }

    const isBudgetPoll = meta.key === BUDGET_POLL_DECISION_KEY;
    const transportSimplePick = !isBudgetPoll && isTransportStyleGroupPoll(meta);
    const customMine =
      typeof viewerPrimaryPick === "string" &&
      !opts.includes(viewerPrimaryPick) &&
      isValidBudgetCustomVoteToken(viewerPrimaryPick);
    const thumbsDownTally = transportSimplePick ? {} : tallyAgainstVotesForOptions(votes, opts);
    const structuredWriteInMine =
      !isBudgetPoll &&
      viewerPrimaryPick != null &&
      !opts.includes(viewerPrimaryPick) &&
      isAllowedPollWriteIn(viewerPrimaryPick, opts);

    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-neutral-100">{meta.label}</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">
          {isBudgetPoll
            ? `Pick one (max 3 options). · ${voterN} vote(s)`
            : transportSimplePick
              ? `Pick the option that works for you · ${voterN} vote(s)`
              : `Group vote · ${voterN} vote(s) — pick a favorite, flag what you dislike, or suggest your own`}
        </p>
        {!isBudgetPoll ? (
          <ul className="mt-4 space-y-2.5">
            {opts.map((opt) => {
              const thumbsDownGroup = thumbsDownTally[opt] ?? 0;
              const forSelected = viewerPrimaryPick === opt;
              const myDown =
                viewerPrimaryPick != null ? serverAgainstChoices.includes(opt) : againstPrep.includes(opt);
              const disableNotForSelf = viewerPrimaryPick != null && forSelected;

              function submitPickWithAgainst(nextAgainst: string[], primary: string) {
                void onVote({
                  decisionKey: meta.key,
                  kind: "pick",
                  option: primary,
                  againstOptions: nextAgainst.filter((x) => x !== primary),
                });
              }

              return (
                <li
                  key={opt}
                  className={`flex flex-col gap-2 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                    forSelected
                      ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200 dark:border-indigo-400 dark:bg-indigo-950/40 dark:ring-indigo-500/30"
                      : "border-slate-200 bg-white dark:border-white/10 dark:bg-dm-card"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-neutral-100">{opt}</p>
                    {!transportSimplePick && thumbsDownGroup > 0 ? (
                      <p className="text-xs text-rose-700 dark:text-rose-300">
                        {thumbsDownGroup} traveler
                        {thumbsDownGroup === 1 ? " " : "s "}
                        marked &ldquo;not for me&rdquo;
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (transportSimplePick) {
                          void onVote({ decisionKey: meta.key, kind: "pick", option: opt });
                          return;
                        }
                        const base =
                          viewerPrimaryPick != null ? serverAgainstChoices : [...againstPrep];
                        submitPickWithAgainst(base.filter((x) => x !== opt), opt);
                      }}
                      className={`rounded-lg px-3 py-2 text-sm transition disabled:opacity-50 ${
                        forSelected
                          ? primaryFilledInteractive
                          : "border border-slate-200 bg-white font-semibold hover:bg-slate-50 dark:border-white/10 dark:bg-dm-page dark:text-neutral-200 dark:hover:bg-dm-elevated"
                      }`}
                    >
                      {transportSimplePick ? "Vote" : "Vote for"}
                    </button>
                    {transportSimplePick ? null : (
                      <button
                        type="button"
                        disabled={busy || disableNotForSelf}
                        aria-pressed={myDown ? "true" : "false"}
                        onClick={() => {
                          if (viewerPrimaryPick != null) {
                            const toggle = serverAgainstChoices.includes(opt)
                              ? serverAgainstChoices.filter((x) => x !== opt)
                              : [...serverAgainstChoices.filter((x) => x !== viewerPrimaryPick), opt];
                            submitPickWithAgainst(toggle, viewerPrimaryPick);
                            return;
                          }
                          setAgainstPrep((prev) =>
                            prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]
                          );
                        }}
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:opacity-40 ${
                          myDown
                            ? "border-rose-600 bg-rose-50 text-rose-950 dark:border-rose-400 dark:bg-rose-950/40 dark:text-rose-100"
                            : "border-slate-200 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-dm-page dark:text-neutral-200 dark:hover:bg-dm-elevated"
                        }`}
                      >
                        Not for me
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {opts.map((opt) => (
              <button
                key={opt}
                type="button"
                disabled={busy}
                onClick={() => onVote({ decisionKey: meta.key, kind: "pick", option: opt })}
                className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition disabled:opacity-50 ${
                  viewerPrimaryPick === opt
                    ? "border-indigo-500 bg-indigo-50 text-indigo-950 ring-2 ring-indigo-200 dark:border-indigo-400 dark:bg-indigo-950/50 dark:text-indigo-100 dark:ring-indigo-500/30"
                    : "border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-300 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-200 dark:hover:border-white/15"
                }`}
              >
                {formatBudgetPollChipLabel(opt)}
              </button>
            ))}
          </div>
        )}
        {!isBudgetPoll && !transportSimplePick ? (
          <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3 dark:border-white/15 dark:bg-dm-elevated/60">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-500">
              Your idea (optional)
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="text"
                autoComplete="off"
                maxLength={80}
                value={pollWriteIn}
                onChange={(e) => setPollWriteIn(e.target.value)}
                placeholder="Different priority, activity, vibe…"
                disabled={busy}
                className="min-w-[12rem] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 dark:border-white/10 dark:bg-dm-page dark:text-neutral-100 dark:placeholder:text-neutral-500"
              />
              <button
                type="button"
                disabled={busy || !isAllowedPollWriteIn(pollWriteIn, opts)}
                onClick={() => {
                  const t = pollWriteIn.trim();
                  if (!isAllowedPollWriteIn(t, opts)) return;
                  void onVote(
                    transportSimplePick
                      ? { decisionKey: meta.key, kind: "pick", option: t }
                      : {
                          decisionKey: meta.key,
                          kind: "pick",
                          option: t,
                          againstOptions: (
                            viewerPrimaryPick != null ? serverAgainstChoices : [...againstPrep]
                          ).filter((x) => x !== t),
                        }
                  );
                  setPollWriteIn("");
                }}
                className={`rounded-lg px-4 py-2 text-sm disabled:opacity-40 ${primaryFilledInteractive}`}
              >
                Submit vote
              </button>
            </div>
            {structuredWriteInMine ? (
              <p className="mt-2 text-xs text-indigo-900 dark:text-indigo-100">
                Your vote:{" "}
                <span className="font-semibold">{viewerPrimaryPick}</span>. Change it anytime.
              </p>
            ) : null}
          </div>
        ) : null}
        {isBudgetPoll ? (
          <div
            className={`mt-4 rounded-xl border p-3 dark:border-white/10 ${
              customMine
                ? "border-indigo-500 bg-indigo-50/80 ring-2 ring-indigo-200 dark:border-indigo-400 dark:bg-indigo-950/30 dark:ring-indigo-500/30"
                : "border-slate-200 bg-slate-50/80 dark:bg-dm-elevated/50"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-500">
              Custom amount
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="e.g. 75"
                value={budgetCustom}
                onChange={(e) => setBudgetCustom(e.target.value)}
                disabled={busy}
                className="w-28 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 dark:border-white/10 dark:bg-dm-page dark:text-neutral-100 dark:placeholder:text-neutral-500"
              />
              <button
                type="button"
                disabled={busy || !parseBudgetCustomAmountInput(budgetCustom)}
                onClick={() => {
                  const p = parseBudgetCustomAmountInput(budgetCustom);
                  if (!p) return;
                  onVote({ decisionKey: meta.key, kind: "pick", option: p });
                  setBudgetCustom("");
                }}
                className={`rounded-lg px-3 py-1.5 text-sm disabled:opacity-40 ${primaryFilledInteractive}`}
              >
                Vote
              </button>
            </div>
            {customMine ? (
              <p className="mt-2 text-xs text-indigo-800 dark:text-indigo-200">
                Your vote: {formatBudgetPollChipLabel(viewerPrimaryPick)}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  }

  if (meta.kind === "binary" || meta.kind === "generic") {
    const opts = meta.options ?? ["Yes", "No"];
    const kind = meta.kind === "generic" ? "generic" : "binary";
    const transportSimpleBinary = isTransportStyleGroupPoll(meta);
    const kindThumbsDown = transportSimpleBinary ? {} : tallyAgainstVotesForOptions(votes, opts);
    const genericWriteInSelected =
      viewerPrimaryPick != null && !opts.includes(viewerPrimaryPick) && isAllowedPollWriteIn(viewerPrimaryPick, opts);

    function submitBinaryWithAgainst(primary: string, nextAgainst: string[]) {
      void onVote({
        decisionKey: meta.key,
        kind,
        option: primary,
        againstOptions: nextAgainst.filter((x) => x !== primary),
      });
    }

    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-neutral-100">{meta.label}</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">
          {transportSimpleBinary
            ? `Pick the option that works for you · ${voterN} vote(s)`
            : `Group vote · ${voterN} vote(s) — pick what fits, flag lines you dislike, or add another idea.`}
        </p>
        <ul className="mt-4 space-y-2.5">
          {opts.map((opt) => {
            const groupNo = kindThumbsDown[opt] ?? 0;
            const forSel = viewerPrimaryPick === opt;
            const myNo =
              viewerPrimaryPick != null ? serverAgainstChoices.includes(opt) : againstPrep.includes(opt);

            return (
              <li
                key={opt}
                className={`flex flex-col gap-2 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                  forSel
                    ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200 dark:border-indigo-400 dark:bg-indigo-950/40 dark:ring-indigo-500/30"
                    : "border-slate-200 bg-white dark:border-white/10 dark:bg-dm-card"
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-neutral-100">{opt}</p>
                  {!transportSimpleBinary && groupNo > 0 ? (
                    <p className="text-xs text-rose-700 dark:text-rose-300">
                      {groupNo} traveler{groupNo === 1 ? " " : "s "}
                      marked &ldquo;not for me&rdquo;
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (transportSimpleBinary) {
                        void onVote({ decisionKey: meta.key, kind, option: opt });
                        return;
                      }
                      const base =
                        viewerPrimaryPick != null ? serverAgainstChoices : [...againstPrep];
                      submitBinaryWithAgainst(opt, base.filter((x) => x !== opt));
                    }}
                    className={`rounded-lg px-3 py-2 text-sm transition disabled:opacity-50 ${
                      forSel
                        ? primaryFilledInteractive
                        : "border border-slate-200 bg-white font-semibold hover:bg-slate-50 dark:border-white/10 dark:bg-dm-page dark:text-neutral-200 dark:hover:bg-dm-elevated"
                    }`}
                  >
                    {transportSimpleBinary ? "Vote" : "Vote for"}
                  </button>
                  {transportSimpleBinary ? null : (
                    <button
                      type="button"
                      disabled={busy || (viewerPrimaryPick != null && forSel)}
                      onClick={() => {
                        if (viewerPrimaryPick != null) {
                          const toggle = serverAgainstChoices.includes(opt)
                            ? serverAgainstChoices.filter((x) => x !== opt)
                            : [...serverAgainstChoices.filter((x) => x !== viewerPrimaryPick), opt];
                          submitBinaryWithAgainst(viewerPrimaryPick, toggle);
                          return;
                        }
                        setAgainstPrep((prev) =>
                          prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]
                        );
                      }}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:opacity-40 ${
                        myNo
                          ? "border-rose-600 bg-rose-50 text-rose-950 dark:border-rose-400 dark:bg-rose-950/40 dark:text-rose-100"
                          : "border-slate-200 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-dm-page dark:text-neutral-200 dark:hover:bg-dm-elevated"
                      }`}
                    >
                      Not for me
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3 dark:border-white/15 dark:bg-dm-elevated/60">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-500">
            Prefer something else?
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="text"
              autoComplete="off"
              maxLength={80}
              value={pollWriteIn}
              onChange={(e) => setPollWriteIn(e.target.value)}
              placeholder='e.g. "Train split" · "Defer to host"'
              disabled={busy}
              className="min-w-[12rem] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 dark:border-white/10 dark:bg-dm-page dark:text-neutral-100 dark:placeholder:text-neutral-500"
            />
            <button
              type="button"
              disabled={busy || !isAllowedPollWriteIn(pollWriteIn, opts)}
              onClick={() => {
                const t = pollWriteIn.trim();
                if (!isAllowedPollWriteIn(t, opts)) return;
                void onVote(
                  transportSimpleBinary
                    ? { decisionKey: meta.key, kind, option: t }
                    : {
                        decisionKey: meta.key,
                        kind,
                        option: t,
                        againstOptions: (
                          viewerPrimaryPick != null ? serverAgainstChoices : [...againstPrep]
                        ).filter((x) => x !== t),
                      }
                );
                setPollWriteIn("");
              }}
              className={`rounded-lg px-4 py-2 text-sm disabled:opacity-40 ${primaryFilledInteractive}`}
            >
              Submit vote
            </button>
          </div>
          {genericWriteInSelected ? (
            <p className="mt-2 text-xs text-indigo-900 dark:text-indigo-100">
              Your vote: <span className="font-semibold">{viewerPrimaryPick}</span>.
            </p>
          ) : null}
        </div>
      </section>
    );
  }

  if (meta.kind === "hotel" && !hotels?.length) {
    return (
      <DatesLockedGate active={blockedByDates}>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-neutral-100">{meta.label}</h3>
          {blockedByDates ? null : (
            <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">
              Search Booking.com via RapidAPI for this city, dates, and guest count.
            </p>
          )}
          {hotelSearchErr ? (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
              {hotelSearchErr}
            </p>
          ) : null}
          {canRunHotelSearch ? (
            <button
              type="button"
              disabled={hotelSearchBusy || blockedByDates}
              onClick={() => void runHotelSearch()}
              className={`mt-4 w-full rounded-xl px-4 py-3 text-sm disabled:opacity-50 sm:w-auto ${primaryFilledInteractive}`}
            >
              {hotelSearchBusy ? "Searching hotels…" : "Search hotels"}
            </button>
          ) : (
            <p className="mt-4 text-sm text-slate-600 dark:text-neutral-400">
              Only the trip host can run hotel search. Ask them to search from their account.
            </p>
          )}
        </section>
      </DatesLockedGate>
    );
  }

  if (meta.kind === "hotel" && hotels?.length) {
    return (
      <DatesLockedGate active={blockedByDates}>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-neutral-100">{meta.label}</h3>
          {blockedByDates ? null : (
            <p className="mt-1 text-xs text-slate-500 dark:text-neutral-500">
              Top picks — prices shown inline so nobody has to bounce for a dollar amount first.
            </p>
          )}
          <ul className="mt-4 space-y-3">
            {hotels.map((h) => (
              <li
                key={h.id}
                className={`rounded-xl border px-4 py-3 ${
                  viewerPrimaryPick === h.id
                    ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200 dark:border-indigo-400 dark:bg-indigo-950/40 dark:ring-indigo-500/30"
                    : "border-slate-200 bg-transparent dark:border-white/10 dark:bg-dm-elevated/50"
                }`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-neutral-100">{h.name}</p>
                    <p className="text-sm text-slate-600 dark:text-neutral-400">{h.area}</p>
                    <p className="mt-1 text-base font-semibold tabular-nums text-slate-900 dark:text-neutral-50">
                      {h.priceHint}
                    </p>
                    {h.rating ? (
                      <p className="mt-1 text-sm font-medium text-amber-900/90 dark:text-amber-300">{h.rating}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                    {h.bookingUrl ? (
                      <a
                        href={h.bookingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-dm-page dark:text-neutral-300 dark:hover:bg-dm-elevated"
                      >
                        Open on Booking.com
                      </a>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy || blockedByDates}
                      onClick={() => onVote({ decisionKey: meta.key, kind: "hotel", hotelId: h.id })}
                      className={`rounded-lg px-4 py-2 text-sm disabled:opacity-40 ${
                        viewerPrimaryPick === h.id
                          ? primaryFilledInteractive
                          : "border border-slate-200 bg-white font-semibold text-slate-800 hover:bg-slate-50 dark:border-white/10 dark:bg-dm-page dark:text-neutral-200 dark:hover:bg-dm-elevated"
                      }`}
                    >
                      Vote for this stay
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="text-xs text-slate-500 dark:text-neutral-500">{voterN} vote(s) · quorum to lock</p>
            {canRunHotelSearch ? (
              <button
                type="button"
                disabled={hotelSearchBusy || busy || blockedByDates}
                onClick={() => void runHotelSearch()}
                className="text-xs font-medium text-indigo-700 underline-offset-2 hover:underline disabled:opacity-40 dark:text-indigo-400"
              >
                {hotelSearchBusy ? "Refreshing…" : "Refresh search"}
              </button>
            ) : null}
          </div>
        </section>
      </DatesLockedGate>
    );
  }

  if (meta.kind === "people") {
    const names = plan.people.names;
    if (names.length === 0) {
      return (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-400">
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-neutral-100">{meta.label}</h3>
          <p className="mt-2">
            The plan card shows how many people are expected. Use the name list above for per-person RSVP once names are
            set on the plan.
          </p>
        </section>
      );
    }
    const row = readPeopleVoteRow(votes, visitorKey, canonicalVoterKey);
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-neutral-100">{meta.label}</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">
          I&apos;m in / I&apos;ll try / can&apos;t make it — group vote per name. When quorum is met, we lock RSVP.
        </p>
        <ul className="mt-4 space-y-3">
          {names.map((name) => (
            <li
              key={name}
              className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-white/10 dark:bg-dm-elevated sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="font-medium text-slate-900 dark:text-neutral-100">{name}</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    onVote({ decisionKey: meta.key, kind: "people", name, stance: "in" })
                  }
                  className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                    row[name] === "in"
                      ? "bg-emerald-600 text-white"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-dm-page dark:text-neutral-300 dark:hover:bg-dm-elevated"
                  }`}
                >
                  I&apos;m in
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    onVote({ decisionKey: meta.key, kind: "people", name, stance: "maybe" })
                  }
                  className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                    row[name] === "maybe"
                      ? "bg-amber-500 text-white dark:bg-amber-600"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-dm-page dark:text-neutral-300 dark:hover:bg-dm-elevated"
                  }`}
                >
                  I&apos;ll try
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    onVote({ decisionKey: meta.key, kind: "people", name, stance: "out" })
                  }
                  className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                    row[name] === "out"
                      ? "bg-rose-600 text-white"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-dm-page dark:text-neutral-300 dark:hover:bg-dm-elevated"
                  }`}
                >
                  Can&apos;t make it
                </button>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500 dark:text-neutral-500">{voterN} participant(s) · quorum {quorum}</p>
      </section>
    );
  }

  return null;
}
