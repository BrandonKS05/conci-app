"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEMO_FLIGHT_OPTIONS,
  DEMO_TRIP_HOTEL_PRIMARY,
  type DemoDayPlan,
  demoTripDateSet,
  getDemoDayPlan,
} from "@/frontend/demo/cancun-trip-calendar-data";
import { primaryFilledInteractive, primaryFocusRing } from "@/frontend/ui/primary-action";

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAYS_MON_FIRST = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function calendarCellsMondayFirst(year: number, monthIndex0: number): (number | null)[] {
  const first = new Date(year, monthIndex0, 1);
  const pad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex0 + 1, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: pad }, () => null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(d);
  }
  return cells;
}

function isoFromParts(year: number, monthIndex0: number, day: number): string {
  const m = String(monthIndex0 + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${m}-${dd}`;
}

type PreferencesState = {
  budgetNote: string;
  dietary: string;
  seating: string;
  pacing: string;
};

type ChatBubble = { id: string; role: "user" | "assistant"; text: string };

function heuristicAssistantReply(input: string, prev: PreferencesState): { reply: string; next: PreferencesState } {
  const lower = input.toLowerCase();
  let changed = "";
  const next = { ...prev };

  if (/\bvegetarian\b|\bvegan\b|\bno seafood\b|\bpescatarian\b|\bkosher\b|\bhalal\b/i.test(lower)) {
    const line = lower.match(/\bvegetarian\b|\bvegan\b|\bno seafood\b|\bpescatarian\b|\bkosher\b|\bhalal\b/i)?.[0] ?? "diet";
    next.dietary = `${line} · Ask restaurants for confirmations`;
    changed = `Updated dietary note accordingly. `;
  }
  if (/\baisle\b/i.test(lower)) {
    next.seating = "Aisle seat preferred on all legs.";
    changed += "Saved aisle preference. ";
  }
  if (/\bwindow\b/i.test(lower)) {
    next.seating = "Window seat preferred on all legs.";
    changed += "Saved window-seat preference. ";
  }
  if (/\bpremium\b|\bupgrade\b|\bmore bougie\b|\bclassier dinners\b/i.test(lower)) {
    next.pacing = "Lean slightly premium on dinners — keep breakfasts casual.";
    next.budgetNote = "~$150/pp buffer bump for nicer meals.";
    changed += "Adjusted pacing toward premium dinners. ";
  }
  if (/\bbudget\b|\bcheaper\b|\btighter\b|\bfrugal\b/i.test(lower)) {
    next.budgetNote = "Tighten discretionary — swap one dinner for street food.";
    changed += "Tightened budget posture for add-ons and meals. ";
  }
  if (/\bearlier outbound\b|\bearlier flight out\b|\bfirst flight\b/i.test(lower)) {
    next.pacing = `${next.pacing} Prefer earlier outbound if inventory opens.`.trim();
    changed += "Flagged earlier outbound hunt to pair with flights. ";
  }

  if (!changed) {
    return {
      next,
      reply: `Got it — I’ll keep coordinating with today’s itinerary. Current snapshot: dietary “${prev.dietary}”, seating “${prev.seating}”. Say things like “aisle seats”, “vegetarian dinners”, or “tighten budget” anytime.`,
    };
  }

  return { next, reply: `${changed.trim()} Anything else — hotels, pacing, or a specific day?` };
}

function DayPlanBody({
  plan,
  variant,
}: {
  plan: DemoDayPlan;
  variant: "modal" | "page";
}) {
  return (
    <div className={variant === "modal" ? "space-y-6" : "space-y-8"}>
      <header className="border-b border-white/10 pb-4 dark:border-white/10">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-teal-500 dark:text-teal-400">{plan.subtitle}</p>
        <h2 className={`font-display font-semibold tracking-tight text-white ${variant === "modal" ? "mt-2 text-2xl" : "mt-3 text-3xl"}`}>
          {plan.title}
        </h2>
      </header>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-[0.26em] text-neutral-400">Stay</h3>
        <div className="mt-2 rounded-2xl border border-white/15 bg-black/35 p-4 text-sm leading-relaxed text-neutral-200">
          <p className="font-semibold text-white">{plan.hotel.name}</p>
          <p className="mt-1 text-neutral-400">{plan.hotel.line}</p>
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-[0.26em] text-neutral-400">Restaurants</h3>
        <ul className="mt-2 space-y-2">
          {plan.restaurants.map((r) => (
            <li key={r.name} className="rounded-xl border border-teal-500/20 bg-teal-950/25 px-4 py-3 text-sm text-neutral-200">
              <span className="font-medium text-teal-100">{r.name}</span>
              {r.note ? <span className="mt-1 block text-neutral-400">{r.note}</span> : null}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-[0.26em] text-neutral-400">Schedule</h3>
        <ul className="mt-3 list-none space-y-2.5 text-sm leading-relaxed text-neutral-300">
          {plan.timeline.map((line) => (
            <li key={line} className="flex gap-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-teal-500/80" aria-hidden />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function DayZoomModal({
  open,
  plan,
  onClose,
}: {
  open: boolean;
  plan: DemoDayPlan | null;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      panelRef.current?.focus();
    }
  }, [open, plan?.iso]);

  if (!open || !plan) return null;

  const dayUrl = `/calendar/day?date=${encodeURIComponent(plan.iso)}`;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-3 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="day-zoom-title"
    >
      <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-md" aria-label="Close day view" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative max-h-[min(92vh,780px)] w-full max-w-lg origin-center overflow-y-auto rounded-[1.75rem] border border-white/15 bg-gradient-to-b from-[#141816] to-[#0c0f0d] p-6 shadow-[0_40px_120px_rgba(0,0,0,0.55)] sm:max-w-xl sm:p-8"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p id="day-zoom-title" className="sr-only">
            Itinerary for {plan.title}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:bg-white/10"
          >
            Close
          </button>
          <div className="flex flex-wrap gap-2">
            <Link
              href={dayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`rounded-full px-4 py-2 text-sm font-semibold ${primaryFilledInteractive} ${primaryFocusRing}`}
            >
              Open in new page
            </Link>
          </div>
        </div>

        <div className="mt-6">
          <DayPlanBody plan={plan} variant="modal" />
        </div>
      </div>
    </div>
  );
}

export function CalendarDayStandalone({ dateParam }: { dateParam: string | null }) {
  const iso = dateParam?.trim() ?? "";
  const validIso = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const plan = validIso ? getDemoDayPlan(iso) : undefined;

  if (!plan) {
    return (
      <div className="mx-auto max-w-lg rounded-[1.75rem] border border-white/10 bg-gradient-to-b from-[#141816] to-dm-card p-8 text-center shadow-xl">
        <h2 className="font-display text-xl font-semibold text-white">Day not found</h2>
        <p className="mt-3 text-sm leading-relaxed text-neutral-400">
          Use a scheduled date such as{" "}
          <code className="rounded-md bg-black/40 px-1.5 py-0.5 text-teal-200">2026-12-15</code> — or pick a highlighted day from
          the main calendar.
        </p>
        <Link
          href="/calendar"
          className={`mt-6 inline-flex rounded-full px-6 py-3 text-sm font-semibold ${primaryFilledInteractive}`}
        >
          Back to trip calendar
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.75rem] border border-white/10 bg-gradient-to-b from-[#141816] to-dm-card p-6 shadow-xl">
        <Link href="/calendar" className="text-sm font-medium text-teal-400 underline-offset-2 hover:underline">
          ← Trip calendar
        </Link>
        <span className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">Full day · shareable URL</span>
      </div>
      <article className="rounded-[1.75rem] border border-white/10 bg-gradient-to-b from-[#141816] to-[#0c0f0d] px-6 py-8 shadow-xl sm:px-10 sm:py-10">
        <DayPlanBody plan={plan} variant="page" />
      </article>
    </div>
  );
}

export function TripCalendarDemoPage() {
  const tripDates = useMemo(() => demoTripDateSet(), []);
  const initialMonth = useMemo(() => ({ y: 2026, m0: 11 }), []);

  const [viewYear, setViewYear] = useState(initialMonth.y);
  const [viewMonth0, setViewMonth0] = useState(initialMonth.m0);
  const [focusedIso, setFocusedIso] = useState<string | null>(null);

  const [flightId, setFlightId] = useState<(typeof DEMO_FLIGHT_OPTIONS)[number]["id"]>(DEMO_FLIGHT_OPTIONS[0].id);
  const [prefs, setPrefs] = useState<PreferencesState>({
    budgetNote: "~$1,400/pp envelope · prioritize shared transport",
    dietary: "Omnivore default — tap Conci adjust",
    seating: "No airline preference logged yet",
    pacing: "One slow morning + one nightlife night",
  });
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatBubble[]>([
    {
      id: "seed",
      role: "assistant",
      text: "I’m on this Cancun timeline with you — click any trip day on the calendar to zoom in. I can tighten budget, tweak seating, or rewrite dining notes from here.",
    },
  ]);

  const cells = useMemo(() => calendarCellsMondayFirst(viewYear, viewMonth0), [viewYear, viewMonth0]);

  const selectedPlan = focusedIso ? getDemoDayPlan(focusedIso) : null;

  const openDayModal = useCallback((iso: string) => {
    if (tripDates.has(iso)) setFocusedIso(iso);
  }, [tripDates]);

  const gotoMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth0 + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth0(d.getMonth());
  };

  const sendChat = useCallback(() => {
    const t = chatInput.trim();
    if (!t) return;
    const userId = `u-${Date.now()}`;
    setChatMessages((m) => [...m, { id: userId, role: "user", text: t }]);
    setChatInput("");
    const { reply, next } = heuristicAssistantReply(t, prefs);
    setPrefs(next);
    setTimeout(() => {
      setChatMessages((m) => [...m, { id: `a-${Date.now()}`, role: "assistant", text: reply }]);
    }, 380);
  }, [chatInput, prefs]);

  return (
    <>
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start xl:gap-10">
        <div className="space-y-6">
          <div className="rounded-[1.75rem] border border-white/10 bg-gradient-to-b from-[#141816] to-dm-card p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)] sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-teal-500/90">December 2026 getaway</p>
                <p className="mt-2 font-display text-2xl font-semibold text-white sm:text-3xl">
                  {MONTH_LABELS[viewMonth0]} {viewYear}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => gotoMonth(-1)}
                  className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-white/10"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => gotoMonth(1)}
                  className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-white/10"
                >
                  Next
                </button>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-neutral-500 sm:text-xs">
              {WEEKDAYS_MON_FIRST.map((w) => (
                <div key={w} className="py-2">
                  {w}
                </div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1.5">
              {cells.map((day, idx) => {
                if (day === null) {
                  return <div key={`pad-${idx}`} className="aspect-square rounded-xl bg-transparent" />;
                }
                const iso = isoFromParts(viewYear, viewMonth0, day);
                const hasPlan = tripDates.has(iso);
                const isOpen = focusedIso === iso && hasPlan;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => {
                      if (hasPlan) openDayModal(iso);
                    }}
                    disabled={!hasPlan}
                    className={[
                      "relative flex aspect-square flex-col items-center justify-center rounded-xl border text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/80",
                      hasPlan
                        ? "cursor-pointer border-teal-500/40 bg-teal-950/35 text-teal-50 shadow-[inset_0_0_0_1px_rgba(45,212,191,0.15)] hover:border-teal-400/70 hover:bg-teal-900/35"
                        : "cursor-default border-transparent bg-white/[0.03] text-neutral-600",
                      isOpen ? "ring-2 ring-teal-300/60" : "",
                    ].join(" ")}
                  >
                    <span>{day}</span>
                    {hasPlan ? (
                      <span className="mt-0.5 h-1 w-1 rounded-full bg-teal-400 sm:mt-1 sm:h-1.5 sm:w-1.5" aria-hidden />
                    ) : null}
                  </button>
                );
              })}
            </div>
            <p className="mt-6 text-xs leading-relaxed text-neutral-500">
              Highlights mark days with lodging + dining planned. Plain cells are outside this demo trip — swipe months to find Dec
              15–18.
            </p>
          </div>
        </div>

        <aside className="flex flex-col gap-6 xl:sticky xl:top-28">
          <div className="rounded-[1.5rem] border border-white/10 bg-gradient-to-b from-[#141816] to-[#101412] p-6 shadow-xl">
            <h3 className="font-display text-lg font-semibold text-white">Flight options</h3>
            <p className="mt-2 text-xs text-neutral-500">Selecting an option anchors what Conci echoes in confirmations.</p>
            <div className="mt-4 space-y-3">
              {DEMO_FLIGHT_OPTIONS.map((opt) => {
                const selected = flightId === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFlightId(opt.id)}
                    className={[
                      "w-full rounded-2xl border p-4 text-left text-sm transition",
                      selected
                        ? "border-teal-400/70 bg-teal-950/30 text-neutral-100"
                        : "border-white/10 bg-black/25 text-neutral-300 hover:border-white/20",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-white">{opt.label}</span>
                      {selected ? (
                        <span className="rounded-full bg-teal-500/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-200">
                          Selected
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 leading-relaxed text-neutral-400">{opt.outbound}</p>
                    <p className="mt-1 leading-relaxed text-neutral-400">{opt.return}</p>
                    <p className="mt-3 font-medium text-neutral-200">{opt.price}</p>
                    <a
                      href={opt.bookUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex text-teal-400 underline-offset-2 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Book via {opt.bookHost}
                    </a>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-gradient-to-b from-[#141816] to-[#101412] p-6 shadow-xl">
            <h3 className="font-display text-lg font-semibold text-white">Home base · hotel</h3>
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-relaxed text-neutral-300">
              <p className="font-semibold text-white">{DEMO_TRIP_HOTEL_PRIMARY.name}</p>
              <p className="mt-2">{DEMO_TRIP_HOTEL_PRIMARY.address}</p>
              <p className="mt-2">{DEMO_TRIP_HOTEL_PRIMARY.nightly}</p>
              <p className="mt-2">Rating · {DEMO_TRIP_HOTEL_PRIMARY.rating}</p>
              <p className="mt-3 text-neutral-500">{DEMO_TRIP_HOTEL_PRIMARY.includes}</p>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-gradient-to-b from-[#141816] to-[#101412] p-6 shadow-xl">
            <h3 className="font-display text-lg font-semibold text-white">Preferences</h3>
            <p className="mt-2 text-xs text-neutral-500">Trip DNA Conci mirrors when you regenerate or negotiate with the group.</p>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Budget posture</span>
                <textarea
                  value={prefs.budgetNote}
                  onChange={(e) => setPrefs((p) => ({ ...p, budgetNote: e.target.value }))}
                  rows={2}
                  className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-teal-500/40"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Dietary / allergies</span>
                <textarea
                  value={prefs.dietary}
                  onChange={(e) => setPrefs((p) => ({ ...p, dietary: e.target.value }))}
                  rows={2}
                  className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-teal-500/40"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Flight seating</span>
                <textarea
                  value={prefs.seating}
                  onChange={(e) => setPrefs((p) => ({ ...p, seating: e.target.value }))}
                  rows={2}
                  className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-teal-500/40"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Trip pacing</span>
                <textarea
                  value={prefs.pacing}
                  onChange={(e) => setPrefs((p) => ({ ...p, pacing: e.target.value }))}
                  rows={2}
                  className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-teal-500/40"
                />
              </label>
            </div>
          </div>

          <div className="flex min-h-[320px] flex-col rounded-[1.5rem] border border-white/10 bg-gradient-to-b from-[#141816] to-[#101412] p-6 shadow-xl">
            <h3 className="font-display text-lg font-semibold text-white">Conci chatter</h3>
            <p className="mt-2 text-xs text-neutral-500">Ask for swaps — aisle seats, vegetarian dinners, tighter budgets.</p>
            <div className="mt-4 flex flex-1 flex-col gap-3 overflow-hidden">
              <div className="max-h-[220px] space-y-3 overflow-y-auto pr-1 text-sm">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-xl px-3 py-2.5 leading-relaxed ${
                      msg.role === "user"
                        ? "ml-6 border border-white/10 bg-white/5 text-neutral-100"
                        : "mr-4 border border-teal-500/20 bg-teal-950/25 text-neutral-200"
                    }`}
                  >
                    {msg.text}
                  </div>
                ))}
              </div>
              <div className="mt-auto flex gap-2 pt-2">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendChat();
                    }
                  }}
                  placeholder="Tell Conci what to change…"
                  rows={2}
                  className="min-h-[52px] flex-1 resize-none rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-teal-500/40"
                />
                <button
                  type="button"
                  onClick={sendChat}
                  className={`self-end rounded-2xl px-4 py-3 text-sm font-semibold ${primaryFilledInteractive}`}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <DayZoomModal open={selectedPlan != null} plan={selectedPlan ?? null} onClose={() => setFocusedIso(null)} />
    </>
  );
}
