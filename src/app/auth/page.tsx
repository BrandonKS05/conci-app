"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/frontend/supabase/client";

function AuthInner() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/trip-parser";
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function continueWithGoogle() {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }
    setWorking(true);
    setError(null);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });
    setWorking(false);
    if (oauthError) {
      setError(oauthError.message);
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center px-4 py-16">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-black/40">
        <p className="mb-2 text-center text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-neutral-500">
          Conci
        </p>
        <h1 className="mb-2 text-center font-display text-2xl font-semibold tracking-[-0.04em] text-slate-900 dark:text-white">
          Sign in
        </h1>
        <p className="mb-8 text-center text-sm text-slate-600 dark:text-neutral-400">
          Continue to create and save trip plans.
        </p>

        <button
          type="button"
          onClick={() => void continueWithGoogle()}
          disabled={working}
          className="flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-200 dark:hover:border-white/15 dark:hover:bg-dm-page"
        >
          <GoogleGlyph />
          {working ? "Redirecting…" : "Continue with Google"}
        </button>

        {error ? (
          <p className="mt-4 text-center text-sm text-rose-600 dark:text-rose-400" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <p className="mt-6 text-center text-xs text-slate-500 dark:text-neutral-500">
        <Link href="/" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          Back to home
        </Link>
      </p>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500 dark:text-neutral-500">
          Loading…
        </div>
      }
    >
      <AuthInner />
    </Suspense>
  );
}
