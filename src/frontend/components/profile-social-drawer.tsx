"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { SocialUser } from "@/shared/social-profile";

type Tab = "followers" | "following" | "suggested";

function UserAvatar({ user, className }: { user: SocialUser; className?: string }) {
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-full border border-[color:var(--hairline)] bg-[color:var(--surface-container)] dark:border-white/10 dark:bg-dm-elevated ${className ?? "h-11 w-11"}`}>
      {user.avatarUrl ? (
        <Image src={user.avatarUrl} alt="" fill className="object-cover" unoptimized />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-base font-semibold text-[color:var(--on-surface-muted)]">
          {(user.name || "?").slice(0, 1).toUpperCase()}
        </span>
      )}
    </div>
  );
}

function SocialUserRow({
  user,
  tab,
  viewerId,
  onFollowChange,
}: {
  user: SocialUser;
  tab: Tab;
  viewerId: string | null;
  onFollowChange: (userId: string, isFollowing: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmUnfollow, setConfirmUnfollow] = useState(false);
  const isSelf = viewerId === user.id;
  const following = Boolean(user.isFollowing);

  async function toggleFollow() {
    if (!viewerId || isSelf || busy) return;
    if (following && !confirmUnfollow) {
      setConfirmUnfollow(true);
      return;
    }
    setBusy(true);
    setConfirmUnfollow(false);
    try {
      if (following) {
        const res = await fetch(`/api/follow?userId=${encodeURIComponent(user.id)}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (res.ok) onFollowChange(user.id, false);
      } else {
        const res = await fetch("/api/follow", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id }),
        });
        if (res.ok) onFollowChange(user.id, true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center gap-3 border-b border-[color:var(--hairline)] py-3 last:border-0 dark:border-white/5">
      <Link href={`/profile/${user.id}`} className="shrink-0">
        <UserAvatar user={user} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/profile/${user.id}`} className="block hover:underline">
          <p className="truncate font-semibold text-[color:var(--on-surface)] dark:text-white">{user.name}</p>
        </Link>
        <p className="truncate text-xs text-[color:var(--on-surface-muted)]">@{user.handle}</p>
        {tab === "following" && user.followsYou ? (
          <p className="mt-0.5 text-[10px] font-medium text-[color:var(--on-surface-muted)]">Follows you back</p>
        ) : null}
        {(user.mutualCount ?? 0) > 0 ? (
          <span className="mt-1 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
            {user.mutualCount} mutual
          </span>
        ) : null}
      </div>
      {!isSelf && viewerId ? (
        <div className="relative shrink-0">
          {confirmUnfollow ? (
            <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-lg border border-[color:var(--hairline)] bg-white p-2 shadow-lg dark:border-white/10 dark:bg-dm-card">
              <p className="text-xs text-[color:var(--on-surface)] dark:text-neutral-200">Unfollow @{user.handle}?</p>
              <div className="mt-2 flex gap-1">
                <button
                  type="button"
                  onClick={() => void toggleFollow()}
                  disabled={busy}
                  className="flex-1 rounded-md bg-rose-600 px-2 py-1 text-xs font-semibold text-white"
                >
                  Unfollow
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmUnfollow(false)}
                  className="flex-1 rounded-md border border-[color:var(--hairline)] px-2 py-1 text-xs font-medium dark:border-white/10"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void toggleFollow()}
            className={[
              "rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50",
              following
                ? "border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] text-[color:var(--on-surface)] dark:border-white/15 dark:bg-dm-page"
                : user.followsYou
                  ? "bg-[#2563EB] text-white hover:bg-[#1d4ed8]"
                  : "border border-[#2563EB] text-[#2563EB] hover:bg-[#2563EB]/10 dark:text-[#60A5FA]",
            ].join(" ")}
          >
            {busy ? "…" : following ? "Following" : user.followsYou ? "Follow back" : "Follow"}
          </button>
        </div>
      ) : null}
    </li>
  );
}

export function ProfileSocialDrawer({
  open,
  onClose,
  profileUserId,
  viewerId,
  initialTab,
  onCountsChange,
}: {
  open: boolean;
  onClose: () => void;
  profileUserId: string;
  viewerId: string | null;
  initialTab: Tab;
  onCountsChange?: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [users, setUsers] = useState<SocialUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTab = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError(null);
    try {
      const path =
        tab === "followers"
          ? `/api/followers/${profileUserId}`
          : tab === "following"
            ? `/api/following/${profileUserId}`
            : `/api/suggested/${profileUserId}`;
      const res = await fetch(path, { credentials: "include" });
      const j = (await res.json()) as { users?: SocialUser[]; error?: string };
      if (!res.ok) {
        setError(j.error || "Could not load list.");
        setUsers([]);
        return;
      }
      setUsers(j.users ?? []);
    } catch {
      setError("Network error.");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [open, tab, profileUserId]);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    void loadTab();
  }, [loadTab]);

  function handleFollowChange(userId: string, isFollowing: boolean) {
    setUsers((prev) =>
      prev
        .map((u) => (u.id === userId ? { ...u, isFollowing } : u))
        .filter((u) => (tab === "suggested" && isFollowing && u.id === userId ? false : true))
    );
    onCountsChange?.();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 p-0 sm:p-4" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-xl dark:bg-dm-card sm:max-h-[90vh] sm:rounded-2xl sm:self-center">
        <div className="flex items-center justify-between border-b border-[color:var(--hairline)] px-4 py-4 dark:border-white/10">
          <h2 className="font-display text-lg font-semibold text-[color:var(--on-surface)] dark:text-white">Connections</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-[color:var(--on-surface-muted)] hover:bg-[color:var(--surface-container-low)]"
          >
            Close
          </button>
        </div>

        <div className="flex border-b border-[color:var(--hairline)] dark:border-white/10">
          {(["followers", "following", "suggested"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={[
                "flex-1 py-3 text-xs font-bold uppercase tracking-wide",
                tab === t
                  ? "border-b-2 border-[#2563EB] text-[#2563EB]"
                  : "text-[color:var(--on-surface-muted)]",
              ].join(" ")}
            >
              {t === "followers" ? "Followers" : t === "following" ? "Following" : "Suggested"}
            </button>
          ))}
        </div>

        <ul className="flex-1 overflow-y-auto px-4">
          {loading ? (
            <li className="py-8 text-center text-sm text-[color:var(--on-surface-muted)]">Loading…</li>
          ) : error ? (
            <li className="py-8 text-center text-sm text-rose-600">{error}</li>
          ) : users.length === 0 ? (
            <li className="py-8 text-center text-sm text-[color:var(--on-surface-muted)]">
              {tab === "suggested" ? "No suggestions right now." : "No one here yet."}
            </li>
          ) : (
            users.map((u) => (
              <SocialUserRow key={u.id} user={u} tab={tab} viewerId={viewerId} onFollowChange={handleFollowChange} />
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

