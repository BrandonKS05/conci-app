import {
  enumerateLocalIsoDays,
  type HostActivityExperience,
  type HostHotelStay,
  type TripPlan,
} from "@/shared/trip-plan";

const DEFAULT_MEAL_PER_PERSON_USD = 52;
const HOTEL_SHARE_OF_DAY = 0.42;
const FALLBACK_DAY_PER_PERSON_USD = 220;

function firstMoneyAmountUsd(s: string): number | null {
  const m = s.match(/\$?\s*([\d,]+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const n = Number.parseFloat(m[1]!.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function tripHeadcount(plan: TripPlan): number {
  const c = plan.people.count;
  if (typeof c === "number" && c >= 1) return Math.min(99, Math.floor(c));
  const n = plan.people.names?.length ?? 0;
  return Math.max(2, n || 2);
}

/**
 * Group-level “budget for this calendar day” from the host’s per-person / tier text.
 * - If copy reads as **per day** → amount × party.
 * - Otherwise treat the first $ number as **per person for the whole trip** → (amount × party) / tripDays.
 */
export function dayBudgetBaselineGroupUsd(plan: TripPlan, tripDayCount: number): number | null {
  if (tripDayCount < 1) return null;
  const per = plan.budget.perPerson?.trim();
  const tier = plan.budget.tier?.trim();
  const raw = per || tier || "";
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const amount = firstMoneyAmountUsd(raw);
  if (amount == null) return null;
  const hc = tripHeadcount(plan);
  const readsAsDaily =
    /\b(per\s*day|\/\s*day|a\s*day|daily)\b/i.test(lower) || /\bday\b.*\$\d/i.test(lower);
  if (readsAsDaily) return amount * hc;
  return (amount * hc) / tripDayCount;
}

/** Lower-bound USD per person from strings like "$85", "$120–180", "From $45". */
export function parseExperiencePricePerPersonUsd(pricePerPerson: string): number | null {
  if (!pricePerPerson?.trim()) return null;
  const t = pricePerPerson.replace(/·/g, " ").replace(/–/g, "-");
  const nums: number[] = [];
  for (const m of t.matchAll(/\$?\s*([\d,]+(?:\.\d{1,2})?)/g)) {
    const n = Number.parseFloat(m[1]!.replace(/,/g, ""));
    if (Number.isFinite(n) && n >= 0) nums.push(n);
  }
  if (!nums.length) return null;
  return Math.min(...nums);
}

function staySpanNights(stay: HostHotelStay): number {
  const days = enumerateLocalIsoDays(stay.startIso, stay.endIso);
  return Math.max(1, days.length);
}

export type HostDaySpendBreakdown = {
  baselineGroupUsd: number | null;
  hotelUsd: number;
  mealsUsd: number;
  activitiesUsd: number;
  estimatedTotalUsd: number;
};

/**
 * Educated guess for pinned items vs trip budget spread across days.
 */
export function estimateHostDaySpendUsd(
  plan: TripPlan,
  dateIso: string,
  tripStartIso: string,
  tripEndIso: string,
  mealsCount: number,
  activities: { experience: HostActivityExperience }[],
  hotelStay: HostHotelStay | null
): HostDaySpendBreakdown {
  const tripDays = enumerateLocalIsoDays(tripStartIso, tripEndIso);
  const tripDayCount = Math.max(1, tripDays.length);
  const baseline = dayBudgetBaselineGroupUsd(plan, tripDayCount);
  const hc = tripHeadcount(plan);

  const fallbackBaseline = FALLBACK_DAY_PER_PERSON_USD * hc;
  const effectiveBaseline = baseline ?? fallbackBaseline;

  let hotelUsd = 0;
  if (hotelStay) {
    const nights = staySpanNights(hotelStay);
    const nightlyFromTrip = (effectiveBaseline * HOTEL_SHARE_OF_DAY) / Math.min(nights, tripDayCount);
    hotelUsd = Math.round(nightlyFromTrip * 100) / 100;
  }

  const mealsUsd = Math.round(mealsCount * DEFAULT_MEAL_PER_PERSON_USD * hc * 100) / 100;

  let activitiesUsd = 0;
  for (const row of activities) {
    const pp = parseExperiencePricePerPersonUsd(row.experience.pricePerPerson);
    if (pp != null) activitiesUsd += pp * hc;
    else activitiesUsd += Math.max(35, effectiveBaseline * 0.12);
  }
  activitiesUsd = Math.round(activitiesUsd * 100) / 100;

  const estimatedTotalUsd = Math.round((hotelUsd + mealsUsd + activitiesUsd) * 100) / 100;

  return {
    baselineGroupUsd: baseline,
    hotelUsd,
    mealsUsd,
    activitiesUsd,
    estimatedTotalUsd,
  };
}
