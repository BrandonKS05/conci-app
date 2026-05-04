"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TripPlan } from "@/shared/trip-plan";

export type HostCopilotUiHint = {
  scrollTo?: string;
  suggestDatePickMode?: "range" | "day";
  focusTripStartMonth?: boolean;
};

type Msg = { role: "user" | "assistant"; text: string };

const MARGIN = 16;
const MIN_W = 280;
const MIN_H = 220;
const DEFAULT_W = 360;
const DEFAULT_H = 420;

function clampBounds(
  left: number,
  top: number,
  width: number,
  height: number
): { left: number; top: number; width: number; height: number } {
  const vw = typeof window !== "undefined" ? window.innerWidth : 800;
  const vh = typeof window !== "undefined" ? window.innerHeight : 600;
  const maxW = Math.max(MIN_W, vw - 2 * MARGIN);
  const maxH = Math.max(MIN_H, vh - 2 * MARGIN);
  const w = Math.min(Math.max(width, MIN_W), maxW);
  const h = Math.min(Math.max(height, MIN_H), maxH);
  const maxLeft = vw - w - MARGIN;
  const maxTop = vh - h - MARGIN;
  return {
    left: Math.min(Math.max(left, MARGIN), maxLeft),
    top: Math.min(Math.max(top, MARGIN), maxTop),
    width: w,
    height: h,
  };
}

/** Default dock: bottom-right with standard panel size. */
function initialBottomRightBounds(): { left: number; top: number; width: number; height: number } {
  const vw = typeof window !== "undefined" ? window.innerWidth : 800;
  const vh = typeof window !== "undefined" ? window.innerHeight : 600;
  return clampBounds(vw - DEFAULT_W - MARGIN, vh - DEFAULT_H - MARGIN, DEFAULT_W, DEFAULT_H);
}

type Props = {
  tripId: string;
  onResult: (plan: TripPlan, ui: HostCopilotUiHint, applied: boolean) => void;
  /**
   * When true (default), the panel stays hidden until the host scrolls to the trip calendar block (`#sec-dates`).
   * Set false to show immediately (e.g. tests).
   */
  revealWhenCalendarVisible?: boolean;
  /** Query selector for the calendar section to observe; default `#sec-dates` on host setup. */
  calendarSectionSelector?: string;
};

export function HostSetupCopilot({
  tripId,
  onResult,
  revealWhenCalendarVisible = true,
  calendarSectionSelector = "#sec-dates",
}: Props) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: "Ask me to change trip dates, budget, group size, or jump to a section — I’ll update your draft when I can.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [revealReady, setRevealReady] = useState(() => !revealWhenCalendarVisible);
  const [surfaceEntered, setSurfaceEntered] = useState(false);
  const [bounds, setBounds] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const resizeStartRef = useRef<{
    clientX: number;
    clientY: number;
    width: number;
    height: number;
    left: number;
    top: number;
  } | null>(null);
  const entrancePlayedRef = useRef(false);

  useEffect(() => {
    if (!revealWhenCalendarVisible) {
      setRevealReady(true);
      return;
    }
    let io: IntersectionObserver | null = null;
    let cancelled = false;
    let raf = 0;
    let attempts = 0;

    const startObserve = (el: Element) => {
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            setRevealReady(true);
            io?.disconnect();
          }
        },
        { threshold: 0.06, rootMargin: "0px 0px 10% 0px" }
      );
      io.observe(el);
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) {
        setRevealReady(true);
        io.disconnect();
      }
    };

    const tick = () => {
      if (cancelled) return;
      const el = document.querySelector(calendarSectionSelector);
      if (el) {
        startObserve(el);
        return;
      }
      attempts += 1;
      if (attempts < 80) {
        raf = requestAnimationFrame(tick);
      } else {
        setRevealReady(true);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      io?.disconnect();
    };
  }, [revealWhenCalendarVisible, calendarSectionSelector]);

  useLayoutEffect(() => {
    if (!revealReady) return;
    setMounted(true);
    setBounds(initialBottomRightBounds());
  }, [revealReady]);

  useEffect(() => {
    if (!mounted || !bounds || entrancePlayedRef.current) return;
    entrancePlayedRef.current = true;
    setSurfaceEntered(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setSurfaceEntered(true));
    });
    return () => cancelAnimationFrame(id);
  }, [mounted, bounds]);

  useEffect(() => {
    const onResize = () => {
      const b = boundsRef.current;
      if (!b) return;
      setBounds(clampBounds(b.left, b.top, b.width, b.height));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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

  const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const b = boundsRef.current;
    if (!b) return;
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      left: b.left,
      top: b.top,
      width: b.width,
      height: b.height,
    };
    const onMove = (ev: MouseEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      const dx = ev.clientX - start.clientX;
      const dy = ev.clientY - start.clientY;
      setBounds(clampBounds(start.left + dx, start.top + dy, start.width, start.height));
    };
    const onUp = () => {
      dragStartRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.removeProperty("user-select");
    };
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const b = boundsRef.current;
    if (!b) return;
    resizeStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      width: b.width,
      height: b.height,
      left: b.left,
      top: b.top,
    };
    const onMove = (ev: MouseEvent) => {
      const start = resizeStartRef.current;
      if (!start) return;
      const dw = ev.clientX - start.clientX;
      const dh = ev.clientY - start.clientY;
      setBounds(clampBounds(start.left, start.top, start.width + dw, start.height + dh));
    };
    const onUp = () => {
      resizeStartRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.removeProperty("user-select");
    };
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  if (!mounted || !bounds) {
    return null;
  }

  const panel = (
    <div
      className="relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-white/10 dark:bg-dm-card dark:shadow-[0_8px_40px_rgba(0,0,0,0.45)]"
      style={{
        position: "fixed",
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        zIndex: 9999,
        opacity: surfaceEntered ? 1 : 0,
        transform: surfaceEntered ? "translateY(0)" : "translateY(14px)",
        transition: "opacity 280ms ease, transform 280ms ease",
      }}
    >
      <div
        role="toolbar"
        aria-label="Drag setup copilot"
        onMouseDown={onHeaderMouseDown}
        className="shrink-0 cursor-grab select-none border-b border-slate-200 px-3 py-2.5 active:cursor-grabbing dark:border-white/10"
      >
        <div className="flex items-start gap-2">
          <span
            className="mt-0.5 shrink-0 text-slate-400 dark:text-neutral-500"
            aria-hidden
            title="Drag to move"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="9" cy="8" r="1.5" />
              <circle cx="15" cy="8" r="1.5" />
              <circle cx="9" cy="12" r="1.5" />
              <circle cx="15" cy="12" r="1.5" />
              <circle cx="9" cy="16" r="1.5" />
              <circle cx="15" cy="16" r="1.5" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
              Setup copilot
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-neutral-500">
              AI assistant for this draft — edits save automatically when possible.
            </p>
          </div>
        </div>
      </div>
      <div
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2.5 text-sm"
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
      <div className="shrink-0 border-t border-slate-200 p-2 dark:border-white/10">
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
      <div
        role="separator"
        aria-label="Resize copilot"
        onMouseDown={onResizeMouseDown}
        className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize rounded-br-2xl hover:bg-slate-100 dark:hover:bg-white/10"
        style={{ touchAction: "none" }}
      >
        <svg
          className="pointer-events-none absolute bottom-0.5 right-0.5 text-slate-400 dark:text-neutral-500"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="currentColor"
          aria-hidden
        >
          <path d="M12 12H9v-3h3V12zM12 7H9V4h3v3zM7 12H4V9h3v3zM7 7H4V4h3v3z" />
        </svg>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
