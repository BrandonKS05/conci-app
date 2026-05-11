"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/frontend/supabase/client";
import { primaryFormButtonClass } from "@/frontend/ui/primary-action";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) {
      setReady(true);
      return;
    }
    void sb.auth.getSession().then(({ data }) => {
      setHasSession(Boolean(data.session));
      setReady(true);
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) {
      setError("Not configured.");
      return;
    }
    setBusy(true);
    const { error: upErr } = await sb.auth.updateUser({ password });
    setBusy(false);
    if (upErr) {
      setError(upErr.message);
      return;
    }
    setDone(true);
    setTimeout(() => {
      router.replace("/trip-parser");
      router.refresh();
    }, 1200);
  }

  if (!ready) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">
        Loading…
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-[color:var(--on-surface)] dark:text-neutral-200">This link is invalid or has expired.</p>
        <Link href="/auth" className="mt-6 inline-block text-sm font-medium text-[color:var(--on-surface)] hover:text-[color:var(--sage)] hover:underline dark:text-indigo-400">
          Back to sign in
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-[color:var(--on-surface)] dark:text-neutral-200">Password updated. Redirecting…</p>
      </div>
    );
  }

  const inputCls =
    "mt-1.5 block w-full rounded-lg border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] px-3 py-2.5 text-sm text-[color:var(--on-surface)] shadow-[var(--shadow-ambient-sm)] outline-none transition focus:border-[color:var(--sage)] focus:ring-1 focus:ring-[color:var(--sage)]/40 dark:border-white/10 dark:bg-dm-page dark:text-neutral-100";

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-2xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] p-8 shadow-[var(--shadow-ambient)] dark:border-white/10 dark:bg-dm-card">
        <p className="label-caps mb-2 text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">Conci</p>
        <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-[color:var(--on-surface)] dark:text-white">Set new password</h1>
        <p className="mt-2 text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">Choose a new password for your account.</p>
        <form onSubmit={(e) => void submit(e)} className="mt-8 space-y-4">
          <div>
            <label htmlFor="pw" className="text-sm font-medium text-[color:var(--on-surface-variant)] dark:text-neutral-300">
              New password
            </label>
            <input
              id="pw"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
              required
              minLength={6}
            />
          </div>
          <div>
            <label htmlFor="pw2" className="text-sm font-medium text-[color:var(--on-surface-variant)] dark:text-neutral-300">
              Confirm password
            </label>
            <input
              id="pw2"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputCls}
              required
              minLength={6}
            />
          </div>
          {error ? (
            <p className="text-sm text-[#a8443c] dark:text-rose-400" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={busy} className={`w-full ${primaryFormButtonClass} disabled:opacity-50`}>
            {busy ? "Saving…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
