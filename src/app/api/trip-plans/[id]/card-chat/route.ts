import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { fetchTripPlanRowForCollab } from "@/backend/trip-plan-collab-fetch";
import { searchPlacesGoogleMaps } from "@/backend/serpapi-places";
import { extractOpenAiResponsesOutputText } from "@/shared/openai-responses";
import {
  parseCollabState,
  trimCardChatMessages,
  type CardChatMessage,
} from "@/shared/collaboration";
import {
  applyTripPlanChatPatch,
  groundPlanInUserInput,
  normalizePlan,
  retainPeopleNamesOnlyIfMentionedInInput,
  safeParseJson,
  tripLiveRecommendationsContextFingerprint,
  tripPlanPersistenceFingerprint,
  type TripPlan,
} from "@/shared/trip-plan";
import { spotlightStableIdFromMapsUrl } from "@/shared/spotlight-stable-id";
import type { PlacePreview } from "@/shared/place-preview";
import { isUuid } from "@/shared/is-uuid";

const SYSTEM = `You help a travel group refine a saved trip card: (1) optional edits to trip metadata and (2) place discovery on Google Maps.

Return ONLY valid JSON (no markdown) with this shape:
{
  "assistantText": "1-3 short sentences acknowledging the request.",
  "searchQueries": ["1-3 short Google Maps style search strings", "include city or neighborhood when known"],
  "planPatch": { }
}

planPatch (optional):
- Omit "planPatch" entirely, or use {}, when the user is ONLY asking for place ideas (no trip facts change).
- When the user changes trip facts, include ONLY the top-level keys that change (same schema as the stored trip plan).
- Fields you may set: "title", "location", "departureCity", "dates", "people", "budget", "vibe", "openDecisions", "polls", "nextStep", "confidence".
- Never include "spotlights" or "itineraryLiveCuration".
- **polls**: only when the user explicitly contrasts 2+ real choices in their message. Never add placeholder group-vote rows; omit "polls" or use null otherwise.

Budget examples:
- "lower the budget" / "$80 per person" → set "budget": { "perPerson": "~$80/person" or "$80", "tier": "budget-friendly" } (align tier with spend).

Group size:
- "7 people" → "people": { "count": 7, "names": [] } unless they named travelers; never invent names.

Destination:
- "Scottsdale instead" → "location": "Scottsdale, AZ" (add state/country when obvious).

Duration / dates:
- "3 days instead of 2" → update "dates": { "options": ["..."] } with a concise human-readable range that reflects the new length (preserve month if known).

searchQueries must stay concrete place-discovery strings (not questions), tuned to the UPDATED destination/budget/vibe when planPatch changes them.`;

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid trip id" }, { status: 400 });
  }

  const auth = await createAuthServerClient();
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { row, error: fetchErr } = await fetchTripPlanRowForCollab(svc, id);
  if (fetchErr || !row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const collab = parseCollabState(row.collab_state);
  return NextResponse.json({ messages: collab.cardChat?.messages ?? [] });
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid trip id" }, { status: 400 });
  }

  const auth = await createAuthServerClient();
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { text?: string };
  try {
    body = (await req.json()) as { text?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 2000) {
    return NextResponse.json({ error: "Missing or invalid text" }, { status: 400 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { row, error: fetchErr } = await fetchTripPlanRowForCollab(svc, id);
  if (fetchErr || !row?.plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const plan = normalizePlan(row.plan);
  let collab = parseCollabState(row.collab_state);
  const prev = [...(collab.cardChat?.messages ?? [])];

  const userMsg: CardChatMessage = {
    id: randomUUID(),
    role: "user",
    text,
    createdAt: new Date().toISOString(),
  };

  const locBefore = (plan.location || "").trim() || "";
  const spotSummary = (plan.spotlights ?? [])
    .map((s) => `${s.name} [id:${spotlightStableIdFromMapsUrl(s.mapsUrl)}]`)
    .join("; ");

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  let assistantText = "Here are a few options that might fit.";
  let queries: string[] = [`${locBefore} restaurants`.trim() || "popular restaurants"];
  let planPatch: unknown;

  if (apiKey) {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          input: [
            { role: "system", content: SYSTEM },
            {
              role: "user",
              content: `Trip title: ${plan.title}\nDestination: ${locBefore || "unknown"}\nBudget: ${plan.budget.tier ?? ""} ${plan.budget.perPerson ?? ""}\nVibe: ${plan.vibe.join(", ")}\nCurrent picked places: ${spotSummary || "none"}\n\nMember message:\n${text}`,
            },
          ],
          text: { format: { type: "json_object" } },
        }),
      });
      if (response.ok) {
        const payload = await response.json();
        const outputText = extractOpenAiResponsesOutputText(payload);
        if (outputText.trim()) {
          try {
            const parsed = safeParseJson(outputText) as {
              assistantText?: string;
              searchQueries?: unknown;
              planPatch?: unknown;
            };
            if (typeof parsed.assistantText === "string" && parsed.assistantText.trim()) {
              assistantText = parsed.assistantText.trim();
            }
            if (Array.isArray(parsed.searchQueries)) {
              const q = parsed.searchQueries
                .filter((x): x is string => typeof x === "string" && x.trim().length > 2)
                .map((x) => x.trim().slice(0, 200));
              if (q.length) queries = q.slice(0, 3);
            }
            if (parsed.planPatch !== undefined) planPatch = parsed.planPatch;
          } catch {
            //
          }
        }
      }
    } catch {
      //
    }
  }

  let nextPlan: TripPlan = plan;
  if (planPatch !== undefined && planPatch !== null && typeof planPatch === "object" && !Array.isArray(planPatch)) {
    const keys = Object.keys(planPatch as object);
    if (keys.length > 0) {
      let patched = applyTripPlanChatPatch(plan, planPatch);
      patched = groundPlanInUserInput(retainPeopleNamesOnlyIfMentionedInInput(patched, text), text.trim(), {
        preserveSpotlights: true,
      });
      const liveBefore = tripLiveRecommendationsContextFingerprint(plan);
      const liveAfter = tripLiveRecommendationsContextFingerprint(patched);
      if (liveBefore !== liveAfter) {
        patched = { ...patched, itineraryLiveCuration: undefined };
      }
      nextPlan = patched;
    }
  }

  const loc = (nextPlan.location || "").trim() || "";

  const seen = new Set<string>();
  const merged: PlacePreview[] = [];
  for (const q of queries) {
    const hint = loc || null;
    const rows = await searchPlacesGoogleMaps(q, hint, { start: 0, limit: 8 });
    for (const p of rows) {
      if (seen.has(p.mapsUrl)) continue;
      seen.add(p.mapsUrl);
      merged.push(p);
      if (merged.length >= 6) break;
    }
    if (merged.length >= 6) break;
  }
  const cards = merged.slice(0, 3);

  const assistantMsg: CardChatMessage = {
    id: randomUUID(),
    role: "assistant",
    text: assistantText,
    places: cards.length ? cards : undefined,
    createdAt: new Date().toISOString(),
  };

  const messages = trimCardChatMessages([...prev, userMsg, assistantMsg]);
  collab = {
    ...collab,
    cardChat: { messages },
  };

  const planDirty = tripPlanPersistenceFingerprint(plan) !== tripPlanPersistenceFingerprint(nextPlan);
  const rowUpdate: { collab_state: typeof collab; updated_at: string; plan?: TripPlan } = {
    collab_state: collab,
    updated_at: new Date().toISOString(),
  };
  if (planDirty) rowUpdate.plan = nextPlan;

  const { error: upErr } = await svc.from("trip_plans").update(rowUpdate).eq("id", id);

  if (upErr) {
    console.error("[card-chat]", upErr);
    return NextResponse.json({ error: "Could not save chat" }, { status: 500 });
  }

  return NextResponse.json({
    messages,
    assistantMessage: assistantMsg,
    ...(planDirty ? { plan: nextPlan } : {}),
  });
}
