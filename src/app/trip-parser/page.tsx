import { unstable_noStore as noStore } from "next/cache";
import { TripFormParser } from "@/frontend/components/trip-form-parser";
import { TripParserJoinCta } from "@/frontend/components/trip-parser-join-cta";
import {
  TripParserActiveTripCard,
  type ActiveTripCardData,
} from "@/frontend/components/trip-parser-active-trip-card";
import { AppTopNav } from "@/frontend/components/app-top-nav";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { guaranteedPlanTitle, normalizePlan, type TripPlan } from "@/shared/trip-plan";
import {
  inferDefaultYearFromDateOptions,
  parseConcreteDateOptionToRange,
} from "@/shared/date-option-parse";
import { parseTripPlanStatus } from "@/shared/trip-status";

export const dynamic = "force-dynamic";

function initialFromName(name: string | undefined | null): string {
  if (!name || typeof name !== "string") return "";
  const trimmed = name.trim();
  if (!trimmed) return "";
  const first = trimmed.split(/\s+/)[0] ?? "";
  return first.charAt(0).toUpperCase();
}

function memberInitialsFromPlan(plan: TripPlan): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const name of plan.people.names) {
    const init = initialFromName(name);
    if (!init || seen.has(init)) continue;
    seen.add(init);
    out.push(init);
    if (out.length >= 3) break;
  }
  return out;
}

function defaultYearForPlan(plan: TripPlan): number {
  return inferDefaultYearFromDateOptions(plan.dates.options, new Date().getFullYear());
}

function statusChipForTrip(plan: TripPlan): string {
  const defaultYear = defaultYearForPlan(plan);
  const opts = plan.dates.options.filter((o) => o && o.trim());
  for (const o of opts) {
    const r = parseConcreteDateOptionToRange(o, defaultYear);
    if (!r) continue;
    const startMs = r.start.getTime();
    const endMs = r.end.getTime();
    const now = Date.now();
    if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
      if (now < startMs) {
        const daysLeft = Math.max(1, Math.ceil((startMs - now) / 86_400_000));
        return `${daysLeft} ${daysLeft === 1 ? "Day" : "Days"} Left`;
      }
      if (now >= startMs && now <= endMs) return "Active";
      return "Past";
    }
  }
  return "Draft";
}

function datesLabelForTrip(plan: TripPlan): string {
  const defaultYear = defaultYearForPlan(plan);
  const concrete = plan.dates.options.find((o) => o && parseConcreteDateOptionToRange(o, defaultYear));
  if (concrete) {
    const r = parseConcreteDateOptionToRange(concrete, defaultYear);
    if (r) {
      const sameYear = r.start.getFullYear() === r.end.getFullYear();
      const startFmt = r.start.toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: sameYear ? undefined : "numeric",
      });
      const endFmt = r.end.toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      return `${startFmt} — ${endFmt}`;
    }
  }
  const first = plan.dates.options.find((o) => o && o.trim());
  return first ?? "Dates TBD";
}


async function fetchMostRecentActiveTrip(): Promise<ActiveTripCardData | null> {
  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("trip_plans")
    .select("id, plan, status")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(6);

  if (error || !Array.isArray(data) || data.length === 0) return null;

  const candidate = data.find((row) => parseTripPlanStatus(row.status) !== "finalized") ?? data[0];
  if (!candidate?.plan) return null;
  const plan = normalizePlan(candidate.plan);
  const title = guaranteedPlanTitle(plan.title, plan.location);
  return {
    tripId: candidate.id as string,
    title,
    datesLabel: datesLabelForTrip(plan),
    statusChip: statusChipForTrip(plan),
    memberInitials: memberInitialsFromPlan(plan),
  };
}

export default async function TripParserPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  noStore();
  const { q } = await searchParams;
  const initialPrompt = typeof q === "string" ? q : "";
  let activeTrip: ActiveTripCardData | null = null;
  try {
    activeTrip = await fetchMostRecentActiveTrip();
  } catch (e) {
    console.error("[trip-parser] active trip lookup failed:", (e as Error)?.message);
  }

  return (
    <div className="min-h-screen bg-[color:var(--surface)] text-[color:var(--on-surface)] dark:bg-[#141414] dark:text-[#ebe9e4]">
      <AppTopNav />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
        <TripFormParser initialPrompt={initialPrompt} />
        <section
          aria-label="Quick actions"
          className="mt-12 grid gap-5 sm:grid-cols-2"
        >
          <TripParserJoinCta />
          {activeTrip ? <TripParserActiveTripCard data={activeTrip} /> : null}
        </section>
      </main>
    </div>
  );
}
