"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { primaryFormButtonClass } from "@/frontend/ui/primary-action";

export function JoinTripByCodeForm({ initialCode = "" }: { initialCode?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(() => initialCode);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCode(initialCode);
  }, [initialCode]);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!code.trim()) {
        setError("Enter an invite code.");
        return;
      }
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
          router.push(`/trip/${j.tripId}/setup`);
          router.refresh();
        }
      } finally {
        setBusy(false);
      }
    },
    [code, router]
  );

  return (
    <div className="rounded-2xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] p-6 shadow-[var(--shadow-ambient)] dark:border-white/10 dark:bg-dm-card sm:p-8">
      <p className="label-caps mb-2 text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">Conci</p>
      <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-[color:var(--on-surface)] dark:text-white">
        Join a trip
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[color:var(--on-surface-variant)] dark:text-neutral-400">
        Have an invite code from your host? Enter it here. You need to be signed in — we&apos;ll link this trip to your
        account.
      </p>
      <form onSubmit={(ev) => void onSubmit(ev)} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="join-code"
            className="label-caps block text-[color:var(--on-surface-muted)] dark:text-neutral-500"
          >
            Invite code
          </label>
          <input
            id="join-code"
            name="code"
            type="text"
            autoComplete="off"
            placeholder="e.g. XAC-JL7"
            value={code}
            onChange={(ev) => setCode(ev.target.value)}
            maxLength={12}
            className="mt-1.5 w-full rounded-lg border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] px-4 py-3 text-sm text-[color:var(--on-surface)] shadow-[var(--shadow-ambient-sm)] outline-none transition placeholder:text-[color:var(--on-surface-muted)] focus:border-[color:var(--sage)] focus:ring-1 focus:ring-[color:var(--sage)]/40 dark:border-white/15 dark:bg-dm-elevated dark:text-neutral-100"
          />
        </div>
        {error ? (
          <p className="rounded-lg border border-[#a8443c]/30 bg-[#a8443c]/8 px-3 py-2 text-xs text-[#a8443c] dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={busy} className={`w-full sm:w-auto ${primaryFormButtonClass}`}>
          {busy ? "Joining…" : "Join trip"}
        </button>
      </form>
    </div>
  );
}
