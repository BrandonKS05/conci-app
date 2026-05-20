import "server-only";

import { extractOpenAiResponsesOutputText } from "@/shared/openai-responses";
import { safeParseJson, type TripPlan } from "@/shared/trip-plan";
import type { ConciSuggestionProposalV1 } from "@/shared/collaboration";

/** Max wait for the proposal call before we save the submission without one. */
const PROPOSAL_TIMEOUT_MS = 12_000;

function firstName(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return "A trip member";
  const first = trimmed.split(/\s+/)[0]?.trim();
  return first || trimmed;
}

function summarizeRestaurantPins(plan: TripPlan): string {
  const pins = (plan.hostSetup?.restaurantPins ?? []).filter((p) => p.kept !== false);
  if (!pins.length) return "none yet";
  return pins
    .slice(0, 10)
    .map((p) => `${p.dateIso} — ${p.place?.name?.trim() || "Unknown spot"}`)
    .join("; ");
}

function summarizeActivityPins(plan: TripPlan): string {
  const pins = (plan.hostSetup?.activityPins ?? []).filter((p) => p.kept !== false);
  if (!pins.length) return "none yet";
  return pins
    .slice(0, 8)
    .map((p) => {
      const name = p.experience?.name?.trim() || "Activity";
      return `${p.dateIso} — ${name}`;
    })
    .join("; ");
}

/**
 * Calls OpenAI to turn a guest's free-text adjustment into a short host-facing
 * "Conci suggestion" narrative — references a real pin when possible and ends
 * with a concrete CTA the host can accept. Returns null when OpenAI is unavailable
 * or the response can't be parsed.
 */
export async function generateConciSuggestionProposal(input: {
  submissionText: string;
  authorDisplayName: string;
  plan: TripPlan;
}): Promise<ConciSuggestionProposalV1 | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const { submissionText, authorDisplayName, plan } = input;
  if (!submissionText.trim()) return null;

  const tr = plan.hostSetup?.tripRange;
  const tripRangeLine = tr?.startIso && tr?.endIso ? `${tr.startIso} → ${tr.endIso}` : "not set";
  const hotelName = plan.hostSetup?.hotel?.name?.trim() || "none";
  const budgetLine =
    [plan.budget.tier, plan.budget.perPerson].filter(Boolean).join(" · ") || "not set";
  const vibeLine = plan.vibe.join(", ") || "none";

  const speaker = firstName(authorDisplayName);

  const system = [
    "You are Conci, an AI travel-planning assistant talking to a trip host.",
    "A trip member just submitted a preference or adjustment.",
    "Write a SHORT host-facing narrative (1–2 sentences, max 50 words) that:",
    `1. Uses ${speaker}'s first name once.`,
    "2. Restates the preference naturally — paraphrase, don't quote verbatim.",
    "3. Cites a SPECIFIC pin (e.g. 'Day 3's dinner pin' or the hotel name) only if one exists in the trip context.",
    "4. Proposes a CONCRETE next action — e.g. 'Find a vegan-friendly alternative?', 'Swap in a halal tapas spot?', 'Pin a budget-friendly dinner for Day 2?'.",
    "5. Ends with a short question / CTA: 'Swap it in?', 'Find options?', 'Pin it?'.",
    "No greeting, no preamble, no markdown, plain text only.",
    'Return strict JSON: {"summary":"..."}.',
  ].join("\n");

  const user = [
    `Trip member: ${speaker} (display name: ${authorDisplayName})`,
    `Destination: ${plan.location ?? "not set"}`,
    `Trip dates: ${tripRangeLine}`,
    `Vibe: ${vibeLine}`,
    `Budget: ${budgetLine}`,
    `Hotel: ${hotelName}`,
    `Restaurant pins: ${summarizeRestaurantPins(plan)}`,
    `Activity pins: ${summarizeActivityPins(plan)}`,
    "",
    `${speaker}'s submission:`,
    submissionText,
  ].join("\n");

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), PROPOSAL_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        input: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        text: { format: { type: "json_object" } },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn("[conci-suggestion-proposal] non-ok status:", response.status);
      return null;
    }
    const payload = await response.json();
    const outputText = extractOpenAiResponsesOutputText(payload).trim();
    if (!outputText) return null;
    const parsed = safeParseJson(outputText) as { summary?: unknown };
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    if (!summary || summary.length > 600) return null;
    return { summary, createdAt: new Date().toISOString() };
  } catch (err) {
    console.warn("[conci-suggestion-proposal] failed:", err);
    return null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}
