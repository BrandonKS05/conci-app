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

  const { data, error } = await svc
    .from("trip_plans")
    .select("id, invite_code")
    .in("invite_code", candidates)
    .limit(1)
    .maybeSingle();

  if (error) throwPostgrest(error, "Invite code lookup failed.");
  if (data?.id) return { id: data.id as string };
  return null;
}
