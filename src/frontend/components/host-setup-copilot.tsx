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

const COPILOT_INTRO: Msg = {
  role: "assistant",
  text: "Ask me to change trip dates, budget, group size, add a hotel (say whole trip or which nights), pin a restaurant on a day, or jump to a section \u2014 I\u2019ll update your draft when I can.",
};

function loadChatHistory(tripId: string): Msg[] {
  if (typeof window === "undefined") return [COPILOT_INTRO];
  try {
    const raw = sessionStorage.getItem(`copilot-chat:${tripId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [COPILOT_INTRO];
}

function saveChatHistory(tripId: string, messages: Msg[]): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(`copilot-chat:${tripId}`, JSON.stringify(messages));
  } catch {}
}

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

function initialBottomRightBounds(): { left: number; top: number; width: number; height: number } {
  const vw = typeof window !== "undefined" ? window.innerWidth : 800;
  const vh = typeof window !== "undefined" ? window.innerHeight : 600;
  return clampBounds(vw - DEFAULT_W - MARGIN, vh - DEFAULT_H - MARGIN, DEFAULT_W, DEFAULT_H);
}

type Props = {
  tripId: string;
  plan: TripPlan;
  onResult: (plan: TripPlan, ui: HostCopilotUiHint, applied: boolean) => void;
  layout?: "floating" | "embedded";
  revealWhenCalendarVisible?: boolean;
  calendarSectionSelector?: string;
};

export function HostSetupCopilot({
  tripId,
  plan,
  onResult,
  layout = "floating",
  revealWhenCalendarVisible = true,
  calendarSectionSelector = "#sec-dates",
}: Props) {
  const embedded = layout === "embedded";
  const [messages, setMessages] = useState<Msg[]>(() => loadChatHistory(tripId));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [revealReady, setRevealReady] = useState(() => embedded || !revealWhenCalendarVisible);
  const [surfaceEntered, setSurfaceEntered] = useState(false);
  const [bounds, setBounds] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  // Undo/Keep history state
  const [previousPlan, setPreviousPlan] = useState<TripPlan | null>(null);
  const [reverting, setReverting] = useState(false);

  useEffect(() => {
    saveChatHistory(tripId, messages);
  }, [tripId, messages]);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
    if (embedded) {
      setRevealReady(true);
      return;
    }
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
  }, [embedded, revealWhenCalendarVisible, calendarSectionSelector]);

  useLayoutEffect(() => {
    if (!revealReady) return;
    setMounted(true);
    if (!embedded) {
      setBounds(initialBottomRightBounds());
    }
  }, [revealReady, embedded]);

  useEffect(() => {
    if (!mounted || entrancePlayedRef.current) return;
    if (embedded) {
      entrancePlayedRef.current = true;
      setSurfaceEntered(true);
      return;
    }
    if (!bounds) return;
    entrancePlayedRef.current = true;
    setSurfaceEntered(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setSurfaceEntered(true));
    });
    return () => cancelAnimationFrame(id);
  }, [mounted, bounds, embedded]);

  useEffect(() => {
    if (embedded) return;
    const onResize = () => {
      const b = boundsRef.current;
      if (!b) return;
      setBounds(clampBounds(b.left, b.top, b.width, b.height));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [embedded]);

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
        // Save the previous plan before applying the copilot result
        setPreviousPlan(plan);
        onResult(j.plan, j.ui ?? {}, Boolean(j.applied));
      }
      setMessages((m) => [...m, { role: "assistant", text: reply || "Done." }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Couldn\u2019t reach the server. Try again." }]);
    } finally {
      setLoading(false);
    }
  }, [input, tripId, onResult, plan]);

  const handleUndo = useCallback(async () => {
    if (!previousPlan) return;
    setReverting(true);
    try {
      const body: Record<string, unknown> = {};
      if (previousPlan.hostSetup) body.hostSetup = previousPlan.hostSetup;
      if (previousPlan.budget) body.budget = previousPlan.budget;
      if (previousPlan.generatedItinerary !== undefined) {
        body.generatedItinerary = previousPlan.generatedItinerary;
      }

      const res = await fetch(`/api/trip-plans/${tripId}/host-setup`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        onResult(previousPlan, {}, true);
        setPreviousPlan(null);
        setMessages((m) => [
          ...m,
          { role: "assistant", text: "Reverted changes successfully." },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          { role: "assistant", text: "Failed to revert changes." },
        ]);
      }
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "Failed to reach the server to revert changes." },
      ]);
    } finally {
      setReverting(false);
    }
  }, [previousPlan, tripId, onResult]);

  const handleKeep = useCallback(() => {
    setPreviousPlan(null);
    setMessages((m) => [
      ...m,
      { role: "assistant", text: "Saved changes to draft." },
    ]);
  }, []);

  const handleSuggestionClick = useCallback((prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  }, []);

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

  if (!mounted || (!embedded && !bounds)) {
    return null;
  }

  const shellClass =
    "relative flex flex-col overflow-hidden rounded-2xl border border-[#f0efe9] bg-white shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-[0_8px_40px_rgba(0,0,0,0.45)]";

  const panel = (
    <div
      className={
        embedded
          ? `${shellClass} h-[440px] w-full`
          : shellClass
      }
      style={
        embedded
          ? {
              opacity: surfaceEntered ? 1 : 0,
              transform: surfaceEntered ? "translateY(0)" : "translateY(8px)",
              transition: "opacity 220ms ease, transform 220ms ease",
            }
          : {
              position: "fixed",
              left: bounds!.left,
              top: bounds!.top,
              width: bounds!.width,
              height: bounds!.height,
              zIndex: 9999,
              opacity: surfaceEntered ? 1 : 0,
              transform: surfaceEntered ? "translateY(0)" : "translateY(14px)",
              transition: "opacity 280ms ease, transform 280ms ease",
            }
      }
    >
      {/* Header */}
      <div
        role={embedded ? undefined : "toolbar"}
        aria-label={embedded ? undefined : "Drag setup copilot"}
        onMouseDown={embedded ? undefined : onHeaderMouseDown}
        className={
          embedded
            ? "shrink-0 border-b border-[#f0efe9] px-6 py-4 flex items-center justify-between dark:border-white/10"
            : "shrink-0 cursor-grab select-none border-b border-[#f0efe9] px-4 py-3 flex items-center justify-between active:cursor-grabbing dark:border-white/10"
        }
      >
        <div className="flex items-center gap-3">
          {!embedded && (
            <span
              className="shrink-0 text-slate-400 dark:text-neutral-500"
              aria-hidden
              title="Drag to move"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <circle cx="9" cy="8" r="1.5" />
                <circle cx="15" cy="8" r="1.5" />
                <circle cx="9" cy="12" r="1.5" />
                <circle cx="15" cy="12" r="1.5" />
                <circle cx="9" cy="16" r="1.5" />
                <circle cx="15" cy="16" r="1.5" />
              </svg>
            </span>
          )}
          <h2 className="font-display text-[1.35rem] font-semibold text-[#1c1c17] tracking-tight dark:text-white">
            Trip Copilot
          </h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-extrabold tracking-widest text-emerald-700 border border-emerald-200 select-none dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            LIVE
          </span>
        </div>
        <p className="text-xs text-[#8c8a82] dark:text-neutral-400 hidden sm:block">
          Saving automatically \u00b7 everyone sees changes
        </p>
      </div>

      {/* Messages */}
      <div
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5"
        aria-live="polite"
      >
        {messages.map((msg, i) => {
          const isLatestAssistantWithUndo =
            msg.role === "assistant" &&
            i === messages.length - 1 &&
            previousPlan !== null;

          return (
            <div key={`${i}-${msg.role}`} className="flex flex-col">
              {msg.role === "user" ? (
                <div className="flex justify-end w-full">
                  <div className="max-w-[75%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed bg-[#1c1c17] text-white font-medium rounded-tr-none dark:bg-[#e5e5e0] dark:text-[#1c1c17]">
                    {msg.text}
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2.5 max-w-[85%]">
                  <div className="w-6 h-6 shrink-0 flex items-center justify-center rounded-full bg-[#1c1c17] text-white font-semibold text-[11px] select-none font-display uppercase dark:bg-white dark:text-black">
                    c
                  </div>
                  <div className="flex flex-col gap-1.5 items-start">
                    <div className="rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed bg-[#f4f4f2] text-[#1c1c17] font-medium rounded-tl-none dark:bg-dm-elevated dark:text-neutral-100">
                      {msg.text}
                    </div>
                    {isLatestAssistantWithUndo && (
                      <div className="flex items-center gap-2 mt-1">
                        <button
                          type="button"
                          disabled={reverting}
                          onClick={handleUndo}
                          className="rounded-full border border-[#e5e5e0] bg-white px-3.5 py-1 text-xs font-semibold text-[#1c1c17] transition hover:bg-neutral-50 disabled:opacity-50 dark:border-white/10 dark:bg-dm-page dark:text-white"
                        >
                          {reverting ? "Reverting..." : "Undo"}
                        </button>
                        <button
                          type="button"
                          disabled={reverting}
                          onClick={handleKeep}
                          className="rounded-full bg-[#1c1c17] text-white px-3.5 py-1 text-xs font-semibold transition hover:bg-neutral-800 dark:bg-[#ebe9e4] dark:text-[#1c1c17]"
                        >
                          Keep
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {loading ? (
          <div className="flex items-start gap-2.5 max-w-[85%]">
            <div className="w-6 h-6 shrink-0 flex items-center justify-center rounded-full bg-[#1c1c17] text-white font-semibold text-[11px] select-none font-display uppercase dark:bg-white dark:text-black">
              c
            </div>
            <div className="rounded-2xl px-4 py-2.5 text-[13px] bg-[#f4f4f2] text-[#8c8a82] font-medium rounded-tl-none animate-pulse dark:bg-dm-elevated dark:text-neutral-400">
              Thinking\u2026
            </div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      {/* Input & Try Row */}
      <div className="shrink-0 border-t border-[#f0efe9] px-6 py-4 space-y-3.5 bg-white dark:border-white/10 dark:bg-dm-card">
        <div className="relative flex items-center bg-[#f4f4f2] rounded-full px-1.5 py-1.5 border border-[#e5e5e0] dark:bg-dm-page dark:border-white/10">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            disabled={loading}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Ask anything about the trip..."
            className="flex-1 bg-transparent px-4 py-1 text-[13px] text-[#1c1c17] placeholder:text-[#8c8a82] outline-none resize-none overflow-hidden h-[28px] leading-[20px] dark:text-white dark:placeholder:text-neutral-500"
          />
          <button
            type="button"
            disabled={loading || !input.trim()}
            onClick={() => void send()}
            className="rounded-full bg-[#1c1c17] hover:bg-neutral-800 text-white px-5 py-1.5 text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed h-[28px] flex items-center justify-center dark:bg-[#ebe9e4] dark:text-[#1c1c17]"
          >
            {loading ? "..." : "Send"}
          </button>
        </div>

        {/* Try suggestions */}
        <div className="flex items-center gap-3 select-none">
          <span className="text-[10px] font-bold tracking-wider text-[#8c8a82] uppercase shrink-0 dark:text-neutral-500">
            TRY
          </span>
          <div className="flex flex-wrap gap-1.5 overflow-x-auto no-scrollbar">
            {[
              { label: "Change dates", prompt: "Change the trip dates to " },
              { label: "Set budget", prompt: "Set the trip budget to " },
              { label: "Add a hotel", prompt: "Add a hotel near " },
              { label: "Pin a restaurant", prompt: "Pin a restaurant named " },
              { label: "Add a day", prompt: "Add an extra day to the itinerary" },
            ].map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => handleSuggestionClick(s.prompt)}
                className="rounded-full border border-[#e5e5e0] bg-white px-3 py-1 text-xs font-semibold text-[#1c1c17] transition hover:bg-neutral-50 whitespace-nowrap dark:border-white/10 dark:bg-dm-page dark:text-white"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!embedded && (
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
      )}
    </div>
  );

  if (embedded) {
    return panel;
  }

  return createPortal(panel, document.body);
}
