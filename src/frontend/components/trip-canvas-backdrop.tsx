"use client";

// SVG tile for the drifting contour background — computed once at module level.
const TILE_SVG = [
  "<svg xmlns='http://www.w3.org/2000/svg' width='800' height='800'>",
  // Primary contours — stroke-width 1, opacity 0.08
  "<path d='M0,80 Q200,40 400,90 Q600,140 800,80' stroke='#2563EB' stroke-width='1' fill='none' opacity='0.08'/>",
  "<path d='M0,145 Q300,100 500,155 Q700,205 800,150' stroke='#2563EB' stroke-width='1' fill='none' opacity='0.08'/>",
  "<path d='M0,190 Q150,150 350,195 Q550,245 800,190' stroke='#2563EB' stroke-width='1' fill='none' opacity='0.08'/>",
  "<path d='M0,300 Q250,260 480,310 Q680,360 800,305' stroke='#2563EB' stroke-width='1' fill='none' opacity='0.08'/>",
  "<path d='M0,415 Q200,375 420,420 Q620,470 800,415' stroke='#2563EB' stroke-width='1' fill='none' opacity='0.08'/>",
  "<path d='M0,525 Q180,485 400,530 Q610,580 800,525' stroke='#2563EB' stroke-width='1' fill='none' opacity='0.08'/>",
  "<path d='M0,635 Q220,595 440,640 Q650,690 800,635' stroke='#2563EB' stroke-width='1' fill='none' opacity='0.08'/>",
  "<path d='M0,745 Q200,710 400,750 Q600,795 800,745' stroke='#2563EB' stroke-width='1' fill='none' opacity='0.08'/>",
  // Secondary contours — stroke-width 0.6, opacity 0.05
  "<path d='M0,245 Q200,205 420,250 Q620,295 800,245' stroke='#2563EB' stroke-width='0.6' fill='none' opacity='0.05'/>",
  "<path d='M0,355 Q180,320 380,360 Q580,405 800,355' stroke='#2563EB' stroke-width='0.6' fill='none' opacity='0.05'/>",
  "<path d='M0,465 Q220,430 440,470 Q640,515 800,465' stroke='#2563EB' stroke-width='0.6' fill='none' opacity='0.05'/>",
  "<path d='M0,575 Q200,540 400,580 Q620,625 800,575' stroke='#2563EB' stroke-width='0.6' fill='none' opacity='0.05'/>",
  "<path d='M0,685 Q180,650 380,690 Q600,735 800,685' stroke='#2563EB' stroke-width='0.6' fill='none' opacity='0.05'/>",
  // Vertical ridge lines for depth
  "<path d='M250,0 Q230,200 270,400 Q310,600 250,800' stroke='#2563EB' stroke-width='0.6' fill='none' opacity='0.05'/>",
  "<path d='M560,0 Q540,200 580,400 Q620,600 560,800' stroke='#2563EB' stroke-width='0.6' fill='none' opacity='0.05'/>",
  "</svg>",
].join("");

const TILE_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`;

export function TripCanvasBackdrop() {
  return (
    <>
      <style>{`
        @keyframes atlas-drift {
          from { transform: translate3d(0,0,0); }
          to   { transform: translate3d(-400px,-120px,0); }
        }
        @keyframes compass-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>

      <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none select-none">

        {/* Drifting contour tile */}
        <div
          style={{
            position: "absolute",
            inset: "-200px",
            backgroundImage: TILE_BG,
            backgroundRepeat: "repeat",
            backgroundSize: "800px 800px",
            willChange: "transform",
            animation: "atlas-drift 90s linear infinite",
          }}
        />

        {/* Compass rose — top right, slow rotation */}
        <div
          style={{
            position: "absolute",
            top: "32px",
            right: "32px",
            opacity: 0.45,
            willChange: "transform",
            animation: "compass-spin 180s linear infinite",
          }}
        >
          <svg
            viewBox="0 0 120 120"
            width="120"
            height="120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Outer ring */}
            <circle cx="60" cy="60" r="56" stroke="#2563EB" strokeWidth="0.8" opacity="0.35" />
            {/* Inner ring */}
            <circle cx="60" cy="60" r="44" stroke="#2563EB" strokeWidth="0.8" opacity="0.2" />

            {/* Cardinal ticks — N, E, S, W — longer, opacity 0.6 */}
            <line x1="60"  y1="16"  x2="60"  y2="4"   stroke="#2563EB" strokeWidth="1"   opacity="0.6" />
            <line x1="104" y1="60"  x2="116" y2="60"  stroke="#2563EB" strokeWidth="1"   opacity="0.6" />
            <line x1="60"  y1="104" x2="60"  y2="116" stroke="#2563EB" strokeWidth="1"   opacity="0.6" />
            <line x1="16"  y1="60"  x2="4"   y2="60"  stroke="#2563EB" strokeWidth="1"   opacity="0.6" />

            {/* Intercardinal ticks — NE, SE, SW, NW */}
            <line x1="91.1" y1="28.9" x2="99.6" y2="20.4" stroke="#2563EB" strokeWidth="0.8" opacity="0.4" />
            <line x1="91.1" y1="91.1" x2="99.6" y2="99.6" stroke="#2563EB" strokeWidth="0.8" opacity="0.4" />
            <line x1="28.9" y1="91.1" x2="20.4" y2="99.6" stroke="#2563EB" strokeWidth="0.8" opacity="0.4" />
            <line x1="28.9" y1="28.9" x2="20.4" y2="20.4" stroke="#2563EB" strokeWidth="0.8" opacity="0.4" />

            {/* Minor ticks — every 22.5° between cardinals/intercardinals */}
            <line x1="79.1"  y1="13.8"  x2="81.4"  y2="8.3"   stroke="#2563EB" strokeWidth="0.8" opacity="0.25" />
            <line x1="106.2" y1="40.9"  x2="111.7" y2="38.6"  stroke="#2563EB" strokeWidth="0.8" opacity="0.25" />
            <line x1="106.2" y1="79.1"  x2="111.7" y2="81.4"  stroke="#2563EB" strokeWidth="0.8" opacity="0.25" />
            <line x1="79.1"  y1="106.2" x2="81.4"  y2="111.7" stroke="#2563EB" strokeWidth="0.8" opacity="0.25" />
            <line x1="40.9"  y1="106.2" x2="38.6"  y2="111.7" stroke="#2563EB" strokeWidth="0.8" opacity="0.25" />
            <line x1="13.8"  y1="79.1"  x2="8.3"   y2="81.4"  stroke="#2563EB" strokeWidth="0.8" opacity="0.25" />
            <line x1="13.8"  y1="40.9"  x2="8.3"   y2="38.6"  stroke="#2563EB" strokeWidth="0.8" opacity="0.25" />
            <line x1="40.9"  y1="13.8"  x2="38.6"  y2="8.3"   stroke="#2563EB" strokeWidth="0.8" opacity="0.25" />

            {/* North-pointing arrow */}
            <polygon points="60,20 63.5,32 60,29 56.5,32" fill="#2563EB" opacity="0.8" />

            {/* N label */}
            <text
              x="60"
              y="3"
              fontFamily="JetBrains Mono, ui-monospace, monospace"
              fontSize="9"
              fill="#2563EB"
              opacity="0.7"
              textAnchor="middle"
              dominantBaseline="hanging"
            >
              N
            </text>
          </svg>
        </div>

        {/* Lat/long corner ticks */}
        <span className="absolute left-8 top-8 font-mono text-[10px] tracking-widest opacity-60 text-[color:var(--sage)]">
          35°N · 139°E
        </span>
        <span className="absolute bottom-8 right-8 font-mono text-[10px] tracking-widest opacity-60 text-[color:var(--sage)]">
          40°N · 14°E
        </span>
        <span className="absolute bottom-8 left-8 font-mono text-[10px] tracking-widest opacity-60 text-[color:var(--sage)]">
          46°N · 8°E
        </span>

      </div>
    </>
  );
}
