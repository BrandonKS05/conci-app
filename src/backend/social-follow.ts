import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SocialUser, UserProfilePayload } from "@/shared/social-profile";

type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  handle: string | null;
};

function slugHandle(seed: string): string {
  const base = seed
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  return base || "traveler";
}

export function resolveProfileHandle(
  profile: ProfileRow | null,
  emailLocal?: string | null,
  userId?: string
): string {
  if (profile?.handle?.trim()) return profile.handle.trim().toLowerCase();
  const fromName = profile?.display_name?.trim();
  if (fromName) return slugHandle(fromName);
  if (emailLocal?.trim()) return slugHandle(emailLocal.split("@")[0] ?? emailLocal);
  if (userId) return `user_${userId.slice(0, 8)}`;
  return "traveler";
}

async function fetchProfileRows(svc: SupabaseClient, ids: string[]): Promise<Map<string, ProfileRow>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, ProfileRow>();
  if (!unique.length) return map;

  const { data, error } = await svc.from("profiles").select("id, display_name, avatar_url, handle").in("id", unique);
  if (error) {
    console.warn("[social-follow] profiles lookup failed:", error.message);
    return map;
  }
  for (const row of data ?? []) {
    if (row?.id) map.set(row.id, row as ProfileRow);
  }
  return map;
}

async function fetchAuthEmails(svc: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const { data } = await svc.auth.admin.getUserById(id);
        const email = data.user?.email?.trim();
        if (email) map.set(id, email);
      } catch {
        /* ignore */
      }
    })
  );
  return map;
}

export async function mapIdsToSocialUsers(
  svc: SupabaseClient,
  ids: string[],
  viewerId: string,
  options?: { followingSet?: Set<string>; followsViewerSet?: Set<string>; mutualCounts?: Map<string, number> }
): Promise<SocialUser[]> {
  if (!ids.length) return [];
  const profiles = await fetchProfileRows(svc, ids);
  const emails = await fetchAuthEmails(svc, ids);

  return ids.map((id) => {
    const p = profiles.get(id) ?? null;
    const email = emails.get(id);
    return {
      id,
      name: p?.display_name?.trim() || email?.split("@")[0] || "Traveler",
      handle: resolveProfileHandle(p, email?.split("@")[0], id),
      avatarUrl: p?.avatar_url?.trim() || null,
      isFollowing: options?.followingSet?.has(id),
      followsYou: options?.followsViewerSet?.has(id),
      mutualCount: options?.mutualCounts?.get(id) ?? 0,
    };
  });
}

export async function getFollowCounts(
  svc: SupabaseClient,
  userId: string
): Promise<{ followers: number; following: number }> {
  const [followersRes, followingRes] = await Promise.all([
    svc.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", userId),
    svc.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", userId),
  ]);
  return {
    followers: followersRes.count ?? 0,
    following: followingRes.count ?? 0,
  };
}

async function viewerFollowsSet(svc: SupabaseClient, viewerId: string, targetIds: string[]): Promise<Set<string>> {
  if (!targetIds.length) return new Set();
  const { data } = await svc
    .from("follows")
    .select("following_id")
    .eq("follower_id", viewerId)
    .in("following_id", targetIds);
  return new Set((data ?? []).map((r) => r.following_id as string));
}

async function fetchFollowsViewerSet(svc: SupabaseClient, viewerId: string, actorIds: string[]): Promise<Set<string>> {
  if (!actorIds.length) return new Set();
  const { data } = await svc
    .from("follows")
    .select("follower_id")
    .eq("following_id", viewerId)
    .in("follower_id", actorIds);
  return new Set((data ?? []).map((r) => r.follower_id as string));
}

/** Users on trips with both viewer and each candidate (mutual trip connections). */
export async function mutualFriendsCountsBatch(
  svc: SupabaseClient,
  viewerId: string,
  candidateIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const id of candidateIds) out.set(id, 0);
  if (!candidateIds.length) return out;

  const { data: viewerTrips } = await svc.from("trip_memberships").select("trip_plan_id").eq("user_id", viewerId);
  const viewerTripIds = [...new Set((viewerTrips ?? []).map((r) => r.trip_plan_id as string).filter(Boolean))];
  if (!viewerTripIds.length) return out;

  const { data: viewerCoMembers } = await svc
    .from("trip_memberships")
    .select("user_id, trip_plan_id")
    .in("trip_plan_id", viewerTripIds);

  const candidateTripSets = new Map<string, Set<string>>();
  await Promise.all(
    candidateIds.map(async (cid) => {
      const { data: tTrips } = await svc.from("trip_memberships").select("trip_plan_id").eq("user_id", cid);
      candidateTripSets.set(cid, new Set((tTrips ?? []).map((r) => r.trip_plan_id as string).filter(Boolean)));
    })
  );

  for (const cid of candidateIds) {
    const theirTrips = candidateTripSets.get(cid) ?? new Set();
    const mutual = new Set<string>();
    for (const row of viewerCoMembers ?? []) {
      const uid = row.user_id as string;
      const tid = row.trip_plan_id as string;
      if (uid === viewerId || uid === cid) continue;
      if (!theirTrips.has(tid)) continue;
      mutual.add(uid);
    }
    out.set(cid, mutual.size);
  }
  return out;
}

export async function getUserProfile(
  svc: SupabaseClient,
  profileUserId: string,
  viewerId: string | null
): Promise<UserProfilePayload | null> {
  const profiles = await fetchProfileRows(svc, [profileUserId]);
  const p = profiles.get(profileUserId);
  if (!p && viewerId !== profileUserId) {
    const { data: authUser } = await svc.auth.admin.getUserById(profileUserId);
    if (!authUser.user) return null;
  }

  const emails = await fetchAuthEmails(svc, [profileUserId]);
  const email = emails.get(profileUserId);
  const counts = await getFollowCounts(svc, profileUserId);

  let isFollowing = false;
  let followsYouBack = false;
  if (viewerId && viewerId !== profileUserId) {
    const [fOut, fIn] = await Promise.all([
      svc
        .from("follows")
        .select("following_id")
        .eq("follower_id", viewerId)
        .eq("following_id", profileUserId)
        .maybeSingle(),
      svc
        .from("follows")
        .select("follower_id")
        .eq("follower_id", profileUserId)
        .eq("following_id", viewerId)
        .maybeSingle(),
    ]);
    isFollowing = Boolean(fOut.data);
    followsYouBack = Boolean(fIn.data);
  }

  const isSelf = viewerId === profileUserId;
  const showFollowBack = !isSelf && !isFollowing && followsYouBack;

  return {
    id: profileUserId,
    name: p?.display_name?.trim() || email?.split("@")[0] || "Traveler",
    handle: resolveProfileHandle(p ?? null, email?.split("@")[0], profileUserId),
    avatarUrl: p?.avatar_url?.trim() || null,
    followerCount: counts.followers,
    followingCount: counts.following,
    isFollowing,
    followsYouBack,
    showFollowBack,
    isSelf,
  };
}

export async function listFollowers(
  svc: SupabaseClient,
  profileUserId: string,
  viewerId: string | null
): Promise<SocialUser[]> {
  const { data } = await svc
    .from("follows")
    .select("follower_id, created_at")
    .eq("following_id", profileUserId)
    .order("created_at", { ascending: false })
    .limit(200);

  const ids = (data ?? []).map((r) => r.follower_id as string);
  if (!viewerId) {
    return mapIdsToSocialUsers(svc, ids, profileUserId);
  }

  const [followingSet, followsYouSet, mutualCounts] = await Promise.all([
    viewerFollowsSet(svc, viewerId, ids),
    fetchFollowsViewerSet(svc, viewerId, ids),
    mutualFriendsCountsBatch(svc, viewerId, ids),
  ]);

  return mapIdsToSocialUsers(svc, ids, viewerId, { followingSet, followsViewerSet: followsYouSet, mutualCounts });
}

export async function listFollowing(
  svc: SupabaseClient,
  profileUserId: string,
  viewerId: string | null
): Promise<SocialUser[]> {
  const { data } = await svc
    .from("follows")
    .select("following_id, created_at")
    .eq("follower_id", profileUserId)
    .order("created_at", { ascending: false })
    .limit(200);

  const ids = (data ?? []).map((r) => r.following_id as string);
  if (!viewerId) {
    return mapIdsToSocialUsers(svc, ids, profileUserId);
  }

  const [followingSet, followsYouSet, mutualCounts] = await Promise.all([
    viewerFollowsSet(svc, viewerId, ids),
    fetchFollowsViewerSet(svc, viewerId, ids),
    mutualFriendsCountsBatch(svc, viewerId, ids),
  ]);

  return mapIdsToSocialUsers(svc, ids, viewerId, { followingSet, followsViewerSet: followsYouSet, mutualCounts });
}

export async function listSuggested(
  svc: SupabaseClient,
  profileUserId: string,
  viewerId: string
): Promise<SocialUser[]> {
  const { data: myTrips } = await svc.from("trip_memberships").select("trip_plan_id").eq("user_id", viewerId);
  const tripIds = [...new Set((myTrips ?? []).map((r) => r.trip_plan_id as string).filter(Boolean))];
  if (!tripIds.length) return [];

  const { data: coMembers } = await svc
    .from("trip_memberships")
    .select("user_id")
    .in("trip_plan_id", tripIds);

  const candidateSet = new Set<string>();
  for (const row of coMembers ?? []) {
    const uid = row.user_id as string;
    if (uid && uid !== viewerId && uid !== profileUserId) candidateSet.add(uid);
  }

  const candidates = [...candidateSet];
  if (!candidates.length) return [];

  const { data: already } = await svc
    .from("follows")
    .select("following_id")
    .eq("follower_id", viewerId)
    .in("following_id", candidates);

  const followingSet = new Set((already ?? []).map((r) => r.following_id as string));
  const toSuggest = candidates.filter((id) => !followingSet.has(id));
  if (!toSuggest.length) return [];

  const [mutualCounts, followsYouSet] = await Promise.all([
    mutualFriendsCountsBatch(svc, viewerId, toSuggest),
    fetchFollowsViewerSet(svc, viewerId, toSuggest),
  ]);

  const users = await mapIdsToSocialUsers(svc, toSuggest, viewerId, {
    followingSet: new Set(),
    followsViewerSet: followsYouSet,
    mutualCounts,
  });

  return users.sort((a, b) => (b.mutualCount ?? 0) - (a.mutualCount ?? 0));
}

export async function followUser(
  svc: SupabaseClient,
  followerId: string,
  followingId: string
): Promise<{ ok: true } | { error: string }> {
  if (followerId === followingId) return { error: "Cannot follow yourself." };
  const { error } = await svc.from("follows").insert({ follower_id: followerId, following_id: followingId });
  if (error) {
    if (error.code === "23505") return { ok: true };
    return { error: error.message };
  }
  return { ok: true };
}

export async function unfollowUser(
  svc: SupabaseClient,
  followerId: string,
  followingId: string
): Promise<{ ok: true } | { error: string }> {
  const { error } = await svc
    .from("follows")
    .delete()
    .eq("follower_id", followerId)
    .eq("following_id", followingId);
  if (error) return { error: error.message };
  return { ok: true };
}
