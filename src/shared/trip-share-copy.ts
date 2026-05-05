/** Host “Share trip” clipboard message (verbal / group chat) plus a real https URL to join. */
export function buildTripShareInviteMessage(opts: {
  creatorName: string;
  tripTitle: string;
  inviteCodeDisplay: string;
  /** e.g. conci.com */
  siteHost: string;
  /** Full join URL with code, e.g. https://app.conci.com/join?from=create&code=AAA-BBB */
  joinPageUrl: string;
}): string {
  const line1 = `${opts.creatorName} invited you to plan ${opts.tripTitle} 🗓️ Enter code ${opts.inviteCodeDisplay} at ${opts.siteHost} to join`;
  return `${line1}\n${opts.joinPageUrl}`;
}

export function publicSiteHostFromEnv(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) {
    try {
      return new URL(explicit.startsWith("http") ? explicit : `https://${explicit}`).hostname;
    } catch {
      /* fall through */
    }
  }
  const host = process.env.NEXT_PUBLIC_SITE_HOST?.trim();
  if (host) return host.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return "conci.com";
}

/** Origin for share/join links, e.g. `https://conci.com` or from `NEXT_PUBLIC_APP_URL`. */
export function publicSiteOriginFromEnv(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) {
    try {
      return new URL(explicit.startsWith("http") ? explicit : `https://${explicit}`).origin;
    } catch {
      /* fall through */
    }
  }
  return `https://${publicSiteHostFromEnv()}`;
}

export function buildJoinPageUrlWithCode(origin: string, inviteCodeDisplay: string): string {
  const base = origin.replace(/\/$/, "");
  const code = encodeURIComponent(inviteCodeDisplay);
  return `${base}/join?from=create&code=${code}`;
}

/** Prefer request Host / Forwarded headers so share links match the tab origin (e.g. localhost:3000). */
export function siteOriginFromRequestHeaders(h: Headers): string | null {
  const hostFull = (h.get("x-forwarded-host") ?? h.get("host"))?.split(",")[0]?.trim();
  if (!hostFull) return null;
  const rawProto = h.get("x-forwarded-proto");
  const proto =
    rawProto?.split(",")[0]?.trim() ||
    (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(hostFull) ? "http" : "https");
  return `${proto}://${hostFull}`;
}
