"use client";

import { useCallback, useRef, useState, useEffect } from "react";

const PRESET_AMOUNTS = [25, 50, 100, 250];

export function TripContributeButton({ tripId }: { tripId: string }) {
  const [open, setOpen] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }
  }, [open]);

  const contribute = useCallback(
    async (amountDollars: number) => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(
          `/api/trip-plans/${tripId}/deposits/checkout`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount_cents: Math.round(amountDollars * 100) }),
          }
        );
        const data = (await r.json()) as { url?: string; error?: string };
        if (!r.ok || !data.url) {
          setError(data.error || "Something went wrong");
          return;
        }
        window.location.href = data.url;
      } catch {
        setError("Network error — please try again");
      } finally {
        setLoading(false);
      }
    },
    [tripId]
  );

  const handleCustomSubmit = useCallback(() => {
    const parsed = parseFloat(customAmount);
    if (isNaN(parsed) || parsed < 1) {
      setError("Enter at least $1.00");
      return;
    }
    contribute(parsed);
  }, [customAmount, contribute]);

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          setError(null);
          setCustomAmount("");
        }}
        className="inline-flex items-center gap-2 rounded-2xl bg-[#1c1c17] px-5 py-2.5 text-sm font-medium tracking-wide text-[color:var(--surface)] shadow-[var(--shadow-ambient-sm)] transition hover:bg-[#2a2a26] active:scale-[0.98] dark:bg-emerald-500 dark:hover:bg-emerald-600"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="8" cy="8" r="6.5" />
          <path d="M8 5v6M5 8h6" />
        </svg>
        Contribute
      </button>

      {open && (
        <div
          ref={backdropRef}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === backdropRef.current) setOpen(false);
          }}
        >
          <div className="mx-4 w-full max-w-sm rounded-3xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] p-6 shadow-[var(--shadow-ambient-lg)] dark:border-white/10 dark:bg-dm-card">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-display text-xl font-semibold tracking-tight text-[color:var(--on-surface)] dark:text-white">
                Add a deposit
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-[color:var(--on-surface-muted)] transition hover:bg-[color:var(--surface-container-low)] hover:text-[color:var(--on-surface-variant)] dark:text-neutral-500 dark:hover:bg-dm-elevated dark:hover:text-neutral-300"
                aria-label="Close"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M4.5 4.5l9 9M13.5 4.5l-9 9" />
                </svg>
              </button>
            </div>

            <p className="mb-4 text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">
              Pick a preset or enter a custom amount. You&apos;ll be taken to
              Stripe to complete payment.
            </p>

            <div className="mb-4 grid grid-cols-2 gap-2">
              {PRESET_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  disabled={loading}
                  onClick={() => contribute(amt)}
                  className="rounded-xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-low)] px-4 py-3 text-sm font-medium text-[color:var(--on-surface)] transition hover:border-[color:var(--sage)]/40 hover:bg-[color:var(--sage-soft)]/15 hover:text-[color:var(--on-surface)] disabled:opacity-50 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-100 dark:hover:border-emerald-500/30 dark:hover:text-emerald-400"
                >
                  ${amt}
                </button>
              ))}
            </div>

            <div className="mb-4">
              <label className="label-caps mb-1.5 block text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                Custom amount
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                    $
                  </span>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={customAmount}
                    onChange={(e) => {
                      setCustomAmount(e.target.value);
                      setError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCustomSubmit();
                    }}
                    placeholder="0.00"
                    disabled={loading}
                    className="w-full rounded-xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] py-2.5 pl-7 pr-3 text-sm text-[color:var(--on-surface)] outline-none transition focus:border-[color:var(--sage)] focus:ring-2 focus:ring-[color:var(--sage)]/25 disabled:opacity-50 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-100 dark:focus:border-emerald-500/50 dark:focus:ring-emerald-500/10"
                  />
                </div>
                <button
                  disabled={loading || !customAmount}
                  onClick={handleCustomSubmit}
                  className="rounded-xl bg-[#1c1c17] px-4 py-2.5 text-sm font-medium tracking-wide text-[color:var(--surface)] shadow-[var(--shadow-ambient-sm)] transition hover:bg-[#2a2a26] disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                >
                  {loading ? "…" : "Pay"}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-xl bg-[#a8443c]/8 px-3 py-2 text-sm text-[#a8443c] dark:bg-red-500/10 dark:text-red-400">
                {error}
              </p>
            )}

            <p className="mt-4 text-center text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-600">
              Secured by Stripe. Funds go toward the group trip.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
