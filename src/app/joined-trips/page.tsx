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

export default async function JoinedTripsPage() {
  noStore();

  const supabase = await createAuthServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/auth?next=/joined-trips");
  }

  const { data: memberShips, error: memErr } = await supabase
    .from("trip_memberships")
    .select("trip_plan_id")
    .eq("user_id", user.id)
    .eq("role", "member");

  if (memErr) {
    console.error("[joined-trips] memberships query failed:", memErr.message);
    return (
      <SiteShell title="Joined Trips" eyebrow="Member">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          Could not load joined trips. Try again later.
        </div>
      </SiteShell>
    );
  }

  const memberIds = [...new Set((memberShips ?? []).map((m) => m.trip_plan_id as string).filter(Boolean))];

  let joinedRows: { id: string; plan: unknown; created_at: string | null }[] = [];
  if (memberIds.length > 0) {
    const { data: jr, error: jErr } = await supabase
      .from("trip_plans")
      .select("id, plan, created_at")
      .in("id", memberIds)
      .neq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (jErr) {
      console.error("[joined-trips] trip_plans query failed:", jErr.message);
    } else {
      joinedRows = jr ?? [];
    }
  }

  const trips: SavedTripListItem[] = joinedRows.map(mapRow);

  return (
    <SiteShell title="Joined Trips" eyebrow="Member">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <p className="text-sm text-slate-600 dark:text-neutral-400">
          Trips you joined with an invite code — you&apos;re a <strong>member</strong>: vote on decisions and view the plan.
          Only the host can edit details, swap options, delete the trip, or share the invite code.
        </p>
        <p className="text-sm text-slate-600 dark:text-neutral-400">
          Finalized trips also appear under{" "}
          <Link href="/booking" className="font-medium text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400">
            booking checklists
          </Link>
          .
        </p>
        {trips.length > 0 ? (
          <SavedTripsList initialTrips={trips} showDelete={false} />
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
            <p className="font-display text-lg font-semibold text-slate-900 dark:text-white">No joined trips yet</p>
            <p className="mt-2 text-sm text-slate-600 dark:text-neutral-400">Use a code from your host to join.</p>
            <Link href="/join" className={`mt-6 ${primaryFormButtonClass}`}>
              Join a trip
            </Link>
          </div>
        )}
      </div>
    </SiteShell>
  );
}
