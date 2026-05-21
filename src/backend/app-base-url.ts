import "server-only";

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function stripLeadingProtocol(hostish: string): string {
  return hostish.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const u = new URL(origin.includes("://") ? origin : `https://${origin}`);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
  } catch {
    return false;
  }
}

/** Server-side canonical app URL (emails, outbound links when no request context). */
export function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return stripTrailingSlash(explicit);
  // VERCEL_PROJECT_PRODUCTION_URL = the project's primary production domain (respects custom
  // domains). VERCEL_URL = deployment-specific URL (e.g. project-git-main-xxx.vercel.app) which
  // is NOT the custom domain — never use it as a public-facing redirect target.
  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProd) return stripTrailingSlash(`https://${stripLeadingProtocol(vercelProd)}`);
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return stripTrailingSlash(`https://${stripLeadingProtocol(vercel)}`);
  return "http://localhost:3000";
}

/**
 * Origin the user actually hit (for OAuth redirects). On Vercel, `request.url` can
 * look like `http://127.0.0.1:3000/...` internally — prefer `x-forwarded-*` / `host`,
 * then production hints, and avoid sending users to localhost when deployed.
 */
export function publicOriginFromRequest(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const hostHeader = request.headers.get("host");
  const host = (forwardedHost ?? hostHeader)?.split(",")[0]?.trim();
  const protoHeader = request.headers.get("x-forwarded-proto");
  const protoRaw = protoHeader?.split(",")[0]?.trim().toLowerCase();
  const proto = protoRaw === "http" || protoRaw === "https" ? protoRaw : "https";

  if (host) {
    return stripTrailingSlash(`${proto}://${host}`);
  }

  let fromRequest = "";
  try {
    fromRequest = new URL(request.url).origin;
  } catch {
    /* ignore */
  }

  if (fromRequest && !isLoopbackOrigin(fromRequest)) {
    return stripTrailingSlash(fromRequest);
  }

  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit && !isLoopbackOrigin(explicit)) {
    return stripTrailingSlash(explicit);
  }

  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProd) {
    return stripTrailingSlash(`https://${stripLeadingProtocol(vercelProd)}`);
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    return stripTrailingSlash(`https://${stripLeadingProtocol(vercel)}`);
  }

  if (fromRequest) return stripTrailingSlash(fromRequest);
  return "http://localhost:3000";
}
