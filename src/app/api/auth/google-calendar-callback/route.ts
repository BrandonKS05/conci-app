import { NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import type { CalendarBusyRange } from "@/app/api/trip-plans/[id]/collab/calendar-import/route";

/** Renders an HTML page that posts a message to the opener and closes itself. */
function popupResponse(ok: boolean, count: number, errorMsg?: string): NextResponse {
  const script = ok
    ? `window.opener?.postMessage({ type: 'gcal-success', count: ${count} }, '*'); window.close();`
    : `window.opener?.postMessage({ type: 'gcal-error', error: ${JSON.stringify(errorMsg ?? "Unknown error")} }, '*'); window.close();`;
  return new NextResponse(
    `<!doctype html><html><head><title>Connecting…</title></head><body>
<p style="font-family:sans-serif;padding:2rem;">${ok ? `✓ Calendar connected (${count} busy period${count !== 1 ? "s" : ""} imported).` : `Error: ${errorMsg}`}</p>
<script>${script}</script></body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}

/** GET /api/auth/google-calendar-callback
 *  Receives the Google OAuth callback, exchanges the code for a token,
 *  fetches free/busy data, and saves it to the caller's trip_memberships row.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  if (errorParam) {
    return popupResponse(false, 0, `Google declined: ${errorParam}`);
  }
  if (!code || !stateRaw) {
    return popupResponse(false, 0, "Missing code or state.");
  }

  // Decode state
  let tripId: string;
  let userId: string;
  try {
    const decoded = JSON.parse(Buffer.from(stateRaw, "base64url").toString()) as {
      tripId: string;
      userId: string;
    };
    tripId = decoded.tripId;
    userId = decoded.userId;
  } catch {
    return popupResponse(false, 0, "Invalid state parameter.");
  }

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  if (!clientId || !clientSecret || !appUrl) {
    return popupResponse(false, 0, "Google Calendar is not fully configured on this server.");
  }

  // Exchange code for access token
  let accessToken: string;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${appUrl}/api/auth/google-calendar-callback`,
        grant_type: "authorization_code",
      }).toString(),
    });
    const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tokenRes.ok || !tokenData.access_token) {
      return popupResponse(false, 0, `Token exchange failed: ${tokenData.error ?? "unknown"}`);
    }
    accessToken = tokenData.access_token;
  } catch (e) {
    return popupResponse(false, 0, `Token exchange error: ${e instanceof Error ? e.message : "unknown"}`);
  }

  // Fetch free/busy for the next 6 months
  const now = new Date();
  const sixMonths = new Date(now);
  sixMonths.setMonth(sixMonths.getMonth() + 6);

  let busyRanges: CalendarBusyRange[] = [];
  try {
    const fbRes = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin: now.toISOString(),
        timeMax: sixMonths.toISOString(),
        items: [{ id: "primary" }],
      }),
    });
    const fbData = (await fbRes.json()) as {
      calendars?: { primary?: { busy?: { start: string; end: string }[] } };
    };
    const busy = fbData?.calendars?.primary?.busy ?? [];
    busyRanges = busy.map((b) => ({
      start: b.start.slice(0, 10),
      end: b.end.slice(0, 10),
      source: "google" as const,
    }));
  } catch (e) {
    return popupResponse(false, 0, `Calendar fetch error: ${e instanceof Error ? e.message : "unknown"}`);
  }

  // Save to trip_memberships
  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return popupResponse(false, 0, "Server misconfigured.");
  }
  const { error: updateErr } = await svc
    .from("trip_memberships")
    .update({ calendar_busy_dates: busyRanges })
    .eq("trip_plan_id", tripId)
    .eq("user_id", userId);

  if (updateErr) {
    console.error("[google-calendar-callback] update:", updateErr.message);
    return popupResponse(false, 0, "Could not save busy dates.");
  }

  return popupResponse(true, busyRanges.length);
}
