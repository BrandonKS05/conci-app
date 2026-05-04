"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/frontend/supabase/client";
import { SiteShell } from "@/frontend/components/site-shell";
import { primaryFormButtonClass } from "@/frontend/ui/primary-action";
import type { SubscriptionTier } from "@/shared/subscription";

function tierLabel(t: SubscriptionTier): string {
  if (t === "host") return "Host";
  if (t === "host_pro") return "Host Pro";
  return "Free";
}

type SettingsPayload = {
  email: string;
  displayName: string;
  avatarUrl: string | null;
  subscriptionTier: SubscriptionTier;
  notifyVoteEmail: boolean;
  notifyDateLockedEmail: boolean;
  notifyNudgeReminders: boolean;
};

export function SettingsPageClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<SettingsPayload | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountMsg, setAccountMsg] = useState<string | null>(null);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const [notifyVote, setNotifyVote] = useState(true);
  const [notifyDateLocked, setNotifyDateLocked] = useState(true);
  const [notifyNudge, setNotifyNudge] = useState(true);
  const [notifySaving, setNotifySaving] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null);
  const [subBusy, setSubBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/me/settings", { credentials: "include" });
      if (r.status === 401) {
        router.replace(`/auth?next=${encodeURIComponent("/settings")}`);
        return;
      }
      const j = (await r.json()) as SettingsPayload & { error?: string };
      if (!r.ok) {
        setError(typeof j.error === "string" ? j.error : "Could not load settings.");
        return;
      }
      setPayload(j);
      setDisplayName(j.displayName);
      setAvatarUrl(j.avatarUrl);
      setNotifyVote(j.notifyVoteEmail);
      setNotifyDateLocked(j.notifyDateLockedEmail);
      setNotifyNudge(j.notifyNudgeReminders);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveAccount(e: React.FormEvent) {
    e.preventDefault();
    setAccountMsg(null);
    setAccountSaving(true);
    try {
      const r = await fetch("/api/me/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: displayName.trim() }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setAccountMsg(typeof j.error === "string" ? j.error : "Save failed.");
        return;
      }
      setAccountMsg("Saved.");
      router.refresh();
    } catch {
      setAccountMsg("Save failed.");
    } finally {
      setAccountSaving(false);
    }
  }

  async function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const sb = getSupabaseClient();
    if (!sb) {
      setAccountMsg("Storage not configured.");
      return;
    }
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;
    setAvatarBusy(true);
    setAccountMsg(null);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const path = `${user.id}/${Date.now()}-${safe}`;
      const { error: upErr } = await sb.storage.from("avatars").upload(path, file, {
        upsert: true,
        cacheControl: "3600",
      });
      if (upErr) {
        setAccountMsg(upErr.message);
        return;
      }
      const { data: pub } = sb.storage.from("avatars").getPublicUrl(path);
      const url = pub.publicUrl;
      const r = await fetch("/api/me/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: url }),
      });
      if (!r.ok) {
        setAccountMsg("Could not save photo URL.");
        return;
      }
      setAvatarUrl(url);
      setAccountMsg("Photo updated.");
      router.refresh();
    } catch {
      setAccountMsg("Upload failed.");
    } finally {
      setAvatarBusy(false);
      e.target.value = "";
    }
  }

  async function sendPasswordReset() {
    const email = payload?.email?.trim();
    if (!email) return;
    const sb = getSupabaseClient();
    if (!sb) {
      setPwMsg("Not configured.");
      return;
    }
    setPwBusy(true);
    setPwMsg(null);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const { error: e } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/reset-password`,
    });
    setPwBusy(false);
    if (e) {
      setPwMsg(e.message);
      return;
    }
    setPwMsg("Check your email for a reset link.");
  }

  async function saveNotifications(e: React.FormEvent) {
    e.preventDefault();
    setNotifyMsg(null);
    setNotifySaving(true);
    try {
      const r = await fetch("/api/me/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notifyVoteEmail: notifyVote,
          notifyDateLockedEmail: notifyDateLocked,
          notifyNudgeReminders: notifyNudge,
        }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setNotifyMsg(typeof j.error === "string" ? j.error : "Save failed.");
        return;
      }
      setNotifyMsg("Preferences saved.");
    } catch {
      setNotifyMsg("Save failed.");
    } finally {
      setNotifySaving(false);
    }
  }

  async function openBillingPortal() {
    setSubBusy(true);
    try {
      const r = await fetch("/api/checkout/billing-portal", {
        method: "POST",
        credentials: "include",
      });
      const j = (await r.json()) as { url?: string; error?: string; detail?: string };
      if (!r.ok) {
        setError([j.error, j.detail].filter(Boolean).join(" ") || "Could not open portal.");
        return;
      }
      if (j.url) window.location.href = j.url;
    } catch {
      setError("Network error.");
    } finally {
      setSubBusy(false);
    }
  }

  async function confirmDelete() {
    setDeleteBusy(true);
    try {
      const r = await fetch("/api/account", { method: "DELETE", credentials: "include" });
      if (!r.ok) {
        setError("Could not delete account.");
        setDeleteBusy(false);
        return;
      }
      const sb = getSupabaseClient();
      await sb?.auth.signOut();
      window.location.href = "/";
    } catch {
      setError("Could not delete account.");
      setDeleteBusy(false);
    }
  }

  if (loading || !payload) {
    return (
      <SiteShell title="Settings" eyebrow="Account">
        <p className="text-sm text-slate-600 dark:text-neutral-400">{error ?? "Loading…"}</p>
      </SiteShell>
    );
  }

  const tier = payload.subscriptionTier;

  return (
    <SiteShell title="Settings" eyebrow="Account">
      <div className="mx-auto max-w-2xl space-y-10 pb-16">
        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
            {error}
          </p>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">Account</h2>
          <form onSubmit={(e) => void saveAccount(e)} className="mt-6 space-y-5">
            <div>
              <label htmlFor="display-name" className="text-sm font-medium text-slate-700 dark:text-neutral-300">
                Display name
              </label>
              <input
                id="display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={120}
                className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-dm-page dark:text-neutral-100"
                autoComplete="name"
              />
            </div>
            <div>
              <span className="text-sm font-medium text-slate-700 dark:text-neutral-300">Email</span>
              <p className="mt-1.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm text-slate-600 dark:border-white/5 dark:bg-dm-page dark:text-neutral-400">
                {payload.email || "—"}
              </p>
            </div>
            <div>
              <span className="text-sm font-medium text-slate-700 dark:text-neutral-300">Profile photo</span>
              <div className="mt-2 flex flex-wrap items-center gap-4">
                <div className="relative h-16 w-16 overflow-hidden rounded-full border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-dm-elevated">
                  {avatarUrl ? (
                    <Image src={avatarUrl} alt="" fill className="object-cover" unoptimized />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-lg font-semibold text-slate-500 dark:text-neutral-500">
                      {(displayName || payload.email || "?").slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>
                <label className="cursor-pointer">
                  <span className={`inline-flex ${primaryFormButtonClass} cursor-pointer text-sm`}>
                    {avatarBusy ? "Uploading…" : "Upload photo"}
                  </span>
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={(e) => void onAvatarChange(e)} disabled={avatarBusy} />
                </label>
              </div>
            </div>
            {accountMsg ? (
              <p className="text-sm text-emerald-700 dark:text-emerald-300" role="status">
                {accountMsg}
              </p>
            ) : null}
            <button type="submit" disabled={accountSaving} className={`${primaryFormButtonClass} disabled:opacity-50`}>
              {accountSaving ? "Saving…" : "Save account"}
            </button>
          </form>

          <div className="mt-8 border-t border-slate-100 pt-8 dark:border-white/10">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Change password</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">
              We&apos;ll email you a link to set a new password at the address below.
            </p>
            <label htmlFor="reset-email" className="mt-4 block text-sm font-medium text-slate-700 dark:text-neutral-300">
              Email for reset link
            </label>
            <input
              id="reset-email"
              type="email"
              readOnly
              value={payload.email || ""}
              autoComplete="email"
              className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600 dark:border-white/10 dark:bg-dm-page dark:text-neutral-400"
            />
            <button
              type="button"
              disabled={pwBusy || !payload.email}
              onClick={() => void sendPasswordReset()}
              className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-dm-page dark:text-neutral-200 dark:hover:bg-dm-elevated"
            >
              {pwBusy ? "Sending…" : "Send password reset email"}
            </button>
            {pwMsg ? <p className="mt-2 text-sm text-slate-600 dark:text-neutral-400">{pwMsg}</p> : null}
          </div>

          <div className="mt-8 border-t border-slate-100 pt-8 dark:border-white/10">
            <h3 className="text-sm font-semibold text-rose-800 dark:text-rose-300">Delete account</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">
              Permanently remove your account and access. This cannot be undone.
            </p>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-900 transition hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200 dark:hover:bg-rose-950/60"
            >
              Delete account…
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">Subscription</h2>
          <p className="mt-4 text-sm text-slate-600 dark:text-neutral-400">
            Current plan:{" "}
            <span className="font-semibold text-slate-900 dark:text-white">{tierLabel(tier)}</span>
          </p>
          <div className="mt-6">
            {tier === "free" ? (
              <Link href="/pricing" className={`inline-flex ${primaryFormButtonClass}`}>
                Upgrade
              </Link>
            ) : (
              <button
                type="button"
                disabled={subBusy}
                onClick={() => void openBillingPortal()}
                className={`${primaryFormButtonClass} disabled:opacity-50`}
              >
                {subBusy ? "Opening…" : "Manage subscription"}
              </button>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">Notifications</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">
            Email preferences for trip activity (where configured in Conci).
          </p>
          <form onSubmit={(e) => void saveNotifications(e)} className="mt-6 space-y-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={notifyVote}
                onChange={(e) => setNotifyVote(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-white/20"
              />
              <span className="text-sm text-slate-800 dark:text-neutral-200">Email me when someone votes</span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={notifyDateLocked}
                onChange={(e) => setNotifyDateLocked(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-white/20"
              />
              <span className="text-sm text-slate-800 dark:text-neutral-200">Email me when a date is locked</span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={notifyNudge}
                onChange={(e) => setNotifyNudge(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-white/20"
              />
              <span className="text-sm text-slate-800 dark:text-neutral-200">Nudge reminders on/off</span>
            </label>
            {notifyMsg ? (
              <p className="text-sm text-emerald-700 dark:text-emerald-300" role="status">
                {notifyMsg}
              </p>
            ) : null}
            <button type="submit" disabled={notifySaving} className={`${primaryFormButtonClass} disabled:opacity-50`}>
              {notifySaving ? "Saving…" : "Save preferences"}
            </button>
          </form>
        </section>
      </div>

      {deleteOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
          onClick={() => !deleteBusy && setDeleteOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-dm-card"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            <h3 id="delete-account-title" className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              Delete your account?
            </h3>
            <p className="mt-3 text-sm text-slate-600 dark:text-neutral-400">
              You will lose access to hosted trips and memberships. This cannot be undone.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => setDeleteOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-neutral-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => void confirmDelete()}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {deleteBusy ? "Deleting…" : "Delete account"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </SiteShell>
  );
}
