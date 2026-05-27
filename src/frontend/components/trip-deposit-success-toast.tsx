"use client";

import { useEffect, useState } from "react";

/**
 * Shows a success banner when the user returns from Stripe with `?deposit=success`.
 * Clears the query param after showing so it doesn't persist on refresh.
 */
export function TripDepositSuccessToast() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("deposit") !== "success") return;

    setVisible(true);

    // Remove the query param without a full navigation
    const next = new URL(window.location.href);
    next.searchParams.delete("deposit");
    window.history.replaceState({}, "", next.toString());

    // Auto-dismiss after 6 seconds
    const t = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl border border-emerald-300/60 bg-emerald-50 px-5 py-3.5 shadow-lg dark:border-emerald-700/40 dark:bg-emerald-950/80"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/60">
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-emerald-700 dark:text-emerald-300"
          >
            <path d="M2 7l3.5 3.5L12 3" />
          </svg>
        </span>
        <div>
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
            Deposit received!
          </p>
          <p className="text-xs text-emerald-700 dark:text-emerald-300">
            Your contribution has been added to the trip fund.
          </p>
        </div>
        <button
          onClick={() => setVisible(false)}
          aria-label="Dismiss"
          className="ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-emerald-600 transition hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900/50"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 3l6 6M9 3l-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
