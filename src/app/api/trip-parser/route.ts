import { NextResponse } from "next/server";
import { extractOpenAiResponsesOutputText } from "@/shared/openai-responses";
import { normalizePlan, retainPeopleNamesOnlyIfMentionedInInput, safeParseJson } from "@/shared/trip-plan";

const SYSTEM_PROMPT = `You are a trip planning assistant. Extract trip details from the user's input 
and return ONLY a valid JSON object with these exact fields:

{
  "title": "short catchy trip name",
  "location": "city or region",
  "departureCity": null,
  "dates": { "confirmed": false, "options": ["May 10-12", "May 17-19"] },
  "people": { "count": 6, "names": [] },
  "budget": { "tier": "mid-range", "perPerson": "$200-300" },
  "vibe": ["beach", "nightlife"],
  "polls": {
    "destinations": ["Austin", "Nashville"],
    "venues": ["Italian spot on 2nd", "BBQ trailer park", "Sushi omakase"],
    "activities": ["Dinner-heavy", "Bar crawl", "Dinner then one bar"],
    "vibePick": ["Casual / low-key", "Dressy night out", "Mix"],
    "budgetPick": ["$ · ~$60", "$$ · ~$120", "$$$ · splashy"],
    "transport": ["Drive together", "Everyone flies — meet there"]
  },
  "openDecisions": ["Which hotel?", "Road trip vs fly?"],
  "nextStep": "Share link so the group votes on dates and curated picks",
  "confidence": 0.85
}

Only return the JSON. No explanation. Use null for unknown fields.

People / names (critical):
- NEVER invent placeholder names (no "Alex", "Jordan", "Friend 1", etc.).
- "people.names" must be [] unless the user message clearly lists specific people by name (e.g. "me, Sam, and Priya").
- When the group size is known but names are not stated, use "people.count" only and "people.names": [].
- Example: "six of us going to Austin" → "people": { "count": 6, "names": [] }.

Polling rules:
- Never put more than 3 strings in dates.options OR in any polls array. Prefer 2-3 realistic options inferred from chat.
- "polls" is optional — include a key only when the group is genuinely choosing between comparable options.
- polls.destinations = 2-3 cities if they're deciding where to go; polls.venues = short restaurant names; polls.activities = activity mix;
  polls.vibePick = outfit/energy tier; polls.budgetPick = tier labels; polls.transport = how people converge.

- "departureCity": city travelers leave from when flying or driving together (e.g. "Austin, TX"). Use null if unknown or if everyone meets at the destination.

Extract concrete details from informal language: city nicknames (e.g. NYC), weekend or date phrases,
named travelers only when explicitly written ("me, Sarah, and Mike" → names ["Sarah","Mike"] or similar + accurate count; never guess),
and vibe phrases (food, bars, relaxing, etc.). Prefer populated fields over null when the user clearly implied them.`;

function buildUserContent(
  text: string,
  images: string[]
): string | Array<{ type: string; text?: string; image_url?: string }> {
  if (images.length === 0) return text;
  const prompt =
    text.trim() ||
    "The user attached image(s) for inspiration. Infer trip title, destination or region, timing, group size if visible, vibe, and budget hints. Return the same JSON schema as text-only trips.";
  const parts: Array<{ type: string; text?: string; image_url?: string }> = [{ type: "input_text", text: prompt }];
  for (const url of images) {
    parts.push({ type: "input_image", image_url: url });
  }
  return parts;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { input?: string; images?: unknown };
  const input = (body.input || "").trim();
  const imagesRaw = Array.isArray(body.images) ? body.images : [];
  const images = imagesRaw
    .filter((x): x is string => typeof x === "string" && x.startsWith("data:image/") && x.length < 900000)
    .slice(0, 2);

  if (!input && images.length === 0) {
    return NextResponse.json({ error: "Add a description or at least one image." }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY on server." },
      { status: 500 }
    );
  }

  const userContent = buildUserContent(input, images);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      text: {
        format: {
          type: "json_object",
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json(
      { error: `OpenAI API failed: ${errorText}` },
      { status: 502 }
    );
  }

  const payload = await response.json();
  const outputText = extractOpenAiResponsesOutputText(payload);

  if (!outputText.trim()) {
    return NextResponse.json({ error: "OpenAI returned no text output." }, { status: 502 });
  }

  let finalText = outputText;
  try {
    const inputForRetain = [input, ...images.map(() => "[image]")].filter(Boolean).join("\n");
    const plan = retainPeopleNamesOnlyIfMentionedInInput(normalizePlan(safeParseJson(outputText)), inputForRetain);
    finalText = JSON.stringify(plan);
  } catch {
    /* return raw model output if JSON pipeline fails */
  }

  return NextResponse.json({ outputText: finalText });
}
