import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInviteCodeDisplay } from "@/backend/invite-code";
import { throwPostgrest } from "@/backend/supabase-errors";

/**
 * Resolves a trip id from `trip_plans.invite_code`.
 * Stored codes are usually 6 chars without hyphen (e.g. XACJL7); users may type AAA-BBB.
 */
export async function findTripPlanIdByInviteCode(
  svc: SupabaseClient,
  normalizedSix: string
): Promise<{ id: string } | null> {
  if (normalizedSix.length !== 6) {
    console.log("[invite-lookup] skip: need 6 alphanumeric chars after normalize", {
      normalizedSix,
      length: normalizedSix.length,
    });
    return null;
  }

  const hyphenVariant = formatInviteCodeDisplay(normalizedSix);
  const candidates = Array.from(
    new Set(
      [normalizedSix, hyphenVariant, normalizedSix.toLowerCase(), hyphenVariant.toLowerCase()].filter(
        (c) => typeof c === "string" && c.length > 0
      )
    )
  );

  console.log("[invite-lookup] query", {
    table: "public.trip_plans",
    column: "invite_code",
    operator: "in",
    candidates,
  });

  const { data, error } = await svc
    .from("trip_plans")
    .select("id, invite_code")
    .in("invite_code", candidates)
    .limit(1)
    .maybeSingle();

  console.log("[invite-lookup] supabase response", {
    found: Boolean(data?.id),
    tripId: data?.id ?? null,
    matchedStoredCode: typeof (data as { invite_code?: string } | null)?.invite_code === "string"
      ? (data as { invite_code: string }).invite_code
      : null,
    errorMessage: error?.message ?? null,
    errorCode: error?.code ?? null,
    errorDetails: error?.details ?? null,
  });

  if (error) throwPostgrest(error, "Invite code lookup failed.");
  if (data?.id) return { id: data.id as string };
  return null;
}
