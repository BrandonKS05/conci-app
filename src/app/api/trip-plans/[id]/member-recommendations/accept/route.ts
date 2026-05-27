import "server-only";

import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { extractOpenAiResponsesOutputText } from "@/shared/openai-responses";
import { normalizePlan, safeParseJson, type ItineraryActivity, type MemberRecommendation, type TripPlan } from "@/shared/trip-plan";
import { isUuid } from "@/shared/is-uuid";

const TIMEOUT_MS = 20_000;

/**
 * Build a targeted prompt asking OpenAI for a specific named replacement
 * for the item type described in the recommendation.
 */
function buildAcceptPrompt(
  plan: TripPlan,
  recommendation: MemberRecommendation
): string {
  const lines: string[] = [];

  lines.push("=== CURRENT TRIP PLAN ===");
  lines.push(`Destination: ${plan.location ?? "unknown"}`);
  if (plan.dates.options.length) lines.push(`Dates: ${plan.dates.options.join(", ")}`);
  lines.push(`Group size: ${plan.people.count ?? "unknown"} people`);
  if (plan.budget.tier || plan.budget.perPerson) {
    lines.push(`Budget: ${[plan.budget.tier, plan.budget.perPerson].filter(Boolean).join(", ")}`);
  }
  if (plan.vibe.length) lines.push(`Vibe: ${plan.vibe.join(", ")}`);

  if (plan.generatedItinerary?.days?.length) {
    lines.push("");
    lines.push("=== CURRENT ITINERARY ===");
    for (const day of plan.generatedItinerary.days) {
      lines.push(`${day.dateIso} - ${day.label}:`);
      day.activities.forEach((act, i) => {
        lines.push(
          `  [${i}] ${act.time}: ${act.title} [${act.category}]${act.estimatedCostPp != null ? ` ~$${act.estimatedCostPp}pp` : ""}`
        );
      });
    }
  }

  lines.push("");
  lines.push("=== RECOMMENDATION TO APPLY ===");
  lines.push(`From member: ${recommendation.memberName}`);
  lines.push(`Category: ${recommendation.category}`);
  lines.push(`Summary: ${recommendation.summary}`);
  lines.push(`Detail: ${recommendation.detail}`);
  lines.push(`Impact: ${recommendation.impact}`);

  lines.push("");
  lines.push("=== TASK ===");
  lines.push(
    "Find EXACTLY ONE specific itinerary activity that best matches this recommendation and generate a real named replacement."
  );
  lines.push(
    `The replacement must be a REAL venue or activity in ${plan.location ?? "the destination"} — use actual names, not generic descriptions.`
  );
  lines.push("For food/restaurant recommendations: include actual restaurant name, cuisine, estimated price.");
  lines.push("For lodging: include actual hotel/property name, neighborhood, estimated nightly rate.");
  lines.push("For activity: include actual venue/experience name, what it is, estimated cost.");
  lines.push("");
  lines.push(
    "Return ONLY valid JSON with this exact shape:"
  );
  lines.push(
    JSON.stringify({
      dayDateIso: "YYYY-MM-DD",
      activityIndex: 0,
      replacement: {
        time: "Dinner",
        title: "Actual Named Venue, Neighborhood — $XX/person",
        description: "2-sentence description with allergy/vibe info",
        category: "food",
        estimatedCostPp: 45,
        bookingUrl: "https://...",
      },
      explanation: "One sentence explaining why this specific replacement fits the member's request.",
    })
  );

  return lines.join("\n");
}

function recalcDayCost(day: { activities: { estimatedCostPp: number | null }[]; estimatedDayCostPp: number | null }): void {
  day.estimatedDayCostPp = day.activities.reduce((s, a) => s + (a.estimatedCostPp ?? 0), 0) || null;
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
  if (authErr || !user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { recommendationId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const recommendationId = typeof body.recommendationId === "string" ? body.recommendationId.trim() : "";
  if (!recommendationId) {
    return NextResponse.json({ error: "Missing recommendationId" }, { status: 400 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const { data: row, error: fetchErr } = await svc
    .from("trip_plans")
    .select("user_id, plan")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !row?.plan || !row.user_id) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (row.user_id !== user.id) {
    return NextResponse.json({ error: "Only the trip owner can accept recommendations." }, { status: 403 });
  }

  const plan = normalizePlan(row.plan);
  const recommendations = plan.memberRecommendations ?? [];
  const recIdx = recommendations.findIndex((r) => r.id === recommendationId);
  if (recIdx < 0) {
    return NextResponse.json({ error: "Recommendation not found." }, { status: 404 });
  }

  const recommendation = recommendations[recIdx]!;
  if (recommendation.status !== "pending") {
    return NextResponse.json({ ok: true as const, plan, explanation: "" });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();

  let nextPlan = plan;
  let explanation = "";
  let replacementApplied = false;

  if (apiKey && plan.generatedItinerary?.days?.length) {
    const userPrompt = buildAcceptPrompt(plan, recommendation);

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
          temperature: 0.4,
          input: [
            {
              role: "system",
              content:
                "You are a trip planning assistant. Given a trip itinerary and a member recommendation, identify the single best activity to replace and provide a specific real-world named replacement. Return ONLY valid JSON matching the requested schema.",
            },
            { role: "user", content: userPrompt },
          ],
          text: { format: { type: "json_object" } },
        }),
        signal: controller.signal,
      });

      if (response.ok) {
        const payload = await response.json();
        const outputText = extractOpenAiResponsesOutputText(payload).trim();

        if (outputText) {
          const parsed = safeParseJson(outputText) as {
            dayDateIso?: unknown;
            activityIndex?: unknown;
            replacement?: unknown;
            explanation?: unknown;
          } | null;

          if (
            parsed &&
            typeof parsed.dayDateIso === "string" &&
            typeof parsed.activityIndex === "number" &&
            parsed.replacement &&
            typeof parsed.replacement === "object" &&
            !Array.isArray(parsed.replacement)
          ) {
            const dayDateIso = parsed.dayDateIso.trim();
            const activityIndex = Math.floor(parsed.activityIndex);
            const rep = parsed.replacement as Record<string, unknown>;

            const dayIdx = plan.generatedItinerary!.days.findIndex((d) => d.dateIso === dayDateIso);

            if (
              dayIdx >= 0 &&
              activityIndex >= 0 &&
              activityIndex < plan.generatedItinerary!.days[dayIdx]!.activities.length
            ) {
              // Deep-clone itinerary to avoid mutating the original
              const newItinerary = JSON.parse(JSON.stringify(plan.generatedItinerary)) as typeof plan.generatedItinerary;
              const day = newItinerary!.days[dayIdx]!;
              const existing = day.activities[activityIndex]!;

              const newActivity: ItineraryActivity = {
                time: typeof rep.time === "string" && rep.time.trim() ? rep.time.trim() : existing.time,
                title: typeof rep.title === "string" && rep.title.trim() ? rep.title.trim() : existing.title,
                description:
                  typeof rep.description === "string" ? rep.description.trim() : existing.description,
                category: (
                  typeof rep.category === "string" &&
                  ["transport", "food", "activity", "lodging", "free-time"].includes(rep.category)
                    ? rep.category
                    : existing.category
                ) as ItineraryActivity["category"],
                estimatedCostPp:
                  typeof rep.estimatedCostPp === "number" ? rep.estimatedCostPp : existing.estimatedCostPp,
                bookingUrl:
                  typeof rep.bookingUrl === "string" && rep.bookingUrl.startsWith("http")
                    ? rep.bookingUrl
                    : existing.bookingUrl,
              };

              day.activities[activityIndex] = newActivity;
              recalcDayCost(day);

              // Recalculate totals
              newItinerary!.totalEstimatePp =
                newItinerary!.days.reduce((s, d) => s + (d.estimatedDayCostPp ?? 0), 0) || null;
              const headcount = plan.people.count ?? (plan.people.names.length || 2);
              newItinerary!.totalEstimateGroup =
                newItinerary!.totalEstimatePp != null
                  ? newItinerary!.totalEstimatePp * headcount
                  : null;
              newItinerary!.generatedAt = new Date().toISOString();

              nextPlan = normalizePlan({
                ...(plan as unknown as Record<string, unknown>),
                generatedItinerary: newItinerary,
              });
              replacementApplied = true;
              explanation =
                typeof parsed.explanation === "string" ? parsed.explanation.trim() : "";
            }
          }
        }
      } else {
        console.error("[member-recommendations/accept] OpenAI error:", response.status);
      }
    } catch (err) {
      console.error("[member-recommendations/accept] OpenAI call failed:", err);
    } finally {
      clearTimeout(timer);
    }
  }

  // Mark recommendation as applied regardless of whether itinerary was updated
  const nextRecommendations: MemberRecommendation[] = [...(nextPlan.memberRecommendations ?? [])];
  const nextRecIdx = nextRecommendations.findIndex((r) => r.id === recommendationId);
  if (nextRecIdx >= 0) {
    nextRecommendations[nextRecIdx] = {
      ...nextRecommendations[nextRecIdx]!,
      status: "applied",
    };
  }

  nextPlan = normalizePlan({
    ...(nextPlan as unknown as Record<string, unknown>),
    memberRecommendations: nextRecommendations,
  });

  const { error: upErr } = await svc
    .from("trip_plans")
    .update({
      plan: nextPlan as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (upErr) {
    console.error("[member-recommendations/accept]", upErr.message);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true as const,
    plan: nextPlan,
    replacementApplied,
    explanation,
  });
}
