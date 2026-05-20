"use client";

import { useEffect, useRef, useState } from "react";
import type { TripPlan } from "@/shared/trip-plan";

type ChecklistKey = "lodging" | "meals" | "activities" | "budget";

interface ProgressEvent {
  type: "progress";
  stage: string;
  percent: number;
  completed: ChecklistKey[];
}

interface CompleteEvent {
  type: "complete";
  itinerary: unknown;
  plan: TripPlan;
}

interface ErrorEvent {
  type: "error";
  message: string;
}

type StreamEvent = ProgressEvent | CompleteEvent | ErrorEvent;

const CHECKLIST: { key: ChecklistKey; label: string }[] = [
  { key: "lodging", label: "Lodging" },
  { key: "meals", label: "Meals" },
  { key: "activities", label: "Activities" },
  { key: "budget", label: "Budget" },
];

const ANIMATIONS = `
  @keyframes itinFlyPlane {
    0%   { transform: translate(-4px, 14px) rotate(-18deg); opacity: 0; }
    8%   { opacity: 1; }
    25%  { transform: translate(56px, -22px) rotate(-8deg); }
    50%  { transform: translate(124px, -48px) rotate(0deg); }
    75%  { transform: translate(192px, -22px) rotate(10deg); }
    92%  { opacity: 1; }
    100% { transform: translate(260px, 6px) rotate(18deg); opacity: 0; }
  }
  @keyframes itinDrawRoute {
    from { stroke-dashoffset: 400; }
    to   { stroke-dashoffset: 0; }
  }
  @keyframes itinPinPop {
    0%   { transform: scale(0) translateY(8px); opacity: 0; }
    65%  { transform: scale(1.25) translateY(-2px); opacity: 1; }
    100% { transform: scale(1) translateY(0); opacity: 1; }
  }
  @keyframes itinPinRing {
    0%   { transform: scale(1); opacity: 0.7; }
    100% { transform: scale(2.4); opacity: 0; }
  }
  @keyframes itinCheckIn {
    0%   { transform: scale(0) rotate(-120deg); opacity: 0; }
    70%  { transform: scale(1.15) rotate(6deg); }
    100% { transform: scale(1) rotate(0deg); opacity: 1; }
  }
  @keyframes itinSlideUp {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes itinDotPulse {
    0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
    40%            { transform: scale(1); opacity: 1; }
  }
`;

function PlaneDot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full bg-slate-300"
      style={{ animation: `itinDotPulse 1.4s ${delay} ease-in-out infinite` }}
    />
  );
}

export function ItineraryGenerationLoading({
  tripId,
  tripTitle,
  onComplete,
  onError,
}: {
  tripId: string;
  tripTitle?: string | null;
  onComplete: (plan: TripPlan) => void;
  onError: (message: string) => void;
}) {
  const [percent, setPercent] = useState(0);
  const [stage, setStage] = useState("Preparing your trip...");
  const [completed, setCompleted] = useState<ChecklistKey[]>([]);
  const [exiting, setExiting] = useState(false);

  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  onCompleteRef.current = onComplete;
  onErrorRef.current = onError;

  useEffect(() => {
    let aborted = false;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    const run = async () => {
      try {
        const res = await fetch(`/api/trip-plans/${tripId}/generate-itinerary-stream`, {
          method: "POST",
          credentials: "include",
        });

        if (!res.ok || !res.body) {
          const errBody = await res.json().catch(() => ({})) as { error?: string };
          if (!aborted) onErrorRef.current(errBody.error ?? "Failed to start generation");
          return;
        }

        reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!aborted) {
          const { value, done } = await reader.read();
          if (done || aborted) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6)) as StreamEvent;

              if (event.type === "progress") {
                setPercent(event.percent);
                setStage(event.stage);
                setCompleted(event.completed);
              } else if (event.type === "complete") {
                setPercent(100);
                setCompleted(["lodging", "meals", "activities", "budget"]);
                setExiting(true);
                const plan = event.plan;
                setTimeout(() => {
                  if (!aborted) onCompleteRef.current(plan);
                }, 650);
              } else if (event.type === "error") {
                if (!aborted) onErrorRef.current(event.message);
              }
            } catch {
              // malformed SSE line — skip
            }
          }
        }
      } catch {
        if (!aborted) onErrorRef.current("Network error — check your connection.");
      }
    };

    void run();

    return () => {
      aborted = true;
      reader?.cancel().catch(() => undefined);
    };
  }, [tripId]);

  const title = tripTitle?.trim() || "Your Trip";

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ANIMATIONS }} />

      <div
        className="fixed inset-0 z-[300] flex items-center justify-center overflow-auto bg-white px-5 py-10"
        style={{
          transition: "opacity 0.6s ease-out",
          opacity: exiting ? 0 : 1,
          pointerEvents: exiting ? "none" : "auto",
        }}
        role="status"
        aria-live="polite"
        aria-busy={!exiting}
      >
        <div
          className="w-full max-w-md"
          style={{ animation: "itinSlideUp 0.45s ease-out" }}
        >
          {/* Header */}
          <div className="mb-7 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Building your trip
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-slate-900 sm:text-[1.75rem]">
              {title}
            </h2>
          </div>

          {/* Travel animation stage */}
          <div className="relative mb-7 h-28 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
            {/* Route SVG */}
            <svg
              viewBox="0 0 300 80"
              className="absolute inset-0 h-full w-full"
              aria-hidden
              preserveAspectRatio="none"
            >
              {/* Faint grid lines */}
              <line x1="0" y1="40" x2="300" y2="40" stroke="#0f172a" strokeOpacity="0.04" strokeWidth="1" />
              <line x1="150" y1="0" x2="150" y2="80" stroke="#0f172a" strokeOpacity="0.04" strokeWidth="1" />

              {/* Animated route arc */}
              <path
                d="M 28 64 C 90 8 210 8 272 60"
                stroke="#2563EB"
                strokeWidth="1.5"
                strokeDasharray="7 5"
                fill="none"
                style={{
                  strokeDashoffset: 400,
                  animation: "itinDrawRoute 2.8s cubic-bezier(0.4,0,0.2,1) 0.4s forwards",
                }}
              />
            </svg>

            {/* Origin pin */}
            <div
              className="absolute bottom-4 left-4 flex flex-col items-center"
              style={{ animation: "itinPinPop 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.3s both" }}
            >
              <div className="relative">
                <div className="h-3.5 w-3.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.7)]" />
                <div
                  className="absolute inset-0 rounded-full bg-rose-400"
                  style={{ animation: "itinPinRing 2s 0.8s ease-out infinite" }}
                />
              </div>
              <div className="mt-0.5 h-2 w-px bg-rose-500/50" />
            </div>

            {/* Destination pin */}
            <div
              className="absolute bottom-4 right-4 flex flex-col items-center"
              style={{ animation: "itinPinPop 0.5s cubic-bezier(0.34,1.56,0.64,1) 2.6s both" }}
            >
              <div className="relative">
                <div className="h-3.5 w-3.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
                <div
                  className="absolute inset-0 rounded-full bg-emerald-300"
                  style={{ animation: "itinPinRing 2s 3.2s ease-out infinite" }}
                />
              </div>
              <div className="mt-0.5 h-2 w-px bg-emerald-400/50" />
            </div>

            {/* Flying plane */}
            <div
              className="absolute bottom-[22px] left-4 select-none text-[18px] leading-none"
              style={{ animation: "itinFlyPlane 3.8s ease-in-out 1s infinite" }}
              aria-hidden
            >
              ✈
            </div>
          </div>

          {/* Progress bar */}
          <div className="mb-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-teal-500"
              style={{
                width: `${percent}%`,
                transition: "width 0.7s cubic-bezier(0.4,0,0.2,1)",
              }}
            />
          </div>

          {/* Stage label */}
          <div className="mb-7 flex items-center justify-between">
            <p className="text-sm text-slate-400">{stage}</p>
            <span className="flex items-center gap-0.5">
              <PlaneDot delay="0s" />
              <PlaneDot delay="0.2s" />
              <PlaneDot delay="0.4s" />
            </span>
          </div>

          {/* Checklist */}
          <div className="grid grid-cols-2 gap-2.5">
            {CHECKLIST.map(({ key, label }) => {
              const done = completed.includes(key);
              return (
                <div
                  key={key}
                  className="flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5"
                  style={{
                    borderColor: done ? "rgba(20,184,166,0.35)" : "rgba(15,23,42,0.08)",
                    backgroundColor: done ? "rgba(20,184,166,0.06)" : "transparent",
                    transition: "border-color 0.35s ease, background-color 0.35s ease",
                  }}
                >
                  {/* Checkmark circle */}
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                    style={{
                      backgroundColor: done ? "#14b8a6" : "transparent",
                      border: done ? "none" : "1.5px solid rgba(15,23,42,0.15)",
                      color: done ? "#000" : "transparent",
                      animation: done ? "itinCheckIn 0.4s cubic-bezier(0.34,1.56,0.64,1)" : undefined,
                      transition: "background-color 0.25s ease, border 0.25s ease",
                    }}
                  >
                    ✓
                  </span>
                  <span
                    className="text-sm font-medium"
                    style={{
                      color: done ? "#99f6e4" : "rgba(255,255,255,0.28)",
                      transition: "color 0.35s ease",
                    }}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
