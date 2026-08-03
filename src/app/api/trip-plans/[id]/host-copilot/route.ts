import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { fetchLiveRestaurantsForPlan } from "@/backend/trip-live-restaurants";
import { searchPlacesGoogleMaps } from "@/backend/serpapi-places";
import { suggestStayForTrip } from "@/backend/lodging/suggest-stay";
import { hotelBrowseResultToLodgingMeta } from "@/shared/mock-hotel-search";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { extractOpenAiResponsesOutputText } from "@/shared/openai-responses";
import { restaurantPickToSpotlight } from "@/shared/restaurants";
import type { PlaceSpotlight } from "@/shared/place-preview";
import {
  applyHostLodgingSegment,
  tagLodgingStayAtRange,
  applyTripPlanChatPatch,
  enumerateLocalIsoDays,
  normalizePlan,
  parseHostSetup,
  parseLocalIsoDate,
  planRecordWithDatesSyncedToTripRange,
  safeParseJson,
  type ItineraryActivity,
  type ItineraryDay,
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
  if (patch.flightBookings !== undefined) out.flightBookings = patch.flightBookings;
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

const buildCopilotSystem = (year: number, focusDateIso?: string | null) => `You are the host's setup copilot for a Conci trip. The trip may still be drafting or already shared with travelers; the host can change calendar pins, budgets, vibes, hotels, meals, activities, and the day-by-day itinerary anytime.

**Trip dates (critical):** The only source of truth for "which calendar days exist" is **Host trip range** and **Trip calendar days** in the user message. If those are set, **ignore** older months or date ranges mentioned in "Planner dates slot" — that field is from the first chat parse and is often stale after the host moves the trip on the calendar. Never assign meal pins or reservations to ISO dates outside **Trip calendar days**.
${
  focusDateIso
    ? `\n**Day-focused session:** The host is editing **${focusDateIso}** ONLY unless they clearly ask about another calendar day inside the trip window. Prefer **autoPinRestaurant** with \`dateIso\`="${focusDateIso}". For **autoBookHotel**, use **fullTrip: true** OR \`stayStartIso\`/\`stayEndIso\` covering **${focusDateIso}** when they want a hotel — never omit scope. For **itineraryEdits**, use \`dayDateIso\`="${focusDateIso}" unless the host names a different day.\n`
    : ""
}

Return ONLY valid JSON (no markdown) with this exact shape:
{
  "assistantText": "1-4 short, friendly sentences. Say what you changed.",
  "hostSetupPatch": { },
  "planPatch": { },
  "ui": { },
  "autoPinRestaurant": null,
  "autoBookHotel": null,
  "itineraryEdits": [],
  "autoSearch": null
}

**CRITICAL: When the host asks you to change something, you MUST output the structured data to make it happen. Do NOT just give advice. If they say "change X" or "add X" or "switch X", you MUST populate the relevant action field (itineraryEdits, autoBookHotel, autoPinRestaurant, autoSearch, hostSetupPatch, or planPatch). Only give advice-only responses if they literally ask "what do you think" or "any suggestions".**

**itineraryEdits** (array, optional): Use to modify the day-by-day itinerary. Each edit is an object with:
  - **action**: one of "replaceActivity" | "addActivity" | "removeActivity" | "rewriteDay" | "adjustCosts" | "addTransport"
  - **dayDateIso**: the ISO date of the day to edit (MUST be in Trip calendar days)
  - For **replaceActivity**: set \`activityIndex\` (0-based position in that day's activities array) and \`newActivity\` with the replacement fields (title, description, category, estimatedCostPp, time).
  - For **addActivity**: set \`newActivity\` with at minimum { title, category, estimatedCostPp }.
  - For **removeActivity**: set \`activityIndex\` to remove.
  - For **rewriteDay**: set \`newDayActivities\` (full array of activities for that day) and optional \`dayLabel\`.
  - For **adjustCosts**: set \`budgetTarget\` (target daily total pp) — costs will be scaled proportionally.
  - For **addTransport**: set \`transportDetail\` with { from, to, mode, estimatedCostPp } — e.g. { "from": "Miami", "to": "Key West", "mode": "Bus", "estimatedCostPp": 35 }.

  Use itineraryEdits for: switching activities, adjusting costs to fit budget, adding inter-city transport, changing the plan for a day, making it multi-city.

**autoSearch** (optional): Use when the host asks to find something specific. The server will search Google Maps and apply the result.
  - Shape: { "type": "hotel"|"restaurant"|"activity"|"transport", "query": "search terms", "constraints": "optional extra context", "dateIso": "YYYY-MM-DD if day-specific", "stayStartIso": "for hotels", "stayEndIso": "for hotels" }
  - **query** should be specific: include location qualifiers, budget hints, and requirements.
    - For "hotel near the beach": query = "beachfront hotel [destination]"
    - For "cheap flights for 7 people": query = "budget airline [origin] to [destination]" (add context in constraints)
    - For "all-inclusive resort": query = "all inclusive resort [destination]"
    - For "Italian restaurant on the 16th": query = "Italian restaurant [destination]", dateIso = "2026-07-16"
  - **constraints** (optional): extra context like "for 7 people", "under $100/night", "near downtown", "all-inclusive"

**autoBookHotel** (optional): Use when the host asks to **pick or book a hotel / place to stay** and they (or you) have nailed down **scope**. The server runs the LiteAPI lodging search (vibe/budget aware) and saves the best match. Put the host's lodging intent (style, area, price) in **searchHint**.
  - You MUST set one of:
    - **fullTrip**: true — stay covers the entire **Host trip range** (first night through last night).
    - **stayStartIso** AND **stayEndIso** (YYYY-MM-DD, within **Trip calendar days**, inclusive) — specific check-in through check-out range.
  - **searchHint** (optional): style/neighborhood/requirements, e.g. "boutique hotel near beach", "all-inclusive resort", "budget hostel downtown".
  - For multi-city trips: use separate autoSearch calls with different stayStartIso/stayEndIso ranges for each city segment.

**autoPinRestaurant** (optional): Use when the host asks to add/set a **restaurant reservation or dinner** on a **specific trip day**.
  - Shape: { "dateIso": "YYYY-MM-DD", "searchHint": "dinner" } — \`dateIso\` must be one of **Trip calendar days**.
  - \`searchHint\` optional: e.g. "Italian dinner", "seafood", "cheap street food", "fine dining".

Rules:
- **assistantText** is required. Be concise and actionable. Confirm what you changed.
- **hostSetupPatch** (optional): only keys the host setup actually needs to change:
  - **tripRange**: { "startIso": "YYYY-MM-DD", "endIso": "YYYY-MM-DD" } — inclusive local dates. Assume year ${year} unless stated otherwise.
  - When you **change tripRange**, also set **restaurantPins**: [] and **activityPins**: [] to clear old pins.
  - **hotel**: only set to null to clear; for a new stay use **autoBookHotel** or **autoSearch** type=hotel.
  - **experiencesOutlined**: boolean.
  - You may populate **restaurantPins** / **activityPins** as structured arrays; every \`dateIso\` MUST be inside **Trip calendar days**.
- **planPatch** (optional): top-level trip plan fields:
  - Allowed: title, location, departureCity, dates, people, budget, vibe, openDecisions, nextStep, confidence.
  - **budget**: { "tier", "perPerson" } — e.g. "splurge", "$150/person".
  - Never include spotlights or itineraryLiveCuration.
- **ui** (optional):
  - **scrollTo**: "dates" | "budget"
  - **suggestDatePickMode**: "range" | "day"
  - **focusTripStartMonth**: true when you set tripRange.

MULTI-CITY TRIPS:
- When making a trip multi-city, use itineraryEdits to: (1) rewrite relevant days with the new city's activities, (2) add transport between cities via "addTransport", (3) use autoSearch type=hotel with stayStartIso/stayEndIso for each city segment.
- Update planPatch.location to comma-separated cities if needed.

BUDGET ENFORCEMENT (CRITICAL — read carefully):
- When asked to fit within budget or reduce costs, you MUST use itineraryEdits action="rewriteDay" on EVERY day that is over budget. Replace expensive activities and restaurants with cheaper alternatives that still fit the trip vibe and destination. Do NOT just use "adjustCosts" — that only changes numbers without changing venues. You must actually swap out expensive restaurants, activities, and lodging for budget-friendly ones.
- ALSO set autoSearch type="hotel" with budget-appropriate terms (e.g. "budget hotel [destination]", "cheap hostel [destination]") so the lodging actually changes.
- ALSO update planPatch.budget.perPerson to reflect the new budget target.
- When asked about cheap/budget options: use autoSearch with budget-appropriate query terms ("cheap", "budget", "affordable").
- NEVER just scale costs. The user expects actual venue/activity changes, not just lower numbers on the same plan.

Example: Host says "this is too expensive, I want $1000 budget per person" and current itinerary totals $1800pp over 3 days in Cancún:
→ itineraryEdits: [{ "action": "rewriteDay", "dayDateIso": "2026-08-01", "dayLabel": "Arrival & Beach", "newDayActivities": [{ "time": "Morning", "title": "Flight: LAX → Cancún", "category": "transport", "estimatedCostPp": 150 }, { "time": "Afternoon", "title": "Free beach time at Playa Delfines", "category": "activity", "estimatedCostPp": 0 }, { "time": "Lunch", "title": "Street tacos at Parque de las Palapas", "category": "food", "estimatedCostPp": 8 }, { "time": "Evening", "title": "Check in to hostel", "category": "lodging", "estimatedCostPp": 90 }, { "time": "Dinner", "title": "Ceviche at La Habichuela Sunset", "category": "food", "estimatedCostPp": 22 }] }, { "action": "rewriteDay", "dayDateIso": "2026-08-02", ... }, { "action": "rewriteDay", "dayDateIso": "2026-08-03", ... }]
+ autoSearch: { "type": "hotel", "query": "budget hotel Cancún near beach", "constraints": "under $60/night" }
+ planPatch: { "budget": { "perPerson": "$1000" } }

Example: Host says "switch my Tuesday plans to beach activities" and Tuesday is 2026-07-15 with 4 activities:
→ itineraryEdits: [{ "action": "rewriteDay", "dayDateIso": "2026-07-15", "dayLabel": "Beach Day", "newDayActivities": [{ "time": "Morning", "title": "Beach sunrise yoga", "category": "activity", "estimatedCostPp": 0 }, { "time": "Late Morning", "title": "Snorkeling at coral reef", "category": "activity", "estimatedCostPp": 45 }, { "time": "Lunch", "title": "Beach shack seafood", "category": "food", "estimatedCostPp": 18 }, { "time": "Afternoon", "title": "Jet ski rental", "category": "activity", "estimatedCostPp": 60 }, { "time": "Evening", "title": "Sunset beach dinner", "category": "food", "estimatedCostPp": 35 }] }]

Example: Host says "add a hotel near the beach for the whole trip":
→ autoSearch: { "type": "hotel", "query": "beachfront hotel [destination]", "constraints": "near the beach" }

Example: Host says "make it a multi-city trip, add 2 days in Key West after Miami":
→ itineraryEdits: [{ "action": "addTransport", "dayDateIso": "2026-07-18", "transportDetail": { "from": "Miami", "to": "Key West", "mode": "Drive/Bus", "estimatedCostPp": 35 } }, { "action": "rewriteDay", "dayDateIso": "2026-07-18", "dayLabel": "Key West Arrival", "newDayActivities": [...] }, { "action": "rewriteDay", "dayDateIso": "2026-07-19", "dayLabel": "Key West Exploration", "newDayActivities": [...] }]
+ autoSearch: { "type": "hotel", "query": "hotel Key West downtown", "stayStartIso": "2026-07-18", "stayEndIso": "2026-07-19" }
+ planPatch: { "location": "Miami, Key West" }`;

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

  const hint = (req.searchHint ?? "").trim().slice(0, 120);
  const loc = plan.location.trim();
  const checkIn = req.fullTrip ? tripStart : a!;
  const checkOut = req.fullTrip ? tripEnd : b!;

  // Lodging intent → LiteAPI vibe-aware lodging flow (never SerpAPI Google Maps).
  const pick = await suggestStayForTrip({
    destination: loc,
    checkIn,
    checkOut,
    guests: Math.max(1, plan.people.count ?? plan.people.names.length ?? 2),
    rooms: 1,
    vibe: plan.vibe ?? [],
    budgetTier: plan.budget?.tier ?? null,
    budgetPerPerson: plan.budget?.perPerson ?? null,
    seedText: hint || (plan.vibe ?? []).join(" "),
  });
  if (!pick) {
    return {
      plan,
      placeName: null,
      error: "No lodging matched that search. Try another style, dates, or budget.",
    };
  }
  const h = pick.hotel;
  const place: PlaceSpotlight = {
    name: h.name,
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${h.name} ${loc}`)}`,
    spotlightCategory: "hotel",
    ...(h.rating > 0 ? { rating: h.rating } : {}),
    ...(h.reviewCount ? { reviewCount: h.reviewCount } : {}),
    ...(h.addressLine ? { address: h.addressLine } : {}),
    ...(h.imageUrl ? { photoUrl: h.imageUrl } : {}),
    ...(h.nightlyUsd > 0 ? { priceRange: `~$${h.nightlyUsd}/night` } : {}),
  };

  let hotelStays;
  let hotel: PlaceSpotlight;
  let stayStart: string;
  let stayEnd: string;
  const meta = hotelBrowseResultToLodgingMeta(h, {
    destinationCity: loc,
    guestCount: Math.max(1, plan.people.count ?? plan.people.names.length ?? 2),
    roomCount: 1,
    searchSource: pick.source,
  });
  if (req.fullTrip) {
    const r = applyHostLodgingSegment(plan.hostSetup?.hotelStays, tripStart, tripEnd, tripStart, tripEnd, place, meta);
    hotelStays = r.hotelStays;
    hotel = r.hotel;
    stayStart = tripStart;
    stayEnd = tripEnd;
  } else {
    const r = applyHostLodgingSegment(plan.hostSetup?.hotelStays, tripStart, tripEnd, a!, b!, place, meta);
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
  return { plan: normalizePlan(planRecord), placeName: h.name, error: null };
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

// --- Itinerary edit actions ---

type ItineraryEditAction = {
  action: "replaceActivity" | "addActivity" | "removeActivity" | "rewriteDay" | "adjustCosts" | "addTransport";
  dayDateIso?: string;
  activityIndex?: number;
  newActivity?: Partial<ItineraryActivity>;
  newDayActivities?: Partial<ItineraryActivity>[];
  dayLabel?: string;
  budgetTarget?: number;
  transportDetail?: { from: string; to: string; mode: string; estimatedCostPp: number | null };
};

type AutoSearchAction = {
  type: "hotel" | "restaurant" | "activity" | "transport";
  query: string;
  constraints?: string;
  dateIso?: string;
  stayStartIso?: string;
  stayEndIso?: string;
};

function applyItineraryEdits(plan: TripPlan, edits: ItineraryEditAction[]): { plan: TripPlan; applied: number } {
  const itinerary = plan.generatedItinerary;
  if (!itinerary?.days?.length) return { plan, applied: 0 };

  let applied = 0;

  for (const edit of edits) {
    const dayIdx = itinerary.days.findIndex((d) => d.dateIso === edit.dayDateIso);

    switch (edit.action) {
      case "replaceActivity": {
        if (dayIdx < 0 || edit.activityIndex == null || !edit.newActivity) break;
        const day = itinerary.days[dayIdx]!;
        if (edit.activityIndex < 0 || edit.activityIndex >= day.activities.length) break;
        const existing = day.activities[edit.activityIndex]!;
        day.activities[edit.activityIndex] = {
          time: edit.newActivity.time ?? existing.time,
          title: edit.newActivity.title ?? existing.title,
          description: edit.newActivity.description ?? existing.description,
          category: (edit.newActivity.category ?? existing.category) as ItineraryActivity["category"],
          estimatedCostPp: edit.newActivity.estimatedCostPp !== undefined ? edit.newActivity.estimatedCostPp : existing.estimatedCostPp,
          bookingUrl: edit.newActivity.bookingUrl ?? existing.bookingUrl,
        };
        recalcDayCost(day);
        applied++;
        break;
      }
      case "addActivity": {
        if (dayIdx < 0 || !edit.newActivity?.title) break;
        const day = itinerary.days[dayIdx]!;
        day.activities.push({
          time: edit.newActivity.time ?? "TBD",
          title: edit.newActivity.title,
          description: edit.newActivity.description ?? "",
          category: (edit.newActivity.category ?? "activity") as ItineraryActivity["category"],
          estimatedCostPp: edit.newActivity.estimatedCostPp ?? null,
          bookingUrl: edit.newActivity.bookingUrl ?? null,
        });
        recalcDayCost(day);
        applied++;
        break;
      }
      case "removeActivity": {
        if (dayIdx < 0 || edit.activityIndex == null) break;
        const day = itinerary.days[dayIdx]!;
        if (edit.activityIndex < 0 || edit.activityIndex >= day.activities.length) break;
        day.activities.splice(edit.activityIndex, 1);
        recalcDayCost(day);
        applied++;
        break;
      }
      case "rewriteDay": {
        if (dayIdx < 0 || !edit.newDayActivities?.length) break;
        const day = itinerary.days[dayIdx]!;
        if (edit.dayLabel) day.label = edit.dayLabel;
        day.activities = edit.newDayActivities.map((a) => ({
          time: a.time ?? "TBD",
          title: a.title ?? "Activity",
          description: a.description ?? "",
          category: (a.category ?? "activity") as ItineraryActivity["category"],
          estimatedCostPp: a.estimatedCostPp ?? null,
          bookingUrl: a.bookingUrl ?? null,
        }));
        recalcDayCost(day);
        applied++;
        break;
      }
      case "adjustCosts": {
        if (dayIdx < 0 || !edit.budgetTarget) break;
        const day = itinerary.days[dayIdx]!;
        const currentTotal = day.activities.reduce((s, a) => s + (a.estimatedCostPp ?? 0), 0);
        if (currentTotal <= 0) break;
        const ratio = edit.budgetTarget / currentTotal;
        for (const act of day.activities) {
          if (act.estimatedCostPp != null && act.estimatedCostPp > 0) {
            act.estimatedCostPp = Math.round(act.estimatedCostPp * ratio);
          }
        }
        recalcDayCost(day);
        applied++;
        break;
      }
      case "addTransport": {
        if (dayIdx < 0 || !edit.transportDetail) break;
        const day = itinerary.days[dayIdx]!;
        day.activities.push({
          time: "TBD",
          title: `${edit.transportDetail.mode} ${edit.transportDetail.from} → ${edit.transportDetail.to}`,
          description: `${edit.transportDetail.mode} from ${edit.transportDetail.from} to ${edit.transportDetail.to}`,
          category: "transport",
          estimatedCostPp: edit.transportDetail.estimatedCostPp,
          bookingUrl: null,
        });
        recalcDayCost(day);
        applied++;
        break;
      }
    }
  }

  if (applied > 0) {
    itinerary.totalEstimatePp = itinerary.days.reduce((s, d) => s + (d.estimatedDayCostPp ?? 0), 0) || null;
    const headcount = plan.people.count ?? (plan.people.names.length || 2);
    itinerary.totalEstimateGroup = itinerary.totalEstimatePp != null ? itinerary.totalEstimatePp * headcount : null;
    itinerary.generatedAt = new Date().toISOString();
  }

  return { plan: { ...plan, generatedItinerary: itinerary }, applied };
}

function recalcDayCost(day: ItineraryDay): void {
  day.estimatedDayCostPp = day.activities.reduce((s, a) => s + (a.estimatedCostPp ?? 0), 0) || null;
}

async function applyAutoSearch(
  plan: TripPlan,
  search: AutoSearchAction
): Promise<{ plan: TripPlan; resultName: string | null; error: string | null }> {
  const location = plan.location?.trim();
  if (!location) return { plan, resultName: null, error: "Set a destination first." };

  // Lodging intent → LiteAPI vibe-aware lodging flow (never SerpAPI Google Maps).
  if (search.type === "hotel") {
    const tr = plan.hostSetup?.tripRange;
    if (!tr?.startIso || !tr?.endIso) return { plan, resultName: null, error: "Set trip dates first." };
    const startIso = search.stayStartIso || tr.startIso;
    const endIso = search.stayEndIso || tr.endIso;
    const pick = await suggestStayForTrip({
      destination: location,
      checkIn: startIso,
      checkOut: endIso,
      guests: Math.max(1, plan.people.count ?? plan.people.names.length ?? 2),
      rooms: 1,
      vibe: plan.vibe ?? [],
      budgetTier: plan.budget?.tier ?? null,
      budgetPerPerson: plan.budget?.perPerson ?? null,
      seedText: search.query,
    });
    if (!pick) return { plan, resultName: null, error: `No lodging matched "${search.query}". Try different details.` };
    const h = pick.hotel;
    const place: PlaceSpotlight = {
      name: h.name,
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${h.name} ${location}`)}`,
      spotlightCategory: "hotel",
      ...(h.rating > 0 ? { rating: h.rating } : {}),
      ...(h.reviewCount ? { reviewCount: h.reviewCount } : {}),
      ...(h.addressLine ? { address: h.addressLine } : {}),
      ...(h.imageUrl ? { photoUrl: h.imageUrl } : {}),
      ...(h.nightlyUsd > 0 ? { priceRange: `~$${h.nightlyUsd}/night` } : {}),
    };
    const r = applyHostLodgingSegment(
      plan.hostSetup?.hotelStays,
      tr.startIso,
      tr.endIso,
      startIso,
      endIso,
      place,
      hotelBrowseResultToLodgingMeta(h, {
        destinationCity: location,
        guestCount: Math.max(1, plan.people.count ?? plan.people.names.length ?? 2),
        roomCount: 1,
        searchSource: pick.source,
      })
    );
    const hotelStays = tagLodgingStayAtRange(r.hotelStays, startIso, endIso, place.mapsUrl, {
      userSelected: false,
      recommendedByConci: true,
    });
    const mergedSetup = mergeHostSetupPatch(plan.hostSetup, { hotelStays, hotel: r.hotel });
    return {
      plan: normalizePlan({ ...(plan as unknown as Record<string, unknown>), hostSetup: mergedSetup }),
      resultName: h.name,
      error: null,
    };
  }

  // Restaurants / activities / other enrichment → SerpAPI Places.
  const results = await searchPlacesGoogleMaps(search.query, location, { limit: 3 });
  const top = results[0];
  if (!top) return { plan, resultName: null, error: `No results found for "${search.query}". Try different keywords.` };

  switch (search.type) {
    case "restaurant": {
      const tr = plan.hostSetup?.tripRange;
      if (!tr?.startIso || !tr?.endIso) return { plan, resultName: null, error: "Set trip dates first." };
      const dateIso = search.dateIso || tr.startIso;
      if (!enumerateLocalIsoDays(tr.startIso, tr.endIso).includes(dateIso)) {
        return { plan, resultName: null, error: "That date is outside your trip range." };
      }
      const place: PlaceSpotlight = { ...top, spotlightCategory: "restaurant" };
      const others = [...(plan.hostSetup?.restaurantPins ?? [])].filter((p) => !(p.dateIso === dateIso && p.place.name === top.name));
      others.push({ dateIso, place, kept: true });
      const mergedSetup = mergeHostSetupPatch(plan.hostSetup, { restaurantPins: others });
      return {
        plan: normalizePlan({ ...(plan as unknown as Record<string, unknown>), hostSetup: mergedSetup }),
        resultName: top.name,
        error: null,
      };
    }
    case "activity": {
      const tr = plan.hostSetup?.tripRange;
      if (!tr?.startIso || !tr?.endIso) return { plan, resultName: null, error: "Set trip dates first." };
      const dateIso = search.dateIso || tr.startIso;
      if (!enumerateLocalIsoDays(tr.startIso, tr.endIso).includes(dateIso)) {
        return { plan, resultName: null, error: "That date is outside your trip range." };
      }
      const exp: HostActivityExperience = {
        name: top.name,
        bookingUrl: top.mapsUrl,
        pricePerPerson: top.priceRange || "",
        rating: top.rating != null ? String(top.rating) : "",
        duration: "",
        coverPhotoUrl: top.photoUrl || null,
      };
      const others = [...(plan.hostSetup?.activityPins ?? [])].filter((p) => !(p.dateIso === dateIso && p.experience.name === top.name));
      others.push({ dateIso, experience: exp, kept: true });
      const mergedSetup = mergeHostSetupPatch(plan.hostSetup, { activityPins: others });
      return {
        plan: normalizePlan({ ...(plan as unknown as Record<string, unknown>), hostSetup: mergedSetup }),
        resultName: top.name,
        error: null,
      };
    }
    default:
      return { plan, resultName: top.name, error: null };
  }
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
  const itineraryEdits: ItineraryEditAction[] = [];
  let autoSearchRequest: AutoSearchAction | undefined;

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

  // Build itinerary summary for context
  let itinerarySummary = "Generated itinerary: none";
  if (plan.generatedItinerary?.days?.length) {
    const dayLines = plan.generatedItinerary.days.map((d) => {
      const acts = d.activities.map((a, ai) =>
        `    [${ai}] ${a.time} | ${a.title} (${a.category}, $${a.estimatedCostPp ?? "?"}pp)`
      ).join("\n");
      return `  ${d.dateIso} "${d.label}" (day total: $${d.estimatedDayCostPp ?? "?"}pp):\n${acts}`;
    });
    itinerarySummary = `Generated itinerary (${plan.generatedItinerary.days.length} days, total $${plan.generatedItinerary.totalEstimatePp ?? "?"}pp):\n${dayLines.join("\n")}`;
  }

  // Build hotel stays summary
  let hotelStaysSummary = "";
  if (hs?.hotelStays?.length) {
    hotelStaysSummary = `Hotel stays: ${hs.hotelStays.map((s) => `${s.place?.name ?? "unnamed"} (${(s as { startIso?: string }).startIso ?? "?"} to ${(s as { endIso?: string }).endIso ?? "?"})`).join(", ")}`;
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
    `People: ${plan.people.count ?? (plan.people.names.length || "unknown")} travelers`,
    `Hotel saved: ${hs?.hotel?.name ?? "none"}`,
    hotelStaysSummary,
    `Experiences outlined checkbox: ${hs?.experiencesOutlined === true ? "yes" : "no"}`,
    `Restaurant pins: ${(hs?.restaurantPins ?? []).length}`,
    `Activity pins: ${(hs?.activityPins ?? []).length}`,
    `Planner dates slot (may be outdated — use Host trip range first): ${(plan.dates?.options ?? []).join(" | ") || "none"}`,
    "",
    itinerarySummary,
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
          model: "gpt-4o",
          temperature: 0.3,
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

            // Parse itineraryEdits
            if (Array.isArray((parsed as Record<string, unknown>).itineraryEdits)) {
              const rawEdits = (parsed as Record<string, unknown>).itineraryEdits as unknown[];
              const validActions = new Set(["replaceActivity", "addActivity", "removeActivity", "rewriteDay", "adjustCosts", "addTransport"]);
              for (const rawEdit of rawEdits) {
                if (!rawEdit || typeof rawEdit !== "object") continue;
                const e = rawEdit as Record<string, unknown>;
                const action = typeof e.action === "string" ? e.action : "";
                if (!validActions.has(action)) continue;
                const dayDateIso = typeof e.dayDateIso === "string" ? e.dayDateIso.trim() : undefined;
                const edit: ItineraryEditAction = { action: action as ItineraryEditAction["action"], dayDateIso };
                if (typeof e.activityIndex === "number") edit.activityIndex = Math.floor(e.activityIndex);
                if (e.newActivity && typeof e.newActivity === "object") {
                  const na = e.newActivity as Record<string, unknown>;
                  edit.newActivity = {
                    ...(typeof na.time === "string" ? { time: na.time } : {}),
                    ...(typeof na.title === "string" ? { title: na.title } : {}),
                    ...(typeof na.description === "string" ? { description: na.description } : {}),
                    ...(typeof na.category === "string" ? { category: na.category as ItineraryActivity["category"] } : {}),
                    ...(typeof na.estimatedCostPp === "number" ? { estimatedCostPp: na.estimatedCostPp } : na.estimatedCostPp === null ? { estimatedCostPp: null } : {}),
                  };
                }
                if (Array.isArray(e.newDayActivities)) {
                  edit.newDayActivities = (e.newDayActivities as unknown[])
                    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
                    .map((a) => ({
                      ...(typeof a.time === "string" ? { time: a.time } : {}),
                      ...(typeof a.title === "string" ? { title: a.title } : {}),
                      ...(typeof a.description === "string" ? { description: a.description } : {}),
                      ...(typeof a.category === "string" ? { category: a.category as ItineraryActivity["category"] } : {}),
                      ...(typeof a.estimatedCostPp === "number" ? { estimatedCostPp: a.estimatedCostPp } : a.estimatedCostPp === null ? { estimatedCostPp: null } : {}),
                    }));
                }
                if (typeof e.dayLabel === "string") edit.dayLabel = e.dayLabel;
                if (typeof e.budgetTarget === "number") edit.budgetTarget = e.budgetTarget;
                if (e.transportDetail && typeof e.transportDetail === "object") {
                  const td = e.transportDetail as Record<string, unknown>;
                  if (typeof td.from === "string" && typeof td.to === "string" && typeof td.mode === "string") {
                    edit.transportDetail = {
                      from: td.from,
                      to: td.to,
                      mode: td.mode,
                      estimatedCostPp: typeof td.estimatedCostPp === "number" ? td.estimatedCostPp : null,
                    };
                  }
                }
                itineraryEdits.push(edit);
              }
            }

            // Parse autoSearch
            if ((parsed as Record<string, unknown>).autoSearch && typeof (parsed as Record<string, unknown>).autoSearch === "object" && !Array.isArray((parsed as Record<string, unknown>).autoSearch)) {
              const as_ = (parsed as Record<string, unknown>).autoSearch as Record<string, unknown>;
              const searchType = typeof as_.type === "string" ? as_.type : "";
              const query = typeof as_.query === "string" ? as_.query.trim() : "";
              if (["hotel", "restaurant", "activity", "transport"].includes(searchType) && query) {
                autoSearchRequest = {
                  type: searchType as AutoSearchAction["type"],
                  query: query.slice(0, 200),
                  constraints: typeof as_.constraints === "string" ? as_.constraints.trim().slice(0, 200) : undefined,
                  dateIso: typeof as_.dateIso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(as_.dateIso) ? as_.dateIso : undefined,
                  stayStartIso: typeof as_.stayStartIso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(as_.stayStartIso) ? as_.stayStartIso : undefined,
                  stayEndIso: typeof as_.stayEndIso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(as_.stayEndIso) ? as_.stayEndIso : undefined,
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
      assistantText = `${assistantText}\n\nSaved stay: ${res.placeName} (provider-matched lodging result).`.trim();
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

  // Fallback: if user asked about budget/cost and model didn't emit itinerary rewrites, regenerate days server-side
  if (
    itineraryEdits.length === 0 &&
    nextPlan.generatedItinerary?.days?.length &&
    /\b(budget|cost|expensive|cheap|afford|within|under|reduce|cut|lower|save|fit)\b/i.test(message)
  ) {
    const budgetMatch = message.match(/\$\s*([\d,]+)/);
    if (budgetMatch) {
      const targetTotal = parseFloat(budgetMatch[1]!.replace(/,/g, ""));
      const currentTotal = nextPlan.generatedItinerary.totalEstimatePp ?? 0;
      if (targetTotal > 0 && currentTotal > 0 && currentTotal > targetTotal * 1.1) {
        const days = nextPlan.generatedItinerary.days;
        const targetDaily = Math.round(targetTotal / days.length);
        const location = nextPlan.location?.trim() || "destination";

        try {
          const rewritePrompt = `You are rewriting a trip itinerary for ${location} to fit a STRICT budget of $${targetTotal} total per person ($${targetDaily}/day).

Current itinerary costs $${currentTotal}pp total. You MUST replace expensive activities, restaurants, and lodging with REAL budget-friendly alternatives. Use free activities (beaches, parks, walking tours), cheap street food, budget hostels/hotels, and public transport.

Current itinerary (JSON):
${JSON.stringify(days.map((d) => ({ dateIso: d.dateIso, label: d.label, activities: d.activities })))}

Rewrite ALL days to fit within $${targetDaily}/day per person. Return ONLY a JSON array of day objects with the same structure. Every activity must have realistic costs for budget travel in ${location}. Use real venue/neighborhood names, not generic placeholders.`;

          const rewriteResp = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
            body: JSON.stringify({
              model: "gpt-4o",
              temperature: 0.5,
              messages: [
                { role: "system", content: "You rewrite trip itineraries to fit budget constraints. Output ONLY valid JSON (array of day objects). Keep the same dateIso values. Use real place names." },
                { role: "user", content: rewritePrompt },
              ],
            }),
          });

          if (rewriteResp.ok) {
            const rewriteJson = await rewriteResp.json();
            const rewriteText = rewriteJson.choices?.[0]?.message?.content?.trim() || "";
            const cleaned = rewriteText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
            const rewrittenDays = safeParseJson(cleaned);
            if (Array.isArray(rewrittenDays) && rewrittenDays.length > 0) {
              for (const newDay of rewrittenDays) {
                if (!newDay || typeof newDay !== "object" || !newDay.dateIso) continue;
                const existingIdx = nextPlan.generatedItinerary!.days.findIndex((d) => d.dateIso === newDay.dateIso);
                if (existingIdx < 0) continue;
                if (Array.isArray(newDay.activities) && newDay.activities.length > 0) {
                  itineraryEdits.push({
                    action: "rewriteDay",
                    dayDateIso: newDay.dateIso,
                    dayLabel: typeof newDay.label === "string" ? newDay.label : undefined,
                    newDayActivities: newDay.activities.map((a: Record<string, unknown>) => ({
                      time: typeof a.time === "string" ? a.time : "TBD",
                      title: typeof a.title === "string" ? a.title : "Activity",
                      description: typeof a.description === "string" ? a.description : "",
                      category: typeof a.category === "string" ? a.category : "activity",
                      estimatedCostPp: typeof a.estimatedCostPp === "number" ? a.estimatedCostPp : null,
                    })),
                  });
                }
              }

              // Also search for a budget hotel
              if (!autoSearchRequest && location) {
                autoSearchRequest = {
                  type: "hotel",
                  query: `budget hotel ${location}`,
                  constraints: `under $${Math.round(targetDaily * 0.35)}/night per person`,
                };
              }

              // Update budget in plan
              nextPlan = {
                ...nextPlan,
                budget: { ...nextPlan.budget, perPerson: `$${targetTotal}` },
              };
            }
          }
        } catch (e) {
          console.warn("[host-copilot] Budget rewrite fallback failed:", (e as Error)?.message);
          // Fall through to adjustCosts as last resort
          const targetDailyFallback = targetTotal / days.length;
          for (const day of days) {
            if ((day.estimatedDayCostPp ?? 0) > targetDailyFallback * 1.2) {
              itineraryEdits.push({
                action: "adjustCosts",
                dayDateIso: day.dateIso,
                budgetTarget: Math.round(targetDailyFallback),
              });
            }
          }
        }
      }
    }
  }

  // Apply itinerary edits
  let itineraryApplied = false;
  if (itineraryEdits.length > 0) {
    const result = applyItineraryEdits(nextPlan, itineraryEdits);
    if (result.applied > 0) {
      nextPlan = result.plan;
      itineraryApplied = true;

      // Recalculate totalEstimatePp after edits
      if (nextPlan.generatedItinerary?.days?.length) {
        nextPlan.generatedItinerary.totalEstimatePp = nextPlan.generatedItinerary.days.reduce(
          (sum, d) => sum + (d.estimatedDayCostPp ?? 0), 0
        );
      }

      if (!assistantText.includes("adjusted") && !assistantText.includes("rewritten") && !assistantText.includes("swapped") && !assistantText.includes("replaced")) {
        const hasRewrites = itineraryEdits.some((e) => e.action === "rewriteDay");
        if (hasRewrites) {
          assistantText = `${assistantText}\n\nDone — I've rewritten the itinerary with budget-friendly restaurants, activities, and lodging to fit your budget.`.trim();
        } else {
          assistantText = `${assistantText}\n\nDone — I've adjusted the itinerary to fit your budget.`.trim();
        }
      }
    }
  }

  // Apply auto search
  let searchApplied = false;
  if (autoSearchRequest) {
    const res = await applyAutoSearch(nextPlan, autoSearchRequest);
    if (res.resultName && !res.error) {
      nextPlan = res.plan;
      searchApplied = true;
      assistantText = `${assistantText}\n\nFound and saved: ${res.resultName}.`.trim();
    } else if (res.error) {
      assistantText = `${assistantText}\n\n${res.error}`.trim();
    }
  }

  const changed =
    hotelApplied ||
    pinApplied ||
    itineraryApplied ||
    searchApplied ||
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
