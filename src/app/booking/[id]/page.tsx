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
import { normalizePlan, type HostHotelStay, type TripPlan } from "@/shared/trip-plan";
import { parseTripPlanStatus } from "@/shared/trip-status";
import { isUuid } from "@/shared/is-uuid";
import type { HotelPick } from "@/shared/hotels";

function stayToBookingHotel(stay: HostHotelStay): HotelPick {
  return {
    id: `host-stay-${stay.startIso}-${stay.endIso}-${stay.place.name}`,
    name: stay.place.name,
    area: stay.destinationCity || stay.place.address || "",
    priceHint: stay.lodgingType ? stay.lodgingType[0]!.toUpperCase() + stay.lodgingType.slice(1) : "Host-selected stay",
    ...(stay.place.rating != null ? { rating: `${stay.place.rating}` } : {}),
    ...(stay.bookingUrl?.startsWith("http") ? { bookingUrl: stay.bookingUrl } : {}),
  };
}

function hostSelectedBookingStay(plan: TripPlan): HotelPick | null {
  const stays = plan.hostSetup?.hotelStays ?? [];
  const withBookingUrl = stays.find((stay) => stay.userSelected && stay.bookingUrl?.startsWith("http"));
  const anyWithBookingUrl = stays.find((stay) => stay.bookingUrl?.startsWith("http"));
  const hostSelected = stays.find((stay) => stay.userSelected);
  const chosen = withBookingUrl ?? anyWithBookingUrl ?? hostSelected ?? null;
  return chosen ? stayToBookingHotel(chosen) : null;
}

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
      <div className="min-h-screen bg-[color:var(--surface)] px-4 py-16 text-center text-sm text-[color:var(--on-surface-variant)] dark:bg-dm-page dark:text-neutral-400">
        Add <code className="rounded bg-[color:var(--surface-container)] px-1 dark:bg-dm-card">SUPABASE_SERVICE_ROLE_KEY</code> for this page.
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
  const hotel = hostSelectedBookingStay(plan) ?? winningHotelPickFromCollab(classified, collab);
  const tasks = parseBookingTasks(data.booking_tasks);

  const canEdit = access.isHost;

  return (
    <div className="min-h-screen bg-[color:var(--surface)] py-8 dark:bg-dm-page sm:py-12">
      <SiteShell title="Checklists" eyebrow="Booking checklist">
        <div className="mx-auto w-full max-w-xl space-y-8">
          <div className="flex items-center justify-between gap-3">
            <TripDepositTracker tripId={id} />
            <TripContributeButton tripId={id} />
          </div>

          <div className="rounded-3xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] p-6 shadow-[var(--shadow-ambient)] dark:border-white/10 dark:bg-dm-card dark:shadow-none">
            <p className="label-caps text-[color:var(--sage)] dark:text-neutral-500">Trip</p>
            <h2 className="mt-2 font-display text-2xl font-semibold tracking-[-0.02em] text-[color:var(--on-surface)] dark:text-neutral-100">
              {plan.title || "Untitled trip"}
            </h2>
            <p className="mt-2 text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">{plan.location || "Location TBD"}</p>
            <dl className="mt-4 grid gap-2 text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-300">
              <div className="flex justify-between gap-4 border-t border-[color:var(--hairline)] pt-3 dark:border-white/10">
                <dt className="text-[color:var(--on-surface-muted)] dark:text-neutral-500">Dates</dt>
                <dd className="text-right font-medium text-[color:var(--on-surface)] dark:text-neutral-100">
                  {plan.dates.options.length ? plan.dates.options.join(" · ") : "TBD"}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-[color:var(--hairline)] pt-3 dark:border-white/10">
                <dt className="text-[color:var(--on-surface-muted)] dark:text-neutral-500">People</dt>
                <dd className="text-right font-medium text-[color:var(--on-surface)] dark:text-neutral-100">
                  {plan.people.count != null
                    ? `${plan.people.count}`
                    : plan.people.names.length
                      ? `${plan.people.names.length} named`
                      : "TBD"}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-[color:var(--hairline)] pt-3 dark:border-white/10">
                <dt className="text-[color:var(--on-surface-muted)] dark:text-neutral-500">Budget</dt>
                <dd className="text-right font-medium text-[color:var(--on-surface)] dark:text-neutral-100">
                  {[plan.budget.tier, plan.budget.perPerson].filter(Boolean).join(" · ") || "TBD"}
                </dd>
              </div>
            </dl>
          </div>

          <BookingChecklist tripId={id} plan={plan} hotel={hotel} initialTasks={tasks} canEdit={canEdit} />

          <p className="text-center">
            <Link
              href={`/trip/${id}`}
              className="text-sm font-medium text-[color:var(--on-surface)] underline-offset-2 hover:text-[color:var(--sage)] hover:underline dark:text-indigo-400"
            >
              Back to trip plan
            </Link>
          </p>
        </div>
      </SiteShell>
    </div>
  );
}
