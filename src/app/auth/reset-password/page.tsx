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
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-600 dark:text-neutral-400">
        Loading…
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-slate-800 dark:text-neutral-200">This link is invalid or has expired.</p>
        <Link href="/auth" className="mt-6 inline-block text-sm font-medium text-indigo-600 dark:text-indigo-400">
          Back to sign in
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-slate-800 dark:text-neutral-200">Password updated. Redirecting…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-white">Set new password</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-neutral-400">Choose a new password for your account.</p>
      <form onSubmit={(e) => void submit(e)} className="mt-8 space-y-4">
        <div>
          <label htmlFor="pw" className="text-sm font-medium text-slate-700 dark:text-neutral-300">
            New password
          </label>
          <input
            id="pw"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-dm-page dark:text-neutral-100"
            required
            minLength={6}
          />
        </div>
        <div>
          <label htmlFor="pw2" className="text-sm font-medium text-slate-700 dark:text-neutral-300">
            Confirm password
          </label>
          <input
            id="pw2"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-dm-page dark:text-neutral-100"
            required
            minLength={6}
          />
        </div>
        {error ? (
          <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={busy} className={`w-full ${primaryFormButtonClass} disabled:opacity-50`}>
          {busy ? "Saving…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
