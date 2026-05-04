import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { fetchTripPlanRowForCollab } from "@/backend/trip-plan-collab-fetch";
import { fetchTripPlanRoster } from "@/backend/trip-plan-roster";
import { sendTripReminderNudge } from "@/backend/trip-nudge-outbound";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { buildClassifiedDecisions, parseCollabState } from "@/shared/collaboration";
import { normalizePlan } from "@/shared/trip-plan";
import { isUuid } from "@/shared/is-uuid";

type Body = {
  memberId?: unknown;
  nudgeAllPending?: unknown;
};

function asStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid trip id" }, { status: 400 });
  }

  const supabase = await createAuthServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svcRaw = getSupabaseServiceRoleClient();
  if (!svcRaw) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }
  const svc = svcRaw;

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access?.isHost) {
    return NextResponse.json({ error: "Only the trip host can send reminders." }, { status: 403 });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  const { row, error: fetchErr } = await fetchTripPlanRowForCollab(svc, id);
  if (fetchErr || !row?.plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const plan = normalizePlan(row.plan);
  const classified = buildClassifiedDecisions(plan);
  const collab = parseCollabState(row.collab_state);

  const roster = await fetchTripPlanRoster(svc, id, collab, classified);
  const pending = roster.filter((p) => !p.hasParticipated);

  const nudgeAll = body.nudgeAllPending === true;
  const memberId = asStr(body.memberId);

  async function nudgeOne(person: (typeof roster)[0]): Promise<{
    displayName: string;
    result: Awaited<ReturnType<typeof sendTripReminderNudge>>;
  }> {
    const targetUserId = person.memberId;
    if (!targetUserId) {
      return {
        displayName: person.displayName,
        result: { ok: false as const, error: "Missing member id.", code: "no_contact" as const },
      };
    }
    const result = await sendTripReminderNudge(svc, {
      tripPlanId: id,
      tripTitle: plan.title ?? "",
      location: plan.location,
      displayName: person.displayName,
      targetUserId,
    });
    return { displayName: person.displayName, result };
  }

  if (nudgeAll) {
    const results: { displayName: string; ok: boolean; channel?: "email"; error?: string; code?: string }[] = [];
    for (const person of pending.slice(0, 25)) {
      const { displayName, result } = await nudgeOne(person);
      if (result.ok) results.push({ displayName, ok: true, channel: result.channel });
      else results.push({ displayName, ok: false, error: result.error, code: result.code });
    }
    return NextResponse.json({ ok: true, batch: true, results });
  }

  if (memberId && isUuid(memberId)) {
    const person = pending.find((p) => p.memberId === memberId);
    if (!person) {
      return NextResponse.json({ error: "That traveler is not pending on this trip roster." }, { status: 400 });
    }
    const { result } = await nudgeOne(person);
    if (!result.ok) {
      const status =
        result.code === "rate_limited" ? 429 : result.code === "not_configured" ? 503 : result.code === "no_contact" ? 400 : 502;
      return NextResponse.json({ error: result.error, code: result.code }, { status });
    }
    return NextResponse.json({ ok: true, channel: result.channel, displayName: person.displayName });
  }

  return NextResponse.json({ error: "Send memberId or nudgeAllPending: true." }, { status: 400 });
}
