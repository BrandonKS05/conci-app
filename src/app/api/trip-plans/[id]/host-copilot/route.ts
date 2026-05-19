import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { fetchLiveRestaurantsForPlan } from "@/backend/trip-live-restaurants";
import { searchPlacesGoogleMaps } from "@/backend/serpapi-places";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { extractOpenAiResponsesOutputText } from "@/shared/openai-responses";
import { restaurantPickToSpotlight } from "@/shared/restaurants";
import type { PlaceSpotlight } from "@/shared/place-preview";
import {
  applyHostHotelDateRange,
  applyHostHotelSelection,
  tagLodgingStayAtRange,
  applyTripPlanChatPatch,
  enumerateLocalIsoDays,
  normalizePlan,
  parseHostSetup,
  parseLocalIsoDate,
  planRecordWithDatesSyncedToTripRange,
  safeParseJson,
  type HostActivityExperience,
  type HostActivityPin,
  type HostRestaurantPin,
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
  if (patch.hotelStays !== undefined) out.hotelStays = patch.hotelStays;
  if (patch.packingList !== undefined) out.packingList = patch.packingList;
  if (patch.experiencesOutlined !== undefined) out.experiencesOutlined = patch.experiencesOutlined;
  return out;
}

const NAV_IDS = new Set(["dates", "budget"]);

function coerceRestaurantPinsFromParsed(
  plan: TripPlan,
  raw: unknown,
  restrictDateIso?: string | null
): HostRestaurantPin[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const tr = plan.hostSetup?.tripRange;
  if (!tr?.startIso || !tr?.endIso) return undefined;
  const allowed = new Set(enumerateLocalIsoDays(tr.startIso, tr.endIso));
  const pins: HostRestaurantPin[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const dateIso = typeof r.dateIso === "string" ? r.dateIso.trim() : "";
    const placeUnknown = r.place && typeof r.place === "object" ? (r.place as Record<string, unknown>) : null;
    const name = placeUnknown?.name !== undefined ? String(placeUnknown.name).trim() : "";
    const mapsUrl =
      placeUnknown?.mapsUrl !== undefined && typeof placeUnknown.mapsUrl === "string"
        ? placeUnknown.mapsUrl.trim()
        : "";
    const kept =
      typeof r.kept === "boolean" ? r.kept : r.kept == null ? true : Boolean(r.kept);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso) || !allowed.has(dateIso)) continue;
    if (restrictDateIso && dateIso !== restrictDateIso) continue;
    if (!name || !mapsUrl.startsWith("http")) continue;
    const photoUrl =
      typeof placeUnknown?.photoUrl === "string" && placeUnknown.photoUrl.startsWith("http")
        ? placeUnknown.photoUrl
        : null;
    const ratingRaw = placeUnknown?.rating;
    const rating =
      typeof ratingRaw === "number"
        ? ratingRaw
        : typeof ratingRaw === "string" && ratingRaw.trim() !== ""
          ? Number(ratingRaw)
          : undefined;
    const address =
      typeof placeUnknown?.address === "string" && placeUnknown.address.trim()
        ? placeUnknown.address.trim()
        : undefined;
    pins.push({
      dateIso,
      kept,
      place: {
        name,
        mapsUrl,
        spotlightCategory: "restaurant",
        ...(rating != null && !Number.isNaN(rating) ? { rating } : {}),
        ...(photoUrl ? { photoUrl } : {}),
        ...(address ? { address } : {}),
      },
    });
    if (pins.length >= 12) break;
  }
  return pins.length ? pins : undefined;
}

function coerceActivityPinsFromParsed(
  plan: TripPlan,
  raw: unknown,
  restrictDateIso?: string | null
): HostActivityPin[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const tr = plan.hostSetup?.tripRange;
  if (!tr?.startIso || !tr?.endIso) return undefined;
  const allowed = new Set(enumerateLocalIsoDays(tr.startIso, tr.endIso));
  const pins: HostActivityPin[] = [];

  function buildExp(ex: Record<string, unknown>): HostActivityExperience | null {
    const name = typeof ex.name === "string" ? ex.name.trim() : "";
    const bookingUrl = typeof ex.bookingUrl === "string" ? ex.bookingUrl.trim() : "";
    const pricePerPerson =
      typeof ex.pricePerPerson === "string" ? ex.pricePerPerson.trim() : ex.pricePerPerson != null ? String(ex.pricePerPerson) : "";
    const rating =
      typeof ex.rating === "string" ? ex.rating.trim() : ex.rating != null ? String(ex.rating) : "";
    const duration =
      typeof ex.duration === "string" ? ex.duration.trim() : ex.duration != null ? String(ex.duration) : "";
    const coverPhotoUrl =
      typeof ex.coverPhotoUrl === "string" && ex.coverPhotoUrl.startsWith("http") ? ex.coverPhotoUrl : null;
    const urlFinal = bookingUrl.startsWith("http") ? bookingUrl : bookingUrl ? `https://${bookingUrl}` : "";
    if (!name || !urlFinal.startsWith("http")) return null;
    return { name, bookingUrl: urlFinal, pricePerPerson, rating, duration, coverPhotoUrl };
  }

  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const dateIso = typeof r.dateIso === "string" ? r.dateIso.trim() : "";
    const exRaw = r.experience && typeof r.experience === "object" ? (r.experience as Record<string, unknown>) : null;
    const kept =
      typeof r.kept === "boolean" ? r.kept : r.kept == null ? true : Boolean(r.kept);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso) || !allowed.has(dateIso)) continue;
    if (restrictDateIso && dateIso !== restrictDateIso) continue;
    if (!exRaw) continue;
    const experience = buildExp(exRaw);
    if (!experience) continue;
    pins.push({ dateIso, experience, kept });
    if (pins.length >= 12) break;
  }
  return pins.length ? pins : undefined;
}

const buildCopilotSystem = (year: number, focusDateIso?: string | null) => `You are the host's setup copilot for a Conci trip. The trip may still be drafting or already shared with travelers; the host can change calendar pins, budgets, vibes, hotels, meals, or activities anytime.

**Trip dates (critical):** The only source of truth for "which calendar days exist" is **Host trip range** and **Trip calendar days** in the user message. If those are set, **ignore** older months or date ranges mentioned in "Planner dates slot" — that field is from the first chat parse and is often stale after the host moves the trip on the calendar. Never assign meal pins or reservations to ISO dates outside **Trip calendar days**.
${
  focusDateIso
    ? `\n**Day-focused session:** The host is editing **${focusDateIso}** ONLY unless they clearly ask about another calendar day inside the trip window. Prefer **autoPinRestaurant** with \`dateIso\`="${focusDateIso}". For **autoBookHotel**, use **fullTrip: true** OR \`stayStartIso\`/\`stayEndIso\` covering **${focusDateIso}** when they want a hotel — never omit scope. If you populate **hostSetupPatch.restaurantPins** or **activityPins**, every pin's \`dateIso\` should be ${focusDateIso} unless the host named a different trip day explicitly.\n`
    : ""
}

Return ONLY valid JSON (no markdown) with this exact shape:
{
  "assistantText": "1-4 short, friendly sentences. Say what you changed or that you're only giving guidance.",
  "hostSetupPatch": { },
  "planPatch": { },
  "ui": { },
  "autoPinRestaurant": null,
  "autoBookHotel": null
}

**autoBookHotel** (optional): Use when the host asks to **pick or book a hotel / place to stay** and they (or you) have nailed down **scope**. The server runs Google Maps (SerpAPI) search and saves the top result (not an OTA checkout).
  - You MUST set one of:
    - **fullTrip**: true — stay covers the entire **Host trip range** (first night through last night).
    - **stayStartIso** AND **stayEndIso** (YYYY-MM-DD, within **Trip calendar days**, inclusive) — specific check-in through check-out range.
  - **searchHint** (optional): style/neighborhood, e.g. "boutique hotel", "near beach".
  - If they have not said whole trip vs which nights, ask in **assistantText** and leave **autoBookHotel** null.

**autoPinRestaurant** (optional): Use when the host asks to add/set a **restaurant reservation or dinner** on a **specific trip day** (e.g. "reservation on July 16th", "dinner on the 16th"). The server will call Google Places near the trip destination and pin the top result — do **not** tell them to do it manually.
  - Shape: { "dateIso": "YYYY-MM-DD", "searchHint": "dinner" } — \`dateIso\` must be one of **Trip calendar days** in the user message. Omit or set \`null\` for all other requests.
  - \`searchHint\` optional: e.g. "dinner", "Italian", "seafood"; default short phrase for Places text search.

Rules:
- **assistantText** is required. Be concise and actionable. When you set **autoPinRestaurant**, still write a short line (the app will confirm the pinned name after search).
- **hostSetupPatch** (optional): only keys the host setup actually needs to change. Same schema as persisted host setup:
  - **tripRange**: { "startIso": "YYYY-MM-DD", "endIso": "YYYY-MM-DD" } — use inclusive local dates. If the user gives month/day without year, assume calendar year ${year} unless they clearly mean another year.
  - When you **change tripRange** to new dates, also set **restaurantPins**: [] and **activityPins**: [] so old day pins do not leak outside the new range.
  - **hotel**: only set to null to clear in JSON; for a new stay use **autoBookHotel** (or the host picks manually in the app).
  - **experiencesOutlined**: boolean when they say they skimmed / outlined experiences.
  - You may populate **restaurantPins** /** **activityPins** as structured arrays ONLY when proposing concrete pinned restaurants/experiences; every \`dateIso\` MUST be inside **Trip calendar days** (validated server-side). Prefer **autoPinRestaurant** for a single top pick when unsure.
- **planPatch** (optional): only top-level trip plan fields that should change. Same rules as trip card chat:
  - Allowed: title, location, departureCity, dates, people, budget, vibe, openDecisions, nextStep, confidence.
  - **budget**: { "tier", "perPerson" } — e.g. "splurge", "mid-range", "budget-friendly" and/or strings like "~$150/person".
  - **dates**: update **dates.options** with short human-readable ranges when they change length or timeframe (helps the rest of the app).
  - Never include spotlights or itineraryLiveCuration. Omit **polls** unless the user explicitly asks for vote options between concrete choices.
- **ui** (optional): guide the app UI.
  - **scrollTo**: one of "dates" | "budget" — set when the user asks to jump somewhere or when your edits mainly concern that section. (Packing list is a separate page under the trip setup URL.)
  - **suggestDatePickMode**: "range" when they should tap two days on the calendar; "day" when the trip range is already set and they should work day-by-day. If you set tripRange in hostSetupPatch, usually use "day" and **focusTripStartMonth**: true.
  - **focusTripStartMonth**: true when you set tripRange so the calendar scrolls to that month.

If the user only asks for advice with no data changes, use empty objects {} for hostSetupPatch and planPatch and still answer in assistantText.

Example: Host says "set a dinner reservation on July 16" and trip calendar includes 2026-07-16 → set \`autoPinRestaurant\`: { "dateIso": "2026-07-16", "searchHint": "dinner" } (year from trip calendar days).`;

type AutoPinRestaurantReq = { dateIso: string; searchHint?: string };

type AutoBookHotelReq = {
  searchHint?: string;
  fullTrip?: boolean;
  stayStartIso?: string;
  stayEndIso?: string;
};

async function applyAutoBookHotel(
  plan: TripPlan,
  req: AutoBookHotelReq
): Promise<{ plan: TripPlan; placeName: string | null; error: string | null }> {
  const tr = plan.hostSetup?.tripRange;
  if (!tr?.startIso || !tr?.endIso) {
    return { plan, placeName: null, error: "Set your trip date range on the calendar first." };
  }
  if (!plan.location?.trim()) {
    return { plan, placeName: null, error: "Add a trip destination so we can search for hotels." };
  }

  const tripStart = tr.startIso;
  const tripEnd = tr.endIso;
  const allowed = new Set(enumerateLocalIsoDays(tripStart, tripEnd));
  const a = req.stayStartIso?.trim();
  const b = req.stayEndIso?.trim();
  const validRange =
    a &&
    b &&
    /^\d{4}-\d{2}-\d{2}$/.test(a) &&
    /^\d{4}-\d{2}-\d{2}$/.test(b) &&
    allowed.has(a) &&
    allowed.has(b) &&
    a <= b;
  if (!req.fullTrip && !validRange) {
    return {
      plan,
      placeName: null,
      error:
        "Say whether this stay should cover the **whole trip**, or name **check-in and check-out days** (YYYY-MM-DD from your trip calendar: " +
        [...allowed].slice(0, 6).join(", ") +
        (allowed.size > 6 ? ", …" : "") +
        "), then ask again.",
    };
  }

  const hintRaw = (req.searchHint ?? "boutique hotel").trim() || "boutique hotel";
  const hint = hintRaw.slice(0, 100);
  const loc = plan.location.trim();
  const cityHead = loc.split(",")[0]?.trim() || loc;
  const q = `${cityHead} ${hint}`;

  const picks = await searchPlacesGoogleMaps(q, loc, { limit: 5 });
  const top = picks[0];
  if (!top) {
    return {
      plan,
      placeName: null,
      error: "No hotels matched that search. Try another style or check SerpAPI configuration.",
    };
  }

  const place: PlaceSpotlight = { ...top, spotlightCategory: "hotel" };

  let hotelStays;
  let hotel: PlaceSpotlight;
  let stayStart: string;
  let stayEnd: string;
  if (req.fullTrip) {
    const r = applyHostHotelSelection(plan.hostSetup?.hotelStays, tripStart, tripEnd, tripStart, place, "full");
    hotelStays = r.hotelStays;
    hotel = r.hotel;
    stayStart = tripStart;
    stayEnd = tripEnd;
  } else {
    const r = applyHostHotelDateRange(plan.hostSetup?.hotelStays, tripStart, tripEnd, a!, b!, place);
    hotelStays = r.hotelStays;
    hotel = r.hotel;
    stayStart = a!;
    stayEnd = b!;
  }
  hotelStays = tagLodgingStayAtRange(hotelStays, stayStart, stayEnd, place.mapsUrl, {
    userSelected: false,
    recommendedByConci: true,
  });

  const mergedSetup = mergeHostSetupPatch(plan.hostSetup, { hotelStays, hotel });
  const planRecord = {
    ...(plan as unknown as Record<string, unknown>),
    hostSetup: mergedSetup,
  };
  return { plan: normalizePlan(planRecord), placeName: top.name, error: null };
}

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
function tryInferAutoPinFromMessage(
  message: string,
  plan: TripPlan,
  preferredDateIso?: string | null
): AutoPinRestaurantReq | undefined {
  const tr = plan.hostSetup?.tripRange;
  if (!tr?.startIso || !tr?.endIso) return undefined;
  if (
    !/\b(dinner|lunch|breakfast|brunch|reservation|restaurant|meal|experience|activities|museum|tour|pin|places|food)\b/i.test(
      message
    )
  ) {
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
    else if (/\b(experience|museum|tour|activity|things to do)\b/i.test(message)) searchHint = "things to do";
    return { dateIso: iso, searchHint };
  }

  const pref = typeof preferredDateIso === "string" ? preferredDateIso.trim() : "";
  if (
    pref &&
    /^\d{4}-\d{2}-\d{2}$/.test(pref) &&
    days.includes(pref)
  ) {
    let searchHint = "dinner";
    if (/\blunch\b/i.test(message)) searchHint = "lunch";
    else if (/\bbrunch\b/i.test(message)) searchHint = "brunch";
    else if (/\bbreakfast\b/i.test(message)) searchHint = "breakfast";
    else if (/\b(experience|museum|tour|activity|things to do)\b/i.test(message)) searchHint = "things to do";
    return { dateIso: pref, searchHint };
  }

  return undefined;
}

function tryInferAutoBookHotelFromMessage(
  message: string,
  plan: TripPlan,
  focusNightIso?: string | null
): AutoBookHotelReq | undefined {
  const tr = plan.hostSetup?.tripRange;
  if (!tr?.startIso || !tr?.endIso) return undefined;
  if (!/\b(hotel|hotels|lodging|book\s+(a\s+)?(room|stay)|place\s+to\s+stay|where\s+to\s+stay)\b/i.test(message)) {
    return undefined;
  }
  let searchHint = "boutique hotel";
  if (/\bluxury\b/i.test(message)) searchHint = "luxury hotel";
  else if (/\b(budget|cheap|affordable)\b/i.test(message)) searchHint = "budget hotel";

  const days = enumerateLocalIsoDays(tr.startIso, tr.endIso);
  const f = typeof focusNightIso === "string" ? focusNightIso.trim() : "";
  if (f && /^\d{4}-\d{2}-\d{2}$/.test(f) && days.includes(f)) {
    return { searchHint, stayStartIso: f, stayEndIso: f };
  }

  if (/\b(whole|entire|full)\s+(trip|stay)\b|\b(all|every)\s+(night|nights)\b|for\s+the\s+(whole|entire)\s+trip\b/i.test(message)) {
    return { searchHint, fullTrip: true };
  }

  return { searchHint };
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

  let body: { message?: string; focusDateIso?: string | null };
  try {
    body = (await req.json()) as typeof body;
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
  if (!access) {
    return NextResponse.json({ error: "You don't have access to this trip." }, { status: 403 });
  }
  if (!access.isHost) {
    return NextResponse.json({ error: "Only the trip host can edit the itinerary with Copilot." }, { status: 403 });
  }

  const { data: row, error } = await svc
    .from("trip_plans")
    .select("plan, status")
    .eq("id", id)
    .maybeSingle();

  if (error || !row?.plan) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const planObj = typeof row.plan === "object" && row.plan !== null ? (row.plan as Record<string, unknown>) : {};
  const plan = normalizePlan(planObj);

  const rawFocus =
    typeof body.focusDateIso === "string" ? body.focusDateIso.trim() : "";
  let focusDateIso: string | null =
    rawFocus && /^\d{4}-\d{2}-\d{2}$/.test(rawFocus) ? rawFocus : null;
  const tr0 = plan.hostSetup?.tripRange;
  if (focusDateIso && tr0?.startIso && tr0?.endIso) {
    if (!enumerateLocalIsoDays(tr0.startIso, tr0.endIso).includes(focusDateIso)) {
      focusDateIso = null;
    }
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const year = new Date().getFullYear();

  let assistantText =
    "I couldn’t run the AI copilot (missing API key on the server). You can still edit dates, budget, and details manually in each section.";
  let hostSetupPatch: HostSetupPatch | undefined;
  let planPatch: unknown;
  let uiRaw: Record<string, unknown> | undefined;
  let autoPinRequest: AutoPinRestaurantReq | undefined;
  let autoBookHotelRequest: AutoBookHotelReq | undefined;

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
    focusDateIso ? `UI day focus: ${focusDateIso} — prefer edits that anchor to this ISO day.` : "",
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
            { role: "system", content: buildCopilotSystem(year, focusDateIso) },
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
              autoBookHotel?: unknown;
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
              else if (Array.isArray(p.restaurantPins) && p.restaurantPins.length > 0) {
                const rp = coerceRestaurantPinsFromParsed(plan, p.restaurantPins, focusDateIso);
                if (rp?.length) patch.restaurantPins = rp;
              }
              if (Array.isArray(p.activityPins) && p.activityPins.length === 0) patch.activityPins = [];
              else if (Array.isArray(p.activityPins) && p.activityPins.length > 0) {
                const apPins = coerceActivityPinsFromParsed(plan, p.activityPins, focusDateIso);
                if (apPins?.length) patch.activityPins = apPins;
              }
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
              let dateIso = typeof ap.dateIso === "string" ? ap.dateIso.trim() : "";
              if (/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
                const trPin = plan.hostSetup?.tripRange;
                const allowedDays =
                  trPin?.startIso && trPin?.endIso
                    ? enumerateLocalIsoDays(trPin.startIso, trPin.endIso)
                    : null;
                if (allowedDays && !allowedDays.includes(dateIso)) {
                  if (focusDateIso && allowedDays.includes(focusDateIso)) dateIso = focusDateIso;
                  else dateIso = "";
                }
                if (dateIso) {
                  autoPinRequest = {
                    dateIso,
                    searchHint:
                      typeof ap.searchHint === "string" && ap.searchHint.trim()
                        ? ap.searchHint.trim().slice(0, 80)
                        : undefined,
                  };
                }
              }
            }

            if (
              parsed.autoBookHotel &&
              typeof parsed.autoBookHotel === "object" &&
              !Array.isArray(parsed.autoBookHotel)
            ) {
              const ah = parsed.autoBookHotel as Record<string, unknown>;
              const stayStartIso =
                typeof ah.stayStartIso === "string" ? ah.stayStartIso.trim() : undefined;
              const stayEndIso = typeof ah.stayEndIso === "string" ? ah.stayEndIso.trim() : undefined;
              autoBookHotelRequest = {
                fullTrip: ah.fullTrip === true,
                searchHint:
                  typeof ah.searchHint === "string" && ah.searchHint.trim()
                    ? ah.searchHint.trim().slice(0, 100)
                    : undefined,
                stayStartIso: stayStartIso && /^\d{4}-\d{2}-\d{2}$/.test(stayStartIso) ? stayStartIso : undefined,
                stayEndIso: stayEndIso && /^\d{4}-\d{2}-\d{2}$/.test(stayEndIso) ? stayEndIso : undefined,
              };
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

  if (!autoBookHotelRequest) {
    autoBookHotelRequest = tryInferAutoBookHotelFromMessage(message, nextPlan, focusDateIso ?? undefined);
  }

  if (!autoPinRequest) {
    autoPinRequest = tryInferAutoPinFromMessage(message, nextPlan, focusDateIso ?? undefined);
  }

  const inferTr = nextPlan.hostSetup?.tripRange;
  if (
    focusDateIso &&
    autoPinRequest?.dateIso &&
    inferTr?.startIso &&
    inferTr?.endIso
  ) {
    const allowedInfer = enumerateLocalIsoDays(inferTr.startIso, inferTr.endIso);
    if (allowedInfer.includes(focusDateIso) && !allowedInfer.includes(autoPinRequest.dateIso)) {
      autoPinRequest = { ...autoPinRequest, dateIso: focusDateIso };
    }
  }

  let hotelApplied = false;
  if (autoBookHotelRequest) {
    const res = await applyAutoBookHotel(nextPlan, autoBookHotelRequest);
    if (res.placeName && !res.error) {
      nextPlan = res.plan;
      hotelApplied = true;
      assistantText = `${assistantText}\n\nSaved stay: ${res.placeName} (top Maps search).`.trim();
    } else if (res.error) {
      assistantText = `${assistantText}\n\n${res.error}`.trim();
    }
  }

  let pinApplied = false;
  if (autoPinRequest) {
    const res = await applyAutoPinRestaurant(nextPlan, autoPinRequest);
    if (res.pinName && !res.error) {
      nextPlan = res.plan;
      pinApplied = true;
      const locLabel = nextPlan.location?.trim() || "your destination";
      assistantText = `${assistantText}\n\nPinned ${res.pinName} on ${autoPinRequest.dateIso} (top Google Places result near ${locLabel}).`.trim();
    } else if (res.error) {
      assistantText = `${assistantText}\n\n${res.error}`.trim();
    }
  }

  const changed =
    hotelApplied ||
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
  if ((pinApplied || hotelApplied) && !scrollTo) scrollTo = "dates";
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
