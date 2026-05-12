"use client";

import { useCallback, useEffect, useState } from "react";
import {
  parseCollabState,
  type AdjustmentSubmissionV1,
} from "@/shared/collaboration";
import { primaryFilledInteractive } from "@/frontend/ui/primary-action";

/**
 * Guest-facing "My preferences" entry point. Wraps the existing
 * `collab/adjustment-submissions` flow so non-hosts can request changes
 * to the itinerary (dates, pins, hotels, budget) without mutating it
 * directly. The host then accepts or dismisses from the Collaborate tab.
 */
export function MyPreferencesCard({
  tripId,
  viewerUserId,
  refreshSignal = 0,
}: {
  tripId: string;
  viewerUserId: string | null;
  /** Bump to force a re-fetch (e.g. after host applies/dismisses). */
  refreshSignal?: number;
}) {
  const [draft, setDraft] = useState("");
  const [submitBusy, setSubmitBusy] = useState(false);
  const [uiErr, setUiErr] = useState<string | null>(null);
  const [myPending, setMyPending] = useState<AdjustmentSubmissionV1[]>([]);
  const [lastSavedText, setLastSavedText] = useState<string | null>(null);

  const fetchMyPending = useCallback(async () => {
    try {
      const res = await fetch(`/api/trip-plans/${tripId}/collab`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const j = (await res.json().catch(() => ({}))) as {
        collab?: unknown;
      };
      const collab = parseCollabState(j.collab);
      const list = (collab.adjustmentSubmissions ?? []).filter(
        (s) => s.status === "pending" && s.authorUserId === viewerUserId
      );
      list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setMyPending(list);
    } catch {
      // Silent: show local "just submitted" confirmation instead.
    }
  }, [tripId, viewerUserId]);

  useEffect(() => {
    if (!viewerUserId) return;
    void fetchMyPending();
  }, [fetchMyPending, viewerUserId, refreshSignal]);

  const submit = useCallback(async () => {
    const t = draft.trim();
    if (t.length < 1) {
      setUiErr("Add a quick note about what you'd like to change.");
      return;
    }
    if (t.length > 2000) {
      setUiErr("Keep it under 2000 characters.");
      return;
    }
    setUiErr(null);
    setSubmitBusy(true);
    try {
      const res = await fetch(
        `/api/trip-plans/${tripId}/collab/adjustment-submissions`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: t }),
        }
      );
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(
          typeof j.error === "string" ? j.error : "Could not submit."
        );
      }
      setLastSavedText(t);
      setDraft("");
      await fetchMyPending();
    } catch (e) {
      setUiErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSubmitBusy(false);
    }
  }, [draft, fetchMyPending, tripId]);

  return (
    <section className="mb-6 rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] p-5 shadow-[var(--shadow-ambient-sm)] dark:border-white/10 dark:bg-dm-card dark:shadow-none">
      <div className="flex flex-col gap-1">
        <span className="label-caps text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">
          My preferences
        </span>
        <h2 className="font-display text-xl font-semibold tracking-[-0.02em] text-[color:var(--on-surface)] dark:text-white">
          Suggest a change for the host
        </h2>
        <p className="text-sm leading-relaxed text-[color:var(--on-surface-variant)] dark:text-[color:var(--on-surface-muted)]">
          Add preferences or request edits (dates, pins, hotels, budget). The
          host reviews and applies what works for the group.
        </p>
      </div>

      <textarea
        rows={3}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          if (uiErr) setUiErr(null);
        }}
        placeholder="e.g. prefer a quieter neighborhood · bump budget by ~$200 · swap dinner Tuesday"
        maxLength={2000}
        disabled={submitBusy}
        className="mt-4 w-full resize-y rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface-container)] px-3 py-2 text-sm text-[color:var(--on-surface)] placeholder:text-[color:var(--on-surface-muted)] focus:border-[color:var(--sage)] focus:outline-none focus:ring-1 focus:ring-[color:var(--sage)]/40 disabled:opacity-50 dark:border-white/10 dark:bg-dm-page dark:text-neutral-100 dark:placeholder:text-neutral-500"
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">
          {draft.trim().length} / 2000
        </span>
        <button
          type="button"
          disabled={submitBusy || draft.trim().length < 1}
          onClick={() => void submit()}
          className={`rounded-lg px-4 py-2 text-sm disabled:opacity-40 ${primaryFilledInteractive}`}
        >
          {submitBusy ? "Sending…" : "Send to host"}
        </button>
      </div>

      {uiErr ? (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/35 dark:text-rose-100">
          {uiErr}
        </p>
      ) : null}

      {!uiErr && lastSavedText && myPending.length === 0 ? (
        <p className="mt-3 rounded-lg bg-[color:var(--surface-container)] px-3 py-2 text-sm text-[color:var(--on-surface-variant)] dark:bg-white/5 dark:text-neutral-300">
          Sent. The host can review it under <strong>Group progress</strong>.
        </p>
      ) : null}

      {myPending.length > 0 ? (
        <div className="mt-5 border-t border-[color:var(--hairline)] pt-4 dark:border-white/10">
          <p className="label-caps text-[color:var(--on-surface-muted)] dark:text-neutral-500">
            Waiting on host
          </p>
          <ul className="mt-2 space-y-2">
            {myPending.slice(0, 5).map((row) => (
              <li
                key={row.id}
                className="rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface-container)] px-3 py-2 text-sm leading-relaxed text-[color:var(--on-surface)] dark:border-white/10 dark:bg-white/5 dark:text-neutral-100"
              >
                <p>“{row.text}”</p>
                <p className="mt-1 text-[11px] text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                  {new Date(row.createdAt).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
