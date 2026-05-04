"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/frontend/supabase/client";

type UserMenuProps = {
  /** Use `dark` on dark backgrounds (e.g. marketing hero). */
  tone?: "light" | "dark";
};

export function UserMenu({ tone = "light" }: UserMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [initial, setInitial] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return undefined;

    function applyUser(sessionUser: {
      user_metadata?: Record<string, unknown>;
      email?: string | null;
    } | null) {
      if (!sessionUser) {
        setAvatarUrl(null);
        setInitial("");
        return;
      }
      const meta = sessionUser.user_metadata ?? {};
      const pic =
        (typeof meta.avatar_url === "string" && meta.avatar_url) ||
        (typeof meta.picture === "string" && meta.picture) ||
        null;
      setAvatarUrl(pic);
      const name =
        (typeof meta.full_name === "string" && meta.full_name) ||
        (typeof meta.name === "string" && meta.name) ||
        sessionUser.email ||
        "?";
      setInitial(name.slice(0, 1).toUpperCase());
    }

    void supabase.auth.getSession().then(({ data: { session } }) => applyUser(session?.user ?? null));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  async function signOut() {
    const supabase = getSupabaseClient();
    await supabase?.auth.signOut();
    setOpen(false);
    router.refresh();
    router.push("/auth");
  }

  const signInClass =
    tone === "dark"
      ? "rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/15"
      : "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-dm-card dark:text-neutral-200 dark:hover:bg-dm-elevated";

  if (!initial && !avatarUrl) {
    return (
      <Link href="/auth" className={signInClass}>
        Sign in
      </Link>
    );
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          tone === "dark"
            ? "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-white/10 ring-offset-zinc-950 hover:ring-2 hover:ring-white/30 focus:outline-none focus:ring-2 focus:ring-white/40"
            : "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 ring-offset-2 hover:ring-2 hover:ring-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-white/10 dark:bg-dm-card dark:hover:ring-white/20 dark:focus:ring-white/30"
        }
        aria-expanded={open}
        aria-haspopup="menu"
        title="Account"
      >
        {avatarUrl ? (
          <Image src={avatarUrl} alt="" width={36} height={36} className="h-full w-full object-cover" unoptimized />
        ) : (
          <span
            className={
              tone === "dark"
                ? "text-sm font-semibold text-white"
                : "text-sm font-semibold text-slate-700 dark:text-neutral-200"
            }
          >
            {initial}
          </span>
        )}
      </button>

      {open ? (
        <div
          role="menu"
          className={
            tone === "dark"
              ? "absolute right-0 z-50 mt-2 min-w-[10rem] rounded-2xl border border-white/10 bg-zinc-950 py-1 shadow-xl shadow-black/40"
              : "absolute right-0 z-50 mt-2 min-w-[10rem] rounded-2xl border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-dm-card dark:shadow-black/40"
          }
        >
          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={
              tone === "dark"
                ? "block w-full px-4 py-2 text-left text-sm text-zinc-100 hover:bg-white/10"
                : "block w-full px-4 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 dark:text-neutral-200 dark:hover:bg-white/5"
            }
          >
            Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => void signOut()}
            className={
              tone === "dark"
                ? "block w-full px-4 py-2 text-left text-sm text-zinc-100 hover:bg-white/10"
                : "block w-full px-4 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 dark:text-neutral-200 dark:hover:bg-white/5"
            }
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
