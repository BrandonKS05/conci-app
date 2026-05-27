"use client";

import { useEffect, useRef } from "react";
import { Plane } from "lucide-react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";

type Point = { x: number; y: number };
type Ctrl = { stop(): void; pause?(): void; play?(): void };
const f = (n: number) => n.toFixed(1);

// --- Live anchor resolution ---

// Place anchors across the globe's viewport area by reading the container's live rect.
// The THREE.js globe is canvas-only, so we scatter points over the sphere face
// at roughly where the city dots live (Americas-facing orientation).
function globeAreaAnchors(): Point[] {
  // The globe wrapper has aspect-square; grab the first one on the page
  const container = document.querySelector<HTMLElement>('[class*="aspect-square"]');
  if (!container) return [];
  const r = container.getBoundingClientRect();
  if (r.width === 0) return [];
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const rad = r.width * 0.38; // inner sphere radius ≈ 38% of container width
  return [
    { x: cx - rad * 0.28, y: cy - rad * 0.22 }, // North America / NYC
    { x: cx - rad * 0.50, y: cy + rad * 0.08 }, // Caribbean / Gulf
    { x: cx - rad * 0.12, y: cy + rad * 0.42 }, // South America / Rio
    { x: cx + rad * 0.18, y: cy - rad * 0.38 }, // North Atlantic / Europe edge
    { x: cx - rad * 0.08, y: cy - rad * 0.08 }, // Globe center
  ];
}

// Read heading positions for "landing on words" effect
function textAnchors(): Point[] {
  const selectors = [
    "h1",          // "Get the Trip out of the Group Chat."
    "h2",          // "Start a trip instantly."
    "#example h2", // "What you get back"
  ];
  const pts: Point[] = [];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      const r = el.getBoundingClientRect();
      // Only include if visible in or near the viewport
      if (r.bottom > -200 && r.top < window.innerHeight + 200) {
        pts.push({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      }
    }
  }
  return pts;
}

// --- Path shape generators ---
// All shapes keep vertical motion small — "more horizontal like a real flight"

// Gentle reverse-U arch: symmetric peak above midpoint
function flatArch(a: Point, b: Point): string {
  const dx = b.x - a.x;
  const h = Math.abs(dx) * 0.1 + Math.abs(b.y - a.y) * 0.08;
  const cy = (a.y + b.y) / 2 - h;
  const ox = dx * 0.33;
  return `M${f(a.x)},${f(a.y)} C${f(a.x + ox)},${f(cy)} ${f(b.x - ox)},${f(cy)} ${f(b.x)},${f(b.y)}`;
}

// S-bank (climb then dive): CP1 pushes up from start, CP2 pushes down toward end
function sBankClimb(a: Point, b: Point): string {
  const dx = b.x - a.x;
  const h = Math.abs(dx) * 0.13;
  return `M${f(a.x)},${f(a.y)} C${f(a.x + dx * 0.38)},${f(a.y - h)} ${f(b.x - dx * 0.38)},${f(b.y + h)} ${f(b.x)},${f(b.y)}`;
}

// S-bank (dive then climb): CP1 pushes down, CP2 pushes up
function sBankDive(a: Point, b: Point): string {
  const dx = b.x - a.x;
  const h = Math.abs(dx) * 0.13;
  return `M${f(a.x)},${f(a.y)} C${f(a.x + dx * 0.38)},${f(a.y + h)} ${f(b.x - dx * 0.38)},${f(b.y - h)} ${f(b.x)},${f(b.y)}`;
}

// Chandelle: steep climb off the mark, then level glide approach
function chandelle(a: Point, b: Point): string {
  const dx = b.x - a.x;
  const rise = Math.abs(dx) * 0.2;
  return `M${f(a.x)},${f(a.y)} C${f(a.x + dx * 0.14)},${f(a.y - rise)} ${f(b.x - dx * 0.42)},${f(b.y - rise * 0.06)} ${f(b.x)},${f(b.y)}`;
}

// Glide-in: flat departure, then nose-down approach into the destination
function glideIn(a: Point, b: Point): string {
  const dx = b.x - a.x;
  const drop = Math.abs(dx) * 0.2;
  return `M${f(a.x)},${f(a.y)} C${f(a.x + dx * 0.42)},${f(a.y - drop * 0.06)} ${f(b.x - dx * 0.14)},${f(b.y - drop)} ${f(b.x)},${f(b.y)}`;
}

const SHAPES = [flatArch, sBankClimb, sBankDive, chandelle, glideIn];

// --- Component ---

export function PlaneFly() {
  const svgPathRef = useRef<SVGPathElement>(null);
  const progress = useMotionValue(0);
  const opacity = useMotionValue(0);

  // All position math runs inside Framer Motion's scheduler — zero React re-renders per frame
  const x = useTransform(progress, (p) => {
    const path = svgPathRef.current;
    if (!path) return -100;
    const len = path.getTotalLength();
    return len > 0 ? path.getPointAtLength(p * len).x : -100;
  });
  const y = useTransform(progress, (p) => {
    const path = svgPathRef.current;
    if (!path) return -100;
    const len = path.getTotalLength();
    return len > 0 ? path.getPointAtLength(p * len).y : -100;
  });
  const rotate = useTransform(progress, (p) => {
    const path = svgPathRef.current;
    if (!path) return 0;
    const len = path.getTotalLength();
    if (len === 0) return 0;
    const d = p * len;
    const eps = Math.min(2, len * 0.005);
    const pt = path.getPointAtLength(d);
    const pt2 = path.getPointAtLength(Math.min(d + eps, len));
    return Math.atan2(pt2.y - pt.y, pt2.x - pt.x) * (180 / Math.PI);
  });

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let raf: number | null = null;
    let flightCtrl: Ctrl | null = null;
    let opacityCtrl: Ctrl | null = null;
    let paused = false;

    function scheduleNext() {
      timeout = setTimeout(fly, 8000 + Math.random() * 7000);
    }

    function fly() {
      if (raf !== null) cancelAnimationFrame(raf);

      const dots = globeAreaAnchors();
      const text = textAnchors();
      // Prefer at least one dot anchor so it feels like it's leaving/arriving at the globe
      const allAnchors = [...dots, ...text];
      if (allAnchors.length < 2) { scheduleNext(); return; }

      // Pick start from globe anchors if available, biasing toward globe→word flights
      const pool = dots.length > 0 ? dots : allAnchors;
      const si = Math.floor(Math.random() * pool.length);
      const a = pool[si];

      // End anchor: different from start, prefer different group (globe→text or text→globe)
      const endPool = allAnchors.filter((p) => p !== a && (Math.hypot(p.x - a.x, p.y - a.y) > 80));
      if (endPool.length === 0) { scheduleNext(); return; }
      const b = endPool[Math.floor(Math.random() * endPool.length)];

      const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
      const d = shape(a, b);

      raf = requestAnimationFrame(() => {
        raf = null;
        const svgPath = svgPathRef.current;
        if (!svgPath) return;

        svgPath.setAttribute("d", d);
        if (svgPath.getTotalLength() === 0) { scheduleNext(); return; }

        progress.set(0);

        opacityCtrl?.stop();
        opacityCtrl = animate(opacity, 0.32, { duration: 0.45 });

        flightCtrl?.stop();
        flightCtrl = animate(progress, 1, {
          duration: 4 + Math.random() * 4,
          ease: [0.2, 0, 0.8, 1],
          onComplete: () => {
            opacityCtrl?.stop();
            opacityCtrl = animate(opacity, 0, { duration: 0.45 });
            scheduleNext();
          },
        });
      });
    }

    const onVisibility = () => {
      if (document.hidden) { flightCtrl?.pause?.(); paused = true; }
      else if (paused) { flightCtrl?.play?.(); paused = false; }
    };

    document.addEventListener("visibilitychange", onVisibility);
    timeout = setTimeout(fly, 1800);

    return () => {
      if (timeout) clearTimeout(timeout);
      if (raf !== null) cancelAnimationFrame(raf);
      flightCtrl?.stop();
      opacityCtrl?.stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[35] hidden md:block"
      aria-hidden="true"
    >
      {/* visibility:hidden keeps layout intact while allowing getTotalLength() */}
      <svg
        className="absolute inset-0 h-full w-full overflow-visible"
        style={{ visibility: "hidden" }}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path ref={svgPathRef} d="" fill="none" stroke="none" />
      </svg>

      <motion.div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          x,
          y,
          rotate,
          opacity,
          willChange: "transform",
        }}
      >
        <div style={{ transform: "translate(-50%, -50%)" }}>
          <Plane size={20} color="#2563EB" strokeWidth={1.5} fill="#2563EB" />
        </div>
      </motion.div>
    </div>
  );
}
