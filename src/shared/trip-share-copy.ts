/** Host “Share trip” clipboard message (verbal / group chat). */
export function buildTripShareInviteMessage(opts: {
  creatorName: string;
  tripTitle: string;
  inviteCodeDisplay: string;
  /** e.g. conci.com */
  siteHost: string;
}): string {
  return `${opts.creatorName} invited you to plan ${opts.tripTitle} 🗓️ Enter code ${opts.inviteCodeDisplay} at ${opts.siteHost} to join`;
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
