import { NextResponse } from "next/server";
import { fetchTripPlanRowForCollab } from "@/backend/trip-plan-collab-fetch";
import { generateMemberRecommendations } from "@/backend/member-recommendations";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { fetchAuthUserDisplayLabel } from "@/backend/trip-member-names";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { migrateVoterVoteKeys } from "@/shared/collab-vote-keys";
import {
  bundlePickVote,
  sanitizeAgainstOptions,
  isAllowedPollWriteIn,
} from "@/shared/collab-pick-vote";
import {
  BUDGET_POLL_DECISION_KEY,
  TRANSPORT_POLL_DECISION_KEY,
  VENUE_POLL_DECISION_KEY,
  VIBE_POLL_DECISION_KEY,
  buildClassifiedDecisions,
  collaborationQuorum,
  parseCollabState,
  tryLockDecision,
  type CollabStateV1,
} from "@/shared/collaboration";
import {
  isValidBudgetCustomVoteToken,
  parseBudgetCustomAmountInput,
} from "@/shared/budget-poll";
import { inferDefaultYearFromDateOptions, isAllowedDateVoteOption } from "@/shared/date-option-parse";
import { normalizePlan } from "@/shared/trip-plan";
import { isUuid } from "@/shared/is-uuid";

type VoteBody =
  | { decisionKey: string; kind: "datesWorksForMe" }
  | { decisionKey: string; kind: "dates"; option: string }
  | { decisionKey: string; kind: "binary"; option: string; againstOptions?: unknown }
  | { decisionKey: string; kind: "hotel"; hotelId: string }
  | { decisionKey: string; kind: "people"; name: string; stance: "in" | "maybe" | "out" }
  | { decisionKey: string; kind: "generic"; option: string; againstOptions?: unknown }
  | { decisionKey: string; kind: "pick"; option: string; againstOptions?: unknown };

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

  let body: VoteBody;
  try {
    body = (await req.json()) as VoteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.decisionKey || typeof body.decisionKey !== "string") {
    return NextResponse.json({ error: "Missing decisionKey" }, { status: 400 });
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
  const meta = classified.find((c) => c.key === body.decisionKey);
  if (!meta) {
    return NextResponse.json({ error: "Unknown decision" }, { status: 400 });
  }

  let collab: CollabStateV1 = parseCollabState(row.collab_state);
  const quorum = collaborationQuorum(plan);

  let blob = collab.decisions[body.decisionKey];
  if (!blob) {
    blob = { kind: meta.kind, votes: {}, hotels: meta.hotels, restaurants: meta.restaurants };
  } else if (meta.kind === "hotel" && (!blob.hotels || blob.hotels.length === 0) && meta.hotels?.length) {
    blob = { ...blob, hotels: meta.hotels };
  } else if (
    meta.kind === "pick" &&
    meta.restaurants?.length &&
    (!blob.restaurants || blob.restaurants.length === 0)
  ) {
    blob = { ...blob, restaurants: meta.restaurants };
  }

  const canInteractWithLockedDates =
    meta.kind === "dates" && plan.dates.confirmed === true;

  if (blob.locked !== undefined && blob.locked !== null && !canInteractWithLockedDates) {
    return NextResponse.json({ error: "Decision is already locked" }, { status: 400 });
  }

  const visitorKey = user.id;
  const memberId = user.id;

  const votesSeed = { ...(blob.votes as Record<string, unknown>) };
  const isPeopleDecision = meta.kind === "people";
  const { votes, writeKey, carriedPeople } = migrateVoterVoteKeys(votesSeed, visitorKey, memberId, isPeopleDecision);

  if (body.kind === "datesWorksForMe" && meta.kind === "dates") {
    if (!plan.dates.confirmed) {
      return NextResponse.json(
        { error: "The host has not confirmed trip dates yet." },
        { status: 400 }
      );
    }
    const nextWorks = { ...(blob.dateWorksForMe ?? {}), [writeKey]: true as const };
    blob = { ...blob, dateWorksForMe: nextWorks };
    collab = {
      ...collab,
      decisions: { ...collab.decisions, [body.decisionKey]: blob },
    };
    const { error: upWfm } = await svc
      .from("trip_plans")
      .update({ collab_state: collab, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (upWfm) {
      console.error("[collab vote] datesWorksForMe", upWfm);
      return NextResponse.json({ error: "Could not save" }, { status: 500 });
    }
    return NextResponse.json({ ok: true as const, collab });
  }

  if (body.kind === "dates" && meta.kind === "dates") {
    const y0 = inferDefaultYearFromDateOptions(plan.dates.options, new Date().getFullYear());
    if (!isAllowedDateVoteOption(body.option, plan.dates.options, y0)) {
      return NextResponse.json({ error: "Invalid date option" }, { status: 400 });
    }
    votes[writeKey] = body.option.trim();
  } else if ((body.kind === "binary" || body.kind === "generic") && (meta.kind === "binary" || meta.kind === "generic")) {
    const opts = meta.options ?? ["Yes", "No"];
    const rawOpt = typeof body.option === "string" ? body.option.trim() : "";
    if (!rawOpt) {
      return NextResponse.json({ error: "Pick an option or add your own wording." }, { status: 400 });
    }
    let canon: string;
    if (opts.includes(rawOpt)) {
      canon = rawOpt;
    } else if (isAllowedPollWriteIn(rawOpt, opts)) {
      canon = rawOpt;
    } else {
      return NextResponse.json({ error: "Invalid option" }, { status: 400 });
    }
    const allowedAgainst = new Set(opts);
    const binAgainst = sanitizeAgainstOptions(body.againstOptions, allowedAgainst).filter((x) => x !== canon);
    votes[writeKey] = bundlePickVote(canon, binAgainst);
  } else if (body.kind === "pick" && meta.kind === "pick") {
    const list = blob.restaurants?.length ? blob.restaurants : meta.restaurants ?? [];
    const ids = list.map((r) => r.id);
    const labels = meta.pickOptions ?? [];
    const rawPick = typeof body.option === "string" ? body.option.trim() : "";
    let canon: string;
    const allowAgainst =
      ids.length === 0 && meta.key !== BUDGET_POLL_DECISION_KEY && meta.key !== VENUE_POLL_DECISION_KEY;
    const against = allowAgainst
      ? sanitizeAgainstOptions(body.againstOptions, new Set(labels)).filter((x) => x !== rawPick)
      : [];

    if (ids.length > 0) {
      if (against.length || body.againstOptions != null) {
        return NextResponse.json({ error: "This poll doesn’t support mixed reactions here." }, { status: 400 });
      }
      if (!rawPick) return NextResponse.json({ error: "Invalid option" }, { status: 400 });
      if (ids.includes(rawPick)) canon = rawPick;
      else {
        const hit = list.find((r) => r.name === rawPick);
        if (!hit) return NextResponse.json({ error: "Invalid option" }, { status: 400 });
        canon = hit.id;
      }
    } else if (meta.key === TRANSPORT_POLL_DECISION_KEY && !labels.includes(rawPick)) {
      return NextResponse.json({ error: "Choose Fly or Drive." }, { status: 400 });
    } else if (labels.includes(rawPick)) {
      canon = rawPick;
    } else if (
      meta.key === BUDGET_POLL_DECISION_KEY &&
      ids.length === 0 &&
      (parseBudgetCustomAmountInput(rawPick) || isValidBudgetCustomVoteToken(rawPick))
    ) {
      const normalized = parseBudgetCustomAmountInput(rawPick) ?? rawPick.trim();
      if (!isValidBudgetCustomVoteToken(normalized)) {
        return NextResponse.json({ error: "Invalid option" }, { status: 400 });
      }
      canon = normalized;
    } else if (
      ids.length === 0 &&
      meta.key !== BUDGET_POLL_DECISION_KEY &&
      meta.key !== VENUE_POLL_DECISION_KEY &&
      isAllowedPollWriteIn(rawPick, labels)
    ) {
      canon = rawPick;
    } else {
      return NextResponse.json({ error: "Invalid option" }, { status: 400 });
    }

    votes[writeKey] = allowAgainst ? bundlePickVote(canon, against) : canon;
  } else if (body.kind === "hotel" && meta.kind === "hotel") {
    const ids = (blob.hotels ?? meta.hotels ?? []).map((h) => h.id);
    if (!ids.includes(body.hotelId)) {
      return NextResponse.json({ error: "Invalid hotel" }, { status: 400 });
    }
    votes[writeKey] = body.hotelId;
  } else if (body.kind === "people" && meta.kind === "people") {
    const names = plan.people.names;
    if (!names.includes(body.name)) {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }
    if (body.stance !== "in" && body.stance !== "maybe" && body.stance !== "out") {
      return NextResponse.json({ error: "Invalid RSVP" }, { status: 400 });
    }
    const baseRow = carriedPeople ?? ({} as Record<string, string>);
    votes[writeKey] = { ...baseRow, [body.name]: body.stance };
  } else {
    return NextResponse.json({ error: "Mismatched vote type" }, { status: 400 });
  }

  blob = { ...blob, votes };
  const skipAutoLockForConfirmedDates = meta.kind === "dates" && plan.dates.confirmed === true;
  if (!skipAutoLockForConfirmedDates) {
    blob = tryLockDecision(plan, meta, blob, quorum);
  }

  collab = {
    ...collab,
    decisions: { ...collab.decisions, [body.decisionKey]: blob },
  };

  const { error: upErr } = await svc
    .from("trip_plans")
    .update({ collab_state: collab, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (upErr) {
    console.error("[collab vote]", upErr);
    return NextResponse.json({ error: "Could not save vote" }, { status: 500 });
  }

  // When a member writes in a vibe/preference, generate AI recommendations in the background
  if (body.decisionKey === VIBE_POLL_DECISION_KEY && body.kind === "pick") {
    const rawVote = typeof body.option === "string" ? body.option.trim() : "";
    if (rawVote && rawVote.length > 3) {
      void (async () => {
        try {
          const displayName = await fetchAuthUserDisplayLabel(svc, user.id);
          await generateMemberRecommendations({
            tripId: id,
            userId: user.id,
            memberName: displayName,
            preferences: rawVote,
            plan,
            svc,
          });
        } catch (err) {
          console.warn("[collab vote] background recommendation generation failed:", err);
        }
      })();
    }
  }

  return NextResponse.json({ ok: true as const, collab });
}
