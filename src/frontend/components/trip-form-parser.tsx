"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TripPlan } from "@/shared/trip-plan";
import { planHasUsableTripTiming } from "@/shared/trip-plan";

type FormData = {
  tripName: string;
  destination: string;
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
  if (form.departureCity) lines.push(`Departing from: ${form.departureCity}`);
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
        departureCity: parsed.departureCity || "",
        dateStart: extractIsoDate(parsed.dates?.options?.[0], "start") || "",
        dateEnd: extractIsoDate(parsed.dates?.options?.[0], "end") || "",
        people: parsed.people?.count ? String(parsed.people.count) : "",
        budget: parsed.budget?.perPerson || parsed.budget?.tier || "",
        vibe: Array.isArray(parsed.vibe) ? parsed.vibe.join(", ") : "",
        interests: "",
        pace: "",
      });
      setPhase("form");
    } catch {
      setError("Something went wrong parsing your input.");
      setPhase("input");
    }
  }, [freeText, images]);

  const skipToForm = useCallback(() => {
    setError(null);
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

  // --- PHASE: INPUT (screenshots + text) ---
  if (phase === "input" || phase === "parsing") {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-5">
        <header>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-[#ebe9e4] sm:text-4xl">
            Plan a trip
          </h1>
          <p className="mt-2 text-sm font-light text-slate-400 dark:text-neutral-500">
            Paste screenshots of group chats, type details, or both. We&apos;ll extract everything and let you confirm.
          </p>
        </header>

        {/* Image upload area */}
        <div>
          <div
            className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-5 transition-all duration-200 hover:border-dashed hover:border-slate-400 hover:bg-slate-50/50 dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-white/20 dark:hover:bg-white/[0.04]"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); void handleImageUpload(e.dataTransfer.files); }}
          >
            <svg className="h-4 w-4 shrink-0 text-slate-400 transition-colors duration-200 group-hover:text-slate-600 dark:text-neutral-500 dark:group-hover:text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <div>
              <p className="text-sm text-slate-600 dark:text-neutral-400">
                Drop screenshots here or{" "}
                <span className="font-medium text-indigo-600 underline underline-offset-2 dark:text-indigo-400">click to upload</span>
              </p>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-neutral-600">
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
                <img src={url} alt={`Upload ${i + 1}`} className="h-20 w-20 rounded-[16px] object-cover ring-1 ring-slate-200 dark:ring-white/10" />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-xs text-white shadow-md transition hover:bg-red-500 dark:bg-neutral-600 dark:hover:bg-red-500"
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
          className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm leading-relaxed text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400/70 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 dark:border-white/10 dark:bg-white/[0.02] dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:border-white/20 dark:focus:ring-white/5"
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
            className="w-full rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-indigo-500 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {phase === "parsing" ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Parsing...
              </span>
            ) : (
              "Parse & continue"
            )}
          </button>
          <div className="text-center">
            <button
              type="button"
              onClick={skipToForm}
              className="text-sm text-slate-400 transition-colors duration-150 hover:text-slate-600 dark:text-neutral-500 dark:hover:text-neutral-300"
            >
              Skip — fill in manually
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- PHASE: FORM (pre-filled or manual) ---
  return (
    <div className="mx-auto w-full max-w-2xl space-y-8">
      <header>
        <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-[#ebe9e4] sm:text-3xl">
          Confirm trip details
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-neutral-400">
          We extracted what we could. Fix anything that&apos;s wrong, fill in the gaps.
        </p>
      </header>

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300">
            Trip name <span className="text-slate-400 dark:text-neutral-500">(optional)</span>
          </label>
          <input
            type="text"
            value={form.tripName}
            onChange={(e) => updateField("tripName", e.target.value)}
            placeholder="e.g. Miami Summer Trip"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300">
            Where are you going? <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.destination}
            onChange={(e) => updateField("destination", e.target.value)}
            placeholder="e.g. Miami, Barcelona, Tokyo"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300">
            Where are you leaving from?
          </label>
          <input
            type="text"
            value={form.departureCity}
            onChange={(e) => updateField("departureCity", e.target.value)}
            placeholder="e.g. Los Angeles, LAX, NYC"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300">
              Start date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={form.dateStart}
              onChange={(e) => updateField("dateStart", e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300">
              End date
            </label>
            <input
              type="date"
              value={form.dateEnd}
              onChange={(e) => updateField("dateEnd", e.target.value)}
              min={form.dateStart || undefined}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-100"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300">
            How many people?
          </label>
          <input
            type="number"
            min={1}
            max={50}
            value={form.people}
            onChange={(e) => updateField("people", e.target.value)}
            placeholder="e.g. 4"
            className="mt-1 w-32 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300">
            Budget per person
          </label>
          <input
            type="text"
            value={form.budget}
            onChange={(e) => updateField("budget", e.target.value)}
            placeholder="e.g. $1500, budget-friendly, splurge"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300">
            Vibe
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {VIBE_OPTIONS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => toggleVibe(v)}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                  selectedVibes.includes(v)
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-950/40 dark:text-indigo-300"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-400 dark:hover:border-white/20"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300">
            Must-do activities <span className="text-slate-400 dark:text-neutral-500">(optional)</span>
          </label>
          <input
            type="text"
            value={form.interests}
            onChange={(e) => updateField("interests", e.target.value)}
            placeholder="e.g. snorkeling, street food, nightlife, museums"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300">
            Pace
          </label>
          <div className="mt-2 flex gap-2">
            {PACE_OPTIONS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => updateField("pace", form.pace === p ? "" : p)}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium capitalize transition ${
                  form.pace === p
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-950/40 dark:text-indigo-300"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-400 dark:hover:border-white/20"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={phase === "saving"}
          className="flex-1 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          {phase === "saving" ? "Creating trip..." : "Generate trip plan"}
        </button>
        <button
          type="button"
          onClick={() => { setPhase("input"); setError(null); }}
          className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
        >
          Back
        </button>
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
