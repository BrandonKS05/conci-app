"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import type { AuthError } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/frontend/supabase/client";
import { primaryFormButtonClass } from "@/frontend/ui/primary-action";

/**
 * OAuth redirect_to must match the tab the user signed in from, so we always
 * use the current window origin. Supabase still has to allowlist the value in
 * Dashboard → Authentication → URL configuration → Redirect URLs.
 */
function oauthRedirectOrigin(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

function safeNextPath(raw: string | null): string {
  const fallback = "/trip-parser";
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}

function mapAuthError(error: AuthError, context: "signin" | "signup"): { field?: "email" | "password" | "confirm"; message: string } {
  const msg = (error.message || "").toLowerCase();
  const code = error.code?.toLowerCase() ?? "";

  if (
    code === "email_not_confirmed" ||
    msg.includes("email not confirmed") ||
    msg.includes("confirm your email")
  ) {
    return {
      field: "email",
      message: "Confirm your email before signing in. Check your inbox for the link we sent.",
    };
  }
  if (
    context === "signin" &&
    (code === "invalid_credentials" ||
      msg.includes("invalid login") ||
      msg.includes("invalid credentials"))
  ) {
    return {
      field: "password",
      message: "Incorrect email or password.",
    };
  }
  if (
    context === "signup" &&
    (code === "user_already_exists" ||
      msg.includes("already registered") ||
      msg.includes("user already exists"))
  ) {
    return {
      field: "email",
      message: "An account with this email already exists. Sign in instead.",
    };
  }
  if (msg.includes("password") && msg.includes("least")) {
    return { field: "password", message: error.message || "Password does not meet requirements." };
  }
  return { message: error.message || "Something went wrong. Try again." };
}

/** Client-only auth UI (kept separate from `page.tsx` so the route entry stays a Server Component — avoids flaky dev webpack chunks on `/auth`). */
export function AuthFormClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => safeNextPath(searchParams.get("next")), [searchParams]);

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [working, setWorking] = useState(false);
  const [oauthWorking, setOauthWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [signupNotice, setSignupNotice] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotWorking, setForgotWorking] = useState(false);

  const clearFieldErrors = useCallback(() => {
    setError(null);
    setEmailError(null);
    setPasswordError(null);
    setConfirmError(null);
  }, []);

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) { setError("Supabase is not configured."); return; }
    clearFieldErrors();
    setForgotWorking(true);
    const redirectTo = `${oauthRedirectOrigin()}/auth/reset-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setForgotWorking(false);
    if (resetError) { setError(resetError.message); return; }
    setForgotSent(true);
  }

  const applyMappedError = useCallback((mapped: { field?: "email" | "password" | "confirm"; message: string }) => {
    if (mapped.field === "email") setEmailError(mapped.message);
    else if (mapped.field === "password") setPasswordError(mapped.message);
    else if (mapped.field === "confirm") setConfirmError(mapped.message);
    else setError(mapped.message);
  }, []);

  async function continueWithGoogle() {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }
    setOauthWorking(true);
    clearFieldErrors();
    const redirectTo = `${oauthRedirectOrigin()}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });
    setOauthWorking(false);
    if (oauthError) {
      setError(oauthError.message);
    }
  }

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    clearFieldErrors();
    setSignupNotice(false);

    if (mode === "signup") {
      if (password !== confirmPassword) {
        setConfirmError("Passwords do not match.");
        return;
      }
      if (password.length < 6) {
        setPasswordError("Password must be at least 6 characters.");
        return;
      }
    }

    setWorking(true);

    if (mode === "signin") {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      setWorking(false);
      if (signInError) {
        applyMappedError(mapAuthError(signInError, "signin"));
        return;
      }
      router.push(nextPath);
      router.refresh();
      return;
    }

    const emailRedirectTo = `${oauthRedirectOrigin()}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo,
      },
    });
    setWorking(false);
    if (signUpError) {
      applyMappedError(mapAuthError(signUpError, "signup"));
      return;
    }

    if (signUpData.session) {
      router.push(nextPath);
      router.refresh();
      return;
    }

    setSignupNotice(true);
    setPassword("");
    setConfirmPassword("");
  }

  function switchMode(next: "signin" | "signup") {
    setMode(next);
    clearFieldErrors();
    setSignupNotice(false);
    setConfirmPassword("");
  }

  const inputClass =
    "mt-1.5 block w-full rounded-lg border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] px-3 py-2.5 text-sm text-[color:var(--on-surface)] shadow-[var(--shadow-ambient-sm)] outline-none transition placeholder:text-[color:var(--on-surface-muted)] focus:border-[color:var(--sage)] focus:ring-1 focus:ring-[color:var(--sage)]/40 dark:border-white/10 dark:bg-dm-page dark:text-neutral-100";

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center px-5 py-16">
      <div className="rounded-2xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] p-8 shadow-[var(--shadow-ambient)] dark:border-white/10 dark:bg-dm-card dark:shadow-black/40">
        <p className="label-caps mb-2 text-center text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">
          Conci
        </p>
        <h1 className="mb-2 text-center font-display text-2xl font-semibold tracking-[-0.03em] text-[color:var(--on-surface)] dark:text-white">
          {mode === "signin" ? "Sign in" : "Create account"}
        </h1>
        <p className="mb-8 text-center text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">
          Continue to create and save trip plans.
        </p>

        <button
          type="button"
          onClick={() => void continueWithGoogle()}
          disabled={oauthWorking || working}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] px-4 py-3.5 text-sm font-medium tracking-wide text-[color:var(--on-surface)] shadow-[var(--shadow-ambient-sm)] transition hover:border-[color:var(--on-surface)]/25 hover:bg-[color:var(--surface-container-low)] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-200 dark:hover:border-white/15 dark:hover:bg-dm-page"
        >
          <GoogleGlyph />
          {oauthWorking ? "Redirecting…" : "Continue with Google"}
        </button>

        <div className="relative my-7">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-[color:var(--hairline)] dark:border-white/10" />
          </div>
          <div className="relative flex justify-center text-xs font-medium uppercase tracking-wide">
            <span className="bg-[color:var(--surface-container-lowest)] px-3 text-[color:var(--on-surface-muted)] dark:bg-dm-card dark:text-neutral-500">or</span>
          </div>
        </div>

        {forgotMode ? (
          forgotSent ? (
            <div className="rounded-2xl border border-[color:var(--sage)]/35 bg-[color:var(--sage-soft)]/25 px-4 py-3 text-center text-sm text-[color:var(--on-surface)] dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200" role="status">
              Check your email for a password reset link.
            </div>
          ) : (
            <form onSubmit={(e) => void handleForgotPassword(e)} className="space-y-4" noValidate>
              <div>
                <label htmlFor="auth-reset-email" className="text-sm font-medium text-[color:var(--on-surface-variant)] dark:text-neutral-300">
                  Email
                </label>
                <input
                  id="auth-reset-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={forgotWorking}
                  placeholder="you@example.com"
                  className={inputClass}
                />
              </div>
              {error ? <p className="text-center text-sm text-[#a8443c] dark:text-rose-400" role="alert">{error}</p> : null}
              <button type="submit" disabled={forgotWorking} className={`w-full ${primaryFormButtonClass} disabled:opacity-50`}>
                {forgotWorking ? "Sending…" : "Send reset link"}
              </button>
              <p className="text-center text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">
                <button type="button" onClick={() => { setForgotMode(false); clearFieldErrors(); }} className="font-semibold underline-offset-2 hover:underline">
                  Back to sign in
                </button>
              </p>
            </form>
          )
        ) : signupNotice ? (
          <div
            className="rounded-2xl border border-[color:var(--sage)]/35 bg-[color:var(--sage-soft)]/25 px-4 py-3 text-center text-sm text-[color:var(--on-surface)] dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200"
            role="status"
          >
            Check your email to confirm your account before signing in.
          </div>
        ) : (
          <form onSubmit={(e) => void handleEmailAuth(e)} className="space-y-4" noValidate>
            <div>
              <label htmlFor="auth-email" className="text-sm font-medium text-[color:var(--on-surface-variant)] dark:text-neutral-300">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={working}
                className={inputClass}
              />
              {emailError ? (
                <p className="mt-1.5 text-sm text-[#a8443c] dark:text-rose-400" role="alert">
                  {emailError}
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="auth-password" className="text-sm font-medium text-[color:var(--on-surface-variant)] dark:text-neutral-300">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={working}
                minLength={mode === "signup" ? 6 : undefined}
                className={inputClass}
              />
              {passwordError ? (
                <p className="mt-1.5 text-sm text-[#a8443c] dark:text-rose-400" role="alert">
                  {passwordError}
                </p>
              ) : null}
            </div>
            {mode === "signin" ? (
              <p className="text-right text-xs">
                <button
                  type="button"
                  onClick={() => { setForgotMode(true); setForgotSent(false); clearFieldErrors(); }}
                  className="text-[color:var(--on-surface-muted)] underline-offset-2 hover:text-[color:var(--on-surface)] hover:underline dark:text-neutral-500 dark:hover:text-neutral-300"
                >
                  Forgot password?
                </button>
              </p>
            ) : null}
            {mode === "signup" ? (
              <div>
                <label htmlFor="auth-confirm" className="text-sm font-medium text-[color:var(--on-surface-variant)] dark:text-neutral-300">
                  Confirm password
                </label>
                <input
                  id="auth-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={working}
                  className={inputClass}
                />
                {confirmError ? (
                  <p className="mt-1.5 text-sm text-[#a8443c] dark:text-rose-400" role="alert">
                    {confirmError}
                  </p>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <p className="text-center text-sm text-[#a8443c] dark:text-rose-400" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={working || oauthWorking}
              className={`w-full ${primaryFormButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {working ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
        )}

        {!forgotMode && !signupNotice ? (
          <p className="mt-6 text-center text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">
            {mode === "signin" ? (
              <>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("signup")}
                  className="font-semibold text-[color:var(--on-surface)] underline-offset-2 hover:text-[color:var(--sage)] hover:underline dark:text-indigo-400"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  className="font-semibold text-[color:var(--on-surface)] underline-offset-2 hover:text-[color:var(--sage)] hover:underline dark:text-indigo-400"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        ) : signupNotice ? (
          <p className="mt-6 text-center text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">
            Wrong email?{" "}
            <button
              type="button"
              onClick={() => {
                setSignupNotice(false);
                switchMode("signup");
              }}
              className="font-semibold text-[color:var(--on-surface)] underline-offset-2 hover:text-[color:var(--sage)] hover:underline dark:text-indigo-400"
            >
              Try again
            </button>
          </p>
        ) : null}
      </div>
      <p className="mt-6 text-center text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">
        <Link href="/" className="font-medium text-[color:var(--on-surface)] hover:text-[color:var(--sage)] hover:underline dark:text-indigo-400">
          Back to home
        </Link>
      </p>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
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
