"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TripPlan } from "@/shared/trip-plan";

export type HostCopilotUiHint = {
  scrollTo?: string;
  suggestDatePickMode?: "range" | "day";
  focusTripStartMonth?: boolean;
};

type Msg = { role: "user" | "assistant"; text: string };

type Props = {
  tripId: string;
  onResult: (plan: TripPlan, ui: HostCopilotUiHint, applied: boolean) => void;
};

export function HostSetupCopilot({ tripId, onResult }: Props) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: "Ask me to change trip dates, budget, group size, or jump to a section — I’ll update your draft when I can.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const send = useCallback(async () => {
    const t = input.trim();
    if (!t) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: t }]);
    setLoading(true);
    try {
      const res = await fetch(`/api/trip-plans/${tripId}/host-copilot`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: t }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        assistantText?: string;
        plan?: TripPlan;
        applied?: boolean;
        error?: string;
        ui?: HostCopilotUiHint;
      };
      if (!res.ok) {
        setMessages((m) => [
          ...m,
          { role: "assistant", text: typeof j.error === "string" ? j.error : "Something went wrong." },
        ]);
        return;
      }
      const reply = typeof j.assistantText === "string" ? j.assistantText.trim() : "";
      if (j.plan) {
        onResult(j.plan, j.ui ?? {}, Boolean(j.applied));
      }
      setMessages((m) => [...m, { role: "assistant", text: reply || "Done." }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Couldn’t reach the server. Try again." }]);
    } finally {
      setLoading(false);
    }
  }, [input, tripId, onResult]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
      <div className="border-b border-slate-200 px-3 py-2.5 dark:border-white/10">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
          Setup copilot
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-neutral-500">
          AI assistant for this draft — edits save automatically when possible.
        </p>
      </div>
      <div
        className="max-h-[min(220px,40vh)] space-y-2 overflow-y-auto px-3 py-2.5 text-sm"
        aria-live="polite"
      >
        {messages.map((msg, i) => (
          <div
            key={`${i}-${msg.role}`}
            className={[
              "rounded-lg px-2.5 py-2 text-[13px] leading-relaxed",
              msg.role === "user"
                ? "ml-4 bg-teal-100 text-slate-900 dark:bg-teal-950/50 dark:text-neutral-100"
                : "mr-2 bg-slate-50 text-slate-800 dark:bg-dm-elevated dark:text-neutral-200",
            ].join(" ")}
          >
            {msg.text}
          </div>
        ))}
        {loading ? (
          <div className="mr-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[13px] text-slate-500 dark:bg-dm-elevated dark:text-neutral-400">
            Thinking…
          </div>
        ) : null}
        <div ref={endRef} />
      </div>
      <div className="border-t border-slate-200 p-2 dark:border-white/10">
        <textarea
          rows={2}
          value={input}
          disabled={loading}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="e.g. Set trip to June 12–18, mid-range budget…"
          className="mb-2 w-full resize-none rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400/40 dark:border-white/10 dark:bg-dm-page dark:text-neutral-100 dark:placeholder:text-neutral-500"
        />
        <button
          type="button"
          disabled={loading || !input.trim()}
          onClick={() => void send()}
          className="w-full rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-neutral-700"
        >
          {loading ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
