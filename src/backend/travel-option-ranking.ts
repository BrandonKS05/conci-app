import "server-only";

import { extractOpenAiResponsesOutputText } from "@/shared/openai-responses";
import type { TravelOption } from "@/shared/travel-option";

const OPENAI_TIMEOUT_MS = 18_000;

export type TravelOptionRankResult = {
  rankedIds: string[];
  reasonById: Record<string, string>;
};

function compactOption(option: TravelOption) {
  return {
    id: option.id,
    kind: option.kind,
    label: option.label,
    subtitle: option.subtitle ?? "",
    provider: option.provider,
    source: option.source ?? "",
    bookingType: option.booking.type,
    bookingEnabled: option.booking.enabled,
    price: option.price?.display ?? "",
    rating: option.rating ?? null,
    tags: option.tags ?? [],
  };
}

function parseRankPayload(raw: unknown, validIds: Set<string>): TravelOptionRankResult | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const rows = Array.isArray(obj.ranked) ? obj.ranked : Array.isArray(obj.rankedIds) ? obj.rankedIds : [];
  const rankedIds: string[] = [];
  const reasonById: Record<string, string> = {};

  for (const row of rows) {
    if (typeof row === "string") {
      if (validIds.has(row) && !rankedIds.includes(row)) rankedIds.push(row);
      continue;
    }
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id : "";
    if (!validIds.has(id) || rankedIds.includes(id)) continue;
    rankedIds.push(id);
    if (typeof r.reason === "string" && r.reason.trim()) {
      reasonById[id] = r.reason.trim().slice(0, 240);
    }
  }

  return rankedIds.length ? { rankedIds, reasonById } : null;
}

export async function rankTravelOptionsWithModel(input: {
  options: TravelOption[];
  userIntent: string;
  category: TravelOption["kind"];
}): Promise<TravelOptionRankResult | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || input.options.length < 2) return null;

  const compact = input.options.slice(0, 20).map(compactOption);
  const validIds = new Set(compact.map((o) => o.id));

  const system = [
    "You rank travel options for Conci.",
    "You may ONLY rank the option IDs supplied by the server.",
    "Never invent provider IDs, availability, prices, names, URLs, or booking status.",
    "If a fact is not in an option, ignore it.",
    'Return JSON only: {"ranked":[{"id":"existing-id","reason":"short reason"}]}.',
  ].join(" ");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.1,
      input: [
        { role: "system", content: system },
        {
          role: "user",
          content: JSON.stringify({
            category: input.category,
            userIntent: input.userIntent.slice(0, 1600),
            options: compact,
          }),
        },
      ],
      text: { format: { type: "json_object" } },
    }),
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
  });

  if (!response.ok) return null;
  const payload = await response.json();
  const outputText = extractOpenAiResponsesOutputText(payload);
  if (!outputText.trim()) return null;

  try {
    return parseRankPayload(JSON.parse(outputText), validIds);
  } catch {
    return null;
  }
}
