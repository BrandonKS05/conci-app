import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { isOutboundEmailConfigured, sendOutboundEmail } from "@/backend/outbound-email";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { fetchTripPlanMemberUserIds } from "@/backend/trip-plan-member-user-ids";
import { fetchTripPlanRowForCollab } from "@/backend/trip-plan-collab-fetch";
import { appBaseUrl } from "@/backend/app-base-url";
import { normalizePlan } from "@/shared/trip-plan";
import { isUuid } from "@/shared/is-uuid";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_SUBJECT = 240;
const MAX_BODY = 20_000;

function asNonEmptyTrimmed(v: unknown, maxLen: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

async function resolveUserEmail(svc: SupabaseClient, userId: string): Promise<string | null> {
  const { data: u, error } = await svc.auth.admin.getUserById(userId);
  if (error || !u?.user?.email) return null;
  const e = u.user.email.trim().toLowerCase();
  return e.length > 3 ? e : null;
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
  if (userError || !user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access?.isHost) {
    return NextResponse.json({ error: "Only the trip host can email members." }, { status: 403 });
  }

  if (!isOutboundEmailConfigured()) {
    return NextResponse.json(
      { error: "Outbound email is not configured (set RESEND_API_KEY and NUDGE_EMAIL_FROM)." },
      { status: 503 }
    );
  }

  let bodyJson: Record<string, unknown> = {};
  try {
    bodyJson = (await req.json()) as Record<string, unknown>;
  } catch {
    bodyJson = {};
  }

  const subject = asNonEmptyTrimmed(bodyJson.subject, MAX_SUBJECT);
  const message = asNonEmptyTrimmed(bodyJson.message, MAX_BODY);
  const memberIdsRaw = bodyJson.memberIds;

  if (!subject) {
    return NextResponse.json({ error: "Add a subject for the email." }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "Add a message body." }, { status: 400 });
  }
  if (!Array.isArray(memberIdsRaw) || memberIdsRaw.length === 0) {
    return NextResponse.json({ error: "Choose at least one member to notify." }, { status: 400 });
  }

  const memberIds = [...new Set(memberIdsRaw.map((x) => (typeof x === "string" ? x.trim() : "")).filter(isUuid))];
  if (memberIds.length === 0) {
    return NextResponse.json({ error: "No valid member ids to notify." }, { status: 400 });
  }

  const { row: planRow, error: planErr } = await fetchTripPlanRowForCollab(svc, id);
  if (planErr || !planRow?.plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const plan = normalizePlan(planRow.plan);
  const title = plan.title?.trim() || "Trip";

  const allowed = await fetchTripPlanMemberUserIds(svc, id);
  const tripLink = `${appBaseUrl()}/trip/${id}`;

  type Row = { memberId: string; ok: boolean; error?: string };
  const results: Row[] = [];

  for (const memberId of memberIds.slice(0, 50)) {
    if (!allowed.has(memberId)) {
      results.push({ memberId, ok: false, error: "Not a traveler on this trip." });
      continue;
    }
    if (memberId === user.id) {
      results.push({ memberId, ok: false, error: "You can’t send this email to yourself from here." });
      continue;
    }
    const to = await resolveUserEmail(svc, memberId);
    if (!to) {
      results.push({ memberId, ok: false, error: "No email on file for this traveler’s account." });
      continue;
    }

    const textBody = `${message}\n\n---\nOpen the trip: ${tripLink}\n\nTrip: ${title}\nYou’re receiving this because the trip organizer sent an update via Conci.`;

    const sent = await sendOutboundEmail(to, subject, { text: textBody });
    if (!sent.ok) {
      console.warn("[collab notify] Resend:", sent.detail);
      results.push({ memberId, ok: false, error: "Could not send email." });
      continue;
    }
    results.push({ memberId, ok: true });
  }

  const sent = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  if (sent === 0 && failed > 0) {
    const firstErr = results.find((r) => !r.ok)?.error ?? "No emails delivered.";
    return NextResponse.json(
      {
        ok: false as const,
        error: firstErr,
        results,
        sent: 0,
        failed,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true as const,
    sent,
    failed,
    results,
  });
}
