import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { allocateUniqueInviteCode, formatInviteCodeDisplay } from "@/backend/invite-code";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { fetchSubscriptionTierForUser, userCanCreateTrips } from "@/backend/subscription-tier";
import { ensureHostMembership } from "@/backend/trip-memberships";
import {
  normalizePlan,
  parseHostSetup,
  planHasUsableTripTiming,
  planRecordWithDatesSyncedToTripRange,
  tripRangeForHostDraftSave,
} from "@/shared/trip-plan";

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

export async function POST(request: Request) {
  const supabase = await createAuthServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: "Unauthorized", detail: "Sign in to save a trip plan." },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    plan?: unknown;
    seedText?: string | null;
    /** When true: save as draft without minting an invite (host setup dashboard next). */
    hostSetupDraft?: boolean;
  };

  if (!body.plan || typeof body.plan !== "object") {
    return NextResponse.json({ error: "Field `plan` is required." }, { status: 400 });
  }

  const normalizedPlan = normalizePlan(body.plan);
  if (!planHasUsableTripTiming(normalizedPlan)) {
    return NextResponse.json(
      {
        error: "Rough trip timing required",
        detail: "Add a month, season, or date window so schedules and polls can anchor.",
      },
      { status: 400 }
    );
  }

  const id = body.id && typeof body.id === "string" && isUuid(body.id) ? body.id : randomUUID();
  const seedText = typeof body.seedText === "string" ? body.seedText : null;

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json(
      {
        error: "Server misconfigured",
        detail: "SUPABASE_SERVICE_ROLE_KEY is required to save trip plans and invite codes.",
      },
      { status: 503 }
    );
  }

  const { data: existing } = await svc
    .from("trip_plans")
    .select("user_id, invite_code, status")
    .eq("id", id)
    .maybeSingle();

  const isNewTrip = !existing;
  if (isNewTrip) {
    const tier = await fetchSubscriptionTierForUser(svc, user.id);
    if (!userCanCreateTrips(tier)) {
      return NextResponse.json(
        {
          error: "Subscription required",
          code: "subscription_required",
          detail:
            "You're on the free plan — upgrade to Host or Host Pro to create and share trips.",
        },
        { status: 402 }
      );
    }
  }

  if (existing?.user_id && existing.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden", detail: "This trip belongs to another account." }, { status: 403 });
  }

  const existingCode =
    typeof existing?.invite_code === "string" && existing.invite_code.replace(/\s/g, "").length > 0
      ? existing.invite_code.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6)
      : undefined;

  const existingStatus = typeof existing?.status === "string" ? existing.status : null;
  const hostSetupDraft = body.hostSetupDraft === true;
  const finalized = existingStatus === "finalized";

  let codeToSave: string | null =
    existingCode?.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6) ?? null;
  if (codeToSave && codeToSave.length !== 6) codeToSave = null;

  if (!codeToSave && !hostSetupDraft && !finalized) {
    try {
      const raw = await allocateUniqueInviteCode(svc);
      codeToSave = String(raw).replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
    } catch (e) {
      console.error("[Conci] allocate invite code failed:", e);
      return NextResponse.json({ error: "Could not allocate invite code." }, { status: 500 });
    }
  }

  if (!hostSetupDraft && !finalized && (!codeToSave || codeToSave.length !== 6)) {
    console.error("[trip-plans POST] invalid invite_code after normalize:", codeToSave);
    return NextResponse.json({ error: "Invalid invite code state." }, { status: 500 });
  }

  const nextStatus =
    finalized ? "finalized" : hostSetupDraft ? "draft" : "voting";

  let planForSave = normalizedPlan;
  if (hostSetupDraft) {
    const tripRange = tripRangeForHostDraftSave(normalizedPlan, new Date().getFullYear());
    console.log("[host-setup-draft] plan.dates.options:", normalizedPlan.dates.options);
    console.log("[host-setup-draft] tripRange result:", tripRange);

    const baseHs = parseHostSetup(normalizedPlan.hostSetup) ?? {};
    if (tripRange && !baseHs.tripRange?.startIso) {
      let raw: Record<string, unknown> = {
        ...(normalizedPlan as unknown as Record<string, unknown>),
        hostSetup: { ...baseHs, tripRange },
      };
      raw = planRecordWithDatesSyncedToTripRange(raw, tripRange);
      planForSave = normalizePlan(raw);
    }
  }

  const row = {
    id,
    plan: planForSave,
    seed_text: seedText,
    user_id: user.id,
    invite_code: codeToSave as string | null,
    status: nextStatus,
    updated_at: new Date().toISOString(),
  };

  console.log("[trip-plans POST] upsert payload", {
    hostSetupDraft,
    hasInviteCode: Boolean(codeToSave),
    invite_code: codeToSave,
    status: nextStatus,
    keys: Object.keys(row),
    "plan.hostSetup.tripRange": planForSave.hostSetup?.tripRange ?? null,
    planHostSetupKeys: planForSave.hostSetup ? Object.keys(planForSave.hostSetup) : [],
  });

  const { data, error } = await svc.from("trip_plans").upsert(row, { onConflict: "id" }).select("id, invite_code").single();

  if (error) {
    console.error("[Conci Supabase] trip_plans upsert failed:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.code === "PGRST116" || error.message.includes("relation") ? 503 : 400 }
    );
  }

  // Confirm what Postgres actually stored (upsert return can omit columns if schema cache is stale).
  const { data: fromDb, error: verifyErr } = await svc
    .from("trip_plans")
    .select("id, invite_code")
    .eq("id", id)
    .single();

  if (verifyErr) {
    console.error("[trip-plans POST] post-save read failed:", verifyErr.message);
  }

  let persistedCode = typeof fromDb?.invite_code === "string" ? fromDb.invite_code : null;
  if (codeToSave && (!persistedCode || persistedCode !== codeToSave)) {
    const { error: patchErr } = await svc.from("trip_plans").update({ invite_code: codeToSave }).eq("id", id);
    if (patchErr) {
      console.error("[trip-plans POST] invite_code repair update failed:", patchErr.message);
    } else {
      const { data: again } = await svc.from("trip_plans").select("id, invite_code").eq("id", id).single();
      persistedCode = typeof again?.invite_code === "string" ? again.invite_code : codeToSave;
    }
  }

  const savedCode =
    persistedCode ?? (typeof data?.invite_code === "string" ? data.invite_code : codeToSave ?? null);

  console.log("[trip-plans POST] invite_code written to Supabase", {
    tripId: id,
    upsertReturned: data,
    rowReadAfterSave: fromDb,
    finalInviteCode: savedCode,
    display: savedCode ? formatInviteCodeDisplay(savedCode) : null,
  });

  try {
    await ensureHostMembership(svc, id, user.id);
  } catch (e) {
    console.error("[trip-plans POST] ensureHostMembership failed:", e);
  }

  return NextResponse.json({
    id: data?.id ?? id,
    inviteCode: savedCode ?? null,
    status: nextStatus,
  });
}
