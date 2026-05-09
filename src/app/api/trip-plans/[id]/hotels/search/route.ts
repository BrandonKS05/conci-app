import { NextResponse } from "next/server";
import {
  getRapidApiKeyDiagnostics,
  isRapidApiHotelsConfigured,
  rapidApiRelatedEnvKeys,
} from "@/backend/rapidapi-key";
import { searchHotelsForTrip } from "@/backend/rapidapi-hotels";
import { fetchTripPlanRowForCollab } from "@/backend/trip-plan-collab-fetch";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { buildClassifiedDecisions, datesGroupResolved, parseCollabState } from "@/shared/collaboration";
import { normalizePlan } from "@/shared/trip-plan";
import { isUuid } from "@/shared/is-uuid";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { resolveTripAccess } from "@/backend/trip-memberships";

/** Node.js runtime — ensures `.env.local` server vars (e.g. RAPIDAPI_KEY) are available; Edge would not load them the same way. */
export const runtime = "nodejs";

/** Safe summary: never log the full API key. */
function envLineSummary(label: string, v: string | undefined): Record<string, string | number | boolean> {
  if (v === undefined) return { label, state: "undefined" };
  if (v === "") return { label, state: "empty_string", length: 0 };
  return {
    label,
    state: "set",
    length: v.length,
    firstCharCode: v.charCodeAt(0),
    last4: JSON.stringify(v.slice(-4)),
  };
}

/** Compare dot vs bracket access — helps catch bundler / env oddities. */
function logProcessEnvRapidProbe(phase: string) {
  const dotRapid = process.env.RAPIDAPI_KEY;
  const bracketRapid = process.env["RAPIDAPI_KEY"];
  const dotAlt = process.env.RAPID_API_KEY;
  const bracketAlt = process.env["RAPID_API_KEY"];

  console.info(`[hotels/search] process.env RapidAPI probe (${phase})`, {
    cwd: process.cwd(),
    nodeEnv: process.env.NODE_ENV,
    process_env_RAPIDAPI_KEY: envLineSummary("RAPIDAPI_KEY", dotRapid),
    process_env_bracket_RAPIDAPI_KEY: envLineSummary('["RAPIDAPI_KEY"]', bracketRapid),
    dotEqualsBracket_RAPIDAPI_KEY: dotRapid === bracketRapid,
    process_env_RAPID_API_KEY: envLineSummary("RAPID_API_KEY", dotAlt),
    process_env_bracket_RAPID_API_KEY: envLineSummary('["RAPID_API_KEY"]', bracketAlt),
    relatedEnvVarNames: rapidApiRelatedEnvKeys(),
  });
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  logProcessEnvRapidProbe("start");

  const { id } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid trip id." }, { status: 400 });
  }

  const auth = await createAuthServerClient();
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const decisionKey = new URL(req.url).searchParams.get("decisionKey") ?? "";
  if (!decisionKey) {
    return NextResponse.json({ error: "Query parameter decisionKey is required." }, { status: 400 });
  }

  const keyDiag = getRapidApiKeyDiagnostics();
  const relatedEnv = rapidApiRelatedEnvKeys();

  if (!isRapidApiHotelsConfigured()) {
    console.warn("[hotels/search] RAPIDAPI_KEY missing — request blocked", {
      tripId: id,
      decisionKey,
      rapidApiKeyPresent: keyDiag.present,
      rapidApiKeySource: keyDiag.source,
      rapidApiKeyLength: keyDiag.keyLength,
      matchedRawKeyNameIfBom: keyDiag.matchedRawKeyName,
      envVarNamesContainingRapid: relatedEnv.length ? relatedEnv : "(none)",
      hint: "Set RAPIDAPI_KEY or RAPID_API_KEY in .env.local at project root (next to package.json), then restart npm run dev.",
    });
    return NextResponse.json(
      {
        error: "RapidAPI is not configured.",
        detail:
          "Add RAPIDAPI_KEY to .env.local in the project root (same folder as package.json), then restart the dev server (npm run dev). Subscribe to booking-com15 on RapidAPI (host booking-com15.p.rapidapi.com) and paste your app key.",
      },
      { status: 503 }
    );
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    console.error("[hotels/search] SUPABASE_SERVICE_ROLE_KEY missing — cannot persist hotel results", {
      tripId: id,
      decisionKey,
      rapidApiKeyDiagnostics: keyDiag,
    });
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "You don't have access to this trip." }, { status: 403 });
  }

  const { row, error: fetchErr } = await fetchTripPlanRowForCollab(svc, id);
  if (fetchErr || !row?.plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const plan = normalizePlan(row.plan);
  const classified = buildClassifiedDecisions(plan);
  const meta = classified.find((c) => c.key === decisionKey);
  if (!meta || meta.kind !== "hotel") {
    return NextResponse.json({ error: "Not a hotel decision for this plan." }, { status: 400 });
  }

  const collabForDates = parseCollabState(row.collab_state);
  if (!datesGroupResolved(plan, classified, collabForDates)) {
    return NextResponse.json(
      {
        error: "Pick dates first.",
        detail: "Lock a weekend so nightly rates match your stay.",
      },
      { status: 400 }
    );
  }

  console.info("[hotels/search] starting RapidAPI hotel search", {
    tripId: id,
    decisionKey,
    rapidApiKeyPresent: keyDiag.present,
    rapidApiKeySource: keyDiag.source,
    rapidApiKeySuffix: keyDiag.keySuffix,
    planTitle: plan.title,
    planLocation: plan.location,
  });

  let hotels;
  try {
    hotels = await searchHotelsForTrip(plan);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Hotel search failed.";
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[hotels/search] searchHotelsForTrip threw", {
      tripId: id,
      decisionKey,
      errorMessageFull: msg,
      stack,
      rapidApiKeyDiagnostics: keyDiag,
    });
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const collab = collabForDates;
  const prev = collab.decisions[decisionKey] ?? { kind: "hotel" as const, votes: {} };
  collab.decisions[decisionKey] = {
    ...prev,
    kind: "hotel",
    votes: prev.votes ?? {},
    hotels,
  };

  const { error: upErr } = await svc
    .from("trip_plans")
    .update({ collab_state: collab, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (upErr) {
    console.error("[hotels/search] persist collab_state failed:", upErr.message);
    return NextResponse.json({ error: "Could not save hotel options." }, { status: 500 });
  }

  return NextResponse.json({ hotels, decisionKey });
}
