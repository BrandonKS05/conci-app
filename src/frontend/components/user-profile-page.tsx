"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppTopNav } from "@/frontend/components/app-top-nav";
import { ProfileHeaderCard } from "@/frontend/components/profile/profile-header-card";
import { ProfileHotelsSection } from "@/frontend/components/profile/profile-hotels-section";
import { ProfileExperiencesSection } from "@/frontend/components/profile/profile-experiences-section";
import { ProfileRecentTripsSection } from "@/frontend/components/profile/profile-recent-trips";
import { ProfileRestaurantsSection } from "@/frontend/components/profile/profile-restaurants-section";
import { ProfileVisitsDrawer } from "@/frontend/components/profile/profile-visits-drawer";
import { ProfileSocialDrawer } from "@/frontend/components/profile-social-drawer";
import { getSupabaseClient } from "@/frontend/supabase/client";
import type { FullUserProfilePayload } from "@/shared/user-profile-page";

export function UserProfilePageClient({ userId }: { userId: string }) {
  const router = useRouter();
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [profile, setProfile] = useState<FullUserProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [confirmUnfollow, setConfirmUnfollow] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [visitsOpen, setVisitsOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"followers" | "following" | "suggested">("followers");
  const [saveBusy, setSaveBusy] = useState(false);
  const pendingPatch = useRef<Record<string, unknown>>({});

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/profile/${userId}`, { credentials: "include" });
      if (res.status === 401) {
        router.replace(`/auth?next=${encodeURIComponent(`/profile/${userId}`)}`);
        return;
      }
      const j = (await res.json()) as FullUserProfilePayload & { error?: string };
      if (!res.ok) {
        setError(j.error || "Profile not found.");
        setProfile(null);
        return;
      }
      setProfile(j);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [userId, router]);

  useEffect(() => {
    const sb = getSupabaseClient();
    void sb?.auth.getUser().then(({ data }) => setViewerId(data.user?.id ?? null));
    void loadProfile();
  }, [loadProfile]);

  async function patchProfile(body: Record<string, unknown>) {
    setSaveBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { profile?: FullUserProfilePayload; error?: string };
      if (!res.ok) {
        setError(j.error || "Could not save profile.");
        return;
      }
      if (j.profile) setProfile(j.profile);
      else void loadProfile();
    } catch {
      setError("Could not save profile.");
    } finally {
      setSaveBusy(false);
    }
  }

  function queueFieldPatch(patch: Record<string, unknown>) {
    pendingPatch.current = { ...pendingPatch.current, ...patch };
    if (profile) {
      setProfile({
        ...profile,
        ...(patch.displayName !== undefined ? { name: String(patch.displayName) } : {}),
        ...(patch.handle !== undefined ? { handle: String(patch.handle) } : {}),
        ...(patch.bio !== undefined ? { bio: String(patch.bio) } : {}),
        ...(patch.location !== undefined ? { location: String(patch.location) } : {}),
        ...(patch.avatarUrl !== undefined ? { avatarUrl: patch.avatarUrl as string | null } : {}),
        ...(patch.bannerUrl !== undefined ? { bannerUrl: patch.bannerUrl as string | null } : {}),
      });
    }
  }

  async function flushPendingPatch() {
    const body = pendingPatch.current;
    pendingPatch.current = {};
    if (Object.keys(body).length === 0) return;
    await patchProfile(body);
  }

  async function toggleFollow() {
    if (!profile || profile.isSelf || followBusy) return;
    if (profile.isFollowing && !confirmUnfollow) {
      setConfirmUnfollow(true);
      return;
    }
    setFollowBusy(true);
    setConfirmUnfollow(false);
    const wasFollowing = profile.isFollowing;
    setProfile((p) =>
      p
        ? {
            ...p,
            isFollowing: !wasFollowing,
            followerCount: Math.max(0, p.followerCount + (wasFollowing ? -1 : 1)),
            showFollowBack: false,
          }
        : p
    );
    try {
      if (wasFollowing) {
        const res = await fetch(`/api/follow?userId=${encodeURIComponent(profile.id)}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) void loadProfile();
      } else {
        const res = await fetch("/api/follow", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: profile.id }),
        });
        if (!res.ok) void loadProfile();
      }
    } catch {
      void loadProfile();
    } finally {
      setFollowBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#141414]">
        <AppTopNav />
        <main className="mx-auto max-w-2xl px-4 py-12 text-sm text-neutral-500">Loading profile…</main>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#141414]">
        <AppTopNav />
        <main className="mx-auto max-w-2xl px-4 py-12">
          <p className="text-sm text-rose-600">{error ?? "Profile not found."}</p>
          <Link href="/my-trips" className="mt-4 inline-block text-sm font-semibold text-[#2563EB]">
            Back to trips
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-[#141414] dark:text-[#ebe9e4]">
      <AppTopNav />
      <main className="mx-auto max-w-2xl px-4 pb-8 pt-8 sm:px-6">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-neutral-900 dark:text-white sm:text-[2.75rem]">
          @{profile.handle}
        </h1>

        <div className="mt-6">
          <ProfileHeaderCard
            profile={profile}
            editMode={editMode}
            onEditToggle={() => {
              if (editMode) void flushPendingPatch();
              setEditMode((v) => !v);
            }}
            onOpenDrawer={(tab) => {
              setDrawerTab(tab);
              setDrawerOpen(true);
            }}
            onOpenVisits={() => setVisitsOpen(true)}
            onFollowToggle={() => void toggleFollow()}
            followBusy={followBusy}
            confirmUnfollow={confirmUnfollow}
            setConfirmUnfollow={setConfirmUnfollow}
            onProfileFieldChange={(patch) => queueFieldPatch(patch)}
            onMediaUpdated={(patch) => {
              queueFieldPatch(patch);
              void patchProfile(patch);
            }}
          />
        </div>

        {saveBusy ? <p className="mt-2 text-center text-xs text-neutral-400">Saving…</p> : null}

        <ProfileRecentTripsSection trips={profile.recentTrips} isSelf={profile.isSelf} />

        <ProfileHotelsSection
          hotels={profile.hotels}
          editMode={editMode && profile.isSelf}
          isSelf={profile.isSelf}
          onSave={async (hotels) => patchProfile({ hotels })}
        />

        <ProfileExperiencesSection
          experiences={profile.experiences}
          editMode={editMode && profile.isSelf}
          isSelf={profile.isSelf}
          onSave={async (experiences) => patchProfile({ experiences })}
        />

        <ProfileRestaurantsSection
          restaurants={profile.restaurants}
          editMode={editMode && profile.isSelf}
          isSelf={profile.isSelf}
          onSave={async (restaurants) => patchProfile({ restaurants })}
        />
      </main>

      <ProfileSocialDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        profileUserId={profile.id}
        viewerId={viewerId}
        initialTab={drawerTab}
        onCountsChange={() => void loadProfile()}
      />

      <ProfileVisitsDrawer open={visitsOpen} onClose={() => setVisitsOpen(false)} trips={profile.recentTrips} />
    </div>
  );
}
