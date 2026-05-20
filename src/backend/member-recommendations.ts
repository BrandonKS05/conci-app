import "server-only";

import { extractOpenAiResponsesOutputText } from "@/shared/openai-responses";
import {
  normalizePlan,
  safeParseJson,
  type MemberRecommendation,
  type TripPlan,
} from "@/shared/trip-plan";
import type { SupabaseClient } from "@supabase/supabase-js";

const TIMEOUT_MS = 15_000;

const SYSTEM_PROMPT = `You are a trip planning assistant helping incorporate a group member's preferences into an existing trip plan.

Given the current trip plan and a member's stated preferences, suggest specific, actionable changes the host could make to better accommodate this member. Each suggestion should be concrete and explain the reasoning.

Return ONLY valid JSON:
{
  "suggestions": [
    {
      "id": "unique-short-id",
      "category": "activity|food|lodging|timing|budget|vibe|transport|other",
      "summary": "One-line summary (e.g. 'Add a vegetarian dinner option on Day 2')",
      "detail": "2-3 sentences explaining the suggestion and how it aligns with the member's preference",
      "impact": "low|medium|high"
    }
  ]
}

Rules:
- Generate 2-5 suggestions maximum. Focus on the most impactful changes.
- "impact" reflects how much the trip plan would change: "low" = minor tweak, "medium" = noticeable change to one day, "high" = affects multiple days or core decisions.
- Be specific: reference actual days, activities, or locations from the current plan when possible.
- Never suggest removing something without proposing an alternative.
- If the preference is already well-served by the current plan, say so in a suggestion with category "other" and note no changes needed.
- Keep suggestions realistic within the trip's budget and timeframe.`;

function buildUserPrompt(plan: TripPlan, memberName: string, preferences: string): string {
  const lines: string[] = [];

  lines.push("=== CURRENT TRIP PLAN ===");
  lines.push(`Title: ${plan.title}`);
  lines.push(`Destination: ${plan.location || "TBD"}`);
  if (plan.dates.options.length) lines.push(`Dates: ${plan.dates.options.join(", ")}`);
  lines.push(`Group size: ${plan.people.count ?? "unknown"}`);
  if (plan.budget.tier || plan.budget.perPerson) {
    lines.push(`Budget: ${[plan.budget.tier, plan.budget.perPerson].filter(Boolean).join(" - ")}`);
  }
  if (plan.vibe.length) lines.push(`Vibe: ${plan.vibe.join(", ")}`);

  if (plan.generatedItinerary?.days.length) {
    lines.push("");
    lines.push("=== ITINERARY ===");
    for (const day of plan.generatedItinerary.days) {
      lines.push(`${day.dateIso} - ${day.label}:`);
      for (const act of day.activities) {
        lines.push(`  ${act.time}: ${act.title} [${act.category}]${act.estimatedCostPp ? ` ~$${act.estimatedCostPp}pp` : ""}`);
      }
    }
  }

  if (plan.hostSetup?.restaurantPins?.filter((p) => p.kept).length) {
    lines.push("");
    lines.push(
      "Pinned restaurants: " +
        plan.hostSetup.restaurantPins
          .filter((p) => p.kept)
          .map((p) => p.place.name)
          .join(", ")
    );
  }

  lines.push("");
  lines.push("=== MEMBER PREFERENCES ===");
  lines.push(`Member: ${memberName}`);
  lines.push(`Preferences: ${preferences}`);

  return lines.join("\n");
}

type GenerateParams = {
  tripId: string;
  userId: string;
  memberName: string;
  preferences: string;
  plan: TripPlan;
  svc: SupabaseClient;
};

/**
 * Generates AI-powered recommendations based on a member's stated preferences
 * and saves them to plan.memberRecommendations. Designed to run fire-and-forget.
 */
export async function generateMemberRecommendations({
  tripId,
  userId,
  memberName,
  preferences,
  plan,
  svc,
}: GenerateParams): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return;

  if (!plan.generatedItinerary?.days?.length && !plan.location) return;

  const userPrompt = buildUserPrompt(plan, memberName, preferences);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.6,
        input: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        text: { format: { type: "json_object" } },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error("[member-recommendations] OpenAI error:", response.status);
      return;
    }

    const payload = await response.json();
    const outputText = extractOpenAiResponsesOutputText(payload);
    if (!outputText.trim()) return;

    const parsed = safeParseJson(outputText) as { suggestions?: unknown[] } | null;
    if (!parsed?.suggestions || !Array.isArray(parsed.suggestions)) return;

    const validCategories = new Set([
      "activity", "food", "lodging", "timing", "budget", "vibe", "transport", "other",
    ]);
    const validImpacts = new Set(["low", "medium", "high"]);
    const now = new Date().toISOString();

    const newRecs: MemberRecommendation[] = parsed.suggestions
      .filter(
        (s): s is Record<string, unknown> =>
          typeof s === "object" &&
          s !== null &&
          typeof (s as Record<string, unknown>).summary === "string" &&
          typeof (s as Record<string, unknown>).detail === "string"
      )
      .slice(0, 5)
      .map((s, i) => ({
        id: `rec-${Date.now()}-${i}`,
        memberName,
        memberUserId: userId,
        category: (typeof s.category === "string" && validCategories.has(s.category)
          ? s.category
          : "other") as MemberRecommendation["category"],
        summary: (s.summary as string).trim(),
        detail: (s.detail as string).trim(),
        impact: (typeof s.impact === "string" && validImpacts.has(s.impact)
          ? s.impact
          : "medium") as MemberRecommendation["impact"],
        status: "pending" as const,
        createdAt: now,
      }));

    if (newRecs.length === 0) return;

    // Re-fetch the latest plan to avoid stale overwrites
    const { data: freshRow } = await svc
      .from("trip_plans")
      .select("plan")
      .eq("id", tripId)
      .maybeSingle();

    if (!freshRow?.plan) return;

    const freshPlan = normalizePlan(freshRow.plan);
    const existingRecs = freshPlan.memberRecommendations ?? [];

    // Replace old pending recs from same user with fresh ones
    const filtered = existingRecs.filter(
      (r) => r.memberUserId !== userId || r.status !== "pending"
    );
    const updatedRecs = [...filtered, ...newRecs].slice(-50);
    const updatedPlan = { ...freshPlan, memberRecommendations: updatedRecs };

    await svc
      .from("trip_plans")
      .update({
        plan: updatedPlan as unknown as Record<string, unknown>,
        updated_at: now,
      })
      .eq("id", tripId);
  } finally {
    clearTimeout(timer);
  }
}
