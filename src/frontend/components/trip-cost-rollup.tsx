"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TripPlan } from "@/shared/trip-plan";
import type { LiveFlightCard } from "@/shared/trip-live-recommendations";
import { hasUserSelectedLodging } from "@/shared/trip-plan";

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

  // Prefer AI-generated itinerary estimate over raw budget text
  const aiEstimatePp = plan.generatedItinerary?.totalEstimatePp ?? null;

  const perPersonFromBudget =
    aiEstimatePp ??
    firstUsdAmountFromText(plan.budget.perPerson) ??
    tierMidTripBudgetPerPersonUsd(plan.budget.tier);

  const flightAmounts = flights
    .map((f) => firstUsdAmountFromText(f.pricePerPerson))
    .filter((n): n is number => n != null);
  const lowFlightPp = flightAmounts.length ? Math.min(...flightAmounts) : null;

  // If AI estimate already includes transport, don't double-count flights
  const flightAddon = aiEstimatePp != null ? 0 : (lowFlightPp ?? 0);

  const perPersonTotalUsd =
    perPersonFromBudget != null
      ? perPersonFromBudget + flightAddon
      : lowFlightPp;

  const estimatedTotalUsd =
    perPersonTotalUsd != null ? Math.round(perPersonTotalUsd * headcount) : null;

  const owedUsd =
    estimatedTotalUsd != null
      ? Math.max(0, estimatedTotalUsd - (fundUsd ?? 0))
      : null;

  // Breakdown from itinerary for the expandable detail
  const breakdown = useMemo(() => {
    const days = plan.generatedItinerary?.days;
    if (!days?.length) return null;
    let lodgingPp = 0;
    let transportPp = 0;
    let foodPp = 0;
    let activitiesPp = 0;
    for (const day of days) {
      for (const act of day.activities) {
        const cost = act.estimatedCostPp ?? 0;
        switch (act.category) {
          case "lodging": lodgingPp += cost; break;
          case "transport": transportPp += cost; break;
          case "food": foodPp += cost; break;
          default: activitiesPp += cost; break;
        }
      }
    }
    return { lodgingPp, transportPp, foodPp, activitiesPp };
  }, [plan.generatedItinerary]);

  const lodgingConfirmed = hasUserSelectedLodging(plan.hostSetup?.hotelStays);
  const [showBreakdown, setShowBreakdown] = useState(false);

  return (
    <div className="mb-5 border-b border-[color:var(--hairline)] pb-5 dark:border-white/10">
      <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4 sm:gap-x-8">
        <Stat
          label="Estimated total"
          value={estimatedTotalUsd != null ? formatCurrencyUsd(estimatedTotalUsd) : "\u2014"}
          helper={
            estimatedTotalUsd != null
              ? `for ${headcount} ${headcount === 1 ? "traveler" : "travelers"}`
              : "Add budget on the trip to estimate"
          }
          onClick={breakdown ? () => setShowBreakdown(!showBreakdown) : undefined}
        />
        <Stat
          label="Per person"
          value={
            perPersonTotalUsd != null ? formatCurrencyUsd(perPersonTotalUsd) : "\u2014"
          }
          helper={
            lowFlightPp != null
              ? `incl. ~${formatCurrencyUsd(lowFlightPp)} flight`
              : perPersonFromBudget != null
                ? "budget only \u2014 flights pending"
                : "Set per-person budget"
          }
        />
        <Stat
          label="Trip fund"
          value={fundUsd != null ? formatCurrencyUsd(fundUsd) : "\u2014"}
          helper={
            fundUsd == null
              ? "Loading\u2026"
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
              : "\u2014"
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

      {showBreakdown && breakdown ? (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-white/10 dark:bg-white/5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Per-person breakdown</p>
          <ul className="space-y-1 text-[12px] text-neutral-700 dark:text-neutral-300">
            {breakdown.foodPp > 0 ? (
              <li className="flex justify-between">
                <span className="text-amber-800 dark:text-amber-200">Restaurants & food</span>
                <span className="tabular-nums font-semibold">{formatCurrencyUsd(breakdown.foodPp)}</span>
              </li>
            ) : null}
            {breakdown.activitiesPp > 0 ? (
              <li className="flex justify-between">
                <span className="text-pink-700 dark:text-pink-300">Experiences & activities</span>
                <span className="tabular-nums font-semibold">{formatCurrencyUsd(breakdown.activitiesPp)}</span>
              </li>
            ) : null}
            {breakdown.lodgingPp > 0 ? (
              <li className="flex justify-between">
                <span className="text-teal-700 dark:text-teal-300">
                  Lodging {lodgingConfirmed ? "" : <span className="italic text-neutral-400">(estimated)</span>}
                </span>
                <span className="tabular-nums font-semibold">{formatCurrencyUsd(breakdown.lodgingPp)}</span>
              </li>
            ) : null}
            {breakdown.transportPp > 0 ? (
              <li className="flex justify-between">
                <span className="text-blue-700 dark:text-blue-300">
                  Flights & transport <span className="italic text-neutral-400">(estimated)</span>
                </span>
                <span className="tabular-nums font-semibold">{formatCurrencyUsd(breakdown.transportPp)}</span>
              </li>
            ) : null}
            <li className="flex justify-between border-t border-neutral-200 pt-1 dark:border-white/10">
              <span className="font-bold">Total per person</span>
              <span className="tabular-nums font-bold">{formatCurrencyUsd(perPersonTotalUsd ?? 0)}</span>
            </li>
          </ul>
          {!lodgingConfirmed && breakdown.lodgingPp > 0 ? (
            <p className="mt-2 text-[10px] text-neutral-500">Lodging and flight estimates update once you confirm bookings.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  helper,
  emphasize = false,
  onClick,
}: {
  label: string;
  value: string;
  helper: string;
  emphasize?: boolean;
  onClick?: () => void;
}) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      className={`min-w-0 flex flex-col gap-1 text-left ${onClick ? "cursor-pointer hover:opacity-80" : ""}`}
      onClick={onClick}
    >
      <span className="label-caps text-[color:var(--on-surface-muted)] dark:text-neutral-500">
        {label} {onClick ? "▾" : ""}
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
    </Wrapper>
  );
}
