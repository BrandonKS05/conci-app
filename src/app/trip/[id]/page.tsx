import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { parseTripPlanStatus } from "@/shared/trip-status";
import { isUuid } from "@/shared/is-uuid";

export default async function SavedTripPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id || !isUuid(id)) {
    notFound();
  }

  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/auth?next=${encodeURIComponent(`/trip/${id}`)}`);
  }

  const svc = getSupabaseServiceRoleClient();

  if (!svc) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-16 text-center text-sm text-[color:var(--on-surface-variant)] dark:bg-dm-page dark:text-neutral-400">
        <p className="mb-4">
          Trip pages need{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-dm-card dark:text-neutral-200">SUPABASE_SERVICE_ROLE_KEY</code> on the
          server. Add it to{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-dm-card dark:text-neutral-200">.env.local</code> from Supabase → Project
          Settings → API → service_role.
        </p>
        <Link
          href="/trip-parser"
          className="font-medium text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400"
        >
          Back to trip parser
        </Link>
      </div>
    );
  }

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    notFound();
  }

  const { data, error } = await svc
    .from("trip_plans")
    .select("plan, status")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[Conci Supabase] Saved trip page query failed:", {
      id,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    notFound();
  }

  if (!data?.plan) {
    notFound();
  }

  const tripStatus = parseTripPlanStatus(data.status);
  const isHost = access.isHost;

  if (tripStatus === "draft") {
    if (!isHost) notFound();
    redirect(`/trip/${id}/setup`);
  }

  /** Host and invited members use the same trip workspace (calendar, pins, shared collab). */
  redirect(`/trip/${id}/setup`);
}
