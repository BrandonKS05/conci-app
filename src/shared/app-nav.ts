/** Primary in-app destinations (Create, lists, pricing, profile). */
export const PRIMARY_APP_NAV = [
  { href: "/trip-parser", label: "Create a Trip" },
  { href: "/my-trips", label: "My Trips" },
  { href: "/joined-trips", label: "Joined Trips" },
  { href: "/pricing", label: "Pricing" },
  { href: "/profile/me", label: "Profile" },
] as const;

/** @deprecated Use PRIMARY_APP_NAV */
export const APP_NAV_ITEMS = PRIMARY_APP_NAV;

export type AppNavItem = (typeof PRIMARY_APP_NAV)[number];

export function isAppNavActive(pathname: string, href: string): boolean {
  if (href === "/profile/me") {
    return pathname === "/profile/me" || pathname.startsWith("/profile/");
  }
  if (pathname === href) return true;
  return href !== "/" && pathname.startsWith(`${href}/`);
}
