import { notFound, redirect } from "next/navigation";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { LiteApiCheckout } from "@/frontend/components/liteapi-checkout";
import { isUuid } from "@/shared/is-uuid";

function asSingle(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function LiteApiCheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!id || !isUuid(id)) notFound();

  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth?next=${encodeURIComponent(`/trip/${id}/lodging/checkout`)}`);

  const svc = getSupabaseServiceRoleClient();
  if (!svc) notFound();
  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) notFound();
  if (!access.isHost) redirect(`/trip/${id}/setup#sec-lodging`);

  const q = await searchParams;
  const returnPrebookId = asSingle(q.status) === "return" ? asSingle(q.prebookId).trim() || null : null;

  return (
    <LiteApiCheckout
      tripId={id}
      rateId={asSingle(q.rateId).trim()}
      offerId={asSingle(q.offerId).trim()}
      hotelId={asSingle(q.hotelId).trim()}
      hotelName={asSingle(q.hotelName).trim() || "Your stay"}
      checkIn={asSingle(q.checkIn).trim()}
      checkOut={asSingle(q.checkOut).trim()}
      city={asSingle(q.city).trim()}
      guests={Math.max(1, Number(asSingle(q.guests)) || 2)}
      returnPrebookId={returnPrebookId}
    />
  );
}
