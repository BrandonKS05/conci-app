import type { SupabaseClient } from "@supabase/supabase-js";

const NUDGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function nudgeEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.NUDGE_EMAIL_FROM?.trim());
}

function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function resolveAuthUserEmail(svc: SupabaseClient, userId: string): Promise<string | null> {
  const { data: u, error } = await svc.auth.admin.getUserById(userId);
  if (error || !u?.user?.email) return null;
  const e = u.user.email.trim().toLowerCase();
  return e.length > 3 ? e : null;
}

async function wasRecentlyNudged(
  svc: SupabaseClient,
  tripPlanId: string,
  targetUserId: string
): Promise<boolean> {
  const since = new Date(Date.now() - NUDGE_COOLDOWN_MS).toISOString();
  const { data } = await svc
    .from("trip_plan_nudge_events")
    .select("id")
    .eq("trip_plan_id", tripPlanId)
    .eq("target_user_id", targetUserId)
    .eq("channel", "email")
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();
  return Boolean(data?.id);
}

async function recordNudgeEvent(
  svc: SupabaseClient,
  tripPlanId: string,
  targetUserId: string
): Promise<void> {
  const { error } = await svc.from("trip_plan_nudge_events").insert({
    trip_plan_id: tripPlanId,
    target_user_id: targetUserId,
    channel: "email",
  });
  if (error) console.warn("[nudge] log insert failed:", error.message);
}

async function sendResendEmail(to: string, subject: string, html: string): Promise<{ ok: true } | { ok: false; detail: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.NUDGE_EMAIL_FROM?.trim();
  if (!key || !from) return { ok: false, detail: "Email not configured" };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    return { ok: false, detail: t || r.statusText };
  }
  return { ok: true };
}

export type NudgeSendResult =
  | { ok: true; channel: "email" }
  | { ok: false; error: string; code: "rate_limited" | "no_contact" | "not_configured" | "send_failed" };

/**
 * Sends one reminder email to a roster traveler (auth user) who has not voted yet.
 * Caller must verify the trip host and that the recipient is on this trip.
 */
export async function sendTripReminderNudge(
  svc: SupabaseClient,
  args: {
    tripPlanId: string;
    tripTitle: string;
    location: string | null;
    displayName?: string | null;
    targetUserId: string;
  }
): Promise<NudgeSendResult> {
  const { tripPlanId, tripTitle, location, targetUserId } = args;
  const parts = (args.displayName ?? "").trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  const greeting = first ? `Hi ${escapeHtml(first)},` : "Hi,";

  const email = await resolveAuthUserEmail(svc, targetUserId);
  if (!email) {
    return { ok: false, error: "No email on file for this traveler’s account.", code: "no_contact" };
  }
  if (!nudgeEmailConfigured()) {
    return {
      ok: false,
      error: "Outbound email is not configured (set RESEND_API_KEY and NUDGE_EMAIL_FROM).",
      code: "not_configured",
    };
  }

  if (await wasRecentlyNudged(svc, tripPlanId, targetUserId)) {
    return {
      ok: false,
      error: "A reminder was already sent to this traveler in the last 24 hours.",
      code: "rate_limited",
    };
  }

  const link = `${appBaseUrl()}/trip/${tripPlanId}`;
  const title = tripTitle.trim() || "your trip";
  const loc = location?.trim();
  const subject = `Reminder: weigh in on “${title}”`;
  const html = `
    <p>${greeting}</p>
    <p>The group is still waiting on your votes for <strong>${escapeHtml(title)}</strong>${loc ? ` in ${escapeHtml(loc)}` : ""}.</p>
    <p><a href="${escapeHtml(link)}">Open the trip</a> to lock in dates, stays, and plans with everyone.</p>
    <p style="color:#64748b;font-size:12px;margin-top:24px">You received this because the trip organizer sent a reminder from Conci.</p>
  `.trim();

  const sent = await sendResendEmail(email, subject, html);
  if (!sent.ok) {
    console.warn("[nudge] Resend error:", sent.detail);
    return { ok: false, error: "Could not send email.", code: "send_failed" };
  }
  await recordNudgeEvent(svc, tripPlanId, targetUserId);
  return { ok: true, channel: "email" };
}
