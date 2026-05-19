import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // Supabase falls back to "Site URL" when redirect_to is not allowlisted — often the root with ?code=.
  // Send the OAuth exchange to our real callback route on whatever host the user actually hit.
  if (path === "/" && request.nextUrl.searchParams.has("code")) {
    const dest = request.nextUrl.clone();
    dest.pathname = "/auth/callback";
    return NextResponse.redirect(dest);
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
