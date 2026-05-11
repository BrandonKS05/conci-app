"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function HostTripMemberEmailModal({
  open,
  tripId,
  recipientMemberIds,
  onClose,
  onSendSuccess,
}: {
  open: boolean;
  tripId: string;
  recipientMemberIds: string[];
  onClose: () => void;
  /** Called after every recipient accepted delivery (closes modal clears form). */
  onSendSuccess?: () => void;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setFeedback(null);
    }
  }, [open]);

  const send = useCallback(async () => {
    const sub = subject.trim();
    const bod = message.trim();
    if (!sub || !bod || recipientMemberIds.length === 0) {
      setFeedback({ kind: "err", text: "Enter a subject and message, and keep at least one recipient selected." });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const r = await fetch(`/api/trip-plans/${tripId}/collab/notify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberIds: recipientMemberIds,
          subject: sub,
          message: bod,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        sent?: number;
        failed?: number;
      };
      if (!r.ok) {
        setFeedback({
          kind: "err",
          text: typeof j.error === "string" ? j.error : "Could not send email.",
        });
        return;
      }
      const sent = typeof j.sent === "number" ? j.sent : 0;
      const failed = typeof j.failed === "number" ? j.failed : 0;
      let text = sent === 1 ? "Sent email to 1 traveler." : `Sent email to ${sent} travelers.`;
      if (failed > 0) text += ` ${failed} could not be reached.`;
      setFeedback({ kind: "ok", text });
      if (failed === 0) {
        setSubject("");
        setMessage("");
        onSendSuccess?.();
      }
    } catch {
      setFeedback({ kind: "err", text: "Network error — please try again." });
    } finally {
      setBusy(false);
    }
  }, [message, onSendSuccess, recipientMemberIds, subject, tripId]);

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 backdrop-blur-sm"
      role="presentation"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="mx-4 w-full max-w-md rounded-2xl border border-[color:var(--hairline)] bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-dm-card">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold text-[color:var(--on-surface)] dark:text-neutral-50">Email selected travelers</h3>
            <p className="mt-1 text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">
              {recipientMemberIds.length === 1
                ? "1 recipient · via Resend"
                : `${recipientMemberIds.length} recipients · via Resend`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-[color:var(--on-surface-variant)] dark:text-neutral-500 dark:hover:bg-dm-elevated dark:hover:text-neutral-300"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4.5 4.5l9 9M13.5 4.5l-9 9" />
            </svg>
          </button>
        </div>

        <label className="mb-3 block">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:text-neutral-500">
            Subject
          </span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={busy}
            placeholder='e.g. "Vote by Friday"'
            className="w-full rounded-xl border border-[color:var(--hairline)] bg-white px-3 py-2.5 text-sm text-[color:var(--on-surface)] outline-none placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-50 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:border-emerald-500/40 dark:focus:ring-emerald-500/10"
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:text-neutral-500">
            Message
          </span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={busy}
            rows={6}
            placeholder="Write something your travelers should know..."
            className="w-full resize-y rounded-xl border border-[color:var(--hairline)] bg-white px-3 py-2.5 text-sm text-[color:var(--on-surface)] outline-none placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-50 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:border-emerald-500/40 dark:focus:ring-emerald-500/10"
          />
        </label>

        {feedback ? (
          <p
            className={`mb-3 rounded-xl px-3 py-2 text-sm ${
              feedback.kind === "ok"
                ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/45 dark:text-emerald-100"
                : "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300"
            }`}
          >
            {feedback.text}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || recipientMemberIds.length === 0}
            onClick={() => void send()}
            className="inline-flex rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-600"
          >
            {busy ? "Sending…" : "Send"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-xl border border-[color:var(--hairline)] px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-[color:var(--surface-container-low)] disabled:opacity-50 dark:border-white/10 dark:text-neutral-300 dark:hover:bg-dm-elevated"
          >
            Cancel
          </button>
        </div>

        <p className="mt-3 text-center text-[11px] text-slate-400 dark:text-neutral-600">Uses your Resend outbound address (same as reminders).</p>
      </div>
    </div>
  );
}
