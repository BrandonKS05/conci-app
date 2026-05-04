import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { SavedTripsList, type SavedTripListItem } from "@/frontend/components/saved-trips-list";
import { SiteShell } from "@/frontend/components/site-shell";
import { primaryFormButtonClass } from "@/frontend/ui/primary-action";
import { normalizePlan, type TripPlan } from "@/shared/trip-plan";

export const dynamic = "force-dynamic";

function datesLabelFromPlan(plan: TripPlan): string {
  if (plan.dates.options.length > 0) {
    return plan.dates.options.join(" · ");
  }
  return "Dates TBD";
}

function mapRow(row: { id: string; plan: unknown; created_at: string | null }): SavedTripListItem {
  const plan = normalizePlan(row.plan);
  return {
    id: row.id,
    createdAt: row.created_at ?? new Date().toISOString(),
    title: plan.title,
    location: plan.location,
    datesLabel: datesLabelFromPlan(plan),
    vibes: plan.vibe,
  };
}

export default async function MyTripsPage() {
  noStore();

  const supabase = await createAuthServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/auth?next=/my-trips");
  }

  const { data: hostedRows, error: hostedErr } = await supabase
    .from("trip_plans")
    .select("id, plan, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (hostedErr) {
    console.error("[my-trips] query failed:", hostedErr.message);
    return (
      <SiteShell title="My Trips" eyebrow="Host">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          Could not load trips. Try again later.
        </div>
      </SiteShell>
    );
  }

  const trips: SavedTripListItem[] = (hostedRows ?? []).map(mapRow);

  return (
    <SiteShell title="My Trips" eyebrow="Host">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <p className="text-sm text-slate-600 dark:text-neutral-400">
          Trips you created — you&apos;re the host: edit the plan, share invites, run hotel search, finalize, and delete.
        </p>
        <p className="text-sm text-slate-600 dark:text-neutral-400">
          After a trip is finalized, open the{" "}
          <Link href="/booking" className="font-medium text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400">
            booking checklists
          </Link>{" "}
          hub to track reservations.
        </p>
        {trips.length > 0 ? (
          <SavedTripsList initialTrips={trips} showDelete />
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
            <p className="font-display text-lg font-semibold text-slate-900 dark:text-white">No trips yet</p>
            <p className="mt-2 text-sm text-slate-600 dark:text-neutral-400">Create a plan to host your first trip.</p>
            <Link href="/trip-parser" className={`mt-6 ${primaryFormButtonClass}`}>
              Create a plan
            </Link>
          </div>
        )}
      </div>
    </SiteShell>
  );
}
