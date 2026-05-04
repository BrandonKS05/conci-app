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
import { normalizePlan, safeParseJson } from "@/shared/trip-plan";
import { spotlightStableIdFromMapsUrl } from "@/shared/spotlight-stable-id";
import type { PlacePreview } from "@/shared/place-preview";
import { isUuid } from "@/shared/is-uuid";

const SYSTEM = `You help a travel group refine places (hotels, restaurants, activities) for a saved trip card.
Return ONLY valid JSON (no markdown) with this shape:
{
  "assistantText": "1-3 short sentences acknowledging the request.",
  "searchQueries": ["1-3 short Google Maps style search strings", "include city or neighborhood when known"]
}
searchQueries must be concrete place-discovery queries (not questions).`;

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

  const loc = (plan.location || "").trim() || "";
  const spotSummary = (plan.spotlights ?? [])
    .map((s) => `${s.name} [id:${spotlightStableIdFromMapsUrl(s.mapsUrl)}]`)
    .join("; ");

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  let assistantText = "Here are a few options that might fit.";
  let queries: string[] = [`${loc} restaurants`.trim() || "popular restaurants"];

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
              content: `Trip title: ${plan.title}\nDestination: ${loc || "unknown"}\nBudget: ${plan.budget.tier ?? ""} ${plan.budget.perPerson ?? ""}\nVibe: ${plan.vibe.join(", ")}\nCurrent picked places: ${spotSummary || "none"}\n\nMember message:\n${text}`,
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
          } catch {
            //
          }
        }
      }
    } catch {
      //
    }
  }

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

  const { error: upErr } = await svc
    .from("trip_plans")
    .update({ collab_state: collab, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (upErr) {
    console.error("[card-chat]", upErr);
    return NextResponse.json({ error: "Could not save chat" }, { status: 500 });
  }

  return NextResponse.json({ messages, assistantMessage: assistantMsg });
}
