"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as d3 from "d3";
import * as topojson from "topojson-client";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";

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
  { lat: 48.8566, lng: 2.3522, name: "Paris", country: "France", image: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=600&q=80&fit=crop", bestTime: "Apr – Jun · Sep – Oct", avgCost: "$2,400 / person", highlights: ["Eiffel Tower", "Louvre Museum", "Montmartre cafés"], funFact: "Paris has over 1,800 bakeries and more Michelin stars than any other city." },
  { lat: 40.7128, lng: -74.0060, name: "New York", country: "United States", image: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=600&q=80&fit=crop", bestTime: "Sep – Nov · Apr – Jun", avgCost: "$2,800 / person", highlights: ["Central Park", "Brooklyn Bridge", "Chelsea food scene"], funFact: "NYC has 468 subway stations — more than any other city on Earth." },
  { lat: 35.6762, lng: 139.6503, name: "Tokyo", country: "Japan", image: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=600&q=80&fit=crop", bestTime: "Mar – May · Oct – Nov", avgCost: "$3,100 / person", highlights: ["Shibuya Crossing", "Tsukiji Market", "Shinjuku nightlife"], funFact: "Tokyo has more Michelin-starred restaurants than Paris, London, and NYC combined." },
  { lat: -33.8688, lng: 151.2093, name: "Sydney", country: "Australia", image: "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=600&q=80&fit=crop", bestTime: "Sep – Nov · Mar – May", avgCost: "$3,600 / person", highlights: ["Bondi Beach", "Opera House", "Blue Mountains day trip"], funFact: "Sydney Harbour holds about 562 gigalitres of water — enough to fill 225,000 Olympic pools." },
  { lat: 25.2048, lng: 55.2708, name: "Dubai", country: "UAE", image: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=600&q=80&fit=crop", bestTime: "Nov – Mar", avgCost: "$2,200 / person", highlights: ["Burj Khalifa", "Desert safari", "Gold Souk"], funFact: "Dubai has no income tax — and is home to the world's largest gold ring." },
  { lat: -22.9068, lng: -43.1729, name: "Rio de Janeiro", country: "Brazil", image: "https://images.unsplash.com/photo-1483729558449-99ef09a8c325?w=600&q=80&fit=crop", bestTime: "Dec – Mar (Carnival!)", avgCost: "$1,600 / person", highlights: ["Christ the Redeemer", "Ipanema Beach", "Lapa nightlife"], funFact: "Rio's Carnival is the world's biggest party — 2 million people take to the streets every day." },
  { lat: 51.5074, lng: -0.1278, name: "London", country: "United Kingdom", image: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=600&q=80&fit=crop", bestTime: "May – Sep", avgCost: "$2,600 / person", highlights: ["Tower Bridge", "British Museum", "West End shows"], funFact: "Big Ben is actually the name of the bell, not the clock tower." },
  { lat: 41.9028, lng: 12.4964, name: "Rome", country: "Italy", image: "https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=600&q=80&fit=crop", bestTime: "Apr – Jun · Sep – Oct", avgCost: "$2,100 / person", highlights: ["Colosseum", "Vatican City", "Trevi Fountain"], funFact: "Modern Rome has 280 fountains and more than 900 churches." },
  { lat: -8.4095, lng: 115.1889, name: "Bali", country: "Indonesia", image: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=600&q=80&fit=crop", bestTime: "Apr – Oct", avgCost: "$1,500 / person", highlights: ["Ubud Monkey Forest", "Seminyak beaches", "Uluwatu Temple"], funFact: "Bali relies on a unique 9th-century water management system called Subak." },
  { lat: -33.9249, lng: 18.4241, name: "Cape Town", country: "South Africa", image: "https://images.unsplash.com/photo-1580060839134-75a5edca2e99?w=600&q=80&fit=crop", bestTime: "Oct – Apr", avgCost: "$1,800 / person", highlights: ["Table Mountain", "Cape Point", "Boulders Beach penguins"], funFact: "Table Mountain is one of the oldest mountains in the world." },
  { lat: 21.3069, lng: -157.8583, name: "Honolulu", country: "United States", image: "https://images.unsplash.com/photo-1542259009477-d625272157b7?w=600&q=80&fit=crop", bestTime: "Sep – Nov", avgCost: "$3,200 / person", highlights: ["Waikiki Beach", "Pearl Harbor", "Diamond Head crater"], funFact: "Honolulu is the only U.S. city to have a royal palace." },
  { lat: 41.0082, lng: 28.9784, name: "Istanbul", country: "Turkey", image: "https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=600&q=80&fit=crop", bestTime: "Mar – May · Sep – Nov", avgCost: "$1,400 / person", highlights: ["Hagia Sophia", "Grand Bazaar", "Bosphorus cruise"], funFact: "Istanbul is the only city in the world situated on two continents." }
];

const ARCS = [
  { startLat: 40.7128, startLng: -74.0060, endLat: 48.8566, endLng: 2.3522 },
  { startLat: 48.8566, startLng: 2.3522, endLat: 25.2048, endLng: 55.2708 },
  { startLat: 25.2048, startLng: 55.2708, endLat: 35.6762, endLng: 139.6503 },
  { startLat: 35.6762, startLng: 139.6503, endLat: -33.8688, endLng: 151.2093 },
  { startLat: 40.7128, startLng: -74.0060, endLat: -22.9068, endLng: -43.1729 },
  { startLat: 51.5074, startLng: -0.1278, endLat: 41.9028, endLng: 12.4964 },
  { startLat: 48.8566, startLng: 2.3522, endLat: -33.9249, endLng: 18.4241 },
  { startLat: 35.6762, startLng: 139.6503, endLat: -8.4095, endLng: 115.1889 },
  { startLat: -33.8688, startLng: 151.2093, endLat: 21.3069, endLng: -157.8583 },
  { startLat: 41.9028, startLng: 12.4964, endLat: 41.0082, endLng: 28.9784 },
];

const GLOBE_COLORS = {
  ocean: "#2563EB",
  oceanDeep: "#2563EB",
  land: "#22C55E",
  landDeep: "#15803D",
  route: "#93C5FD",
  routeGlow: "rgba(147, 197, 253, 0.35)",
  dot: "#F97316",
  dotSoft: "#FDBA74",
  dotGlow: "rgba(249, 115, 22, 0.82)",
  grid: "rgba(255, 255, 255, 0.14)",
  coast: "rgba(255, 255, 255, 0.24)",
};

const FALLBACK_GLOBE_COLORS = {
  ocean: "#4F7FE8",
  oceanDeep: "#2F5FBE",
  land: "#57B87C",
  landDeep: "#2F8F55",
  routeGlow: "rgba(96, 165, 250, 0.22)",
  dot: "#F59E0B",
  dotSoft: "#FCD34D",
  dotGlow: "rgba(245, 158, 11, 0.56)",
  grid: "rgba(255, 255, 255, 0.1)",
  coast: "rgba(255, 255, 255, 0.18)",
};

function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function generateEarthTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const projection = d3.geoEquirectangular().translate([1024, 512]).scale(325.95);
  const path = d3.geoPath(projection, context);

  // Ocean
  const oceanGradient = context.createLinearGradient(0, 0, 2048, 1024);
  oceanGradient.addColorStop(0, GLOBE_COLORS.ocean);
  oceanGradient.addColorStop(1, GLOBE_COLORS.oceanDeep);
  context.fillStyle = oceanGradient;
  context.fillRect(0, 0, 2048, 1024);

  // Graticule
  context.beginPath();
  path(d3.geoGraticule10());
  context.lineWidth = 1;
  context.strokeStyle = GLOBE_COLORS.grid;
  context.stroke();

  // Landmasses
  context.beginPath();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  path(topojson.feature(mapData as any, (mapData as any).objects.land || (mapData as any).objects.countries) as any);
  const landGradient = context.createLinearGradient(0, 0, 2048, 1024);
  landGradient.addColorStop(0, GLOBE_COLORS.land);
  landGradient.addColorStop(1, GLOBE_COLORS.landDeep);
  context.fillStyle = landGradient;
  context.fill();
  context.lineWidth = 1.5;
  context.strokeStyle = GLOBE_COLORS.coast;
  context.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function generateHaloTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, "rgba(37, 99, 235, 0.44)");
  gradient.addColorStop(0.45, "rgba(34, 197, 94, 0.18)");
  gradient.addColorStop(1, "rgba(37, 99, 235, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function generateCityGlow() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.24, GLOBE_COLORS.dotGlow);
  gradient.addColorStop(1, "rgba(249, 115, 22, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// --- THREE.JS GLOBE (High Quality) ---
function ThreeGlobe({ onSelect, onFallback }: { onSelect: (d: Destination | null) => void, onFallback: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    
    let renderer: THREE.WebGLRenderer;
    const originalError = console.error;
    try {
      console.error = () => {}; 
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      console.error = originalError;
      
      if (!renderer.getContext()) {
        throw new Error("No valid WebGL context");
      }
    } catch {
      console.error = originalError;
      onFallback();
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.z = 3.75;
    
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.minDistance = 2.5;
    controls.maxDistance = 8.0;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.08;
    controls.enableDamping = true;

    container.addEventListener("mouseenter", () => { controls.autoRotate = false; });
    container.addEventListener("mouseleave", () => { controls.autoRotate = true; });

    const ambientLight = new THREE.AmbientLight(0x1a2040, 0.4);
    scene.add(ambientLight);

    // Light attached to camera so it rotates as user rotates
    const dirLight = new THREE.DirectionalLight(0xfff5e6, 1.2);
    dirLight.position.set(2, 1.5, 1);
    camera.add(dirLight);
    scene.add(camera);

    const earthGroup = new THREE.Group();
    scene.add(earthGroup);

    const earthTex = generateEarthTexture();
    const earthGeo = new THREE.SphereGeometry(1, 64, 64);
    const earthMat = new THREE.MeshBasicMaterial({
      map: earthTex,
    });
    const earth = new THREE.Mesh(earthGeo, earthMat);
    earthGroup.add(earth);

    const haloTex = generateHaloTexture();
    const haloMat = new THREE.SpriteMaterial({
      map: haloTex,
      color: 0xffffff,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.8,
      depthWrite: false
    });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.set(2.9, 2.9, 1);
    scene.add(halo);

    const starGeo = new THREE.BufferGeometry();
    const starCount = 2000;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 10 + Math.random() * 20;
      const theta = 2 * Math.PI * Math.random();
      const phi = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPos[i * 3 + 2] = r * Math.cos(phi);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.05, transparent: true, opacity: 0.6 });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    const cityTex = generateCityGlow();
    const citySprites: THREE.Sprite[] = [];
    N_POINTS.forEach((pt) => {
      const mat = new THREE.SpriteMaterial({
        map: cityTex,
        color: 0xffffff,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      const pos = latLonToVector3(pt.lat, pt.lng, 1.01);
      sprite.position.copy(pos);
      sprite.scale.set(0.06, 0.06, 1);
      sprite.userData = { destination: pt };
      earthGroup.add(sprite);
      citySprites.push(sprite);
    });

    const arcMaterial = new THREE.LineBasicMaterial({ color: GLOBE_COLORS.route, transparent: true, opacity: 0.5 });
    ARCS.forEach(arc => {
      const start = latLonToVector3(arc.startLat, arc.startLng, 1);
      const end = latLonToVector3(arc.endLat, arc.endLng, 1);
      const distance = start.distanceTo(end);
      const control = start.clone().add(end).normalize().multiplyScalar(1 + distance * 0.3);
      const curve = new THREE.QuadraticBezierCurve3(start, control, end);
      const points = curve.getPoints(50);
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geo, arcMaterial);
      earthGroup.add(line);
    });

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(citySprites);
      if (intersects.length > 0) {
        onSelect(intersects[0].object.userData.destination);
      } else {
        onSelect(null);
      }
    };
    renderer.domElement.addEventListener("click", onClick);
    
    const onMouseMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(citySprites);
      renderer.domElement.style.cursor = intersects.length > 0 ? "pointer" : "grab";
    };
    renderer.domElement.addEventListener("mousemove", onMouseMove);
    renderer.domElement.addEventListener("mousedown", () => { renderer.domElement.style.cursor = "grabbing"; });
    renderer.domElement.addEventListener("mouseup", () => { renderer.domElement.style.cursor = "grab"; });

    const onResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    let animationFrameId: number;
    const timeStart = Date.now();
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      const t = (Date.now() - timeStart) * 0.003;
      const scale = 0.06 + Math.sin(t) * 0.015;
      citySprites.forEach(sprite => {
        sprite.scale.set(scale, scale, 1);
      });
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("click", onClick);
      renderer.domElement.removeEventListener("mousemove", onMouseMove);
      container.removeChild(renderer.domElement);
      renderer.dispose();
      if (earthTex) earthTex.dispose();
      if (haloTex) haloTex.dispose();
      if (cityTex) cityTex.dispose();
    };
  }, [onSelect, onFallback]);

  return <div ref={containerRef} className="w-full h-full cursor-grab" />;
}

// --- D3 GLOBE (2D Fallback) ---
function D3Globe({ onSelect, selected }: { onSelect: (d: Destination | null) => void, selected: Destination | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [projection] = useState(() => d3.geoOrthographic().rotate([-20, -20]));

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
        projection.translate([width / 2, height / 2]).scale((Math.min(width, height) / 2) - 4);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [projection]);

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
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
    onSelect(closest);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0 || !isVisible) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const path = d3.geoPath(projection, context);

    let isDragging = false;
    let animationFrameId: number;

    const dragBehavior = d3.drag<HTMLCanvasElement, unknown>()
      .on("start", () => { isDragging = true; })
      .on("drag", (event) => {
        const rotate = projection.rotate();
        const k = 40 / projection.scale();
        projection.rotate([rotate[0] + event.dx * k, rotate[1] - event.dy * k, rotate[2]]);
      })
      .on("end", () => { isDragging = false; });

    d3.select(canvas)
      .call(dragBehavior)
      .on("wheel.zoom", null);

    function render() {
      if (!context) return;
      context.clearRect(0, 0, dimensions.width, dimensions.height);
      if (!isDragging) {
        const rotate = projection.rotate();
        projection.rotate([rotate[0] + 0.12, rotate[1], rotate[2]]);
      }

      // Ocean
      context.beginPath(); path({ type: "Sphere" });
      const oceanGradient = context.createLinearGradient(0, 0, dimensions.width, dimensions.height);
      oceanGradient.addColorStop(0, FALLBACK_GLOBE_COLORS.ocean);
      oceanGradient.addColorStop(1, FALLBACK_GLOBE_COLORS.oceanDeep);
      context.fillStyle = oceanGradient; context.fill();
      context.strokeStyle = FALLBACK_GLOBE_COLORS.grid; context.stroke();

      // Graticule
      context.beginPath(); path(graticuleGeoJson);
      context.lineWidth = 0.4; context.strokeStyle = "rgba(255,255,255,0.08)"; context.stroke();

      // Landmasses
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context.beginPath(); path(worldGeoJson as any);
      const landGradient = context.createLinearGradient(0, 0, dimensions.width, dimensions.height);
      landGradient.addColorStop(0, FALLBACK_GLOBE_COLORS.land);
      landGradient.addColorStop(1, FALLBACK_GLOBE_COLORS.landDeep);
      context.fillStyle = landGradient; context.fill();
      context.lineWidth = 0.5; context.strokeStyle = FALLBACK_GLOBE_COLORS.coast; context.stroke();

      // Arcs
      context.beginPath();
      arcsGeoJson.forEach(arc => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        path(arc as any);
      });
      context.lineWidth = 1;
      context.strokeStyle = FALLBACK_GLOBE_COLORS.routeGlow;
      context.setLineDash([3, 5]);
      context.stroke();
      context.setLineDash([]);

      // Animated flights
      const time = Date.now();
      path.pointRadius(3.5);
      context.beginPath();
      ARCS.forEach((arc, i) => {
        const t = ((time + i * 1400) % 4200) / 4200;
        const interp = d3.geoInterpolate([arc.startLng, arc.startLat], [arc.endLng, arc.endLat]);
        path({ type: "Point", coordinates: interp(t) });
      });
      context.fillStyle = "rgba(252, 211, 77, 0.28)";
      context.fill();

      path.pointRadius(1.8);
      context.beginPath();
      ARCS.forEach((arc, i) => {
        const t = ((time + i * 1400) % 4200) / 4200;
        const interp = d3.geoInterpolate([arc.startLng, arc.startLat], [arc.endLng, arc.endLat]);
        path({ type: "Point", coordinates: interp(t) });
      });
      context.fillStyle = FALLBACK_GLOBE_COLORS.dot;
      context.fill();

      // Dots
      const centerLngLat = projection.invert?.([dimensions.width / 2, dimensions.height / 2]) || [0, 0];
      N_POINTS.forEach((pt, i) => {
        const el = dotRefs.current[i];
        if (!el) return;
        const coords = projection([pt.lng, pt.lat]);
        const visible = d3.geoDistance([pt.lng, pt.lat], centerLngLat) < Math.PI / 2;
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
    <div ref={containerRef} className="w-full h-full relative">
      <div className="absolute inset-4 rounded-full shadow-[inset_-20px_-20px_60px_rgba(0,0,0,0.1),0_20px_40px_rgba(0,0,0,0.05)] dark:shadow-[inset_-30px_-30px_60px_rgba(0,0,0,0.8),0_20px_40px_rgba(0,0,0,0.3)] pointer-events-none z-10" />
      
      <canvas ref={canvasRef} width={dimensions.width} height={dimensions.height} className="w-full h-full rounded-full cursor-grab active:cursor-grabbing relative z-0" onClick={handleCanvasClick} />
      
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/20 to-transparent dark:from-white/10 mix-blend-overlay pointer-events-none z-10" />

      <div className="absolute inset-0 pointer-events-none z-20">
        {N_POINTS.map((pt, i) => (
          <div key={pt.name} ref={(el) => { dotRefs.current[i] = el; }} className="absolute left-0 top-0 transition-opacity duration-150">
            <button onClick={() => onSelect(pt)} className="group relative flex items-center justify-center pointer-events-auto cursor-pointer focus:outline-none" aria-label={`Explore ${pt.name}`}>
              <div
                className={`h-2.5 w-2.5 rounded-full transition-transform duration-200 group-hover:scale-150 ${selected?.name === pt.name ? "scale-125" : ""}`}
                style={{
                  backgroundColor: selected?.name === pt.name ? FALLBACK_GLOBE_COLORS.dotSoft : FALLBACK_GLOBE_COLORS.dot,
                  boxShadow: `0 0 8px ${FALLBACK_GLOBE_COLORS.dotGlow}, 0 0 14px rgba(252, 211, 77, 0.22)`,
                }}
              />
              <div
                className="absolute h-7 w-7 animate-ping rounded-full opacity-15 pointer-events-none"
                style={{ backgroundColor: FALLBACK_GLOBE_COLORS.dot }}
              />
              <div className="absolute left-4 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-[#050505]/90 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                {pt.name}
              </div>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LandingGlobe() {
  const [selected, setSelected] = useState<Destination | null>(null);
  const [useWebGL, setUseWebGL] = useState(true);

  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const support = !!(window.WebGLRenderingContext && (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")));
      if (!support) setUseWebGL(false);
    } catch {
      setUseWebGL(false);
    }
  }, []);

  const sizeClass = useWebGL
    ? "max-w-[370px] sm:max-w-[500px] lg:max-w-[610px]"
    : "max-w-[300px] sm:max-w-[380px] lg:max-w-[455px]";

  return (
    <div className={`relative mx-auto flex aspect-square w-full items-center justify-center ${sizeClass}`}>
      {useWebGL ? (
        <ThreeGlobe onSelect={setSelected} onFallback={() => setUseWebGL(false)} />
      ) : (
        <D3Globe onSelect={setSelected} selected={selected} />
      )}

      {/* Glare/Shadow overlays - removed because Three.js lighting handles this now, but keeping a faint radial gradient behind it can help blend it with background */}
      <div className="absolute inset-0 rounded-full bg-[color:var(--sage)]/10 blur-[100px] pointer-events-none" />

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
              <Image
                src={selected.image}
                alt={selected.name}
                fill
                sizes="340px"
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
        <div className="absolute bottom-2 left-0 right-0 flex justify-center pointer-events-none z-10">
          <span className="rounded-full bg-black/40 px-3 py-1 text-[10px] font-medium uppercase tracking-widest text-white/40 backdrop-blur-sm dark:bg-white/5">
            Click a city to explore
          </span>
        </div>
      )}
    </div>
  );
}
