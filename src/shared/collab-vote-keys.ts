/** Stored in collab_state decision blobs; roster maps these keys to travelers. */

export const MEMBER_VOTE_PREFIX = "member:";
export const VISITOR_VOTE_PREFIX = "visitor:";

export function memberVoteKey(memberId: string): string {
  return `${MEMBER_VOTE_PREFIX}${memberId}`;
}

export function visitorVoteKey(visitorKey: string): string {
  return `${VISITOR_VOTE_PREFIX}${visitorKey}`;
}

export function resolveCanonicalVoterKey(visitorKey: string, memberId: string | null): string {
  return memberId ? memberVoteKey(memberId) : visitorVoteKey(visitorKey);
}

export function canonicalVoteAliases(key: string): string[] {
  if (key.startsWith(MEMBER_VOTE_PREFIX)) return [key];
  if (key.startsWith(VISITOR_VOTE_PREFIX)) {
    const bare = key.slice(VISITOR_VOTE_PREFIX.length);
    return bare ? [key, bare] : [key];
  }
  const bare = key;
  return [visitorVoteKey(bare), bare];
}

export function aliasesForParticipant(memberId: string | null | undefined, visitorKeys: Iterable<string>): Set<string> {
  const set = new Set<string>();
  for (const vk of visitorKeys) {
    for (const a of canonicalVoteAliases(visitorVoteKey(vk))) set.add(a);
  }
  if (memberId) {
    set.add(memberVoteKey(memberId));
  }
  return set;
}

export function voteKeysIntersectAliases(blobVoteKeys: string[], aliases: Set<string>): boolean {
  for (const k of blobVoteKeys) {
    for (const canon of canonicalVoteAliases(k)) {
      if (aliases.has(canon)) return true;
    }
  }
  return false;
}

/**
 * Drops legacy/per-alias keys for this browser + member identity; returns payload carried from those keys (if any).
 * Caller writes the NEW vote onto `writeKey` afterward.
 */
export function migrateVoterVoteKeys(
  votes: Record<string, unknown>,
  visitorKey: string,
  memberId: string | null,
  isPeopleMerge: boolean
): {
  votes: Record<string, unknown>;
  writeKey: string;
  carriedPeople?: Record<string, string>;
  carriedScalar?: unknown;
} {
  const rk: string[] = [];
  if (memberId) rk.push(memberVoteKey(memberId));
  rk.push(visitorVoteKey(visitorKey));
  rk.push(visitorKey);

  let carriedPeople: Record<string, string> | undefined;
  let carriedScalar: unknown;

  if (isPeopleMerge) {
    const merged: Record<string, string> = {};
    for (const k of rk) {
      if (!Object.prototype.hasOwnProperty.call(votes, k)) continue;
      const v = votes[k];
      if (v && typeof v === "object" && !Array.isArray(v)) {
        Object.assign(merged, v as Record<string, string>);
      }
    }
    if (Object.keys(merged).length > 0) carriedPeople = merged;
  } else {
    for (const k of rk) {
      if (Object.prototype.hasOwnProperty.call(votes, k)) {
        carriedScalar = votes[k];
        break;
      }
    }
  }

  const next = { ...votes };
  for (const k of rk) {
    delete next[k];
  }

  const writeKey = resolveCanonicalVoterKey(visitorKey, memberId);
  return { votes: next, writeKey, carriedPeople, carriedScalar };
}
