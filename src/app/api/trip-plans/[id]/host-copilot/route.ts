import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { fetchLiveRestaurantsForPlan } from "@/backend/trip-live-restaurants";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { extractOpenAiResponsesOutputText } from "@/shared/openai-responses";
import { restaurantPickToSpotlight } from "@/shared/restaurants";
import {
  applyTripPlanChatPatch,
  enumerateLocalIsoDays,
  normalizePlan,
  parseHostSetup,
  parseLocalIsoDate,
  planRecordWithDatesSyncedToTripRange,
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

const NAV_IDS = new Set(["dates", "accommodation", "transport", "packing", "budget"]);

const SYSTEM = (year: number) => `You are the host's setup copilot for a draft trip in the Conci app. The host is on a single-page checklist (calendar, hotel, meal pins on calendar days, budget, and other sections).

**Trip dates (critical):** The only source of truth for "which calendar days exist" is **Host trip range** and **Trip calendar days** in the user message. If those are set, **ignore** older months or date ranges mentioned in "Planner dates slot" — that field is from the first chat parse and is often stale after the host moves the trip on the calendar. Never assign meal pins or reservations to ISO dates outside **Trip calendar days**.

Return ONLY valid JSON (no markdown) with this exact shape:
{
  "assistantText": "1-4 short, friendly sentences. Say what you changed or that you're only giving guidance.",
  "hostSetupPatch": { },
  "planPatch": { },
  "ui": { },
  "autoPinRestaurant": null
}

**autoPinRestaurant** (optional): Use when the host asks to add/set a **restaurant reservation or dinner** on a **specific trip day** (e.g. "reservation on July 16th", "dinner on the 16th"). The server will call Google Places near the trip destination and pin the top result — do **not** tell them to do it manually.
  - Shape: { "dateIso": "YYYY-MM-DD", "searchHint": "dinner" } — \`dateIso\` must be one of **Trip calendar days** in the user message. Omit or set \`null\` for all other requests.
  - \`searchHint\` optional: e.g. "dinner", "Italian", "seafood"; default short phrase for Places text search.

Rules:
- **assistantText** is required. Be concise and actionable. When you set **autoPinRestaurant**, still write a short line (the app will confirm the pinned name after search).
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
  - **scrollTo**: one of "dates" | "accommodation" | "transport" | "packing" | "budget" — set when the user asks to jump somewhere or when your edits mainly concern that section.
  - **suggestDatePickMode**: "range" when they should tap two days on the calendar; "day" when the trip range is already set and they should work day-by-day. If you set tripRange in hostSetupPatch, usually use "day" and **focusTripStartMonth**: true.
  - **focusTripStartMonth**: true when you set tripRange so the calendar scrolls to that month.

If the user only asks for advice with no data changes, use empty objects {} for hostSetupPatch and planPatch and still answer in assistantText.

Example: Host says "set a dinner reservation on July 16" and trip calendar includes 2026-07-16 → set \`autoPinRestaurant\`: { "dateIso": "2026-07-16", "searchHint": "dinner" } (year from trip calendar days).`;

type AutoPinRestaurantReq = { dateIso: string; searchHint?: string };

async function applyAutoPinRestaurant(
  plan: TripPlan,
  req: AutoPinRestaurantReq
): Promise<{ plan: TripPlan; pinName: string | null; error: string | null }> {
  const tr = plan.hostSetup?.tripRange;
  if (!tr?.startIso || !tr?.endIso) {
    return { plan, pinName: null, error: "Set your trip date range on the calendar first." };
  }
  if (!enumerateLocalIsoDays(tr.startIso, tr.endIso).includes(req.dateIso)) {
    return { plan, pinName: null, error: "That date is outside your current trip range." };
  }
  if (!plan.location?.trim()) {
    return { plan, pinName: null, error: "Add a trip destination so we can search nearby restaurants." };
  }

  const hintRaw = (req.searchHint ?? "dinner").trim() || "dinner";
  const { picks, error } = await fetchLiveRestaurantsForPlan(plan, [hintRaw.slice(0, 80)]);
  const top = picks[0];
  if (!top) {
    return { plan, pinName: null, error: error ?? "No restaurants found near the destination." };
  }

  const place = restaurantPickToSpotlight(top);
  const others = [...(plan.hostSetup?.restaurantPins ?? [])].filter((p) => p.dateIso !== req.dateIso);
  others.push({ dateIso: req.dateIso, place, kept: true });
  const mergedSetup = mergeHostSetupPatch(plan.hostSetup, { restaurantPins: others });
  const planRecord = {
    ...(plan as unknown as Record<string, unknown>),
    hostSetup: mergedSetup,
  };
  return { plan: normalizePlan(planRecord), pinName: top.name, error: null };
}

const MONTH_NAMES_LONG = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

/** If the model omits JSON, infer Jul 16 / july 16th style mentions against the trip’s ISO days. */
function tryInferAutoPinFromMessage(message: string, plan: TripPlan): AutoPinRestaurantReq | undefined {
  const tr = plan.hostSetup?.tripRange;
  if (!tr?.startIso || !tr?.endIso) return undefined;
  if (!/\b(dinner|lunch|breakfast|brunch|reservation|restaurant|meal|pin|places)\b/i.test(message)) {
    return undefined;
  }
  const days = enumerateLocalIsoDays(tr.startIso, tr.endIso);
  const lower = message.toLowerCase();
  for (const iso of days) {
    const dt = parseLocalIsoDate(iso);
    if (!dt) continue;
    const m = dt.getMonth();
    const dom = dt.getDate();
    const long = MONTH_NAMES_LONG[m];
    if (!long) continue;
    const short3 = long.slice(0, 3);
    const hits =
      new RegExp(`\\b${long}\\s+${dom}(?:st|nd|rd|th)?\\b`, "i").test(lower) ||
      new RegExp(`\\b${short3}\\.?\\s+${dom}(?:st|nd|rd|th)?\\b`, "i").test(lower);
    if (!hits) continue;
    let searchHint = "dinner";
    if (/\blunch\b/i.test(message)) searchHint = "lunch";
    else if (/\bbrunch\b/i.test(message)) searchHint = "brunch";
    else if (/\bbreakfast\b/i.test(message)) searchHint = "breakfast";
    return { dateIso: iso, searchHint };
  }
  return undefined;
}

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
  let autoPinRequest: AutoPinRestaurantReq | undefined;

  const hs = plan.hostSetup;
  const tr = hs?.tripRange;
  const hasTr = Boolean(tr?.startIso && tr?.endIso);
  let calendarDaysLine = "";
  if (hasTr && tr) {
    const days = enumerateLocalIsoDays(tr.startIso, tr.endIso);
    if (days.length > 0 && days.length <= 62) {
      calendarDaysLine = `Trip calendar days (ONLY valid yyyy-mm-dd for reservations / pins; do not use any other dates): ${days.join(", ")}`;
    } else if (days.length > 62) {
      calendarDaysLine = `Trip calendar: ${days.length} days from ${tr.startIso} through ${tr.endIso} (inclusive). Every pin dateIso must fall in this window.`;
    }
  }

  const contextBlock = [
    `Trip title: ${plan.title}`,
    `Destination: ${plan.location ?? ""}`,
    `Departure city: ${plan.departureCity ?? ""}`,
    hasTr && tr ? `Host trip range (source of truth): ${tr.startIso} → ${tr.endIso}` : `Host trip range: not set`,
    calendarDaysLine,
    `Budget tier: ${plan.budget.tier ?? ""} perPerson: ${plan.budget.perPerson ?? ""}`,
    `Vibe: ${plan.vibe.join(", ") || "none"}`,
    `Hotel saved: ${hs?.hotel?.name ?? "none"}`,
    `Experiences outlined checkbox: ${hs?.experiencesOutlined === true ? "yes" : "no"}`,
    `Restaurant pins: ${(hs?.restaurantPins ?? []).length}`,
    `Activity pins: ${(hs?.activityPins ?? []).length}`,
    `Planner dates slot (may be outdated after host changed calendar — use Host trip range first): ${(plan.dates?.options ?? []).join(" | ") || "none"}`,
    "",
    `Host message:\n${message}`,
  ]
    .filter(Boolean)
    .join("\n");

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
              autoPinRestaurant?: unknown;
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

            if (
              parsed.autoPinRestaurant &&
              typeof parsed.autoPinRestaurant === "object" &&
              !Array.isArray(parsed.autoPinRestaurant)
            ) {
              const ap = parsed.autoPinRestaurant as Record<string, unknown>;
              const dateIso = typeof ap.dateIso === "string" ? ap.dateIso.trim() : "";
              if (/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
                autoPinRequest = {
                  dateIso,
                  searchHint:
                    typeof ap.searchHint === "string" && ap.searchHint.trim()
                      ? ap.searchHint.trim().slice(0, 80)
                      : undefined,
                };
              }
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
    let planRecord: Record<string, unknown> = {
      ...(nextPlan as unknown as Record<string, unknown>),
      hostSetup: mergedSetup,
    };
    if (hostSetupPatch.tripRange !== undefined) {
      planRecord = planRecordWithDatesSyncedToTripRange(planRecord, mergedSetup.tripRange);
    }
    nextPlan = normalizePlan(planRecord);
  }

  if (!autoPinRequest) {
    autoPinRequest = tryInferAutoPinFromMessage(message, nextPlan);
  }

  let pinApplied = false;
  if (autoPinRequest) {
    const res = await applyAutoPinRestaurant(nextPlan, autoPinRequest);
    if (res.pinName && !res.error) {
      nextPlan = res.plan;
      pinApplied = true;
      const locLabel = nextPlan.location?.trim() || "your destination";
      assistantText = `Pinned ${res.pinName} on ${autoPinRequest.dateIso} (top Google Places result near ${locLabel}).`;
    } else if (res.error) {
      assistantText = `${assistantText}\n\n${res.error}`.trim();
    }
  }

  const changed =
    pinApplied ||
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
  if (pinApplied && !scrollTo) scrollTo = "dates";
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
