"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";
import * as topojson from "topojson-client";

// Import map data directly. Next.js handles JSON imports.
import mapData from "world-atlas/countries-110m.json";

const N_POINTS = [
  { lat: 48.8566, lng: 2.3522, name: "Paris" },
  { lat: 40.7128, lng: -74.0060, name: "New York" },
  { lat: 35.6762, lng: 139.6503, name: "Tokyo" },
  { lat: -33.8688, lng: 151.2093, name: "Sydney" },
  { lat: 25.2048, lng: 55.2708, name: "Dubai" },
  { lat: -22.9068, lng: -43.1729, name: "Rio" },
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
  const popupRefs = useRef<(HTMLDivElement | null)[]>([]);
  
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [projection] = useState(() => d3.geoOrthographic().rotate([-20, -20]));

  const worldGeoJson = useMemo(() => {
    // Switch to objects.land to avoid drawing 177 separate country borders! Massive perf boost.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return topojson.feature(mapData as any, (mapData as any).objects.land || (mapData as any).objects.countries);
  }, []);

  // Pre-compute geometries to avoid allocating objects on every animation frame
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

  // Intersection Observer to pause rendering when off-screen
  useEffect(() => {
    if (!containerRef.current) return;
    const io = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting);
    });
    io.observe(containerRef.current);
    return () => io.disconnect();
  }, []);

  // Handle Resize
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        setDimensions({ width, height });
        projection
          .translate([width / 2, height / 2])
          .scale((Math.min(width, height) / 2) - 4); // 4px padding
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [projection]);

  // D3 Render Loop and Drag Interaction
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0 || !isVisible) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const path = d3.geoPath(projection, context);

    let isDragging = false;
    const rotationVelocity = 0.15; // Auto rotation speed
    let animationFrameId: number;

    // Drag behavior setup
    const dragBehavior = d3.drag<HTMLCanvasElement, unknown>()
      .on("start", () => {
        isDragging = true;
      })
      .on("drag", (event) => {
        const rotate = projection.rotate();
        const k = 40 / projection.scale();
        projection.rotate([
          rotate[0] + event.dx * k,
          rotate[1] - event.dy * k,
          rotate[2]
        ]);
      })
      .on("end", () => {
        isDragging = false;
      });

    d3.select(canvas).call(dragBehavior);

    // High performance render loop
    function render() {
      if (!context) return;
      
      context.clearRect(0, 0, dimensions.width, dimensions.height);

      if (!isDragging) {
        const rotate = projection.rotate();
        projection.rotate([rotate[0] + rotationVelocity, rotate[1], rotate[2]]);
      }

      // 1. Draw Sphere Background (Ocean)
      context.beginPath();
      path({ type: "Sphere" });
      context.fillStyle = "#1c1c17"; // Rich dark ocean matching branding
      context.fill();
      context.lineWidth = 1;
      context.strokeStyle = "rgba(255, 255, 255, 0.05)";
      context.stroke();

      // 2. Draw Graticule
      context.beginPath();
      path(graticuleGeoJson);
      context.lineWidth = 0.5;
      context.strokeStyle = "rgba(255, 255, 255, 0.03)";
      context.stroke();

      // 3. Draw Landmasses
      context.beginPath();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      path(worldGeoJson as any);
      context.fillStyle = "#2a2a23"; // Solid dark sage/brown landmass
      context.fill();
      context.lineWidth = 0.5;
      context.strokeStyle = "#3f3f35"; // Clean crisp borders
      context.stroke();

      // 4. Draw Arcs (Flight routes)
      context.beginPath();
      arcsGeoJson.forEach(arc => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        path(arc as any);
      });
      context.lineWidth = 1.5;
      context.strokeStyle = "#9b9d82"; // approximate sage color
      context.setLineDash([4, 4]);
      context.stroke();
      context.setLineDash([]); // Reset

      // 5. Update HTML Popups directly (bypasses React state overhead)
      const centerLngLat = projection.invert?.([dimensions.width / 2, dimensions.height / 2]) || [0, 0];
      
      N_POINTS.forEach((pt, i) => {
        const el = popupRefs.current[i];
        if (!el) return;
        
        const coords = projection([pt.lng, pt.lat]);
        const distance = d3.geoDistance([pt.lng, pt.lat], centerLngLat);
        const isVisible = distance < Math.PI / 2;

        if (coords) {
          el.style.transform = `translate(${coords[0]}px, ${coords[1]}px) translate(-50%, -50%)`;
          el.style.opacity = isVisible ? "1" : "0";
          el.style.pointerEvents = isVisible ? "auto" : "none";
          el.style.zIndex = isVisible ? "10" : "-1";
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
      {/* 3D Sphere shadow effect behind canvas */}
      <div className="absolute inset-4 rounded-full shadow-[inset_-20px_-20px_60px_rgba(0,0,0,0.1),0_20px_40px_rgba(0,0,0,0.05)] dark:shadow-[inset_-30px_-30px_60px_rgba(0,0,0,0.8),0_20px_40px_rgba(0,0,0,0.3)] pointer-events-none" />

      {/* D3 Canvas Layer */}
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-full rounded-full cursor-grab active:cursor-grabbing"
      />

      {/* 3D Sphere glare/highlight effect over canvas */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/20 to-transparent dark:from-white/10 mix-blend-overlay pointer-events-none" />

      {/* HTML Popups Layer */}
      <div className="absolute left-0 top-0 w-full h-full pointer-events-none">
        {N_POINTS.map((popup, i) => (
          <div
            key={popup.name}
            ref={(el) => {
              popupRefs.current[i] = el;
            }}
            className="absolute left-0 top-0 transition-opacity duration-150"
            style={{ opacity: 0 }}
          >
            <div className="group relative flex items-center justify-center pointer-events-auto cursor-pointer">
              {/* Dot */}
              <div className="w-2 h-2 rounded-full bg-[color:var(--sage)] shadow-[0_0_10px_var(--sage)] transition-transform duration-300 group-hover:scale-[2]" />
              
              {/* Animated Outer Pulse */}
              <div className="absolute w-6 h-6 rounded-full bg-[color:var(--sage)] opacity-20 animate-pulse pointer-events-none" />
              
              {/* Label / Tooltip */}
              <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 rounded-full bg-[#1c1c17]/90 px-3 py-1.5 text-[12px] font-semibold tracking-wide text-white shadow-[var(--shadow-ambient-md)] backdrop-blur-md dark:bg-white/95 dark:text-[#1c1c17] opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-[-10px] group-hover:translate-x-0 whitespace-nowrap">
                <span className="flex h-1.5 w-1.5 rounded-full bg-[color:var(--sage)]"></span>
                {popup.name}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
