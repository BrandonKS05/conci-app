import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { normalizePlan, type HostActivityPin } from "@/shared/trip-plan";
import { isUuid } from "@/shared/is-uuid";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

type SaveSelectionBody = {
  outbound: {
    airline: string;
    departureTime: string;
    arrivalTime: string;
    duration: string;
    price: string;
    bookUrl: string;
  };
  ret: {
    airline: string;
    departureTime: string;
    arrivalTime: string;
    duration: string;
    price: string;
    bookUrl: string;
  };
  startIso: string;
  endIso: string;
};

function clean(v: unknown, max = 180): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) return NextResponse.json({ error: "Invalid trip id." }, { status: 400 });

  const auth = await createAuthServerClient();
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: SaveSelectionBody;
  try {
    body = (await req.json()) as SaveSelectionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!ISO_DAY.test(clean(body.startIso, 16)) || !ISO_DAY.test(clean(body.endIso, 16))) {
    return NextResponse.json({ error: "Invalid trip date range." }, { status: 400 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await svc.from("trip_plans").select("plan, status").eq("id", id).maybeSingle();
  if (error || !data?.plan) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (data.status === "finalized") {
    return NextResponse.json({ error: "Trip is finalized." }, { status: 409 });
  }

  const plan = normalizePlan(data.plan);
  const existing = plan.hostSetup?.activityPins ?? [];

  const outboundUrl = clean(body.outbound.bookUrl, 900);
  const returnUrl = clean(body.ret.bookUrl, 900);

  const outboundPin: HostActivityPin = {
    dateIso: body.startIso,
    experience: {
      name: `Flight out · ${clean(body.outbound.airline, 80)}`,
      pricePerPerson: clean(body.outbound.price, 40) || "—",
      rating: "",
      duration: `${clean(body.outbound.departureTime, 40)} -> ${clean(body.outbound.arrivalTime, 40)}`,
      bookingUrl: outboundUrl.startsWith("http") ? outboundUrl : "https://www.google.com/travel/flights",
      coverPhotoUrl: null,
    },
    kept: true,
  };
  const returnPin: HostActivityPin = {
    dateIso: body.endIso,
    experience: {
      name: `Flight back · ${clean(body.ret.airline, 80)}`,
      pricePerPerson: clean(body.ret.price, 40) || "—",
      rating: "",
      duration: `${clean(body.ret.departureTime, 40)} -> ${clean(body.ret.arrivalTime, 40)}`,
      bookingUrl: returnUrl.startsWith("http") ? returnUrl : "https://www.google.com/travel/flights",
      coverPhotoUrl: null,
    },
    kept: true,
  };

  const withoutDupe = existing.filter(
    (p) =>
      !(
        (p.dateIso === outboundPin.dateIso && p.experience.bookingUrl === outboundPin.experience.bookingUrl) ||
        (p.dateIso === returnPin.dateIso && p.experience.bookingUrl === returnPin.experience.bookingUrl)
      )
  );
  const nextPlan = normalizePlan({
    ...plan,
    hostSetup: {
      ...(plan.hostSetup ?? {}),
      activityPins: [...withoutDupe, outboundPin, returnPin],
    },
  });

  const { error: upErr } = await svc
    .from("trip_plans")
    .update({ plan: nextPlan as unknown as Record<string, unknown>, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true as const, plan: nextPlan });
}

