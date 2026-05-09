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
import { normalizePlan } from "@/shared/trip-plan";
import { isUuid } from "@/shared/is-uuid";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

type ActionBody =
  | { action: "suggest"; dateIso: string; category: DayVoteCategory; label: string; detail?: string; href?: string }
  | { action: "vote"; dateIso: string; category: DayVoteCategory; optionId: string }
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

  const plan = normalizePlan(row.plan);
  const collab = parseCollabState(row.collab_state);
  let dayVoting = mergeDayVoteStateForDate(plan, parseDayVoteState(collab.dayVoting), dateIso);
  const day = dayVoting[dateIso]!;
  const state = day[category];

  if (body.action === "suggest") {
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
      suggestedBy: user.id,
    });
  } else if (body.action === "vote") {
    const optionId = cleanText(body.optionId, 120);
    const target = state.options.find((o) => o.id === optionId);
    if (!target) return NextResponse.json({ error: "Option not found" }, { status: 404 });
    const has = target.votes.includes(user.id);
    target.votes = has ? target.votes.filter((v) => v !== user.id) : [...target.votes, user.id];
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

  dayVoting = { ...dayVoting, [dateIso]: { ...day, [category]: { ...state } } };
  const nextCollab = { ...collab, dayVoting };
  const { error: upErr } = await svc
    .from("trip_plans")
    .update({ collab_state: nextCollab, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (upErr) {
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }

  return NextResponse.json({ ok: true as const, dayVoting: nextCollab.dayVoting, isHost: access.isHost });
}

