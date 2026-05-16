import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchWikipediaThumbnailForQuery } from "@/backend/wikipedia-place-image";
import { getUserProfile } from "@/backend/social-follow";
import type { FullUserProfilePayload, ProfileExperience, ProfileHotel, ProfileRecentTrip, ProfileRestaurant } from "@/shared/user-profile-page";
import { EXPERIENCE_CATEGORIES, clampScore } from "@/shared/user-profile-page";
import { tripDestinationCoverFromPlan } from "@/shared/trip-destination-cover";
import { normalizePlan, type TripPlan } from "@/shared/trip-plan";

type ProfileExtrasRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  handle: string | null;
  bio: string | null;
  location: string | null;
  banner_url: string | null;
  profile_hotels: unknown;
  profile_experiences: unknown;
  profile_restaurants: unknown;
};

function newId(): string {
  return crypto.randomUUID();
}

function parseHotels(raw: unknown): ProfileHotel[] {
  if (!Array.isArray(raw)) return [];
  const out: ProfileHotel[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!name) continue;
    const stars = typeof o.starRating === "number" ? Math.min(5, Math.max(1, Math.round(o.starRating))) : 3;
    const pr = o.priceRange;
    const priceRange =
      pr === "$" || pr === "$$" || pr === "$$$" ? pr : undefined;
    out.push({
      id: typeof o.id === "string" ? o.id : newId(),
      name,
      location: typeof o.location === "string" ? o.location.trim() : "",
      starRating: stars,
      note: typeof o.note === "string" ? o.note.trim().slice(0, 280) : "",
      priceRange,
      order: typeof o.order === "number" ? o.order : out.length,
    });
  }
  return out.sort((a, b) => a.order - b.order).slice(0, 6);
}

function parseExperiences(raw: unknown): ProfileExperience[] {
  if (!Array.isArray(raw)) return [];
  const out: ProfileExperience[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!name) continue;
    const cat = typeof o.category === "string" ? o.category : "Food";
    const category = (EXPERIENCE_CATEGORIES as readonly string[]).includes(cat)
      ? (cat as ProfileExperience["category"])
      : "Food";
    out.push({
      id: typeof o.id === "string" ? o.id : newId(),
      name,
      location: typeof o.location === "string" ? o.location.trim() : "",
      score: clampScore(typeof o.score === "number" ? o.score : 5),
      review: typeof o.review === "string" ? o.review.trim().slice(0, 140) : "",
      category,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

function parseRestaurants(raw: unknown): ProfileRestaurant[] {
  if (!Array.isArray(raw)) return [];
  const out: ProfileRestaurant[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!name) continue;
    const pr = o.priceRange;
    const priceRange =
      pr === "$" || pr === "$$" || pr === "$$$" || pr === "$$$$" ? pr : "$$";
    out.push({
      id: typeof o.id === "string" ? o.id : newId(),
      name,
      neighborhood: typeof o.neighborhood === "string" ? o.neighborhood.trim() : "",
      city: typeof o.city === "string" ? o.city.trim() : "",
      cuisine: typeof o.cuisine === "string" ? o.cuisine.trim() : "",
      score: clampScore(typeof o.score === "number" ? o.score : 5),
      note: typeof o.note === "string" ? o.note.trim().slice(0, 140) : "",
      priceRange,
      order: typeof o.order === "number" ? o.order : out.length,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

function datesLabelFromPlan(plan: TripPlan): string {
  if (plan.dates.options.length > 0) return plan.dates.options.join(" · ");
  return "Dates TBD";
}

function initialsFromPlan(plan: TripPlan): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const name of plan.people.names) {
    const t = name?.trim();
    if (!t) continue;
    const init = t.split(/\s+/)[0]?.charAt(0).toUpperCase() ?? "";
    if (!init || seen.has(init)) continue;
    seen.add(init);
    out.push(init);
    if (out.length >= 4) break;
  }
  return out;
}

async function countVisits(svc: SupabaseClient, userId: string): Promise<number> {
  const tripIds = new Set<string>();
  const { data: hosted } = await svc.from("trip_plans").select("id").eq("user_id", userId);
  for (const row of hosted ?? []) {
    if (row?.id) tripIds.add(row.id as string);
  }
  const { data: memberships } = await svc.from("trip_memberships").select("trip_plan_id").eq("user_id", userId);
  for (const row of memberships ?? []) {
    if (row?.trip_plan_id) tripIds.add(row.trip_plan_id as string);
  }
  return tripIds.size;
}

async function fetchRecentTrips(svc: SupabaseClient, userId: string): Promise<ProfileRecentTrip[]> {
  const tripIds = new Set<string>();
  const orderMap = new Map<string, string>();

  const { data: hosted } = await svc
    .from("trip_plans")
    .select("id, plan, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(12);

  for (const row of hosted ?? []) {
    const id = row.id as string;
    tripIds.add(id);
    orderMap.set(id, (row.created_at as string) ?? "");
  }

  const { data: memberships } = await svc
    .from("trip_memberships")
    .select("trip_plan_id, joined_at")
    .eq("user_id", userId)
    .order("joined_at", { ascending: false })
    .limit(24);

  const memberIds = [...new Set((memberships ?? []).map((m) => m.trip_plan_id as string).filter(Boolean))].filter(
    (id) => !tripIds.has(id)
  );

  let joinedRows: { id: string; plan: unknown; created_at: string | null }[] = [];
  if (memberIds.length) {
    const { data: jr } = await svc
      .from("trip_plans")
      .select("id, plan, created_at")
      .in("id", memberIds.slice(0, 12));
    joinedRows = jr ?? [];
  }

  const allRows = [
    ...(hosted ?? []).map((r) => ({ id: r.id as string, plan: r.plan, created_at: r.created_at as string | null })),
    ...joinedRows,
  ];

  allRows.sort((a, b) => {
    const ta = new Date(a.created_at ?? 0).getTime();
    const tb = new Date(b.created_at ?? 0).getTime();
    return tb - ta;
  });

  const out: ProfileRecentTrip[] = [];
  for (const row of allRows.slice(0, 10)) {
    const plan = normalizePlan(row.plan);
    let coverImageUrl = tripDestinationCoverFromPlan(plan);
    if (!coverImageUrl && plan.location?.trim()) {
      const token = plan.location.split(",")[0]?.trim() ?? plan.location.trim();
      if (token.length >= 2 && !/^tbd$/i.test(token)) {
        coverImageUrl = await fetchWikipediaThumbnailForQuery(token);
      }
    }
    out.push({
      id: row.id,
      title: plan.title?.trim() || plan.location?.trim() || "Trip",
      location: plan.location?.trim() || null,
      datesLabel: datesLabelFromPlan(plan),
      coverImageUrl,
      memberInitials: initialsFromPlan(plan),
    });
  }
  return out;
}

export async function getFullUserProfile(
  svc: SupabaseClient,
  profileUserId: string,
  viewerId: string | null
): Promise<FullUserProfilePayload | null> {
  const social = await getUserProfile(svc, profileUserId, viewerId);
  if (!social) return null;

  const { data: row, error } = await svc
    .from("profiles")
    .select(
      "id, display_name, avatar_url, handle, bio, location, banner_url, profile_hotels, profile_experiences, profile_restaurants"
    )
    .eq("id", profileUserId)
    .maybeSingle();

  if (error) {
    console.warn("[user-profile-page] profiles read failed:", error.message);
  }

  const p = row as ProfileExtrasRow | null;
  const [visitCount, recentTrips] = await Promise.all([
    countVisits(svc, profileUserId),
    fetchRecentTrips(svc, profileUserId),
  ]);

  return {
    ...social,
    bio: p?.bio?.trim() ?? "",
    location: p?.location?.trim() ?? "",
    bannerUrl: p?.banner_url?.trim() || null,
    visitCount,
    hotels: parseHotels(p?.profile_hotels),
    experiences: parseExperiences(p?.profile_experiences),
    restaurants: parseRestaurants(p?.profile_restaurants),
    recentTrips,
  };
}

export type ProfilePatchBody = {
  displayName?: string;
  handle?: string;
  bio?: string;
  location?: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  hotels?: ProfileHotel[];
  experiences?: ProfileExperience[];
  restaurants?: ProfileRestaurant[];
};

export async function updateUserProfile(
  svc: SupabaseClient,
  userId: string,
  body: ProfilePatchBody
): Promise<{ ok: true } | { error: string }> {
  const { data: existing } = await svc
    .from("profiles")
    .select(
      "subscription_tier, stripe_customer_id, stripe_subscription_id, display_name, avatar_url, handle, bio, location, banner_url, profile_hotels, profile_experiences, profile_restaurants, notify_vote_email, notify_date_locked_email, notify_nudge_reminders"
    )
    .eq("id", userId)
    .maybeSingle();

  if (body.handle !== undefined) {
    const h = body.handle.trim().toLowerCase().replace(/^@/, "");
    if (!/^[a-z0-9_]{3,30}$/.test(h)) {
      return { error: "Handle must be 3–30 characters (letters, numbers, underscores)." };
    }
    const { data: clash } = await svc.from("profiles").select("id").ilike("handle", h).neq("id", userId).limit(1);
    if (clash?.length) return { error: "That handle is already taken." };
  }

  const nextRow: Record<string, unknown> = {
    id: userId,
    subscription_tier: existing?.subscription_tier ?? "free",
    stripe_customer_id: existing?.stripe_customer_id ?? null,
    stripe_subscription_id: existing?.stripe_subscription_id ?? null,
    display_name:
      body.displayName !== undefined
        ? body.displayName.trim().slice(0, 120)
        : (existing?.display_name as string | null) ?? "",
    avatar_url:
      body.avatarUrl !== undefined ? body.avatarUrl : (existing?.avatar_url as string | null) ?? null,
    handle:
      body.handle !== undefined
        ? body.handle.trim().toLowerCase().replace(/^@/, "")
        : (existing?.handle as string | null) ?? null,
    bio: body.bio !== undefined ? body.bio.trim().slice(0, 500) : (existing?.bio as string | null) ?? "",
    location:
      body.location !== undefined ? body.location.trim().slice(0, 120) : (existing?.location as string | null) ?? "",
    banner_url:
      body.bannerUrl !== undefined ? body.bannerUrl : (existing?.banner_url as string | null) ?? null,
    profile_hotels:
      body.hotels !== undefined ? parseHotels(body.hotels) : parseHotels(existing?.profile_hotels),
    profile_experiences:
      body.experiences !== undefined
        ? parseExperiences(body.experiences)
        : parseExperiences(existing?.profile_experiences),
    profile_restaurants:
      body.restaurants !== undefined
        ? parseRestaurants(body.restaurants)
        : parseRestaurants(existing?.profile_restaurants),
    notify_vote_email: existing?.notify_vote_email ?? true,
    notify_date_locked_email: existing?.notify_date_locked_email ?? true,
    notify_nudge_reminders: existing?.notify_nudge_reminders ?? true,
    updated_at: new Date().toISOString(),
  };

  const { error } = await svc.from("profiles").upsert(nextRow, { onConflict: "id" });
  if (error) return { error: error.message };
  return { ok: true };
}
