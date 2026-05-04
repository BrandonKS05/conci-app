import { NextResponse } from "next/server";
import { fetchTripPlanRowForCollab } from "@/backend/trip-plan-collab-fetch";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { fetchTripPlanRoster } from "@/backend/trip-plan-roster";
import { nudgeEmailConfigured } from "@/backend/trip-nudge-outbound";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { memberVoteKey } from "@/shared/collab-vote-keys";
import { buildClassifiedDecisions, collaborationQuorum, parseCollabState } from "@/shared/collaboration";
import { normalizePlan } from "@/shared/trip-plan";
import type { TripRosterPerson } from "@/shared/trip-roster";
import { isUuid } from "@/shared/is-uuid";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
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

  const { row, error: fetchErr } = await fetchTripPlanRowForCollab(svc, id);
  if (fetchErr || !row?.plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const plan = normalizePlan(row.plan);
  const classified = buildClassifiedDecisions(plan);
  let collab = parseCollabState(row.collab_state);

  let mutated = false;
  const nextDecisions = { ...collab.decisions };
  for (const meta of classified) {
    if (!nextDecisions[meta.key]) {
      nextDecisions[meta.key] = {
        kind: meta.kind,
        votes: {},
        hotels: meta.hotels,
        restaurants: meta.restaurants,
      };
      mutated = true;
    } else if (meta.kind === "hotel" && meta.hotels?.length && !nextDecisions[meta.key]!.hotels?.length) {
      nextDecisions[meta.key] = { ...nextDecisions[meta.key]!, hotels: meta.hotels };
      mutated = true;
    } else if (
      meta.kind === "pick" &&
      meta.restaurants?.length &&
      !nextDecisions[meta.key]!.restaurants?.length
    ) {
      nextDecisions[meta.key] = { ...nextDecisions[meta.key]!, restaurants: meta.restaurants };
      mutated = true;
    }
  }
  if (mutated) {
    collab = { ...collab, decisions: nextDecisions };
    const { error: persistErr } = await svc
      .from("trip_plans")
      .update({ collab_state: collab, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (persistErr) {
      console.warn("[collab GET] could not persist collab_state (column missing or RLS):", persistErr.message);
    }
  }

  const quorum = collaborationQuorum(plan);
  const canonicalVoterKey = memberVoteKey(user.id);

  let roster: TripRosterPerson[] = [];
  try {
    roster = await fetchTripPlanRoster(svc, id, collab, classified);
  } catch (e) {
    console.warn("[collab GET] roster fetch skipped:", e instanceof Error ? e.message : e);
    roster = [];
  }

  return NextResponse.json({
    collab,
    classified,
    quorum,
    visitorKey: "",
    canonicalVoterKey,
    roster,
    ...(access.isHost
      ? {
          viewerIsTripOwner: true as const,
          nudgeEmailReady: nudgeEmailConfigured(),
        }
      : {}),
    planSnapshot: {
      datesOptions: plan.dates.options,
      peopleNames: plan.people.names,
      peopleCount: plan.people.count,
    },
  });
}
