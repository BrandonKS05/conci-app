"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/frontend/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/frontend/components/ui/dialog";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { Textarea } from "@/frontend/components/ui/textarea";

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
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

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

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Email selected travelers</DialogTitle>
          <DialogDescription>
            {recipientMemberIds.length === 1
              ? "1 recipient · via Resend"
              : `${recipientMemberIds.length} recipients · via Resend`}
          </DialogDescription>
        </DialogHeader>

        <label className="mb-3 block">
          <Label asChild>
            <span>Subject</span>
          </Label>
          <Input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={busy}
            placeholder='e.g. "Vote by Friday"'
          />
        </label>

        <label className="mb-4 block">
          <Label asChild>
            <span>Message</span>
          </Label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={busy}
            rows={6}
            placeholder="Write something your travelers should know..."
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

        <DialogFooter>
          <Button
            type="button"
            disabled={busy || recipientMemberIds.length === 0}
            onClick={() => void send()}
            className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
          >
            {busy ? "Sending…" : "Send"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={onClose}
            className="rounded-xl"
          >
            Cancel
          </Button>
        </DialogFooter>

        <p className="mt-3 text-center text-[11px] text-slate-400 dark:text-neutral-600">Uses your Resend outbound address (same as reminders).</p>
      </DialogContent>
    </Dialog>
  );
}
