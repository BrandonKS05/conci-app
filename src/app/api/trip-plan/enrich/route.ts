import { NextResponse } from "next/server";
import { extractOpenAiResponsesOutputText } from "@/shared/openai-responses";
import type { PlaceSpotlight } from "@/shared/place-preview";
import { normalizePlan, safeParseJson } from "@/shared/trip-plan";

export const runtime = "nodejs";

const SYSTEM = `You receive a trip plan as JSON. Return the SAME JSON shape with ONLY empty or missing fields filled using realistic values inferred from destination, budget hints, departure city, and vibe.
Rules:
- Never remove or overwrite non-empty user/model fields.
- If dates.options is empty, add 2–3 plausible weekend or season windows as short strings (e.g. "Jun 14–16", "Late September").
- If budget.tier and budget.perPerson are both empty, set tier to a sensible default (e.g. "mid-range") and perPerson to a rough range string.
- If vibe is empty, add 3–5 short vibe tags suited to the destination.
- If openDecisions is empty, you may add 1–2 concise group decisions (avoid venue-specific questions unless the plan already mentions dining/hotels).
- If nextStep is empty, add one short actionable next step.
- Keep title, location, people.names integrity; never invent people names (names array must stay as given).
Return ONLY valid JSON, no markdown.`;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { plan?: unknown };
  if (!body.plan || typeof body.plan !== "object") {
    return NextResponse.json({ error: "Missing plan" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ plan: body.plan });
  }

  try {
    const baseline = normalizePlan(body.plan);
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
            content: `Fill gaps only:\n${JSON.stringify(baseline)}`,
          },
        ],
        text: { format: { type: "json_object" } },
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ plan: baseline });
    }

    const payload = await response.json();
    const outputText = extractOpenAiResponsesOutputText(payload);
    if (!outputText.trim()) {
      return NextResponse.json({ plan: baseline });
    }

    const merged = normalizePlan(safeParseJson(outputText));
    const seen = new Set<string>();
    const combined: PlaceSpotlight[] = [];
    for (const s of [...(baseline.spotlights ?? []), ...(merged.spotlights ?? [])]) {
      const u = s.mapsUrl;
      if (!u || seen.has(u)) continue;
      seen.add(u);
      combined.push(s);
    }
    return NextResponse.json({
      plan: { ...merged, spotlights: combined.length ? combined : merged.spotlights },
    });
  } catch {
    return NextResponse.json({ plan: normalizePlan(body.plan) });
  }
}
