"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import NextImage from "next/image";
import type { TripPlan } from "@/shared/trip-plan";
import { planHasUsableTripTiming } from "@/shared/trip-plan";
import { primaryFilledInteractive, primaryFocusRing } from "@/frontend/ui/primary-action";
import { ItineraryGenerationLoading } from "@/frontend/components/itinerary-generation-loading";
import { TripParserJoinCta } from "@/frontend/components/trip-parser-join-cta";
import { TripParserActiveTripCard, type ActiveTripCardData } from "@/frontend/components/trip-parser-active-trip-card";
import { TripCanvasBackdrop } from "@/frontend/components/trip-canvas-backdrop";

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

const GHOST_PROMPTS: readonly string[] = [
  "We’re planning a 4-day bachelor party in Austin with 8 guys: craft cocktails, BBQ crawl, a pool day, one big night out.",
  "Taking a slow, luxury foodie escape to Kyoto this autumn: ryokan stays, omakase, temple walks at dawn.",
  "Family of five doing 10 days in Costa Rica with surf lessons for the kids, a cloud-forest night, and two days of pure rest.",
  "Long weekend in Lisbon with my partner in late February, looking for tile-walking neighborhoods, tinned fish, natural wine.",
  "Five college friends, ten years out, want a barefoot week in the Greek islands: sailing day, sleepy tavernas, no agenda.",
];

const PRESETS: ReadonlyArray<{ title: string; subtitle: string; image: string; seed: string }> = [
  {
    title: "Tokyo & Kyoto",
    subtitle: "10 days · Culture & Cuisine",
    image: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=2070&auto=format&fit=crop",
    seed: "Plan a 10 day trip to Tokyo and Kyoto focusing on food and temples",
  },
  {
    title: "Amalfi Coast",
    subtitle: "7 days · Relaxation",
    image: "https://images.unsplash.com/photo-1533090161767-e6ffed986c88?q=80&w=2069&auto=format&fit=crop",
    seed: "Plan a 7 day relaxing trip to the Amalfi Coast",
  },
  {
    title: "Swiss Alps",
    subtitle: "5 days · Adventure",
    image: "https://images.unsplash.com/photo-1530122037265-a5f1f91d3b99?q=80&w=2070&auto=format&fit=crop",
    seed: "Plan a 5 day adventure trip to the Swiss Alps",
  },
];

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

function parseDateParts(dateStr: string): { day: string; month: string; year: string } {
  const d = new Date(`${dateStr}T12:00:00`);
  return {
    day: String(d.getDate()),
    month: d.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    year: String(d.getFullYear()),
  };
}

function tripNightCount(start: string, end: string): number {
  if (!start) return 0;
  const s = new Date(`${start}T12:00:00`);
  const e = end ? new Date(`${end}T12:00:00`) : s;
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / 86400000));
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

type Phase = "input" | "parsing" | "form" | "saving" | "generating";

export function TripFormParser({ initialPrompt = "", activeTrip = null }: { initialPrompt?: string; activeTrip?: ActiveTripCardData | null }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("input");
  const [generatingTripId, setGeneratingTripId] = useState<string | null>(null);
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
        setGeneratingTripId(body.id);
        setPhase("generating");
      }
    } catch {
      setError("Network error. Check your connection.");
      setPhase("form");
    }
  }, [form, router]);

  const selectedVibes = form.vibe.split(",").map((v) => v.trim()).filter(Boolean);

  // ─── PHASE: GENERATING ───────────────────────────────────────────────────────
  if (phase === "generating" && generatingTripId) {
    return (
      <ItineraryGenerationLoading
        tripId={generatingTripId}
        tripTitle={form.tripName || form.destination}
        onComplete={() => {
          router.replace(`/trip/${generatingTripId}/setup`);
        }}
        onError={(message) => {
          setError(message);
          setPhase("form");
          setGeneratingTripId(null);
        }}
      />
    );
  }

  // ─── PHASE: INPUT ────────────────────────────────────────────────────────────
  if (phase === "input" || phase === "parsing") {
    return (
      <TripInputCanvas
        phase={phase}
        freeText={freeText}
        setFreeText={setFreeText}
        images={images}
        removeImage={removeImage}
        handleImageUpload={handleImageUpload}
        fileInputRef={fileInputRef}
        error={error}
        parseInput={parseInput}
        skipToForm={skipToForm}
        activeTrip={activeTrip}
      />
    );
  }

  // ─── PHASE: FORM / SAVING — Boarding Pass ───────────────────────────────────────
  const departParts = form.dateStart ? parseDateParts(form.dateStart) : null;
  const returnParts = (form.dateEnd || form.dateStart) ? parseDateParts(form.dateEnd || form.dateStart) : null;
  const nights = tripNightCount(form.dateStart, form.dateEnd);
  const isReady = Boolean(form.destination.trim() && form.dateStart.trim());

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto" style={{ background: "#f4f7fc" }}>
      <div className="mx-auto max-w-2xl px-4 pb-10 pt-20 sm:px-6">
        {/* Step eyebrow — mirrors "Step 1/2 · Tell Us Anything" in input phase */}
        <p className="label-caps mb-6 text-[color:var(--on-surface-muted)]/70">Step 2/2 · Ready for Liftoff?</p>
        {/* ── TICKET CARD ── */}
        <div className="relative rounded-2xl bg-white shadow-[0_30px_60px_-20px_rgba(37,99,235,0.18),0_8px_18px_-8px_rgba(15,23,42,0.08)]">
          {/* Perforation notches */}
          <div aria-hidden className="absolute -left-2.5 z-10 rounded-full" style={{ top: "57%", width: 20, height: 20, background: "#f4f7fc", transform: "translateY(-50%)" }} />
          <div aria-hidden className="absolute -right-2.5 z-10 rounded-full" style={{ top: "57%", width: 20, height: 20, background: "#f4f7fc", transform: "translateY(-50%)" }} />
          {/* HEADER STRIP */}
          <div className="flex items-center justify-between rounded-t-2xl px-6 py-3" style={{ background: "var(--sage)" }}>
            <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white">
              <svg className="h-3.5 w-3.5 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
              </svg>
              <span className="font-display text-[15px] font-bold tracking-normal">Conci</span>
              <span className="opacity-60">· Boarding pass</span>
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => { setPhase("input"); setError(null); setActiveEdit(null); }}
                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition-colors"
                style={{ background: "rgba(255,255,255,0.15)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.25)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.15)"; }}
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Edit prompt
              </button>
            </div>
          </div>
          {/* BODY */}
          <div className="px-8 pb-8 pt-6">
            {/* Required eyebrow */}
            <div className="mb-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.24em]">
              <span style={{ color: "var(--sage)" }}>Required <span style={{ color: "var(--sage)" }}>*</span></span>
              <span style={{ color: "var(--on-surface-muted)" }}>Tap any field to edit</span>
            </div>
            {/* TITLE */}
            {activeEdit === "tripName" ? (
              <input autoFocus type="text" value={form.tripName}
                onChange={(e) => updateField("tripName", e.target.value)}
                onBlur={() => setActiveEdit(null)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setActiveEdit(null); } }}
                placeholder="Trip name…"
                className="mb-1 w-full bg-transparent font-display text-[50px] font-bold leading-tight tracking-tight text-[color:var(--on-surface)] outline-none placeholder:text-[color:var(--on-surface-muted)]/40 sm:text-[56px]"
              />
            ) : (
              <h1 onClick={() => setActiveEdit("tripName")}
                className="mb-1 cursor-text font-display text-[50px] font-bold leading-tight tracking-tight text-[color:var(--on-surface)] transition-colors hover:text-[color:var(--sage)] sm:text-[56px]">
                {form.tripName || (form.destination ? `${form.destination} Trip` : "Your trip")}
              </h1>
            )}
            {/* DESTINATION SUBTITLE */}
            <div className="mb-6 flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.22em]">
              {activeEdit === "destination" ? (
                <input autoFocus type="text" value={form.destination}
                  onChange={(e) => updateField("destination", e.target.value)}
                  onBlur={() => setActiveEdit(null)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setActiveEdit(null); } }}
                  placeholder="Destination"
                  className="bg-transparent text-[13px] font-bold uppercase tracking-[0.22em] text-[color:var(--on-surface)] outline-none border-b border-[color:var(--sage)] placeholder:text-[color:var(--on-surface-muted)]/40"
                />
              ) : (
                <span onClick={() => setActiveEdit("destination")}
                  className="cursor-text transition-colors hover:text-[color:var(--sage)]"
                  style={{ color: form.destination ? "var(--on-surface)" : "var(--on-surface-muted)" }}>
                  {form.destination ? form.destination.toUpperCase() : "ADD DESTINATION"}
                </span>
              )}
              <span style={{ color: "var(--sage)" }}>*</span>
              {nights > 0 && (
                <>
                  <span style={{ color: "var(--on-surface-muted)", opacity: 0.4 }}>·</span>
                  <span style={{ color: "var(--on-surface-muted)" }}>{nights} {nights === 1 ? "Night" : "Nights"}</span>
                </>
              )}
            </div>
            {/* BIG DATE BLOCK */}
            <div className="mb-2 cursor-pointer rounded-xl px-6 py-5 transition-colors"
              style={{ background: "color-mix(in srgb, var(--sage) 7%, white)" }}
              onClick={() => setActiveEdit(activeEdit === "dates" ? null : "dates")}>
              <div className="grid grid-cols-[1fr_40px_1fr] items-center">
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: "var(--on-surface-muted)" }}>Depart</p>
                  {departParts ? (
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-[38px] font-semibold leading-none tracking-tight text-[color:var(--on-surface)]">{departParts.day}</span>
                      <div>
                        <div className="text-base font-bold leading-none" style={{ color: "var(--sage)" }}>{departParts.month}</div>
                        <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--on-surface-muted)]">{departParts.year}</div>
                      </div>
                    </div>
                  ) : (
                    <span className="text-2xl font-light text-[color:var(--on-surface-muted)]/30">—</span>
                  )}
                </div>
                <div className="flex justify-center">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: "var(--sage)" }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </div>
                <div className="text-right">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: "var(--on-surface-muted)" }}>Return</p>
                  {returnParts ? (
                    <div className="flex items-baseline justify-end gap-2">
                      <div className="text-right">
                        <div className="text-base font-bold leading-none" style={{ color: "var(--sage)" }}>{returnParts.month}</div>
                        <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--on-surface-muted)]">{returnParts.year}</div>
                      </div>
                      <span className="font-display text-[38px] font-semibold leading-none tracking-tight text-[color:var(--on-surface)]">{returnParts.day}</span>
                    </div>
                  ) : (
                    <span className="text-2xl font-light text-[color:var(--on-surface-muted)]/30">—</span>
                  )}
                </div>
              </div>
              {activeEdit === "dates" && (
                <div className="mt-5 border-t pt-5"
                  style={{ borderColor: "color-mix(in srgb, var(--sage) 20%, transparent)" }}
                  onClick={(e) => e.stopPropagation()}>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--on-surface-muted)" }}>Start date</label>
                      <input autoFocus type="date" value={form.dateStart}
                        onChange={(e) => updateField("dateStart", e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); } }}
                        className="block w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none [color-scheme:light]"
                        style={{ borderColor: "var(--hairline)" }} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--on-surface-muted)" }}>End date</label>
                      <input type="date" value={form.dateEnd} min={form.dateStart || undefined}
                        onChange={(e) => updateField("dateEnd", e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); } }}
                        className="block w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none [color-scheme:light]"
                        style={{ borderColor: "var(--hairline)" }} />
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button type="button" onClick={() => setActiveEdit(null)}
                      className="rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
                      style={{ background: "var(--sage)" }}>Done</button>
                  </div>
                </div>
              )}
            </div>
            <p className="mb-6 text-right text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: "var(--sage)" }}>* Required</p>
            {/* DIVIDER */}
            <div className="mb-6 border-t border-dashed" aria-hidden style={{ borderColor: "var(--hairline-strong)" }} />
            {/* OPTIONAL EYEBROW */}
            <div className="mb-5 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.24em]" style={{ color: "var(--on-surface-muted)" }}>
              <span>Optional</span>
              <span>Tap to fill or skip</span>
            </div>
            {/* OPTIONAL ROWS */}
            <div className="space-y-4">
              {/* FLIGHT */}
              <div className="grid items-start gap-3" style={{ gridTemplateColumns: "100px 1fr" }}>
                <span className="pt-1.5 text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: "var(--on-surface-muted)" }}>Flight</span>
                <div className="flex flex-col gap-2">
                  <div className="inline-flex rounded-full p-0.5" style={{ border: "1px solid var(--hairline-strong)", background: "white" }}>
                    <button type="button"
                      onClick={() => { setForm((prev) => ({ ...prev, needsFlight: true })); setActiveEdit("flightCity"); }}
                      className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors"
                      style={form.needsFlight ? { background: "var(--sage)", color: "white" } : { color: "var(--on-surface-muted)" }}>
                      {form.departureCity ? `Flying from ${form.departureCity}` : "Flying from…"}
                    </button>
                    <button type="button"
                      onClick={() => { setForm((prev) => ({ ...prev, needsFlight: false, departureCity: "" })); setActiveEdit(null); }}
                      className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors"
                      style={!form.needsFlight ? { background: "var(--sage)", color: "white" } : { color: "var(--on-surface-muted)" }}>
                      No flight
                    </button>
                    <button type="button"
                      onClick={() => { setForm((prev) => ({ ...prev, needsFlight: false, departureCity: "" })); setActiveEdit(null); }}
                      className="rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.14em] transition-colors"
                      style={{ color: "rgba(100,116,139,0.55)", fontStyle: "italic" }}>
                      Skip
                    </button>
                  </div>
                  {form.needsFlight && activeEdit === "flightCity" && (
                    <input autoFocus type="text" value={form.departureCity}
                      onChange={(e) => updateField("departureCity", e.target.value)}
                      onBlur={() => setActiveEdit(null)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setActiveEdit(null); } }}
                      placeholder="City or airport code…"
                      className="rounded-lg border px-3 py-1.5 text-sm outline-none transition-colors"
                      style={{ borderColor: "var(--sage)", background: "white" }} />
                  )}
                </div>
              </div>
              {/* TRAVELERS */}
              <div className="grid items-start gap-3" style={{ gridTemplateColumns: "100px 1fr" }}>
                <span className="pt-1.5 text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: "var(--on-surface-muted)" }}>Travelers</span>
                <div className="flex flex-col gap-2">
                  <div className="inline-flex rounded-full p-0.5" style={{ border: "1px solid var(--hairline-strong)", background: "white" }}>
                    <button type="button" onClick={() => setActiveEdit(activeEdit === "travelers" ? null : "travelers")}
                      className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors"
                      style={form.people ? { background: "var(--sage)", color: "white" } : { color: "var(--on-surface-muted)" }}>
                      {form.people ? `${form.people} ${Number(form.people) === 1 ? "Traveler" : "Travelers"}` : "Set count"}
                    </button>
                    <button type="button" onClick={() => { updateField("people", ""); setActiveEdit(null); }}
                      className="rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.14em] transition-colors"
                      style={{ color: "rgba(100,116,139,0.55)", fontStyle: "italic" }}>Skip</button>
                  </div>
                  {activeEdit === "travelers" && (
                    <input autoFocus type="number" min={1} max={50} value={form.people}
                      onChange={(e) => updateField("people", e.target.value)}
                      onBlur={() => setActiveEdit(null)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setActiveEdit(null); } }}
                      placeholder="How many?"
                      className="rounded-lg border px-3 py-1.5 text-sm outline-none transition-colors"
                      style={{ borderColor: "var(--sage)", background: "white" }} />
                  )}
                </div>
              </div>
              {/* BUDGET */}
              <div className="grid items-start gap-3" style={{ gridTemplateColumns: "100px 1fr" }}>
                <span className="pt-1.5 text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: "var(--on-surface-muted)" }}>Budget</span>
                <div className="flex flex-col gap-2">
                  <div className="inline-flex rounded-full p-0.5" style={{ border: "1px solid var(--hairline-strong)", background: "white" }}>
                    <button type="button" onClick={() => setActiveEdit(activeEdit === "budget" ? null : "budget")}
                      className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors"
                      style={form.budget ? { background: "var(--sage)", color: "white" } : { color: "var(--on-surface-muted)" }}>
                      {form.budget ? `${form.budget.startsWith("$") ? "" : "$"}${form.budget} / head` : "Set budget"}
                    </button>
                    <button type="button" onClick={() => { updateField("budget", ""); setActiveEdit(null); }}
                      className="rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.14em] transition-colors"
                      style={{ color: "rgba(100,116,139,0.55)", fontStyle: "italic" }}>Skip</button>
                  </div>
                  {activeEdit === "budget" && (
                    <input autoFocus type="text" value={form.budget}
                      onChange={(e) => updateField("budget", e.target.value)}
                      onBlur={() => setActiveEdit(null)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setActiveEdit(null); } }}
                      placeholder="e.g. 3,000"
                      className="rounded-lg border px-3 py-1.5 text-sm outline-none transition-colors"
                      style={{ borderColor: "var(--sage)", background: "white" }} />
                  )}
                </div>
              </div>
              {/* VIBES */}
              <div className="grid gap-3" style={{ gridTemplateColumns: "100px 1fr" }}>
                <span className="pt-1 text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: "var(--on-surface-muted)" }}>Vibes</span>
                <div className="flex flex-wrap gap-1.5">
                  {VIBE_OPTIONS.map((v) => (
                    <button key={v} type="button" onClick={() => toggleVibe(v)}
                      className="rounded-full border px-3 py-1 text-[11px] font-semibold capitalize transition-all"
                      style={selectedVibes.includes(v)
                        ? { borderColor: "var(--sage)", background: "color-mix(in srgb, var(--sage) 12%, white)", color: "var(--sage)" }
                        : { borderColor: "var(--hairline-strong)", background: "white", color: "var(--on-surface-muted)" }}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              {/* PACE */}
              <div className="grid items-center gap-3" style={{ gridTemplateColumns: "100px 1fr" }}>
                <span className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: "var(--on-surface-muted)" }}>Pace</span>
                <div className="inline-flex rounded-full p-0.5" style={{ border: "1px solid var(--hairline-strong)", background: "white" }}>
                  {PACE_OPTIONS.map((p) => (
                    <button key={p} type="button" onClick={() => updateField("pace", form.pace === p ? "" : p)}
                      className="rounded-full px-3 py-1 text-[11px] font-semibold capitalize transition-colors"
                      style={form.pace === p ? { background: "var(--sage)", color: "white" } : { color: "var(--on-surface-muted)" }}>
                      {p}
                    </button>
                  ))}
                  <button type="button" onClick={() => updateField("pace", "")}
                    className="rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.14em] transition-colors"
                    style={{ color: "rgba(100,116,139,0.55)", fontStyle: "italic" }}>Skip</button>
                </div>
              </div>
              {/* NOTES */}
              <div className="grid gap-3" style={{ gridTemplateColumns: "100px 1fr" }}>
                <span className="pt-2 text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: "var(--on-surface-muted)" }}>Anything else?</span>
                <div className="cursor-text rounded-lg px-3 py-2 transition-colors"
                  style={{ border: "1px dashed", borderColor: (form.interests || activeEdit === "notes") ? "var(--sage)" : "color-mix(in srgb, var(--sage) 45%, transparent)", minHeight: 68, background: "white" }}
                  onClick={() => { if (activeEdit !== "notes") setActiveEdit("notes"); }}>
                  {activeEdit === "notes" ? (
                    <textarea autoFocus rows={3} value={form.interests}
                      onChange={(e) => updateField("interests", e.target.value)}
                      onBlur={() => setActiveEdit(null)}
                      onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
                      className="block w-full resize-none bg-transparent text-sm leading-relaxed text-[color:var(--on-surface)] outline-none" />
                  ) : form.interests ? (
                    <p className="font-display text-sm italic leading-relaxed" style={{ color: "var(--on-surface-variant)" }}>
                      &ldquo;{form.interests}&rdquo;
                    </p>
                  ) : (
                    <p className="text-sm" style={{ color: "color-mix(in srgb, var(--sage) 55%, rgba(100,116,139,0.4))" }}>
                      + Tap to add… or leave blank
                    </p>
                  )}
                </div>
              </div>
            </div>
            {error && (
              <div className="mt-5 flex items-center gap-2 text-sm text-red-600">
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                {error}
              </div>
            )}
          </div>
          {/* BOTTOM BAR */}
          <div className="flex items-stretch overflow-hidden rounded-b-2xl">
            <div className="flex-1 px-7 py-4" style={{ background: "var(--on-surface)" }}>
              {isReady ? (
                <>
                  <div className="text-[9px] font-semibold uppercase tracking-[0.3em] text-white/55">Ready</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-white">
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-400" aria-hidden />
                    Required fields complete
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[9px] font-semibold uppercase tracking-[0.3em] text-white/55">Waiting</div>
                  <div className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.22em] text-white/50">
                    {!form.destination.trim() ? "Add a destination" : "Add travel dates"}
                  </div>
                </>
              )}
            </div>
            <button type="button" onClick={handleSubmit}
              disabled={phase === "saving" || !isReady}
              className="group flex items-center justify-center gap-3 px-8 text-[13px] font-bold uppercase tracking-[0.22em] text-white transition-all hover:tracking-[0.28em] disabled:opacity-50"
              style={{ background: "var(--sage)", minWidth: 160 }}>
              {phase === "saving" ? (
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Building…
                </span>
              ) : (
                <>Build trip<span aria-hidden className="transition-transform group-hover:translate-x-1">&#9656;</span></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type TripInputCanvasProps = {
  phase: Phase;
  freeText: string;
  setFreeText: (s: string) => void;
  images: string[];
  removeImage: (idx: number) => void;
  handleImageUpload: (files: FileList | null) => Promise<void>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  error: string | null;
  parseInput: () => void;
  skipToForm: () => void;
  activeTrip: ActiveTripCardData | null;
};

function TripInputCanvas({
  phase,
  freeText,
  setFreeText,
  images,
  removeImage,
  handleImageUpload,
  fileInputRef,
  error,
  parseInput,
  skipToForm,
  activeTrip,
}: TripInputCanvasProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [ghostIndex, setGhostIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const hasContent = freeText.length > 0;
  const isComposing = isFocused || hasContent;
  const isParsing = phase === "parsing";

  useEffect(() => {
    if (isComposing) return;
    const id = window.setInterval(() => {
      setGhostIndex((i) => (i + 1) % GHOST_PROMPTS.length);
    }, 5200);
    return () => window.clearInterval(id);
  }, [isComposing]);

  const selectPreset = useCallback((seed: string) => {
    setFreeText(seed);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    });
  }, [setFreeText]);

  return (
    <>
      {/* Portal to document.body — lives in root stacking context so z-[55] actually beats the nav's z-50 */}
      {mounted && createPortal(
        <div
          aria-hidden
          className={`pointer-events-none fixed inset-x-0 top-0 z-[55] h-28 bg-white transition-opacity duration-500 ease-out dark:bg-[#0a0a0a] ${isComposing ? "opacity-100" : "opacity-0"}`}
        />,
        document.body
      )}
    <div className="fixed inset-0 z-40 overflow-y-auto bg-white dark:bg-[#0a0a0a]">
      <TripCanvasBackdrop />

      {/* Top hairline */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--hairline-strong)] to-transparent" />

      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-3xl flex-col px-6 sm:px-10">
        {/* Eyebrow */}
        <div className="flex items-center justify-end pt-20 sm:pt-20">
          <span className="label-caps text-[color:var(--on-surface-muted)]/70">Step 1/2 · Tell Us Anything</span>
        </div>

        {/* Input block — glides upward on focus/content */}
        <div
          className={`relative transition-[padding-top] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            isComposing ? "pt-10 sm:pt-14" : "pt-[14vh] sm:pt-[18vh]"
          }`}
        >
          <p
            className={`label-caps mb-5 transition-colors duration-500 ${
              "text-[color:var(--sage)]"
            }`}
          >
            {isComposing ? "Tell us about your trip" : "Type a little or a lot. Conci will do the rest."}
          </p>

          {/* Ghost cycling prompts + real textarea */}
          <div className="relative">
            <div
              aria-hidden
              className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${
                isComposing ? "opacity-0" : "opacity-100"
              }`}
            >
              {GHOST_PROMPTS.map((prompt, i) => (
                <p
                  key={i}
                  className={`absolute inset-0 font-display text-[1.55rem] sm:text-[2rem] leading-snug tracking-tight transition-opacity duration-1000 ease-out ${
                    i === ghostIndex ? "opacity-100" : "opacity-0"
                  }`}
                  style={{ color: "color-mix(in oklab, var(--sage) 24%, var(--on-surface-muted) 22%)" }}
                >
                  {prompt}
                </p>
              ))}
            </div>

            <textarea
              ref={textareaRef}
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); void handleImageUpload(e.dataTransfer.files); }}
              rows={isComposing ? 6 : 4}
              aria-label="Describe your trip"
              className="relative block w-full resize-none border-0 bg-transparent p-0 font-display text-[1.55rem] sm:text-[2rem] leading-snug tracking-tight text-[color:var(--on-surface)] outline-none transition-[height] duration-500 placeholder:text-transparent focus:outline-none focus:ring-0 dark:text-white"
            />

            {/* Focus hairline */}
            <div
              aria-hidden
              className={`pointer-events-none mt-2 h-px origin-left bg-[color:var(--sage)]/50 transition-transform duration-700 ease-out ${
                isComposing ? "scale-x-100" : "scale-x-0"
              }`}
            />

            {/* Drag-over ring */}
            {isDragging && (
              <div className="pointer-events-none absolute inset-0 -m-3 rounded-3xl border-2 border-dashed border-[color:var(--sage)]/60 bg-[color:var(--sage)]/[0.04]" />
            )}
          </div>

          {/* Action row */}
          <div
            className={`mt-8 transition-all duration-700 ease-out ${
              isComposing ? "opacity-100 translate-y-0" : "opacity-60 translate-y-1"
            }`}
          >
            {error && (
              <div className="mb-4 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                {error}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <button
                type="button"
                onClick={parseInput}
                disabled={isParsing}
                className={`rounded-full px-7 py-3 text-sm ${primaryFilledInteractive} ${primaryFocusRing} disabled:opacity-50`}
              >
                {isParsing ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                    Reading your idea…
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">Continue <span aria-hidden>→</span></span>
                )}
              </button>

              <button
                type="button"
                onClick={skipToForm}
                className="text-sm text-[color:var(--on-surface-muted)] transition-colors hover:text-[color:var(--on-surface)] dark:hover:text-neutral-200"
              >
                Skip — fill in manually
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="ml-auto inline-flex items-center gap-2 text-sm text-[color:var(--on-surface-muted)] transition-colors hover:text-[color:var(--sage)]"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                Add screenshots
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => void handleImageUpload(e.target.files)}
            />

            {images.length > 0 && (
              <div className="mt-5 flex gap-3">
                {images.map((url, i) => (
                  <div key={i} className="relative">
                    <img src={url} alt={`Upload ${i + 1}`} className="h-16 w-16 rounded-2xl object-cover ring-1 ring-[color:var(--hairline)] dark:ring-white/10" />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      aria-label={`Remove image ${i + 1}`}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--on-surface)] text-xs text-[color:var(--surface)] shadow-md transition hover:bg-red-500 dark:bg-neutral-600 dark:hover:bg-red-500"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Cards + presets — fade out when composing ── */}
        <div
          className={`pb-16 transition-all duration-500 ease-out ${
            isComposing
              ? "pointer-events-none translate-y-2 opacity-0"
              : "translate-y-0 opacity-100"
          }`}
          aria-hidden={isComposing}
        >
          {/* Hairline divider */}
          <div aria-hidden className="my-10 h-px bg-[color:var(--hairline)]" />

          {/* Collaborate + Active Trips row */}
          <div className="grid gap-4 sm:grid-cols-2">
            <TripParserJoinCta />
            <TripParserActiveTripCard data={activeTrip} />
          </div>

          {/* Preset photo cards */}
          <div className="mt-8">
            <p className="label-caps mb-4 text-[color:var(--sage)]">Or start from a sketch</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {PRESETS.map((preset) => (
                <button
                  key={preset.title}
                  type="button"
                  onClick={() => selectPreset(preset.seed)}
                  className="group relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-neutral-900"
                >
                  <NextImage
                    src={preset.image}
                    alt={preset.title}
                    fill
                    sizes="(max-width: 640px) 100vw, 33vw"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                  <div className="absolute bottom-0 left-0 p-4">
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-white/70">
                      {preset.subtitle}
                    </p>
                    <h3 className="font-display text-base font-medium text-white">
                      {preset.title}
                    </h3>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
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
