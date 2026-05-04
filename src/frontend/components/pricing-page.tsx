"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";
import { SiteShell } from "@/frontend/components/site-shell";
import { primaryFormButtonClass } from "@/frontend/ui/primary-action";

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function PricingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const notice = searchParams.get("notice");
  const subscribed = searchParams.get("subscribed");
  const canceled = searchParams.get("canceled");

  const [checkoutBusy, setCheckoutBusy] = useState<"host" | "host_pro" | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const startSubscription = useCallback(
    async (tier: "host" | "host_pro") => {
      setCheckoutError(null);
      setCheckoutBusy(tier);
      try {
        const r = await fetch("/api/checkout/subscription", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier }),
        });
        const body = (await r.json().catch(() => ({}))) as { url?: string; error?: string; detail?: string };
        if (!r.ok) {
          if (r.status === 401) {
            router.push(`/auth?next=${encodeURIComponent("/pricing")}`);
            return;
          }
          setCheckoutError(
            [body.error, body.detail].filter(Boolean).join(" ") || "Could not start checkout."
          );
          return;
        }
        if (body.url) {
          window.location.href = body.url;
          return;
        }
        setCheckoutError("Missing checkout URL.");
      } catch {
        setCheckoutError("Network error — try again.");
      } finally {
        setCheckoutBusy(null);
      }
    },
    [router]
  );

  return (
    <SiteShell title="Pricing" eyebrow="Conci">
      <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-6">
        {notice ? (
          <div
            className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
            role="status"
          >
            {notice}
          </div>
        ) : null}
        {subscribed ? (
          <div
            className="mb-8 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100"
            role="status"
          >
            You&apos;re subscribed — you can create trips from{" "}
            <Link href="/trip-parser" className="font-semibold underline underline-offset-2">
              Create a Trip
            </Link>
            .
          </div>
        ) : null}
        {canceled ? (
          <p className="mb-6 text-center text-sm text-slate-600 dark:text-neutral-400">Checkout canceled.</p>
        ) : null}
        {checkoutError ? (
          <p className="mb-6 text-center text-sm text-rose-600 dark:text-rose-400" role="alert">
            {checkoutError}
          </p>
        ) : null}

        <div className="text-center">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
            Simple pricing
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-slate-600 dark:text-neutral-400">
            Join trips for free. Upgrade to host your own plans with the AI trip parser and sharing tools.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-dm-card">
            <p className="text-sm font-semibold text-slate-500 dark:text-neutral-500">Free</p>
            <p className="mt-2 font-display text-4xl font-semibold text-slate-900 dark:text-white">
              $0
              <span className="text-lg font-normal text-slate-500 dark:text-neutral-500">/mo</span>
            </p>
            <p className="mt-4 text-sm text-slate-600 dark:text-neutral-400">
              For travelers joining someone else&apos;s trip.
            </p>
            <ul className="mt-6 flex-1 space-y-3 text-sm text-slate-700 dark:text-neutral-300">
              {[
                "Join trips with an invite code",
                "Vote on group decisions",
                "View shared itineraries",
              ].map((f) => (
                <li key={f} className="flex gap-2">
                  <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/join"
              className={`mt-8 block w-full text-center ${primaryFormButtonClass}`}
            >
              Get started
            </Link>
          </article>

          <article className="relative flex flex-col rounded-2xl border-2 border-indigo-500 bg-white p-8 shadow-lg dark:border-indigo-500/60 dark:bg-dm-card">
            <span className="absolute right-4 top-4 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-200">
              Popular
            </span>
            <p className="text-sm font-semibold text-slate-500 dark:text-neutral-500">Host</p>
            <p className="mt-2 font-display text-4xl font-semibold text-slate-900 dark:text-white">
              $9
              <span className="text-lg font-normal text-slate-500 dark:text-neutral-500">/mo</span>
            </p>
            <p className="mt-4 text-sm text-slate-600 dark:text-neutral-400">
              Create trips and coordinate small groups.
            </p>
            <ul className="mt-6 flex-1 space-y-3 text-sm text-slate-700 dark:text-neutral-300">
              {[
                "Create & share trips",
                "AI trip parser",
                "Up to 10 group members",
                "Hotel & restaurant suggestions",
              ].map((f) => (
                <li key={f} className="flex gap-2">
                  <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={checkoutBusy !== null}
              onClick={() => void startSubscription("host")}
              className={`mt-8 w-full ${primaryFormButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {checkoutBusy === "host" ? "Redirecting…" : "Subscribe"}
            </button>
          </article>

          <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-dm-card">
            <p className="text-sm font-semibold text-slate-500 dark:text-neutral-500">Host Pro</p>
            <p className="mt-2 font-display text-4xl font-semibold text-slate-900 dark:text-white">
              $29
              <span className="text-lg font-normal text-slate-500 dark:text-neutral-500">/mo</span>
            </p>
            <p className="mt-4 text-sm text-slate-600 dark:text-neutral-400">
              Full-featured hosting for larger trips.
            </p>
            <ul className="mt-6 flex-1 space-y-3 text-sm text-slate-700 dark:text-neutral-300">
              {[
                "Everything in Host",
                "Unlimited group members",
                "Email nudges",
                "Calendar sync",
                "Priority support",
              ].map((f) => (
                <li key={f} className="flex gap-2">
                  <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={checkoutBusy !== null}
              onClick={() => void startSubscription("host_pro")}
              className={`mt-8 w-full ${primaryFormButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {checkoutBusy === "host_pro" ? "Redirecting…" : "Subscribe"}
            </button>
          </article>
        </div>
      </div>
    </SiteShell>
  );
}

export function PricingPageWithSuspense() {
  return (
    <Suspense
      fallback={
        <SiteShell title="Pricing" eyebrow="Conci">
          <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500 dark:text-neutral-500">
            Loading…
          </div>
        </SiteShell>
      }
    >
      <PricingContent />
    </Suspense>
  );
}
