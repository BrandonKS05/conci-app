"use client";

import { useEffect, useRef, useState } from "react";
import type { TripPlan } from "@/shared/trip-plan";

interface ProgressEvent {
  type: "progress";
  stage: string;
  percent: number;
  checklist: ChecklistItem[];
  completed: string[];
}

interface CompleteEvent {
  type: "complete";
  checklist: ChecklistItem[];
  itinerary: unknown;
  plan: TripPlan;
}

interface ErrorEvent {
  type: "error";
  message: string;
}

type StreamEvent = ProgressEvent | CompleteEvent | ErrorEvent;

type ChecklistItem = { key: string; label: string };

const STATUSES = [
  "Finding the best restaurant experiences...",
  "Searching for top-rated lodging...",
  "Curating local activities for you...",
  "Checking flight availability...",
  "Discovering hidden gems nearby...",
  "Optimizing your daily itinerary...",
  "Sourcing unique cultural experiences...",
  "Reviewing traveler favorites...",
];

const LABEL_PULSE = `
  @keyframes labelPulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }
`;

export function ItineraryGenerationLoading({
  tripId,
  onComplete,
  onError,
}: {
  tripId: string;
  tripTitle?: string | null;
  onComplete: (plan: TripPlan) => void;
  onError: (message: string) => void;
}) {
  const [statusText, setStatusText] = useState(STATUSES[0]);
  const [statusVisible, setStatusVisible] = useState(true);
  const [exiting, setExiting] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [completed, setCompleted] = useState<string[]>([]);
  const [started, setStarted] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const planeGroupRef = useRef<SVGGElement>(null);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  onCompleteRef.current = onComplete;
  onErrorRef.current = onError;

  // Status cycling
  useEffect(() => {
    let idx = 0;
    const interval = setInterval(() => {
      setStatusVisible(false);
      setTimeout(() => {
        idx = (idx + 1) % STATUSES.length;
        setStatusText(STATUSES[idx]);
        setStatusVisible(true);
      }, 400);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  // Canvas animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    if (!ctx) return;

    const W = 480, H = 280;

    const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathEl.setAttribute("d", "M 240 60 C 420 10, 540 120, 435 195 C 330 270, 150 270, 45 195 C -60 120, 60 10, 240 60");
    const totalLen = pathEl.getTotalLength();

    const trail: { x: number; y: number }[] = [];
    const TRAIL_LEN = 60;
    let t = 0;
    const SPEED = 1 / (11 * 60);
    let rafId: number;

    function getPoint(frac: number) {
      const p = pathEl.getPointAtLength(frac * totalLen);
      return { x: p.x, y: p.y };
    }

    function getAngle(frac: number) {
      const a = pathEl.getPointAtLength(((frac * totalLen) - 4 + totalLen) % totalLen);
      const b = pathEl.getPointAtLength(((frac * totalLen) + 4) % totalLen);
      return Math.atan2(b.y - a.y, b.x - a.x);
    }

    function frame() {
      ctx.clearRect(0, 0, W, H);

      const pos = getPoint(t);
      trail.push({ x: pos.x, y: pos.y });
      if (trail.length > TRAIL_LEN) trail.shift();

      for (let i = 1; i < trail.length; i++) {
        const alpha = (i / trail.length) * 0.65;
        const width = (i / trail.length) * 3;
        ctx.beginPath();
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
        ctx.lineTo(trail[i].x, trail[i].y);
        ctx.strokeStyle = `rgba(55, 138, 221, ${alpha})`;
        ctx.lineWidth = width;
        ctx.lineCap = "round";
        ctx.stroke();
      }

      const angle = getAngle(t);
      const deg = (angle * 180 / Math.PI) + 90;

      if (planeGroupRef.current) {
        planeGroupRef.current.setAttribute("transform", `translate(${pos.x}, ${pos.y}) rotate(${deg})`);
      }

      t = (t + SPEED) % 1;
      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // SSE connection
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
                setStarted(true);
                setChecklist(event.checklist);
                setCompleted(event.completed);
              } else if (event.type === "complete") {
                setChecklist(event.checklist);
                setCompleted(event.checklist.map((item) => item.key));
                setExiting(true);
                const plan = event.plan;
                setTimeout(() => {
                  if (!aborted) onCompleteRef.current(plan);
                }, 650);
              } else if (event.type === "error") {
                if (!aborted) onErrorRef.current(event.message);
              }
            } catch {
              // malformed SSE line - skip
            }
          }
        }
      } catch {
        if (!aborted) onErrorRef.current("Network error - check your connection.");
      }
    };

    void run();
    return () => {
      aborted = true;
      reader?.cancel().catch(() => undefined);
    };
  }, [tripId]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: LABEL_PULSE }} />
      <div
        className="fixed inset-0 z-[300] flex items-center justify-center overflow-auto bg-white"
        style={{
          transition: "opacity 0.6s ease-out",
          opacity: exiting ? 0 : 1,
          pointerEvents: exiting ? "none" : "auto",
        }}
        role="status"
        aria-live="polite"
        aria-busy={!exiting}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem 0 2rem", flexDirection: "column", gap: "1.2rem" }}>
          <div style={{ position: "relative", width: 480, height: 280 }}>
            <canvas
              ref={canvasRef}
              width={480}
              height={280}
              style={{ position: "absolute", top: 0, left: 0 }}
            />
            <svg
              width="480"
              height="280"
              viewBox="0 0 480 280"
              style={{ position: "absolute", top: 0, left: 0 }}
            >
              <text
                x="240"
                y="168"
                fontFamily="Georgia, 'Times New Roman', serif"
                fontSize="78"
                fontWeight="700"
                fill="#111111"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                Conci
              </text>
              <g ref={planeGroupRef}>
                <g transform="translate(-14,-14)">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2A1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1l3.5 1v-1.5L13 19v-5.5l8 2.5z"
                      fill="#1a1a1a"
                    />
                  </svg>
                </g>
              </g>
            </svg>
          </div>

          <div
            style={{
              fontFamily: "system-ui, sans-serif",
              fontSize: 13,
              color: "#5F5E5A",
              letterSpacing: "0.3px",
              height: 20,
              textAlign: "center",
              transition: "opacity 0.4s ease",
              opacity: statusVisible ? 1 : 0,
            }}
          >
            {statusText}
          </div>

          <div
            style={{
              fontFamily: "system-ui, sans-serif",
              fontSize: 11,
              letterSpacing: "3px",
              color: "#B4B2A9",
              textAlign: "center",
              animation: "labelPulse 1.6s ease-in-out infinite",
            }}
          >
            BUILDING YOUR TRIP
          </div>

          {/* Checklist keys come from backend progress events. */}
          {checklist.length > 0 ? (
            <div style={{ width: 480, maxWidth: "calc(100vw - 32px)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              {checklist.map(({ key, label }) => {
                const done = completed.includes(key);
                const active = !done && started && checklist.find((item) => !completed.includes(item.key))?.key === key;
                return (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      borderRadius: 12,
                      border: `1px solid ${done ? "rgba(20,184,166,0.35)" : "rgba(15,23,42,0.08)"}`,
                      backgroundColor: done ? "rgba(20,184,166,0.06)" : "transparent",
                      padding: "10px 14px",
                      transition: "border-color 0.35s ease, background-color 0.35s ease",
                    }}
                  >
                    {done ? (
                      <span style={{
                        display: "inline-flex", width: 20, height: 20, borderRadius: "50%",
                        backgroundColor: "#14b8a6", alignItems: "center", justifyContent: "center",
                        color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0,
                      }}>{"\u2713"}</span>
                    ) : active ? (
                      <span
                        className="animate-spin"
                        style={{
                          display: "inline-block", width: 20, height: 20, borderRadius: "50%",
                          border: "2px solid rgba(20,184,166,0.2)", borderTopColor: "#14b8a6",
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <span style={{
                        display: "inline-block", width: 20, height: 20, borderRadius: "50%",
                        border: "1.5px solid rgba(15,23,42,0.12)", flexShrink: 0,
                      }} />
                    )}
                    <span style={{
                      fontFamily: "system-ui, sans-serif",
                      fontSize: 13,
                      fontWeight: 500,
                      color: done ? "#0d9488" : active ? "#374151" : "#94a3b8",
                      transition: "color 0.35s ease",
                    }}>
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
