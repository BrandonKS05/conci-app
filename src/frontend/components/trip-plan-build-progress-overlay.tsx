"use client";

import type { ReactNode } from "react";

/** Matches real work in TripParser: model parse → POST trip → client navigates. */
export type TripParserBuildStep = "structuring" | "saving" | "launching";

const ORDER: TripParserBuildStep[] = ["structuring", "saving", "launching"];

function stepRank(s: TripParserBuildStep): number {
  return ORDER.indexOf(s);
}

function IllustrationSparkles({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 80 80" fill="none" aria-hidden>
      <defs>
        <linearGradient id="tpb-spark" x1="0" y1="0" x2="80" y2="80">
          <stop stopColor="#a78bfa" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <rect x="10" y="14" width="60" height="52" rx="14" fill="url(#tpb-spark)" opacity="0.25" />
      <path
        d="M40 22l2.2 6.8H49l-5.5 4 2.1 6.5L40 35.2l-5.6 4.1 2.1-6.5-5.5-4h6.8L40 22z"
        fill="url(#tpb-spark)"
      />
      <circle cx="26" cy="30" r="3" fill="#c4b5fd" />
      <circle cx="56" cy="48" r="2.5" fill="#7dd3fc" />
      <path d="M22 52h36" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
      <path d="M28 58h24" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" opacity="0.2" />
    </svg>
  );
}

function IllustrationCloud({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 80 80" fill="none" aria-hidden>
      <defs>
        <linearGradient id="tpb-cloud" x1="12" y1="44" x2="68" y2="44">
          <stop stopColor="#818cf8" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <ellipse cx="40" cy="46" rx="28" ry="16" fill="url(#tpb-cloud)" opacity="0.35" />
      <path
        d="M24 46c0-8.8 7.2-16 16-16 6.3 0 11.8 3.6 14.5 8.9 1.7-.9 3.6-1.4 5.5-1.4 6.1 0 11 4.9 11 11s-4.9 11-11 11H29c-7.2 0-13-5.8-13-13 0-6.1 4.2-11.2 9.8-12.5z"
        fill="url(#tpb-cloud)"
      />
      <rect x="26" y="52" width="28" height="3" rx="1.5" fill="#e2e8f0" opacity="0.45" />
    </svg>
  );
}

function IllustrationCalendar({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 80 80" fill="none" aria-hidden>
      <rect x="14" y="20" width="52" height="48" rx="10" fill="#1e293b" opacity="0.12" />
      <rect x="14" y="20" width="52" height="48" rx="10" stroke="#38bdf8" strokeWidth="2" fill="none" />
      <path d="M14 32h52" stroke="#38bdf8" strokeWidth="2" opacity="0.5" />
      <path d="M26 18v8M54 18v8" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
      <rect x="22" y="40" width="10" height="8" rx="2" fill="#22d3ee" opacity="0.85" />
      <rect x="35" y="40" width="10" height="8" rx="2" fill="#a78bfa" opacity="0.65" />
      <rect x="48" y="40" width="10" height="8" rx="2" fill="#94a3b8" opacity="0.35" />
    </svg>
  );
}

type StepDef = {
  step: TripParserBuildStep;
  title: string;
  subtitle: string;
  art: ReactNode;
};

const STEP_DEFS: StepDef[] = [
  {
    step: "structuring",
    title: "Structuring your trip",
    subtitle: "The planner is turning your answers into destinations, timing, and group details.",
    art: <IllustrationSparkles className="h-14 w-14 shrink-0" />,
  },
  {
    step: "saving",
    title: "Saving your workspace",
    subtitle: "Writing the plan to your account so the group calendar and invites stay in sync.",
    art: <IllustrationCloud className="h-14 w-14 shrink-0" />,
  },
  {
    step: "launching",
    title: "Opening host setup",
    subtitle: "Loading your trip calendar — pins and polls update live for everyone.",
    art: <IllustrationCalendar className="h-14 w-14 shrink-0" />,
  },
];

export function TripPlanBuildProgressOverlay({ step }: { step: TripParserBuildStep }) {
  const active = stepRank(step);
  const progress = ((active + 1) / ORDER.length) * 100;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-auto bg-gradient-to-br from-[#ede9fe] via-[#dbeafe] to-[#cffafe] px-4 py-10 dark:from-[#1e1b2e] dark:via-[#172554] dark:to-[#0c4a6e]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <p className="sr-only">Building your trip plan. {STEP_DEFS[active]?.title}</p>

      <div className="relative w-full max-w-md">
        <div
          className="pointer-events-none absolute -inset-1 rounded-[1.75rem] bg-gradient-to-r from-violet-400/30 via-sky-400/25 to-cyan-400/30 blur-xl dark:from-violet-500/20 dark:via-sky-500/15 dark:to-cyan-500/20"
          aria-hidden
        />
        <div className="relative overflow-hidden rounded-[1.5rem] border border-white/60 bg-white/90 shadow-[0_24px_80px_-20px_rgba(15,23,42,0.35)] backdrop-blur-md dark:border-white/10 dark:bg-[#151821]/92">
          <div className="border-b border-slate-200/80 bg-gradient-to-r from-violet-50/90 to-sky-50/80 px-6 pb-4 pt-5 dark:border-white/10 dark:from-violet-950/40 dark:to-sky-950/30">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-700/90 dark:text-violet-300/90">
              Creating your trip
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Hang tight — this usually takes a few seconds
            </h2>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 via-sky-500 to-cyan-400 transition-[width] duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <ul className="divide-y divide-slate-100/90 dark:divide-white/10">
            {STEP_DEFS.map((row, i) => {
              const r = stepRank(row.step);
              const done = r < active;
              const current = r === active;
              return (
                <li
                  key={row.step}
                  className={[
                    "flex gap-4 px-5 py-4 transition-colors",
                    current ? "bg-sky-50/60 dark:bg-sky-950/25" : "bg-transparent",
                  ].join(" ")}
                >
                  <div
                    className={[
                      "relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border shadow-sm",
                      done
                        ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-950/40"
                        : current
                          ? "border-sky-200 bg-white ring-2 ring-sky-400/40 dark:border-sky-800/60 dark:bg-[#1a2230] dark:ring-sky-500/35"
                          : "border-slate-200/80 bg-slate-50/80 opacity-60 dark:border-white/10 dark:bg-[#1a1d26]",
                    ].join(" ")}
                  >
                    {done ? (
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-white shadow"
                        aria-hidden
                      >
                        ✓
                      </span>
                    ) : (
                      row.art
                    )}
                    {current ? (
                      <span
                        className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-[10px] font-bold text-white shadow-md"
                        aria-hidden
                      >
                        {i + 1}
                      </span>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="font-semibold text-slate-900 dark:text-neutral-100">{row.title}</p>
                    <p className="mt-1 text-sm leading-snug text-slate-600 dark:text-neutral-400">{row.subtitle}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
