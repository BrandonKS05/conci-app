"use client";

import { useEffect, useMemo, useState } from "react";

export type TripParserBuildStep = "structuring" | "saving" | "generating" | "launching";

const CHECKLIST = [
  "Optimizing your route, end to end",
  "Scanning 2000+ airlines for best value",
  "Reading 1B+ reviews for you",
  "Finding hotels with the best deals",
  "Tailoring the plan to you",
] as const;

const STEP_TARGET_DONE_COUNT: Record<TripParserBuildStep, number> = {
  structuring: 1,
  saving: 2,
  generating: 4,
  launching: 5,
};

const TRAVEL_CARD_BACKDROPS = [
  "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=900&auto=format&fit=crop&q=70",
  "https://images.unsplash.com/photo-1488085061387-422e29b40080?w=900&auto=format&fit=crop&q=70",
  "https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=900&auto=format&fit=crop&q=70",
  "https://images.unsplash.com/photo-1507608616759-54f48f0af0ee?w=900&auto=format&fit=crop&q=70",
] as const;

const CARD_ROTATIONS = ["-rotate-6", "-rotate-2", "rotate-2", "rotate-6"] as const;
const CARD_MASKS = [
  "28% 72% 55% 45% / 33% 34% 66% 67%",
  "43% 57% 61% 39% / 52% 41% 59% 48%",
  "61% 39% 45% 55% / 44% 58% 42% 56%",
  "36% 64% 53% 47% / 63% 36% 64% 37%",
] as const;

function PendingSpinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-neutral-500 border-t-neutral-300" />;
}

function DoneCheck() {
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-teal-500 text-[11px] font-bold text-black">
      ✓
    </span>
  );
}

export function TripPlanBuildProgressOverlayDark({
  step,
  tripTitle,
}: {
  step: TripParserBuildStep;
  tripTitle?: string | null;
}) {
  const targetDone = STEP_TARGET_DONE_COUNT[step];
  const [doneCount, setDoneCount] = useState(0);

  useEffect(() => {
    setDoneCount((prev) => (targetDone < prev ? targetDone : prev));
  }, [targetDone]);

  useEffect(() => {
    if (doneCount >= targetDone) return undefined;
    const t = window.setTimeout(() => {
      setDoneCount((prev) => Math.min(targetDone, prev + 1));
    }, 650);
    return () => window.clearTimeout(t);
  }, [doneCount, targetDone]);

  const title = useMemo(() => {
    const t = (tripTitle ?? "").trim();
    return t || "Your Trip";
  }, [tripTitle]);

  const progress = (doneCount / CHECKLIST.length) * 100;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-auto bg-[#0f0f0f] px-4 py-10"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="w-full max-w-4xl rounded-3xl border border-white/10 bg-[#141414] px-6 py-7 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.8)] sm:px-8">
        <h2 className="text-center font-display text-2xl font-semibold text-white sm:text-3xl">{title}</h2>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TRAVEL_CARD_BACKDROPS.map((src, i) => (
            <div
              key={src}
              className={`relative h-32 overflow-hidden border border-white/10 bg-[#202020] shadow-lg sm:h-40 ${CARD_ROTATIONS[i]}`}
              style={{ borderRadius: CARD_MASKS[i] }}
            >
              <img src={src} alt="" className="h-full w-full object-cover opacity-90" loading="eager" />
            </div>
          ))}
        </div>

        <div className="mt-7 h-1.5 overflow-hidden rounded-full bg-[#2a2a2a]">
          <div className="h-full rounded-full bg-teal-500 transition-[width] duration-300 ease-out" style={{ width: `${progress}%` }} />
        </div>

        <ul className="mt-5 space-y-3">
          {CHECKLIST.map((line, i) => {
            const done = i < doneCount;
            return (
              <li key={line} className="flex items-center gap-3 text-sm text-neutral-300">
                {done ? <DoneCheck /> : <PendingSpinner />}
                <span className={done ? "text-neutral-100" : "text-neutral-400"}>{line}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

