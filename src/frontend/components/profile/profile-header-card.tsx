"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { getSupabaseClient } from "@/frontend/supabase/client";
import type { FullUserProfilePayload } from "@/shared/user-profile-page";
import { profilePillButtonClass } from "@/frontend/components/profile/profile-section-label";

export function ProfileHeaderCard({
  profile,
  editMode,
  onEditToggle,
  onOpenDrawer,
  onOpenVisits,
  onFollowToggle,
  followBusy,
  confirmUnfollow,
  setConfirmUnfollow,
  onProfileFieldChange,
  onMediaUpdated,
}: {
  profile: FullUserProfilePayload;
  editMode: boolean;
  onEditToggle: () => void;
  onOpenDrawer: (tab: "followers" | "following" | "suggested") => void;
  onOpenVisits: () => void;
  onFollowToggle: () => void;
  followBusy: boolean;
  confirmUnfollow: boolean;
  setConfirmUnfollow: (v: boolean) => void;
  onProfileFieldChange: (patch: {
    displayName?: string;
    handle?: string;
    bio?: string;
    location?: string;
  }) => void;
  onMediaUpdated: (patch: { avatarUrl?: string | null; bannerUrl?: string | null }) => void;
}) {
  const bannerRef = useRef<HTMLInputElement>(null);
  const avatarRef = useRef<HTMLInputElement>(null);
  const [uploadBusy, setUploadBusy] = useState<"banner" | "avatar" | null>(null);

  async function uploadFile(kind: "banner" | "avatar", file: File) {
    const sb = getSupabaseClient();
    if (!sb) return;
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;
    setUploadBusy(kind);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const bucket = kind === "banner" ? "profile-banners" : "avatars";
      const path = `${user.id}/${kind}-${Date.now()}-${safe}`;
      const { error } = await sb.storage.from(bucket).upload(path, file, { upsert: true, cacheControl: "3600" });
      if (error) return;
      const { data: pub } = sb.storage.from(bucket).getPublicUrl(path);
      if (kind === "banner") onMediaUpdated({ bannerUrl: pub.publicUrl });
      else onMediaUpdated({ avatarUrl: pub.publicUrl });
    } finally {
      setUploadBusy(null);
    }
  }

  const initials = profile.name.slice(0, 2).toUpperCase() || "?";

  return (
    <section className="overflow-hidden rounded-2xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] shadow-[var(--shadow-ambient-sm)] dark:border-white/10 dark:bg-[#1a1a1a]/90 dark:shadow-none">
      <div className="relative h-[100px] w-full bg-[color:var(--surface-container-high)] dark:bg-gradient-to-r dark:from-[#1a2332] dark:via-[#141414] dark:to-[#1a1a1a]">
        {profile.bannerUrl ? (
          <Image src={profile.bannerUrl} alt="" fill className="object-cover" unoptimized />
        ) : null}
        {editMode && profile.isSelf ? (
          <>
            <input
              ref={bannerRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadFile("banner", f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={uploadBusy === "banner"}
              onClick={() => bannerRef.current?.click()}
              className="absolute bottom-2 right-2 rounded-lg bg-black/50 px-3 py-1 text-xs font-medium text-white backdrop-blur"
            >
              {uploadBusy === "banner" ? "Uploading…" : "Change banner"}
            </button>
          </>
        ) : null}
      </div>

      <div className="relative px-5 pb-5 pt-0">
        <div className="absolute right-4 top-3 flex gap-2">
          {profile.isSelf ? (
            <button
              type="button"
              onClick={onEditToggle}
              className={profilePillButtonClass}
            >
              {editMode ? "Done editing" : "Edit profile"}
            </button>
          ) : (
            <FollowButton
              profile={profile}
              followBusy={followBusy}
              confirmUnfollow={confirmUnfollow}
              setConfirmUnfollow={setConfirmUnfollow}
              onFollowToggle={onFollowToggle}
            />
          )}
        </div>

        <div className="-mt-[30px] mb-3 flex items-end gap-4">
          <div className="relative h-[60px] w-[60px] shrink-0 overflow-hidden rounded-full border-4 border-[color:var(--surface-container-lowest)] bg-[color:var(--surface-container-high)] shadow dark:border-[#1a1a1a] dark:bg-[#2a2a2a]">
            {profile.avatarUrl ? (
              <Image src={profile.avatarUrl} alt="" fill className="object-cover" unoptimized />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-lg font-bold text-[color:var(--on-surface-variant)] dark:text-[#9c9a96]">
                {initials}
              </span>
            )}
            {editMode && profile.isSelf ? (
              <>
                <input
                  ref={avatarRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadFile("avatar", f);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  disabled={uploadBusy === "avatar"}
                  onClick={() => avatarRef.current?.click()}
                  className="absolute inset-0 flex items-center justify-center bg-black/40 text-[10px] font-semibold text-white opacity-0 transition hover:opacity-100"
                >
                  Photo
                </button>
              </>
            ) : null}
          </div>
        </div>

        {editMode && profile.isSelf ? (
          <div className="space-y-2 pr-2">
            <input
              className="w-full rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-3 py-2 font-semibold text-[color:var(--on-surface)] dark:border-white/10 dark:bg-[#222]/80 dark:text-[#ebe9e4]"
              value={profile.name}
              onChange={(e) => onProfileFieldChange({ displayName: e.target.value })}
            />
            <div className="flex gap-2">
              <span className="py-2 text-[color:var(--on-surface-muted)] dark:text-[#6b6965]">@</span>
              <input
                className="min-w-0 flex-1 rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-3 py-2 text-sm text-[color:var(--on-surface)] dark:border-white/10 dark:bg-[#222]/80 dark:text-[#ebe9e4]"
                value={profile.handle}
                onChange={(e) => onProfileFieldChange({ handle: e.target.value })}
              />
            </div>
            <input
              className="w-full rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-3 py-2 text-sm text-[color:var(--on-surface)] dark:border-white/10 dark:bg-[#222]/80 dark:text-[#ebe9e4]"
              placeholder="Location"
              value={profile.location}
              onChange={(e) => onProfileFieldChange({ location: e.target.value })}
            />
            <textarea
              className="w-full rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-3 py-2 text-sm text-[color:var(--on-surface)] dark:border-white/10 dark:bg-[#222]/80 dark:text-[#ebe9e4]"
              placeholder="Bio"
              rows={3}
              value={profile.bio}
              onChange={(e) => onProfileFieldChange({ bio: e.target.value })}
            />
          </div>
        ) : (
          <>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-[color:var(--on-surface)] dark:text-[#ebe9e4]">
              {profile.name}
            </h2>
            <p className="mt-0.5 text-sm text-[color:var(--on-surface-variant)] dark:text-[#9c9a96]">
              @{profile.handle}
              {profile.location ? (
                <>
                  <span className="mx-1.5 text-[color:var(--on-surface-muted)] dark:text-[#6b6965]">·</span>
                  {profile.location}
                </>
              ) : null}
            </p>
            {profile.bio ? (
              <p className="mt-2 text-sm leading-relaxed text-[color:var(--on-surface-variant)] dark:text-[#9c9a96]">
                {profile.bio}
              </p>
            ) : null}
            {profile.followsYouBack && !profile.isSelf ? (
              <p className="mt-1 text-xs font-medium text-[color:var(--on-surface-muted)] dark:text-[#6b6965]">
                Follows you
              </p>
            ) : null}
          </>
        )}

        <div className="mt-4 flex flex-wrap gap-5 text-sm">
          <StatButton label="visits" count={profile.visitCount} onClick={onOpenVisits} />
          <StatButton label="followers" count={profile.followerCount} onClick={() => onOpenDrawer("followers")} />
          <StatButton label="following" count={profile.followingCount} onClick={() => onOpenDrawer("following")} />
        </div>
      </div>
    </section>
  );
}

function StatButton({ label, count, onClick }: { label: string; count: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-left hover:opacity-80">
      <span className="font-bold tabular-nums text-[color:var(--on-surface)] dark:text-[#ebe9e4]">
        {count.toLocaleString()}
      </span>{" "}
      <span className="text-[color:var(--on-surface-variant)] dark:text-[#9c9a96]">{label}</span>
    </button>
  );
}

function FollowButton({
  profile,
  followBusy,
  confirmUnfollow,
  setConfirmUnfollow,
  onFollowToggle,
}: {
  profile: FullUserProfilePayload;
  followBusy: boolean;
  confirmUnfollow: boolean;
  setConfirmUnfollow: (v: boolean) => void;
  onFollowToggle: () => void;
}) {
  return (
    <div className="relative">
      {confirmUnfollow ? (
        <div className="absolute right-0 top-full z-10 mt-2 w-52 rounded-lg border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] p-3 shadow-lg dark:border-white/10 dark:bg-[#1a1a1a]">
          <p className="text-sm text-[color:var(--on-surface)] dark:text-[#ebe9e4]">Unfollow @{profile.handle}?</p>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={followBusy} onClick={onFollowToggle} className="flex-1 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white">
              Unfollow
            </button>
            <button
              type="button"
              onClick={() => setConfirmUnfollow(false)}
              className={`flex-1 px-3 py-1.5 text-xs ${profilePillButtonClass}`}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        disabled={followBusy}
        onClick={onFollowToggle}
        className={[
          "rounded-full px-5 py-1.5 text-sm font-semibold transition disabled:opacity-50",
          profile.isFollowing
            ? profilePillButtonClass
            : "border border-transparent bg-[color:var(--sage)] text-white hover:bg-[#1d4ed8] dark:bg-[color:var(--sage)] dark:hover:bg-[#1d4ed8]",
        ].join(" ")}
      >
        {followBusy ? "…" : profile.isFollowing ? "Following" : profile.showFollowBack ? "Follow back" : "Follow"}
      </button>
    </div>
  );
}
