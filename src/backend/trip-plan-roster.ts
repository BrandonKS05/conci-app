import type { SupabaseClient } from "@supabase/supabase-js";
import { aliasesForParticipant, voteKeysIntersectAliases } from "@/shared/collab-vote-keys";
import type { ClassifiedDecision, CollabStateV1 } from "@/shared/collaboration";
import type { TripMemberRole, TripRosterPerson } from "@/shared/trip-roster";
import { fetchDisplayNameMap } from "@/backend/trip-member-names";

function blobVoteKeysAcrossPlan(classified: ClassifiedDecision[], collab: CollabStateV1): Map<string, string[]> {
  const byDecision = new Map<string, string[]>();
  for (const c of classified) {
    const blob = collab.decisions[c.key];
    const keys = blob?.votes ? Object.keys(blob.votes as Record<string, unknown>) : [];
    if (c.kind === "dates" && blob?.dateWorksForMe) {
      for (const k of Object.keys(blob.dateWorksForMe)) {
        if (!keys.includes(k)) keys.push(k);
      }
    }
    byDecision.set(c.key, keys);
  }
  return byDecision;
}

/** Roster from `trip_memberships` + auth user ids used as collab `member:<uuid>` vote keys. */
export async function fetchTripPlanRoster(
  svc: SupabaseClient,
  tripPlanId: string,
  collab: CollabStateV1,
  classified: ClassifiedDecision[]
): Promise<TripRosterPerson[]> {
  const byDecision = blobVoteKeysAcrossPlan(classified, collab);

  function participated(personAliases: Set<string>): boolean {
    for (const c of classified) {
      const keys = byDecision.get(c.key) ?? [];
      if (voteKeysIntersectAliases(keys, personAliases)) return true;
    }
    return false;
  }

  const { data: rows, error } = await svc
    .from("trip_memberships")
    .select("user_id, role, joined_at")
    .eq("trip_plan_id", tripPlanId);

  if (error) {
    console.error("[trip-plan-roster] memberships", error.message);
    return [];
  }

  const { data: planMeta } = await svc.from("trip_plans").select("user_id").eq("id", tripPlanId).maybeSingle();
  const ownerId = typeof planMeta?.user_id === "string" ? planMeta.user_id : null;
  const seenUser = new Set((rows ?? []).map((r) => r.user_id as string).filter(Boolean));
  const effectiveRows =
    ownerId && !seenUser.has(ownerId)
      ? [
          ...(rows ?? []),
          { user_id: ownerId, role: "host" as const, joined_at: new Date().toISOString() },
        ]
      : [...(rows ?? [])];

  const userIds = [...new Set(effectiveRows.map((r) => r.user_id as string).filter(Boolean))];
  const displayByUser = await fetchDisplayNameMap(svc, userIds);

  const roster: TripRosterPerson[] = [];
  for (const row of effectiveRows) {
    const uid = row.user_id as string;
    if (!uid) continue;
    const aliasSet = aliasesForParticipant(uid, []);
    const voteAliases = [...aliasSet];
    const rawRole = row.role as string | undefined;
    const memberRole: TripMemberRole =
      rawRole === "host" ? "host" : rawRole === "co-host" ? "co-host" : "member";
    const effectiveRole: TripMemberRole = uid === ownerId ? "host" : memberRole;
    roster.push({
      kind: "member",
      memberId: uid,
      guestVisitorKey: null,
      displayName: displayByUser.get(uid) ?? "Traveler",
      voteAliases,
      maskedContact: null,
      hasParticipated: participated(aliasSet),
      role: effectiveRole,
    });
  }

  roster.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }));
  return roster;
}
