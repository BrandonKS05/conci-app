import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { isUuid } from "@/shared/is-uuid";

/** GET /api/trip-plans/[id]/collab/google-calendar-auth
 *  Initiates Google Calendar OAuth in a popup window.
 *  Redirects directly to Google's consent screen.
 *  Requires: NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID, NEXT_PUBLIC_APP_URL
 */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid trip id" }, { status: 400 });
  }

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  if (!clientId || !appUrl) {
    return NextResponse.json(
      { error: "Google Calendar is not configured on this server." },
      { status: 503 }
    );
  }

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

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Encode state for CSRF protection — verified in the callback
  const state = Buffer.from(JSON.stringify({ tripId: id, userId: user.id })).toString("base64url");

  const redirectUri = `${appUrl}/api/auth/google-calendar-callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
