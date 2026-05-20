import { NextResponse } from "next/server";
import { generateMemberRecommendations } from "@/backend/member-recommendations";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { parseCollabState, VIBE_POLL_DECISION_KEY } from "@/shared/collaboration";
import { isUuid } from "@/shared/is-uuid";
import { normalizePlan } from "@/shared/trip-plan";

/**
 * POST /api/trip-plans/[id]/generate-recommendations
 *
 * Generates AI recommendations based on ALL members' submitted preferences
 * (from vibe poll votes and adjustment submissions) and saves them to the plan.
 * Typically triggered after itinerary generation or when the host requests a refresh.
 */
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
    .select("plan, collab_state")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !row?.plan) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  const plan = normalizePlan(row.plan);
  const collab = parseCollabState(row.collab_state);

  // Gather member preferences from two sources:
  // 1. Vibe poll write-in votes
  // 2. Adjustment submissions (pending ones)
  type MemberPref = { userId: string; name: string; text: string };
  const memberPrefs: MemberPref[] = [];

  // Source 1: Vibe poll votes (write-in text preferences)
  const vibeDecision = collab.decisions[VIBE_POLL_DECISION_KEY];
  if (vibeDecision?.votes) {
    for (const [voterId, voteValue] of Object.entries(vibeDecision.votes)) {
      if (typeof voteValue === "string" && voteValue.trim().length > 3) {
        memberPrefs.push({
          userId: voterId,
          name: voterId,
          text: voteValue.trim(),
        });
      }
    }
  }

  // Source 2: Pending adjustment submissions
  const submissions = collab.adjustmentSubmissions ?? [];
  for (const sub of submissions) {
    if (sub.status === "pending" && sub.text.trim().length > 3) {
      const existing = memberPrefs.find((p) => p.userId === sub.authorUserId);
      if (existing) {
        existing.text += "; " + sub.text.trim();
      } else {
        memberPrefs.push({
          userId: sub.authorUserId,
          name: sub.authorDisplayName,
          text: sub.text.trim(),
        });
      }
    }
  }

  if (memberPrefs.length === 0) {
    return NextResponse.json({ generated: 0, message: "No member preferences found to process." });
  }

  // Generate recommendations for each member (in parallel, bounded)
  const results = await Promise.allSettled(
    memberPrefs.map((pref) =>
      generateMemberRecommendations({
        tripId: id,
        userId: pref.userId,
        memberName: pref.name,
        preferences: pref.text,
        plan,
        svc,
      })
    )
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;

  return NextResponse.json({
    generated: succeeded,
    total: memberPrefs.length,
    message: `Generated recommendations for ${succeeded}/${memberPrefs.length} members.`,
  });
}
