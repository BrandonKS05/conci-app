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

type Withdrawal = {
  id: string;
  amount_cents: number;
  note: string | null;
  created_at: string;
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
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function ConfirmWithdrawModal({
  totalCents,
  onConfirm,
  onClose,
}: {
  totalCents: number;
  onConfirm: (note: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
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
      <div className="mx-4 w-full max-w-sm rounded-3xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] p-6 shadow-[var(--shadow-ambient-lg)] dark:border-white/10 dark:bg-dm-card">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-xl font-semibold tracking-tight text-[color:var(--on-surface)] dark:text-white">
            Mark fund as withdrawn
          </h3>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[color:var(--on-surface-muted)] transition hover:bg-[color:var(--surface-container-low)] dark:text-neutral-500 dark:hover:bg-dm-elevated"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4.5 4.5l9 9M13.5 4.5l-9 9" />
            </svg>
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-4 py-3 dark:border-white/10 dark:bg-dm-elevated">
          <p className="text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">Total to record</p>
          <p className="mt-1 font-display text-2xl font-semibold text-[color:var(--on-surface)] dark:text-white">
            {formatCurrency(totalCents)}
          </p>
        </div>

        <p className="mb-4 text-sm leading-relaxed text-[color:var(--on-surface-variant)] dark:text-neutral-400">
          This records that you have withdrawn the group fund from your Stripe balance. Withdraw via the{" "}
          <a
            href="https://dashboard.stripe.com/payouts"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[color:var(--sage)] underline-offset-2 hover:underline dark:text-emerald-400"
          >
            Stripe dashboard
          </a>{" "}
          first, then mark it here to keep the trip fund accurate.
        </p>

        <div className="mb-4">
          <label className="label-caps mb-1.5 block text-[color:var(--on-surface-muted)] dark:text-neutral-500">
            Note (optional)
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Transferred to group account"
            disabled={loading}
            className="w-full rounded-xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] px-3 py-2.5 text-sm text-[color:var(--on-surface)] outline-none transition focus:border-[color:var(--sage)] focus:ring-2 focus:ring-[color:var(--sage)]/25 disabled:opacity-50 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-100"
          />
        </div>

        <button
          disabled={loading}
          onClick={() => {
            setLoading(true);
            onConfirm(note);
          }}
          className="w-full rounded-xl bg-[#1c1c17] px-4 py-2.5 text-sm font-medium tracking-wide text-[color:var(--surface)] shadow-[var(--shadow-ambient-sm)] transition hover:bg-[#2a2a26] disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-700"
        >
          {loading ? "Recording…" : "Confirm withdrawal"}
        </button>
      </div>
    </div>
  );
}

/**
 * Host-only panel shown in the Budget & Fund tab.
 * Displays per-person contributions, total collected, and lets the host
 * record a manual withdrawal (funds are released from the Stripe dashboard;
 * this just marks the event in the database).
 */
export function TripFundHostPanel({ tripId }: { tripId: string }) {
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [totalCents, setTotalCents] = useState(0);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [depRes, wRes] = await Promise.all([
        fetch(`/api/trip-plans/${tripId}/deposits`, { credentials: "include" }),
        fetch(`/api/trip-plans/${tripId}/deposits/withdraw`, { credentials: "include" }),
      ]);
      if (depRes.ok) {
        const d = (await depRes.json()) as { deposits: Deposit[]; total_cents: number };
        setDeposits(d.deposits ?? []);
        setTotalCents(d.total_cents ?? 0);
      }
      if (wRes.ok) {
        const w = (await wRes.json()) as { withdrawals: Withdrawal[] };
        setWithdrawals(w.withdrawals ?? []);
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("deposit") === "success") {
      const t = setTimeout(refresh, 1500);
      return () => clearTimeout(t);
    }
  }, [refresh]);

  const totalWithdrawnCents = withdrawals.reduce((sum, w) => sum + w.amount_cents, 0);
  const availableCents = Math.max(0, totalCents - totalWithdrawnCents);

  const handleWithdraw = useCallback(
    async (note: string) => {
      setError(null);
      setSuccessMsg(null);
      try {
        const r = await fetch(`/api/trip-plans/${tripId}/deposits/withdraw`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note }),
        });
        const data = (await r.json()) as { ok?: boolean; amount_cents?: number; error?: string };
        if (!r.ok || !data.ok) {
          setError(data.error || "Something went wrong");
          return;
        }
        setShowConfirm(false);
        setSuccessMsg(`Withdrawal of ${formatCurrency(data.amount_cents ?? 0)} recorded.`);
        void refresh();
      } catch {
        setError("Network error — please try again");
      }
    },
    [tripId, refresh]
  );

  // Group deposits by contributor
  const contributorRows = (() => {
    const totals = new Map<string, number>();
    for (const d of deposits) {
      const label = d.contributor_name?.trim() || "Traveler";
      totals.set(label, (totals.get(label) ?? 0) + d.amount_cents);
    }
    return [...totals.entries()]
      .map(([name, cents]) => ({ name, cents }))
      .sort((a, b) => b.cents - a.cents);
  })();

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-10 animate-pulse rounded-xl bg-[color:var(--surface-container-high)] dark:bg-neutral-800"
          />
        ))}
      </div>
    );
  }

  return (
    <>
      {successMsg ? (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
          {successMsg}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {/* Summary row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-4 py-3 dark:border-white/10 dark:bg-dm-elevated">
          <p className="text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">Total collected</p>
          <p className="mt-1 font-display text-xl font-semibold text-[color:var(--on-surface)] dark:text-white">
            {formatCurrency(totalCents)}
          </p>
          <p className="mt-0.5 text-[11px] text-[color:var(--on-surface-muted)] dark:text-neutral-500">
            {deposits.length} {deposits.length === 1 ? "payment" : "payments"}
          </p>
        </div>

        <div className="rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-4 py-3 dark:border-white/10 dark:bg-dm-elevated">
          <p className="text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">Withdrawn</p>
          <p className="mt-1 font-display text-xl font-semibold text-[color:var(--on-surface)] dark:text-white">
            {formatCurrency(totalWithdrawnCents)}
          </p>
          <p className="mt-0.5 text-[11px] text-[color:var(--on-surface-muted)] dark:text-neutral-500">
            {withdrawals.length === 0 ? "None yet" : `${withdrawals.length} event${withdrawals.length === 1 ? "" : "s"}`}
          </p>
        </div>

        <div className="rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-4 py-3 dark:border-white/10 dark:bg-dm-elevated sm:col-span-1">
          <p className="text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">Available</p>
          <p
            className={[
              "mt-1 font-display text-xl font-semibold",
              availableCents > 0
                ? "text-[color:var(--sage)] dark:text-emerald-400"
                : "text-[color:var(--on-surface)] dark:text-white",
            ].join(" ")}
          >
            {formatCurrency(availableCents)}
          </p>
          <p className="mt-0.5 text-[11px] text-[color:var(--on-surface-muted)] dark:text-neutral-500">
            Ready to withdraw
          </p>
        </div>
      </div>

      {/* Per-contributor breakdown */}
      {contributorRows.length > 0 ? (
        <div className="rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] dark:border-white/10 dark:bg-dm-card">
          <p className="border-b border-[color:var(--hairline)] px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:border-white/10 dark:text-neutral-500">
            Per-person contributions
          </p>
          <ul className="divide-y divide-[color:var(--hairline)] dark:divide-white/5">
            {contributorRows.map((row) => (
              <li
                key={row.name}
                className="flex items-center justify-between px-4 py-2.5 text-sm"
              >
                <span className="truncate text-[color:var(--on-surface)] dark:text-neutral-100">
                  {row.name}
                </span>
                <span className="ml-4 shrink-0 font-semibold tabular-nums text-[color:var(--sage)] dark:text-emerald-400">
                  {formatCurrency(row.cents)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] px-4 py-6 text-center text-sm text-[color:var(--on-surface-muted)] dark:border-white/10 dark:bg-dm-card dark:text-neutral-500">
          No contributions yet. Share your trip link so guests can deposit.
        </p>
      )}

      {/* Withdrawal history */}
      {withdrawals.length > 0 ? (
        <div className="rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] dark:border-white/10 dark:bg-dm-card">
          <p className="border-b border-[color:var(--hairline)] px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:border-white/10 dark:text-neutral-500">
            Withdrawal history
          </p>
          <ul className="divide-y divide-[color:var(--hairline)] dark:divide-white/5">
            {withdrawals.map((w) => (
              <li key={w.id} className="px-4 py-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[color:var(--on-surface)] dark:text-neutral-100">
                    {formatDate(w.created_at)}
                  </span>
                  <span className="font-semibold tabular-nums text-[color:var(--on-surface)] dark:text-neutral-100">
                    {formatCurrency(w.amount_cents)}
                  </span>
                </div>
                {w.note ? (
                  <p className="mt-0.5 text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                    {w.note}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Withdraw CTA */}
      {availableCents > 0 ? (
        <div className="rounded-xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-low)] px-4 py-4 dark:border-white/10 dark:bg-dm-elevated">
          <p className="text-sm font-medium text-[color:var(--on-surface)] dark:text-neutral-100">
            Ready to withdraw {formatCurrency(availableCents)}?
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[color:var(--on-surface-muted)] dark:text-neutral-500">
            Go to your{" "}
            <a
              href="https://dashboard.stripe.com/payouts"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[color:var(--sage)] underline-offset-2 hover:underline dark:text-emerald-400"
            >
              Stripe dashboard
            </a>{" "}
            to initiate the payout to your bank, then record it here so the fund balance stays accurate.
          </p>
          <button
            onClick={() => {
              setError(null);
              setSuccessMsg(null);
              setShowConfirm(true);
            }}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#1c1c17] px-5 py-2.5 text-sm font-medium tracking-wide text-[color:var(--surface)] shadow-[var(--shadow-ambient-sm)] transition hover:bg-[#2a2a26] active:scale-[0.98] dark:bg-emerald-600 dark:hover:bg-emerald-700"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 15 15"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7.5 1v9M4 6.5l3.5 3.5 3.5-3.5M2 11.5h11" />
            </svg>
            Mark as withdrawn
          </button>
        </div>
      ) : null}

      {showConfirm ? (
        <ConfirmWithdrawModal
          totalCents={availableCents}
          onConfirm={handleWithdraw}
          onClose={() => setShowConfirm(false)}
        />
      ) : null}
    </>
  );
}
