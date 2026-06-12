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

/** Duffel amounts are plain decimal strings ("823.40"), not display text. */
function providerAmount(s: string | null | undefined): number | null {
  if (!s?.trim()) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type TripFlightCost = {
  /**
   * "booked"   — provider-confirmed Duffel order total(s).
   * "selected" — saved offer the host has NOT booked yet (price can change).
   * "estimate" — lowest SerpAPI inspiration fare; never a real quote.
   */
  source: "booked" | "selected" | "estimate";
  perPersonUsd: number;
  /** Exact group total for booked/selected (provider amount); null for estimates. */
  groupTotalUsd: number | null;
  currency: string;
  /** True when a contributing booking/selection is mock or Duffel test mode. */
  isMock: boolean;
};

/**
 * Single source of truth for the flight figure in cost displays: a real booked
 * order total beats a saved selection, which beats SerpAPI inspiration fares.
 * Inspiration estimates are used only when no provider price exists.
 */
export function resolveTripFlightCost(
  plan: TripPlan,
  flights: LiveFlightCard[],
  headcount: number
): TripFlightCost | null {
  const bookings = (plan.hostSetup?.flightBookings ?? []).filter(
    (b) => b.status !== "cancelled" && providerAmount(b.totalAmount) != null
  );
  if (bookings.length) {
    const groupTotalUsd = bookings.reduce((sum, b) => sum + providerAmount(b.totalAmount)!, 0);
    // Old flat records predate passengerCount — fall back to trip headcount.
    const paxKnown = bookings.every(
      (b) => typeof b.passengerCount === "number" && b.passengerCount > 0
    );
    const pax = paxKnown
      ? bookings.reduce((sum, b) => sum + b.passengerCount!, 0)
      : Math.max(1, headcount);
    return {
      source: "booked",
      perPersonUsd: groupTotalUsd / Math.max(1, pax),
      groupTotalUsd,
      currency: bookings[0]!.currency || "USD",
      isMock: bookings.some((b) => b.isMock === true),
    };
  }

  const selection = (plan.hostSetup?.flightSelections ?? []).find(
    (s) => providerAmount(s.totalAmount) != null
  );
  if (selection) {
    const groupTotalUsd = providerAmount(selection.totalAmount)!;
    return {
      source: "selected",
      perPersonUsd: groupTotalUsd / Math.max(1, selection.passengerCount),
      groupTotalUsd,
      currency: selection.currency || "USD",
      isMock: selection.isMock === true,
    };
  }

  const inspiration = flights
    .map((f) => firstUsdAmountFromText(f.pricePerPerson))
    .filter((n): n is number => n != null);
  if (inspiration.length) {
    return {
      source: "estimate",
      perPersonUsd: Math.min(...inspiration),
      groupTotalUsd: null,
      currency: "USD",
      isMock: false,
    };
  }

  return null;
}

/**
 * Very rough ballpark for UI — not a quote. Uses budget text, tier, headcount,
 * and the resolved flight cost (booked > selected > inspiration estimate).
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

  const flightCost = resolveTripFlightCost(plan, flights, headcount);

  const lines: string[] = [];
  if (budgetBandTotal != null) {
    lines.push(
      `Group budget (from planner): ~$${budgetBandTotal.toLocaleString()} total (~$${Math.round(perPersonFromBudget!)} × ${headcount} people)`
    );
  } else {
    lines.push("Add a per-person budget on the trip card to estimate group spend.");
  }

  if (flightCost?.source === "booked") {
    lines.push(
      `Booked flights: $${Math.round(flightCost.groupTotalUsd!).toLocaleString()} total (provider-confirmed${flightCost.isMock ? ", test mode" : ""})`
    );
  } else if (flightCost?.source === "selected") {
    lines.push(
      `Selected flight (not booked yet): $${Math.round(flightCost.groupTotalUsd!).toLocaleString()} total${flightCost.isMock ? " (test mode)" : ""}`
    );
  } else if (flightCost?.source === "estimate") {
    lines.push(
      `Lowest shown flight: ~$${Math.round(flightCost.perPersonUsd).toLocaleString()} per person (one way / as listed)`
    );
  } else if (plan.departureCity?.trim() && plan.location?.trim()) {
    lines.push("Flight prices appear when live recommendations load.");
  }

  let headline: string;
  if (budgetBandTotal != null && flightCost != null) {
    const groupFlightsUsd =
      flightCost.groupTotalUsd ?? Math.round(flightCost.perPersonUsd * headcount);
    const withFlights = budgetBandTotal + Math.round(groupFlightsUsd);
    const flightWord =
      flightCost.source === "booked"
        ? "booked flights"
        : flightCost.source === "selected"
          ? "selected flight"
          : "lowest flight × group";
    headline = `Rough total (budget band + ${flightWord}): ~$${withFlights.toLocaleString()}`;
  } else if (budgetBandTotal != null) {
    headline = `Rough trip budget (group): ~$${budgetBandTotal.toLocaleString()}`;
  } else if (flightCost != null) {
    const pp = Math.round(flightCost.perPersonUsd).toLocaleString();
    headline =
      flightCost.source === "booked"
        ? `Flights booked at ~$${pp} pp — add budget for a fuller estimate`
        : flightCost.source === "selected"
          ? `Selected flight ~$${pp} pp (not booked) — add budget for a fuller estimate`
          : `Flights from ~$${pp} pp — add budget for a fuller estimate`;
  } else {
    headline = "Add budget and wait for flight picks to see a rough total";
  }

  lines.push("Estimates are indicative only — actual spend varies.");

  return { headline, lines };
}
