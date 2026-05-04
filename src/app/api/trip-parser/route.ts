import { NextResponse } from "next/server";
import { extractOpenAiResponsesOutputText } from "@/shared/openai-responses";
import { TRIP_PARSER_SYSTEM_PROMPT } from "@/shared/trip-parser-system-prompt";
import {
  groundPlanInUserInput,
  normalizePlan,
  retainPeopleNamesOnlyIfMentionedInInput,
  safeParseJson,
} from "@/shared/trip-plan";

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
        { role: "system", content: TRIP_PARSER_SYSTEM_PROMPT },
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
    const plan = groundPlanInUserInput(
      retainPeopleNamesOnlyIfMentionedInInput(normalizePlan(safeParseJson(outputText)), inputForRetain),
      input.trim()
    );
    finalText = JSON.stringify(plan);
  } catch {
    /* return raw model output if JSON pipeline fails */
  }

  return NextResponse.json({ outputText: finalText });
}
