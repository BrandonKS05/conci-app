"use client";

import { useCallback, useEffect, useState } from "react";
import {
  parseCollabState,
  type AdjustmentSubmissionV1,
} from "@/shared/collaboration";

type PreferenceDraft = {
  dates: string;
  budget: string;
  lodging: string;
  food: string;
  activities: string;
  pace: string;
  constraints: string;
  note: string;
};

const EMPTY_PREFERENCES: PreferenceDraft = {
  dates: "",
  budget: "",
  lodging: "",
  food: "",
  activities: "",
  pace: "",
  constraints: "",
  note: "",
};

function buildPreferenceSubmissionText(draft: PreferenceDraft): string {
  const rows: Array<[string, string]> = [
    ["Dates / timing", draft.dates],
    ["Budget", draft.budget],
    ["Lodging", draft.lodging],
    ["Food / allergies", draft.food],
    ["Activities", draft.activities],
    ["Pace", draft.pace],
    ["Constraints", draft.constraints],
    ["Other note", draft.note],
  ];
  return rows
    .map(([label, value]) => [label, value.trim()] as const)
    .filter(([, value]) => value.length > 0)
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

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
  const [draft, setDraft] = useState<PreferenceDraft>(EMPTY_PREFERENCES);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [uiErr, setUiErr] = useState<string | null>(null);
  const [myPending, setMyPending] = useState<AdjustmentSubmissionV1[]>([]);
  const [lastSavedText, setLastSavedText] = useState<string | null>(null);
  const submissionText = buildPreferenceSubmissionText(draft);

  const updateDraft = useCallback((field: keyof PreferenceDraft, value: string) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
    if (uiErr) setUiErr(null);
  }, [uiErr]);

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
    const t = buildPreferenceSubmissionText(draft);
    if (t.length < 1) {
      setUiErr("Add at least one preference so the host has something to review.");
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
      setDraft(EMPTY_PREFERENCES);
      await fetchMyPending();
    } catch (e) {
      setUiErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSubmitBusy(false);
    }
  }, [draft, fetchMyPending, tripId]);

  return (
    <section className="mb-6 overflow-hidden rounded-3xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] px-5 py-5 shadow-[var(--shadow-ambient-sm)] dark:border-white/10 dark:bg-dm-card dark:shadow-none sm:px-6 lg:px-7">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_315px] lg:gap-7 xl:grid-cols-[minmax(0,1fr)_345px]">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#2f66ed]">
            My preferences <span className="mx-3 text-[#738197]">·</span>
            <span className="text-[#738197]">All optional</span>
          </p>

          <h2 className="mt-5 max-w-2xl font-display text-[2rem] font-bold leading-[0.96] tracking-[-0.05em] text-[color:var(--on-surface)] dark:text-white sm:text-[2.75rem] lg:text-[3.35rem]">
            What makes the trip work{" "}
            <span className="italic text-[#2f66ed]">for you?</span>
          </h2>

          <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.28em] text-[#2f66ed]">
            General preferences &amp; adjustments
          </p>

          <textarea
            rows={8}
            value={draft.note}
            onChange={(e) => updateDraft("note", e.target.value)}
            placeholder="Tell us anything or nothing: dates, vibe, dealbreakers, dreams. We'll optimize the itinerary for it."
            maxLength={2000}
            disabled={submitBusy}
            className="mt-4 min-h-[220px] w-full resize-y rounded-2xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-low)] px-5 py-5 font-display text-lg italic leading-snug text-[color:var(--on-surface)] shadow-[0_16px_42px_-38px_rgba(15,23,42,0.8)] outline-none placeholder:text-[color:var(--on-surface-muted)] focus:border-[#2f66ed] focus:bg-[color:var(--surface-container-lowest)] focus:ring-4 focus:ring-[#2f66ed]/10 disabled:opacity-50 dark:border-white/15 dark:bg-dm-elevated dark:text-neutral-100 dark:placeholder:text-neutral-400 sm:min-h-[280px]"
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <span className="font-mono text-sm tracking-[0.18em] text-[#71809a]">
              {submissionText.length} / 2000
            </span>
            <button
              type="button"
              disabled={submitBusy || submissionText.length < 1}
              onClick={() => void submit()}
              className="rounded-full bg-[#2f66ed] px-6 py-3 text-xs font-black uppercase tracking-[0.24em] text-white shadow-[0_22px_45px_-24px_rgba(47,102,237,0.85)] transition hover:-translate-y-0.5 hover:bg-[#2458d8] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitBusy ? "Sending…" : "Send to host →"}
            </button>
          </div>
        </div>

        <aside className="pt-1">
          <p className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.22em] text-[#2f66ed] xl:text-[11px]">
            Or directly suggest specifics
          </p>
          <p className="mt-2 text-sm leading-snug text-[color:var(--on-surface-variant)] dark:text-neutral-400">
            Fill one, several, or none — whatever helps.
          </p>

          <div className="mt-5 space-y-3.5">
            <PreferenceField label="Dates" value={draft.dates} placeholder="e.g. Fri-Sun; not June 18" disabled={submitBusy} onChange={(v) => updateDraft("dates", v)} />
            <PreferenceField label="Budget" value={draft.budget} placeholder="e.g. Trying to stay under $900" disabled={submitBusy} onChange={(v) => updateDraft("budget", v)} />
            <PreferenceField label="Lodging" value={draft.lodging} placeholder="e.g. Walkable, own bed, ok w/ Airbnb" disabled={submitBusy} onChange={(v) => updateDraft("lodging", v)} />
            <PreferenceField label="Food / allergies" value={draft.food} placeholder="e.g. Vegetarian; no shellfish" disabled={submitBusy} onChange={(v) => updateDraft("food", v)} />
            <PreferenceField label="Activities" value={draft.activities} placeholder="e.g. Beach day, live music, no hikes" disabled={submitBusy} onChange={(v) => updateDraft("activities", v)} />
            <PreferenceField label="Pace" value={draft.pace} placeholder="e.g. One anchor plan per day, not packed" disabled={submitBusy} onChange={(v) => updateDraft("pace", v)} />
          </div>
        </aside>
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
        <div className="mt-6 border-t border-[color:var(--hairline)] pt-4 dark:border-white/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#2f66ed]">
            Waiting for host review
          </p>
          <ul className="mt-3 space-y-3">
            {myPending.slice(0, 5).map((row) => (
              <li
                key={row.id}
                className="rounded-2xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-low)] p-4 text-sm leading-relaxed shadow-[var(--shadow-ambient-sm)] dark:border-white/10 dark:bg-dm-elevated dark:shadow-none"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#2f66ed]">
                    Host review
                  </p>
                  <p className="text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-400">
                    Submitted{" "}
                    {new Date(row.createdAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                {row.conciProposal?.summary?.trim() ? (
                  <>
                    <p className="mt-3 text-sm font-medium leading-relaxed text-[color:var(--on-surface)] dark:text-neutral-100">
                      {row.conciProposal.summary.trim()}
                    </p>
                    <p className="mt-2 whitespace-pre-line text-xs italic leading-relaxed text-[color:var(--on-surface-variant)] dark:text-neutral-400">
                      You said: &ldquo;{row.text}&rdquo;
                    </p>
                  </>
                ) : (
                  <p className="mt-3 whitespace-pre-line text-sm font-medium leading-relaxed text-[color:var(--on-surface)] dark:text-neutral-100">
                    {row.text}
                  </p>
                )}
                <p className="mt-3 rounded-full border border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] px-3 py-1 text-xs font-semibold text-[color:var(--on-surface-variant)] dark:border-white/10 dark:bg-dm-card dark:text-neutral-300">
                  Waiting for the trip owner to review.
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function PreferenceField({
  label,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold uppercase tracking-[0.28em] text-[#526071] dark:text-neutral-400">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={400}
        disabled={disabled}
        className="mt-1.5 w-full rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-3 py-2 text-sm text-[color:var(--on-surface)] outline-none placeholder:text-[color:var(--on-surface)]/82 transition focus:border-[#2f66ed] focus:bg-[color:var(--surface-container-lowest)] focus:ring-2 focus:ring-[#2f66ed]/10 disabled:opacity-50 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-100 dark:placeholder:text-neutral-300"
      />
    </label>
  );
}
