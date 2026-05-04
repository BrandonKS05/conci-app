import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { SiteShell } from "@/frontend/components/site-shell";
import { normalizePlan } from "@/shared/trip-plan";

export const dynamic = "force-dynamic";

export default async function BookingIndexPage() {
  noStore();

  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth?next=/booking");
  }

  const { data: ownedRows, error: ownedErr } = await supabase
    .from("trip_plans")
    .select("id, plan, updated_at")
    .eq("user_id", user.id)
    .eq("status", "finalized")
    .order("updated_at", { ascending: false });

  if (ownedErr) {
    console.error("[booking page] hosted query failed:", ownedErr.message);
    return (
      <SiteShell title="Checklists" eyebrow="Checklists">
        <div className="mx-auto max-w-xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          Could not load finalized trips.
        </div>
      </SiteShell>
    );
  }

  const { data: memberShips } = await supabase
    .from("trip_memberships")
    .select("trip_plan_id")
    .eq("user_id", user.id)
    .eq("role", "member");

  const memberIds = [...new Set((memberShips ?? []).map((m) => m.trip_plan_id as string).filter(Boolean))];

  let joinedRows: { id: string; plan: unknown; updated_at: string | null }[] = [];
  if (memberIds.length > 0) {
    const { data: jr, error: jErr } = await supabase
      .from("trip_plans")
      .select("id, plan, updated_at")
      .in("id", memberIds)
      .eq("status", "finalized")
      .neq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (!jErr) joinedRows = jr ?? [];
  }

  const seen = new Set<string>();
  const trips: { id: string; title: string; location: string | null; updatedAt: string; section: "hosted" | "joined" }[] = [];

  for (const r of ownedRows ?? []) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const plan = normalizePlan(r.plan);
    trips.push({
      id: r.id,
      title: plan.title || "Untitled trip",
      location: plan.location,
      updatedAt: r.updated_at ?? "",
      section: "hosted",
    });
  }
  for (const r of joinedRows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const plan = normalizePlan(r.plan);
    trips.push({
      id: r.id,
      title: plan.title || "Untitled trip",
      location: plan.location,
      updatedAt: r.updated_at ?? "",
      section: "joined",
    });
  }

  trips.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

  return (
    <SiteShell title="Checklists" eyebrow="Finalized trips">
      <div className="mx-auto w-full max-w-xl space-y-8">
        {trips.length === 0 ? (
          <p className="text-sm leading-6 text-slate-600 dark:text-neutral-400">
            When you <strong>finalize</strong> a trip after all decisions are locked, it appears here. Open a plan from{" "}
            <Link href="/my-trips" className="font-medium text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400">
              My Trips
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-3">
            {trips.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/booking/${t.id}`}
                  className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 dark:border-white/10 dark:bg-dm-card dark:hover:border-indigo-500/40"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-500">
                    {t.section === "hosted" ? "My trip" : "Joined trip"}
                  </p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-neutral-100">{t.title}</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">{t.location || "Location TBD"}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SiteShell>
  );
}
