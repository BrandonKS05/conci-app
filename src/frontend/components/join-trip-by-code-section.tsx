"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { primaryFormButtonClass } from "@/frontend/ui/primary-action";

/**
 * Invite-code join form, embedded below Create a Trip (AI parser) on `/trip-parser`.
 * Anchor: `#join-trip`. Query `?join=1` scrolls into view after redirect from legacy `/join`.
 */
export function JoinTripByCodeSection() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sectionRef = useRef<HTMLElement>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("join") !== "1") return;
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [searchParams]);

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);
      setBusy(true);
      try {
        const r = await fetch("/api/trip-plans/join-by-code", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: code.trim() }),
        });
        const j = (await r.json().catch(() => ({}))) as { error?: string; tripId?: string };
        if (!r.ok) {
          setError(typeof j.error === "string" ? j.error : "Could not join.");
          return;
        }
        if (typeof j.tripId === "string" && j.tripId) {
          router.push(`/trip/${j.tripId}`);
          router.refresh();
        }
      } finally {
        setBusy(false);
      }
    },
    [code, router]
  );

  return (
    <section
      ref={sectionRef}
      id="join-trip"
      className="mt-14 scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-dm-card sm:p-8"
      aria-labelledby="join-trip-heading"
    >
      <h2
        id="join-trip-heading"
        className="font-display text-xl font-semibold tracking-tight text-slate-900 dark:text-white"
      >
        Join a trip
      </h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-neutral-400">
        Have an invite code from your host? Enter it here. You need to be signed in — we&apos;ll link this trip to your
        account.
      </p>
      <form onSubmit={(ev) => void onSubmit(ev)} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="join-code-embedded"
            className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-500"
          >
            Invite code
          </label>
          <input
            id="join-code-embedded"
            name="code"
            type="text"
            autoComplete="off"
            placeholder="e.g. XAC-JL7"
            value={code}
            onChange={(ev) => setCode(ev.target.value)}
            maxLength={12}
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-indigo-400 dark:border-white/15 dark:bg-dm-elevated dark:text-neutral-100"
          />
        </div>
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={busy} className={`w-full sm:w-auto ${primaryFormButtonClass}`}>
          {busy ? "Joining…" : "Join trip"}
        </button>
      </form>
    </section>
  );
}
