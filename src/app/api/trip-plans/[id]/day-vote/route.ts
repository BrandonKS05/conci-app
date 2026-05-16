import { NextResponse } from "next/server";
import { fetchTripPlanRowForCollab } from "@/backend/trip-plan-collab-fetch";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import {
  DAY_VOTE_CATEGORIES,
  mergeDayVoteStateForDate,
  parseDayVoteState,
  type DayVoteCategory,
} from "@/shared/day-collaboration";
import { parseCollabState } from "@/shared/collaboration";
import type { PlaceSpotlight } from "@/shared/place-preview";
import {
  applyHostHotelDateRange,
  tagLodgingStayAtRange,
  enumerateLocalIsoDays,
  normalizePlan,
  parseHostSetup,
  type HostActivityExperience,
  type HostActivityPin,
  type HostRestaurantPin,
  type HostSetupState,
  type TripPlan,
} from "@/shared/trip-plan";
import { isUuid } from "@/shared/is-uuid";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

type PinCategory = "restaurants" | "activities" | "hotels";

type ActionBody =
  | { action: "suggest"; dateIso: string; category: DayVoteCategory; label: string; detail?: string; href?: string }
  | { action: "vote"; dateIso: string; category: DayVoteCategory; optionId: string }
  | { action: "toggleNotInterested"; dateIso: string; category: DayVoteCategory; optionId: string }
  | { action: "pinToCalendar"; dateIso: string; category: PinCategory; optionId: string }
  | { action: "lock"; dateIso: string; category: DayVoteCategory; optionId: string; detail: string }
  | { action: "unlock"; dateIso: string; category: DayVoteCategory };

function isDayCategory(value: unknown): value is DayVoteCategory {
  return typeof value === "string" && (DAY_VOTE_CATEGORIES as readonly string[]).includes(value);
}

function cleanText(value: unknown, max = 180): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function makeId(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return `usr:${(h >>> 0).toString(36)}`;
}

function mapsSearchFallback(label: string, locationHint: string): string {
  const q = `${label} ${locationHint}`.replace(/\s+/g, " ").trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function mergeTripHostSetup(planRecord: Record<string, unknown>, patch: Partial<HostSetupState>): TripPlan {
  const prev = parseHostSetup(planRecord.hostSetup) ?? {};
  const merged = { ...prev, ...patch };
  return normalizePlan({ ...planRecord, hostSetup: merged });
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

  let body: ActionBody;
  try {
    body = (await req.json()) as ActionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!ISO_DAY.test(cleanText((body as { dateIso?: unknown }).dateIso, 32))) {
    return NextResponse.json({ error: "Invalid dateIso" }, { status: 400 });
  }
  const dateIso = (body as { dateIso: string }).dateIso;
  const category = (body as { category?: unknown }).category;
  if (!isDayCategory(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }
  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { row, error: fetchErr } = await fetchTripPlanRowForCollab(svc, id);
  if (fetchErr || !row?.plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const planRecord =
    typeof row.plan === "object" && row.plan !== null ? (row.plan as Record<string, unknown>) : {};
  let plan = normalizePlan(planRecord);
  const collab = parseCollabState(row.collab_state);
  const hints = {
    cardChat: collab.cardChat,
    adjustmentSubmissions: collab.adjustmentSubmissions,
  };

  let dayVoting = mergeDayVoteStateForDate(plan, parseDayVoteState(collab.dayVoting), dateIso, hints);
  const day = dayVoting[dateIso]!;
  const state = day[category];

  let nextPlan = plan;
  let planUpdated = false;

  if (body.action === "pinToCalendar") {
    if (!access.isHost) {
      return NextResponse.json({ error: "Only the trip owner can add items to the calendar." }, { status: 403 });
    }
    const pinCat = body.category as PinCategory;
    if (pinCat !== "restaurants" && pinCat !== "activities" && pinCat !== "hotels") {
      return NextResponse.json({ error: "Invalid pin category." }, { status: 400 });
    }
    if (category !== pinCat) {
      return NextResponse.json({ error: "Category mismatch." }, { status: 400 });
    }
    const optionId = cleanText(body.optionId, 120);
    const target = state.options.find((o) => o.id === optionId);
    if (!target) return NextResponse.json({ error: "Option not found" }, { status: 404 });

    const loc = plan.location?.trim() || plan.title?.trim() || "";

    if (pinCat === "restaurants") {
      const mapsUrl =
        target.href?.startsWith("http") ? target.href : mapsSearchFallback(target.label, loc || "near destination");
      const place: PlaceSpotlight = {
        name: target.label.slice(0, 200),
        mapsUrl,
        spotlightCategory: "restaurant",
      };
      const pins: HostRestaurantPin[] = [...(plan.hostSetup?.restaurantPins ?? [])];
      const dupe = pins.some((p) => p.dateIso === dateIso && p.place.mapsUrl === mapsUrl);
      if (!dupe) pins.push({ dateIso, place, kept: true });
      nextPlan = mergeTripHostSetup(planRecord, { restaurantPins: pins });
      planUpdated = true;
    } else if (pinCat === "activities") {
      const bookingUrl =
        target.href?.startsWith("http") ? target.href : mapsSearchFallback(target.label, loc || "near destination");
      const experience: HostActivityExperience = {
        name: target.label.slice(0, 200),
        bookingUrl,
        pricePerPerson: "",
        rating: "",
        duration: "",
        coverPhotoUrl: null,
      };
      const pins: HostActivityPin[] = [...(plan.hostSetup?.activityPins ?? [])];
      const dupe = pins.some((p) => p.dateIso === dateIso && p.experience.bookingUrl === bookingUrl);
      if (!dupe) pins.push({ dateIso, experience, kept: true });
      nextPlan = mergeTripHostSetup(planRecord, { activityPins: pins });
      planUpdated = true;
    } else {
      const tr = plan.hostSetup?.tripRange;
      if (!tr?.startIso || !tr?.endIso) {
        return NextResponse.json({ error: "Set trip dates on the calendar first." }, { status: 400 });
      }
      const tripDays = enumerateLocalIsoDays(tr.startIso, tr.endIso);
      if (!tripDays.includes(dateIso)) {
        return NextResponse.json({ error: "That day is outside your trip range." }, { status: 400 });
      }
      const mapsUrl =
        target.href?.startsWith("http") ? target.href : mapsSearchFallback(target.label, loc || "hotel");
      const place: PlaceSpotlight = {
        name: target.label.slice(0, 200),
        mapsUrl,
        spotlightCategory: "hotel",
      };
      let { hotelStays } = applyHostHotelDateRange(
        plan.hostSetup?.hotelStays,
        tr.startIso,
        tr.endIso,
        dateIso,
        dateIso,
        place
      );
      hotelStays = tagLodgingStayAtRange(hotelStays, dateIso, dateIso, place.mapsUrl, {
        userSelected: true,
        recommendedByConci: false,
      });
      const hotel = hotelStays.find((s) => s.startIso === dateIso && s.endIso === dateIso)?.place ?? place;
      nextPlan = mergeTripHostSetup(planRecord, { hotelStays, hotel });
      planUpdated = true;
    }
    plan = nextPlan;
    dayVoting = mergeDayVoteStateForDate(plan, parseDayVoteState(collab.dayVoting), dateIso, hints);
  } else if (body.action === "suggest") {
    const memberPermission = collab.daySuggestPermissions?.[user.id] ?? "vote_only";
    if (!access.isHost && memberPermission !== "can_suggest") {
      return NextResponse.json(
        { error: "Host has restricted suggestions. You can vote but not add new options." },
        { status: 403 }
      );
    }
    const label = cleanText(body.label, 140);
    const detail = cleanText(body.detail, 220);
    const href = cleanText(body.href, 300);
    if (!label) return NextResponse.json({ error: "Option name is required" }, { status: 400 });
    if (state.options.some((o) => o.label.toLowerCase() === label.toLowerCase())) {
      return NextResponse.json({ error: "That option is already listed" }, { status: 400 });
    }
    state.options.push({
      id: makeId(`${Date.now()}|${dateIso}|${category}|${label}`),
      label,
      ...(detail ? { detail } : {}),
      ...(href.startsWith("http") ? { href } : {}),
      votes: [user.id],
      downvotes: [],
      suggestedBy: user.id,
    });
  } else if (body.action === "vote") {
    const optionId = cleanText(body.optionId, 120);
    const target = state.options.find((o) => o.id === optionId);
    if (!target) return NextResponse.json({ error: "Option not found" }, { status: 404 });
    const has = target.votes.includes(user.id);
    const downs = target.downvotes ?? [];
    if (has) {
      target.votes = target.votes.filter((v) => v !== user.id);
    } else {
      target.votes = [...target.votes, user.id];
      target.downvotes = downs.filter((v) => v !== user.id);
    }
  } else if (body.action === "toggleNotInterested") {
    const optionId = cleanText(body.optionId, 120);
    const target = state.options.find((o) => o.id === optionId);
    if (!target) return NextResponse.json({ error: "Option not found" }, { status: 404 });
    const downs = target.downvotes ?? [];
    const hasDown = downs.includes(user.id);
    if (hasDown) {
      target.downvotes = downs.filter((v) => v !== user.id);
    } else {
      target.downvotes = [...downs, user.id];
      target.votes = target.votes.filter((v) => v !== user.id);
    }
  } else if (body.action === "lock") {
    if (!access.isHost) return NextResponse.json({ error: "Only host can lock options" }, { status: 403 });
    const optionId = cleanText(body.optionId, 120);
    const detail = cleanText(body.detail, 220);
    if (!detail) return NextResponse.json({ error: "Add confirmation detail" }, { status: 400 });
    const target = state.options.find((o) => o.id === optionId);
    if (!target) return NextResponse.json({ error: "Option not found" }, { status: 404 });
    state.lockedOptionId = optionId;
    target.lockedDetail = detail;
    target.lockedAt = new Date().toISOString();
    target.lockedBy = user.id;
  } else if (body.action === "unlock") {
    if (!access.isHost) return NextResponse.json({ error: "Only host can unlock options" }, { status: 403 });
    delete state.lockedOptionId;
  } else {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const nextDaySlice = body.action === "pinToCalendar" ? dayVoting[dateIso]! : { ...day, [category]: { ...state } };
  dayVoting = { ...dayVoting, [dateIso]: nextDaySlice };

  const nextCollab = { ...collab, dayVoting };

  if (planUpdated) {
    const { error: planErr } = await svc
      .from("trip_plans")
      .update({
        plan: nextPlan as unknown as Record<string, unknown>,
        collab_state: nextCollab,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (planErr) {
      return NextResponse.json({ error: "Could not save" }, { status: 500 });
    }
    return NextResponse.json({
      ok: true as const,
      dayVoting: nextCollab.dayVoting,
      plan: nextPlan,
      isHost: access.isHost,
    });
  }

  const { error: upErr } = await svc
    .from("trip_plans")
    .update({ collab_state: nextCollab, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (upErr) {
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }

  return NextResponse.json({ ok: true as const, dayVoting: nextCollab.dayVoting, isHost: access.isHost });
}
