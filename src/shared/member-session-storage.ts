export const GUEST_MEMBER_SESSION_KEY = "conci_guest_member_session";

export type GuestMemberSession = {
  tripId: string;
  memberId: string;
  token: string;
};

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function isHex32(s: string): boolean {
  return /^[a-f0-9]{32}$/i.test(s);
}

export function readGuestMemberSession(): GuestMemberSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(GUEST_MEMBER_SESSION_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<GuestMemberSession>;
    if (!j || typeof j.tripId !== "string" || typeof j.memberId !== "string" || typeof j.token !== "string") return null;
    if (!isUuid(j.tripId) || !isUuid(j.memberId) || !isHex32(j.token)) return null;
    return { tripId: j.tripId, memberId: j.memberId, token: j.token.toLowerCase() };
  } catch {
    return null;
  }
}

export function writeGuestMemberSession(s: GuestMemberSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    GUEST_MEMBER_SESSION_KEY,
    JSON.stringify({ ...s, token: s.token.toLowerCase() })
  );
}

export function clearGuestMemberSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(GUEST_MEMBER_SESSION_KEY);
}
