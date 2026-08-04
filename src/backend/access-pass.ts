import "server-only";

import { cookies } from "next/headers";

/**
 * Grants a paywall bypass to visitors who arrive via the resume/demo link
 * (/welcome → "Try Conci free"). Set as an httpOnly cookie by /api/access-pass
 * and honored by the trip-creation gates.
 */
export const ACCESS_PASS_COOKIE = "conci_access_pass";

/** Pass value — overridable via env, with a fixed fallback so the link works out of the box. */
export function accessPassToken(): string {
  return process.env.CONCI_ACCESS_PASS?.trim() || "conci-free-access-pass";
}

/** True when the current request carries a valid free-access pass. */
export async function requestHasAccessPass(): Promise<boolean> {
  const store = await cookies();
  const value = store.get(ACCESS_PASS_COOKIE)?.value;
  return Boolean(value) && value === accessPassToken();
}
