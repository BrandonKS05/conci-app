"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { primaryFormButtonClass } from "@/frontend/ui/primary-action";
import { track } from "@/frontend/lib/analytics";

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
          track("member_joined", { trip_id: j.tripId });
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
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-dm-card sm:p-8">
      <h1 className="font-display text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
        Join a trip
      </h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-neutral-400">
        Have an invite code from your host? Enter it here. You need to be signed in — we&apos;ll link this trip to your
        account.
      </p>
      <form onSubmit={(ev) => void onSubmit(ev)} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="join-code"
            className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-500"
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
    </div>
  );
}
