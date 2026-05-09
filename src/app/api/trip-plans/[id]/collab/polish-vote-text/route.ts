import { NextResponse } from "next/server";
import { fetchTripPlanRowForCollab } from "@/backend/trip-plan-collab-fetch";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { POLL_WRITE_IN_MAX_LEN } from "@/shared/collab-pick-vote";
import { buildClassifiedDecisions, VIBE_POLL_DECISION_KEY } from "@/shared/collaboration";
import { extractOpenAiResponsesOutputText } from "@/shared/openai-responses";
import { isUuid } from "@/shared/is-uuid";
import { normalizePlan, safeParseJson } from "@/shared/trip-plan";

const ALLOWED_KEYS = new Set<string>([VIBE_POLL_DECISION_KEY]);

function heuristicPolish(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t.length) return t;
  const cap = t.charAt(0).toUpperCase() + t.slice(1);
  return cap.length <= POLL_WRITE_IN_MAX_LEN ? cap : cap.slice(0, POLL_WRITE_IN_MAX_LEN);
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid trip id" }, { status: 400 });
  }

  let body: { decisionKey?: string; text?: string };
  try {
    body = (await req.json()) as { decisionKey?: string; text?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const decisionKey = typeof body.decisionKey === "string" ? body.decisionKey.trim() : "";
  const rawText = typeof body.text === "string" ? body.text.trim() : "";
  if (!decisionKey || !ALLOWED_KEYS.has(decisionKey)) {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }
  if (rawText.length < 1 || rawText.length > POLL_WRITE_IN_MAX_LEN) {
    return NextResponse.json({ error: "Answer should be between 1 and 80 characters." }, { status: 400 });
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
  if (fetchErr || !row?.plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const classified = buildClassifiedDecisions(normalizePlan(row.plan));
  if (!classified.some((c) => c.key === decisionKey)) {
    return NextResponse.json({ error: "Decision not active for this trip" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ polished: heuristicPolish(rawText) }, { status: 200 });
  }

  const labelHint =
    decisionKey === VIBE_POLL_DECISION_KEY ? "short trip preference or adjustment caption" : "priority / focus answer";
  const system = [
    `You clean up messy short user replies for a group trip poll (${labelHint}).`,
    `Return ONLY valid JSON with a single key "polished": a short readable phrase.`,
    `Fix spelling and grammar; keep the same intent; capitalize like a UI label;`,
    `no quotes inside the phrase; maximum ${POLL_WRITE_IN_MAX_LEN} characters.`,
    `Do not invent activities or vibes the user didn't imply.`,
    `Examples: {"polished":"Beach vibes"} from "beacj vibes lol"; {"polished":"Food and neighborhoods"} from "foods + hoods kinda thing"`,
  ].join("\n");

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
          { role: "system", content: system },
          { role: "user", content: rawText },
        ],
        text: {
          format: {
            type: "json_object",
          },
        },
      }),
    });

    if (!response.ok) {
      const fallback = heuristicPolish(rawText);
      return NextResponse.json({ polished: fallback }, { status: 200 });
    }

    const payload = await response.json();
    const outputText = extractOpenAiResponsesOutputText(payload).trim();
    const parsed = safeParseJson(outputText) as Record<string, unknown> | undefined;
    const polishedRaw =
      typeof parsed?.polished === "string" ? parsed.polished.trim() : heuristicPolish(rawText);
    const polished =
      polishedRaw.length > POLL_WRITE_IN_MAX_LEN ? polishedRaw.slice(0, POLL_WRITE_IN_MAX_LEN).trim() : polishedRaw;

    if (polished.length < 1) {
      return NextResponse.json({ polished: heuristicPolish(rawText) }, { status: 200 });
    }

    return NextResponse.json({ polished }, { status: 200 });
  } catch {
    return NextResponse.json({ polished: heuristicPolish(rawText) }, { status: 200 });
  }
}
