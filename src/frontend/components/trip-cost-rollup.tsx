"use client";

import { useCallback, useEffect, useState } from "react";
import type { TripPlan } from "@/shared/trip-plan";
import type { LiveFlightCard } from "@/shared/trip-live-recommendations";

type Deposit = {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  contributor_name: string | null;
  created_at: string;
  user_id: string;
};

function firstUsdAmountFromText(s: string | null | undefined): number | null {
  if (!s?.trim()) return null;
  const m = s.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const n = Number.parseFloat(m[1]!.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function tierMidTripBudgetPerPersonUsd(tier: string | null | undefined): number | null {
  const t = (tier ?? "").toLowerCase();
  if (!t) return null;
  if (/\b(splurge|luxury|premium)\b/.test(t)) return 2200;
  if (/\b(mid|moderate|standard)\b/.test(t)) return 900;
  if (/\b(budget|cheap|affordable|economy)\b/.test(t)) return 450;
  return null;
}

function formatCurrencyUsd(amountUsd: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amountUsd));
}

/**
 * Flat cost rollup strip — sits above the calendar.
 *
 * Pulls all fields from existing data (TripPlan budget text, live flight cards, deposits API)
 * so it never blocks behind missing inputs. Cells that have no input show "—" placeholders.
 */
export function TripCostRollup({
  tripId,
  plan,
  flights,
}: {
  tripId: string;
  plan: TripPlan;
  flights: LiveFlightCard[];
}) {
  const [fundUsd, setFundUsd] = useState<number | null>(null);
  const [fundDepositCount, setFundDepositCount] = useState<number>(0);

  const fetchFund = useCallback(async () => {
    try {
      const r = await fetch(`/api/trip-plans/${tripId}/deposits`, {
        credentials: "include",
      });
      if (!r.ok) return;
      const data = (await r.json()) as { deposits: Deposit[]; total_cents: number };
      setFundUsd(data.total_cents / 100);
      setFundDepositCount(Array.isArray(data.deposits) ? data.deposits.length : 0);
    } catch {
      // Swallow — placeholder rendering covers fetch failures.
    }
  }, [tripId]);

  useEffect(() => {
    void fetchFund();
  }, [fetchFund]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("deposit") === "success") {
      const t = setTimeout(fetchFund, 1500);
      return () => clearTimeout(t);
    }
  }, [fetchFund]);

  const fromPlan =
    plan.people.count ?? (plan.people.names?.length ? plan.people.names.length : 0);
  const headcount = Math.max(1, fromPlan > 0 ? fromPlan : 2);

  const perPersonFromBudget =
    firstUsdAmountFromText(plan.budget.perPerson) ??
    tierMidTripBudgetPerPersonUsd(plan.budget.tier);

  const flightAmounts = flights
    .map((f) => firstUsdAmountFromText(f.pricePerPerson))
    .filter((n): n is number => n != null);
  const lowFlightPp = flightAmounts.length ? Math.min(...flightAmounts) : null;

  const perPersonTotalUsd =
    perPersonFromBudget != null
      ? perPersonFromBudget + (lowFlightPp ?? 0)
      : lowFlightPp;

  const estimatedTotalUsd =
    perPersonTotalUsd != null ? Math.round(perPersonTotalUsd * headcount) : null;

  const owedUsd =
    estimatedTotalUsd != null
      ? Math.max(0, estimatedTotalUsd - (fundUsd ?? 0))
      : null;

  return (
    <div className="mb-5 grid grid-cols-2 gap-x-5 gap-y-4 border-b border-[color:var(--hairline)] pb-5 sm:grid-cols-4 sm:gap-x-8 dark:border-white/10">
      <Stat
        label="Estimated total"
        value={estimatedTotalUsd != null ? formatCurrencyUsd(estimatedTotalUsd) : "—"}
        helper={
          estimatedTotalUsd != null
            ? `for ${headcount} ${headcount === 1 ? "traveler" : "travelers"}`
            : "Add budget on the trip to estimate"
        }
      />
      <Stat
        label="Per person"
        value={
          perPersonTotalUsd != null ? formatCurrencyUsd(perPersonTotalUsd) : "—"
        }
        helper={
          lowFlightPp != null
            ? `incl. ~${formatCurrencyUsd(lowFlightPp)} flight`
            : perPersonFromBudget != null
              ? "budget only — flights pending"
              : "Set per-person budget"
        }
      />
      <Stat
        label="Trip fund"
        value={fundUsd != null ? formatCurrencyUsd(fundUsd) : "—"}
        helper={
          fundUsd == null
            ? "Loading…"
            : fundDepositCount === 0
              ? "No contributions yet"
              : `${fundDepositCount} ${fundDepositCount === 1 ? "deposit" : "deposits"}`
        }
      />
      <Stat
        label="Still owed"
        value={
          owedUsd != null
            ? owedUsd === 0
              ? "Funded"
              : formatCurrencyUsd(owedUsd)
            : "—"
        }
        helper={
          owedUsd == null
            ? "Needs budget + fund to compute"
            : owedUsd === 0
              ? "Group fund covers the estimate"
              : "Estimate minus current fund"
        }
        emphasize={owedUsd != null && owedUsd > 0}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  helper,
  emphasize = false,
}: {
  label: string;
  value: string;
  helper: string;
  emphasize?: boolean;
}) {
  return (
    <div className="min-w-0 flex flex-col gap-1">
      <span className="label-caps text-[color:var(--on-surface-muted)] dark:text-neutral-500">
        {label}
      </span>
      <span
        className={[
          "font-display font-semibold leading-none tracking-[-0.02em] text-[1.6rem] sm:text-[1.8rem]",
          emphasize
            ? "text-[color:var(--on-surface)] dark:text-white"
            : "text-[color:var(--on-surface)] dark:text-white",
        ].join(" ")}
      >
        {value}
      </span>
      <span className="truncate text-[11px] text-[color:var(--on-surface-muted)] dark:text-neutral-500">
        {helper}
      </span>
    </div>
  );
}
