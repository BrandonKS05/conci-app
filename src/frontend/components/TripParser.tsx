"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import NextImage from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { getSupabaseClient } from "@/frontend/supabase/client";
import type { TripPlan } from "@/shared/trip-plan";
import { firstNameFromUserMetadata } from "@/shared/user-display-name";
import { TRIP_PARSER_SYSTEM_PROMPT } from "@/shared/trip-parser-system-prompt";
import {
  applyDatesSlotToPlan,
  applyUserAnchoredTripDates,
  isDatesSlotTbdValue,
  planHasUsableTripTiming,
  groundPlanInUserInput,
  isLocationVague,
  normalizePlan,
  retainPeopleNamesOnlyIfMentionedInInput,
  safeParseJson,
} from "@/shared/trip-plan";
import { primaryFilledInteractive } from "@/frontend/ui/primary-action";
import { InlinePlacePreviewCards } from "@/frontend/components/inline-place-preview-cards";
import { PlacePickCards } from "@/frontend/components/place-pick-cards";
import type { PlacePreview, PlacePreviewBlock, PlaceSpotlight } from "@/shared/place-preview";
import type { PlacePreviewResponse, PlaceSearchDisambiguateEvent, PlaceSearchEvent } from "@/shared/place-search-events";
import {
  GIBBERISH_SLOT_REPLY,
  INVALID_TRIP_INPUT_REPLY,
  isClearlyGibberish,
  looksLikeMeaninglessTripSeed,
  looksLikeStandalonePeopleCount,
} from "@/shared/trip-input-quality";
import { buildBudgetSoftWarning } from "@/shared/budget-trip-soft-warning";

type SlotKey = "location" | "dates" | "people" | "budget" | "vibe" | "interests" | "pace";

const REQUIRED_SLOT_ORDER: SlotKey[] = ["location", "dates", "people", "budget", "vibe"];
const OPTIONAL_SLOT_ORDER: SlotKey[] = ["interests", "pace"];
const SLOT_ORDER: SlotKey[] = [...REQUIRED_SLOT_ORDER, ...OPTIONAL_SLOT_ORDER];

const SLOT_QUESTIONS: Record<SlotKey, string> = {
  location: "Where are you headed—or any region you’re eyeing?",
  dates: "Roughly when should this trip fall—even a season or month is fine?",
  people: "How many people are coming?",
  budget: "What’s your budget per person (rough range is fine)?",
  vibe: "What’s the vibe—party, chill, culture, outdoors?",
  interests: "Any must-do activities? (e.g. hiking, food tours, nightlife, museums, shopping)",
  pace: "Packed schedule or relaxed with free time?",
};

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function missingSlots(slots: Partial<Record<SlotKey, string>>): SlotKey[] {
  return SLOT_ORDER.filter((k) => !(slots[k] ?? "").trim());
}

function missingRequiredSlots(slots: Partial<Record<SlotKey, string>>): SlotKey[] {
  return REQUIRED_SLOT_ORDER.filter((k) => !(slots[k] ?? "").trim());
}

function missingOptionalSlots(slots: Partial<Record<SlotKey, string>>): SlotKey[] {
  return OPTIONAL_SLOT_ORDER.filter((k) => !(slots[k] ?? "").trim());
}

/** Map structured plan JSON into chat slot strings so we only ask for gaps the model didn't extract. */
function slotsFromPlan(plan: TripPlan): Partial<Record<SlotKey, string>> {
  const out: Partial<Record<SlotKey, string>> = {};

  if (plan.location?.trim() && !isLocationVague(plan.location)) {
    out.location = plan.location.trim();
  }

  const usableDateLines = plan.dates.options.filter(
    (d) => d.trim().length > 0 && !isDatesSlotTbdValue(d)
  );
  if (usableDateLines.length > 0) {
    out.dates = usableDateLines.join("; ");
  }

  const names = plan.people.names.filter(Boolean);
  if (plan.people.count != null && plan.people.count > 0) {
    const n = plan.people.count;
    out.people = names.length ? `${n} (${names.join(", ")})` : `${n} traveler${n === 1 ? "" : "s"}`;
  } else if (names.length > 0) {
    out.people =
      names.length === 1 ? names[0] : `${names.length} people: ${names.join(", ")}`;
  }

  const tier = plan.budget.tier?.trim();
  const pp = plan.budget.perPerson?.trim();
  if (tier || pp) {
    out.budget = [tier, pp].filter(Boolean).join(" · ");
  }

  if (plan.vibe.length > 0) {
    out.vibe = plan.vibe.join(", ");
  }

  return out;
}

function formatDateRangeLabel(isoStart: string, isoEnd: string): string {
  const start = isoStart.trim();
  const endRaw = (isoEnd || "").trim() || start;
  const s = new Date(`${start}T12:00:00`);
  const e = new Date(`${endRaw}T12:00:00`);
  if (Number.isNaN(s.getTime())) return start;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  if (start === endRaw || Number.isNaN(e.getTime()) || s.getTime() === e.getTime()) {
    return s.toLocaleDateString("en-US", opts);
  }
  return `${s.toLocaleDateString("en-US", opts)} – ${e.toLocaleDateString("en-US", opts)}`;
}

function mergeSpotlightsFromRef(plan: TripPlan, draftRef: { current: PlaceSpotlight[] }): TripPlan {
  const d = draftRef.current;
  if (!d.length) return plan;
  const merged = [...(plan.spotlights ?? [])];
  const seen = new Set(merged.map((s) => s.mapsUrl));
  for (const s of d) {
    if (seen.has(s.mapsUrl)) continue;
    seen.add(s.mapsUrl);
    merged.push(s);
  }
  return { ...plan, spotlights: merged.length ? merged : plan.spotlights };
}

function composeTripPrompt(seed: string, slots: Partial<Record<SlotKey, string>>): string {
  const lines = [
    "Trip idea:",
    seed.trim(),
    "",
    "Confirmed details from our chat:",
    ...SLOT_ORDER.filter((k) => (slots[k] ?? "").trim()).map(
      (k) => `• ${k}: ${(slots[k] ?? "").trim()}`
    ),
  ];
  return lines.join("\n");
}

/** After a slot answer: only when more slots remain. Never claim “one more” if several are left. */
function ackAfterFilledSlot(remainingSlotCount: number): string | null {
  if (remainingSlotCount <= 0) return null;
  if (remainingSlotCount === 1) {
    return "Sounds good — one question left.";
  }
  return `Sounds good — ${remainingSlotCount} more questions to go (I'll ask them one at a time).`;
}

const ACK_BEFORE_PLAN =
  "I'll turn what we have into your plan — takes a few seconds.";

const PARSE_OR_NET_FAIL_REPLY =
  "I couldn’t turn that into a trip yet. Add a destination or rough dates and try again.";

function generateTripPersistId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `trip-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function imageFileToJpegDataUrl(file: File, maxEdge = 1280, quality = 0.75): Promise<string | null> {
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
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

type PlacePickState = {
  query: string;
  options: PlacePreview[];
  resolved: boolean;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  placeBlocks?: PlacePreviewBlock[];
  placePick?: PlacePickState;
};

export default function TripParser({ anthropicApiKey }: { anthropicApiKey?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [composerText, setComposerText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [slots, setSlots] = useState<Partial<Record<SlotKey, string>>>({});
  const [seedMessage, setSeedMessage] = useState("");
  /** After first send: intro + chip picker until user answers one question from chips. */
  const [awaitingFirstChipAnswer, setAwaitingFirstChipAnswer] = useState(false);
  const [activeSlot, setActiveSlot] = useState<SlotKey | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [dateSlotMode, setDateSlotMode] = useState<"specific" | "rough">("specific");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [dateSlotError, setDateSlotError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"chat" | "building">("chat");
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefetchingSlots, setPrefetchingSlots] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [firstName, setFirstName] = useState("there");
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [imageSlots, setImageSlots] = useState<{ id: string; dataUrl: string; name: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recogRef = useRef<{ stop: () => void; abort?: () => void } | null>(null);

  const threadRef = useRef<HTMLDivElement>(null);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);
  const persistClientId = useRef<string>(generateTripPersistId());
  const placePickResolverRef = useRef<(() => void) | null>(null);
  const draftSpotlightsRef = useRef<PlaceSpotlight[]>([]);

  const missing = useMemo(() => missingRequiredSlots(slots), [slots]);

  const resolvePlacePickFlow = useCallback((messageId: string, picked: PlacePreview | null) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.placePick || m.placePick.resolved) return m;
        const q = m.placePick.query;
        if (picked) {
          draftSpotlightsRef.current = [...draftSpotlightsRef.current, { ...picked, sourceQuery: q }];
        }
        return {
          ...m,
          placePick: { ...m.placePick, resolved: true },
          text: picked
            ? `${m.text}\n\nYou chose: ${picked.name}.`
            : `${m.text}\n\nSkipped — continuing.`,
        };
      })
    );
    queueMicrotask(() => {
      placePickResolverRef.current?.();
      placePickResolverRef.current = null;
    });
  }, []);

  useEffect(() => {
    if (activeSlot !== "dates") {
      setDateSlotMode("specific");
      setDateStart("");
      setDateEnd("");
      setDateSlotError(null);
    }
  }, [activeSlot]);

  const consumePlacePreviewResponse = useCallback(
    async (json: unknown, opts: { userBubbleId: string | null; placeTextHint: string }) => {
      const events: PlaceSearchEvent[] =
        json && typeof json === "object" && Array.isArray((json as PlacePreviewResponse).events)
          ? ((json as PlacePreviewResponse).events as PlaceSearchEvent[])
          : [];

      for (const ev of events) {
        if (ev.kind === "confirmed") {
          draftSpotlightsRef.current = [...draftSpotlightsRef.current, { ...ev.place, sourceQuery: ev.query }];
          if (opts.userBubbleId) {
            const block: PlacePreviewBlock = { query: ev.query, items: [ev.place] };
            setMessages((prev) =>
              prev.map((m) => (m.id === opts.userBubbleId ? { ...m, placeBlocks: [block] } : m))
            );
          }
        }
      }

      const dis = events.find((e): e is PlaceSearchDisambiguateEvent => e.kind === "disambiguate");
      if (dis?.options?.length) {
        await new Promise<void>((resolve) => {
          placePickResolverRef.current = () => resolve();
          const disId = newId();
          setMessages((prev) => [
            ...prev,
            {
              id: disId,
              role: "assistant",
              text: dis.message,
              placePick: { query: dis.query, options: dis.options, resolved: false },
            },
          ]);
        });
      }
    },
    []
  );

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return undefined;
    const apply = (meta: Record<string, unknown> | undefined, email: string | null | undefined) => {
      setFirstName(firstNameFromUserMetadata(meta, email ?? null));
    };
    void sb.auth.getUser().then(({ data: { user } }) => {
      apply(user?.user_metadata as Record<string, unknown> | undefined, user?.email);
    });
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_e, session) => {
      const u = session?.user;
      apply(u?.user_metadata as Record<string, unknown> | undefined, u?.email);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    return () => {
      try {
        recogRef.current?.stop();
      } catch {
        //
      }
    };
  }, []);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, phase, activeSlot, awaitingFirstChipAnswer, prefetchingSlots]);

  useEffect(() => {
    if (activeSlot && replyInputRef.current) {
      replyInputRef.current.focus();
    }
  }, [activeSlot]);

  /** Save draft trip and go to host calendar setup. Returns true only when navigation runs. */
  const persistAndRedirectToHostSetup = useCallback(
    async (planToSave: TripPlan): Promise<boolean> => {
      if (!seedMessage) return false;
      if (!planHasUsableTripTiming(planToSave)) {
        setSaveError(
          "Add a rough timing window—season, month, or dates—before saving the trip."
        );
        return false;
      }
      setSaveBusy(true);
      setSaveError(null);
      try {
        const res = await fetch("/api/trip-plans", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: persistClientId.current,
            plan: planToSave,
            seedText: seedMessage,
            hostSetupDraft: true,
          }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          detail?: string;
          code?: string;
          id?: string;
        };
        if (!res.ok) {
          console.error("[Conci Supabase] Save plan failed:", {
            status: res.status,
            error: body.error,
            detail: body.detail,
            code: body.code,
          });
          if (res.status === 401) {
            router.push(`/auth?next=${encodeURIComponent(pathname || "/trip-parser")}`);
            return false;
          }
          if (res.status === 402 || body.code === "subscription_required") {
            router.push("/pricing");
            return false;
          }
          setSaveError(
            [body.error, body.detail].filter(Boolean).join(" ") || "Could not save plan to Supabase."
          );
          return false;
        }
        if (body.id) {
          fetch(`/api/trip-plans/${body.id}/generate-itinerary`, {
            method: "POST",
            credentials: "include",
          }).catch(() => {});
          router.replace(`/trip/${body.id}/setup`);
          return true;
        }
        return false;
      } catch (e) {
        console.error("[Conci Supabase] Save plan request threw:", e);
        setSaveError("Could not save plan. Check your connection and Supabase setup.");
        return false;
      } finally {
        setSaveBusy(false);
      }
    },
    [seedMessage, router, pathname]
  );

  const confirmPlan = useCallback(async () => {
    if (!plan) return;
    await persistAndRedirectToHostSetup(plan);
  }, [plan, persistAndRedirectToHostSetup]);

  const fetchParsedPlan = useCallback(
    async (text: string, imageDataUrls?: string[]): Promise<TripPlan> => {
      const trimmed = text.trim();
      if (!trimmed && !(imageDataUrls?.length)) {
        throw new Error("Empty input.");
      }

      let outputText = "";
      if (anthropicApiKey) {
        const directResponse = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicApiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1200,
            system: TRIP_PARSER_SYSTEM_PROMPT,
            messages: [
              {
                role: "user",
                content:
                  trimmed ||
                  (imageDataUrls?.length
                    ? "(Images attached — infer a trip plan from the user's photos and any notes.)"
                    : ""),
              },
            ],
          }),
        });

        if (!directResponse.ok) {
          const body = await directResponse.text();
          throw new Error(`Anthropic request failed (${directResponse.status}): ${body}`);
        }

        const payload = (await directResponse.json()) as {
          content?: Array<{ type?: string; text?: string }>;
        };
        outputText = payload.content?.find((block) => block?.type === "text")?.text || "";
      } else {
        const response = await fetch("/api/trip-parser", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            input: trimmed,
            ...(imageDataUrls?.length ? { images: imageDataUrls } : {}),
          }),
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`Trip parser API failed (${response.status}): ${body}`);
        }

        const payload = (await response.json()) as {
          outputText?: string;
        };
        outputText = payload.outputText || "";
      }

      const inputForRetain = [trimmed, ...(imageDataUrls?.length ? ["[images attached]"] : [])]
        .filter(Boolean)
        .join("\n");
      let plan = groundPlanInUserInput(
        retainPeopleNamesOnlyIfMentionedInInput(normalizePlan(safeParseJson(outputText)), inputForRetain),
        trimmed
      );
      plan = applyUserAnchoredTripDates(plan, inputForRetain);
      return plan;
    },
    [anthropicApiKey]
  );

  const stopVoice = useCallback(() => {
    try {
      recogRef.current?.stop();
    } catch {
      //
    }
    recogRef.current = null;
    setVoiceListening(false);
  }, []);

  const toggleVoice = useCallback(() => {
    if (voiceListening) {
      stopVoice();
      return;
    }
    if (typeof window === "undefined") return;
    type RecInstance = {
      lang: string;
      interimResults: boolean;
      continuous: boolean;
      onresult: ((ev: { resultIndex: number; results: { length: number; [k: number]: { 0: { transcript: string } } } }) => void) | null;
      onerror: (() => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
    };
    type RecCtor = new () => RecInstance;
    const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setVoiceNote("Voice typing isn't supported in this browser yet.");
      return;
    }
    setVoiceNote(null);
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (ev) => {
      let chunk = "";
      for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
        chunk += ev.results[i]?.[0]?.transcript ?? "";
      }
      if (chunk) {
        setComposerText((prev) => {
          const base = prev.trimEnd();
          const t = chunk.trim();
          return base ? `${base} ${t}` : t;
        });
      }
    };
    rec.onerror = () => {
      setVoiceNote("Voice capture hit a snag. Try again or type instead.");
      setVoiceListening(false);
    };
    rec.onend = () => {
      setVoiceListening(false);
      recogRef.current = null;
    };
    recogRef.current = rec;
    rec.start();
    setVoiceListening(true);
  }, [voiceListening, stopVoice]);

  const onPickImages = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    const additions: { id: string; dataUrl: string; name: string }[] = [];
    for (let i = 0; i < files.length; i += 1) {
      if (additions.length >= 3) break;
      const f = files.item(i);
      if (!f) continue;
      const dataUrl = await imageFileToJpegDataUrl(f);
      if (dataUrl) additions.push({ id: newId(), dataUrl, name: f.name });
    }
    if (additions.length) setImageSlots((prev) => [...prev, ...additions].slice(0, 3));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const runParse = useCallback(
    async (
      text: string,
      imageDataUrls?: string[],
      mergeSlots?: Partial<Record<SlotKey, string>>
    ): Promise<TripPlan | null> => {
      const trimmed = text.trim();
      if (!trimmed && !(imageDataUrls?.length)) return null;

      setLoading(true);
      setError(null);

      try {
        const parsed = await fetchParsedPlan(trimmed, imageDataUrls);
        let planOut = mergeSpotlightsFromRef(parsed, draftSpotlightsRef);
        if (mergeSlots?.dates?.trim()) {
          planOut = applyDatesSlotToPlan(planOut, mergeSlots.dates.trim());
        }
        setPlan(planOut);
        return planOut;
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Unknown parser error.");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [fetchParsedPlan]
  );

  function startChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = composerText.trim();
    const imageUrlsSnapshot = imageSlots.map((s) => s.dataUrl);
    if ((!text && imageUrlsSnapshot.length === 0) || phase !== "chat" || seedMessage) return;

    if (!imageUrlsSnapshot.length && looksLikeMeaninglessTripSeed(text)) {
      setError(null);
      const userBubbleText = text.trim() || "Attached images";
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "user", text: userBubbleText },
        { id: newId(), role: "assistant", text: INVALID_TRIP_INPUT_REPLY },
      ]);
      return;
    }

    setError(null);

    const seed = text || "(Trip details from attached images)";
    const msgId = newId();
    setSeedMessage(seed);
    setComposerText("");
    setImageSlots([]);
    setSlots({});
    setActiveSlot(null);
    setReplyDraft("");
    setAwaitingFirstChipAnswer(false);
    draftSpotlightsRef.current = [];

    const imgNote = imageUrlsSnapshot.length
      ? `\n[${imageUrlsSnapshot.length} reference image${imageUrlsSnapshot.length > 1 ? "s" : ""}]`
      : "";
    const userBubbleText = `${text}${imgNote}`.trim() || "Attached images";
    setMessages((prev) => [...prev, { id: msgId, role: "user", text: userBubbleText }]);

    void (async () => {
      setPrefetchingSlots(true);
      setError(null);
      const locHint = (slots.location || "").trim();
      // Venue detection runs only on the trip details message from the user.
      const placeSearchText = text.trim();
      try {
        const [placeJson, plan] = await Promise.all([
          fetch("/api/places/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: placeSearchText, locationHint: locHint || null }),
          })
            .then(async (r) => (await r.json()) as PlacePreviewResponse)
            .catch(() => ({ events: [] }) satisfies PlacePreviewResponse),
          fetchParsedPlan(seed, imageUrlsSnapshot.length ? imageUrlsSnapshot : undefined),
        ]);

        await consumePlacePreviewResponse(placeJson, { userBubbleId: msgId, placeTextHint: placeSearchText });

        const extracted = slotsFromPlan(plan);
        setSlots(extracted);
        const stillMissing = missingSlots(extracted);

        if (stillMissing.length === 0) {
          const merged = mergeSpotlightsFromRef(plan, draftSpotlightsRef);
          setPlan(merged);
          setMessages((prev) => [
            ...prev,
            {
              id: newId(),
              role: "assistant",
              text: "Taking you to host setup — opening your calendar next.",
            },
          ]);
          const navigated = await persistAndRedirectToHostSetup(merged);
          if (!navigated && !planHasUsableTripTiming(merged)) {
            setMessages((prev) => [
              ...prev,
              {
                id: newId(),
                role: "assistant",
                text: "We need a rough trip window (season, month, or dates) before saving. Add clearer timing and try sending again.",
              },
            ]);
          }
          return;
        }

        const nLeft = stillMissing.length;
        const pointer =
          nLeft === 1
            ? "One open detail below."
            : nLeft <= 3
              ? `${nLeft} open details below — tap any topic to answer it first.`
              : `${nLeft} open details — tap any starter topic below; we’ll go through the rest one question at a time.`;
        const pulledAny = Object.keys(extracted).length > 0;
        const head = pulledAny ? "Nice — I pulled a lot from that." : "Thanks for sharing.";
        setMessages((prev) => [
          ...prev,
          {
            id: newId(),
            role: "assistant",
            text: `${head} ${pointer}`,
          },
        ]);
        setAwaitingFirstChipAnswer(true);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: newId(),
            role: "assistant",
            text: PARSE_OR_NET_FAIL_REPLY,
          },
        ]);
        setAwaitingFirstChipAnswer(true);
      } finally {
        setPrefetchingSlots(false);
      }
    })();
  }

  function pickChip(key: SlotKey) {
    if (phase !== "chat" || loading || prefetchingSlots || !awaitingFirstChipAnswer) return;
    if (key === "dates") {
      setDateSlotMode("specific");
      setDateStart("");
      setDateEnd("");
      setReplyDraft("");
      setDateSlotError(null);
    }
    setMessages((prev) => [
      ...prev,
      { id: newId(), role: "assistant", text: SLOT_QUESTIONS[key] },
    ]);
    setActiveSlot(key);
    setReplyDraft("");
  }

  function appendSequentialQuestion(nextSlots: Partial<Record<SlotKey, string>>) {
    const next = missingSlots(nextSlots)[0];
    if (!next) return;
    setMessages((prev) => [
      ...prev,
      { id: newId(), role: "assistant", text: SLOT_QUESTIONS[next] },
    ]);
    setActiveSlot(next);
    setReplyDraft("");
  }

  async function submitSlotAnswer(event: FormEvent) {
    event.preventDefault();
    if (!activeSlot || phase !== "chat") return;
    const slotKey = activeSlot;

    let answer = replyDraft.trim();
    if (slotKey === "dates") {
      setDateSlotError(null);
      if (dateSlotMode === "rough") {
        if (!answer) {
          setDateSlotError("Describe a rough window (month, season, or year span).");
          return;
        }
        if (answer.length < 3) {
          setDateSlotError("A bit more detail helps—try “Summer 2026” or “late March”.");
          return;
        }
        if (isClearlyGibberish(answer)) {
          const userBubbleId = newId();
          setMessages((prev) => [
            ...prev,
            { id: userBubbleId, role: "user", text: answer },
            { id: newId(), role: "assistant", text: GIBBERISH_SLOT_REPLY },
          ]);
          setReplyDraft("");
          setActiveSlot(activeSlot);
          return;
        }
        if (isDatesSlotTbdValue(answer)) {
          setDateSlotError(
            'Give real timing—even vague—rather than deferring (“e.g. May”, “Winter break”).'
          );
          return;
        }
      } else {
        if (!dateStart.trim()) {
          setDateSlotError("Pick a start date—or switch to “Rough window” for a timeframe.");
          return;
        }
        const ds = dateStart.trim();
        const de = (dateEnd || "").trim();
        if (de && de < ds) {
          setDateSlotError("End date must be on or after the start date.");
          return;
        }
        answer = formatDateRangeLabel(ds, de);
      }
    } else if (!answer) {
      return;
    }

    if (OPTIONAL_SLOT_ORDER.includes(slotKey) && /^\s*skip\s*$/i.test(answer)) {
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "user", text: "skip" },
      ]);
      setReplyDraft("");
      setActiveSlot(null);
      const nextOpt = OPTIONAL_SLOT_ORDER.filter(
        (k) => k !== slotKey && !(slots[k] ?? "").trim()
      );
      if (nextOpt.length > 0) {
        const optKey = nextOpt[0];
        setMessages((prev) => [
          ...prev,
          { id: newId(), role: "assistant", text: `No problem! One more (type "skip" to skip):\n${SLOT_QUESTIONS[optKey]}` },
        ]);
        setActiveSlot(optKey);
        return;
      }
      await finalizePlan(slots);
      return;
    }

    const peopleCountOk =
      slotKey === "people" &&
      looksLikeStandalonePeopleCount(answer);
    if (slotKey !== "dates" && !peopleCountOk && isClearlyGibberish(answer)) {
      const userBubbleId = newId();
      setMessages((prev) => [
        ...prev,
        { id: userBubbleId, role: "user", text: answer },
        { id: newId(), role: "assistant", text: GIBBERISH_SLOT_REPLY },
      ]);
      setReplyDraft("");
      setActiveSlot(activeSlot);
      return;
    }
    const updated = { ...slots, [slotKey]: answer };
    const msgId = newId();
    const locHint = ((slotKey === "location" ? answer : updated.location) || slots.location || "").trim();
    const budgetSoftNote =
      slotKey === "budget" ? buildBudgetSoftWarning(updated, seedMessage.trim()) : null;

    setMessages((prev) => {
      const next = [...prev, { id: msgId, role: "user", text: answer } as ChatMessage];
      if (budgetSoftNote) {
        next.push({ id: newId(), role: "assistant", text: budgetSoftNote });
      }
      return next;
    });
    setSlots(updated);
    setReplyDraft("");
    setActiveSlot(null);

    try {
      const res = await fetch("/api/places/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: answer, locationHint: locHint || null }),
      });
      const data = (await res.json()) as PlacePreviewResponse;
      await consumePlacePreviewResponse(data, { userBubbleId: msgId, placeTextHint: answer });
    } catch {
      //
    }

    const requiredRest = missingRequiredSlots(updated);
    const optionalRest = missingOptionalSlots(updated);

    if (awaitingFirstChipAnswer) {
      setAwaitingFirstChipAnswer(false);
      const progress = ackAfterFilledSlot(requiredRest.length);
      if (progress) {
        setMessages((prev) => [...prev, { id: newId(), role: "assistant", text: progress }]);
      }
      if (requiredRest.length === 0) {
        if (optionalRest.length > 0) {
          const optKey = optionalRest[0];
          setMessages((prev) => [
            ...prev,
            { id: newId(), role: "assistant", text: `Almost done! Quick optional question (type "skip" to skip):\n${SLOT_QUESTIONS[optKey]}` },
          ]);
          setActiveSlot(optKey);
          return;
        }
        await finalizePlan(updated);
        return;
      }
      appendSequentialQuestion(updated);
      return;
    }

    if (requiredRest.length === 0) {
      if (optionalRest.length > 0 && !OPTIONAL_SLOT_ORDER.includes(slotKey)) {
        const optKey = optionalRest[0];
        setMessages((prev) => [
          ...prev,
          { id: newId(), role: "assistant", text: `Quick optional question (type "skip" to skip):\n${SLOT_QUESTIONS[optKey]}` },
        ]);
        setActiveSlot(optKey);
        return;
      }
      await finalizePlan(updated);
      return;
    }

    const progress = ackAfterFilledSlot(requiredRest.length);
    if (progress) {
      setMessages((prev) => [...prev, { id: newId(), role: "assistant", text: progress }]);
    }
    appendSequentialQuestion(updated);
  }

  async function finalizePlan(finalSlots: Partial<Record<SlotKey, string>>) {
    const prompt = composeTripPrompt(seedMessage, finalSlots);
    setPhase("building");
    setMessages((prev) => [...prev, { id: newId(), role: "assistant", text: ACK_BEFORE_PLAN }]);
    const planOut = await runParse(prompt, undefined, finalSlots);
    if (planOut) {
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          text: "Taking you to host setup — opening your calendar next.",
        },
      ]);
      const navigated = await persistAndRedirectToHostSetup(planOut);
      if (!navigated) {
        setPhase("chat");
      }
    } else {
      setPhase("chat");
    }
  }

  function resetTrip() {
    setComposerText("");
    setMessages([]);
    setSlots({});
    setSeedMessage("");
    setAwaitingFirstChipAnswer(false);
    setActiveSlot(null);
    setReplyDraft("");
    setDateSlotMode("specific");
    setDateStart("");
    setDateEnd("");
    setDateSlotError(null);
    setPhase("chat");
    setPlan(null);
    setError(null);
    setPrefetchingSlots(false);
    persistClientId.current = generateTripPersistId();
    setSaveError(null);
    setImageSlots([]);
    draftSpotlightsRef.current = [];
    placePickResolverRef.current = null;
  }

  const showChipPicker =
    phase === "chat" &&
    awaitingFirstChipAnswer &&
    missing.length > 0 &&
    activeSlot === null &&
    !loading &&
    !prefetchingSlots;

  const introChipKeys = missing.slice(0, 3);

  const showMainComposer = phase === "chat" && !seedMessage;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-10">
      {phase === "building" && loading ? (
        <div
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-auto bg-[#C7B1FF] px-4 py-8 dark:bg-[#8f73c9]"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <p className="sr-only">Building your trip plan, please wait.</p>
          <NextImage
            src="/trip-plan-generating.png"
            alt=""
            width={1024}
            height={673}
            priority
            className="h-auto max-h-[88vh] w-auto max-w-full rounded-2xl shadow-[0_24px_80px_-16px_rgba(65,43,118,0.45)] ring-1 ring-black/5 select-none"
          />
        </div>
      ) : null}

      <header className="flex items-start gap-3.5">
        <span
          className="mt-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-semibold text-slate-900 ring-1 ring-slate-200 dark:bg-[#1f1f1f] dark:text-[#ebe9e4] dark:ring-white/10"
          aria-hidden
        >
          C
        </span>
        <h1 className="font-display text-[1.85rem] font-medium leading-[1.12] tracking-[-0.02em] text-slate-900 dark:text-[#ebe9e4] sm:text-[2.35rem]">
          Hello, {firstName}
        </h1>
      </header>

      {saveError ? (
        <div className="rounded-xl border border-amber-300/80 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
          <p>
            {saveError}{" "}
            If the database table is missing, run{" "}
            <code className="rounded bg-amber-200/80 px-1 text-xs dark:bg-black/30">trip_plans</code> from{" "}
            <code className="rounded bg-amber-200/80 px-1 text-xs dark:bg-black/30">supabase/schema.sql</code>.
          </p>
          {plan && seedMessage ? (
            <button
              type="button"
              disabled={saveBusy}
              onClick={() => void confirmPlan()}
              className="mt-2 rounded-full border border-amber-400/70 bg-white px-4 py-1.5 text-xs font-semibold text-amber-950 transition hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700/50 dark:bg-amber-950/50 dark:text-amber-100 dark:hover:bg-amber-950/80"
            >
              {saveBusy ? "Saving…" : "Try saving again"}
            </button>
          ) : null}
        </div>
      ) : null}

      <div
        ref={threadRef}
        className={`flex flex-col gap-3 overflow-y-auto px-0.5 pb-1 ${
          messages.length > 0 ? "max-h-[min(52vh,480px)] min-h-0" : ""
        }`}
      >
        {messages.map((m) =>
          m.role === "assistant" ? (
            <AssistantBubble key={m.id} text={m.text}>
              {m.placePick && !m.placePick.resolved ? (
                <PlacePickCards
                  options={m.placePick.options}
                  onPick={(p) => resolvePlacePickFlow(m.id, p)}
                  onSkip={() => resolvePlacePickFlow(m.id, null)}
                />
              ) : null}
            </AssistantBubble>
          ) : (
            <UserBubble key={m.id} text={m.text} placeBlocks={m.placeBlocks} />
          )
        )}

        {prefetchingSlots ? <AssistantBubble text="" typing /> : null}

        {error ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600 ring-1 ring-slate-300 dark:bg-[#2a2a2a] dark:text-[#a8a6a2] dark:ring-white/10">
                C
              </div>
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/50 dark:text-rose-100">
                {error}
              </div>
            </div>
            {missing.length === 0 && seedMessage && phase === "chat" ? (
              <div className="ml-10">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    void finalizePlan(slots);
                  }}
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-white/15 dark:bg-[#252525] dark:text-[#ebe9e4] dark:hover:bg-[#2e2e2e]"
                >
                  Try building the plan again
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {showChipPicker ? (
          <div className="ml-10 flex flex-col gap-2">
            {introChipKeys.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => pickChip(key)}
                className="max-w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-left text-sm text-slate-800 shadow-sm transition hover:border-orange-400/50 hover:bg-slate-50 dark:border-white/10 dark:bg-[#1e1e1e] dark:text-[#e4e2de] dark:hover:border-[#ea580c]/50 dark:hover:bg-[#252525]"
              >
                {SLOT_QUESTIONS[key]}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {activeSlot ? (
        <form
          onSubmit={(e) => {
            void submitSlotAnswer(e);
          }}
          className="mb-2 shrink-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg dark:border-white/10 dark:bg-[#1e1e1e] dark:shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
        >
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-[#8f8d89]">
            Your answer
          </label>
          {activeSlot === "dates" ? (
            <div className="mb-3 space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDateSlotMode("specific");
                    setDateSlotError(null);
                    setReplyDraft("");
                  }}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                    dateSlotMode === "specific"
                      ? "bg-slate-900 text-white dark:bg-[#ebe9e4] dark:text-[#141414]"
                      : "border border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-[#252525] dark:text-[#c4c2be]"
                  }`}
                >
                  Specific dates
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDateSlotMode("rough");
                    setDateSlotError(null);
                    setDateStart("");
                    setDateEnd("");
                  }}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                    dateSlotMode === "rough"
                      ? "bg-slate-900 text-white dark:bg-[#ebe9e4] dark:text-[#141414]"
                      : "border border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-[#252525] dark:text-[#c4c2be]"
                  }`}
                >
                  Rough window
                </button>
              </div>
              {dateSlotMode === "specific" ? (
                <div className="space-y-2">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-slate-600 dark:text-neutral-400">
                      Start
                      <input
                        type="date"
                        value={dateStart}
                        onChange={(e) => setDateStart(e.target.value)}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-orange-500/50 dark:border-white/10 dark:bg-[#161616] dark:text-[#ebe9e4]"
                      />
                    </label>
                    <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-slate-600 dark:text-neutral-400">
                      End <span className="font-normal text-slate-400">(optional)</span>
                      <input
                        type="date"
                        value={dateEnd}
                        min={dateStart || undefined}
                        onChange={(e) => setDateEnd(e.target.value)}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-orange-500/50 dark:border-white/10 dark:bg-[#161616] dark:text-[#ebe9e4]"
                      />
                    </label>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-500 dark:text-neutral-500">
                    Group calendar sync isn&apos;t wired up yet — for now this just captures dates for your plan.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-600 dark:text-neutral-400">
                    Timing window <span className="font-normal text-slate-400">(free text)</span>
                  </label>
                  <textarea
                    ref={replyInputRef}
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    placeholder="e.g. Late July 2026 · Summer · Any weekend in September"
                    rows={2}
                    className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30 dark:border-white/10 dark:bg-[#161616] dark:text-[#ebe9e4] dark:placeholder:text-[#6b6965] dark:focus:border-[#ea580c]/50 dark:focus:ring-[#ea580c]/30"
                  />
                  <p className="text-xs leading-relaxed text-slate-500 dark:text-neutral-500">
                    Doesn&apos;t have to be exact—we need something to steer flights, stays, and the group calendar.
                  </p>
                </div>
              )}
              {dateSlotError ? <p className="text-sm text-rose-600 dark:text-rose-300">{dateSlotError}</p> : null}
            </div>
          ) : (
            <textarea
              ref={replyInputRef}
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value)}
              placeholder="Type here…"
              rows={2}
              className="mb-3 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30 dark:border-white/10 dark:bg-[#161616] dark:text-[#ebe9e4] dark:placeholder:text-[#6b6965] dark:focus:border-[#ea580c]/50 dark:focus:ring-[#ea580c]/30"
            />
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={
                loading ||
                (activeSlot !== "dates" && !replyDraft.trim()) ||
                (activeSlot === "dates" &&
                  dateSlotMode === "specific" &&
                  !dateStart.trim()) ||
                (activeSlot === "dates" && dateSlotMode === "rough" && !replyDraft.trim())
              }
              className={`rounded-full px-5 py-2 text-sm ${primaryFilledInteractive}`}
            >
              Send
            </button>
          </div>
        </form>
      ) : null}

      {showMainComposer ? (
        <form
          onSubmit={startChat}
          className="shrink-0 rounded-[1.35rem] border border-slate-200/90 bg-white p-1 shadow-xl ring-1 ring-slate-200/80 dark:border-white/[0.08] dark:bg-[#1e1e1e] dark:shadow-[0_20px_50px_rgba(0,0,0,0.45)] dark:ring-white/[0.04]"
        >
          <div className="rounded-[1.2rem] bg-white p-4 sm:p-5 dark:bg-[#1e1e1e]">
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={(e) => void onPickImages(e.target.files)} />
            <textarea
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              placeholder="How can I help you plan today?"
              rows={6}
              className="min-h-[8.5rem] w-full resize-y border-0 bg-transparent text-[15px] leading-relaxed text-slate-900 outline-none placeholder:text-slate-400 focus:ring-0 dark:text-[#ebe9e4] dark:placeholder:text-[#6b6965]"
            />
            {imageSlots.length > 0 ? (
              <div className="mb-3 flex flex-wrap gap-2">
                {imageSlots.map((img) => (
                  <div
                    key={img.id}
                    className="group relative h-14 w-14 overflow-hidden rounded-lg ring-1 ring-slate-200 dark:ring-white/10"
                  >
                    <NextImage
                      src={img.dataUrl}
                      alt=""
                      width={56}
                      height={56}
                      unoptimized
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      aria-label="Remove image"
                      onClick={() => setImageSlots((prev) => prev.filter((x) => x.id !== img.id))}
                      className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {voiceNote ? (
              <p className="mb-2 text-xs text-amber-800 dark:text-amber-200/90">{voiceNote}</p>
            ) : null}
            <div className="mt-1 flex items-center justify-between gap-3 border-t border-slate-200/90 pt-3 dark:border-white/[0.06]">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-[#c4c2be] dark:hover:bg-white/5 dark:hover:text-[#ebe9e4]"
                  aria-label="Add images"
                >
                  <span className="text-lg font-light leading-none">+</span>
                </button>
                <button
                  type="button"
                  onClick={() => (voiceListening ? stopVoice() : void toggleVoice())}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-slate-100 dark:hover:bg-white/5 ${
                    voiceListening
                      ? "bg-orange-100 text-orange-700 dark:bg-[#ea580c]/20 dark:text-[#fb923c]"
                      : "text-slate-500 hover:text-slate-900 dark:text-[#c4c2be] dark:hover:text-[#ebe9e4]"
                  }`}
                  aria-label={voiceListening ? "Stop voice" : "Voice mode"}
                  title="Voice mode"
                >
                  <VoiceWaveIcon />
                </button>
              </div>
              <button
                type="submit"
                disabled={!composerText.trim() && imageSlots.length === 0}
                className={`rounded-full px-6 py-2 text-sm disabled:cursor-not-allowed ${primaryFilledInteractive}`}
              >
                Send
              </button>
            </div>
          </div>
        </form>
      ) : null}

      {seedMessage ? (
        <p className="text-center">
          <button
            type="button"
            onClick={resetTrip}
            className="text-sm font-medium text-slate-500 underline-offset-4 hover:text-slate-700 hover:underline dark:text-[#9c9a96] dark:hover:text-[#ebe9e4]"
          >
            Start over
          </button>
        </p>
      ) : null}
    </div>
  );
}

function VoiceWaveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="2" y="6" width="2.5" height="6" rx="1" />
      <rect x="7.25" y="3" width="2.5" height="12" rx="1" />
      <rect x="12.5" y="5" width="2.5" height="8" rx="1" />
    </svg>
  );
}

function AssistantBubble({
  text,
  typing,
  children,
}: {
  text: string;
  typing?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex gap-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600 ring-1 ring-slate-300 dark:bg-[#2a2a2a] dark:text-[#a8a6a2] dark:ring-white/10">
        C
      </div>
      <div
        className={`max-w-[85%] rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm leading-relaxed text-slate-800 dark:text-[#e4e2de] ${
          typing
            ? "border border-slate-200 bg-slate-100 text-slate-500 dark:border-white/10 dark:bg-[#1e1e1e] dark:text-[#7a7874]"
            : "bg-slate-100 ring-1 ring-slate-200/80 dark:bg-[#252525] dark:ring-white/[0.04]"
        }`}
      >
        {typing ? <span className="inline-block animate-pulse">Building…</span> : text}
        {!typing ? children : null}
      </div>
    </div>
  );
}

function UserBubble({ text, placeBlocks }: { text: string; placeBlocks?: PlacePreviewBlock[] }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-slate-200 px-3.5 py-2.5 text-sm leading-relaxed text-slate-900 ring-1 ring-slate-300 dark:bg-[#2c2c2c] dark:text-[#ebe9e4] dark:ring-white/10">
        {text}
      </div>
      {placeBlocks?.length ? <InlinePlacePreviewCards blocks={placeBlocks} /> : null}
    </div>
  );
}
