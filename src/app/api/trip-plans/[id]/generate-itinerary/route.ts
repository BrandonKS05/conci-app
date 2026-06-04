import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { generateMemberRecommendations } from "@/backend/member-recommendations";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { extractOpenAiResponsesOutputText } from "@/shared/openai-responses";
import { parseCollabState, VIBE_POLL_DECISION_KEY } from "@/shared/collaboration";
import { parseDayVoteState, type DayVoteStateByDate, type DayVoteCategoryState } from "@/shared/day-collaboration";
import {
  enumerateLocalIsoDays,
  hasUserSelectedLodging,
  isUserSelectedLodgingStay,
  mergeAiHotelStaysPreservingUser,
  normalizePlan,
  parseLocalIsoDate,
  safeParseJson,
  tripRangeBestEffortFromPlanDates,
  type TripPlan,
  type GeneratedItinerary,
  type ItineraryDay,
  type ItineraryActivity,
  type HostRestaurantPin,
  type HostActivityPin,
  type HostHotelStay,
} from "@/shared/trip-plan";
import { isUuid } from "@/shared/is-uuid";
import { enrichItineraryWithVenues } from "@/backend/itinerary-venue-enrichment";
import type { PlacePreview } from "@/shared/place-preview";

/** Hard ceiling on each OpenAI call so a slow upstream can't hang the request. */
const OPENAI_TIMEOUT_MS = 60_000;

const ITINERARY_SYSTEM_PROMPT = `You are a travel itinerary planner. Given trip details, generate a realistic day-by-day itinerary with estimated costs.

Return ONLY valid JSON matching this schema:
{
  "days": [
    {
      "dateIso": "YYYY-MM-DD or Day 1/Day 2/etc if dates are approximate",
      "label": "Short day theme (e.g. 'Arrival & Settle In', 'Beach Day', 'Culture & History')",
      "activities": [
        {
          "time": "Morning/Afternoon/Evening or specific time like '10:00 AM'",
          "title": "Activity name",
          "description": "1-2 sentence description of what this involves",
          "category": "transport|food|activity|lodging|free-time",
          "estimatedCostPp": null or number in USD per person (0 for free activities)
        }
      ],
      "estimatedDayCostPp": null or sum of activity costs for that day per person
    }
  ]
}

Rules:

BUDGET ENFORCEMENT (critical):
- The user prompt contains a HARD BUDGET CONSTRAINT section with exact daily allocation. You MUST respect it.
- Before finalizing output, mentally sum ALL estimatedCostPp values across all days. The total MUST be within ±15% of the stated total budget.
- If no explicit budget is given, assume moderate ($150-250/day/person).
- Tier guide for venue selection:
  * "budget": hostels/shared Airbnb ($20-60 pp/night), street food ($5-12/meal), free attractions, public transit
  * "moderate": mid-range hotels/Airbnb ($50-120 pp/night after group split), casual restaurants ($15-40/meal), paid attractions ($10-50), rideshare
  * "splurge": luxury hotels/villas ($150-400 pp/night after group split), fine dining ($50-150/meal), premium experiences ($100+), private transfers
- Lodging cost: Put on Day 1 as (nightly rate for entire group's accommodation ÷ headcount × number of nights) OR split evenly across days. The key is: estimate what the actual room/rental costs, then divide by group size for estimatedCostPp.
- Each activity's estimatedCostPp MUST be realistic for the stated tier and destination. Do NOT inflate or undercount.
- If you cannot fit desired activities within budget, prioritize free/cheap alternatives that still match the vibe.

VIBE ENFORCEMENT (critical):
- The user prompt may contain a VIBE CONSTRAINT section. Follow it strictly.
- At least 30-40% of non-transport/lodging activities MUST match the stated vibe(s).
- If multiple vibes are given, distribute activities roughly evenly across them.
- Do NOT default to generic sightseeing if a specific vibe is requested.

GENERAL RULES:
- Generate one day per trip day. If dates are vague (e.g. "late June", "3 days"), infer a reasonable number of days (default 3-4 for weekends, 5-7 for "a week").
- MINIMUM ACTIVITIES PER DAY: Every day MUST have at least 5 activities (including meals, transport, and lodging). No day should feel empty. Even "relaxed" days need at least: breakfast, 1 activity, lunch, 1 activity or free-time-with-suggestion, dinner.
- If pace preference is provided: "packed" = 6-8 activities/day; "relaxed" = 5-6 activities with free-time blocks between; default = 5-7 activities/day.
- NO REPEATING: Never repeat the same activity, restaurant, or attraction across different days. Each day must have unique venues and experiences. The only exceptions are lodging (same hotel each night) and daily transport (airport transfers on first/last day).
- If interests are specified, weight activities heavily toward those categories.
- All estimatedCostPp values are PER PERSON. For shared costs, divide by group size:
  * LODGING: Calculate total nightly rate for enough rooms/space for the group, then divide by headcount. E.g. 6 people need 3 hotel rooms at $150/night = $450/night ÷ 6 = $75 pp. Or one Airbnb at $300/night ÷ 6 = $50 pp.
  * TRANSPORT (non-flight): If shared (e.g. rental car, Uber XL, private van), divide total by group size. E.g. Uber XL to airport $45 ÷ 6 = $8 pp.
  * FLIGHTS: Always per-person (each person buys their own ticket).
  * FOOD: Per-person (each person pays for their own meal).
  * ACTIVITIES: Per-person unless a group rate applies (e.g. private boat charter $600 ÷ 6 = $100 pp).
  Use educated assumptions about room configurations: 2 people = 1 room, 3-4 people = 2 rooms or 1 large Airbnb, 5-6 people = 3 rooms or 1 large Airbnb, 7+ = multiple rooms or large vacation rental.
- Use null only if you genuinely cannot estimate.
- Include transport (flights if FLIGHT REQUIRED is stated, airport transfers, getting around), meals (2-3 per day), activities, and lodging (first day check-in).
- If FLIGHT REQUIRED: You MUST add TWO flight activities:
  1. OUTBOUND on Day 1: title format "Flight: [DepartureCity] → [DestinationCity]" (e.g. "Flight: Los Angeles → Cancún"). In description include: the departure airport code and arrival airport code, approximate flight duration, and "Economy round-trip ~$XXX pp" with a realistic average fare for that route/season. Category: "transport". estimatedCostPp = ONE-WAY portion of a realistic round-trip fare (i.e. total RT / 2).
  2. RETURN on last day: title format "Flight: [DestinationCity] → [DepartureCity]". Same description format. Category: "transport". estimatedCostPp = the other half of the round-trip fare.
  Use realistic current average economy fares: e.g. LAX→CUN ~$300 RT, JFK→LIS ~$600 RT, SFO→HNL ~$400 RT. Adjust for season and distance.
- Keep descriptions concise and actionable.
- Do NOT include bookingUrl — leave it out or set null.
- estimatedDayCostPp should be the sum of all non-null activity costs for that day.
- Be specific to the destination: use real neighborhood names, landmark references, and local cuisine.
- For the first day, include arrival/check-in. For the last day, include checkout/departure.
- If pinned restaurants or activities are marked "MUST include" in the user prompt, incorporate them into the appropriate day.
- TRANSPORT ON CALENDAR: Always include transport activities so they show on the day's schedule:
  * Airport transfers: "Uber/taxi to hotel" or "Train from airport to city center" with realistic cost.
  * Inter-city travel: If the trip visits multiple cities/locations, include a transport activity on the travel day with title format "[Mode]: [CityA] → [CityB]" (e.g. "Train: Tokyo → Kyoto", "Drive: Miami → Key West"). Include duration and cost estimate in the description.
  * Local transport only when notable (e.g. ferry ride, scenic train) — skip routine Uber rides between activities.

Example (abbreviated) for a 2-day moderate trip from NYC to Austin, 4 people, "outdoors" vibe (FLIGHT REQUIRED):
{"days":[{"dateIso":"Day 1","label":"Arrival & Nature","activities":[{"time":"Morning","title":"Flight: New York City → Austin","description":"JFK → AUS, ~3.5 hrs. Economy round-trip ~$280 pp.","category":"transport","estimatedCostPp":140},{"time":"Late Morning","title":"Barton Springs Pool","description":"Swim in the natural spring-fed pool in Zilker Park.","category":"activity","estimatedCostPp":5},{"time":"Lunch","title":"Tacos at Veracruz All Natural","description":"Migas tacos and agua fresca on the east side.","category":"food","estimatedCostPp":12},{"time":"Afternoon","title":"Greenbelt Hike","description":"3-mile loop on the Barton Creek Greenbelt trail.","category":"activity","estimatedCostPp":0},{"time":"Evening","title":"Check in to SoCo Airbnb","description":"2BR apartment in SoCo area, $220/night total ÷ 4 people = $55 pp/night. 2 nights = $110 pp total.","category":"lodging","estimatedCostPp":110},{"time":"Dinner","title":"BBQ at la Barbecue","description":"Brisket and sides from the famous East Austin trailer.","category":"food","estimatedCostPp":22}],"estimatedDayCostPp":289},{"dateIso":"Day 2","label":"Lake Day & Departure","activities":[{"time":"Morning","title":"Breakfast tacos at Jo's Coffee","description":"Classic SoCo spot with outdoor seating.","category":"food","estimatedCostPp":10},{"time":"Late Morning","title":"Kayak on Lady Bird Lake","description":"Rent 2 tandem kayaks ($40 each) at the rowing dock for 2 hours. $80 ÷ 4 = $20 pp.","category":"activity","estimatedCostPp":20},{"time":"Lunch","title":"Picnic at Zilker","description":"Grab HEB sandwiches and relax on the great lawn.","category":"food","estimatedCostPp":8},{"time":"Afternoon","title":"Uber XL to airport","description":"Shared Uber XL ~$35 total ÷ 4 = $9 pp.","category":"transport","estimatedCostPp":9},{"time":"Late Afternoon","title":"Flight: Austin → New York City","description":"AUS → JFK, ~3.5 hrs. Return leg of round-trip.","category":"transport","estimatedCostPp":140}],"estimatedDayCostPp":187}]}`;

function cleanLabel(v: string, max = 140): string {
  return v.replace(/\s+/g, " ").trim().slice(0, max);
}

function slug(v: string): string {
  return encodeURIComponent(v.trim());
}

function mapsSearchUrl(q: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${slug(q)}`;
}

function dayVoteId(prefix: string, seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return `${prefix}:${(h >>> 0).toString(36)}`;
}

function inferTripDays(plan: TripPlan, itinerary: GeneratedItinerary): string[] {
  const y0 = new Date().getFullYear();
  const tr = plan.hostSetup?.tripRange ?? tripRangeBestEffortFromPlanDates(plan, y0);
  if (tr?.startIso && tr.endIso) {
    const days = enumerateLocalIsoDays(tr.startIso, tr.endIso);
    if (days.length) return days;
  }
  const isoDays = itinerary.days
    .map((d) => d.dateIso)
    .filter((x) => typeof x === "string" && parseLocalIsoDate(x));
  if (isoDays.length) return isoDays;
  return [];
}

function inferHomeBaseName(plan: TripPlan): string {
  const userStay = plan.hostSetup?.hotelStays?.find(isUserSelectedLodgingStay);
  if (userStay?.place?.name?.trim()) return userStay.place.name.trim();
  const fromHost = plan.hostSetup?.hotel?.name?.trim();
  if (fromHost) return fromHost;
  return `Recommended stay in ${plan.location?.trim() || "destination"}`;
}

function buildAutofillRecommendations(plan: TripPlan, itinerary: GeneratedItinerary): {
  restaurantPins: HostRestaurantPin[];
  activityPins: HostActivityPin[];
  hotelStays: HostHotelStay[];
  dayVoting: DayVoteStateByDate;
} {
  const days = inferTripDays(plan, itinerary);
  const location = plan.location?.trim() || "Destination";
  const departure = plan.departureCity?.trim() || "Origin";
  const homeBase = inferHomeBaseName(plan);

  const restaurantPins: HostRestaurantPin[] = [];
  const activityPins: HostActivityPin[] = [];
  const dayVoting: DayVoteStateByDate = {};

  for (let i = 0; i < days.length; i += 1) {
    const dateIso = days[i]!;
    const dayItin = i < itinerary.days.length ? itinerary.days[i] : undefined;
    if (!dayItin) continue; // Don't repeat last day's content for extra calendar days

    const foodActs = (dayItin.activities ?? []).filter((a) => a.category === "food" && a.title.trim());
    const isBreakfastItem = (t: string) => /breakfast|brunch|coffee|pastry|croissant|morning meal/i.test(t);
    const isDinnerItem = (t: string) => /dinner|supper|evening meal|dine/i.test(t);
    const isLunchItem = (t: string) => /lunch|midday/i.test(t);
    const nonBreakfast = foodActs.filter((a) => !isBreakfastItem(a.title));
    const dinnerAct = foodActs.find((a) => isDinnerItem(a.title)) ?? nonBreakfast[nonBreakfast.length - 1];
    const lunchAct = nonBreakfast.find((a) => isLunchItem(a.title) && a !== dinnerAct)
      ?? nonBreakfast.find((a) => a !== dinnerAct);
    const lunch = lunchAct ? cleanLabel(lunchAct.title, 120) : null;
    const dinner = dinnerAct ? cleanLabel(dinnerAct.title, 120) : null;
    const actRows = (dayItin.activities ?? []).filter((a) => a.category === "activity" && a.title.trim()).slice(0, 2);
    // Don't pad with generic placeholders — only use real activities from the itinerary

    const flightUrl = `https://www.google.com/travel/flights?hl=en&q=Flights%20from%20${slug(departure)}%20to%20${slug(location)}`;
    // Pull actual flight info from the itinerary if available
    const flightActivity = dayItin.activities.find((a) => a.category === "transport" && /^flight:/i.test(a.title));
    const flightLabel = flightActivity
      ? cleanLabel(flightActivity.title, 140)
      : cleanLabel(`${departure} \u2192 ${location} flight`, 140);
    const flightPrice = flightActivity?.estimatedCostPp;

    if (lunch) {
      restaurantPins.push({
        dateIso,
        place: { name: lunch, mapsUrl: mapsSearchUrl(`${lunch} ${location}`), spotlightCategory: "restaurant" },
        kept: true,
        recommendedByConci: true,
      });
    }
    if (dinner) {
      restaurantPins.push({
        dateIso,
        place: { name: dinner, mapsUrl: mapsSearchUrl(`${dinner} ${location}`), spotlightCategory: "restaurant" },
        kept: true,
        recommendedByConci: true,
      });
    }

    for (const a of actRows) {
      const name = cleanLabel(a.title, 130);
      activityPins.push({
        dateIso,
        experience: {
          name,
          pricePerPerson: a.estimatedCostPp != null ? `$${Math.round(a.estimatedCostPp)} pp` : "",
          rating: "",
          duration: a.time || "",
          bookingUrl: mapsSearchUrl(`${name} ${location}`),
          coverPhotoUrl: null,
        },
        kept: true,
        recommendedByConci: true,
      });
    }

    // Only add flight pin on first and last day when there's a flight in the itinerary
    if ((i === 0 || i === days.length - 1) && flightActivity) {
      activityPins.push({
        dateIso,
        experience: {
          name: flightLabel,
          pricePerPerson: flightPrice != null ? `~$${Math.round(flightPrice)} pp` : "",
          rating: "",
          duration: flightActivity.description || "Economy",
          bookingUrl: flightUrl,
          coverPhotoUrl: null,
        },
        kept: true,
        recommendedByConci: true,
      });
    }

    const flightsState: DayVoteCategoryState = {
      options: [
        {
          id: dayVoteId("flt", `${dateIso}|${flightLabel}`),
          label: flightLabel,
          detail: "recommended by CONCI",
          href: flightUrl,
          votes: [],
          suggestedBy: "conci:auto",
        },
      ],
    };
    dayVoting[dateIso] = {
      restaurants: {
        options: [
          ...(lunch ? [{
            id: dayVoteId("rest", `${dateIso}|${lunch}`),
            label: lunch,
            detail: "recommended by CONCI",
            href: mapsSearchUrl(`${lunch} ${location}`),
            votes: [] as never[],
            suggestedBy: "conci:auto",
          }] : []),
          ...(dinner ? [{
            id: dayVoteId("rest", `${dateIso}|${dinner}`),
            label: dinner,
            detail: "recommended by CONCI",
            href: mapsSearchUrl(`${dinner} ${location}`),
            votes: [] as never[],
            suggestedBy: "conci:auto",
          }] : []),
        ],
      },
      hotels: {
        options: [
          {
            id: dayVoteId("hotel", `${dateIso}|${homeBase}`),
            label: homeBase,
            detail: "recommended by CONCI",
            href: mapsSearchUrl(`${homeBase} ${location}`),
            votes: [],
            suggestedBy: "conci:auto",
          },
        ],
      },
      flights: flightsState,
      activities: {
        options: actRows.map((a, idx) => ({
          id: dayVoteId("act", `${dateIso}|${a.title}|${idx}`),
          label: cleanLabel(a.title, 120),
          detail: "recommended by CONCI",
          href: mapsSearchUrl(`${a.title} ${location}`),
          votes: [],
          suggestedBy: "conci:auto",
        })),
      },
      other: { options: [] },
    };
  }

  const existingStays = plan.hostSetup?.hotelStays ?? [];
  if (hasUserSelectedLodging(existingStays)) {
    return {
      restaurantPins,
      activityPins,
      hotelStays: existingStays.filter(isUserSelectedLodgingStay),
      dayVoting,
    };
  }

  const hotelStays: HostHotelStay[] =
    days.length > 0
      ? [
          {
            startIso: days[0]!,
            endIso: days[days.length - 1]!,
            place: {
              name: homeBase,
              mapsUrl: mapsSearchUrl(`hotel ${location}`),
              spotlightCategory: "hotel",
            },
            recommendedByConci: true,
          },
        ]
      : [];

  return { restaurantPins, activityPins, hotelStays, dayVoting };
}

/** SerpAPI hotel lookup — depends only on budget + location, so it can run in parallel
 * with itinerary generation. Date assignment happens later in {@link buildHotelStayFromCandidate}. */
async function searchHotelCandidate(
  plan: TripPlan,
  location: string,
  seedText?: string | null
): Promise<PlacePreview | null> {
  // Only auto-suggest when we know exact dates — the bookable rates search needs them.
  const range = plan.hostSetup?.tripRange;
  const checkIn = range?.startIso?.trim();
  const checkOut = range?.endIso?.trim();
  if (!checkIn || !checkOut) return null;

  const guests = plan.people?.count ?? plan.people?.names?.length ?? 2;
  const { suggestStayForTrip } = await import("@/backend/lodging/suggest-stay");
  const pick = await suggestStayForTrip({
    destination: location,
    checkIn,
    checkOut,
    guests: Math.max(1, guests),
    rooms: 1,
    vibe: plan.vibe ?? [],
    budgetTier: plan.budget?.tier ?? null,
    budgetPerPerson: plan.budget?.perPerson ?? null,
    seedText,
  });
  if (!pick) return null;

  const h = pick.hotel;
  console.log(`[generate-itinerary] Suggested stay: ${h.name} (${pick.source}) — ${pick.reason}`);
  return {
    name: h.name,
    rating: h.rating > 0 ? h.rating : undefined,
    reviewCount: h.reviewCount || undefined,
    address: h.addressLine || undefined,
    priceRange: h.nightlyUsd > 0 ? `~$${h.nightlyUsd}/night` : undefined,
    photoUrl: h.imageUrl,
    mapsUrl: mapsSearchUrl(`${h.name} ${location}`),
  };
}

function buildHotelStayFromCandidate(
  plan: TripPlan,
  itinerary: GeneratedItinerary,
  top: PlacePreview
): HostHotelStay[] | null {
  const days = inferTripDays(plan, itinerary);
  if (!days.length) return null;

  return [{
    startIso: days[0]!,
    endIso: days[days.length - 1]!,
    place: {
      name: top.name,
      mapsUrl: top.mapsUrl,
      spotlightCategory: "hotel" as const,
      rating: top.rating,
      photoUrl: top.photoUrl,
      address: top.address,
    },
    recommendedByConci: true,
  }];
}

// --- Activity enrichment via SerpAPI ---

const MAX_ACTIVITY_SEARCHES = 8;

async function enrichActivityPins(
  pins: HostActivityPin[],
  location: string
): Promise<HostActivityPin[]> {
  const { searchPlacesGoogleMaps } = await import("@/backend/serpapi-places");

  // Skip flight pins and generic "Top activity/experience" pins
  const isGenericOrFlight = (name: string) =>
    /^(top (activity|experience)|.*best-value flight|.*->)/i.test(name);

  const searchable = pins.filter(
    (p) => p.experience?.name && !isGenericOrFlight(p.experience.name)
  );

  // Batch searches to avoid overloading API
  const toSearch = searchable.slice(0, MAX_ACTIVITY_SEARCHES);
  const results = await Promise.allSettled(
    toSearch.map((pin) =>
      searchPlacesGoogleMaps(`${pin.experience.name} ${location}`, location, { limit: 1 })
    )
  );

  for (let i = 0; i < toSearch.length; i++) {
    const result = results[i];
    if (result?.status !== "fulfilled" || !result.value.length) continue;
    const place = result.value[0]!;
    const pin = toSearch[i]!;

    pin.experience = {
      ...pin.experience,
      name: place.name,
      rating: place.rating != null ? `${place.rating}★` : pin.experience.rating || "",
      bookingUrl: place.mapsUrl,
      coverPhotoUrl: place.photoUrl || pin.experience.coverPhotoUrl || null,
    };
  }

  return pins;
}

// --- Budget parsing ---

type BudgetBreakdown = {
  dailyPp: number;
  totalPp: number;
  days: number;
  tier: "budget" | "moderate" | "splurge";
  allocation: { lodging: number; food: number; activities: number; transport: number };
};

const TIER_DEFAULTS: Record<string, { daily: number; tier: BudgetBreakdown["tier"] }> = {
  "budget-friendly": { daily: 80, tier: "budget" },
  budget: { daily: 80, tier: "budget" },
  cheap: { daily: 80, tier: "budget" },
  backpacker: { daily: 60, tier: "budget" },
  moderate: { daily: 200, tier: "moderate" },
  mid: { daily: 200, tier: "moderate" },
  "mid-range": { daily: 200, tier: "moderate" },
  comfort: { daily: 250, tier: "moderate" },
  splurge: { daily: 500, tier: "splurge" },
  luxury: { daily: 600, tier: "splurge" },
  "high-end": { daily: 550, tier: "splurge" },
  premium: { daily: 500, tier: "splurge" },
  baller: { daily: 700, tier: "splurge" },
};

function inferTripDayCount(plan: TripPlan): number {
  const y0 = new Date().getFullYear();
  const tr = plan.hostSetup?.tripRange ?? tripRangeBestEffortFromPlanDates(plan, y0);
  if (tr?.startIso && tr.endIso) {
    const days = enumerateLocalIsoDays(tr.startIso, tr.endIso);
    if (days.length > 0) return days.length;
  }
  const dateStr = plan.dates.options.join(" ").toLowerCase();
  const weekMatch = dateStr.match(/(\d+)\s*week/);
  if (weekMatch) return parseInt(weekMatch[1]!, 10) * 7;
  const dayMatch = dateStr.match(/(\d+)\s*day/);
  if (dayMatch) return parseInt(dayMatch[1]!, 10);
  return 4;
}

function parseBudgetToDaily(plan: TripPlan): BudgetBreakdown | null {
  const days = inferTripDayCount(plan);
  const budgetStr = (plan.budget.perPerson || plan.budget.tier || "").trim().toLowerCase();

  if (!budgetStr) return null;

  let dailyPp: number | null = null;
  let tier: BudgetBreakdown["tier"] = "moderate";

  const perDayMatch = budgetStr.match(/\$?\s*([\d,]+)\s*\/?\s*(per\s*)?day/);
  if (perDayMatch) {
    dailyPp = parseFloat(perDayMatch[1]!.replace(/,/g, ""));
  }

  if (dailyPp == null) {
    const totalMatch = budgetStr.match(/\$?\s*([\d,]+)/);
    if (totalMatch) {
      const total = parseFloat(totalMatch[1]!.replace(/,/g, ""));
      if (total > 0) {
        dailyPp = total > 50 * days ? total / days : total;
      }
    }
  }

  if (dailyPp == null) {
    for (const [keyword, config] of Object.entries(TIER_DEFAULTS)) {
      if (budgetStr.includes(keyword)) {
        dailyPp = config.daily;
        tier = config.tier;
        break;
      }
    }
  }

  if (dailyPp == null) return null;

  if (dailyPp <= 100) tier = "budget";
  else if (dailyPp <= 300) tier = "moderate";
  else tier = "splurge";

  const allocPcts = tier === "budget"
    ? { lodging: 0.35, food: 0.35, activities: 0.20, transport: 0.10 }
    : tier === "splurge"
    ? { lodging: 0.45, food: 0.25, activities: 0.25, transport: 0.05 }
    : { lodging: 0.40, food: 0.30, activities: 0.25, transport: 0.05 };

  return {
    dailyPp: Math.round(dailyPp),
    totalPp: Math.round(dailyPp * days),
    days,
    tier,
    allocation: {
      lodging: Math.round(dailyPp * allocPcts.lodging),
      food: Math.round(dailyPp * allocPcts.food),
      activities: Math.round(dailyPp * allocPcts.activities),
      transport: Math.round(dailyPp * allocPcts.transport),
    },
  };
}

// --- Vibe distribution ---

const VIBE_ACTIVITY_EXAMPLES: Record<string, string> = {
  party: "bars, clubs, rooftop lounges, pub crawls, live music venues, beach parties",
  chill: "beaches, spas, pools, scenic walks, sunset spots, hammock time, yoga",
  culture: "museums, historical sites, galleries, temples, local markets, guided tours",
  outdoors: "hikes, kayaking, snorkeling, surfing, biking, national parks, zip-lining",
  foodie: "food tours, local markets, cooking classes, street food crawls, tasting menus, wine/beer tastings",
  adventure: "bungee jumping, paragliding, scuba diving, rock climbing, ATV tours, white-water rafting",
  romantic: "couples spa, sunset dinner, private tours, rooftop dining, scenic boat rides, wine tasting",
  luxury: "private transfers, five-star dining, VIP experiences, yacht charters, premium suites",
};

function buildVibeConstraint(vibes: string[]): string {
  if (vibes.length === 0) return "";
  const lines: string[] = [];
  const weight = Math.max(30, Math.round(70 / vibes.length));
  lines.push(`\nVIBE CONSTRAINT: At least ${weight}% of non-transport/lodging activities must match the trip vibe.`);
  for (const v of vibes) {
    const lower = v.toLowerCase();
    const examples = VIBE_ACTIVITY_EXAMPLES[lower];
    if (examples) {
      lines.push(`- "${v}" activities include: ${examples}`);
    }
  }
  lines.push("Prioritize these activity types over generic sightseeing.");
  return lines.join("\n");
}

function buildItineraryUserPrompt(plan: TripPlan, seedText?: string | null): string {
  const lines: string[] = [];

  const locationStr = plan.location || "not specified";
  lines.push(`Destination: ${locationStr}`);

  // Multi-city detection
  const cities = locationStr.split(/[,&+]/).map((s) => s.trim()).filter(Boolean);
  if (cities.length > 1) {
    lines.push(`MULTI-CITY TRIP: This trip visits ${cities.join(", ")}. You MUST include inter-city transport activities on the days the group travels between cities. Use title format "[Mode]: [CityA] → [CityB]" (e.g. "Train: Tokyo → Kyoto"). Split the itinerary roughly evenly across the cities unless the user specifies otherwise.`);
  }

  if (plan.departureCity) {
    const needsFlight = seedText?.includes("(needs flight)") || !seedText?.includes("no flight needed");
    lines.push(`Departing from: ${plan.departureCity}`);
    if (needsFlight) {
      lines.push(`FLIGHT REQUIRED: Include outbound flight "${plan.departureCity} → ${plan.location || "destination"}" on Day 1 and return flight "${plan.location || "destination"} → ${plan.departureCity}" on last day. Use title format "Flight: CityA → CityB". In description include airport codes, ~duration, and fare estimate. Split round-trip cost evenly between the two flights.`);
    }
  }

  if (plan.dates.options.length > 0) {
    lines.push(`Dates: ${plan.dates.options.join(", ")}`);
  }

  const headcount = plan.people.count ?? (plan.people.names.length || 2);
  lines.push(`Group size: ${headcount} people`);

  // Lodging assumptions based on group size
  if (headcount <= 2) {
    lines.push(`Lodging assumption: 1 hotel room or small Airbnb. Divide nightly rate by ${headcount}.`);
  } else if (headcount <= 4) {
    lines.push(`Lodging assumption: 2 hotel rooms OR 1 large Airbnb (2-3 bedrooms). Divide total nightly cost by ${headcount}.`);
  } else if (headcount <= 6) {
    lines.push(`Lodging assumption: 3 hotel rooms OR 1 large Airbnb/vacation rental (3+ bedrooms). Divide total nightly cost by ${headcount}.`);
  } else {
    lines.push(`Lodging assumption: ${Math.ceil(headcount / 2)} hotel rooms OR large vacation rental. Divide total nightly cost by ${headcount}.`);
  }
  lines.push(`Transport assumption: Shared rides/transfers split by ${headcount}. Flights are per-person.`);

  // Budget: compute and inject hard constraints
  const budget = parseBudgetToDaily(plan);
  if (budget) {
    lines.push("");
    lines.push("=== HARD BUDGET CONSTRAINT ===");
    lines.push(`Daily budget: $${budget.dailyPp}/person/day ($${budget.totalPp} total per person \u00f7 ${budget.days} days)`);
    lines.push(`Tier: ${budget.tier}`);
    lines.push(`Daily allocation per person (already divided by group of ${headcount}):`);
    lines.push(`  - Lodging: ~$${budget.allocation.lodging}/night/person (= total room cost ÷ ${headcount})`);
    lines.push(`  - Food (all meals): ~$${budget.allocation.food}/day/person`);
    lines.push(`  - Activities: ~$${budget.allocation.activities}/day/person`);
    lines.push(`  - Transport: ~$${budget.allocation.transport}/day/person (shared rides split by ${headcount})`);
    lines.push(`Your total across ALL days MUST stay within \u00b115% of $${budget.totalPp}/person.`);
    lines.push(`Each individual activity cost must be realistic for the "${budget.tier}" tier in the destination.`);
    lines.push(`Remember: lodging estimatedCostPp = total nightly rate for the group's rooms/rental ÷ ${headcount}.`);
    lines.push("=== END BUDGET CONSTRAINT ===");
    lines.push("");
  } else if (plan.budget.tier || plan.budget.perPerson) {
    const budgetParts = [plan.budget.tier, plan.budget.perPerson].filter(Boolean);
    lines.push(`Budget: ${budgetParts.join(" \u2014 ")}`);
  }

  // Vibe: inject weighted activity distribution
  if (plan.vibe.length > 0) {
    lines.push(buildVibeConstraint(plan.vibe));
  }

  if (plan.hostSetup?.tripRange) {
    lines.push(`Confirmed date range: ${plan.hostSetup.tripRange.startIso} to ${plan.hostSetup.tripRange.endIso}`);
    const tripDays = enumerateLocalIsoDays(plan.hostSetup.tripRange.startIso, plan.hostSetup.tripRange.endIso);
    if (tripDays.length > 0) {
      lines.push(`You MUST generate exactly ${tripDays.length} days with dateIso values: ${tripDays.join(", ")}. Do NOT generate fewer days.`);
    }
  }

  if (plan.hostSetup?.hotel) {
    lines.push(`Hotel: ${plan.hostSetup.hotel.name}`);
  }

  const pins = plan.hostSetup?.restaurantPins?.filter((p) => p.kept) ?? [];
  if (pins.length > 0) {
    lines.push(`Pinned restaurants (MUST include): ${pins.map((p) => `${p.place.name} (${p.dateIso})`).join(", ")}`);
  }

  const actPins = plan.hostSetup?.activityPins?.filter((p) => p.kept) ?? [];
  if (actPins.length > 0) {
    lines.push(`Pinned activities (MUST include): ${actPins.map((p) => `${p.experience.name} (${p.dateIso})`).join(", ")}`);
  }

  if (seedText?.trim()) {
    const interestsMatch = seedText.match(/\u2022\s*interests:\s*(.+)/i);
    const paceMatch = seedText.match(/\u2022\s*pace:\s*(.+)/i);
    if (interestsMatch?.[1]) lines.push(`Must-do interests: ${interestsMatch[1].trim()}`);
    if (paceMatch?.[1]) lines.push(`Pace preference: ${paceMatch[1].trim()}`);
  }

  return lines.join("\n");
}

function validateItineraryOutput(raw: unknown): GeneratedItinerary | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.days)) return null;

  const days: ItineraryDay[] = [];
  for (const d of obj.days) {
    if (!d || typeof d !== "object") continue;
    const day = d as Record<string, unknown>;
    const dateIso = typeof day.dateIso === "string" ? day.dateIso : `Day ${days.length + 1}`;
    const label = typeof day.label === "string" ? day.label : "Trip Day";
    const activities: ItineraryActivity[] = [];

    if (Array.isArray(day.activities)) {
      for (const a of day.activities) {
        if (!a || typeof a !== "object") continue;
        const act = a as Record<string, unknown>;
        const validCategories = new Set(["transport", "food", "activity", "lodging", "free-time"]);
        activities.push({
          time: typeof act.time === "string" ? act.time : "TBD",
          title: typeof act.title === "string" ? act.title : "Activity",
          description: typeof act.description === "string" ? act.description : "",
          category: (typeof act.category === "string" && validCategories.has(act.category)
            ? act.category
            : "activity") as ItineraryActivity["category"],
          estimatedCostPp: typeof act.estimatedCostPp === "number" ? act.estimatedCostPp : null,
          bookingUrl: null,
        });
      }
    }

    const estimatedDayCostPp = activities.reduce((sum, a) => {
      if (a.estimatedCostPp != null) return sum + a.estimatedCostPp;
      return sum;
    }, 0) || null;

    days.push({ dateIso, label, activities, estimatedDayCostPp });
  }

  if (days.length === 0) return null;

  for (const day of days) {
    for (const act of day.activities) {
      if (act.estimatedCostPp != null && act.estimatedCostPp > 5000) {
        act.estimatedCostPp = null;
      }
      if (act.estimatedCostPp != null && act.estimatedCostPp < 0) {
        act.estimatedCostPp = 0;
      }
    }
    day.estimatedDayCostPp = day.activities.reduce((sum, a) => {
      if (a.estimatedCostPp != null) return sum + a.estimatedCostPp;
      return sum;
    }, 0) || null;
  }

  const totalPp = days.reduce((sum, d) => sum + (d.estimatedDayCostPp ?? 0), 0) || null;

  return {
    days,
    totalEstimatePp: totalPp,
    totalEstimateGroup: null,
    generatedAt: new Date().toISOString(),
  };
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

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!access.isHost) {
    return NextResponse.json({ error: "Only the trip host can regenerate the itinerary." }, { status: 403 });
  }

  const { data: row, error: fetchErr } = await svc
    .from("trip_plans")
    .select("plan, seed_text, collab_state")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !row?.plan) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  const plan = normalizePlan(row.plan);
  const seedText = typeof row.seed_text === "string" ? row.seed_text : null;

  if (!plan.location?.trim()) {
    return NextResponse.json(
      { error: "A destination is required to generate an itinerary." },
      { status: 400 }
    );
  }

  if (plan.confidence < 0.4 && !plan.dates.options.length && !plan.hostSetup?.tripRange) {
    return NextResponse.json(
      { error: "Not enough trip details yet. Add dates or more context before generating an itinerary." },
      { status: 400 }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Missing OPENAI_API_KEY on server." }, { status: 500 });
  }

  const location = plan.location.trim();

  // Kick off the hotel SerpAPI lookup now so it overlaps with itinerary generation instead
  // of adding a serial round-trip after it. Dates are assigned once the itinerary exists.
  const needHotelSearch = !hasUserSelectedLodging(plan.hostSetup?.hotelStays ?? []);
  const hotelCandidatePromise: Promise<PlacePreview | null> = needHotelSearch
    ? searchHotelCandidate(plan, location, seedText).catch(() => null)
    : Promise.resolve(null);

  const userPrompt = buildItineraryUserPrompt(plan, seedText);

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.7,
        input: [
          { role: "system", content: ITINERARY_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        text: { format: { type: "json_object" } },
      }),
      signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    });
  } catch (e) {
    console.error("[generate-itinerary] OpenAI request failed:", (e as Error)?.message);
    return NextResponse.json({ error: "AI service timed out. Please try again." }, { status: 504 });
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[generate-itinerary] OpenAI error:", errorText);
    return NextResponse.json({ error: "AI service unavailable" }, { status: 502 });
  }

  const payload = await response.json();
  const outputText = extractOpenAiResponsesOutputText(payload);

  if (!outputText.trim()) {
    return NextResponse.json({ error: "AI returned empty response" }, { status: 502 });
  }

  const parsed = safeParseJson(outputText);
  let itinerary = validateItineraryOutput(parsed);

  if (!itinerary) {
    return NextResponse.json({ error: "Failed to parse itinerary from AI response" }, { status: 502 });
  }

  // Step 1.5: Budget compliance check + repair re-prompt (max 1 retry)
  const budget = parseBudgetToDaily(plan);
  if (budget && itinerary.totalEstimatePp != null) {
    const overshoot = itinerary.totalEstimatePp / budget.totalPp;
    if (overshoot > 1.20) {
      console.log(`[generate-itinerary] Budget overshoot: $${itinerary.totalEstimatePp} vs target $${budget.totalPp} (${Math.round(overshoot * 100)}%). Attempting repair.`);
      const topCosts = itinerary.days
        .flatMap((d) => d.activities)
        .filter((a) => a.estimatedCostPp != null && a.estimatedCostPp > 0)
        .sort((a, b) => (b.estimatedCostPp ?? 0) - (a.estimatedCostPp ?? 0))
        .slice(0, 5)
        .map((a) => `${a.title} ($${a.estimatedCostPp})`)
        .join(", ");

      const repairPrompt = `Your previous plan costs $${itinerary.totalEstimatePp}/person but the hard budget is $${budget.totalPp}/person (${budget.days} days at $${budget.dailyPp}/day). You are ${Math.round((overshoot - 1) * 100)}% over budget.\n\nMost expensive items: ${topCosts}\n\nReduce costs by swapping expensive venues for cheaper ${budget.tier}-tier alternatives until the total is within $${budget.totalPp} ±15%. Keep the same day structure and vibe. Return the corrected full JSON.`;

      try {
        const repairRes = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o",
            temperature: 0.4,
            input: [
              { role: "system", content: ITINERARY_SYSTEM_PROMPT },
              { role: "user", content: userPrompt },
              { role: "assistant", content: outputText },
              { role: "user", content: repairPrompt },
            ],
            text: { format: { type: "json_object" } },
          }),
          signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
        });

        if (repairRes.ok) {
          const repairPayload = await repairRes.json();
          const repairText = extractOpenAiResponsesOutputText(repairPayload);
          const repairParsed = safeParseJson(repairText);
          const repairedItinerary = validateItineraryOutput(repairParsed);
          if (repairedItinerary && repairedItinerary.totalEstimatePp != null) {
            const newOvershoot = repairedItinerary.totalEstimatePp / budget.totalPp;
            if (newOvershoot <= 1.20) {
              console.log(`[generate-itinerary] Repair successful: $${repairedItinerary.totalEstimatePp} (${Math.round(newOvershoot * 100)}% of budget)`);
              itinerary = repairedItinerary;
            } else {
              console.warn(`[generate-itinerary] Repair still over budget ($${repairedItinerary.totalEstimatePp}), using anyway as it's closer.`);
              if (repairedItinerary.totalEstimatePp < itinerary.totalEstimatePp) {
                itinerary = repairedItinerary;
              }
            }
          }
        }
      } catch (e) {
        console.warn("[generate-itinerary] Budget repair failed (non-fatal):", (e as Error)?.message);
      }
    }
  }

  const headcount = plan.people.count ?? (plan.people.names.length || 2);
  itinerary.totalEstimateGroup =
    itinerary.totalEstimatePp != null ? itinerary.totalEstimatePp * headcount : null;

  const generated = buildAutofillRecommendations(plan, itinerary);

  // Venue + activity enrichment run in parallel. The hotel search was already kicked off
  // before generation, so here we just await its result and assign dates.
  await Promise.allSettled([
    enrichItineraryWithVenues(itinerary, location, budget?.tier ?? "moderate", plan.vibe)
      .then((r) => console.log(`[generate-itinerary] Venues verified: ${r.venuesVerified}/${r.venuesTotal}`))
      .catch((e: unknown) => console.warn("[generate-itinerary] Venue enrichment failed (non-fatal):", (e as Error)?.message)),

    hotelCandidatePromise
      .then((top) => {
        if (!top) return;
        const stays = buildHotelStayFromCandidate(plan, itinerary, top);
        if (stays?.length) {
          generated.hotelStays = stays;
          // Backfill the real hotel name into dayVoting hotel options
          const realName = stays[0]!.place.name;
          for (const dateIso of Object.keys(generated.dayVoting)) {
            const hotelOpts = generated.dayVoting[dateIso]?.hotels?.options;
            if (hotelOpts?.length) {
              hotelOpts[0]!.label = realName;
              hotelOpts[0]!.id = dayVoteId("hotel", `${dateIso}|${realName}`);
              hotelOpts[0]!.href = stays[0]!.place.mapsUrl ?? hotelOpts[0]!.href;
            }
          }
        }
      })
      .catch((e: unknown) => console.warn("[generate-itinerary] Hotel search failed (non-fatal):", (e as Error)?.message)),

    (generated.activityPins.length > 0
      ? enrichActivityPins(generated.activityPins, location)
          .then((pins) => { generated.activityPins = pins; })
          .catch((e: unknown) => console.warn("[generate-itinerary] Activity enrichment failed (non-fatal):", (e as Error)?.message))
      : Promise.resolve()),
  ]);

  const mergedHotelStays = mergeAiHotelStaysPreservingUser(plan.hostSetup?.hotelStays, generated.hotelStays);
  const updatedPlan: TripPlan = {
    ...plan,
    generatedItinerary: itinerary,
    hostSetup: {
      ...(plan.hostSetup ?? {}),
      hotel: mergedHotelStays[0]?.place ?? plan.hostSetup?.hotel ?? generated.hotelStays[0]?.place ?? null,
      hotelStays: mergedHotelStays,
      restaurantPins: generated.restaurantPins,
      activityPins: generated.activityPins,
    },
  };
  const collab = parseCollabState(row.collab_state);
  const mergedDayVoting = { ...parseDayVoteState(collab.dayVoting), ...generated.dayVoting };
  const nextCollab = { ...collab, dayVoting: mergedDayVoting };

  const { error: upErr } = await svc
    .from("trip_plans")
    .update({ plan: updatedPlan, collab_state: nextCollab, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (upErr) {
    console.error("[generate-itinerary] DB update error:", upErr);
    return NextResponse.json({ error: "Failed to save itinerary" }, { status: 500 });
  }

  // After itinerary generation, trigger recommendation generation for all members with preferences
  void (async () => {
    try {
      const vibeDecision = nextCollab.decisions?.[VIBE_POLL_DECISION_KEY];
      const vibeVotes = vibeDecision?.votes ?? {};
      const submissions = (collab.adjustmentSubmissions ?? []).filter((s) => s.status === "pending");

      type MemberPref = { userId: string; name: string; text: string };
      const prefs: MemberPref[] = [];

      for (const [voterId, val] of Object.entries(vibeVotes)) {
        if (typeof val === "string" && val.trim().length > 3) {
          prefs.push({ userId: voterId, name: voterId, text: val.trim() });
        }
      }
      for (const sub of submissions) {
        const existing = prefs.find((p) => p.userId === sub.authorUserId);
        if (existing) {
          existing.text += "; " + sub.text.trim();
          if (!existing.name || existing.name === existing.userId) existing.name = sub.authorDisplayName;
        } else {
          prefs.push({ userId: sub.authorUserId, name: sub.authorDisplayName, text: sub.text.trim() });
        }
      }

      const finalPlan = normalizePlan(updatedPlan);
      await Promise.allSettled(
        prefs.map((p) =>
          generateMemberRecommendations({
            tripId: id,
            userId: p.userId,
            memberName: p.name,
            preferences: p.text,
            plan: finalPlan,
            svc,
          })
        )
      );
    } catch (err) {
      console.warn("[generate-itinerary] background recommendation generation failed:", err);
    }
  })();

  return NextResponse.json({ itinerary, plan: updatedPlan });
}
