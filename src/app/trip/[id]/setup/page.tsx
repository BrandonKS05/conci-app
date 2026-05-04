import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { TripHostSetupDashboard } from "@/frontend/components/trip-host-setup-dashboard";
import { normalizePlan } from "@/shared/trip-plan";
import { parseTripPlanStatus } from "@/shared/trip-status";
import { isUuid } from "@/shared/is-uuid";

export default async function TripHostSetupPage({
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
    redirect(`/auth?next=${encodeURIComponent(`/trip/${id}/setup`)}`);
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-16 text-center text-sm text-slate-600 dark:bg-dm-page dark:text-neutral-400">
        <p className="mb-4">
          Trip setup needs{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-dm-card dark:text-neutral-200">SUPABASE_SERVICE_ROLE_KEY</code>{" "}
          on the server.
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

  const { data, error } = await svc.from("trip_plans").select("plan, status, seed_text").eq("id", id).maybeSingle();
  if (error || !data?.plan) {
    notFound();
  }

  const status = parseTripPlanStatus(data.status);
  if (status !== "draft") {
    redirect(`/trip/${id}`);
  }

  const plan = normalizePlan(data.plan);
  const seedText = typeof data.seed_text === "string" ? data.seed_text : null;

  return (
    <div className="min-h-screen bg-slate-50 py-6 text-slate-900 dark:bg-dm-page dark:text-neutral-100 sm:py-8">
      <TripHostSetupDashboard tripId={id} initialPlan={plan} seedText={seedText} />
    </div>
  );
}
