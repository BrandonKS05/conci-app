import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { TripHostSetupDayPage } from "@/frontend/components/trip-host-setup-day-page";
import { normalizePlan } from "@/shared/trip-plan";
import { isUuid } from "@/shared/is-uuid";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export default async function TripHostSetupDayDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { id } = await params;
  const { date: dateParam } = await searchParams;

  if (!id || !isUuid(id)) notFound();

  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/auth?next=${encodeURIComponent(`/trip/${id}/setup/day${dateParam ? `?date=${encodeURIComponent(dateParam)}` : ""}`)}`);
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-16 text-center text-sm text-slate-600 dark:bg-dm-page dark:text-neutral-400">
        <p className="mb-4">
          Trip setup needs{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-dm-card dark:text-neutral-200">SUPABASE_SERVICE_ROLE_KEY</code> on the
          server.
        </p>
        <Link href="/trip-parser" className="font-medium text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400">
          Back to trip parser
        </Link>
      </div>
    );
  }

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access?.isHost) {
    notFound();
  }

  const { data, error } = await svc.from("trip_plans").select("plan").eq("id", id).maybeSingle();
  if (error || !data?.plan) {
    notFound();
  }

  const plan = normalizePlan(data.plan);

  const rawDate = typeof dateParam === "string" ? dateParam.trim() : "";
  if (!ISO_DAY.test(rawDate)) {
    return (
      <div className="min-h-screen bg-slate-50 py-10 text-slate-900 dark:bg-dm-page dark:text-neutral-100">
        <div className="mx-auto max-w-lg rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center dark:border-amber-900/40 dark:bg-amber-950/30">
          <h1 className="font-display text-xl font-semibold text-amber-950 dark:text-amber-100">Missing or invalid date</h1>
          <p className="mt-3 text-sm leading-relaxed text-amber-900/90 dark:text-amber-200/90">
            Open a day from the trip calendar (tap any day in the grid), or use{" "}
            <code className="rounded bg-white/80 px-1.5 py-0.5 text-xs dark:bg-black/30">?date=YYYY-MM-DD</code> in the URL.
          </p>
          <Link
            href={`/trip/${id}/setup#sec-dates`}
            className="mt-6 inline-flex font-semibold text-teal-700 underline-offset-4 hover:underline dark:text-teal-400"
          >
            ← Back to trip calendar
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f6f8] py-6 text-neutral-950 dark:bg-dm-page dark:text-neutral-100 sm:py-8">
      <TripHostSetupDayPage tripId={id} dateIso={rawDate} initialPlan={plan} />
    </div>
  );
}
