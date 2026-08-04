"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Recruiter/resume entry point: clicking the link in the resume lands here,
// which kicks off the pitch deck download and then forwards to the site.
// Nothing else on the site triggers the download — only this route does.
const DECK_URL = "/deck.pptx";
const DECK_FILENAME = "Conci_Pitch_Deck.pptx";
const DESTINATION = "/";
const REDIRECT_DELAY_MS = 1500;

export default function WelcomePage() {
  const router = useRouter();
  const downloadStarted = useRef(false);

  useEffect(() => {
    // Fire the download exactly once (guard the dev StrictMode double-invoke).
    if (!downloadStarted.current) {
      downloadStarted.current = true;
      const link = document.createElement("a");
      link.href = DECK_URL;
      link.download = DECK_FILENAME;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }

    // Then forward the visitor to the site. The download is handed off to the
    // browser and continues independently of this navigation.
    const timer = setTimeout(() => router.replace(DESTINATION), REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[color:var(--surface)] px-6 text-center dark:bg-black">
      <span className="font-display text-3xl font-semibold tracking-tight text-[color:var(--on-surface)] dark:text-white">
        Conci
      </span>

      <div className="flex flex-col items-center gap-4">
        <span
          aria-hidden
          className="h-6 w-6 animate-spin rounded-full border-2 border-[color:var(--hairline-strong)] border-t-[color:var(--sage)]"
        />
        <h1 className="font-display text-2xl font-medium tracking-tight text-[color:var(--on-surface)] dark:text-white sm:text-3xl">
          Your pitch deck is downloading
        </h1>
        <p className="max-w-sm text-sm leading-relaxed text-[color:var(--on-surface-variant)] dark:text-neutral-400">
          Taking you to Conci now. If the download doesn&apos;t start,{" "}
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

      <Link
        href={DESTINATION}
        className="inline-flex items-center justify-center rounded-full bg-[#1c1c17] px-6 py-3 text-sm font-semibold tracking-wide text-[color:var(--surface)] shadow-[var(--shadow-ambient-sm)] transition hover:bg-[#2a2a23] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sage)] focus-visible:ring-offset-2"
      >
        Continue to Conci&nbsp;&rarr;
      </Link>
    </main>
  );
}
