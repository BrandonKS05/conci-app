"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { getSupabaseClient } from "@/frontend/supabase/client";
import type { FullUserProfilePayload } from "@/shared/user-profile-page";

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
    <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#1a1a1a]">
      <div className="relative h-[100px] w-full bg-gradient-to-r from-violet-600 via-fuchsia-500 to-orange-400">
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
              className="rounded-full border border-neutral-200 bg-white px-4 py-1.5 text-sm font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50 dark:border-white/15 dark:bg-[#252525] dark:text-white"
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
          <div className="relative h-[60px] w-[60px] shrink-0 overflow-hidden rounded-full border-4 border-white bg-neutral-100 shadow dark:border-[#1a1a1a] dark:bg-neutral-800">
            {profile.avatarUrl ? (
              <Image src={profile.avatarUrl} alt="" fill className="object-cover" unoptimized />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-lg font-bold text-neutral-600">{initials}</span>
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
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 font-semibold dark:border-white/10 dark:bg-black/20"
              value={profile.name}
              onChange={(e) => onProfileFieldChange({ displayName: e.target.value })}
            />
            <div className="flex gap-2">
              <span className="py-2 text-neutral-400">@</span>
              <input
                className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-black/20"
                value={profile.handle}
                onChange={(e) => onProfileFieldChange({ handle: e.target.value })}
              />
            </div>
            <input
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-black/20"
              placeholder="Location"
              value={profile.location}
              onChange={(e) => onProfileFieldChange({ location: e.target.value })}
            />
            <textarea
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-black/20"
              placeholder="Bio"
              rows={3}
              value={profile.bio}
              onChange={(e) => onProfileFieldChange({ bio: e.target.value })}
            />
          </div>
        ) : (
          <>
            <h2 className="font-display text-2xl font-bold text-neutral-900 dark:text-white">{profile.name}</h2>
            <p className="mt-0.5 text-sm text-neutral-500">
              @{profile.handle}
              {profile.location ? (
                <>
                  <span className="mx-1.5 text-neutral-300">·</span>
                  {profile.location}
                </>
              ) : null}
            </p>
            {profile.bio ? <p className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">{profile.bio}</p> : null}
            {profile.followsYouBack && !profile.isSelf ? (
              <p className="mt-1 text-xs font-medium text-neutral-500">Follows you</p>
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
      <span className="font-bold tabular-nums text-neutral-900 dark:text-white">{count.toLocaleString()}</span>{" "}
      <span className="text-neutral-500">{label}</span>
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
        <div className="absolute right-0 top-full z-10 mt-2 w-52 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg dark:border-white/10 dark:bg-[#252525]">
          <p className="text-sm">Unfollow @{profile.handle}?</p>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={followBusy} onClick={onFollowToggle} className="flex-1 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white">
              Unfollow
            </button>
            <button type="button" onClick={() => setConfirmUnfollow(false)} className="flex-1 rounded-md border px-3 py-1.5 text-xs">
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
            ? "border border-neutral-300 bg-neutral-50 text-neutral-800 dark:border-white/20 dark:bg-transparent dark:text-neutral-200"
            : profile.showFollowBack
              ? "bg-[#2563EB] text-white hover:bg-[#1d4ed8]"
              : "bg-[#2563EB] text-white hover:bg-[#1d4ed8]",
        ].join(" ")}
      >
        {followBusy ? "…" : profile.isFollowing ? "Following" : profile.showFollowBack ? "Follow back" : "Follow"}
      </button>
    </div>
  );
}
