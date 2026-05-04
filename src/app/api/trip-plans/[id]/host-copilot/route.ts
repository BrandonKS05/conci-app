import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { extractOpenAiResponsesOutputText } from "@/shared/openai-responses";
import {
  applyTripPlanChatPatch,
  normalizePlan,
  parseHostSetup,
  safeParseJson,
  type HostSetupState,
  type TripPlan,
} from "@/shared/trip-plan";
import { isUuid } from "@/shared/is-uuid";

type HostSetupPatch = Partial<HostSetupState>;

function mergeHostSetupPatch(current: unknown, patch: HostSetupPatch): HostSetupState {
  const base = parseHostSetup(current) ?? {};
  const out: HostSetupState = { ...base };
  if (patch.tripRange !== undefined) out.tripRange = patch.tripRange;
  if (patch.restaurantPins !== undefined) out.restaurantPins = patch.restaurantPins;
  if (patch.activityPins !== undefined) out.activityPins = patch.activityPins;
  if (patch.hotel !== undefined) out.hotel = patch.hotel;
  if (patch.experiencesOutlined !== undefined) out.experiencesOutlined = patch.experiencesOutlined;
  return out;
}

const NAV_IDS = new Set([
  "dates",
  "accommodation",
  "food",
  "transport",
  "experiences",
  "packing",
  "budget",
]);

const SYSTEM = (year: number) => `You are the host's setup copilot for a draft trip in the Conci app. The host is on a single-page checklist (calendar, hotel, food pins, experiences checkbox, budget display).

Return ONLY valid JSON (no markdown) with this exact shape:
{
  "assistantText": "1-4 short, friendly sentences. Say what you changed or that you're only giving guidance.",
  "hostSetupPatch": { },
  "planPatch": { },
  "ui": { }
}

Rules:
- **assistantText** is required. Be concise and actionable.
- **hostSetupPatch** (optional): only keys the host setup actually needs to change. Same schema as persisted host setup:
  - **tripRange**: { "startIso": "YYYY-MM-DD", "endIso": "YYYY-MM-DD" } — use inclusive local dates. If the user gives month/day without year, assume calendar year ${year} unless they clearly mean another year.
  - When you **change tripRange** to new dates, also set **restaurantPins**: [] and **activityPins**: [] so old day pins do not leak outside the new range.
  - **hotel**: only set to null to clear; do not invent hotel objects (host picks from search).
  - **experiencesOutlined**: boolean when they say they skimmed / outlined experiences.
- **planPatch** (optional): only top-level trip plan fields that should change. Same rules as trip card chat:
  - Allowed: title, location, departureCity, dates, people, budget, vibe, openDecisions, nextStep, confidence.
  - **budget**: { "tier", "perPerson" } — e.g. "splurge", "mid-range", "budget-friendly" and/or strings like "~$150/person".
  - **dates**: update **dates.options** with short human-readable ranges when they change length or timeframe (helps the rest of the app).
  - Never include spotlights or itineraryLiveCuration. Omit **polls** unless the user explicitly asks for vote options between concrete choices.
- **ui** (optional): guide the app UI.
  - **scrollTo**: one of "dates" | "accommodation" | "food" | "transport" | "experiences" | "packing" | "budget" — set when the user asks to jump somewhere or when your edits mainly concern that section.
  - **suggestDatePickMode**: "range" when they should tap two days on the calendar; "day" when the trip range is already set and they should work day-by-day. If you set tripRange in hostSetupPatch, usually use "day" and **focusTripStartMonth**: true.
  - **focusTripStartMonth**: true when you set tripRange so the calendar scrolls to that month.

If the user only asks for advice with no data changes, use empty objects {} for hostSetupPatch and planPatch and still answer in assistantText.`;

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const auth = await createAuthServerClient();
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { message?: string };
  try {
    body = (await req.json()) as { message?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 4000) {
    return NextResponse.json({ error: "Missing or invalid message" }, { status: 400 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access?.isHost) {
    return NextResponse.json({ error: "Only the host can use setup copilot." }, { status: 403 });
  }

  const { data: row, error } = await svc
    .from("trip_plans")
    .select("plan, status")
    .eq("id", id)
    .maybeSingle();

  if (error || !row?.plan) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (row.status !== "draft") {
    return NextResponse.json({ error: "Copilot is only available while the trip is a draft." }, { status: 409 });
  }

  const planObj = typeof row.plan === "object" && row.plan !== null ? (row.plan as Record<string, unknown>) : {};
  const plan = normalizePlan(planObj);

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const year = new Date().getFullYear();

  let assistantText =
    "I couldn’t run the AI copilot (missing API key on the server). You can still edit dates, budget, and details manually in each section.";
  let hostSetupPatch: HostSetupPatch | undefined;
  let planPatch: unknown;
  let uiRaw: Record<string, unknown> | undefined;

  const hs = plan.hostSetup;
  const tr = hs?.tripRange;
  const contextBlock = [
    `Trip title: ${plan.title}`,
    `Destination: ${plan.location ?? ""}`,
    `Departure city: ${plan.departureCity ?? ""}`,
    `Dates slot (options): ${(plan.dates?.options ?? []).join(" | ") || "none"}`,
    `Budget tier: ${plan.budget.tier ?? ""} perPerson: ${plan.budget.perPerson ?? ""}`,
    `Vibe: ${plan.vibe.join(", ") || "none"}`,
    `Host trip range: ${tr?.startIso && tr?.endIso ? `${tr.startIso} → ${tr.endIso}` : "not set"}`,
    `Hotel saved: ${hs?.hotel?.name ?? "none"}`,
    `Experiences outlined checkbox: ${hs?.experiencesOutlined === true ? "yes" : "no"}`,
    `Restaurant pins: ${(hs?.restaurantPins ?? []).length}`,
    `Activity pins: ${(hs?.activityPins ?? []).length}`,
    "",
    `Host message:\n${message}`,
  ].join("\n");

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
            { role: "system", content: SYSTEM(year) },
            { role: "user", content: contextBlock },
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
              hostSetupPatch?: unknown;
              planPatch?: unknown;
              ui?: unknown;
            };
            if (typeof parsed.assistantText === "string" && parsed.assistantText.trim()) {
              assistantText = parsed.assistantText.trim();
            }

            if (parsed.hostSetupPatch && typeof parsed.hostSetupPatch === "object" && !Array.isArray(parsed.hostSetupPatch)) {
              const p = parsed.hostSetupPatch as Record<string, unknown>;
              const patch: HostSetupPatch = {};
              if (p.tripRange !== undefined) {
                if (p.tripRange === null) patch.tripRange = null;
                else if (p.tripRange && typeof p.tripRange === "object") {
                  const o = p.tripRange as Record<string, unknown>;
                  const startIso = typeof o.startIso === "string" ? o.startIso : "";
                  const endIso = typeof o.endIso === "string" ? o.endIso : "";
                  if (/^\d{4}-\d{2}-\d{2}$/.test(startIso) && /^\d{4}-\d{2}-\d{2}$/.test(endIso)) {
                    patch.tripRange = { startIso, endIso };
                  }
                }
              }
              if (Array.isArray(p.restaurantPins) && p.restaurantPins.length === 0) patch.restaurantPins = [];
              if (Array.isArray(p.activityPins) && p.activityPins.length === 0) patch.activityPins = [];
              if (p.hotel === null) patch.hotel = null;
              if (typeof p.experiencesOutlined === "boolean") patch.experiencesOutlined = p.experiencesOutlined;
              if (Object.keys(patch).length > 0) hostSetupPatch = patch;
            }

            if (
              parsed.planPatch !== undefined &&
              parsed.planPatch &&
              typeof parsed.planPatch === "object" &&
              !Array.isArray(parsed.planPatch)
            ) {
              planPatch = parsed.planPatch;
            }

            if (parsed.ui !== undefined && parsed.ui && typeof parsed.ui === "object" && !Array.isArray(parsed.ui)) {
              uiRaw = parsed.ui as Record<string, unknown>;
            }
          } catch {
            assistantText = "I had trouble parsing that response. Try rephrasing in one short sentence.";
          }
        }
      }
    } catch (e) {
      console.error("[host-copilot]", e);
      assistantText = "Something went wrong calling the AI. Please try again in a moment.";
    }
  }

  let nextPlan: TripPlan = plan;
  if (planPatch !== undefined) {
    nextPlan = applyTripPlanChatPatch(nextPlan, planPatch);
  }
  if (hostSetupPatch !== undefined) {
    const mergedSetup = mergeHostSetupPatch(nextPlan.hostSetup, hostSetupPatch);
    nextPlan = normalizePlan({
      ...(nextPlan as unknown as Record<string, unknown>),
      hostSetup: mergedSetup,
    });
  }

  const changed =
    (planPatch !== undefined && JSON.stringify(planPatch) !== "{}") ||
    (hostSetupPatch !== undefined && Object.keys(hostSetupPatch).length > 0);

  if (changed) {
    const { error: upErr } = await svc
      .from("trip_plans")
      .update({
        plan: nextPlan as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (upErr) {
      console.error("[host-copilot PATCH]", upErr.message);
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
  }

  let scrollTo: string | undefined;
  if (uiRaw && typeof uiRaw.scrollTo === "string") {
    const s = uiRaw.scrollTo.trim();
    if (NAV_IDS.has(s)) scrollTo = s;
  }
  let suggestDatePickMode: "range" | "day" | undefined;
  if (uiRaw && uiRaw.suggestDatePickMode === "range") suggestDatePickMode = "range";
  if (uiRaw && uiRaw.suggestDatePickMode === "day") suggestDatePickMode = "day";
  const focusTripStartMonth = uiRaw?.focusTripStartMonth === true;

  return NextResponse.json({
    assistantText,
    plan: changed ? nextPlan : plan,
    applied: changed,
    ui: {
      scrollTo,
      suggestDatePickMode,
      focusTripStartMonth,
    },
  });
}
