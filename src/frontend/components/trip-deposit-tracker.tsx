"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Deposit = {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  contributor_name: string | null;
  created_at: string;
  user_id: string;
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function DepositBreakdownModal({
  deposits,
  totalCents,
  onClose,
}: {
  deposits: Deposit[];
  totalCents: number;
  onClose: () => void;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="mx-4 w-full max-w-md rounded-3xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] p-6 shadow-[var(--shadow-ambient-lg)] dark:border-white/10 dark:bg-dm-card">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="label-caps text-[color:var(--sage)] dark:text-neutral-500">
              Trip fund
            </p>
            <p className="font-display text-2xl font-semibold tracking-tight text-[color:var(--on-surface)] dark:text-white">
              {formatCurrency(totalCents)}
            </p>
          </div>
          <button
            onClick={onClose}
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

        {deposits.length === 0 ? (
          <p className="py-6 text-center text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-500">
            No contributions yet. Be the first!
          </p>
        ) : (
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {deposits.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-4 py-3 dark:border-transparent dark:bg-dm-elevated"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[color:var(--on-surface)] dark:text-neutral-100">
                    {d.contributor_name || "Anonymous"}
                  </p>
                  <p className="text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                    {formatDate(d.created_at)}
                  </p>
                </div>
                <p className="ml-4 text-sm font-semibold text-[color:var(--sage)] dark:text-emerald-400">
                  {formatCurrency(d.amount_cents)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function TripDepositTracker({ tripId }: { tripId: string }) {
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [totalCents, setTotalCents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const fetchDeposits = useCallback(async () => {
    try {
      const r = await fetch(`/api/trip-plans/${tripId}/deposits`, {
        credentials: "include",
      });
      if (!r.ok) return;
      const data = (await r.json()) as {
        deposits: Deposit[];
        total_cents: number;
      };
      setDeposits(data.deposits);
      setTotalCents(data.total_cents);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    fetchDeposits();
  }, [fetchDeposits]);

  // Re-fetch after returning from Stripe checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("deposit") === "success") {
      const timer = setTimeout(fetchDeposits, 1500);
      return () => clearTimeout(timer);
    }
  }, [fetchDeposits]);

  if (loading) {
    return (
      <div className="inline-flex items-center gap-2 rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] px-4 py-2.5 text-sm text-[color:var(--on-surface-muted)] shadow-[var(--shadow-ambient-sm)] dark:border-white/10 dark:bg-dm-card dark:text-neutral-500">
        <span className="h-3 w-3 animate-pulse rounded-full bg-[color:var(--surface-container-high)] dark:bg-neutral-600" />
        Loading…
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowBreakdown(true)}
        className="group inline-flex items-center gap-2.5 rounded-2xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] px-4 py-2.5 text-sm shadow-[var(--shadow-ambient-sm)] transition hover:bg-[color:var(--surface-container-low)] hover:shadow-[var(--shadow-ambient)] dark:border-white/10 dark:bg-dm-card dark:hover:border-emerald-500/30"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[color:var(--sage-soft)]/25 text-[color:var(--sage)] dark:bg-emerald-500/10 dark:text-emerald-400">
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
            <rect x="2" y="3" width="12" height="10" rx="2" />
            <path d="M2 7h12" />
            <path d="M5.5 10h2" />
          </svg>
        </span>
        <span className="flex flex-col items-start leading-tight">
          <span className="label-caps text-[color:var(--sage)] dark:text-neutral-500">
            Trip fund
          </span>
          <span className="font-display font-semibold text-[color:var(--on-surface)] dark:text-white">
            {formatCurrency(totalCents)}
          </span>
        </span>
        <span className="ml-1 text-xs text-[color:var(--on-surface-muted)] transition group-hover:text-[color:var(--on-surface-variant)] dark:text-neutral-600 dark:group-hover:text-neutral-300">
          {deposits.length} {deposits.length === 1 ? "deposit" : "deposits"}
        </span>
      </button>

      {showBreakdown && (
        <DepositBreakdownModal
          deposits={deposits}
          totalCents={totalCents}
          onClose={() => setShowBreakdown(false)}
        />
      )}
    </>
  );
}
