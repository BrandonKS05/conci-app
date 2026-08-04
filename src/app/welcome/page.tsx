"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

// Recruiter/resume entry point. Clicking the link in the resume lands here,
// which auto-downloads the pitch deck and explicitly offers a free-access pass
// that bypasses the paywall. Nothing else on the site triggers either.
const DECK_URL = "/deck.pptx";
const DECK_FILENAME = "Conci_Pitch_Deck.pptx";

export default function WelcomePage() {
  const downloadStarted = useRef(false);

  useEffect(() => {
    // Fire the deck download exactly once (guard the dev StrictMode double-invoke).
    if (downloadStarted.current) return;
    downloadStarted.current = true;
    const link = document.createElement("a");
    link.href = DECK_URL;
    link.download = DECK_FILENAME;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[color:var(--surface)] px-6 py-16 text-center dark:bg-black">
      <span className="font-display text-3xl font-semibold tracking-tight text-[color:var(--on-surface)] dark:text-white">
        Conci
      </span>

      <div className="flex max-w-md flex-col items-center gap-2">
        <h1 className="font-display text-2xl font-medium tracking-tight text-[color:var(--on-surface)] dark:text-white sm:text-3xl">
          Your pitch deck is downloading
        </h1>
        <p className="text-sm leading-relaxed text-[color:var(--on-surface-variant)] dark:text-neutral-400">
          If it doesn&apos;t start,{" "}
          <a
            href={DECK_URL}
            download={DECK_FILENAME}
            className="font-medium text-[color:var(--sage)] underline underline-offset-2"
          >
            grab the deck here
          </a>
          .
        </p>
      </div>

      {/* Free-access pass — an explicit paywall bypass for anyone arriving via this link. */}
      <div className="w-full max-w-md rounded-2xl border border-[color:var(--sage)]/40 bg-[color:var(--sage-soft)]/20 p-6 text-left shadow-[var(--shadow-ambient-sm)] dark:border-[color:var(--sage-soft)]/25 dark:bg-[color:var(--sage)]/10">
        <p className="label-caps text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">
          ✦ Free access pass
        </p>
        <h2 className="mt-2 font-display text-xl font-semibold tracking-tight text-[color:var(--on-surface)] dark:text-white">
          You can skip the paywall
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--on-surface-variant)] dark:text-neutral-300">
          Thanks for stopping by — this link unlocks Conci for free. Build a real trip
          with the AI, no subscription needed. Just a quick sign-in so your trip saves.
        </p>
        <a
          href="/api/access-pass"
          className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-[#1c1c17] px-6 py-3 text-sm font-semibold tracking-wide text-[color:var(--surface)] shadow-[var(--shadow-ambient-sm)] transition hover:bg-[#2a2a23] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sage)] focus-visible:ring-offset-2"
        >
          Try Conci free&nbsp;&rarr;
        </a>
      </div>

      <Link
        href="/"
        className="text-sm font-medium text-[color:var(--on-surface-variant)] underline underline-offset-4 transition hover:text-[color:var(--on-surface)] dark:text-neutral-400 dark:hover:text-white"
      >
        Just browse the site
      </Link>
    </main>
  );
}
