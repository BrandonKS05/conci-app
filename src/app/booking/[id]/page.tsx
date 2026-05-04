import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { BookingChecklist } from "@/frontend/components/booking-checklist";
import { TripDepositTracker } from "@/frontend/components/trip-deposit-tracker";
import { TripContributeButton } from "@/frontend/components/trip-contribute-button";
import { SiteShell } from "@/frontend/components/site-shell";
import {
  buildClassifiedDecisions,
  parseCollabState,
  winningHotelPickFromCollab,
} from "@/shared/collaboration";
import { parseBookingTasks } from "@/shared/booking-tasks";
import { normalizePlan } from "@/shared/trip-plan";
import { parseTripPlanStatus } from "@/shared/trip-status";
import { isUuid } from "@/shared/is-uuid";

export default async function BookingTripPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id || !isUuid(id)) notFound();

  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/auth?next=${encodeURIComponent(`/booking/${id}`)}`);
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-16 text-center text-sm text-slate-600 dark:bg-dm-page dark:text-neutral-400">
        Add <code className="rounded bg-slate-100 px-1 dark:bg-dm-card">SUPABASE_SERVICE_ROLE_KEY</code> for this page.
      </div>
    );
  }

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    notFound();
  }

  const { data, error } = await svc
    .from("trip_plans")
    .select("plan, collab_state, booking_tasks, status, user_id")
    .eq("id", id)
    .maybeSingle();

  if (error || !data?.plan) {
    console.error("[booking/[id]] load failed", error?.message);
    notFound();
  }

  if (parseTripPlanStatus(data.status) !== "finalized") {
    redirect(`/trip/${id}`);
  }

  const plan = normalizePlan(data.plan);
  const collab = parseCollabState(data.collab_state);
  const classified = buildClassifiedDecisions(plan);
  const hotel = winningHotelPickFromCollab(classified, collab);
  const tasks = parseBookingTasks(data.booking_tasks);

  const canEdit = access.isHost;

  return (
    <div className="min-h-screen bg-slate-50 py-8 dark:bg-dm-page sm:py-12">
      <SiteShell title="Checklists" eyebrow="Booking checklist">
        <div className="mx-auto w-full max-w-xl space-y-8">
          <div className="flex items-center justify-between gap-3">
            <TripDepositTracker tripId={id} />
            <TripContributeButton tripId={id} />
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-500">Trip</p>
            <h2 className="mt-1 font-display text-2xl font-semibold text-slate-900 dark:text-neutral-100">
              {plan.title || "Untitled trip"}
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-neutral-400">{plan.location || "Location TBD"}</p>
            <dl className="mt-4 grid gap-2 text-sm text-slate-700 dark:text-neutral-300">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-neutral-500">Dates</dt>
                <dd className="text-right font-medium">
                  {plan.dates.options.length ? plan.dates.options.join(" · ") : "TBD"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-neutral-500">People</dt>
                <dd className="text-right font-medium">
                  {plan.people.count != null
                    ? `${plan.people.count}`
                    : plan.people.names.length
                      ? `${plan.people.names.length} named`
                      : "TBD"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-neutral-500">Budget</dt>
                <dd className="text-right font-medium">
                  {[plan.budget.tier, plan.budget.perPerson].filter(Boolean).join(" · ") || "TBD"}
                </dd>
              </div>
            </dl>
          </div>

          <BookingChecklist tripId={id} plan={plan} hotel={hotel} initialTasks={tasks} canEdit={canEdit} />

          <p className="text-center">
            <Link
              href={`/trip/${id}`}
              className="text-sm font-medium text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400"
            >
              Back to trip plan
            </Link>
          </p>
        </div>
      </SiteShell>
    </div>
  );
}
