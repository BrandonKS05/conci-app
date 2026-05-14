"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";
import * as topojson from "topojson-client";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

// Import map data directly. Next.js handles JSON imports.
import mapData from "world-atlas/countries-110m.json";

type Destination = {
  lat: number;
  lng: number;
  name: string;
  country: string;
  image: string;
  bestTime: string;
  avgCost: string;
  highlights: string[];
  funFact: string;
};

const N_POINTS: Destination[] = [
  {
    lat: 48.8566, lng: 2.3522,
    name: "Paris", country: "France",
    image: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=600&q=80&fit=crop",
    bestTime: "Apr – Jun · Sep – Oct",
    avgCost: "$2,400 / person",
    highlights: ["Eiffel Tower", "Louvre Museum", "Montmartre cafés"],
    funFact: "Paris has over 1,800 bakeries and more Michelin stars than any other city.",
  },
  {
    lat: 40.7128, lng: -74.0060,
    name: "New York", country: "United States",
    image: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=600&q=80&fit=crop",
    bestTime: "Sep – Nov · Apr – Jun",
    avgCost: "$2,800 / person",
    highlights: ["Central Park", "Brooklyn Bridge", "Chelsea food scene"],
    funFact: "NYC has 468 subway stations — more than any other city on Earth.",
  },
  {
    lat: 35.6762, lng: 139.6503,
    name: "Tokyo", country: "Japan",
    image: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=600&q=80&fit=crop",
    bestTime: "Mar – May · Oct – Nov",
    avgCost: "$3,100 / person",
    highlights: ["Shibuya Crossing", "Tsukiji Market", "Shinjuku nightlife"],
    funFact: "Tokyo has more Michelin-starred restaurants than Paris, London, and NYC combined.",
  },
  {
    lat: -33.8688, lng: 151.2093,
    name: "Sydney", country: "Australia",
    image: "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=600&q=80&fit=crop",
    bestTime: "Sep – Nov · Mar – May",
    avgCost: "$3,600 / person",
    highlights: ["Bondi Beach", "Opera House", "Blue Mountains day trip"],
    funFact: "Sydney Harbour holds about 562 gigalitres of water — enough to fill 225,000 Olympic pools.",
  },
  {
    lat: 25.2048, lng: 55.2708,
    name: "Dubai", country: "UAE",
    image: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=600&q=80&fit=crop",
    bestTime: "Nov – Mar",
    avgCost: "$2,200 / person",
    highlights: ["Burj Khalifa", "Desert safari", "Gold Souk"],
    funFact: "Dubai has no income tax — and is home to the world's largest gold ring.",
  },
  {
    lat: -22.9068, lng: -43.1729,
    name: "Rio de Janeiro", country: "Brazil",
    image: "https://images.unsplash.com/photo-1483729558449-99ef09a8c325?w=600&q=80&fit=crop",
    bestTime: "Dec – Mar (Carnival!)",
    avgCost: "$1,600 / person",
    highlights: ["Christ the Redeemer", "Ipanema Beach", "Lapa nightlife"],
    funFact: "Rio's Carnival is the world's biggest party — 2 million people take to the streets every day.",
  },
];

const ARCS = [
  { startLat: 40.7128, startLng: -74.0060, endLat: 48.8566, endLng: 2.3522 },
  { startLat: 48.8566, startLng: 2.3522, endLat: 25.2048, endLng: 55.2708 },
  { startLat: 25.2048, startLng: 55.2708, endLat: 35.6762, endLng: 139.6503 },
  { startLat: 35.6762, startLng: 139.6503, endLat: -33.8688, endLng: 151.2093 },
  { startLat: 40.7128, startLng: -74.0060, endLat: -22.9068, endLng: -43.1729 }
];

export function LandingGlobe() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [projection] = useState(() => d3.geoOrthographic().rotate([-20, -20]));
  const [selected, setSelected] = useState<Destination | null>(null);

  const worldGeoJson = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return topojson.feature(mapData as any, (mapData as any).objects.land || (mapData as any).objects.countries);
  }, []);

  const graticuleGeoJson = useMemo(() => d3.geoGraticule10(), []);
  const arcsGeoJson = useMemo(() => {
    return ARCS.map(arc => ({
      type: "LineString",
      coordinates: [
        [arc.startLng, arc.startLat],
        [arc.endLng, arc.endLat]
      ]
    })) as d3.GeoGeometryObjects[];
  }, []);

  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;
    const io = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting);
    });
    io.observe(containerRef.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        setDimensions({ width, height });
        projection
          .translate([width / 2, height / 2])
          .scale((Math.min(width, height) / 2) - 4);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [projection]);

  // Click handler: find nearest visible city using scaled canvas coordinates
  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // Scale from CSS px -> canvas px to handle high-DPI / CSS sizing
    const scaleX = dimensions.width / rect.width;
    const scaleY = dimensions.height / rect.height;
    const mx = (event.clientX - rect.left) * scaleX;
    const my = (event.clientY - rect.top) * scaleY;

    const centerLngLat = projection.invert?.([dimensions.width / 2, dimensions.height / 2]) || [0, 0];
    const THRESHOLD = 36;
    let closest: Destination | null = null;
    let closestDist = Infinity;

    N_POINTS.forEach(pt => {
      const distance = d3.geoDistance([pt.lng, pt.lat], centerLngLat);
      if (distance >= Math.PI / 2) return;
      const coords = projection([pt.lng, pt.lat]);
      if (!coords) return;
      const dx = coords[0] - mx;
      const dy = coords[1] - my;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < THRESHOLD && dist < closestDist) {
        closestDist = dist;
        closest = pt;
      }
    });

    if (closest) setSelected(closest);
    else setSelected(null);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0 || !isVisible) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const path = d3.geoPath(projection, context);

    let isDragging = false;
    const rotationVelocity = 0.12;
    let animationFrameId: number;

    const dragBehavior = d3.drag<HTMLCanvasElement, unknown>()
      .on("start", () => { isDragging = true; })
      .on("drag", (event) => {
        const rotate = projection.rotate();
        const k = 40 / projection.scale();
        projection.rotate([
          rotate[0] + event.dx * k,
          rotate[1] - event.dy * k,
          rotate[2]
        ]);
      })
      .on("end", () => { isDragging = false; });

    d3.select(canvas).call(dragBehavior);

    function render() {
      if (!context) return;
      context.clearRect(0, 0, dimensions.width, dimensions.height);

      if (!isDragging) {
        const rotate = projection.rotate();
        projection.rotate([rotate[0] + rotationVelocity, rotate[1], rotate[2]]);
      }

      // 1. Ocean
      context.beginPath();
      path({ type: "Sphere" });
      context.fillStyle = "#050505";
      context.fill();
      context.lineWidth = 1;
      context.strokeStyle = "rgba(255, 255, 255, 0.06)";
      context.stroke();

      // 2. Graticule
      context.beginPath();
      path(graticuleGeoJson);
      context.lineWidth = 0.4;
      context.strokeStyle = "rgba(255, 255, 255, 0.025)";
      context.stroke();

      // 3. Landmasses
      context.beginPath();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      path(worldGeoJson as any);
      context.fillStyle = "#151515";
      context.fill();
      context.lineWidth = 0.5;
      context.strokeStyle = "rgba(255, 255, 255, 0.18)";
      context.stroke();

      // 4. Arcs
      context.beginPath();
      arcsGeoJson.forEach(arc => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        path(arc as any);
      });
      context.lineWidth = 1;
      context.strokeStyle = "rgba(37, 99, 235, 0.25)";
      context.setLineDash([3, 5]);
      context.stroke();
      context.setLineDash([]);

      // 5. Animated flights
      const time = Date.now();
      path.pointRadius(3.5);
      context.beginPath();
      ARCS.forEach((arc, i) => {
        const t = ((time + i * 1400) % 4200) / 4200;
        const interp = d3.geoInterpolate([arc.startLng, arc.startLat], [arc.endLng, arc.endLat]);
        path({ type: "Point", coordinates: interp(t) });
      });
      context.fillStyle = "rgba(37, 99, 235, 0.35)";
      context.fill();

      path.pointRadius(1.8);
      context.beginPath();
      ARCS.forEach((arc, i) => {
        const t = ((time + i * 1400) % 4200) / 4200;
        const interp = d3.geoInterpolate([arc.startLng, arc.startLat], [arc.endLng, arc.endLat]);
        path({ type: "Point", coordinates: interp(t) });
      });
      context.fillStyle = "#93C5FD";
      context.fill();

      // 6. Update dot positions
      const centerLngLat = projection.invert?.([dimensions.width / 2, dimensions.height / 2]) || [0, 0];
      N_POINTS.forEach((pt, i) => {
        const el = dotRefs.current[i];
        if (!el) return;
        const coords = projection([pt.lng, pt.lat]);
        const distance = d3.geoDistance([pt.lng, pt.lat], centerLngLat);
        const visible = distance < Math.PI / 2;
        if (coords) {
          el.style.transform = `translate(${coords[0]}px, ${coords[1]}px) translate(-50%, -50%)`;
          el.style.opacity = visible ? "1" : "0";
          el.style.pointerEvents = visible ? "auto" : "none";
          el.style.zIndex = visible ? "10" : "-1";
        }
      });

      animationFrameId = requestAnimationFrame(render);
    }

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      d3.select(canvas).on(".drag", null);
    };
  }, [dimensions, projection, worldGeoJson, graticuleGeoJson, arcsGeoJson, isVisible]);

  return (
    <div
      ref={containerRef}
      className="relative mx-auto flex aspect-square w-full max-w-[320px] items-center justify-center sm:max-w-[420px] lg:max-w-[500px]"
    >
      {/* Shadow */}
      <div className="absolute inset-4 rounded-full shadow-[inset_-20px_-20px_60px_rgba(0,0,0,0.1),0_20px_40px_rgba(0,0,0,0.05)] dark:shadow-[inset_-30px_-30px_60px_rgba(0,0,0,0.8),0_20px_40px_rgba(0,0,0,0.3)] pointer-events-none" />

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-full rounded-full cursor-pointer active:cursor-grabbing"
        onClick={handleCanvasClick}
      />

      {/* Glare */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/20 to-transparent dark:from-white/10 mix-blend-overlay pointer-events-none" />

      {/* City Dots */}
      <div className="absolute left-0 top-0 w-full h-full pointer-events-none">
        {N_POINTS.map((pt, i) => (
          <div
            key={pt.name}
            ref={(el) => { dotRefs.current[i] = el; }}
            className="absolute left-0 top-0 transition-opacity duration-150"
            style={{ opacity: 0 }}
          >
            <button
              onClick={() => setSelected(pt)}
              className="group relative flex items-center justify-center pointer-events-auto cursor-pointer focus:outline-none"
              aria-label={`Explore ${pt.name}`}
            >
              {/* Core dot */}
              <div className={`w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(37,99,235,0.8)] transition-transform duration-200 group-hover:scale-150 ${selected?.name === pt.name ? "bg-blue-400 scale-125" : "bg-blue-500"}`} />
              {/* Sonar ring */}
              <div className="absolute w-7 h-7 rounded-full bg-blue-500 opacity-15 animate-ping pointer-events-none" />
              {/* Hover label */}
              <div className="absolute left-4 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-[#050505]/90 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none dark:bg-white/90 dark:text-neutral-900">
                {pt.name}
              </div>
            </button>
          </div>
        ))}
      </div>

      {/* Destination Info Card */}
      <AnimatePresence>
        {selected && (
          <motion.div
            key={selected.name}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="absolute bottom-4 left-4 right-4 z-30 overflow-hidden rounded-2xl shadow-2xl"
          >
            {/* Hero image */}
            <div className="relative h-28 w-full overflow-hidden">
              <img
                src={selected.image}
                alt={selected.name}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/40 to-transparent" />
              {/* Close */}
              <button
                onClick={(e) => { e.stopPropagation(); setSelected(null); }}
                className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white/80 text-xs hover:bg-black/70 transition-colors"
                aria-label="Close"
              >✕</button>
              {/* City/country header overlaid on image */}
              <div className="absolute bottom-3 left-3">
                <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-white/60">{selected.country}</p>
                <h3 className="font-display text-xl font-semibold text-white leading-tight">{selected.name}</h3>
              </div>
            </div>

            {/* Info body */}
            <div className="bg-[#0a0a0a] px-4 py-3">
              {/* Quick stats row */}
              <div className="flex items-center gap-4 border-b border-white/8 pb-3 mb-3">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.14em] text-white/40">Best time</p>
                  <p className="text-[12px] font-semibold text-white mt-0.5">{selected.bestTime}</p>
                </div>
                <div className="h-8 w-px bg-white/8" />
                <div>
                  <p className="text-[9px] uppercase tracking-[0.14em] text-white/40">Avg cost</p>
                  <p className="text-[12px] font-semibold text-blue-400 mt-0.5">{selected.avgCost}</p>
                </div>
              </div>

              {/* Highlights */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {selected.highlights.map((h) => (
                  <span key={h} className="rounded-full bg-white/8 px-2.5 py-1 text-[10px] font-medium text-white/70">
                    {h}
                  </span>
                ))}
              </div>

              {/* Fun fact */}
              <p className="text-[11px] leading-relaxed text-white/50 mb-3 italic">
                💡 {selected.funFact}
              </p>

              {/* CTA */}
              <Link
                href={`/trip-parser?q=${encodeURIComponent(selected.name)}`}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                Start planning {selected.name} <span aria-hidden="true">→</span>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hint text when nothing selected */}
      {!selected && (
        <div className="absolute bottom-2 left-0 right-0 flex justify-center pointer-events-none">
          <span className="rounded-full bg-black/40 px-3 py-1 text-[10px] font-medium uppercase tracking-widest text-white/40 backdrop-blur-sm dark:bg-white/5">
            Click a city to explore
          </span>
        </div>
      )}
    </div>
  );
}
