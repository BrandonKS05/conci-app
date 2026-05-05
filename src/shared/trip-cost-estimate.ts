import type { LiveFlightCard } from "@/shared/trip-live-recommendations";
import type { TripPlan } from "@/shared/trip-plan";

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

/**
 * Very rough ballpark for UI — not a quote. Uses budget text, tier, headcount, and lowest shown flight.
 */
export function estimateTripCostSummary(plan: TripPlan, flights: LiveFlightCard[]): {
  headline: string;
  lines: string[];
} {
  const fromPlan =
    plan.people.count ?? (plan.people.names?.length ? plan.people.names.length : 0);
  const headcount = Math.max(1, fromPlan > 0 ? fromPlan : 2);

  const perPersonFromBudget =
    firstUsdAmountFromText(plan.budget.perPerson) ?? tierMidTripBudgetPerPersonUsd(plan.budget.tier);

  const budgetBandTotal =
    perPersonFromBudget != null ? Math.round(perPersonFromBudget * headcount) : null;

  const flightAmounts = flights
    .map((f) => firstUsdAmountFromText(f.pricePerPerson))
    .filter((n): n is number => n != null && !Number.isNaN(n));
  const lowFlightPp = flightAmounts.length ? Math.min(...flightAmounts) : null;

  const lines: string[] = [];
  if (budgetBandTotal != null) {
    lines.push(
      `Group budget (from planner): ~$${budgetBandTotal.toLocaleString()} total (~$${Math.round(perPersonFromBudget!)} × ${headcount} people)`
    );
  } else {
    lines.push("Add a per-person budget on the trip card to estimate group spend.");
  }
  if (lowFlightPp != null) {
    lines.push(`Lowest shown flight: ~$${Math.round(lowFlightPp).toLocaleString()} per person (one way / as listed)`);
  } else if (plan.departureCity?.trim() && plan.location?.trim()) {
    lines.push("Flight prices appear when live recommendations load.");
  }

  let headline: string;
  if (budgetBandTotal != null && lowFlightPp != null) {
    const withFlights = budgetBandTotal + Math.round(lowFlightPp * headcount);
    headline = `Rough total (budget band + lowest flight × group): ~$${withFlights.toLocaleString()}`;
  } else if (budgetBandTotal != null) {
    headline = `Rough trip budget (group): ~$${budgetBandTotal.toLocaleString()}`;
  } else if (lowFlightPp != null) {
    headline = `Flights from ~$${Math.round(lowFlightPp).toLocaleString()} pp — add budget for a fuller estimate`;
  } else {
    headline = "Add budget and wait for flight picks to see a rough total";
  }

  lines.push("Estimates are indicative only — actual spend varies.");

  return { headline, lines };
}
