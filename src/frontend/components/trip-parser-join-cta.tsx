"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

/**
 * Editorial "Join a Trip" card — only entry to `/join` (always with `from=create`).
 * Pre-fills the invite code on the join page when the user typed one here so the
 * existing join-by-code form behavior is preserved without duplicating logic.
 */
export function TripParserJoinCta() {
  const router = useRouter();
  const [code, setCode] = useState("");

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    const dest = trimmed
      ? `/join?from=create&code=${encodeURIComponent(trimmed)}`
      : "/join?from=create";
    router.push(dest);
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex h-full flex-col gap-5 rounded-2xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] px-6 py-6 shadow-[var(--shadow-ambient-sm)] transition focus-within:border-[color:var(--sage)]/55 hover:shadow-[var(--shadow-ambient)] dark:border-white/10 dark:bg-[#1a1a1a]/90"
    >
      <span className="inline-flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">
        <CollaborateIcon className="h-3.5 w-3.5" />
        Collaborate
      </span>

      <div className="flex-1">
        <h3 className="font-display text-2xl font-semibold leading-[1.1] tracking-[-0.02em] text-[color:var(--on-surface)] dark:text-[#ebe9e4] sm:text-[1.6rem]">
          Join a Trip
        </h3>
        <p className="mt-1.5 text-sm text-[color:var(--on-surface-variant)] dark:text-[#9c9a96]">
          Have an invite code from your host? Drop it in to hop into the workspace.
        </p>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="sr-only">Invite code</span>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            placeholder="Enter Invite Code"
            maxLength={12}
            className="w-full rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)]/60 px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none transition placeholder:text-[color:var(--on-surface-muted)] focus:border-[color:var(--sage)]/60 focus:bg-[color:var(--surface-container-lowest)] focus:ring-1 focus:ring-[color:var(--sage)]/30 dark:border-white/10 dark:bg-[#222]/80 dark:text-[#ebe9e4] dark:placeholder:text-[#6b6965]"
          />
        </label>
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-full border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] px-6 py-2 text-sm font-medium text-[color:var(--on-surface)] transition hover:border-[color:var(--on-surface)] hover:bg-[color:var(--surface-container-low)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sage)]/40 dark:border-white/15 dark:bg-[#222] dark:text-[#ebe9e4] dark:hover:bg-[#2a2a2a]"
        >
          Connect
        </button>
      </div>
    </form>
  );
}

function CollaborateIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <circle cx="7.5" cy="7.5" r="2.4" />
      <path d="M2.8 16.5c.5-2.3 2.4-3.8 4.7-3.8s4.2 1.5 4.7 3.8" />
      <path d="M13.5 4.5h3.7M15.4 2.6v3.8" />
    </svg>
  );
}
