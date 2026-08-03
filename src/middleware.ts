import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Hard ceiling for the Supabase auth check. If the Auth server is slow, paused,
// or unreachable, we must never let the middleware hang: a hung middleware makes
// Vercel kill the request with 504 MIDDLEWARE_INVOCATION_TIMEOUT, which takes the
// whole app down. On timeout we soft-fail to "no user" so pages keep serving.
const AUTH_CHECK_TIMEOUT_MS = 3000;

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // Supabase falls back to "Site URL" when redirect_to is not allowlisted — often the root with ?code=.
  // Send the OAuth exchange to our real callback route on whatever host the user actually hit.
  if (path === "/" && request.nextUrl.searchParams.has("code")) {
    const dest = request.nextUrl.clone();
    dest.pathname = "/auth/callback";
    return NextResponse.redirect(dest);
  }

  const isProtected =
    path === "/settings" ||
    path.startsWith("/trip-parser") ||
    path === "/saved" ||
    path.startsWith("/saved/") ||
    path === "/my-trips" ||
    path === "/joined-trips" ||
    path === "/booking" ||
    path.startsWith("/booking/") ||
    path.startsWith("/trip/") ||
    path === "/join";

  // Only auth-gated pages need the user. Everything else (landing, marketing,
  // downloads, API routes that do their own auth) must not depend on Supabase
  // being reachable — skipping the network round-trip keeps them up even when
  // Auth is down, and avoids paying for a call whose result we never read.
  if (!isProtected && path !== "/auth") {
    return NextResponse.next({ request });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Race the auth check against a timeout. A network error or a slow/unreachable
  // Auth server resolves to `null` (treated as signed-out) instead of hanging.
  const user = await Promise.race([
    supabase.auth
      .getUser()
      .then((result) => result.data.user)
      .catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), AUTH_CHECK_TIMEOUT_MS)),
  ]);

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth";
    // Build a clean `next` value: keep only params needed to resume the
    // product flow after auth. OAuth tokens and other noisy params are dropped.
    const SAFE_NEXT_PARAMS =
      path === "/join"
        ? new Set(["from", "code"])
        : path.startsWith("/trip-parser")
          ? new Set(["q"])
          : new Set(["from", "tab"]);
    const safeQuery = new URLSearchParams();
    for (const [k, v] of request.nextUrl.searchParams.entries()) {
      if (SAFE_NEXT_PARAMS.has(k)) safeQuery.append(k, v);
    }
    const safeSearch = safeQuery.toString();
    url.search = "";
    url.searchParams.set("next", `${path}${safeSearch ? `?${safeSearch}` : ""}`);
    return NextResponse.redirect(url);
  }

  if (user && path === "/auth") {
    const rawNext = request.nextUrl.searchParams.get("next") || "/trip-parser";
    const safeNext =
      rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/trip-parser";
    const [nextPathname, nextSearch = ""] = safeNext.split("?", 2);
    const url = request.nextUrl.clone();
    url.pathname = nextPathname;
    url.search = nextSearch ? `?${nextSearch}` : "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|pptx)$).*)",
  ],
};
