"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TripPlan } from "@/shared/trip-plan";
import { planHasUsableTripTiming } from "@/shared/trip-plan";
import { primaryFilledInteractive, primaryFocusRing } from "@/frontend/ui/primary-action";

type FormData = {
  tripName: string;
  destination: string;
  needsFlight: boolean;
  departureCity: string;
  dateStart: string;
  dateEnd: string;
  people: string;
  budget: string;
  vibe: string;
  interests: string;
  pace: string;
};

const VIBE_OPTIONS = ["chill", "party", "culture", "outdoors", "foodie", "adventure", "romantic", "luxury"] as const;
const PACE_OPTIONS = ["packed", "relaxed", "balanced"] as const;

function generateId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `trip-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatDateRange(start: string, end: string): string {
  if (!start) return "";
  const s = new Date(`${start}T12:00:00`);
  const e = end ? new Date(`${end}T12:00:00`) : s;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  if (start === end || !end) return s.toLocaleDateString("en-US", opts);
  return `${s.toLocaleDateString("en-US", opts)} – ${e.toLocaleDateString("en-US", opts)}`;
}

function buildPlanFromForm(form: FormData): TripPlan {
  const dateRange = formatDateRange(form.dateStart, form.dateEnd);
  const vibes = form.vibe.split(",").map((v) => v.trim()).filter(Boolean);
  const count = parseInt(form.people, 10);

  return {
    title: form.tripName.trim() || `${form.destination} Trip`,
    location: form.destination.trim() || null,
    departureCity: form.departureCity.trim() || null,
    dates: {
      confirmed: Boolean(form.dateStart),
      options: dateRange ? [dateRange] : [],
    },
    people: {
      count: Number.isFinite(count) && count > 0 ? count : null,
      names: [],
    },
    budget: {
      tier: null,
      perPerson: form.budget.trim() || null,
    },
    vibe: vibes,
    openDecisions: [],
    nextStep: null,
    confidence: 0.9,
  };
}

function buildSeedText(form: FormData): string {
  const lines: string[] = [];
  lines.push(`Trip: ${form.tripName || form.destination}`);
  if (form.destination) lines.push(`Destination: ${form.destination}`);
  if (form.needsFlight && form.departureCity) {
    lines.push(`Departing from: ${form.departureCity} (needs flight)`);
  } else if (form.departureCity) {
    lines.push(`Departing from: ${form.departureCity}`);
  }
  if (!form.needsFlight) lines.push(`Transport: driving/local (no flight needed)`);
  if (form.dateStart) lines.push(`Dates: ${formatDateRange(form.dateStart, form.dateEnd)}`);
  if (form.people) lines.push(`People: ${form.people}`);
  if (form.budget) lines.push(`Budget: ${form.budget}`);
  if (form.vibe) lines.push(`Vibe: ${form.vibe}`);
  if (form.interests) lines.push(`\u2022 interests: ${form.interests}`);
  if (form.pace) lines.push(`\u2022 pace: ${form.pace}`);
  return lines.join("\n");
}

async function imageFileToDataUrl(file: File, maxEdge = 1280, quality = 0.75): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = url;
    });
    let { width, height } = img;
    if (width <= 0 || height <= 0) return null;
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    width = Math.round(width * scale);
    height = Math.round(height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Phase = "input" | "parsing" | "form" | "saving";

export function TripFormParser({ initialPrompt = "" }: { initialPrompt?: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("input");
  const [freeText, setFreeText] = useState(initialPrompt);
  const [images, setImages] = useState<string[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [form, setForm] = useState<FormData>({
    tripName: "",
    destination: "",
    needsFlight: true,
    departureCity: "",
    dateStart: "",
    dateEnd: "",
    people: "",
    budget: "",
    vibe: "",
    interests: "",
    pace: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [activeEdit, setActiveEdit] = useState<string | null>(null);
  // Vibe picker: collapsed by default — show only selected tags in the expanded drawer
  const [showAllVibes, setShowAllVibes] = useState(false);
  // Tracks which field inside the Trip Profile expanded drawer is being inline-edited
  const [dnaEditField, setDnaEditField] = useState<string | null>(null);

  const handleImageUpload = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const newFiles = Array.from(files).slice(0, 3 - imageFiles.length);
    const urls: string[] = [];
    for (const f of newFiles) {
      const url = await imageFileToDataUrl(f);
      if (url) urls.push(url);
    }
    setImageFiles((prev) => [...prev, ...newFiles].slice(0, 3));
    setImages((prev) => [...prev, ...urls].slice(0, 3));
  }, [imageFiles.length]);

  const removeImage = useCallback((idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
    setImageFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const parseInput = useCallback(async () => {
    if (!freeText.trim() && images.length === 0) {
      setError("Add some text or screenshots to parse.");
      return;
    }
    setError(null);
    setPhase("parsing");

    try {
      const res = await fetch("/api/trip-parser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: freeText.trim(),
          images: images,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Failed to parse input.");
        setPhase("input");
        return;
      }

      const parsed = JSON.parse(body.outputText || "{}");
      setForm({
        tripName: parsed.title || "",
        destination: parsed.location || "",
        needsFlight: Boolean(parsed.departureCity),
        departureCity: parsed.departureCity || "",
        dateStart: extractIsoDate(parsed.dates?.options?.[0], "start") || "",
        dateEnd: extractIsoDate(parsed.dates?.options?.[0], "end") || "",
        people: parsed.people?.count ? String(parsed.people.count) : "",
        budget: parsed.budget?.perPerson || parsed.budget?.tier || "",
        vibe: Array.isArray(parsed.vibe) ? parsed.vibe.map((v: string) => v.toLowerCase()).join(", ") : "",
        interests: "",
        pace: "",
      });
      setActiveEdit(null);
      setPhase("form");
    } catch {
      setError("Something went wrong parsing your input.");
      setPhase("input");
    }
  }, [freeText, images]);

  const skipToForm = useCallback(() => {
    setError(null);
    setActiveEdit(null);
    setPhase("form");
  }, []);

  const updateField = useCallback((field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const toggleVibe = useCallback((tag: string) => {
    setForm((prev) => {
      const current = prev.vibe.split(",").map((v) => v.trim()).filter(Boolean);
      const next = current.includes(tag)
        ? current.filter((v) => v !== tag)
        : [...current, tag];
      return { ...prev, vibe: next.join(", ") };
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    setError(null);
    setActiveEdit(null);
    if (!form.destination.trim()) {
      setError("Where are you going? Add a destination.");
      return;
    }
    if (!form.dateStart.trim()) {
      setError("When is the trip? Add at least a start date.");
      return;
    }

    const plan = buildPlanFromForm(form);
    if (!planHasUsableTripTiming(plan)) {
      setError("Add a date range or rough timing for your trip.");
      return;
    }

    setPhase("saving");
    const tripId = generateId();
    const seedText = buildSeedText(form);

    try {
      const res = await fetch("/api/trip-plans", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: tripId,
          plan,
          seedText,
          hostSetupDraft: true,
        }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401) {
          router.push(`/auth?next=${encodeURIComponent("/trip-parser")}`);
          return;
        }
        if (res.status === 402 || body.code === "subscription_required") {
          router.push("/pricing");
          return;
        }
        setError(body.error || body.detail || "Could not save trip.");
        setPhase("form");
        return;
      }

      if (body.id) {
        fetch(`/api/trip-plans/${body.id}/generate-itinerary`, {
          method: "POST",
          credentials: "include",
        }).catch(() => {});
        router.replace(`/trip/${body.id}/setup`);
      }
    } catch {
      setError("Network error. Check your connection.");
      setPhase("form");
    }
  }, [form, router]);

  const selectedVibes = form.vibe.split(",").map((v) => v.trim()).filter(Boolean);

  // ─── PHASE: INPUT ────────────────────────────────────────────────────────────
  if (phase === "input" || phase === "parsing") {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-5">
        <header>
          <h1 className="font-display text-3xl font-bold tracking-tight text-[color:var(--on-surface)] dark:text-[#ebe9e4] sm:text-4xl">
            Plan a trip
          </h1>
          <p className="mt-2 text-sm font-light text-[color:var(--on-surface-muted)] dark:text-neutral-500">
            Paste screenshots of group chats, type details, or both. We&apos;ll extract everything and let you confirm.
          </p>
        </header>

        {/* Image upload */}
        <div>
          <div
            className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface)] px-5 py-5 transition-all hover:border-dashed hover:border-[color:var(--sage)]/40 hover:bg-[color:var(--surface-container-low)] dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-white/20 dark:hover:bg-white/[0.04]"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); void handleImageUpload(e.dataTransfer.files); }}
          >
            <svg className="h-4 w-4 shrink-0 text-[color:var(--on-surface-muted)] transition-colors group-hover:text-[color:var(--on-surface-variant)] dark:text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <div>
              <p className="text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">
                Drop screenshots here or{" "}
                <span className="font-medium text-[color:var(--sage)] underline underline-offset-2 dark:text-[color:var(--sage-soft)]">click to upload</span>
              </p>
              <p className="mt-0.5 text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-600">
                Group chats, inspo pics, travel plans — up to 3 images
              </p>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void handleImageUpload(e.target.files)}
          />
        </div>

        {/* Image previews */}
        {images.length > 0 && (
          <div className="flex gap-3">
            {images.map((url, i) => (
              <div key={i} className="relative">
                <img src={url} alt={`Upload ${i + 1}`} className="h-20 w-20 rounded-[16px] object-cover ring-1 ring-[color:var(--hairline)] dark:ring-white/10" />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--on-surface)] text-xs text-[color:var(--surface)] shadow-md transition hover:bg-red-500 dark:bg-neutral-600 dark:hover:bg-red-500"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Free text */}
        <textarea
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          rows={6}
          placeholder={"Paste your group chat, type trip details, or describe what you want...\n\ne.g. \"Miami trip Aug 30 – Sep 2, 4 people, flying from LAX, budget $200/day each\""}
          className="w-full resize-none rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface)] px-4 py-3.5 text-sm leading-relaxed text-[color:var(--on-surface)] outline-none transition-all placeholder:text-[color:var(--on-surface-muted)]/70 focus:border-[color:var(--sage)]/50 focus:ring-2 focus:ring-[color:var(--sage)]/10 dark:border-white/10 dark:bg-white/[0.02] dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:border-white/20 dark:focus:ring-white/5"
        />

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <button
            type="button"
            onClick={parseInput}
            disabled={phase === "parsing"}
            className={`w-full rounded-xl px-6 py-3 text-sm ${primaryFilledInteractive} ${primaryFocusRing} disabled:opacity-50`}
          >
            {phase === "parsing" ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                Parsing…
              </span>
            ) : (
              "Parse & continue"
            )}
          </button>
          <div className="text-center">
            <button
              type="button"
              onClick={skipToForm}
              className="text-sm text-[color:var(--on-surface-muted)] transition-colors hover:text-[color:var(--on-surface-variant)] dark:text-neutral-500 dark:hover:text-neutral-300"
            >
              Skip — fill in manually
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── PHASE: FORM / SAVING — Trip Blueprint ───────────────────────────────────────
  return (
    // Fixed overlay covers the sticky nav (z-30) giving a fully focused canvas
    <div className="fixed inset-0 z-40 overflow-y-auto bg-[color:var(--surface)] dark:bg-[#141414]">
      {/* Blueprint micro-dot grid texture */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(128,128,128,0.13) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div className="mx-auto w-full max-w-3xl px-4 pt-10 pb-40 sm:px-6 sm:pt-14">
      {/* Eyebrow */}
      <div className="mb-8 flex items-center justify-between">
        <span className="label-caps inline-flex items-center gap-2 rounded-full border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-3 py-1.5 text-[color:var(--sage)] shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-[color:var(--sage-soft)]">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
          Trip Blueprint
        </span>
        <button
          type="button"
          onClick={() => { setPhase("input"); setError(null); setActiveEdit(null); }}
          className="group flex items-center gap-1.5 rounded-full border border-transparent px-3 py-1.5 text-sm font-medium text-[color:var(--on-surface-muted)] transition-colors hover:bg-[color:var(--surface-container-low)] hover:text-[color:var(--on-surface)] dark:text-neutral-500 dark:hover:bg-white/5 dark:hover:text-neutral-300"
        >
          <svg className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          Edit prompt
        </button>
      </div>

      {/* Hero: Natural Language Typography */}
      <div className="space-y-6 px-2">
        {/* Title */}
        <div>
           {activeEdit === "tripName" ? (
             <input
               autoFocus
               type="text"
               value={form.tripName}
               onChange={(e) => updateField("tripName", e.target.value)}
               onBlur={() => setActiveEdit(null)}
               onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setActiveEdit(null); } }}
               placeholder="Name your trip..."
               className="w-full bg-transparent font-display text-4xl sm:text-5xl font-semibold tracking-tight text-[color:var(--on-surface)] outline-none placeholder:text-[color:var(--on-surface-muted)] dark:text-white dark:placeholder:text-neutral-600"
             />
           ) : (
             <h1 
               onClick={() => setActiveEdit("tripName")}
               className="group cursor-text font-display text-4xl sm:text-5xl font-semibold tracking-tight text-[color:var(--on-surface)] transition-colors hover:text-[color:var(--sage)] dark:text-white relative inline-block"
             >
               {form.tripName || (form.destination ? `${form.destination} Trip` : "Your trip")}
               <span className="absolute -right-6 top-2 opacity-0 transition-opacity group-hover:opacity-100 text-[color:var(--sage)] text-lg">
                 <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
               </span>
             </h1>
           )}
        </div>

        {/* Destination Statement */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-3 text-2xl sm:text-3xl font-light text-[color:var(--on-surface-variant)] dark:text-neutral-300">
           <span>We&apos;re going to</span>
           {activeEdit === "destination" ? (
              <input
                autoFocus
                type="text"
                value={form.destination}
                onChange={(e) => updateField("destination", e.target.value)}
                onBlur={() => setActiveEdit(null)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setActiveEdit(null); } }}
                placeholder="Where to?"
                className="w-auto min-w-[200px] max-w-full bg-transparent font-medium text-[color:var(--on-surface)] outline-none border-b border-[color:var(--sage)] dark:text-white"
              />
           ) : (
             <span 
               onClick={() => setActiveEdit("destination")}
               className={`group cursor-text font-medium relative inline-block transition-colors ${form.destination ? 'text-[color:var(--on-surface)] dark:text-white' : 'text-[color:var(--on-surface-muted)]/50 underline decoration-dashed underline-offset-8'} hover:text-[color:var(--sage)]`}
             >
               {form.destination || "Add destination"}
               <span className="absolute -right-6 top-1.5 opacity-0 transition-opacity group-hover:opacity-100 text-[color:var(--sage)] text-lg">
                 <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
               </span>
             </span>
           )}
        </div>

        {/* Dates & Logistics Row */}
        <div className="pt-6 flex flex-wrap items-center gap-3">
          {/* Dates */}
          <div className="relative">
             <button 
               type="button" 
               onClick={() => setActiveEdit(activeEdit === "dates" ? null : "dates")}
               className={`group flex items-center gap-2 rounded-2xl border px-4 py-2 text-lg font-medium transition-all ${
                 form.dateStart 
                   ? "border-[color:var(--sage)] bg-[color:var(--surface-container-low)] text-[color:var(--on-surface)] shadow-sm dark:border-[color:var(--sage-soft)]/50 dark:bg-white/5 dark:text-white" 
                   : "border-[color:var(--sage)]/30 bg-[color:var(--sage)]/[0.04] text-[color:var(--on-surface-variant)] hover:border-[color:var(--sage)]/70 hover:bg-[color:var(--sage)]/[0.07] dark:border-[color:var(--sage-soft)]/20 dark:bg-[color:var(--sage)]/[0.04] dark:text-neutral-400"
               }`}
             >
               <svg className="h-5 w-5 opacity-70 group-hover:text-current" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
               {form.dateStart ? formatDateRange(form.dateStart, form.dateEnd) : <>Set dates <span className="text-xs text-[color:var(--sage)] opacity-70 dark:text-[color:var(--sage-soft)]">✱</span></>}
             </button>

             {/* Date Picker Popover */}
             {activeEdit === "dates" && (
               <div className="absolute top-full mt-3 z-50 left-0">
                 <div className="rounded-3xl border border-[color:var(--hairline)] bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-[#1a1a18]">
                   <div className="flex flex-col gap-4 mb-5">
                     <div className="space-y-1">
                       <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--on-surface-muted)]">Start Date</label>
                       <input
                         type="date"
                         value={form.dateStart}
                         onChange={(e) => updateField("dateStart", e.target.value)}
                         className="block w-full rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-4 py-2.5 text-sm outline-none transition-colors focus:border-[color:var(--sage)] dark:border-white/10 dark:bg-white/[0.04] dark:text-white [color-scheme:light] dark:[color-scheme:dark]"
                       />
                     </div>
                     <div className="flex justify-center text-[color:var(--on-surface-muted)]">
                       <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                     </div>
                     <div className="space-y-1">
                       <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--on-surface-muted)]">End Date</label>
                       <input
                         type="date"
                         value={form.dateEnd}
                         min={form.dateStart || undefined}
                         onChange={(e) => updateField("dateEnd", e.target.value)}
                         className="block w-full rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-4 py-2.5 text-sm outline-none transition-colors focus:border-[color:var(--sage)] dark:border-white/10 dark:bg-white/[0.04] dark:text-white [color-scheme:light] dark:[color-scheme:dark]"
                       />
                     </div>
                   </div>
                   <button 
                     type="button" 
                     onClick={() => setActiveEdit(null)}
                     className="w-full rounded-xl bg-[color:var(--on-surface)] px-4 py-3 text-sm font-medium text-[color:var(--surface)] transition-colors hover:opacity-90 dark:bg-white dark:text-black"
                   >
                     Done
                   </button>
                 </div>
               </div>
             )}
          </div>

          {/* People */}
          <div className="relative">
             <button 
               type="button" 
               onClick={() => setActiveEdit(activeEdit === "people" ? null : "people")}
               className={`group flex items-center gap-2 rounded-2xl border px-4 py-2 text-lg font-medium transition-all ${
                 form.people 
                   ? "border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] text-[color:var(--on-surface)] shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white hover:border-[color:var(--sage)]" 
                   : "border-dashed border-[color:var(--on-surface-muted)]/40 bg-transparent text-[color:var(--on-surface-muted)] hover:border-[color:var(--sage)] hover:text-[color:var(--on-surface-variant)]"
               }`}
             >
               <svg className="h-5 w-5 opacity-70 group-hover:text-current" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
               {form.people ? `${form.people} ${Number(form.people) === 1 ? "person" : "people"}` : "Add people"}
             </button>

             {activeEdit === "people" && (
               <div className="absolute top-full mt-3 z-50 left-0">
                 <div className="flex items-center gap-2 rounded-2xl border border-[color:var(--hairline)] bg-white p-2 shadow-2xl dark:border-white/10 dark:bg-[#1a1a18]">
                   <input
                     autoFocus
                     type="number"
                     min={1}
                     max={50}
                     value={form.people}
                     onChange={(e) => updateField("people", e.target.value)}
                     onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setActiveEdit(null); } }}
                     className="w-20 rounded-xl border-none bg-[color:var(--surface-container-low)] px-3 py-2 text-center text-lg font-medium outline-none focus:ring-2 focus:ring-[color:var(--sage)] dark:bg-white/[0.04] dark:text-white"
                   />
                   <button type="button" onClick={() => setActiveEdit(null)} className="rounded-xl bg-[color:var(--sage)] p-2 text-white hover:bg-[color:var(--sage-soft)]">
                     <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                   </button>
                 </div>
               </div>
             )}
          </div>
          
          {/* Departure Flight toggle */}
          <div className="relative">
             <button 
               type="button" 
               onClick={() => setActiveEdit(activeEdit === "flight" ? null : "flight")}
               className={`group flex items-center gap-2 rounded-2xl border px-4 py-2 text-lg font-medium transition-all ${
                 form.needsFlight || form.departureCity
                   ? "border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] text-[color:var(--on-surface)] shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white hover:border-[color:var(--sage)]" 
                   : "border-dashed border-[color:var(--on-surface-muted)]/40 bg-transparent text-[color:var(--on-surface-muted)] hover:border-[color:var(--sage)] hover:text-[color:var(--on-surface-variant)]"
               }`}
             >
               <svg className="h-5 w-5 opacity-70 group-hover:text-current" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
               {form.needsFlight && form.departureCity ? `From ${form.departureCity}` : form.needsFlight ? "Needs flight" : "+ Add flight"}
             </button>

             {activeEdit === "flight" && (
               <div className="absolute top-full mt-3 z-50 left-0 w-72">
                 <div className="rounded-3xl border border-[color:var(--hairline)] bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-[#1a1a18]">
                   <div className="flex items-center justify-between mb-5">
                     <span className="text-sm font-medium text-[color:var(--on-surface)] dark:text-white">Need flights?</span>
                     <button 
                       type="button"
                       onClick={() => setForm(prev => ({ ...prev, needsFlight: !prev.needsFlight, departureCity: prev.needsFlight ? "" : prev.departureCity }))}
                       className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.needsFlight ? 'bg-[color:var(--sage)]' : 'bg-gray-200 dark:bg-white/10'}`}
                     >
                       <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.needsFlight ? 'translate-x-6' : 'translate-x-1'}`} />
                     </button>
                   </div>
                   {form.needsFlight && (
                     <div className="space-y-1.5">
                       <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--on-surface-muted)]">Departure City</label>
                       <input
                         autoFocus
                         type="text"
                         value={form.departureCity}
                         onChange={(e) => updateField("departureCity", e.target.value)}
                         onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setActiveEdit(null); } }}
                         placeholder="City or airport code"
                         className="block w-full rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-4 py-2.5 text-sm outline-none transition-colors focus:border-[color:var(--sage)] dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                       />
                     </div>
                   )}
                   <button 
                     type="button" 
                     onClick={() => setActiveEdit(null)}
                     className="mt-5 w-full rounded-xl bg-[color:var(--on-surface)] px-4 py-3 text-sm font-medium text-[color:var(--surface)] transition-colors hover:opacity-90 dark:bg-white dark:text-black"
                   >
                     Done
                   </button>
                 </div>
               </div>
             )}
          </div>
        </div>
      </div>

      {/* Trip Profile */}
      <div className="mt-16">
        <div
          className="rounded-3xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] p-6 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.10),0_10px_30px_-10px_rgba(0,0,0,0.05)] dark:border-white/[0.08] dark:bg-white/[0.04] dark:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.4),0_10px_30px_-10px_rgba(0,0,0,0.2)]"
          style={{ transform: "perspective(1500px) rotateX(2deg) rotateY(-1deg)" }}
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold tracking-tight text-[color:var(--on-surface)] dark:text-white">Trip Profile</h2>
            <button
              type="button"
              onClick={() => { setActiveEdit(activeEdit === "dna" ? null : "dna"); setDnaEditField(null); setShowAllVibes(false); }}
              className="flex items-center gap-1 text-sm font-medium text-[color:var(--sage)] transition-colors hover:text-[color:var(--sage-soft)]"
            >
              {activeEdit === "dna" ? "Done tweaking" : "Tweak preferences"}
              <svg className={`h-4 w-4 transition-transform ${activeEdit === "dna" ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
          </div>

          {activeEdit === "dna" ? (
            <div className="space-y-6 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">

              {/* Budget — click-to-edit inline */}
              <div className="cursor-text" onClick={() => setDnaEditField("budget")}>
                <p className="label-caps mb-1 text-[color:var(--on-surface-muted)]">Budget</p>
                {dnaEditField === "budget" ? (
                  <input
                    autoFocus
                    type="text"
                    value={form.budget}
                    onChange={(e) => updateField("budget", e.target.value)}
                    onBlur={() => setDnaEditField(null)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setDnaEditField(null); } }}
                    placeholder="e.g. $3,000 / person"
                    className="w-full bg-transparent text-base text-[color:var(--on-surface)] outline-none placeholder:italic placeholder:text-[color:var(--on-surface-muted)]/50 dark:text-white"
                  />
                ) : (
                  <p className="text-base text-[color:var(--on-surface-variant)] dark:text-neutral-300">
                    {form.budget
                      ? (form.budget.startsWith("$") ? form.budget : `$${form.budget}`)
                      : <span className="italic text-[color:var(--on-surface-muted)]/50">tap to add…</span>}
                  </p>
                )}
              </div>

              {/* Vibe — selected only + expand trigger */}
              <div>
                <p className="label-caps mb-2 text-[color:var(--on-surface-muted)]">Vibe</p>
                <div className="flex flex-wrap gap-2">
                  {selectedVibes.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleVibe(v); }}
                      className="rounded-full border border-[color:var(--sage)] bg-[color:var(--sage)]/10 px-4 py-1.5 text-sm font-medium capitalize text-[color:var(--sage)] transition-all dark:border-[color:var(--sage-soft)] dark:text-[color:var(--sage-soft)]"
                    >
                      {v}
                    </button>
                  ))}
                  {showAllVibes &&
                    VIBE_OPTIONS.filter((v) => !selectedVibes.includes(v)).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleVibe(v); }}
                        className="rounded-full border border-[color:var(--hairline)] px-4 py-1.5 text-sm font-medium capitalize text-[color:var(--on-surface-muted)] transition-all hover:border-[color:var(--sage)]/40 dark:border-white/10 dark:text-neutral-400"
                      >
                        {v}
                      </button>
                    ))}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowAllVibes((s) => !s); }}
                    className="rounded-full border border-dashed border-[color:var(--on-surface-muted)]/30 px-3.5 py-1.5 text-sm text-[color:var(--on-surface-muted)] transition-colors hover:border-[color:var(--sage)]/50 hover:text-[color:var(--on-surface-variant)] dark:border-white/20 dark:text-neutral-500"
                  >
                    {showAllVibes ? "Less" : selectedVibes.length === 0 ? "+ Add vibe" : "+ More"}
                  </button>
                </div>
              </div>

              {/* Pace */}
              <div>
                <p className="label-caps mb-2 text-[color:var(--on-surface-muted)]">Pace</p>
                <div className="flex gap-2">
                  {PACE_OPTIONS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => updateField("pace", form.pace === p ? "" : p)}
                      className={`rounded-full border px-4 py-1.5 text-sm font-medium capitalize transition-all ${
                        form.pace === p
                          ? "border-[color:var(--sage)] bg-[color:var(--sage)]/10 text-[color:var(--sage)] dark:border-[color:var(--sage-soft)] dark:text-[color:var(--sage-soft)]"
                          : "border-[color:var(--hairline)] text-[color:var(--on-surface-muted)] hover:border-[color:var(--sage)]/40 dark:border-white/10 dark:text-neutral-400"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Must-dos — borderless editorial textarea */}
              <div>
                <p className="label-caps mb-1 text-[color:var(--on-surface-muted)]">Must-dos</p>
                <textarea
                  rows={2}
                  value={form.interests}
                  onChange={(e) => updateField("interests", e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
                  placeholder="Snorkeling, street food, nightlife, hidden gems…"
                  className="block w-full resize-none bg-transparent text-sm leading-relaxed text-[color:var(--on-surface)] outline-none placeholder:italic placeholder:text-[color:var(--on-surface-muted)]/50 dark:text-white dark:placeholder:text-neutral-600"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-x-6 gap-y-2.5 pt-2">
              {form.budget && (
                <span className="text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-300">
                  <span className="label-caps mr-1.5 text-[color:var(--on-surface-muted)]">Budget</span>
                  {form.budget.startsWith("$") ? form.budget : `$${form.budget}`}
                </span>
              )}
              {selectedVibes.length > 0 && (
                <span className="text-sm capitalize text-[color:var(--on-surface-variant)] dark:text-neutral-300">
                  <span className="label-caps mr-1.5 text-[color:var(--on-surface-muted)]">Vibe</span>
                  {selectedVibes.join(", ")}
                </span>
              )}
              {form.pace && (
                <span className="text-sm capitalize text-[color:var(--on-surface-variant)] dark:text-neutral-300">
                  <span className="label-caps mr-1.5 text-[color:var(--on-surface-muted)]">Pace</span>
                  {form.pace}
                </span>
              )}
              {form.interests && (
                <span className="max-w-[280px] truncate text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-300">
                  <span className="label-caps mr-1.5 text-[color:var(--on-surface-muted)]">Must-dos</span>
                  {form.interests}
                </span>
              )}
              {!form.budget && selectedVibes.length === 0 && !form.pace && !form.interests && (
                <span className="text-sm italic text-[color:var(--on-surface-muted)]">No preferences set — tap &apos;Tweak preferences&apos; to add.</span>
              )}
            </div>
          )}
        </div>{/* /trip-profile card */}
      </div>{/* /trip-profile wrapper */}

      </div>{/* /inner content */}

      {/* Floating Action Bar — z-50 sits above the z-40 overlay */}
      <div className="fixed bottom-6 left-0 right-0 z-50 mx-auto w-full max-w-3xl px-4 pointer-events-none">
        <div className="pointer-events-auto overflow-hidden rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface)] p-2 shadow-2xl dark:border-white/[0.08] dark:bg-[#1a1a18] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="px-4 flex-1 w-full text-center sm:text-left">
            {error ? (
              <div className="flex items-center justify-center sm:justify-start gap-2 text-sm text-red-600 dark:text-red-400 font-medium">
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                {error}
              </div>
            ) : (
              <p className="text-sm font-medium text-[color:var(--on-surface-muted)] dark:text-neutral-400">
                {!form.destination 
                   ? "Where to? Add a destination." 
                   : !form.dateStart 
                     ? "When are you going? Set your dates." 
                     : "Ready to plan your trip."}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={phase === "saving" || !form.destination || !form.dateStart}
            className={`w-full sm:w-auto rounded-xl px-8 py-3.5 text-sm font-medium transition-all ${
              (!form.destination || !form.dateStart)
                ? "bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-white/5 dark:text-gray-500"
                : phase === "saving"
                ? "bg-[color:var(--on-surface)] text-[color:var(--surface)] opacity-70 cursor-wait dark:bg-white dark:text-black"
                : "bg-[color:var(--on-surface)] text-[color:var(--surface)] shadow-md hover:scale-[1.02] hover:shadow-lg dark:bg-white dark:text-black"
            }`}
          >
            {phase === "saving" ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                Building…
              </span>
            ) : (
              "Generate Itinerary →"
            )}
          </button>
        </div>
      </div>

    </div>
  );
}

function extractIsoDate(dateStr: string | undefined | null, which: "start" | "end"): string {
  if (!dateStr) return "";
  const months: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04",
    may: "05", june: "06", july: "07", august: "08",
    september: "09", october: "10", november: "11", december: "12",
    jan: "01", feb: "02", mar: "03", apr: "04",
    jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };

  const isoMatch = dateStr.match(/(\d{4}-\d{2}-\d{2})/g);
  if (isoMatch) {
    return which === "start" ? isoMatch[0] : (isoMatch[1] || isoMatch[0]);
  }

  const parts = dateStr.split(/[–\-—to]+/i).map((s) => s.trim()).filter(Boolean);
  const target = which === "start" ? parts[0] : (parts[1] || parts[0]);
  if (!target) return "";

  const monthDayYear = target.match(/(\w+)\s+(\d{1,2})(?:[,\s]+(\d{4}))?/);
  if (monthDayYear) {
    const m = months[monthDayYear[1].toLowerCase()];
    if (m) {
      const y = monthDayYear[3] || String(new Date().getFullYear());
      const d = monthDayYear[2].padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }

  return "";
}
