import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { parseSubscriptionTier, type SubscriptionTier } from "@/shared/subscription";

export const runtime = "nodejs";

const MAX_DISPLAY = 120;

export async function GET() {
  const auth = await createAuthServerClient();
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const { data: profile } = await svc.from("profiles").select("*").eq("id", user.id).maybeSingle();

  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const metaName =
    (typeof meta?.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta?.name === "string" && meta.name.trim()) ||
    "";

  return NextResponse.json({
    id: user.id,
    email: user.email ?? "",
    displayName:
      (typeof profile?.display_name === "string" && profile.display_name.trim()) || metaName || "",
    avatarUrl:
      (typeof profile?.avatar_url === "string" && profile.avatar_url.trim()) ||
      (typeof meta?.avatar_url === "string" && meta.avatar_url) ||
      null,
    subscriptionTier: parseSubscriptionTier(profile?.subscription_tier as string | undefined),
    notifyVoteEmail: profile?.notify_vote_email ?? true,
    notifyDateLockedEmail: profile?.notify_date_locked_email ?? true,
    notifyNudgeReminders: profile?.notify_nudge_reminders ?? true,
    recentTripsPublic: profile?.recent_trips_public !== false,
  });
}

type PatchBody = {
  displayName?: string;
  avatarUrl?: string | null;
  notifyVoteEmail?: boolean;
  notifyDateLockedEmail?: boolean;
  notifyNudgeReminders?: boolean;
  recentTripsPublic?: boolean;
};

export async function PATCH(request: Request) {
  const auth = await createAuthServerClient();
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const { data: existing } = await svc
    .from("profiles")
    .select(
      "subscription_tier, stripe_customer_id, stripe_subscription_id, display_name, avatar_url, notify_vote_email, notify_date_locked_email, notify_nudge_reminders, recent_trips_public"
    )
    .eq("id", user.id)
    .maybeSingle();

  const mergedDisplayName =
    body.displayName !== undefined
      ? body.displayName.trim().slice(0, MAX_DISPLAY)
      : typeof existing?.display_name === "string"
        ? existing.display_name
        : "";

  const nextRow: Record<string, unknown> = {
    id: user.id,
    subscription_tier: parseSubscriptionTier(existing?.subscription_tier as string | undefined) as SubscriptionTier,
    stripe_customer_id: existing?.stripe_customer_id ?? null,
    stripe_subscription_id: existing?.stripe_subscription_id ?? null,
    updated_at: new Date().toISOString(),
    display_name: mergedDisplayName,
    avatar_url:
      body.avatarUrl !== undefined
        ? body.avatarUrl
        : (existing?.avatar_url as string | null | undefined) ?? null,
    notify_vote_email: boolOr(existing?.notify_vote_email, true, body.notifyVoteEmail),
    notify_date_locked_email: boolOr(existing?.notify_date_locked_email, true, body.notifyDateLockedEmail),
    notify_nudge_reminders: boolOr(existing?.notify_nudge_reminders, true, body.notifyNudgeReminders),
    recent_trips_public: boolOr(existing?.recent_trips_public, true, body.recentTripsPublic),
  };

  const { error: upErr } = await svc.from("profiles").upsert(nextRow, { onConflict: "id" });
  if (upErr) {
    console.error("[me/settings PATCH]", upErr.message);
    return NextResponse.json({ error: "Could not save settings" }, { status: 500 });
  }

  const metaPatch: Record<string, unknown> = {};
  if (body.displayName !== undefined || body.avatarUrl !== undefined) {
    if (body.displayName !== undefined) {
      metaPatch.full_name = mergedDisplayName || null;
    }
    if (body.avatarUrl !== undefined) {
      metaPatch.avatar_url = body.avatarUrl;
    }
    const { error: metaErr } = await auth.auth.updateUser({
      data: metaPatch,
    });
    if (metaErr) {
      console.error("[me/settings] updateUser metadata:", metaErr.message);
    }
  }

  return NextResponse.json({ ok: true });
}

function boolOr(
  existing: boolean | null | undefined,
  fallback: boolean,
  patch: boolean | undefined
): boolean {
  if (typeof patch === "boolean") return patch;
  if (typeof existing === "boolean") return existing;
  return fallback;
}
