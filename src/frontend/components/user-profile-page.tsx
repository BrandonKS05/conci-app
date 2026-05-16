"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ProfileSocialDrawer } from "@/frontend/components/profile-social-drawer";
import { SiteShell } from "@/frontend/components/site-shell";
import type { UserProfilePayload } from "@/shared/social-profile";
import { getSupabaseClient } from "@/frontend/supabase/client";

export function UserProfilePageClient({ userId }: { userId: string }) {
  const router = useRouter();
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [confirmUnfollow, setConfirmUnfollow] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"followers" | "following" | "suggested">("followers");

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/profile/${userId}`, { credentials: "include" });
      if (res.status === 401) {
        router.replace(`/auth?next=${encodeURIComponent(`/profile/${userId}`)}`);
        return;
      }
      const j = (await res.json()) as UserProfilePayload & { error?: string };
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

  function openDrawer(tab: "followers" | "following" | "suggested") {
    setDrawerTab(tab);
    setDrawerOpen(true);
  }

  if (loading) {
    return (
      <SiteShell title="Profile" eyebrow="Traveler">
        <p className="text-sm text-[color:var(--on-surface-muted)]">Loading profile…</p>
      </SiteShell>
    );
  }

  if (error || !profile) {
    return (
      <SiteShell title="Profile" eyebrow="Traveler">
        <p className="text-sm text-rose-600">{error ?? "Profile not found."}</p>
        <Link href="/my-trips" className="mt-4 inline-block text-sm font-semibold text-[#2563EB]">
          Back to trips
        </Link>
      </SiteShell>
    );
  }

  return (
    <SiteShell title={profile.name} eyebrow="Profile">
      <div className="mx-auto max-w-2xl pb-16">
        <section className="rounded-3xl border border-[color:var(--hairline)] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-[color:var(--hairline)] bg-[color:var(--surface-container)] dark:border-white/10 dark:bg-dm-elevated">
              {profile.avatarUrl ? (
                <Image src={profile.avatarUrl} alt="" fill className="object-cover" unoptimized />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-2xl font-semibold text-[color:var(--on-surface-muted)]">
                  {profile.name.slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="font-display text-2xl font-semibold text-[color:var(--on-surface)] dark:text-white">
                {profile.name}
              </h2>
              <p className="mt-0.5 text-sm text-[color:var(--on-surface-muted)]">@{profile.handle}</p>
              {profile.followsYouBack && !profile.isSelf ? (
                <p className="mt-1 text-xs font-medium text-[color:var(--on-surface-muted)]">Follows you</p>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
                <button
                  type="button"
                  onClick={() => openDrawer("followers")}
                  className="font-semibold text-[color:var(--on-surface)] hover:underline dark:text-white"
                >
                  <span className="tabular-nums">{profile.followerCount.toLocaleString()}</span>{" "}
                  <span className="font-normal text-[color:var(--on-surface-muted)]">followers</span>
                </button>
                <button
                  type="button"
                  onClick={() => openDrawer("following")}
                  className="font-semibold text-[color:var(--on-surface)] hover:underline dark:text-white"
                >
                  <span className="tabular-nums">{profile.followingCount.toLocaleString()}</span>{" "}
                  <span className="font-normal text-[color:var(--on-surface-muted)]">following</span>
                </button>
                <button
                  type="button"
                  onClick={() => openDrawer("suggested")}
                  className="text-xs font-semibold text-[#2563EB] hover:underline dark:text-[#60A5FA]"
                >
                  Find people
                </button>
              </div>

              <div className="mt-5">
                {profile.isSelf ? (
                  <Link
                    href="/settings"
                    className="inline-flex rounded-full border border-[color:var(--hairline-strong)] px-5 py-2 text-sm font-semibold text-[color:var(--on-surface)] transition hover:bg-[color:var(--surface-container-low)] dark:border-white/15 dark:text-[#ebe9e4]"
                  >
                    Edit profile
                  </Link>
                ) : (
                  <div className="relative inline-block">
                    {confirmUnfollow ? (
                      <div className="absolute left-0 top-full z-10 mt-2 w-52 rounded-lg border border-[color:var(--hairline)] bg-white p-3 shadow-lg dark:border-white/10 dark:bg-dm-card">
                        <p className="text-sm text-[color:var(--on-surface)] dark:text-neutral-200">
                          Unfollow @{profile.handle}?
                        </p>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            disabled={followBusy}
                            onClick={() => void toggleFollow()}
                            className="flex-1 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white"
                          >
                            Unfollow
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmUnfollow(false)}
                            className="flex-1 rounded-md border border-[color:var(--hairline)] px-3 py-1.5 text-xs font-medium dark:border-white/10"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      disabled={followBusy}
                      onClick={() => void toggleFollow()}
                      className={[
                        "rounded-full px-5 py-2 text-sm font-semibold transition disabled:opacity-50",
                        profile.isFollowing
                          ? "border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] text-[color:var(--on-surface)] dark:border-white/15 dark:bg-dm-page dark:text-[#ebe9e4]"
                          : profile.showFollowBack
                            ? "bg-[#2563EB] text-white shadow-sm hover:bg-[#1d4ed8]"
                            : "border border-[#2563EB] bg-[#2563EB] text-white hover:bg-[#1d4ed8]",
                      ].join(" ")}
                    >
                      {followBusy
                        ? "…"
                        : profile.isFollowing
                          ? "Following"
                          : profile.showFollowBack
                            ? "Follow back"
                            : "Follow"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      <ProfileSocialDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        profileUserId={profile.id}
        viewerId={viewerId}
        initialTab={drawerTab}
        onCountsChange={() => void loadProfile()}
      />
    </SiteShell>
  );
}
