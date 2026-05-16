import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { extractOpenAiResponsesOutputText } from "@/shared/openai-responses";
import { parseCollabState } from "@/shared/collaboration";
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
- Generate one day per trip day. If dates are vague (e.g. "late June", "3 days"), infer a reasonable number of days (default 3-4 for weekends, 5-7 for "a week").
- Respect the budget: if budget is "budget-friendly" or low per-person, use hostels, street food, free attractions. If "splurge" or high budget, use luxury hotels, fine dining, premium experiences.
- Match the vibe: "party" = nightlife and bars; "chill" = beaches and spas; "culture" = museums and historical sites; "outdoors" = hikes and nature.
- If pace preference is provided: "packed" = 4-6 activities/day; "relaxed" = 2-3 activities with free-time blocks between.
- If interests are specified, weight activities heavily toward those categories.
- Include realistic cost estimates in USD per person. Use null only if you genuinely cannot estimate.
- Include transport (airport transfers, getting around), meals (2-3 per day), activities, and lodging (first day check-in).
- Keep descriptions concise and actionable.
- Do NOT include bookingUrl — leave it out or set null.
- estimatedDayCostPp should be the sum of all non-null activity costs for that day.
- Be specific to the destination: use real neighborhood names, landmark references, and local cuisine.
- For the first day, include arrival/check-in. For the last day, include checkout/departure.
- Lodging cost should only appear on Day 1 (total nightly rate x nights) or split evenly across days.

Example (abbreviated) for a 2-day budget trip to Austin with "outdoors" vibe:
{"days":[{"dateIso":"Day 1","label":"Arrival & Nature","activities":[{"time":"Morning","title":"Arrive at Austin-Bergstrom","description":"Grab bags, take city bus downtown (~30 min).","category":"transport","estimatedCostPp":2},{"time":"Late Morning","title":"Barton Springs Pool","description":"Swim in the natural spring-fed pool in Zilker Park.","category":"activity","estimatedCostPp":5},{"time":"Lunch","title":"Tacos at Veracruz All Natural","description":"Migas tacos and agua fresca on the east side.","category":"food","estimatedCostPp":12},{"time":"Afternoon","title":"Greenbelt Hike","description":"3-mile loop on the Barton Creek Greenbelt trail.","category":"activity","estimatedCostPp":0},{"time":"Evening","title":"Check in to HI Austin Hostel","description":"Dorm bed in SoCo area, walking distance to food.","category":"lodging","estimatedCostPp":45},{"time":"Dinner","title":"BBQ at la Barbecue","description":"Brisket and sides from the famous East Austin trailer.","category":"food","estimatedCostPp":18}],"estimatedDayCostPp":82},{"dateIso":"Day 2","label":"Lake Day & Departure","activities":[{"time":"Morning","title":"Breakfast tacos at Jo's Coffee","description":"Classic SoCo spot with outdoor seating.","category":"food","estimatedCostPp":10},{"time":"Late Morning","title":"Kayak on Lady Bird Lake","description":"Rent a kayak at the rowing dock for 2 hours.","category":"activity","estimatedCostPp":20},{"time":"Lunch","title":"Picnic at Zilker","description":"Grab HEB sandwiches and relax on the great lawn.","category":"food","estimatedCostPp":8},{"time":"Afternoon","title":"Depart Austin","description":"Bus back to airport for evening flight.","category":"transport","estimatedCostPp":2}],"estimatedDayCostPp":40}]}`;

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

function inferHomeBaseName(plan: TripPlan, itinerary: GeneratedItinerary): string {
  const userStay = plan.hostSetup?.hotelStays?.find(isUserSelectedLodgingStay);
  if (userStay?.place?.name?.trim()) return userStay.place.name.trim();
  const fromHost = plan.hostSetup?.hotel?.name?.trim();
  if (fromHost) return fromHost;
  for (const d of itinerary.days) {
    const lodg = d.activities.find((a) => a.category === "lodging" && a.title.trim());
    if (lodg?.title?.trim()) return cleanLabel(lodg.title, 120);
  }
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
  const homeBase = inferHomeBaseName(plan, itinerary);

  const restaurantPins: HostRestaurantPin[] = [];
  const activityPins: HostActivityPin[] = [];
  const dayVoting: DayVoteStateByDate = {};

  for (let i = 0; i < days.length; i += 1) {
    const dateIso = days[i]!;
    const dayItin = itinerary.days[i] ?? itinerary.days[itinerary.days.length - 1];
    const foodActs = (dayItin?.activities ?? []).filter((a) => a.category === "food" && a.title.trim());
    const lunch = cleanLabel(foodActs[0]?.title || `Lunch spot in ${location}`, 120);
    const dinner = cleanLabel(foodActs[1]?.title || `Dinner spot in ${location}`, 120);
    const actRows = (dayItin?.activities ?? []).filter((a) => a.category === "activity" && a.title.trim()).slice(0, 2);
    while (actRows.length < 2) {
      const slot = actRows.length + 1;
      actRows.push({
        time: slot === 1 ? "Afternoon" : "Evening",
        title: `Top ${slot === 1 ? "experience" : "activity"} in ${location}`,
        description: `${dayItin?.label || "Curated for your trip vibe and budget."}`,
        category: "activity",
        estimatedCostPp: null,
      });
    }
    const flightLabel = cleanLabel(`${departure} -> ${location} best-value flight option`, 140);
    const flightUrl = `https://www.google.com/travel/flights?hl=en&q=Flights%20from%20${slug(departure)}%20to%20${slug(location)}`;

    restaurantPins.push({
      dateIso,
      place: { name: lunch, mapsUrl: mapsSearchUrl(`${lunch} ${location}`), spotlightCategory: "restaurant" },
      kept: true,
      recommendedByConci: true,
    });
    restaurantPins.push({
      dateIso,
      place: { name: dinner, mapsUrl: mapsSearchUrl(`${dinner} ${location}`), spotlightCategory: "restaurant" },
      kept: true,
      recommendedByConci: true,
    });

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
    activityPins.push({
      dateIso,
      experience: {
        name: flightLabel,
        pricePerPerson: "",
        rating: "",
        duration: "Best option",
        bookingUrl: flightUrl,
        coverPhotoUrl: null,
      },
      kept: true,
      recommendedByConci: true,
    });

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
          {
            id: dayVoteId("rest", `${dateIso}|${lunch}`),
            label: lunch,
            detail: "recommended by CONCI",
            href: mapsSearchUrl(`${lunch} ${location}`),
            votes: [],
            suggestedBy: "conci:auto",
          },
          {
            id: dayVoteId("rest", `${dateIso}|${dinner}`),
            label: dinner,
            detail: "recommended by CONCI",
            href: mapsSearchUrl(`${dinner} ${location}`),
            votes: [],
            suggestedBy: "conci:auto",
          },
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
              mapsUrl: mapsSearchUrl(`${homeBase} ${location}`),
              spotlightCategory: "hotel",
            },
            recommendedByConci: true,
          },
        ]
      : [];

  return { restaurantPins, activityPins, hotelStays, dayVoting };
}

function buildItineraryUserPrompt(plan: TripPlan, seedText?: string | null): string {
  const lines: string[] = [];

  lines.push(`Destination: ${plan.location || "not specified"}`);
  if (plan.departureCity) lines.push(`Departing from: ${plan.departureCity}`);

  if (plan.dates.options.length > 0) {
    lines.push(`Dates: ${plan.dates.options.join(", ")}`);
  }

  const headcount = plan.people.count ?? (plan.people.names.length || 2);
  lines.push(`Group size: ${headcount} people`);

  if (plan.budget.tier || plan.budget.perPerson) {
    const budgetParts = [plan.budget.tier, plan.budget.perPerson].filter(Boolean);
    lines.push(`Budget: ${budgetParts.join(" \u2014 ")}`);
  }

  if (plan.vibe.length > 0) {
    lines.push(`Vibe: ${plan.vibe.join(", ")}`);
  }

  if (plan.hostSetup?.tripRange) {
    lines.push(`Confirmed date range: ${plan.hostSetup.tripRange.startIso} to ${plan.hostSetup.tripRange.endIso}`);
  }

  if (plan.hostSetup?.hotel) {
    lines.push(`Hotel: ${plan.hostSetup.hotel.name}`);
  }

  const pins = plan.hostSetup?.restaurantPins?.filter((p) => p.kept) ?? [];
  if (pins.length > 0) {
    lines.push(`Pinned restaurants: ${pins.map((p) => `${p.place.name} (${p.dateIso})`).join(", ")}`);
  }

  const actPins = plan.hostSetup?.activityPins?.filter((p) => p.kept) ?? [];
  if (actPins.length > 0) {
    lines.push(`Pinned activities: ${actPins.map((p) => `${p.experience.name} (${p.dateIso})`).join(", ")}`);
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

  const userPrompt = buildItineraryUserPrompt(plan, seedText);

  const response = await fetch("https://api.openai.com/v1/responses", {
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
  });

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
  const itinerary = validateItineraryOutput(parsed);

  if (!itinerary) {
    return NextResponse.json({ error: "Failed to parse itinerary from AI response" }, { status: 502 });
  }

  const headcount = plan.people.count ?? (plan.people.names.length || 2);
  itinerary.totalEstimateGroup =
    itinerary.totalEstimatePp != null ? itinerary.totalEstimatePp * headcount : null;

  const generated = buildAutofillRecommendations(plan, itinerary);
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

  return NextResponse.json({ itinerary, plan: updatedPlan });
}
