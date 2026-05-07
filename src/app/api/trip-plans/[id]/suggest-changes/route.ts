import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { extractOpenAiResponsesOutputText } from "@/shared/openai-responses";
import { normalizePlan, safeParseJson, type TripPlan } from "@/shared/trip-plan";
import { isUuid } from "@/shared/is-uuid";

export type SuggestedChange = {
  id: string;
  memberName: string;
  category: "activity" | "food" | "lodging" | "timing" | "budget" | "vibe" | "other";
  summary: string;
  detail: string;
  impact: "low" | "medium" | "high";
};

type SuggestChangesResponse = {
  suggestions: SuggestedChange[];
};

const SYSTEM_PROMPT = `You are a trip planning assistant helping incorporate a group member's preferences into an existing trip plan.

Given the current trip plan and a member's stated preferences, suggest specific, actionable changes the host could make to better accommodate this member. Each suggestion should be concrete and explain the reasoning.

Return ONLY valid JSON:
{
  "suggestions": [
    {
      "id": "unique-short-id",
      "memberName": "Name of the member who has this preference",
      "category": "activity|food|lodging|timing|budget|vibe|other",
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
        lines.push(`  ${act.time}: ${act.title} [${act.category}]`);
      }
    }
  }

  if (plan.hostSetup?.restaurantPins?.filter((p) => p.kept).length) {
    lines.push("");
    lines.push("Pinned restaurants: " + plan.hostSetup.restaurantPins.filter((p) => p.kept).map((p) => p.place.name).join(", "));
  }

  lines.push("");
  lines.push("=== MEMBER PREFERENCES ===");
  lines.push(`Member: ${memberName}`);
  lines.push(`Preferences: ${preferences}`);

  return lines.join("\n");
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

  let body: { preferences?: string; memberName?: string };
  try {
    body = (await req.json()) as { preferences?: string; memberName?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const preferences = typeof body.preferences === "string" ? body.preferences.trim() : "";
  const memberName = typeof body.memberName === "string" ? body.memberName.trim() : "A member";

  if (!preferences || preferences.length > 2000) {
    return NextResponse.json({ error: "Preferences required (max 2000 chars)" }, { status: 400 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: row, error: fetchErr } = await svc
    .from("trip_plans")
    .select("plan")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !row?.plan) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  const plan = normalizePlan(row.plan);

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Missing OPENAI_API_KEY on server." }, { status: 500 });
  }

  const userPrompt = buildUserPrompt(plan, memberName, preferences);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.6,
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      text: { format: { type: "json_object" } },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[suggest-changes] OpenAI error:", errorText);
    return NextResponse.json({ error: "AI service unavailable" }, { status: 502 });
  }

  const payload = await response.json();
  const outputText = extractOpenAiResponsesOutputText(payload);

  if (!outputText.trim()) {
    return NextResponse.json({ error: "AI returned empty response" }, { status: 502 });
  }

  const parsed = safeParseJson(outputText) as Partial<SuggestChangesResponse> | null;
  if (!parsed?.suggestions || !Array.isArray(parsed.suggestions)) {
    return NextResponse.json({ error: "Failed to parse suggestions" }, { status: 502 });
  }

  const validCategories = new Set(["activity", "food", "lodging", "timing", "budget", "vibe", "other"]);
  const validImpacts = new Set(["low", "medium", "high"]);

  const suggestions: SuggestedChange[] = parsed.suggestions
    .filter((s): s is SuggestedChange =>
      typeof s === "object" &&
      s !== null &&
      typeof s.summary === "string" &&
      typeof s.detail === "string"
    )
    .slice(0, 5)
    .map((s, i) => ({
      id: typeof s.id === "string" ? s.id : `sug-${i}`,
      memberName: typeof s.memberName === "string" ? s.memberName : memberName,
      category: (typeof s.category === "string" && validCategories.has(s.category)
        ? s.category
        : "other") as SuggestedChange["category"],
      summary: s.summary.trim(),
      detail: s.detail.trim(),
      impact: (typeof s.impact === "string" && validImpacts.has(s.impact)
        ? s.impact
        : "medium") as SuggestedChange["impact"],
    }));

  return NextResponse.json({ suggestions });
}
